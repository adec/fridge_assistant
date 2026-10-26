import { monthEnd } from "../lib/date-precision.js?v=0.10.0b32";
import { fillCategorySelect } from "../lib/categories.js?v=0.10.0b32";
/* Add/edit modal + AI shelf-life estimate. */

import { addDays, daysBetween, daysLabel, debounce, esc, todayISO } from "../lib/format.js?v=0.10.0b32";

export function openAddModal(panel, prefill = {}, editItem = null) {
  const isEdit = !!editItem;
  const m = {
    location: prefill.location || editItem?.location || panel._state.active_locations?.[0] || "fridge",
    added: prefill.added_date || editItem?.added_date || todayISO(),
    dateType: editItem?.date_type || prefill.date_type || "use_by",
    dateTypeManual: isEdit || !!prefill.date_type,
    expiryPrecision: prefill.expiry_precision || editItem?.expiry_precision || "day",
    expiry: prefill.expiry_date || editItem?.expiry_date || "",
    expiryManual: isEdit ? editItem?.expiry_source === "manual" : !!prefill.expiry_date,
    expiryLocked: isEdit || !!prefill.expiry_date,
    expirySource: editItem?.expiry_source || prefill.expiry_source || (prefill.expiry_date ? "manual" : "none"),
    emoji: prefill.emoji || editItem?.emoji || "🍽️",
    template_id: prefill.template_id || editItem?.template_id || null,
    category: prefill.category || editItem?.category || null,
    categoryManual: isEdit || !!prefill.category,
    kind: editItem?.kind || prefill.kind || "ingredient",
    kindManual: isEdit,
    portions: 1,
    aiResult: null,
  };
  const locs = (panel._state.active_locations || panel._state.locations).slice();
  if (isEdit && !locs.includes(m.location)) locs.push(m.location);
  const kinds = panel._state.kinds || { ingredient: {}, dish: {} };
  const nameVal = editItem ? editItem.name : (prefill.name || "");

  const h = panel._openModal(`
    <div class="modal-head">
      <div class="m-emoji" id="m-emoji">${esc(m.emoji)}</div>
      <div class="m-title">
        <input class="m-name" id="f-name" placeholder="${panel.t("addNamePlaceholder")}" value="${esc(nameVal)}">
      </div>
      <button class="icon-btn" id="m-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button>
    </div>
    <div class="suggest" id="f-suggest"></div>
    <div class="seg location-select" id="f-loc">
      ${locs.map((l) => { const lm = panel._locMeta(l); return `<button data-loc="${l}" class="${m.location === l ? "on" : ""}">${esc(lm.emoji)} ${esc(lm.label)}${lm.archived ? " · " + panel.t("locationArchived") : ""}</button>`; }).join("")}
    </div>
    <div class="seg" id="f-kind">
      ${Object.keys(kinds).map((k) => { const km = panel._kindMeta(k); return `<button type="button" data-kind="${k}" class="${m.kind === k ? "on" : ""}">${km.emoji || ""} ${km.short}</button>`; }).join("")}
    </div>
    ${!isEdit ? `<label class="field" id="f-portions-wrap"><span>${panel.t("portionsLabel")}</span>
      <div class="pstep-row">
        <span class="pstep">
          <button type="button" class="ps-btn" id="ps-minus" disabled><ha-icon icon="mdi:minus"></ha-icon></button>
          <b class="ps-n" id="ps-n">1</b>
          <button type="button" class="ps-btn" id="ps-plus"><ha-icon icon="mdi:plus"></ha-icon></button>
        </span>
        <small class="ps-note">${panel.t("portionsFieldNote")}</small>
      </div>
    </label>` : ""}
    <label class="field hidden" id="f-count-wrap"><span>${panel.t('stockRemaining')}</span><input type="number" id="f-stock-count" min="1" max="1000000" step="1" value="${editItem?.stock_count ?? 1}"></label>
    <label class="date-type-check"><input type="checkbox" id="f-date-type" ${m.dateType === "best_before" ? "checked" : ""}><span>${panel.t("bestBeforeCheckbox")}</span></label>
    <p class="date-type-help">${panel.t("useByUnchecked")}</p>
    <div class="grid2">
      <label class="field"><span>${panel.t("dateInFieldLabel")}</span><div class="datefield"><input type="date" id="f-added" value="${m.added}"><span class="df-display"></span></div></label>
      <label class="field"><span id="f-date-label">${panel.t(m.dateType === "best_before" ? "bestBeforeLabel" : "useByLabel")}</span><div class="datefield"><input type="date" id="f-expiry" value="${m.expiry}"><span class="df-display"></span><button type="button" class="df-clear" title="${panel.t("clearDateTitle")}" aria-label="${panel.t("clearDateTitle")}"><ha-icon icon="mdi:close"></ha-icon></button></div></label>
    </div>
    <div class="expiry-hint" id="f-hint"></div>
    <div class="grid2"><label class="field"><span>${panel.t('datePrecision')}</span><div class="select-wrap"><select id="f-date-precision"><option value="day">${panel.t('exactDate')}</option><option value="month">${panel.t('monthYear')}</option></select></div></label><label class="field hidden" id="f-month-wrap"><span id="f-month-label">${panel.t(m.dateType === 'best_before' ? 'bestBeforeLabel' : 'useByLabel')}</span><input type="month" id="f-expiry-month"></label></div>
    <p class="location-help hidden" id="f-month-hint"></p>
    <div id="f-expiry-suggestion" class="expiry-suggestion hidden"></div>
    <button class="link" id="f-adv">${panel.t("moreOptions")}</button>
    <div class="adv hidden" id="f-advbox">
    <label class="date-type-check"><input type="checkbox" id="f-counted" ${editItem?.stock_count != null ? 'checked' : ''}><span>${panel.t('stockCountMode')}</span></label>

      <label class="field"><span>${panel.t("categoryLabel")}</span><div class="select-wrap"><select id="f-category">${Object.keys(panel._state.categories || {}).filter(k => !panel._state.categories[k].archived || k === m.category).map(k => `<option value="${esc(k)}" ${k === (m.category || "other") ? "selected" : ""}>${esc(panel._catMeta(k).label)}</option>`).join("")}</select></div></label>
      <label class="field"><span>${panel.t("displayNameLabel")}</span><input id="f-dispname" placeholder="${panel.t("displayNamePlaceholder")}" value="${esc(editItem?.name || "")}"></label>
      <div class="grid2">
        <label class="field"><span>${panel.t("quantityLabel")}</span><input id="f-qty" placeholder="${panel.t("quantityPlaceholder")}" value="${esc(editItem?.quantity ?? prefill.quantity ?? "")}"></label>
        <label class="field"><span>${panel.t("emojiLabel")}</span><input id="f-emojiin" maxlength="4" value="${esc(m.emoji)}"></label>
      </div>
      <label class="field"><span>${panel.t("notesLabel")}</span><input id="f-notes" placeholder="${panel.t("notesLabel")}" value="${esc(editItem?.notes ?? prefill.notes ?? "")}"></label>
      <label class="field"><span>${panel.t("labelNote")}</span><textarea id="f-label-note" maxlength="500" rows="2">${esc(editItem?.label_note ?? prefill.label_note ?? "")}</textarea><small class="location-help">${panel.t("labelNoteItemHelp")}</small><button type="button" class="link" id="f-label-note-reset">${panel.t("labelNoteUseTemplate")}</button></label>
      <label class="field"><span>${panel.t("photoUrlLabel")}</span><input id="f-photo" placeholder="${panel.t("photoUrlPlaceholder")}" value="${esc(editItem?.photo ?? prefill.photo ?? "")}"></label>
    </div>
    ${!isEdit && prefill.barcode ? `<p class="location-help">${panel.t('scannedBarcode')}: ${esc(prefill.barcode)}</p><label class="date-type-check"><input type="checkbox" id="f-remember-barcode" checked><span>${panel.t('rememberBarcode')}</span></label><p class="date-type-help">${panel.t('rememberBarcodeHelp')}</p>` : ''}
    <div class="modal-actions">
      <button class="btn ghost" id="f-template">${panel.t("chooseTemplateBtn")}</button>
      <button class="btn ghost" id="f-create-template">${panel.t("createTemplateBtn")}</button>
      <button class="btn primary" id="f-submit">${isEdit ? panel.t("saveBtn") : panel.t("addBtn")}</button>
    </div>
  `, { wide: false });

  const q = (s) => h.modal.querySelector(s);
  const nameEl = q("#f-name"), addedEl = q("#f-added"), expEl = q("#f-expiry");
  const emojiEl = q("#m-emoji"), suggestEl = q("#f-suggest"), hintEl = q("#f-hint");
  const lang = panel._lang();
  let countManual = isEdit;
  const syncCount = () => {
    const counted = q('#f-counted').checked;
    q('#f-count-wrap').classList.toggle('hidden', !counted);
    q('#f-portions-wrap')?.classList.toggle('hidden', counted);
    if (counted) { m.portions = 1; if(q('#ps-n')) q('#ps-n').textContent = '1'; if(q('#ps-minus')) q('#ps-minus').disabled = true; }
  };
  q('#f-counted').onchange = () => { countManual = true; syncCount(); };
  syncCount();
  let labelNoteManual = (isEdit && editItem.label_note != null) || prefill.label_note != null;
  const applyLabelNote = template => { q('#f-label-note-reset').disabled=!template; if (!labelNoteManual) q('#f-label-note').value = template?.label_note || ''; };
  q('#f-label-note').addEventListener('input',()=>{labelNoteManual=true;});
  q('#f-label-note-reset').onclick=()=>{labelNoteManual=false;applyLabelNote(panel._state.templates.find(t=>t.id===m.template_id));};
  applyLabelNote(panel._state.templates.find(t=>t.id===m.template_id));


  const setEmoji = (e) => { m.emoji = e; emojiEl.textContent = e; if (q("#f-emojiin")) q("#f-emojiin").value = e; };
  const setCategory = (category, force = false) => {
    if (force || !m.categoryManual) m.category = fillCategorySelect(panel, q("#f-category"), m.kind, category, isEdit && m.kind === editItem.kind ? editItem.category : null);
  };
  const setKind = (k) => {
    if (!k) return;
    m.kind = k;
    m.category = fillCategorySelect(panel, q("#f-category"), m.kind, m.category, isEdit && m.kind === editItem.kind ? editItem.category : null);
    const ke = q("#f-kind");
    if (ke) ke.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.kind === k));
  };
  m.category = fillCategorySelect(panel, q("#f-category"), m.kind, m.category, isEdit && m.kind === editItem.kind ? editItem.category : null);
  const updateHint = () => {
    const val = expEl.value;
    if (!val) { hintEl.textContent = ""; return; }
    const dl = daysBetween(todayISO(), val);
    const col = dl < 0 ? "var(--fa-red)" : dl <= (panel._state.options.warn_days || 3) ? "var(--fa-orange)" : "var(--fa-green)";
    hintEl.innerHTML = `<span style="color:${col}">● ${daysLabel(dl, lang, m.dateType)}</span>`;
  };
  const setDateType = type => {
    m.dateType = type || "use_by";
    q("#f-date-type").checked = m.dateType === "best_before";
    q("#f-date-label").textContent = panel.t(m.dateType === "best_before" ? "bestBeforeLabel" : "useByLabel");
    q('#f-month-label').textContent = panel.t(m.dateType === 'best_before' ? 'bestBeforeLabel' : 'useByLabel');
    updateHint();
  };
  q("#f-date-type").addEventListener("change", e => { m.dateTypeManual = true; setDateType(e.target.checked ? "best_before" : "use_by"); });
  updateHint();
  panel._wireDateField(addedEl, panel.t("datePickPlaceholder"), lang);
  panel._wireDateField(expEl, panel.t("dateOptionalPlaceholder"), lang);

  const precisionEl = q('#f-date-precision'), monthEl = q('#f-expiry-month');
  const syncPrecision = () => {
    const monthly = m.expiryPrecision === 'month';
    precisionEl.value = m.expiryPrecision;
    expEl.closest('label').classList.toggle('hidden', monthly);
    q('#f-month-wrap').classList.toggle('hidden', !monthly);
    monthEl.value = expEl.value.slice(0, 7);
    q('#f-month-hint').classList.toggle('hidden', !monthly || !expEl.value);
    q('#f-month-hint').textContent = monthly && expEl.value ? panel.t('monthDeadline') + ' ' + new Intl.DateTimeFormat(lang === 'nl' ? 'nl-NL' : 'en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(expEl.value+'T00:00:00Z')) : '';
  };
  precisionEl.onchange = () => {
    m.expiryPrecision = precisionEl.value;
    if (m.expiryPrecision === 'month' && expEl.value) expEl.value = monthEnd(expEl.value.slice(0,7));
    expEl.dispatchEvent(new Event('input')); syncPrecision();
  };
  monthEl.oninput = () => { expEl.value = monthEnd(monthEl.value); expEl.dispatchEvent(new Event('input')); syncPrecision(); };
  syncPrecision();

  const applySuggestion = (expiryDate, source) => {
    const proposal = q("#f-expiry-suggestion");
    if (m.expiryLocked || m.expiryManual) {
      proposal.classList.toggle("hidden", !expiryDate || expiryDate === expEl.value);
      proposal.innerHTML = expiryDate && expiryDate !== expEl.value
        ? `<p>${panel.t("suggestedExpiry")}: <b>${esc(expiryDate)}</b><br>${panel.t("keepExpiry")}</p><button type="button" class="btn ghost" id="accept-expiry">${panel.t("useSuggestedExpiry")}</button>` : "";
      proposal.querySelector("#accept-expiry")?.addEventListener("click", () => {
        m.expiryPrecision = "day";
        expEl.value = expiryDate; syncPrecision(); m.expiry = expiryDate; m.expiryManual = false;
        m.expiryLocked = true; m.expirySource = source;
        proposal.classList.add("hidden"); updateHint();
      });
    } else {
      expEl.value = expiryDate || ""; m.expiry = expEl.value;
      m.expirySource = expiryDate ? source : "none";
      proposal.classList.add("hidden");
    }
    updateHint();
  };

  const aiCtx = () => ({ m, q, setEmoji, setKind, setCategory, applySuggestion, suggestEl });
  const wireActions = (query) => {
    const a = q("#s-ai");
    if (a) a.addEventListener("click", () => aiEstimate(panel, query, aiCtx()));
    const o = q("#s-other");
    if (o) o.addEventListener("click", () =>
      panel._openTemplatePicker((t) => { m.noAutoMatch = false; nameEl.value = t.name; doMatch(); }));
  };

  // Shown when nothing matched, or after the user rejected a wrong guess.
  const showManual = (query, heading) => {
    m.template_id = null; applyLabelNote(null); setCategory(null);
    suggestEl.className = "suggest";
    const aiBtn = panel._state.options.ai_enabled
      ? `<button class="s-mini ai" id="s-ai">${panel.t("aiEstimateMini")}</button>` : "";
    suggestEl.innerHTML = `
      <div class="s-body"><b>${heading || panel.t("unknownProduct")}</b>
        <div class="s-sub">${esc(panel.t("noTemplateFor", query, panel._state.options.ai_enabled))}</div></div>
      <div class="s-actions">${aiBtn}<button class="s-mini" id="s-other" title="${panel.t("chooseTemplateTitle")}"><ha-icon icon="mdi:book-multiple"></ha-icon></button></div>`;
    wireActions(query);
  };

  let lastMatched = null;
  let chosenTemplateId = prefill.barcode ? prefill.template_id : null;
  let matchVersion = 0;
  const matchNow = async () => {
    const version = ++matchVersion;
    const location = m.location, addedDate = addedEl.value;
    const query = nameEl.value.trim();
    if (m.noAutoMatch) return;
    if (query.length < 2) { suggestEl.innerHTML = ""; suggestEl.className = "suggest"; return; }
    lastMatched = query;
    let res;
    try {
      const pinned = chosenTemplateId
        ? panel._state.templates.find(t => t.id === chosenTemplateId) : null;
      if (pinned) {
        const days = pinned.shelf_life?.[panel._storageType(location)];
        res = {template:pinned, suggestion:{expiry_date:days ? addDays(addedDate,days) : null}};
      } else res = await panel._call("match_template", { query, location, added_date: addedDate });
    }
    catch (e) { return; }
    if (m.noAutoMatch) return; // rejected while the request was in flight
    // Out-of-order responses: an older, slower reply must never overwrite
    // the match for what's in the field NOW ("kip" landing after "kipfilet").
    if (version !== matchVersion || nameEl.value.trim() !== query || m.location !== location || addedEl.value !== addedDate) return;
    if (res.template) {
      const t = res.template;
      if (!m.dateTypeManual) setDateType(t.date_type);
      m.template_id = t.id; applyLabelNote(t);
      if (!countManual) { q('#f-counted').checked = t.stock_mode === 'count'; syncCount(); }
      if (!m.kindManual) setKind(panel._kindOf(t));
      setCategory(t.category); setEmoji(t.emoji || "🍽️");
      const sl = t.shelf_life || {};
      const noHere = sl[panel._storageType(m.location)] === null || sl[panel._storageType(m.location)] === undefined;
      applySuggestion(res.suggestion?.expiry_date, "template");
      suggestEl.className = "suggest ok";
      suggestEl.innerHTML = `
        <button type="button" class="s-take" id="s-take" title="${panel.t("useTemplateNameTitle")}">
          <span class="s-emoji">${t.emoji || "📋"}</span>
          <div class="s-body"><b>${esc(t.name)}</b>
            <div class="s-sub">${noHere ? panel.t("notSuitableHere") : esc(panel.t("daysAtLocation", panel._locMeta(m.location).label, sl[panel._storageType(m.location)]))}${t.notes ? " · " + esc(t.notes) : ""}</div></div>
        </button>
        <div class="s-actions">
          ${panel._state.options.ai_enabled ? `<button class="s-mini" id="s-ai" title="${panel.t("aiEstimateTitle")}"><ha-icon icon="mdi:creation"></ha-icon></button>` : ""}
          <button class="s-mini" id="s-other" title="${panel.t("otherTemplateTitle")}"><ha-icon icon="mdi:book-multiple"></ha-icon></button>
          <button class="s-mini ghost" id="s-dismiss" title="${panel.t("notThisManualTitle")}"><ha-icon icon="mdi:close"></ha-icon></button>
        </div>`;
      wireActions(query);
      // Tap the recognised template to adopt its (full) name — handy when
      // the match appeared while the user was still halfway through typing.
      q("#s-take").addEventListener("click", () => {
        nameEl.value = t.name;
        lastMatched = t.name;
        nameEl.focus();
        nameEl.setSelectionRange(t.name.length, t.name.length);
      });
      const d = q("#s-dismiss");
      if (d) d.addEventListener("click", () => {
        m.noAutoMatch = true; m.expiryManual = true; m.expiryLocked = true; m.expirySource = "manual";
        setEmoji("🍽️"); expEl.value = ""; m.expiry = ""; updateHint();
        showManual(query, panel.t("manualEntry"));
      });
    } else {
      if (!m.dateTypeManual) setDateType("use_by");
      applySuggestion(null, "none");
      showManual(query);
    }
  };
  const doMatch = debounce(matchNow, 350);

  nameEl.addEventListener("input", () => { chosenTemplateId = null; doMatch(); });
  // Enter = add straight away, but let a fresh match land first so the
  // template's expiry date still comes along.
  nameEl.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!nameEl.value.trim()) return;
    if (!m.noAutoMatch && nameEl.value.trim() !== lastMatched) await matchNow();
    q("#f-submit").click();
  });
  q("#m-close").addEventListener("click", h.close);
  q("#f-loc").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.loc !== editItem?.location && panel._locMeta(b.dataset.loc).archived) return;
      m.location = b.dataset.loc; ++matchVersion;
      q("#f-expiry-suggestion").classList.add("hidden");
      q("#f-loc").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (m.aiResult) {
        h.modal.querySelectorAll(".ai-loc").forEach(cell => cell.classList.toggle("active", cell.dataset.loccell === panel._storageType(m.location)));
        const days = m.aiResult.shelf_life[panel._storageType(m.location)];
        applySuggestion(days != null ? addDays(addedEl.value, days) : null, "ai");
      } else doMatch();
    })
  );
  q("#f-kind").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { m.kindManual = true; setKind(b.dataset.kind); }));
  const psMinus = q("#ps-minus"), psPlus = q("#ps-plus"), psN = q("#ps-n");
  const setPortions = (n) => {
    m.portions = Math.max(1, Math.min(24, n));
    if (psN) psN.textContent = m.portions;
    if (psMinus) psMinus.disabled = m.portions <= 1;
    if (psPlus) psPlus.disabled = m.portions >= 24;
  };
  if (psMinus) psMinus.addEventListener("click", () => setPortions(m.portions - 1));
  if (psPlus) psPlus.addEventListener("click", () => setPortions(m.portions + 1));
  addedEl.addEventListener("change", () => { ++matchVersion; if (m.aiResult) { const d = m.aiResult.shelf_life[panel._storageType(m.location)]; applySuggestion(d != null ? addDays(addedEl.value, d) : null, "ai"); } else doMatch(); });
  expEl.addEventListener("input", () => { m.expiryManual = true; m.expiryLocked = true; m.expirySource = "manual"; q("#f-expiry-suggestion").classList.add("hidden"); m.expiry = expEl.value; updateHint(); });
  q("#f-adv").addEventListener("click", () => {
    const box = q("#f-advbox"); box.classList.toggle("hidden");
    q("#f-adv").textContent = box.classList.contains("hidden") ? panel.t("moreOptions") : panel.t("lessOptions");
  });
  if (q("#f-emojiin")) q("#f-emojiin").addEventListener("input", (e) => setEmoji(e.target.value || "🍽️"));
  q("#f-category").addEventListener("change", () => {
    m.categoryManual = true; setCategory(q("#f-category").value, true);
  });
  q("#f-create-template").addEventListener("click", () => {
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); return; }
    // Prevent pending recognition from overwriting an explicitly created link.
    ++matchVersion;
    const seed = { name, emoji: m.emoji, kind: m.kind, category: m.category || "other",
      stock_mode:q('#f-counted').checked ? 'count' : 'packs',
      date_type: m.dateType, shelf_life: { ...(m.aiResult?.shelf_life || {}) }, aliases: [], notes: "", label_note:q("#f-label-note").value.trim() };
    panel._openTemplateEditor(seed, true, template => {
      if (!template || !h.modal.isConnected) return;
      ++matchVersion; m.noAutoMatch = true; m.aiResult = null;
      if (!countManual) { q('#f-counted').checked = template.stock_mode === 'count'; syncCount(); }
      m.template_id = template.id; nameEl.value = template.name; applyLabelNote(template);
      m.kindManual = true; setKind(template.kind);
      m.categoryManual = true; setCategory(template.category, true); setEmoji(template.emoji || m.emoji);
      if (!m.dateTypeManual) setDateType(template.date_type);
      const days = template.shelf_life?.[panel._storageType(m.location)];
      applySuggestion(days != null ? addDays(addedEl.value, days) : null, "template");
      suggestEl.className = "suggest ok";
      suggestEl.textContent = `${panel.t("createdTemplateLinked")}: ${template.name}`;
    });
  });
  q("#f-template").addEventListener("click", () =>
    panel._openTemplatePicker((t) => { chosenTemplateId = t.id; m.noAutoMatch = false; nameEl.value = t.name; doMatch(); })
  );

  q("#f-submit").addEventListener("click", async () => {
    if (!m.category) { panel._toast(panel.t("noKindCategories"), {type:"bad"}); return; }
    const dispName = (q("#f-dispname")?.value || "").trim();
    const payload = {
      name: dispName || nameEl.value.trim(),
      contents: nameEl.value.trim(),
      location: m.location,
      added_date: addedEl.value || todayISO(),
      date_type: m.dateType,
      expiry_precision: m.expiryPrecision,
      expiry_date: expEl.value || null,
      expiry_source: m.expiryManual ? "manual" : (m.expirySource || (expEl.value ? "manual" : "none")),
      emoji: m.emoji,
      category: m.category,
      kind: m.kind,
      template_id: m.template_id,
      quantity: (q("#f-qty")?.value || "").trim() || null,
      notes: (q("#f-notes")?.value || "").trim() || null,
      photo: (q("#f-photo")?.value || "").trim() || null,
      barcode: (editItem?.barcode ?? prefill.barcode) || null,
    };
    if (!isEdit) payload.portions = m.portions;
    if (!payload.contents) { nameEl.focus(); return; }
    q("#f-submit").disabled = true;
    try {
      if (!m.aiResult && !m.noAutoMatch) await matchNow();
      payload.label_note = isEdit || labelNoteManual ? q("#f-label-note").value.trim() : null;
      payload.date_type = m.dateType;
      payload.expiry_precision = m.expiryPrecision;
      payload.expiry_date = expEl.value || null;
      payload.expiry_source = m.expiryManual ? "manual" : m.expirySource;
      payload.stock_count = q('#f-counted').checked ? Number(q('#f-stock-count').value) : null;
      if (payload.stock_count !== null && (!Number.isInteger(payload.stock_count) || payload.stock_count < 1 || payload.stock_count > 1000000)) throw new Error(panel.t('stockInvalid'));
      if (!isEdit && payload.stock_count !== null) payload.portions = 1;
      payload.template_id = m.template_id;
      if (!isEdit) payload.remember_barcode = !!(q("#f-remember-barcode")?.checked && m.template_id);
      payload.location = m.location;
      payload.added_date = addedEl.value || todayISO();
      payload.emoji = m.emoji; payload.category = m.category; payload.kind = m.kind;
      if (isEdit) {
        await panel._call("update_item", { item_id: editItem.id, changes: payload });
        h.close();
        panel._toast(panel.t("savedToast"));
      } else {
        // Save AI result as a template if the user opted in.
        const saveTpl = h.modal.querySelector("#s-savetpl");
        if (m.aiResult && (!saveTpl || saveTpl.checked)) {
          const created = m.savedAiTemplate || await panel._call("add_template", {
            template: {
              name: nameEl.value.trim(),
              category: m.category || m.aiResult.category,
              kind: m.kind || m.aiResult.kind,
              emoji: m.aiResult.emoji,
              icon: m.aiResult.icon,
              date_type: m.dateType,
              shelf_life: m.aiResult.shelf_life,
              label_note: labelNoteManual ? q("#f-label-note").value.trim() : "",
              notes: m.aiResult.notes,
              stock_mode:q("#f-counted").checked ? "count" : "packs",
              source: "ai",
            },
          });
          m.savedAiTemplate = created;
          payload.template_id = created.template.id;
          payload.remember_barcode = !!q("#f-remember-barcode")?.checked;
        }
        const res = await panel._call("add_item", { item: payload });
        h.close();
        const code = res?.item?.code;
        if (panel._state.options.printer_enabled && res?.item) {
          // Label printing is on -> jump straight into the print flow, so
          // nobody has to hunt the fresh item down in the list.
          panel._toast(panel.t("addedToast", code));
          panel._printSticker(res.item.id, res.item);
        } else {
          panel._toast(panel.t("addedToast", code), {
            actionLabel: panel.t("printActionLabel"), onAction: () => panel._printSticker(res.item.id),
          });
        }
      }
    } catch (e) {
      q("#f-submit").disabled = false;
      panel._toast(panel.t("errorPrefix") + esc(e.message || e), { type: "bad" });
    }
  });

  // A scanned product prefills advanced fields — open the box so they show.
  if (!isEdit && (prefill.quantity || prefill.notes || prefill.photo)) {
    q("#f-advbox").classList.remove("hidden");
    q("#f-adv").textContent = panel.t("lessOptions");
  }

  setTimeout(() => nameEl.focus(), 60);
  if (nameVal) doMatch();
}

