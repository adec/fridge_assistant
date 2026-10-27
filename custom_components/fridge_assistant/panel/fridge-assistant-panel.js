import { homePath } from "./lib/navigation.js?v=0.10.0b37";
import { handlingSummary, handlingDate, handlingStatus } from "./views/handling.js?v=0.10.0b37";
import { emptyFilters, filterInventory } from "./lib/inventory-filters.js?v=0.10.0b37";
import { openInventoryFilters, renderFilterChips } from "./views/inventory-filters.js?v=0.10.0b37";
import { inventoryList } from "./views/inventory-list.js?v=0.10.0b37";
import { openCategoriesManager } from "./views/categories.js?v=0.10.0b37";
import { openMealie } from "./views/mealie.js?v=0.10.0b37";
/* Fridge Assistant panel — vanilla custom element, no external deps.
 *
 * Entry module: the custom element (shell, state subscription, list and
 * filters) plus thin delegates into the view modules. Loaded natively as an
 * ES module via panel_custom's module_url — no build step involved; the
 * views/lib/strings/styles files are plain sibling modules.
 *
 * i18n: everything follows a simple rule — Dutch if Home Assistant's
 * (per-user) language is Dutch, English for anything else. See `_lang()`/
 * `t()` below. Only nl/en exist; there is no third language.
 */

import { CATEGORY_LABELS, KIND_LABELS, LOCATION_LABELS, STATUS_COLOR, STRINGS } from "./strings.js?v=0.10.0b37";
import { STYLES } from "./styles.js?v=0.10.0b37";
import { daysLabel, esc, fmtCardDate } from "./lib/format.js?v=0.10.0b37";
import { openModal, toast, wireDateField } from "./lib/surface.js?v=0.10.0b37";
import { aiEstimate, openAddModal } from "./views/add-item.js?v=0.10.0b37";
import { completeItem, openInspector } from "./views/inspector.js?v=0.10.0b37";
import { openLocationsManager } from "./views/locations.js?v=0.10.0b37";
import { aiNewTemplate, openTemplateEditor, openTemplatePicker, openTemplatesManager } from "./views/templates.js?v=0.10.0b37";
import { eatScanned, onRetailBarcode, onScan, openScanner } from "./views/scanner.js?v=0.10.0b37";
import { historyRow, openHistory, relTime } from "./views/history.js?v=0.10.0b37";
import { openCleanModal } from "./views/cleanup.js?v=0.10.0b37";
import { printSticker } from "./views/print.js?v=0.10.0b37";

class FridgeAssistantPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._state = null;
    this._filterLoc = "all";
    this._inventoryFilters = emptyFilters();
    this._inventorySort = "due";
    this._search = "";
    this._unsub = null;
    this._shellBuilt = false;
    this._activeTab = "inventory";
    this._inventoryView = "cards";
    this._statusColours = true;
    try { this._statusColours = localStorage.getItem("fridge_assistant.status_colours") !== "off"; } catch {}
    try { if (localStorage.getItem("fridge_assistant.inventory_view") === "list") this._inventoryView = "list"; } catch {}
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._shellBuilt) this._init();
    // After repeated failures the error card's retry button takes over, so
    // a broken backend isn't hammered on every single hass update.
    if (!this._unsub && hass && (this._subFails || 0) < 3) this._subscribe();
    if (this._shellBuilt) this._applyChrome();
  }
  get hass() { return this._hass; }

  // HA sets these properties on the panel element; `narrow` drives mobile layout.
  set narrow(v) { this._narrow = v; if (this._shellBuilt) this._applyChrome(); }
  get narrow() { return this._narrow; }
  set route(v) { this._route = v; }
  get route() { return this._route; }
  set panel(v) { this._panel = v; }
  get panel() { return this._panel; }

  connectedCallback() {
    if (!this._shellBuilt && this._hass) this._init();
  }
  disconnectedCallback() {
    if (this._unsub) { try { this._unsub(); } catch (e) {} this._unsub = null; }
  }

  /* ------------------------------------------------------------------ i18n */
  // "nl" only if Home Assistant's (per-user) language is Dutch; English for
  // everything else, including no language at all. Mirrors the backend's
  // resolve_language() so printed labels/notifications match the panel.
  _lang() {
    const raw = (this._hass && this._hass.language) || "en";
    return String(raw).split("-")[0].toLowerCase() === "nl" ? "nl" : "en";
  }

  t(key, ...args) {
    const table = STRINGS[this._lang()] || STRINGS.en;
    const v = (key in table ? table[key] : STRINGS.en[key]);
    return typeof v === "function" ? v(...args) : v;
  }

  // Backend sends location_meta/categories/kinds with Dutch labels (plus
  // emoji/icon, which aren't translated); these merge in the frontend label
  // for the active language while keeping the rest of the backend object.
  _locMeta(key) {
    const base = (this._state && this._state.location_meta || {})[key] || {};
    const table = LOCATION_LABELS[this._lang()] || LOCATION_LABELS.en;
    return { ...base, label: base.name || table[key] || base.label || key };
  }
  _storageType(key) {
    return this._state.location_meta?.[key]?.storage_type || key;
  }
  _storageMeta(key) {
    const labels = { fridge: this.t("storageFridge"), freezer: this.t("storageFreezer"), pantry: this.t("storagePantry") };
    const emojis = { fridge: "🧊", freezer: "❄️", pantry: "🧺" };
    return { label: labels[key] || key, emoji: emojis[key] || "📦" };
  }
  _catMeta(key) {
    const base = (this._state && this._state.categories || {})[key] || {};
    const table = CATEGORY_LABELS[this._lang()] || CATEGORY_LABELS.en;
    return { ...base, label: base.name || table[key] || base.label || key };
  }
  _kindMeta(key) {
    const base = (this._state && this._state.kinds || {})[key] || {};
    const table = (KIND_LABELS[this._lang()] || KIND_LABELS.en)[key] || {};
    const label = table.label || base.label || key;
    return { ...base, label, short: table.short || base.short || label };
  }

  async _subscribe() {
    // `set hass` fires on every state change; without a synchronous guard,
    // every call during the subscribe round-trip starts ANOTHER subscription
    // (only the last unsub is kept), and each leaked one re-renders the
    // panel on every push for the rest of the session.
    if (this._subscribing) return;
    this._subscribing = true;
    try {
      this._unsub = await this._hass.connection.subscribeMessage(
        (state) => { this._state = state; this._subFails = 0; this._onState(); },
        { type: "fridge_assistant/subscribe" }
      );
    } catch (e) {
      this._unsub = null;
      this._subFails = (this._subFails || 0) + 1;
      if (this._subFails >= 3) this._renderSubscribeError();
    } finally {
      this._subscribing = false;
    }
  }

  /* After repeated subscribe failures: an explicit error card with a retry
     button, instead of "Laden…" forever. */
  _renderSubscribeError() {
    const list = this.shadowRoot && this.shadowRoot.getElementById("list");
    if (!list || this._state) return;
    list.innerHTML = `<div class="empty">
      <ha-icon icon="mdi:lan-disconnect" style="--mdc-icon-size:44px;color:var(--fa-muted)"></ha-icon>
      <h2>${this.t("subscribeErrorTitle")}</h2>
      <p>${this.t("subscribeErrorSub")}</p>
      <button class="btn primary" id="sub-retry">${this.t("retryBtn")}</button>
    </div>`;
    list.querySelector("#sub-retry").addEventListener("click", () => {
      list.innerHTML = `<div class="loading">${this.t("loading")}</div>`;
      this._subFails = 0;
      this._subscribe();
    });
  }

  async _call(type, payload = {}) {
    return this._hass.callWS({ type: `fridge_assistant/${type}`, ...payload });
  }

  _kindOf(t) {
    return (t && t.kind) || (this._state.category_kind || {})[t && t.category] || "ingredient";
  }

  /* Avatar for the person who added an item: their photo if a linked person
     entity has one, else coloured initials derived from the name. */
  _avatar(name, picture, size = 20) {
    const box = `width:${size}px;height:${size}px`;
    if (picture) return `<img class="avatar" style="${box}" src="${esc(picture)}" alt="" title="${esc(name || "")}">`;
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    const initials = (parts.length ? parts.map((w) => w[0]).slice(0, 2).join("") : "?").toUpperCase();
    let hash = 0;
    for (const ch of String(name || "?")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="avatar avatar-i" style="${box};font-size:${Math.round(size * 0.42)}px;background:hsl(${hash % 360} 52% 52%)" title="${esc(name || "")}">${esc(initials)}</span>`;
  }

  /* ------------------------------------------------------ view delegates */
  /* The view modules are plain functions taking the panel instance; these
     thin wrappers keep every internal `this._x()` call site working. */
  _openModal(html, opts) { return openModal(this, html, opts); }
  _wireDateField(inp, placeholder, lang) { return wireDateField(inp, placeholder, lang); }
  _toast(msg, opts) { return toast(this, msg, opts); }
  _openAddModal(prefill, editItem) { return openAddModal(this, prefill, editItem); }
  _aiEstimate(name, ctx) { return aiEstimate(this, name, ctx); }
  _openTemplatePicker(onPick) { return openTemplatePicker(this, onPick); }
  _openTemplatesManager() { return openTemplatesManager(this); }
  _aiNewTemplate(onChanged) { return aiNewTemplate(this, onChanged); }
  _openTemplateEditor(tpl, isNew, onChanged, options) { return openTemplateEditor(this, tpl, isNew, onChanged, options); }
  _openItemModal(item, opts) { return openInspector(this, item, opts); }
  _completeItem(item, action, close) { return completeItem(this, item, action, close); }
  _eatScanned(raw, setStatus, count) { return eatScanned(this, raw, setStatus, count); }
  _openScanner() { return openScanner(this); }
  _onScan(raw, h) { return onScan(this, raw, h); }
  _onRetailBarcode(code) { return onRetailBarcode(this, code); }
  _openCleanModal() { return openCleanModal(this); }
  _relTime(ts) { return relTime(this, ts); }
  _historyRow(e) { return historyRow(this, e); }
  _openHistory() { return openHistory(this); }
  _printSticker(id, itemHint, opts) { return printSticker(this, id, itemHint, opts); }

  /* ---------------------------------------------------------------- shell */
  _init() {
    this._shellBuilt = true;
    // Rounded UI font (vendored woff2). @font-face doesn't apply inside a
    // shadow root, so the declaration goes into the document head once.
    if (!document.getElementById("fa-doc-fonts")) {
      const st = document.createElement("style");
      st.id = "fa-doc-fonts";
      st.textContent = [400, 800].map((w) =>
        `@font-face{font-family:"Nunito";font-weight:${w};font-style:normal;` +
        `font-display:swap;src:url("/fridge_assistant_static/fonts/nunito-${w}.woff2") format("woff2");}`
      ).join("\n");
      document.head.appendChild(st);
    }
    const home = homePath(window.location.search, window.location.origin);
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="wrap">
        <header class="topbar">
          <div class="topbar-row">
            ${home ? `<button class="btn ghost launch-home" id="btn-launch-home" aria-label="${this.t('homeDashboard')}" title="${this.t('homeDashboard')}"><ha-icon icon="mdi:home-outline"></ha-icon><span>${this.t('homeDashboard')}</span></button>` : ''}
            ${!home ? '<span class="menu-slot" id="menu-slot"></span>' : ""}
            <div class="brand"><ha-icon class="brand-emoji" icon="mdi:fridge-outline"></ha-icon><h1 title="${this.t("appTitle")}"><span class="brand-title-full">${this.t("appTitle")}</span><span class="brand-title-short">${this.t("appTitleShort")}</span></h1></div>
            <span class="spacer"></span>
            <button class="icon-btn" id="btn-history" title="${this.t("historyTooltip", 0)}"><ha-icon icon="mdi:history"></ha-icon></button>
            <button class="icon-btn" id="btn-templates" title="${this.t("manageTemplates")}"><ha-icon icon="mdi:book-multiple"></ha-icon></button>
            <button class="icon-btn" id="btn-categories" title="${this.t("manageCategories")}"><ha-icon icon="mdi:shape-outline"></ha-icon></button>
            <button class="icon-btn" id="btn-settings" title="${this.t("settings")}"><ha-icon icon="mdi:cog-outline"></ha-icon></button>
          </div>
          <nav class="main-tabs" role="tablist"><button class="btn ghost" id="tab-inventory" role="tab" aria-selected="true">${this.t("inventoryTab")}</button><button class="btn ghost" id="tab-recipes" role="tab" aria-selected="false">${this.t("recipesTab")}</button></nav>
          <div class="counts" id="counts"></div>
          <div class="searchrow">
            <div class="search"><ha-icon icon="mdi:magnify" style="--mdc-icon-size:18px;color:var(--fa-muted)"></ha-icon><input id="search" placeholder="${this.t("searchPlaceholder")}" autocomplete="off" enterkeyhint="search"></div>
        <div class="inventory-view-switch" id="inventory-view-switch" role="group" aria-label="${this.t("inventoryViewLabel")}"><button class="btn ghost" data-view="cards" aria-pressed="${this._inventoryView === "cards"}"><ha-icon icon="mdi:view-grid-outline"></ha-icon> ${this.t("cardView")}</button><button class="btn ghost" data-view="list" aria-pressed="${this._inventoryView === "list"}"><ha-icon icon="mdi:format-list-bulleted"></ha-icon> ${this.t("listView")}</button></div>
            <button class="btn ghost filter-trigger" id="btn-filters" aria-haspopup="dialog"><ha-icon icon="mdi:filter-variant"></ha-icon> ${this.t("filterButton")}<span id="filter-badge" hidden></span></button>
            <button class="btn ghost icon-only" id="btn-clean" title="${this.t("cleanUp")}"><ha-icon icon="mdi:broom"></ha-icon></button>
          </div>
        </header>
        <nav class="filters" id="filters"></nav>
        <main id="list"><div class="loading">${this.t("loading")}</div></main>
        <main id="recipes-view" hidden></main>
      </div>
      <button class="fab fab-scan" id="fab-scan" aria-label="${this.t("scanAria")}"><ha-icon icon="mdi:barcode-scan"></ha-icon></button>
      <button class="fab" id="fab-add" aria-label="${this.t("addItemAria")}"><ha-icon icon="mdi:plus"></ha-icon></button>
      <div id="modal-root"></div>
      <div id="toast-root"></div>
    `;
    const $ = (s) => this.shadowRoot.getElementById(s);
    this.shadowRoot.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
      this._inventoryView = button.dataset.view;
      try { localStorage.setItem("fridge_assistant.inventory_view", this._inventoryView); } catch {}
      this.shadowRoot.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === this._inventoryView)));
      this._renderList();
    }));
    $("fab-add").addEventListener("click", () => this._openAddModal());
    $("fab-scan").addEventListener("click", () => this._openScanner());
    $("tab-inventory").addEventListener("click", () => this._selectTab("inventory"));
    $("tab-recipes").addEventListener("click", () => this._selectTab("recipes"));
    $("btn-filters").addEventListener("click", () => openInventoryFilters(this));
    $("btn-clean").addEventListener("click", () => this._openCleanModal());
    $("btn-launch-home")?.addEventListener("click", () => window.location.assign(home));
    $("btn-history").addEventListener("click", () => this._openHistory());
    $("btn-templates").addEventListener("click", () => this._openTemplatesManager());
    $("btn-categories").addEventListener("click", () => openCategoriesManager(this));
    $("btn-settings").addEventListener("click", () => {
      // SPA navigation: a hard location change reloads the whole HA frontend.
      history.pushState(null, "", "/config/integrations/integration/fridge_assistant");
      window.dispatchEvent(new CustomEvent("location-changed"));
    });
    $("search").addEventListener("input", (e) => { this._search = e.target.value; this._renderList(); if(this._refreshInventoryFilters)this._refreshInventoryFilters(); });
    this._applyChrome();
    if (this._state) this._onState();
  }

  _selectTab(tab) {
    this._activeTab = tab;
    const recipes = tab === "recipes";
    for (const id of ["counts", "filters", "list", "fab-add", "fab-scan", "inventory-view-switch"]) this.shadowRoot.getElementById(id).hidden = recipes;
    this.shadowRoot.querySelector(".searchrow").hidden = recipes;
    this.shadowRoot.getElementById("recipes-view").hidden = !recipes;
    for (const name of ["inventory", "recipes"]) this.shadowRoot.getElementById(`tab-${name}`).setAttribute("aria-selected", String(tab === name));
    if (!recipes && this._state) this._renderFilters();
    if (recipes && !this._recipesMounted) {
      this._recipesMounted = true;
      openMealie(this, this.shadowRoot.getElementById("recipes-view"));
    } else if (recipes && this._refreshRecipes) this._refreshRecipes();
  }

  /* Render the native HA hamburger so the sidebar is reachable on mobile
     (a full-page custom panel has no HA header of its own). */
  _applyChrome() {
    const slot = this.shadowRoot && this.shadowRoot.getElementById("menu-slot");
    if (!slot) return;
    if (!this._menuBtn) {
      this._menuBtn = document.createElement("ha-menu-button");
      slot.appendChild(this._menuBtn);
    }
    this._menuBtn.hass = this._hass;
    this._menuBtn.narrow = this._narrow ?? false;
  }

  _onState() {
    const hb = this.shadowRoot.getElementById("btn-history");
    if (hb) hb.title = this.t("historyTooltip", this._state.history_count || 0);
    this._filterLoc = this._inventoryFilters.locations.length === 1 ? this._inventoryFilters.locations[0] : "all";
    if (this._refreshInventoryFilters) this._refreshInventoryFilters();
    this._renderCounts();
    this._renderFilters();
    this._renderList();
    // Keep an open inspector (drawer or sheet) in sync with the new state.
    if (this._refreshSurface) this._refreshSurface();
    if (this._refreshLocations) this._refreshLocations();
    if (this._refreshCategories) this._refreshCategories();
    if (this._activeTab === "recipes" && this._refreshRecipes) this._refreshRecipes();
  }

  _renderCounts() {
    const items = this._filteredItems();
    const el = this.shadowRoot.getElementById("counts");
    el.innerHTML = `<span>${(this._state.inventory_rows && this._state.inventory_rows.length !== this._state.items.length ? this.t("handlingStockCount",items.length,this._state.inventory_rows.length,this._state.items.length) : this.t("filterResults",items.length,(this._state.inventory_rows || this._state.items).length))}</span><label class="status-colour-toggle"><input type="checkbox" id="status-colours" ${this._statusColours ? "checked" : ""}>${this.t("statusColours")}</label><label class="inventory-sort"><span class="reorder-status">${this.t("filterSort")}</span><select id="inventory-sort"><option value="due">${this.t("filterSortDue")}</option><option value="due-desc">${this.t("filterSortDueDesc")}</option><option value="name">${this.t("filterSortName")}</option><option value="location">${this.t("locationLabel")}</option></select></label>`;
    el.querySelector("#status-colours").onchange=e=>{this._statusColours=e.target.checked;try{localStorage.setItem("fridge_assistant.status_colours",this._statusColours?"on":"off");}catch{}this._renderList();this.shadowRoot.getElementById("status-colours").focus();};
    const select=el.querySelector("select");select.value=this._inventorySort;
    select.onchange=()=>{this._inventorySort=select.value;this._listDescending=select.value==='due-desc';this._renderList();};
  }

  _renderFilters() { renderFilterChips(this); }

  _filteredItems() {
    const items=filterInventory(this._state.inventory_rows || this._state.items,this._inventoryFilters,{search:this._search,kindOf:i=>this._kindOf(i)});
    return items.slice().sort((a,b)=>{
      if(this._inventorySort==='name')return (a.name||'').localeCompare(b.name||'');
      if(this._inventorySort==='location')return (this._locMeta(a.location).label||'').localeCompare(this._locMeta(b.location).label||'');
      if(!a.expiry_date||!b.expiry_date)return Number(!a.expiry_date)-Number(!b.expiry_date);
      return (Date.parse(a.handling_due_at || a.expiry_date+'T23:59:59')-Date.parse(b.handling_due_at || b.expiry_date+'T23:59:59'))*(this._inventorySort==='due-desc'?-1:1);
    });
  }

  _renderList() {
    if (!this._state) return;
    const list = this.shadowRoot.getElementById("list");
    list.classList.toggle("status-colours", this._statusColours);
    this._renderCounts();
    const items = this._filteredItems();
    const lang = this._lang();

    const low = this._state.low_stock || [];
    const lowHtml = low.length ? `<details class="low-stock"><summary>${this.t('lowStock')} ${low.length}</summary>${low.map(t=>`<div class="d-row"><span>${esc(t.emoji || '')} ${esc(t.name)}</span><b>${t.remaining} ${esc(t.unit || '')} · ≤ ${t.limit}</b></div>`).join('')}</details>` : '';
    if (this._state.counts.total === 0) {
      list.innerHTML = lowHtml + `<div class="empty">
        <div class="empty-emoji">🧊</div>
        <h2>${this.t("emptyTitle")}</h2>
        <p>${this.t("emptySub")}</p>
        <button class="btn primary" id="empty-add">${this.t("addItemBtn")}</button>
      </div>`;
      list.querySelector("#empty-add").addEventListener("click", () => this._openAddModal());
      return;
    }

    let html = lowHtml;
    if (!items.length) {
      // The active chips may be scrolled out of view, so an empty result
      // needs its own way out.
      html += `<div class="empty small"><p>${this.t("nothingFound")}</p>
        <button class="btn ghost" id="clear-filters">${this.t("showAll")}</button></div>`;
    } else if (this._inventoryView === "list") {
      html += inventoryList(this, items, lang);
    } else {
      // Urgency sections: full-width headers inside the cards grid, so the
      // expiry sort stays readable in the two-column layout. They apply in
      // every view (filters/search included); a single group needs no header.
      const secOf = (i) =>
        i.days_left == null ? "nodate"
        : (i.status === "expired" || i.status === "soon") ? "first"
        : i.days_left <= 7 ? "week" : "later";
      const titles = {
        first: this.t("useFirst"),
        week: this.t("secThisWeek"),
        later: this.t("secLater"),
        nodate: this.t("secNoDate"),
      };
      const groups = ["first", "week", "later", "nodate"]
        .map((k) => [k, items.filter((i) => secOf(i) === k)])
        .filter(([, arr]) => arr.length);
      const showHeads = groups.length > 1;
      if (this._inventorySort !== "due") { groups.splice(0,groups.length,["all",items]); }
      html += `<div class="cards">${groups.map(([k, arr]) =>
        (showHeads && k !== "all" ? `<div class="sec-head${k === "first" ? " urgent" : ""}">${titles[k]} <span class="sec-n">${arr.length}</span></div>` : "")
        + arr.map((i) => this._itemCard(i, lang)).join("")
      ).join("")}</div>`;
    }
    list.innerHTML = html;

    list.querySelector("#list-sort")?.addEventListener("click", () => { this._listDescending = this._inventorySort.startsWith("due") ? !this._listDescending : false; this._inventorySort=this._listDescending?"due-desc":"due"; this._renderList(); });
    const clearBtn = list.querySelector("#clear-filters");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      this._filterLoc = "all"; this._inventoryFilters = emptyFilters();
      this._search = "";
      const s = this.shadowRoot.getElementById("search");
      if (s) s.value = "";
      this._renderFilters();
      this._renderList();
    });
    list.querySelectorAll("[data-item]").forEach((el) => {
      const open = (e) => {
        if (e.target.closest("button")) return;
        const item = (this._state.inventory_rows || this._state.items).find(x => (x.inventory_key || x.id) === el.dataset.item);
        if (item) this._openItemModal(item, {highlight:item.portions?.[0]?.n});
      };
      el.addEventListener("click", open);
      // Cards are divs, so Enter/Space must be wired for keyboard users.
      el.addEventListener("keydown", (e) => {
        if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(e); }
      });
    });
    list.querySelectorAll("[data-list-actions]").forEach(button => button.addEventListener("click", e => {
      e.stopPropagation();
      const item = (this._state.inventory_rows || this._state.items).find(i => (i.inventory_key || i.id) === button.dataset.listActions);
      if (item) this._openItemModal(item, {highlight:item.portions?.[0]?.n});
    }));
    list.querySelectorAll(".card-print").forEach((b) =>
      b.addEventListener("click", (e) => { e.stopPropagation(); const row=(this._state.inventory_rows || this._state.items).find(i=>(i.inventory_key || i.id)===b.dataset.print); if(row)this._printSticker(row.id,row,{allowedPortions:row.portions?.map(p=>p.n)}); })
    );
  }

  _itemCard(i, lang) {
    const lm = this._locMeta(i.location);
    const locLabel = lm.label || i.location || "";
    const contents = i.contents && i.contents !== i.name ? i.contents : "";
    const portions = i.portions || [];
    const total = i.batch_portions_total || portions.length;
    const open = portions.filter((p) => p.status === "open").length;
    const pbadge = total > 1
      ? `<span class="cs-sep">·</span><span class="pbadge" title="${esc(this.t("pbadgeTitle", open, total))}">${open}/${total}</span>`
      : "";
    const selected = this._inspectorItemId === i.id ? " selected" : "";
    return `<div class="card${selected}${i.status === "expired" ? " status-expired" : i.status === "soon" ? " status-soon" : ""}" data-item="${i.inventory_key || i.id}" role="button" tabindex="0" aria-label="${esc(i.name)}">
      <div class="card-emoji">${i.emoji || "🍽️"}</div>
      <div class="card-main">
        <div class="card-title">${esc(i.name)}${i.stock_count != null ? ` <span class="pbadge">${i.stock_count} ${esc(this._state.templates.find(t=>t.id===i.template_id)?.stock_unit || this.t("stockRemaining"))}</span>` : ""}</div>
        <div class="card-sub">
          ${this._filterLoc === "all" ? `<span class="cs-fix">${lm.emoji || ""} ${esc(locLabel)}</span><span class="cs-sep">·</span>` : ""}
          <span class="code">${esc(i.code)}${i.inventory_key && i.portions?.length === 1 && i.batch_portions_total > 1 ? "-"+i.portions[0].n : ""}</span>${pbadge}
          ${contents ? `<span class="cs-sep">·</span><span class="cs-more">${esc(contents)}</span>` : ""}
        </div>
        ${handlingSummary(this,i,false) ? `<div class="inventory-handling">${esc(handlingSummary(this,i,false))}</div>` : ""}
      </div>
      <div class="card-right">
        <div class="status" style="--c:${STATUS_COLOR[i.status]}">${handlingStatus(this,i,daysLabel(i.days_left, lang, i.date_type))}</div>
        <div class="card-when">${i.added_by_name ? `<span class="who" title="${esc(i.added_by_name)}">${this._avatar(i.added_by_name, i.added_by_picture, 15)}</span>` : ""}${i.expiry_date ? `<span>${handlingDate(this,i) || this.t(i.date_type === "best_before" ? "bestBeforeLabel" : "useByLabel")+" "+fmtCardDate(i.expiry_date, lang, this._state.today, i.expiry_precision)}</span>` : ""}</div>
      </div>
      <button class="card-print icon-btn" data-print="${i.inventory_key || i.id}" title="${this.t("printSticker")}" aria-label="${this.t("printSticker")}"><ha-icon icon="mdi:tag-outline"></ha-icon></button>
    </div>`;
  }
}

customElements.define("fridge-assistant-panel", FridgeAssistantPanel);
