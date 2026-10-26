export const emptyFilters = () => ({locations:[],kind:'all',categories:[],due:'any',dateType:'any',from:'',to:''});
export function filterInventory(items, filters, {search='', kindOf=i=>i.kind || 'ingredient', skip=''} = {}) {
  const q = search.trim().normalize('NFKC').toLowerCase();
  return items.filter(i => {
    const days = i.days_left, dated = i.expiry_date != null && i.expiry_date !== '';
    const due = filters.due;
    return (skip==='locations' || !filters.locations.length || filters.locations.includes(i.location)) &&
      (skip==='kind' || filters.kind==='all' || kindOf(i)===filters.kind) &&
      (skip==='categories' || !filters.categories.length || filters.categories.includes(i.category)) &&
      (skip==='dateType' || filters.dateType==='any' || (dated && (i.date_type || 'use_by')===filters.dateType)) &&
      (skip==='due' || due==='any' || (due==='none' && !dated) ||
        (due==='past' && days!=null && days<0) || (due==='today' && days===0) ||
        (due==='soon' && days!=null && days>=0 && days<=3) || (due==='week' && days!=null && days>=0 && days<=7) ||
        (due==='custom' && dated && (!filters.from || i.expiry_date>=filters.from) && (!filters.to || i.expiry_date<=filters.to))) &&
      (!q || [i.name,i.contents,i.code].some(v => (v || '').normalize('NFKC').toLowerCase().includes(q)));
  });
}
export function activeFilterGroups(filters) {
  return ['locations','kind','categories','due','dateType'].filter(key => Array.isArray(filters[key]) ? filters[key].length : filters[key] !== (key==='kind'?'all':'any'));
}