export async function aiEstimate(panel, name, ctx) {
  const { m, setEmoji, setKind, suggestEl } = ctx;
  const lang = panel._lang();
  suggestEl.className = "suggest";
  suggestEl.innerHTML = `<div class="s-body"><b>${panel.t("aiThinking")}</b><div class="s-sub">${esc(panel.t("estimatingFor", name))}</div></div><div class="spinner"></div>`;
  let res;
  try { res = await panel._call("estimate", { name }); }
  catch (e) {
    suggestEl.className = "suggest bad";
    suggestEl.innerHTML = `<div class="s-body"><b>${panel.t("aiFailed")}</b><div class="s-sub">${esc(e.message || e)}</div></div>`;
    return;
  }
  const est = res.estimate;
  m.aiResult = est;
  if (!m.kindManual && setKind) setKind(est.kind);
  if (ctx.setCategory) ctx.setCategory(est.category); else if (!m.categoryManual) m.category = est.category;
  setEmoji(est.emoji || "✨");
  const addedEl = ctx.addedEl || suggestEl.parentNode.querySelector("#f-added");
  const expEl = ctx.expEl || suggestEl.parentNode.querySelector("#f-expiry");
  const hintEl = suggestEl.parentNode.querySelector("#f-hint");
  const warn = panel._state.options.warn_days || 3;

  // Recompute the expiry date + hint from the (possibly edited) AI days.
  const recompute = () => {
    const days = m.aiResult.shelf_life[panel._storageType(m.location)];
    ctx.applySuggestion(days != null ? addDays(addedEl.value, days) : null, "ai");
    if (hintEl) {
      if (expEl.value) {
        const dl = daysBetween(todayISO(), expEl.value);
        const col = dl < 0 ? "var(--fa-red)" : dl <= warn ? "var(--fa-orange)" : "var(--fa-green)";
        hintEl.innerHTML = `<span style="color:${col}">● ${daysLabel(dl, lang, m.dateType)}</span>`;
      } else hintEl.innerHTML = "";
    }
  };

  const cell = (loc) => {
    const d = est.shelf_life[loc];
    const lm = panel._storageMeta(loc);
    return `<div class="ai-loc ${loc === panel._storageType(m.location) ? "active" : ""}" data-loccell="${loc}">
      <span class="ai-loc-emoji">${lm.emoji}</span>
      <span class="ai-days-wrap"><input class="ai-days" type="number" inputmode="numeric" min="0" max="3650" step="1" data-loc="${loc}" value="${d ?? ""}" placeholder="—"><i>${panel.t("dayUnitShort")}</i></span>
      <small>${esc(lm.label)}</small>
    </div>`;
  };

  suggestEl.className = "suggest ai";
  suggestEl.innerHTML = `
    <div class="ai-head"><span class="s-emoji">${est.emoji || "✨"}</span><b>${panel.t("aiEstimateTitle")}</b><span class="s-badge ai">AI · ${esc(res.estimate.provider || "")}</span></div>
    <div class="ai-sub">${panel.t("aiHint")}</div>
    <div class="ai-locs">${(panel._state.storage_types || ["fridge", "freezer", "pantry"]).map(cell).join("")}</div>
    ${est.notes ? `<div class="s-sub">💡 ${esc(est.notes)}</div>` : ""}
    <label class="checkline"><input type="checkbox" id="s-savetpl" checked> ${panel.t("saveAsTemplateLabel")}</label>
  `;
  suggestEl.querySelectorAll(".ai-days").forEach((inp) =>
    inp.addEventListener("input", () => {
      const raw = inp.value.trim();
      const v = raw === "" ? null : Math.min(3650, Math.max(0, parseInt(raw, 10) || 0));
      m.aiResult.shelf_life[inp.dataset.loc] = v && v > 0 ? v : null;
      recompute();
    })
  );
  recompute();
}
