import { esc } from './format.js?v=0.10.0b11';

export function categoryIds(categories, kind, current = null, retainCurrent = false) {
  return Object.keys(categories).filter(id => !categories[id].deleted &&
    (categories[id].kind === kind || (retainCurrent && id === current)) && (!categories[id].archived || id === current));
}

export function fillCategorySelect(panel, select, kind, current, retainedCategory = null) {
  const ids = categoryIds(panel._state.categories || {}, kind, current, current != null && current === retainedCategory);
  const selected = ids.includes(current) ? current : ids.includes('other') ? 'other' : ids[0];
  select.innerHTML = ids.map(id => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(panel._catMeta(id).label)}</option>`).join('');
  if (!ids.length) select.innerHTML = `<option value="">${esc(panel.t('noKindCategories'))}</option>`;
  return selected || null;
}
