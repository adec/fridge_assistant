import { fillCategorySelect } from "../lib/categories.js?v=0.10.0b18";
/* Template picker, manager (view/edit/add — no AI required) and editor.
 * The manager opens as a drawer on desktop; the picker (part of the add
 * flow) and the editor (also reachable from the add-modal's AI flow, and
 * stacked on top of the manager drawer) stay modals. */

import { esc } from "../lib/format.js?v=0.10.0b18";
import { openSurface } from "../lib/surface.js?v=0.10.0b18";

export function openTemplatePicker(panel, onPick) {
  const templates = panel._state.templates;
  const kinds = panel._state.kinds || {};
  let kindFilter = "all";
  const h = panel._openModal(`
    <div class="modal-head">
      <div class="m-title"><h3>${panel.t("pickTemplateTitle")}</h3></div>
      <button class="icon-btn" id="tp-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>
    <div class="seg" id="tp-kinds">
      <button data-kind="all" class="on">${panel.t("all")}</button>
      ${Object.keys(kinds).map((k) => { const km = panel._kindMeta(k); return `<button data-kind="${k}">${km.emoji || ""} ${km.short}</button>`; }).join("")}
    </div>
    <div class="search big"><ha-icon icon="mdi:magnify" style="--mdc-icon-size:18px;color:var(--fa-muted)"></ha-icon><input id="tp-search" placeholder="${esc(panel.t("searchInTemplates", templates.length))}" autocomplete="off"></div>
    <div class="tp-list" id="tp-list"></div>
  `, { wide: true });
  const listEl = h.modal.querySelector("#tp-list");
  const searchEl = h.modal.querySelector("#tp-search");
  const render = () => {
    const qq = (searchEl.value || "").trim().toLowerCase();
    const filtered = templates.filter((t) => {
      if (kindFilter !== "all" && panel._kindOf(t) !== kindFilter) return false;
      if (!qq) return true;
      return t.name.toLowerCase().includes(qq) || (t.aliases || []).some((a) => a.toLowerCase().includes(qq));
    });
    listEl.innerHTML = filtered.map((t) => {
      const c = panel._catMeta(t.category);
      const sl = t.shelf_life || {};
      return `<button class="tp-item" data-id="${t.id}">
        <span class="tp-emoji">${t.emoji || c.emoji || "🍽️"}</span>
        <span class="tp-name"><b>${esc(t.name)}</b><small>${panel._kindMeta(panel._kindOf(t)).emoji || ""} ${esc(c.label || t.category)}${t.source === "user" || t.source === "ai" ? panel.t("ownSuffix") : ""}</small></span>
        <span class="tp-sl">${["fridge", "freezer", "pantry"].map((l) => sl[l] ? `<i>${panel._storageMeta(l).emoji || ""}${sl[l]}d</i>` : "").join("")}</span>
      </button>`;
    }).join("") || `<div class="empty small"><p>${panel.t("nothingFound")}</p></div>`;
    listEl.querySelectorAll(".tp-item").forEach((b) =>
      b.addEventListener("click", () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        h.close(); onPick(t);
      })
    );
  };
  render();
  searchEl.addEventListener("input", render);
  const kindsEl = h.modal.querySelector("#tp-kinds");
  kindsEl.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      kindFilter = b.dataset.kind;
      kindsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      render();
    })
  );
  h.modal.querySelector("#tp-close").addEventListener("click", h.close);
  setTimeout(() => searchEl.focus(), 60);
}

