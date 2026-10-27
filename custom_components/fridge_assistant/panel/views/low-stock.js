import { esc, fmtCardDate } from '../lib/format.js?v=0.10.0b42';

export function openLowStock(panel, templateId) {
  const template=panel._state.templates.find(t=>t.id===templateId);
  if(!template)return;
  const items=panel._state.items.filter(i=>i.template_id===templateId).slice().sort((a,b)=>String(a.expiry_date||'9999').localeCompare(String(b.expiry_date||'9999')) || String(a.added_date||'').localeCompare(String(b.added_date||'')));
  if(items.length===1){panel._openItemModal(items[0]);return;}
  if(!items.length){panel._openAddModal({...template,template_id:template.id});return;}
  const total=panel._state.low_stock.find(t=>t.template_id===templateId);
  const h=panel._openModal(`<div class="modal-head"><h2>${esc(template.name)}</h2><button class="iconbtn" id="ls-close" aria-label="${esc(panel.t('closeBtn'))}"><ha-icon icon="mdi:close"></ha-icon></button></div><p>${total?esc(panel.t('lowStockSummary',total.remaining,total.unit||'',total.limit)):''}</p><p class="location-help">${panel.t('lowStockChoose')}</p>${items.map(i=>`<button class="low-stock-entry d-row" data-stock-item="${esc(i.id)}"><span><b>${esc(panel._locMeta(i.location).label)}</b><small>${esc(i.code||'')} · ${i.expiry_date?esc(panel.t(i.date_type==='best_before'?'bestBeforeLabel':'useByLabel'))+' '+fmtCardDate(i.expiry_date,panel._lang(),panel._state.today,i.expiry_precision):panel.t('filterDue_none')}</small></span><b>${i.stock_count??1} ${esc(template.stock_unit||panel.t('itemsUnit'))}</b></button>`).join('')}`);
  h.modal.querySelector('#ls-close').onclick=h.close;
  h.modal.querySelectorAll('[data-stock-item]').forEach(b=>b.onclick=()=>{const i=panel._state.items.find(i=>i.id===b.dataset.stockItem);h.close();if(i)panel._openItemModal(i);});
}

export function bindLowStock(panel, root) {
  root.querySelectorAll('[data-low-stock]').forEach(b=>b.onclick=()=>openLowStock(panel,b.dataset.lowStock));
}
