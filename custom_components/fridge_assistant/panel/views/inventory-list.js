import { handlingSummary, handlingDate, handlingStatus } from "./handling.js?v=0.10.0b26";
import { esc, fmtCardDate, daysLabel } from '../lib/format.js?v=0.10.0b26';

export function inventoryList(panel, items, lang) {
  if (!panel._inventorySort || panel._inventorySort.startsWith("due")) items = items.slice().sort((a,b) => {
    if (!a.expiry_date || !b.expiry_date) return Number(!a.expiry_date) - Number(!b.expiry_date);
    return (Date.parse(a.handling_due_at || a.expiry_date+'T23:59:59')-Date.parse(b.handling_due_at || b.expiry_date+'T23:59:59')) * (panel._listDescending ? -1 : 1);
  });
  const showLocation = panel._filterLoc === 'all';
  const multi = items.some(i => (i.batch_portions_total || (i.portions || []).length) > 1);
  return `<div class="inventory-table-wrap"><table class="inventory-table ${showLocation ? '' : 'location-filtered'}"><caption class="reorder-status">${panel.t('inventoryTab')}</caption>
    <thead><tr><th scope="col">${panel.t('listFood')}</th>${showLocation ? `<th scope="col" class="il-location">${panel.t('locationLabel')}</th>` : ''}<th scope="col" class="il-date" aria-sort="${panel._inventorySort && !panel._inventorySort.startsWith('due') ? 'none' : panel._listDescending ? 'descending' : 'ascending'}"><button type="button" id="list-sort">${panel.t('listDueDate')} ${panel._inventorySort && !panel._inventorySort.startsWith('due') ? '' : panel._listDescending ? '↓' : '↑'}</button></th><th scope="col" class="il-time">${panel.t('listTimeLeft')}</th>${multi ? `<th scope="col" class="il-portions">${panel.t('portionsLabel')}</th>` : ''}<th scope="col" class="il-actions"><span class="reorder-status">${panel.t('listActions')}</span></th></tr></thead>
    <tbody>${items.map(i => {
      const loc = panel._locMeta(i.location), portions = i.portions || [];
      const total = i.batch_portions_total || portions.length;
      const portionText = total > 1 ? `${portions.filter(p => p.status === 'open').length}/${total}` : '';
      const status = handlingStatus(panel,i,daysLabel(i.days_left, lang, i.date_type));
      const type = i.handling_due_at ? panel.t('handlingUseWithin') : panel.t(i.date_type === 'best_before' ? 'bestBeforeLabel' : 'useByLabel');
      return `<tr data-item="${esc(i.inventory_key || i.id)}" tabindex="0" class="inventory-row ${i.status === 'expired' ? 'status-expired' : i.status === 'soon' ? 'status-soon' : ''} ${panel._inspectorItemId === i.id ? 'selected' : ''}" aria-label="${esc(i.name)}">
        <td><div class="il-food"><span class="il-emoji">${esc(i.emoji || '🍽️')}</span><div class="il-name"><b>${esc(i.name)}</b>${handlingSummary(panel,i,false)?`<small class="inventory-handling">${esc(handlingSummary(panel,i,false))}</small>`:""}<code class="il-code">${esc(i.code)}${i.inventory_key && i.portions.length===1 && i.batch_portions_total>1 ? "-"+i.portions[0].n : ""}</code><span class="il-mobile-meta">${[showLocation ? esc(loc.label || i.location) : '', portionText ? esc(panel.t('listPortionsRemaining', portionText)) : ''].filter(Boolean).join(' · ')}</span></div></div></td>
        ${showLocation ? `<td class="il-location">${esc(loc.label || i.location)}</td>` : ''}
        <td class="il-date">${i.expiry_date ? `<small>${esc(type)}</small><span>${i.handling_due_at ? handlingDate(panel,i).replace(panel.t("handlingUseWithin")+" · ","") : fmtCardDate(i.expiry_date, lang, panel._state.today)}</span>` : `<span>—</span>`}<span class="il-mobile-time il-status ${esc(i.status)}">${esc(status)}</span></td>
        <td class="il-time il-status ${esc(i.status)}">${esc(status)}</td>
        ${multi ? `<td class="il-portions">${portionText || '—'}</td>` : ''}
        <td class="il-actions"><button class="icon-btn" data-list-actions="${esc(i.inventory_key || i.id)}" aria-label="${esc(panel.t('listItemActions', i.name))}"><ha-icon icon="mdi:dots-horizontal"></ha-icon></button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