export function openTemplatesManager(panel) {
  const kinds = panel._state.kinds || {};
  let kindFilter = "all";
  const h = openSurface(panel, `
    <div class="modal-head">
      <div class="m-title"><h3>${panel.t("templatesTitle")}</h3></div>
      ${panel._state.options.ai_enabled ? `<button class="btn ai icon-only" id="tm-ai" title="${panel.t("templateWithAiTitle")}"><ha-icon icon="mdi:creation"></ha-icon></button>` : ""}
      <button class="btn primary icon-only" id="tm-new" title="${panel.t("newTemplateTitleIcon")}"><ha-icon icon="mdi:plus"></ha-icon></button>
      <button class="icon-btn" id="tm-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>
    <div class="seg" id="tm-kinds">
      <button data-kind="all" class="on">${panel.t("all")}</button>
      ${Object.keys(kinds).map((k) => { const km = panel._kindMeta(k); return `<button data-kind="${k}">${km.emoji || ""} ${km.short}</button>`; }).join("")}
      ${(panel._state.hidden || []).length ? `<button data-kind="hidden" title="${panel.t("hiddenTemplatesTitle")}"><ha-icon icon="mdi:eye-off-outline"></ha-icon></button>` : ""}
    </div>
    <div class="search big"><ha-icon icon="mdi:magnify" style="--mdc-icon-size:18px;color:var(--fa-muted)"></ha-icon><input id="tm-search" placeholder="${panel.t("searchOrFilterPlaceholder")}" autocomplete="off"></div>
    <div class="tp-list" id="tm-list"></div>
  `, { prefer: "drawer", wide: true });
  const listEl = h.modal.querySelector("#tm-list");
  const searchEl = h.modal.querySelector("#tm-search");
  const render = () => {
    if (kindFilter === "hidden") {
      const hidden = panel._state.hidden || [];
      listEl.innerHTML = hidden.map((t) => {
        const c = panel._catMeta(t.category);
        return `<div class="tp-item"><span class="tp-emoji">${t.emoji || c.emoji || "🍽️"}</span>
          <span class="tp-name"><b>${esc(t.name)}</b><small>${esc(c.label || t.category)}</small></span>
          <button class="s-mini" data-unhide="${t.id}">${panel.t("backBtn")}</button></div>`;
      }).join("") || `<div class="empty small"><p>${panel.t("nothingHidden")}</p></div>`;
      listEl.querySelectorAll("[data-unhide]").forEach((b) =>
        b.addEventListener("click", async () => {
          await panel._call("unhide_template", { template_id: b.dataset.unhide });
          panel._toast(panel.t("restoredToast")); render();
        }));
      return;
    }
    const qq = (searchEl.value || "").trim().toLowerCase();
    const templates = panel._state.templates.filter((t) => {
      if (kindFilter !== "all" && panel._kindOf(t) !== kindFilter) return false;
      if (!qq) return true;
      return t.name.toLowerCase().includes(qq)
        || (t.aliases || []).some((a) => a.toLowerCase().includes(qq))
        || (panel._catMeta(t.category).label || "").toLowerCase().includes(qq);
    });
    listEl.innerHTML = templates.map((t) => {
      const c = panel._catMeta(t.category);
      const sl = t.shelf_life || {};
      const badge = t.custom
        ? (t.builtin ? `<span class="tm-badge edit">${panel.t("customizedBadge")}</span>` : `<span class="tm-badge own">${panel.t("ownBadge")}</span>`)
        : "";
      return `<button class="tp-item" data-id="${t.id}">
        <span class="tp-emoji">${t.emoji || c.emoji || "🍽️"}</span>
        <span class="tp-name"><b>${esc(t.name)}${badge}</b><small>${panel._kindMeta(panel._kindOf(t)).emoji || ""} ${esc(c.label || t.category)}</small></span>
        <span class="tp-sl">${["fridge", "freezer", "pantry"].map((l) => sl[l] ? `<i>${panel._storageMeta(l).emoji || ""}${sl[l]}d</i>` : "").join("")}</span>
      </button>`;
    }).join("") || `<div class="empty small"><p>${panel.t("nothingInGroup")}</p></div>`;
    listEl.querySelectorAll(".tp-item").forEach((b) =>
      b.addEventListener("click", () => {
        const t = panel._state.templates.find((x) => x.id === b.dataset.id);
        openTemplateEditor(panel, t, false, render);
      })
    );
  };
  render();
  searchEl.addEventListener("input", render);
  const kindsEl = h.modal.querySelector("#tm-kinds");
  kindsEl.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      kindFilter = b.dataset.kind;
      kindsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      render();
    })
  );
  h.modal.querySelector("#tm-close").addEventListener("click", h.close);
  h.modal.querySelector("#tm-new").addEventListener("click", () => openTemplateEditor(panel, null, true, render));
  const tmAi = h.modal.querySelector("#tm-ai");
  if (tmAi) tmAi.addEventListener("click", () => aiNewTemplate(panel, render));
  setTimeout(() => searchEl.focus(), 60);
}

