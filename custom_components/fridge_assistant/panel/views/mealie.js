/* Mealie recipe presence, use-first ranking and saved food mappings. */
import { esc } from "../lib/format.js";

export async function openMealie(panel) {
  const h = panel._openModal(`
    <div class="modal-head"><div class="m-title"><h3>${panel.t("mealieTitle")}</h3></div>
    <button class="icon-btn" id="mr-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("mealiePreview")}</p>
    <p id="mr-status" role="status"></p>
    <div class="modal-actions"><button class="btn ghost" id="mr-test">${panel.t("mealieTest")}</button><button class="btn primary" id="mr-sync">${panel.t("mealieSync")}</button></div>
    <label class="field"><span>${panel.t("mealieSearch")}</span><input id="mr-search" type="search"></label>
    <label class="field"><span>${panel.t("mealieFilter")}</span><select id="mr-filter"><option value="all">${panel.t("mealieAll")}</option><option value="ready">${panel.t("mealieReady")}</option><option value="near">${panel.t("mealieNear")}</option></select></label>
    <div id="mr-list"></div>
    <details id="mr-pending"><summary id="mr-pending-title"></summary><p class="location-help">${panel.t("mealieParseHelp")}</p><div id="mr-pending-list"></div></details>
    <details><summary>${panel.t("mealieMappings")}</summary><div id="mr-mappings"></div></details>
  `);
  const q = s => h.modal.querySelector(s);
  let data = { status: {}, recipes: [], foods: [], templates: [], needs_parsing: [] }, busy = false, closed = false;
  const close = () => { closed = true; h.close(); };
  q("#mr-close").addEventListener("click", close);
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
    q("#mr-list").innerHTML = recipes.map(r => `<div class="location-row"><b>${esc(r.name)}</b>
      <p class="location-help">${r.all_present ? panel.t("mealieReady") : `${r.missing.length} ${panel.t("mealieMissing")} · ${r.unresolved.length} ${panel.t("mealieReview")}`}</p>
      ${r.matched.map(i => `<p class="location-help">${esc(i.ingredient)} — ${esc(i.name)}${i.days !== null ? ` · ${i.days} ${panel.t("mealieDays")}` : ""}${i.past_best_before ? ` · ${panel.t("mealiePastBest")}` : ""}${i.thaw ? ` · ${panel.t("mealieThaw")}` : ""}</p>`).join("")}
      ${r.missing.length ? `<p>${panel.t("mealieMissing")}: ${esc(r.missing.join(", "))}</p>` : ""}
      ${r.unresolved.length ? `<p>${panel.t("mealieReview")}: ${esc(r.unresolved.join(", "))}</p>` : ""}
      <a class="btn ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${panel.t("mealieOpen")}</a></div>`).join("")
      || `<p class="location-help">${panel.t("mealieEmpty")}</p>`;
    const pending = data.needs_parsing || [];
    q("#mr-pending").hidden = !pending.length;
    q("#mr-pending-title").textContent = `${panel.t("mealieNeedsParsing")} (${pending.length})`;
    q("#mr-pending-list").innerHTML = pending.map(r => `<p><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a></p>`).join("");
    q("#mr-mappings").innerHTML = data.foods.map(f => `<label class="field"><span>${esc(f.name)} · ${panel.t(f.source === "saved" ? "mealieSaved" : f.source === "exact" ? "mealieExact" : "mealieReview")}</span>
      <select data-food="${esc(f.id)}" ${busy ? "disabled" : ""}><option value="">${panel.t("mealieAutomatic")}</option>${data.templates.map(t => `<option value="${esc(t.id)}" ${f.source === "saved" && f.template_id === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>`).join("");
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
  q("#mr-search").addEventListener("input", render);
  q("#mr-filter").addEventListener("change", render);
  q("#mr-test").addEventListener("click", () => load("test"));
  q("#mr-sync").addEventListener("click", () => load("sync"));
  await load("list");
}
