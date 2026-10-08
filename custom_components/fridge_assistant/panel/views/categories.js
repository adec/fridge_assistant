import { esc } from "../lib/format.js?v=0.10.0b8";

export function openCategoriesManager(panel) {
  const h = panel._openModal(`<div class="modal-head"><h3>${panel.t("manageCategories")}</h3><button class="icon-btn" id="cm-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("categoriesHelp")}</p><button class="btn primary" id="cm-add">${panel.t("newCategory")}</button><div id="cm-list"></div>`,
    {onClose: () => { if (panel._refreshCategories === render) panel._refreshCategories = null; }});
  let busy = false;
  const run = async action => {
    if (busy) return;
    busy = true; render();
    try { await action(); panel._state = await panel._call("get_state"); panel._onState(); }
    catch(e) { panel._toast(e.message || String(e), {type:"bad"}); }
    finally { busy = false; render(); }
  };
  function render() {
    const ids = Object.keys(panel._state.categories).filter(id => !panel._state.categories[id].deleted);
    const list = h.modal.querySelector("#cm-list");
    list.innerHTML = ids.map((id, index) => {
      const c = panel._catMeta(id);
      return `<div class="location-row"><div class="location-row-head"><div class="location-row-main"><b>${esc(c.emoji)} ${esc(c.label)}</b><small>${esc(panel._kindMeta(c.kind).short)}${c.archived ? " · " + panel.t("locationArchived") : ""}</small></div>
        <button class="icon-btn" data-up="${esc(id)}" aria-label="${panel.t("locationMoveUp")}" ${busy || index===0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button><button class="icon-btn" data-down="${esc(id)}" aria-label="${panel.t("locationMoveDown")}" ${busy || index===ids.length-1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button></div>
        <div class="location-actions"><button class="btn ghost" data-edit="${esc(id)}" ${busy ? "disabled" : ""}>${panel.t("editCategory")}</button><button class="btn ghost" data-archive="${esc(id)}" ${busy || id==="other" ? "disabled" : ""}>${panel.t(c.archived ? "locationRestore" : "locationArchive")}</button><button class="btn ghost danger-text" data-remove="${esc(id)}" ${busy || id==="other" ? "disabled" : ""}>${panel.t("removeCategory")}</button></div></div>`;
    }).join("");
    list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editCategory(panel,b.dataset.edit,run));
    list.querySelectorAll("[data-archive]").forEach(b => b.onclick = () => run(() => panel._call("categories", {action:"save",category:{...panel._state.categories[b.dataset.archive],archived:!panel._state.categories[b.dataset.archive].archived}})));
    list.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => removeCategory(panel,b.dataset.remove,run));
    for(const direction of ["up","down"]) list.querySelectorAll(`[data-${direction}]`).forEach(b => b.onclick = () => run(() => {
      const order=Object.keys(panel._state.categories), id=b.dataset[direction], next=ids[ids.indexOf(id)+(direction==="up"?-1:1)];
      const a=order.indexOf(id), z=order.indexOf(next); [order[a],order[z]]=[order[z],order[a]];
      return panel._call("categories",{action:"reorder",ids:order});
    }));
  }
  panel._refreshCategories=render; render();
  h.modal.querySelector("#cm-close").onclick=h.close;
  h.modal.querySelector("#cm-add").onclick=()=>editCategory(panel,null,run);
}
function editCategory(panel,id,run) {
  const c=id ? panel._catMeta(id) : {label:"",emoji:"🍽️",icon:"mdi:food",kind:"ingredient"};
  const h=panel._openModal(`<div class="modal-head"><h3>${panel.t(id?"editCategory":"newCategory")}</h3><button class="icon-btn" id="ce-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <label class="field"><span>${panel.t("categoryName")}</span><input id="ce-name" maxlength="80" value="${esc(c.label)}"></label>
    <label class="field"><span>${panel.t("categoryDefaultKind")}</span><select id="ce-kind"><option value="ingredient" ${c.kind==="ingredient"?"selected":""}>${esc(panel._kindMeta("ingredient").short)}</option><option value="dish" ${c.kind==="dish"?"selected":""}>${esc(panel._kindMeta("dish").short)}</option></select></label>
    <label class="field"><span>${panel.t("locationEmoji")}</span><input id="ce-emoji" maxlength="16" value="${esc(c.emoji)}"></label>
    <label class="field"><span>${panel.t("categoryIcon")}</span><input id="ce-icon" maxlength="80" value="${esc(c.icon)}" placeholder="mdi:food"></label>
    <div class="modal-actions"><button class="btn primary" id="ce-save">${panel.t("saveBtn")}</button></div>`);
  const q=s=>h.modal.querySelector(s); q("#ce-close").onclick=h.close;
  q("#ce-save").onclick=async()=>{
    const name=q("#ce-name").value.trim(); if(!name){q("#ce-name").focus();return;}
    await run(async()=>{await panel._call("categories",{action:"save",category:{...(id?{id}:{}),name,kind:q("#ce-kind").value,emoji:q("#ce-emoji").value.trim(),icon:q("#ce-icon").value.trim()}});h.close();});
  }; q("#ce-name").focus();
}
function removeCategory(panel,id,run) {
  const options=Object.keys(panel._state.categories).filter(k=>k!==id&&!panel._state.categories[k].archived);
  const h=panel._openModal(`<div class="modal-head"><h3>${panel.t("removeCategory")}: ${esc(panel._catMeta(id).label)}</h3></div><p>${panel.t("categoryRemoveHelp")}</p><label class="field"><span>${panel.t("categoryReplacement")}</span><select id="cr-target">${options.map(k=>`<option value="${esc(k)}" ${k==="other"?"selected":""}>${esc(panel._catMeta(k).label)}</option>`).join("")}</select></label><div class="modal-actions"><button class="btn ghost" id="cr-cancel">${panel.t("closeBtn")}</button><button class="btn primary" id="cr-remove">${panel.t("categoryRemoveReassign")}</button></div>`);
  h.modal.querySelector("#cr-cancel").onclick=h.close;
  h.modal.querySelector("#cr-remove").onclick=()=>run(async()=>{await panel._call("categories",{action:"remove",category_id:id,replacement:h.modal.querySelector("#cr-target").value});h.close();});
}
