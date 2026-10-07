/* Mealie recipe presence, use-first ranking and saved food mappings. */
import { esc } from "../lib/format.js?v=0.10.0b5";

export async function openMealie(panel, container) {
  const markup = `
    <div class="modal-head"><div class="m-title"><h3>${panel.t("mealieTitle")}</h3></div>
    <button class="btn ghost" id="mr-manage">${panel.t("mealieManage")}</button>
    <button class="icon-btn" id="mr-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("mealiePresence")}</p>
    <p id="mr-status" role="status"></p>
    <div id="mr-controls" hidden><div class="modal-actions"><button class="btn ghost" id="mr-config">${panel.t("mealieConfigure")}</button><button class="btn ghost" id="mr-test">${panel.t("mealieTest")}</button><button class="btn primary" id="mr-sync">${panel.t("mealieSync")}</button></div></div>
    <label class="field"><span>${panel.t("mealieSearch")}</span><input id="mr-search" type="search"></label>
    <label class="field"><span>${panel.t("mealieFilter")}</span><select id="mr-filter"><option value="all">${panel.t("mealieAll")}</option><option value="ready">${panel.t("mealieReady")}</option><option value="near">${panel.t("mealieNear")}</option></select></label>
    <div id="mr-list"></div>
    <div id="mr-management" hidden><details id="mr-pending"><summary id="mr-pending-title"></summary><p class="location-help">${panel.t("mealieParseHelp")}</p><div id="mr-pending-list"></div></details>
    <details><summary>${panel.t("mealieMappings")}</summary><div id="mr-mappings"></div></details></div>
  `;
  const h = container ? { modal: container, close() {} } : panel._openModal(markup);
  if (container) container.innerHTML = markup;
  const q = s => h.modal.querySelector(s);
  let data = { status: {}, recipes: [], foods: [], templates: [], needs_parsing: [] }, busy = false, closed = false;
  const close = () => { closed = true; h.close(); };
  q("#mr-close").hidden = !!container;
  q("#mr-close").addEventListener("click", close);
  q("#mr-manage").addEventListener("click", () => {
    const hidden = !q("#mr-controls").hidden;
    q("#mr-controls").hidden = hidden; q("#mr-management").hidden = hidden;
    q("#mr-manage").setAttribute("aria-expanded", String(!hidden));
  });
  const render = () => {
    if (closed || !h.modal.isConnected) return;
    const status = data.status;
    q("#mr-test").disabled = busy || !status.configured;
    q("#mr-sync").disabled = busy || !status.configured;
    q("#mr-status").textContent = !status.configured ? panel.t("mealieSetup")
      : busy ? panel.t("mealieWorking")
      : `${panel.t("mealieRecipes")}: ${status.recipe_count || 0} · ${status.last_sync ? new Date(status.last_sync).toLocaleString() : panel.t("mealieNever")}${status.error ? " · " + panel.t("mealieStale") : ""}`;
    const query = q("#mr-search").value.trim().toLocaleLowerCase();
    const filter = q("#mr-filter").value;
    const recipes = data.recipes.filter(r => r.name.toLocaleLowerCase().includes(query)
      && (filter === "all" || (filter === "ready" ? r.all_present : !r.unresolved.length && r.missing.length > 0 && r.missing.length <= 2)));
    q("#mr-list").className = "recipe-grid";
    q("#mr-list").innerHTML = recipes.map((r, index) => `<button class="recipe-tile" data-recipe="${index}">
      <div class="recipe-photo"><span aria-hidden="true">🍽️</span><img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>
      <div class="recipe-tile-body"><b>${esc(r.name)}</b><p>${r.all_present ? panel.t("mealieReady") : `${r.missing.length} ${panel.t("mealieMissing")} · ${r.unresolved.length} ${panel.t("mealieReview")}`}</p>
      ${r.due_soon_count ? `<p>${panel.t("mealieUseSoon")}: ${r.due_soon_count}</p>` : ""}
      ${r.matched.some(i => i.thaw) ? `<p>${panel.t("mealieThaw")}</p>` : ""}
      ${r.matched.some(i => i.past_best_before) ? `<p>${panel.t("mealiePastBest")}</p>` : ""}</div></button>`).join("")
      || `<p class="location-help">${panel.t("mealieEmpty")}</p>`;
    q("#mr-list").querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    q("#mr-list").querySelectorAll("[data-recipe]").forEach(button => button.addEventListener("click", () => {
      const r = recipes[Number(button.dataset.recipe)];
      const detail = panel._openModal(`<div class="modal-head"><h3>${esc(r.name)}</h3><button class="icon-btn" id="recipe-close" aria-label="${panel.t("closeBtn")}">×</button></div>
        <p class="location-help">${panel.t("mealiePresence")}</p>
        ${r.matched.map(i => `<p>${esc(i.ingredient)} — ${esc(i.name)}${i.days !== null ? ` · ${i.days} ${panel.t("mealieDays")}` : ""}${i.past_best_before ? ` · ${panel.t("mealiePastBest")}` : ""}${i.thaw ? ` · ${panel.t("mealieThaw")}` : ""}</p>`).join("")}
        ${r.missing.length ? `<p>${panel.t("mealieMissing")}: ${esc(r.missing.join(", "))}</p>` : ""}
        ${r.unresolved.length ? `<p>${panel.t("mealieReview")}: ${esc(r.unresolved.join(", "))}</p>` : ""}
        <a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${panel.t("mealieOpen")}</a>`);
      detail.modal.querySelector("#recipe-close").addEventListener("click", detail.close);
    }));
    const pending = data.needs_parsing || [];
    q("#mr-pending").hidden = !pending.length;
    q("#mr-pending-title").textContent = `${panel.t("mealieNeedsParsing")} (${pending.length})`;
    q("#mr-pending-list").innerHTML = pending.map(r => `<p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a></p>`).join("");
    q("#mr-mappings").innerHTML = data.foods.map(f => `<label class="field"><span>${esc(f.name)} · ${panel.t(f.source === "saved" ? "mealieSaved" : f.source === "exact" ? "mealieExact" : "mealieReview")}</span>
      <select data-food="${esc(f.id)}" ${busy ? "disabled" : ""}><option value="">${panel.t("mealieAutomatic")}${f.source === "exact" ? ` — ${esc(data.templates.find(t => t.id === f.template_id)?.name || "")}` : ""}</option>${data.templates.map(t => `<option value="${esc(t.id)}" ${f.source === "saved" && f.template_id === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>`).join("");
    q("#mr-mappings").querySelectorAll("select").forEach(select => select.addEventListener("change", () => load("map", { food_id: select.dataset.food, template_id: select.value || null })));

  };
  const load = async (action, extra = {}) => {
    if (busy) return;
    busy = true; render();
    try {
      const result = await panel._call("mealie", { action, ...extra });
      if (closed || !h.modal.isConnected) return;
      data = result;
      if (action === "test") panel._toast(panel.t("mealieConnected"));
    } catch (error) { if (!closed && h.modal.isConnected) panel._toast(error.message || String(error), { type: "bad" }); }
    finally { busy = false; render(); }
  };
  q("#mr-config").addEventListener("click", () => {
    history.pushState(null, "", "/config/integrations/integration/fridge_assistant");
    window.dispatchEvent(new CustomEvent("location-changed"));
  });
  q("#mr-search").addEventListener("input", render);
  q("#mr-filter").addEventListener("change", render);
  q("#mr-test").addEventListener("click", () => load("test"));
  q("#mr-sync").addEventListener("click", () => load("sync"));
  if (container) panel._refreshRecipes = () => load("list");
  await load("list");
}
