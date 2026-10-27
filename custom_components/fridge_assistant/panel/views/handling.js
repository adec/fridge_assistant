import { esc } from '../lib/format.js?v=0.10.0b36';
export function handlingTime(panel, iso) {
  return new Intl.DateTimeFormat(panel._lang()==='nl'?'nl-NL':'en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
}
export function handlingSummary(panel, item, withDeadline = true) {
  const parts=[];
  if(item.is_opened)parts.push(panel.t('handlingOpened')+(withDeadline && item.opened_at ? ' '+handlingTime(panel,item.opened_at):''));
  if(item.handling_phase)parts.push(panel.t('handlingPhase_'+item.handling_phase)+(withDeadline && item.defrosted_at ? ' '+handlingTime(panel,item.defrosted_at):''));
  if(item.handling_due_at)parts.push((withDeadline ? panel.t('handlingUseWithin')+' '+handlingTime(panel,item.handling_due_at)+' · ' : '')+panel.t('handlingReason_'+item.handling_reason));
  else if(item.handling_phase==='defrosting')parts.push(panel.t('handlingAwaiting'));
  else if(item.handling_phase==='defrosted'||item.is_opened)parts.push(panel.t(item.handling_lifetime_configured?'handlingOriginalEarlier':'handlingNoLifetime'));
  return parts.join(' · ');
}
export function handlingDate(panel, item) {
  const iso=item.handling_due_at || item.effective_due_at;
  return iso?`${panel.t('handlingUseWithin')} ${handlingTime(panel,iso)}`:null;
}
export function handlingStatus(panel, item, fallback) {
  const iso=item.handling_due_at || item.effective_due_at;
  if(!iso)return fallback;
  const hours=Math.ceil((new Date(iso)-Date.now())/3600000);
  return panel.t(hours<=0?'handlingOverdueHours':'handlingRemainingHours',Math.abs(hours));
}
export function openHandling(panel, item, action, n) {
  const all=(item.portions||[]).filter(p=>p.status==='open');
  const states=new Map((item.portion_states||[]).map(p=>[p.portion_number,p]));
  const eligible=p=>action==='opened'?!p.opened_at:action==='start_defrost'?!p.defrost_started_at&&!p.defrosted_at&&panel._storageType(p.location||item.location)==='freezer':p.defrost_started_at&&!p.defrosted_at;
  const template=panel._state.templates.find(t=>t.id===item.template_id)||{};
  const hours=template[action==='opened'?'after_opening_hours':'after_defrosting_hours'];
  const d=new Date();const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const fridges=(panel._state.active_locations||panel._state.locations).filter(id=>panel._storageType(id)==='fridge');
  const destinations = action === 'start_defrost' ? fridges : (panel._state.active_locations || []);
  const defaultDestination = action === 'opened' ? template.after_opening_location || '' : fridges[0] || '';
  const destinationField = action === 'start_defrost' || action === 'opened' ? `<label class="field"><span>${panel.t('handlingDestination')}</span><div class="select-wrap"><select id="handling-destination">${action==='opened'?`<option value="">${panel.t('openingKeepLocation')}</option>`:''}${defaultDestination && !destinations.includes(defaultDestination)?`<option value="${esc(defaultDestination)}" selected disabled>${esc(panel._locMeta(defaultDestination).label)} · ${panel.t('locationArchived')}</option>`:''}${destinations.map(id=>`<option value="${esc(id)}" ${id===defaultDestination?'selected':''}>${esc(panel._locMeta(id).label)}</option>`).join('')}</select></div></label><p class="location-help">${panel.t(action==='opened'?'openingStorageHelp':'handlingStartHelp')}</p>` : '';
  const h=panel._openModal(`<div class="modal-head"><h3>${panel.t('handlingAction_'+action)}</h3><button class="icon-btn" id="handling-close" aria-label="${panel.t('closeBtn')}">×</button></div>
    <p class="location-help">${panel.t('handlingScopeHelp')}</p><div id="handling-portions">${all.map(p=>`<label class="filter-check"><input type="checkbox" value="${p.n}" ${eligible(p)?'':'disabled'} ${p.n===n&&eligible(p)?'checked':''}><span>${esc(item.code)}${all.length>1||item.portions.length>1?'-'+p.n:''} · ${esc(panel._locMeta(p.location||item.location).label)}</span></label>`).join('')}</div><button class="link" id="handling-all">${panel.t('handlingSelectAll')}</button>
    <label class="field"><span>${panel.t('handlingWhen')}</span><input type="datetime-local" id="handling-when" value="${local}" max="${local}"></label>
    ${destinationField}
    ${action!=='start_defrost'?`<label class="field"><span>${panel.t('handlingLifetimeHours')}</span><input type="number" min="1" max="8760" id="handling-hours" value="${hours??''}" placeholder="${panel.t('handlingNoAutomatic')}"></label>`:''}
    <p class="location-help" id="handling-preview" role="status"></p><div class="modal-actions"><button class="btn ghost" id="handling-cancel">${panel.t('filterCancel')}</button><button class="btn primary" id="handling-save">${panel.t('saveBtn')}</button></div>`);
  const q=s=>h.modal.querySelector(s);
  const selected=()=>Array.from(h.modal.querySelectorAll('#handling-portions input:checked')).map(el=>Number(el.value));
  const draw=()=>{
    const selection=selected(), time=q('#handling-when').value, value=q('#handling-hours')?.value;
    const valid=time&&new Date(time)<=new Date()&&(value==null||value===''||(Number(value)>0&&Number(value)<=8760));
    const destination=q('#handling-destination')?.value;
    q('#handling-save').disabled=!selection.length||!valid||(action==='start_defrost'&&!fridges.length)||!!(destination&&!destinations.includes(destination));
    const due=value&&time?handlingTime(panel,new Date(new Date(time).getTime()+Number(value)*3600000).toISOString()):'';
    q('#handling-preview').textContent=action==='start_defrost'?panel.t('handlingMoveCount',selection.length):[due?panel.t('handlingPreview',due):panel.t('handlingNoLifetime'), action==='opened' ? (destination ? panel.t('openingMoveTo',panel._locMeta(destination).label) : panel.t('openingKeepLocation')) : ''].filter(Boolean).join(' · ');
  };
  q('#handling-all').onclick=()=>{h.modal.querySelectorAll('#handling-portions input:not(:disabled)').forEach(el=>el.checked=true);draw();};
  h.modal.querySelectorAll('input,select').forEach(el=>el.oninput=draw);
  q('#handling-close').onclick=h.close;q('#handling-cancel').onclick=h.close;
  q('#handling-save').onclick=async()=>{
    const button=q('#handling-save');button.disabled=true;
    try{
      const payload={item_id:item.id,portions:selected(),action,when:new Date(q('#handling-when').value).toISOString()};
      if(action==='start_defrost'||action==='opened')payload.location=q('#handling-destination').value;
      if(action!=='start_defrost')payload.hours=q('#handling-hours').value===''?null:Number(q('#handling-hours').value);
      const result=await panel._call('handling',payload);
      panel._state=await panel._call('get_state');panel._onState();h.close();
      panel._toast(panel.t('handlingSaved'),{actionLabel:panel.t('undoLabel'),onAction:async()=>{try{await panel._call('restore_item',{event_id:result.event.id});panel._state=await panel._call('get_state');panel._onState();}catch(e){panel._toast(esc(e.message||String(e)),{type:'bad'});}}});
    }catch(e){button.disabled=false;panel._toast(esc(e.message||String(e)),{type:'bad'});}
  };draw();
}
