/* Focused, paginated ingredient mapping administration. */
import { esc } from "../lib/format.js?v=0.10.0b20";

export function mappingPage(data, { query = "", source = "unmapped", usedOnly = true, page = 0 } = {}) {
  const templates = new Map(data.templates.map(t => [t.id, t.name]));
  const scope = data.foods.filter(f => !usedOnly || f.used_in_recipes);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = scope.filter(f => (source === "all" || f.source === source)
    && `${f.name} ${templates.get(f.template_id) || ""}`.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { rows: filtered.slice(current * 25, current * 25 + 25), page: current, pages,
    total: filtered.length, review: scope.filter(f => f.source === "unmapped").length, templates };
}

export function recipeMappingData(data, foodIds) {
  const ids = new Set(foodIds);
  return {...data, foods:data.foods.filter(food => ids.has(food.id))};
}

export function openMealieMappings(panel, getData, save, {recipeName = null} = {}) {
  const h = panel._openModal(`<div class="modal-head"><h3>${panel.t("mealieMappings")}</h3><button class="icon-btn" id="mm-close" aria-label="${panel.t("closeBtn")}">×</button></div>
    ${recipeName ? `<p class="location-help">${esc(panel.t("mappingRecipeScope", recipeName))}</p>` : ""}
    <label class="field"><span>${panel.t("mappingSearch")}</span><input id="mm-search" type="search"></label>
    <label class="field"><span>${panel.t("mappingStatus")}</span><select id="mm-source"><option value="unmapped">${panel.t("mappingReview")}</option><option value="exact">${panel.t("mappingExact")}</option><option value="saved">${panel.t("mappingSaved")}</option><option value="all">${panel.t("mappingAll")}</option></select></label>
    <label class="field" ${recipeName ? "hidden" : ""}><span>${panel.t("mappingScope")}</span><select id="mm-scope"><option value="used">${panel.t("mappingUsed")}</option><option value="all">${panel.t("mappingCatalogue")}</option></select></label>
    <p id="mm-count" role="status"></p><div id="mm-rows"></div>
    <div class="mapping-pager"><button class="btn ghost" id="mm-prev">${panel.t("mappingPrevious")}</button><span id="mm-page"></span><button class="btn ghost" id="mm-next">${panel.t("mappingNext")}</button></div>`);
  const q = s => h.modal.querySelector(s);
  let page = 0;
  const currentPage = () => mappingPage(getData(), {query:q("#mm-search").value,source:q("#mm-source").value,usedOnly:q("#mm-scope").value === "used",page});
  const render = () => {
    if (!h.modal.isConnected) return;
    const result = mappingPage(getData(), { query: q("#mm-search").value, source: q("#mm-source").value, usedOnly: q("#mm-scope").value === "used", page });
    page = result.page;
    q("#mm-count").textContent = `${panel.t("mappingReview")}: ${result.review} · ${panel.t("mappingResults")}: ${result.total}`;
    q("#mm-page").textContent = `${page + 1} / ${result.pages}`;
    q("#mm-prev").disabled = page === 0; q("#mm-next").disabled = page + 1 === result.pages;
    q("#mm-rows").innerHTML = result.rows.map((f, index) => `<div class="mapping-row"><div><b>${esc(f.name)}</b><p>→ ${esc(result.templates.get(f.template_id) || panel.t("mappingUnlinked"))}</p>${q("#mm-source").value === "all" ? `<small>${panel.t(f.source === "saved" ? "mappingSaved" : f.source === "exact" ? "mappingExact" : "mappingReview")}</small>` : ""}</div><div class="location-actions"><button class="btn ghost" data-change="${index}">${panel.t(f.source === "unmapped" ? "mappingLinkExisting" : "mappingChange")}</button>${f.source === "unmapped" ? `<button class="btn primary" data-create="${index}">${panel.t("createTemplateBtn")}</button>` : ""}</div></div>`).join("") || `<p>${panel.t("mappingEmpty")}</p>`;
    q("#mm-rows").querySelectorAll("[data-change]").forEach(button => button.addEventListener("click", () => openPicker(result.rows[Number(button.dataset.change)])));
    q("#mm-rows").querySelectorAll("[data-create]").forEach(button => button.addEventListener("click", () => createTemplate(result.rows[Number(button.dataset.create)])));
  };
  const createTemplate = food => {
    const candidates = currentPage().rows.filter(f => f.source === "unmapped" && f.id !== food.id);
    const nextId = candidates.find(f => f.name.localeCompare(food.name) > 0)?.id || candidates[0]?.id;
    panel._openTemplateEditor({name:food.name, kind:"ingredient", category:"other", shelf_life:{}, aliases:[], notes:""}, true, (_template,next) => {
      render();
      if (next && h.modal.isConnected) {
        const following = getData().foods.find(f => f.id === nextId && f.source === "unmapped") || currentPage().rows.find(f => f.source === "unmapped" && f.id !== food.id);
        if (following) createTemplate(following);
        else panel._toast(panel.t("mappingQueueDone"));
      }
    }, {afterSave: async template => {
      const linked = await save(food.id,template.id);
      if (linked) { panel._state = await panel._call("get_state"); panel._onState(); }
      return linked;
    }});
  };
  const openPicker = food => {
    const picker = panel._openModal(`<div class="modal-head"><h3>${esc(food.name)}</h3><button class="icon-btn" id="mp-close" aria-label="${panel.t("closeBtn")}">×</button></div>
      <label class="field"><span>${panel.t("mappingTemplateSearch")}</span><input id="mp-search" type="search"></label>
      <button class="btn ghost" id="mp-auto">${panel.t("mealieAutomatic")}</button><p id="mp-status" role="status"></p><div id="mp-rows"></div>
      <div class="mapping-pager"><button class="btn ghost" id="mp-prev">${panel.t("mappingPrevious")}</button><span id="mp-page"></span><button class="btn ghost" id="mp-next">${panel.t("mappingNext")}</button></div>`);
    const p = s => picker.modal.querySelector(s);
    let index = 0, saving = false;
    const choose = async template => {
      if (saving) return;
      saving = true; draw(); p("#mp-status").textContent = panel.t("mealieWorking");
      try {
        if (await save(food.id, template)) { picker.close(); render(); }
        else p("#mp-status").textContent = panel.t("mappingSaveFailed");
      } finally { saving = false; if (picker.modal.isConnected) draw(); }
    };
    const draw = () => {
      const needle = p("#mp-search").value.trim().toLocaleLowerCase();
      const templates = getData().templates.filter(t => t.name.toLocaleLowerCase().includes(needle)).sort((a,b) => a.name.localeCompare(b.name));
      const pages = Math.max(1, Math.ceil(templates.length / 25)); index = Math.min(index, pages - 1);
      const rows = templates.slice(index * 25, index * 25 + 25);
      p("#mp-page").textContent = `${index + 1} / ${pages}`;
      p("#mp-prev").disabled = saving || index === 0; p("#mp-next").disabled = saving || index + 1 === pages;
      p("#mp-auto").disabled = saving;
      p("#mp-rows").innerHTML = rows.map((t, n) => `<button class="btn ghost mapping-choice" data-template="${n}" ${saving ? "disabled" : ""}>${esc(t.name)}${t.id === food.template_id ? " ✓" : ""}</button>`).join("") || `<p>${panel.t("mappingEmpty")}</p>`;
      p("#mp-rows").querySelectorAll("[data-template]").forEach(button => button.addEventListener("click", () => choose(rows[Number(button.dataset.template)].id)));
    };
    p("#mp-close").addEventListener("click", picker.close);
    p("#mp-auto").addEventListener("click", () => choose(null));
    p("#mp-search").addEventListener("input", () => { index = 0; draw(); });
    p("#mp-prev").addEventListener("click", () => { index--; draw(); });
    p("#mp-next").addEventListener("click", () => { index++; draw(); });
    draw();
  };
  q("#mm-close").addEventListener("click", h.close);
  for (const id of ["#mm-search", "#mm-source", "#mm-scope"]) q(id).addEventListener(id === "#mm-search" ? "input" : "change", () => { page = 0; render(); });
  q("#mm-prev").addEventListener("click", () => { page--; render(); });
  q("#mm-next").addEventListener("click", () => { page++; render(); });
  render();
}
