import { emptyFilters, filterInventory, activeFilterGroups } from '../lib/inventory-filters.js?v=0.10.0b41';
import { esc } from '../lib/format.js?v=0.10.0b41';
import { openSurface } from '../lib/surface.js?v=0.10.0b41';
import { openLocationsManager } from './locations.js?v=0.10.0b41';
export const dueKeys = ['any','past','today','soon','week','none','custom'];
export function filterLabel(panel, filters, key) {
  if (key==='locations') return filters.locations.map(id=>panel._locMeta(id).label || id).join(', ');
  if (key==='categories') return filters.categories.map(id=>panel._catMeta(id).label || id).join(', ');
  if (key==='kind') return panel._kindMeta(filters.kind).short;
  if (key==='dateType') return panel.t(filters.dateType==='use_by'?'useByLabel':'bestBeforeLabel');
  return filters.due==='custom' ? `${filters.from || '…'} → ${filters.to || '…'}` : panel.t('filterDue_'+filters.due);
}
export function renderFilterChips(panel) {
  const root=panel.shadowRoot.getElementById('filters'), keys=activeFilterGroups(panel._inventoryFilters);
  root.hidden=panel._activeTab==='recipes' || !keys.length;
  root.innerHTML=keys.map(key=>`<button class="chip filter-active" data-remove-filter="${key}" aria-label="${esc(panel.t('filterRemove',filterLabel(panel,panel._inventoryFilters,key)))}">${esc(filterLabel(panel,panel._inventoryFilters,key))}<span aria-hidden="true"> ×</span></button>`).join('')+(keys.length?`<button class="link" id="filter-reset">${panel.t('filterReset')}</button>`:'');
  const refresh=()=>{panel._filterLoc=panel._inventoryFilters.locations.length===1?panel._inventoryFilters.locations[0]:'all';panel._renderFilters();panel._renderList();};
  root.querySelectorAll('[data-remove-filter]').forEach(b=>b.onclick=()=>{const key=b.dataset.removeFilter;panel._inventoryFilters[key]=emptyFilters()[key];refresh();});
  root.querySelector('#filter-reset')?.addEventListener('click',()=>{panel._inventoryFilters=emptyFilters();refresh();});
  const badge=panel.shadowRoot.getElementById('filter-badge');badge.textContent=keys.length || '';badge.hidden=!keys.length;
}
export function openInventoryFilters(panel) {
  let draft=JSON.parse(JSON.stringify(panel._inventoryFilters));
  const h=openSurface(panel,`<div class="filter-panel-head"><div><h3>${panel.t('filterTitle')}</h3><p id="filter-draft-count" role="status"></p></div><button class="icon-btn" id="filter-close" aria-label="${panel.t('closeBtn')}"><ha-icon icon="mdi:close"></ha-icon></button></div>
    <div class="filter-panel-body">
    <section><h4>${panel.t('filterLocations')}</h4><div id="filter-locations"></div><button class="link" id="filter-manage-locations">${panel.t('manageLocations')}</button></section>
    <section><h4>${panel.t('kindLabel')}</h4><div class="seg" id="filter-kind"></div></section>
    <section><h4>${panel.t('listDueDate')}</h4><div class="filter-due-grid" id="filter-due"></div><p class="location-help">${panel.t('filterDueHelp')}</p><div class="grid2" id="filter-range" hidden><label class="field"><span>${panel.t('filterFrom')}</span><input type="date" id="filter-from" value="${esc(draft.from)}"></label><label class="field"><span>${panel.t('filterTo')}</span><input type="date" id="filter-to" value="${esc(draft.to)}"></label></div></section>
    <details><summary>${panel.t('filterCategories')} <span id="filter-category-count"></span></summary><input class="filter-category-search" type="search" id="filter-category-search" placeholder="${esc(panel.t('filterCategorySearch'))}" aria-label="${esc(panel.t('filterCategorySearch'))}"><div id="filter-categories"></div></details>
    <details><summary>${panel.t('filterDateType')} <span id="filter-type-label"></span></summary><div class="seg" id="filter-date-type"></div></details><p class="location-help" id="filter-help"></p>
    </div><div class="filter-panel-footer"><button class="btn ghost" id="filter-clear">${panel.t('filterClearAll')}</button><button class="btn ghost" id="filter-cancel">${panel.t('filterCancel')}</button><button class="btn primary" id="filter-apply"></button></div>`,
    {prefer:'drawer',onClose:()=>{if(panel._drawerEl===h.modal)h.modal.classList.remove('filter-surface');if(panel._refreshInventoryFilters===draw)panel._refreshInventoryFilters=null;}});
  h.modal.classList.add('filter-surface');
  const q=s=>h.modal.querySelector(s);
  const matched=(f,skip='')=>filterInventory(panel._state.inventory_rows || panel._state.items,f,{search:panel._search,kindOf:i=>panel._kindOf(i),skip});
  const checks=(selector,key,ids,meta,itemKey)=>{
    const needle=q('#filter-category-search').value.trim().toLowerCase();
    const scrollTop=q(selector).scrollTop;
    q(selector).innerHTML=ids.filter(id=>key!=='categories'||draft.categories.includes(id)||(meta(id).label||id).toLowerCase().includes(needle)).map(id=>{
      const m=meta(id), count=matched(draft,key).filter(i=>i[itemKey]===id).length;
      return `<label class="filter-check"><input type="checkbox" value="${esc(id)}" ${draft[key].includes(id)?'checked':''}><span>${esc(m.emoji||'')} ${esc(m.label||id)}${m.archived?' · '+panel.t('locationArchived'):''}</span><small>${count}</small></label>`;
    }).join('');
    q(selector).scrollTop=scrollTop;
    q(selector).querySelectorAll('input').forEach(input=>input.onchange=()=>{draft[key]=input.checked?[...draft[key],input.value]:draft[key].filter(id=>id!==input.value);draw();Array.from(q(selector).querySelectorAll('input')).find(el=>el.value===input.value)?.focus({preventScroll:true});});
  };
  const segments=(selector,key,options)=>{
    q(selector).innerHTML=options.map(([value,label])=>`<button type="button" data-value="${value}" class="${draft[key]===value?'on':''}" aria-pressed="${draft[key]===value}">${esc(label)}</button>`).join('');
    q(selector).querySelectorAll('button').forEach(b=>b.onclick=()=>{draft[key]=b.dataset.value;draw();q(selector).querySelector(`[data-value="${b.dataset.value}"]`)?.focus({preventScroll:true});});
  };
  function draw(){
    if(!h.modal.isConnected)return;
    const count=matched(draft).length, invalid=draft.due==='custom'&&draft.from&&draft.to&&draft.from>draft.to;
    q('#filter-draft-count').textContent=panel.t('filterMatching',count);
    q('#filter-apply').textContent=panel.t('filterShow',count);q('#filter-apply').disabled=!!invalid;
    q('#filter-help').textContent=panel.t(invalid?'filterInvalidRange':count?'filterCombineHelp':'filterNoMatches');
    checks('#filter-locations','locations',[...new Set([...panel._state.locations,...draft.locations])],id=>panel._locMeta(id),'location');
    const cats=panel._state.categories||{};
    checks('#filter-categories','categories',[...new Set([...Object.keys(cats).filter(id=>!cats[id].deleted||panel._state.items.some(i=>i.category===id)),...draft.categories])],id=>panel._catMeta(id),'category');
    segments('#filter-kind','kind',[['all',panel.t('filterAny')],...Object.keys(panel._state.kinds).map(k=>[k,panel._kindMeta(k).short])]);
    segments('#filter-date-type','dateType',[['any',panel.t('filterAny')],['use_by',panel.t('useByLabel')],['best_before',panel.t('bestBeforeLabel')]]);
    q('#filter-category-count').textContent=draft.categories.length?panel.t('filterSelected',draft.categories.length):panel.t('filterAny');
    q('#filter-type-label').textContent=draft.dateType==='any'?panel.t('filterAny'):filterLabel(panel,draft,'dateType');
    q('#filter-range').hidden=draft.due!=='custom';
    q('#filter-due').innerHTML=dueKeys.map(key=>`<button type="button" data-due="${key}" aria-pressed="${draft.due===key}" class="${draft.due===key?'on':''}">${panel.t('filterDue_'+key)}${key==='custom'?'':`<small>${matched({...draft,due:key}).length}</small>`}</button>`).join('');
    q('#filter-due').querySelectorAll('button').forEach(b=>b.onclick=()=>{draft.due=b.dataset.due;draw();q('#filter-due').querySelector(`[data-due="${b.dataset.due}"]`)?.focus({preventScroll:true});});
  }
  panel._refreshInventoryFilters=draw;
  for(const id of ['#filter-close','#filter-cancel'])q(id).onclick=h.close;
  q('#filter-clear').onclick=()=>{draft=emptyFilters();q('#filter-from').value='';q('#filter-to').value='';draw();};
  q('#filter-apply').onclick=()=>{panel._inventoryFilters=JSON.parse(JSON.stringify(draft));panel._filterLoc=draft.locations.length===1?draft.locations[0]:'all';panel._renderFilters();panel._renderList();h.close();};
  q('#filter-category-search').oninput=()=>checks('#filter-categories','categories',Object.keys(panel._state.categories).filter(id=>!panel._state.categories[id].deleted||draft.categories.includes(id)||panel._state.items.some(i=>i.category===id)),id=>panel._catMeta(id),'category');
  for(const [id,key] of [['#filter-from','from'],['#filter-to','to']])q(id).oninput=e=>{draft[key]=e.target.value;draw();};
  q('#filter-manage-locations').onclick=()=>{h.close();openLocationsManager(panel);};
  draw();
}
