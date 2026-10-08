import { openSurface } from "../lib/surface.js?v=0.10.0b17";
import { categoryIds } from "../lib/categories.js?v=0.10.0b17";
import { bindReorder, mergeVisibleOrder } from "../lib/reorder.js?v=0.10.0b17";
import { esc } from "../lib/format.js?v=0.10.0b17";

export function openCategoriesManager(panel) {
  const h = openSurface(panel,`<div class="modal-head"><h3>${panel.t("manageCategories")}</h3><button class="icon-btn" id="cm-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <p class="location-help">${panel.t("categoriesHelp")}</p><button class="btn primary" id="cm-add">${panel.t("newCategory")}</button><div class="seg" id="cm-kind"><button data-kind="ingredient" class="on">${esc(panel._kindMeta("ingredient").short)}</button><button data-kind="dish">${esc(panel._kindMeta("dish").short)}</button></div><div id="cm-list"></div>`,
    {prefer: "drawer", wide: true, onClose: () => { disposeReorder(); if (panel._refreshCategories === render) panel._refreshCategories = null; }});
  let selectedKind = "ingredient";
  let busy = false, disposeReorder = () => {};
  const run = async action => {
    if (busy) return;
    busy = true; render();
    try { await action(); panel._state = await panel._call("get_state"); panel._onState(); }
    catch(e) { panel._toast(e.message || String(e), {type:"bad"}); }
    finally { busy = false; render(); }
  };
  function render() {
    disposeReorder();
    const ids = Object.keys(panel._state.categories).filter(id => !panel._state.categories[id].deleted && panel._state.categories[id].kind === selectedKind);
    const list = h.modal.querySelector("#cm-list");
    list.innerHTML = ids.map(id => {
      const c = panel._catMeta(id);
      return `<div class="location-row" data-reorder-id="${esc(id)}"><div class="location-row-head"><div class="location-row-main"><b>${esc(c.emoji)} ${esc(c.label)}</b>${c.archived ? `<small>${panel.t("locationArchived")}</small>` : ""}</div>
        <button class="icon-btn reorder-handle" data-reorder-handle ${busy ? "disabled" : ""}><ha-icon icon="mdi:drag-horizontal"></ha-icon></button></div>
        <div class="location-actions"><button class="btn ghost" data-edit="${esc(id)}" ${busy ? "disabled" : ""}>${panel.t("editCategory")}</button><button class="btn ghost" data-archive="${esc(id)}" ${busy || id==="other" ? "disabled" : ""}>${panel.t(c.archived ? "locationRestore" : "locationArchive")}</button><button class="btn ghost danger-text" data-remove="${esc(id)}" ${busy || id==="other" ? "disabled" : ""}>${panel.t("removeCategory")}</button></div></div>`;
    }).join("");
    list.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editCategory(panel,b.dataset.edit,run));
    list.querySelectorAll("[data-archive]").forEach(b => b.onclick = () => run(() => panel._call("categories", {action:"save",category:{...panel._state.categories[b.dataset.archive],archived:!panel._state.categories[b.dataset.archive].archived}})));
    list.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => removeCategory(panel,b.dataset.remove,run));
    disposeReorder = bindReorder(list, {
      label: id => panel.t("reorderHandle", panel._catMeta(id).label),
      announcement: (position,total) => panel.t("reorderPosition",position,total),
      save: ids => run(() => panel._call("categories", {action:"reorder",ids:mergeVisibleOrder(Object.keys(panel._state.categories),ids)})),
    });
  }
  panel._refreshCategories=render; render();
  h.modal.querySelector("#cm-close").onclick=h.close;
  h.modal.querySelector("#cm-add").onclick=()=>editCategory(panel,null,run,selectedKind);
  h.modal.querySelectorAll("#cm-kind button").forEach(button => button.onclick = () => {
    if (busy) return; selectedKind = button.dataset.kind;
    h.modal.querySelectorAll("#cm-kind button").forEach(b => b.classList.toggle("on",b===button)); render();
  });
}
function editCategory(panel,id,run,defaultKind="ingredient") {
  const c=id ? panel._catMeta(id) : {label:"",emoji:"🍽️",icon:"mdi:food",kind:defaultKind};
  const h=panel._openModal(`<div class="modal-head"><h3>${panel.t(id?"editCategory":"newCategory")}</h3><button class="icon-btn" id="ce-close" aria-label="${panel.t("closeBtn")}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <label class="field"><span>${panel.t("categoryName")}</span><input id="ce-name" maxlength="80" value="${esc(c.label)}"></label>
    <label class="field"><span>${panel.t("categoryDefaultKind")}</span><select id="ce-kind"><option value="ingredient" ${c.kind==="ingredient"?"selected":""}>${esc(panel._kindMeta("ingredient").short)}</option><option value="dish" ${c.kind==="dish"?"selected":""}>${esc(panel._kindMeta("dish").short)}</option></select></label>
    <label class="field"><span>${panel.t("locationEmoji")}</span><input id="ce-emoji" maxlength="16" value="${esc(c.emoji)}" aria-describedby="ce-emoji-help"></label>
    <p class="location-help" id="ce-emoji-help">${panel.t("categoryEmojiHelp")}</p>
    <div class="modal-actions"><button class="btn primary" id="ce-save">${panel.t("saveBtn")}</button></div>`);
  const q=s=>h.modal.querySelector(s); q("#ce-close").onclick=h.close;
  q("#ce-save").onclick=async()=>{
    const name=q("#ce-name").value.trim(); if(!name){q("#ce-name").focus();return;}
    await run(async()=>{await panel._call("categories",{action:"save",category:{...(id?{id}:{}),name,kind:q("#ce-kind").value,emoji:q("#ce-emoji").value.trim()}});h.close();});
  }; q("#ce-name").focus();
}
function removeCategory(panel,id,run) {
  const options=categoryIds(panel._state.categories,panel._catMeta(id).kind).filter(k=>k!==id);
  const h=panel._openModal(`<div class="modal-head"><h3>${panel.t("removeCategory")}: ${esc(panel._catMeta(id).label)}</h3></div><p>${panel.t("categoryRemoveHelp")}</p><label class="field"><span>${panel.t("categoryReplacement")}</span><select id="cr-target">${options.map(k=>`<option value="${esc(k)}" ${k==="other"?"selected":""}>${esc(panel._catMeta(k).label)}</option>`).join("")}</select></label><div class="modal-actions"><button class="btn ghost" id="cr-cancel">${panel.t("closeBtn")}</button><button class="btn primary" id="cr-remove" ${options.length ? "" : "disabled"}>${panel.t("categoryRemoveReassign")}</button></div>`);
  h.modal.querySelector("#cr-cancel").onclick=h.close;
  h.modal.querySelector("#cr-remove").onclick=()=>run(async()=>{await panel._call("categories",{action:"remove",category_id:id,replacement:h.modal.querySelector("#cr-target").value});h.close();});
}
