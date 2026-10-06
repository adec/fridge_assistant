/* First Mealie milestone: read-only connection and cached recipe catalogue. */
import { esc } from "../lib/format.js";

export async function openMealie(panel) {
  const h = panel._openModal(`
    <div class="modal-head"><div class="m-title"><h3>${panel.t("mealieTitle")}</h3></div>
    <button class="icon-btn" id="mr-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("mealiePreview")}</p>
    <p id="mr-status" role="status"></p>
    <div class="modal-actions"><button class="btn ghost" id="mr-test">${panel.t("mealieTest")}</button><button class="btn primary" id="mr-sync">${panel.t("mealieSync")}</button></div>
    <label class="field"><span>${panel.t("mealieSearch")}</span><input id="mr-search" type="search"></label>
    <div id="mr-list"></div>
  `);
  const q = s => h.modal.querySelector(s);
  let data = { status: {}, recipes: [] }, busy = false, closed = false;
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
    const recipes = data.recipes.filter(r => r.name.toLocaleLowerCase().includes(query));
    q("#mr-list").innerHTML = recipes.map(r => `<div class="location-row"><b>${esc(r.name)}</b>
      <p class="location-help">${r.ingredients.length} ${panel.t("mealieIngredients")}${r.unparsed ? ` · ${r.unparsed} ${panel.t("mealieUnparsed")}` : ""}</p>
      <a class="btn ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${panel.t("mealieOpen")}</a></div>`).join("")
      || `<p class="location-help">${panel.t("mealieEmpty")}</p>`;
  };
  const load = async action => {
    if (busy) return;
    busy = true; render();
    try {
      const result = await panel._call("mealie", { action });
      if (closed || !h.modal.isConnected) return;
      data = result;
      if (action === "test") panel._toast(panel.t("mealieConnected"));
    } catch (error) { if (!closed && h.modal.isConnected) panel._toast(error.message || String(error), { type: "bad" }); }
    finally { busy = false; render(); }
  };
  q("#mr-search").addEventListener("input", render);
  q("#mr-test").addEventListener("click", () => load("test"));
  q("#mr-sync").addEventListener("click", () => load("sync"));
  await load("list");
}