/* Create a template with AI: name in -> estimate -> prefilled editor to tweak & save. */
export function aiNewTemplate(panel, onChanged) {
  const h = panel._openModal(`
    <div class="modal-head">
      <div class="m-emoji"><ha-icon icon="mdi:creation" style="--mdc-icon-size:28px;color:var(--fa-accent)"></ha-icon></div>
      <div class="m-title"><h3>${panel.t("templateWithAiTitle")}</h3><div class="s-sub">${panel.t("templateWithAiSub")}</div></div>
      <button class="icon-btn" id="ai-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>
    <label class="field"><span>${panel.t("productOrDishLabel")}</span><input id="ai-name" placeholder="${panel.t("productOrDishPlaceholder")}" enterkeyhint="go" autocomplete="off"></label>
    <div class="modal-actions"><button class="btn ai" id="ai-go">${panel.t("estimateWithAiBtn")}</button></div>
  `);
  const q = (s) => h.modal.querySelector(s);
  const nameEl = q("#ai-name");
  q("#ai-close").addEventListener("click", h.close);
  const run = async () => {
    const name = (nameEl.value || "").trim();
    if (name.length < 2) { nameEl.focus(); return; }
    const btn = q("#ai-go");
    btn.disabled = true; btn.textContent = panel.t("aiThinking");
    let res;
    try { res = await panel._call("estimate", { name }); }
    catch (e) {
      btn.disabled = false; btn.innerHTML = panel.t("estimateWithAiBtn");
      panel._toast(panel.t("aiErrorPrefix") + (e.message || e), { type: "bad" });
      return;
    }
    const est = res.estimate;
    h.close();
    openTemplateEditor(panel, {
      name, emoji: est.emoji, icon: est.icon, category: est.category,
      kind: est.kind, shelf_life: est.shelf_life, aliases: [], notes: est.notes,
      custom: false, builtin: false,
    }, true, onChanged);
  };
  q("#ai-go").addEventListener("click", run);
  nameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  setTimeout(() => nameEl.focus(), 60);
}

