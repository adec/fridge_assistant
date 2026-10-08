import { bindReorder } from "../lib/reorder.js?v=0.10.0b13";
/* Named physical locations share the catalogue's three storage types. */
import { esc } from "../lib/format.js?v=0.10.0b13";

export function openLocationsManager(panel) {
  const h = panel._openModal(`
    <div class="modal-head"><div class="m-title"><h3>${panel.t("manageLocations")}</h3></div>
      <button class="icon-btn" id="lm-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("locationsHelp")}</p>
    <button class="btn primary" id="lm-add"><ha-icon icon="mdi:plus"></ha-icon> ${panel.t("newLocation")}</button>
    <div id="lm-list"></div>
    <p class="location-help">${panel.t("locationArchivedHelp")}</p>
  `, { onClose: () => { disposeReorder(); if (panel._refreshLocations === render) panel._refreshLocations = null; } });
  const list = h.modal.querySelector("#lm-list");
  let busy = false, disposeReorder = () => {};
  const run = async (button, action) => {
    if (busy) return;
    busy = true; button.disabled = true; render();
    try {
      await action();
      // The response and subscription can arrive in either order.
      panel._state = await panel._call("get_state"); panel._onState();
    } catch (e) { panel._toast(e.message || String(e), { type: "bad" }); }
    finally { busy = false; render(); }
  };
  const render = () => {
    disposeReorder();
    const ids = panel._state.locations;
    const active = panel._state.active_locations || ids;
    list.innerHTML = ids.map(id => {
      const loc = panel._locMeta(id);
      const type = panel._storageMeta(loc.storage_type);
      const last = active.length === 1 && active.includes(id);
      const count = panel._state.counts.by_location[id] || 0;
      return `<div class="location-row" data-reorder-id="${esc(id)}">
        <div class="location-row-head"><div class="location-row-main">
          <b>${esc(loc.emoji || "📦")} ${esc(loc.label)}</b>
          <small>${esc(type.label)} · ${count} ${panel.t("itemsUnit")}${loc.archived ? " · " + panel.t("locationArchived") : ""}</small>
        </div><button class="icon-btn reorder-handle" data-reorder-handle ${busy ? "disabled" : ""}><ha-icon icon="mdi:drag-horizontal"></ha-icon></button></div>
        <div class="location-actions">
          <button class="btn ghost" data-edit="${id}" ${busy || loc.deleted ? "disabled" : ""}>${panel.t("editLocation")}</button>
          <button class="btn ghost" data-archive="${id}" ${busy || last || loc.deleted ? "disabled" : ""} title="${last ? panel.t("locationKeepOne") : ""}">${panel.t(loc.archived ? "locationRestore" : "locationArchive")}</button>
          <button class="btn ghost danger-text" data-remove="${id}" ${busy || last || count || loc.deleted ? "disabled" : ""} title="${last ? panel.t("locationKeepOne") : count ? panel.t("locationRemoveHelp") : ""}">${panel.t("locationRemove")}</button>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editLocation(panel, b.dataset.edit)));
    list.querySelectorAll("[data-archive]").forEach(b => b.addEventListener("click", () => run(b, () => {
      const loc = panel._locMeta(b.dataset.archive);
      return panel._call("save_location", { location: { id: loc.id,
        emoji: loc.emoji, storage_type: loc.storage_type, archived: !loc.archived } });
    })));
    list.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => run(b,
      () => panel._call("remove_location", { location_id: b.dataset.remove }))));
    disposeReorder = bindReorder(list, {
      label: id => panel.t("reorderHandle", panel._locMeta(id).label),
      announcement: (position,total) => panel.t("reorderPosition",position,total),
      save: ids => run(list, () => panel._call("reorder_locations", {location_ids:ids})),
    });
  };
  panel._refreshLocations = render;
  render();
  h.modal.querySelector("#lm-close").addEventListener("click", h.close);
  h.modal.querySelector("#lm-add").addEventListener("click", () => editLocation(panel));
}

function editLocation(panel, id = null) {
  const loc = id ? panel._locMeta(id) : { label: "", emoji: "", storage_type: "fridge" };
  const h = panel._openModal(`
    <div class="modal-head"><div class="m-title"><h3>${panel.t(id ? "editLocation" : "newLocation")}</h3></div>
      <button class="icon-btn" id="le-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <label class="field"><span>${panel.t("locationName")}</span><input id="le-name" maxlength="80" value="${esc(loc.label)}" placeholder="${esc(panel.t("locationNamePlaceholder"))}"></label>
    <label class="field"><span>${panel.t("storageType")}</span><div class="select-wrap"><select id="le-type">
      ${(panel._state.storage_types || ["fridge", "freezer", "pantry"]).map(type => `<option value="${type}" ${type === loc.storage_type ? "selected" : ""}>${panel._storageMeta(type).emoji} ${panel._storageMeta(type).label}</option>`).join("")}
    </select></div></label>
    <label class="field"><span>${panel.t("locationEmoji")}</span><input id="le-emoji" maxlength="16" value="${esc(loc.emoji || "")}" placeholder="📦"></label>
    <p class="location-help">${panel.t("locationDateHelp")}</p>
    ${id ? `<details><summary>${panel.t("automationDetails")}</summary><label class="field"><span>${panel.t("locationId")}</span><input id="le-id" readonly value="${esc(id)}"></label><button type="button" class="btn ghost" id="le-copy">${panel.t("copyId")}</button></details>` : ""}
    <div class="modal-actions"><button class="btn primary" id="le-save">${panel.t("saveBtn")}</button></div>
  `);
  const q = s => h.modal.querySelector(s);
  q("#le-close").addEventListener("click", h.close);
  if (id) q("#le-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(id); panel._toast(panel.t("idCopied")); }
    catch { q("#le-id").focus(); q("#le-id").select(); panel._toast(panel.t("copyIdManually")); }
  });
  q("#le-save").addEventListener("click", async () => {
    const name = q("#le-name").value.trim();
    if (!name) { q("#le-name").focus(); return; }
    const button = q("#le-save"); button.disabled = true;
    try {
      const location = { name, storage_type: q("#le-type").value, emoji: q("#le-emoji").value.trim() };
      if (id) location.id = id;
      await panel._call("save_location", { location });
      panel._state = await panel._call("get_state"); panel._onState();
      h.close(); panel._toast(panel.t("locationSaved"));
    } catch (e) { button.disabled = false; panel._toast(e.message || String(e), { type: "bad" }); }
  });
  q("#le-name").focus();
}
