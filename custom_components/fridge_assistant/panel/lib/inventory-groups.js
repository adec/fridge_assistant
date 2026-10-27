// Keep item order within groups; group identity uses stable IDs, never labels.
export function groupingMode(mode, sort='due') {
  return mode==='auto' ? sort.startsWith('due')?'due':sort==='location'?'location':'none' : mode;
}
export function groupInventory(items, mode, {warnDays=3, locationLabel=x=>x, categoryLabel=x=>x}={}) {
  const groups=new Map();
  for(const item of items){
    const dated=!!(item.expiry_date || item.handling_due_at || item.effective_due_at);
    const key=mode==='due' ? !dated?'none':item.handling_overdue || item.status==='expired' || item.days_left<0?'past':item.status==='soon' || (item.days_left!=null && item.days_left<=warnDays)?'soon':'later' : mode==='location'?item.location||'':mode==='category'?item.category||'':'all';
    if(!groups.has(key))groups.set(key,{key,items:[]});
    groups.get(key).items.push(item);
  }
  const result=[...groups.values()];
  if(mode==='due')result.sort((a,b)=>['past','soon','later','none'].indexOf(a.key)-['past','soon','later','none'].indexOf(b.key));
  else if(mode==='location' || mode==='category')result.sort((a,b)=>(mode==='location'?locationLabel(a.key):categoryLabel(a.key)).localeCompare(mode==='location'?locationLabel(b.key):categoryLabel(b.key)));
  return result;
}
export function groupExpanded(mode,key,saved={},search='') {
  if(search.trim())return true;
  const stored=saved[mode+':'+key];
  return typeof stored==='boolean'?stored:mode!=='due' || key==='past' || key==='soon';
}