export function openTemplateEditor(panel, tpl, isNew, onChanged, options = {}) {
  const cats = panel._state.categories;
  const locs = panel._state.storage_types || ["fridge", "freezer", "pantry"];
  const t = tpl || { name: "", emoji: "", category: "other", shelf_life: {}, aliases: [], notes: "" };
  const catOf = (k) => panel._catMeta(k) || panel._catMeta("other");
  const kinds = panel._state.kinds || {};
  const curKind = t.kind || panel._kindOf(t);
  const sl = t.shelf_life || {};
  const catOptions = Object.keys(cats).filter(k => !panel._state.categories[k].archived || k === t.category).map((k) => {
    const cm = panel._catMeta(k);
    return `<option value="${k}" ${k === (t.category || "other") ? "selected" : ""}>${cm.emoji} ${cm.label}</option>`;
  }).join("");
  const dayField = (loc) => {
    const lm = panel._storageMeta(loc);
    return `<label class="field"><span>${lm.emoji} ${lm.label}</span><input type="number" inputmode="numeric" min="0" max="3650" class="te-day" data-loc="${loc}" value="${sl[loc] ?? ""}" placeholder="${panel.t("notApplicablePlaceholder")}"></label>`;
  };
  const isBuiltin = !!t.builtin;
  const isOverride = !!(t.custom && t.builtin);
  const h = panel._openModal(`
    <div class="modal-head">
      <div class="m-emoji" id="te-prev">${t.emoji || catOf(t.category).emoji}</div>
      <div class="m-title"><h3>${isNew ? panel.t("newTemplateHeading") : panel.t("editTemplateHeading")}</h3>
        ${!isNew ? `<div class="s-sub">${isOverride ? panel.t("overrideNote") : (t.builtin ? panel.t("builtinNote") : panel.t("ownTemplateNote"))}</div>` : ""}
      </div>
      <button class="icon-btn" id="te-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>
    <div class="grid2">
      <label class="field"><span>${panel.t("nameLabel")}</span><input id="te-name" value="${esc(t.name)}" placeholder="${panel.t("namePlaceholderTemplate")}"></label>
      <label class="field"><span>${panel.t("emojiLabel")}</span><input id="te-emoji" maxlength="16" value="${esc(t.emoji || "")}" placeholder="🥫"></label>
    </div>
    ${panel._state.options.ai_enabled ? `<button type="button" class="btn ghost" id="te-emoji-ai"><ha-icon icon="mdi:creation"></ha-icon> ${panel.t("suggestEmoji")}</button><p class="location-help" id="te-emoji-status" role="status"></p>` : ""}
    <label class="field"><span>${panel.t("kindLabel")}</span>
      <div class="seg" id="te-kind">${Object.keys(kinds).map((k) => { const km = panel._kindMeta(k); return `<button type="button" data-kind="${k}" class="${curKind === k ? "on" : ""}">${km.emoji || ""} ${km.short}</button>`; }).join("")}</div>
    </label>
    <label class="field"><span>${panel.t("categoryLabel")}</span><div class="select-wrap"><select id="te-cat">${catOptions}</select></div></label>
    <label class="date-type-check"><input type="checkbox" id="te-date-type" ${(t.date_type || "use_by") === "best_before" ? "checked" : ""}><span>${panel.t("bestBeforeCheckbox")}</span></label>
    <p class="date-type-help">${panel.t("useByUnchecked")}</p>
    <div class="te-sec">${panel.t("shelfLifeSectionLabel")}</div>
    <div class="grid3">${locs.map(dayField).join("")}</div>
    <label class="field"><span>${panel.t("aliasesLabel")}</span><input id="te-aliases" value="${esc((t.aliases || []).join(", "))}" placeholder="${panel.t("aliasesPlaceholder")}"></label>
    <label class="field"><span>${panel.t("notesTipLabel")}</span><input id="te-notes" value="${esc(t.notes || "")}" placeholder="${panel.t("notesTipPlaceholder")}"></label>
    <div class="modal-actions ${!isNew ? "with-del" : ""}">
      ${isOverride ? `<button class="btn ghost" id="te-reset">${panel.t("restoreDefaultBtn")}</button>` : ""}
      ${!isNew ? `<button class="btn ghost danger-text" id="te-del">${isBuiltin ? panel.t("builtinRemoveBtn") : panel.t("customRemoveBtn")}</button>` : ""}
      ${options.afterSave ? `<button class="btn ghost" id="te-save-next">${panel.t("mappingSaveNext")}</button>` : ""}
      <button class="btn primary" id="te-save">${panel.t(options.afterSave ? "mappingSaveLink" : "saveBtn")}</button>
    </div>
  `);
  const q = (s) => h.modal.querySelector(s);
  const prev = q("#te-prev");
  const syncPrev = () => { prev.textContent = (q("#te-emoji").value || "").trim() || catOf(q("#te-cat").value).emoji; };
  const emojiInput = q("#te-emoji");
  let emojiOverridden = !!t.emoji && t.emoji !== catOf(t.category).emoji;
  const syncCategoryEmoji = () => {
    if (!emojiOverridden) emojiInput.value = catOf(q("#te-cat").value).emoji || "";
    syncPrev();
  };
  // Select after the pointer's default cursor positioning, including on touch.
  emojiInput.addEventListener("focus", () => requestAnimationFrame(() => {
    if (emojiInput.getRootNode().activeElement === emojiInput) emojiInput.select();
  }));
  emojiInput.addEventListener("click", () => emojiInput.select());
  emojiInput.addEventListener("input", () => {
    emojiOverridden = !!emojiInput.value.trim();
    if (!emojiOverridden) syncCategoryEmoji(); else syncPrev();
  });
  q("#te-cat").addEventListener("change", syncCategoryEmoji);
  let selKind = curKind;
  fillCategorySelect(panel, q("#te-cat"), selKind, t.category, tpl && selKind === curKind ? t.category : null);
  syncCategoryEmoji();
  const kindEl = q("#te-kind");
  if (kindEl) kindEl.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      selKind = b.dataset.kind;
      fillCategorySelect(panel, q("#te-cat"), selKind, q("#te-cat").value, tpl && selKind === curKind ? t.category : null);
      syncCategoryEmoji();
      kindEl.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    }));
  q("#te-close").addEventListener("click", h.close);
  let savedTemplate = null, saveNext = false, submitting = false;
  q("#te-emoji-ai")?.addEventListener("click", async () => {
    const name = q("#te-name").value.trim();
    if (!name) { q("#te-name").focus(); return; }
    const button = q("#te-emoji-ai"), status = q("#te-emoji-status");
    const before = q("#te-emoji").value;
    button.disabled = true; status.textContent = panel.t("emojiThinking");
    try {
      const result = await panel._call("estimate", {name});
      if (!h.modal.isConnected || submitting || savedTemplate) return;
      if (q("#te-name").value.trim() !== name || q("#te-emoji").value !== before) {
        status.textContent = panel.t("emojiSuggestionStale"); return;
      }
      const emoji = result.estimate?.emoji?.trim();
      if (!emoji || emoji.length > 16 || !/\p{Extended_Pictographic}/u.test(emoji)) throw new Error(panel.t("emojiSuggestionEmpty"));
      emojiOverridden = true; q("#te-emoji").value = emoji; syncPrev();
      status.textContent = panel.t("emojiSuggested");
    } catch (error) {
      if (h.modal.isConnected) status.textContent = panel.t("emojiSuggestionFailed");
    } finally {
      if (h.modal.isConnected && !savedTemplate) button.disabled = false;
    }
  });
  q("#te-save-next")?.addEventListener("click", () => { saveNext = true; q("#te-save").click(); });
  q("#te-save").addEventListener("click", async () => {
    if (submitting) return;
    const next = saveNext; saveNext = false;
    const name = (q("#te-name").value || "").trim();
    if (!name) { q("#te-name").focus(); return; }
    const shelf = {};
    h.modal.querySelectorAll(".te-day").forEach((inp) => {
      const v = inp.value.trim() === "" ? null : Math.min(3650, Math.max(0, parseInt(inp.value, 10) || 0));
      shelf[inp.dataset.loc] = v && v > 0 ? v : null;
    });
    const cat = q("#te-cat").value;
    if (!cat) { panel._toast(panel.t("noKindCategories"), {type:"bad"}); return; }
    const template = {
      name,
      emoji: (q("#te-emoji").value || "").trim() || catOf(cat).emoji,
      icon: (tpl && tpl.icon) || catOf(cat).icon,
      category: cat,
      kind: selKind,
      date_type: q("#te-date-type").checked ? "best_before" : "use_by",
      shelf_life: shelf,
      aliases: (q("#te-aliases").value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
      notes: (q("#te-notes").value || "").trim(),
      source: "user",
    };
    if (tpl && tpl.id) template.id = tpl.id; // keep id → overrides builtin / updates own
    submitting = true; q("#te-save").disabled = true;
    if (q("#te-save-next")) q("#te-save-next").disabled = true;
    try {
      const result = savedTemplate ? {template:savedTemplate} : await panel._call("add_template", { template });
      if (options.afterSave) {
        savedTemplate = result.template;
        // A failed mapping retries this same template, never creates a duplicate.
        h.modal.querySelectorAll("input,select,#te-kind button,#te-emoji-ai").forEach(el => el.disabled = true);
        if (!await options.afterSave(savedTemplate)) throw new Error(panel.t("mappingTemplateSavedLinkFailed"));
      }
      h.close();
      panel._toast(isNew ? panel.t("templateAddedToast") : panel.t("templateSavedToast"));
      onChanged && onChanged(result.template, next);
    } catch (e) {
      q("#te-save").disabled = false;
      if (q("#te-save-next")) q("#te-save-next").disabled = false;
      panel._toast(panel.t("errorPrefix") + (e.message || e), { type: "bad" });
    } finally { submitting = false; }
  });
  const reset = q("#te-reset");
  if (reset) reset.addEventListener("click", async () => {
    await panel._call("remove_template", { template_id: tpl.id });
    h.close();
    panel._toast(panel.t("restoredDefaultToast"));
    onChanged && onChanged();
  });
  const del = q("#te-del");
  if (del) del.addEventListener("click", async () => {
    if (isBuiltin) await panel._call("hide_template", { template_id: tpl.id });
    else await panel._call("remove_template", { template_id: tpl.id });
    h.close();
    panel._toast(isBuiltin ? panel.t("removedFromListToast") : panel.t("templateDeletedToast"));
    onChanged && onChanged();
  });
  setTimeout(() => q("#te-name").focus(), 60);
}
