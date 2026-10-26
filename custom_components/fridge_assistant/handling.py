"""Per-portion handling events and projected stock; original label data is immutable here."""
from copy import deepcopy
from datetime import datetime, time, timedelta, timezone
import math
import uuid

FIELDS = ('location', 'opened_at', 'opening_hours', 'defrost_started_at', 'defrosted_at', 'defrost_hours')


def hours(value):
    if value in (None, ''):
        return None
    if isinstance(value, bool):
        raise ValueError('Enter a positive lifetime or leave it empty')
    result = float(value)
    if not math.isfinite(result) or not 0 < result <= 8760:
        raise ValueError('Lifetime must be between 0 and 8760 hours')
    return result


def timestamp(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError()
        return result
    except (ValueError, TypeError, AttributeError) as err:
        raise ValueError('Choose a date and time with a timezone') from err


def due_for(item, portion, now):
    choices = []
    if item.get('expiry_date'):
        try:
            original = datetime.combine(datetime.fromisoformat(item['expiry_date']).date(), time.max, tzinfo=now.tzinfo)
            choices.append((original, 'original'))
        except (ValueError, TypeError):
            pass
    for event, lifetime, reason in [('opened_at','opening_hours','opened'), ('defrosted_at','defrost_hours','defrosted')]:
        if portion.get(event) and portion.get(lifetime):
            choices.append((timestamp(portion[event]) + timedelta(hours=portion[lifetime]), reason))
    return min(choices, key=lambda x:x[0]) if choices else (None, None)


def portion_projection(item, portion, now):
    deadline, reason = due_for(item, portion, now)
    phase = 'defrosted' if portion.get('defrosted_at') else 'defrosting' if portion.get('defrost_started_at') else None
    return {**item, 'location':portion.get('location', item.get('location')),
            'original_expiry_date':item.get('original_expiry_date', item.get('expiry_date')),
            'original_expiry_precision':item.get('original_expiry_precision', item.get('expiry_precision', 'day')),
            'expiry_precision':item.get('expiry_precision', 'day') if reason in ('original', None) else 'day',
            'original_date_type':item.get('original_date_type', item.get('date_type', 'use_by')),
            'handling_reason':reason if reason != 'original' else None,
            'handling_due_at':deadline.astimezone(now.tzinfo).isoformat() if deadline and reason != 'original' else None,
            'expiry_date':deadline.astimezone(now.tzinfo).date().isoformat() if deadline else None,
            'date_type':item.get('date_type', 'use_by'),
            'handling_phase':phase, 'is_opened':bool(portion.get('opened_at')),
            'handling_lifetime_configured':bool((portion.get('opened_at') and portion.get('opening_hours')) or (portion.get('defrosted_at') and portion.get('defrost_hours'))),
            'opened_at':portion.get('opened_at'), 'defrost_started_at':portion.get('defrost_started_at'), 'defrosted_at':portion.get('defrosted_at'),
            'sort_due_at':deadline.isoformat() if deadline else None,
            'handling_overdue':bool(deadline and reason != 'original' and deadline < now),
            'portion_number':portion['n']}


def projected_items(item, now):
    return [portion_projection(item, p, now) for p in (item.get('portions') or [{'n':1,'status':'open'}]) if p.get('status') == 'open']


def earliest(item, now):
    projections = projected_items(item, now)
    return min(projections, key=lambda p:(p['sort_due_at'] is None, timestamp(p['sort_due_at']) if p['sort_due_at'] else datetime.max.replace(tzinfo=timezone.utc))) if projections else item


def inventory_groups(item, now):
    groups = {}
    for p in item.get('portions') or [{'n':1,'status':'open'}]:
        if p.get('status') != 'open':
            continue
        projected = portion_projection(item,p,now)
        key = tuple(projected.get(k) for k in ('location','expiry_date','date_type','handling_due_at','handling_phase','is_opened','handling_reason','handling_lifetime_configured'))
        groups.setdefault(key,{**projected,'portions':[]})['portions'].append(deepcopy(p))
    result = []
    for row in groups.values():
        row['inventory_key'] = f"{item['id']}:{row['portions'][0]['n']}"
        row['batch_portions_total'] = len(item.get('portions') or [1])
        result.append(row)
    return result


def apply_event(store, item_id, selected, action, when, location, lifetime, now, by=None, by_name=None):
    if action not in ('opened','start_defrost','defrosted'):
        raise ValueError('Choose a handling action')
    item = store.items.get(item_id)
    if item is None:
        raise ValueError('Item not found')
    if item.get('stock_count') is not None:
        raise ValueError('Handling actions are unavailable for counted stock')
    when_dt = timestamp(when)
    if when_dt > now:
        raise ValueError('Handling time cannot be in the future')
    if not selected or len(selected) != len(set(selected)):
        raise ValueError('Choose affected portions')
    targets = [p for p in store._portions(item) if p['n'] in selected]
    if len(targets) != len(selected) or any(p.get('status') != 'open' for p in targets):
        raise ValueError('Choose available portions')
    changes = []
    template = store.get_template(item.get('template_id')) or {}
    lifetime = hours(template.get('after_opening_hours' if action == 'opened' else 'after_defrosting_hours') if lifetime == 'template' else lifetime)
    for p in targets:
        current = p.get('location',item['location'])
        if action == 'opened':
            if p.get('opened_at'):
                raise ValueError('Already opened; undo the previous event to correct it')
            delta = {'opened_at':when_dt.isoformat(),'opening_hours':lifetime}
            destination = template.get('after_opening_location') if location is None else location
            if destination:
                delta['location'] = store.validate_item_location(destination, current=current)
        elif action == 'start_defrost':
            if p.get('defrost_started_at') or p.get('defrosted_at'):
                raise ValueError('Defrosting already recorded; undo it before correcting')
            if store.locations.get(current,{}).get('storage_type') != 'freezer':
                raise ValueError('Start defrosting from a freezer location')
            destination = store.validate_item_location(location, current=current)
            if store.locations[destination]['storage_type'] != 'fridge':
                raise ValueError('Choose a fridge location')
            delta = {'location':destination,'defrost_started_at':when_dt.isoformat()}
        else:
            if not p.get('defrost_started_at') or p.get('defrosted_at'):
                raise ValueError('Start defrosting first, or undo the previous confirmation')
            if when_dt < timestamp(p['defrost_started_at']):
                raise ValueError('Fully defrosted time cannot precede starting defrosting')
            delta = {'defrosted_at':when_dt.isoformat(),'defrost_hours':lifetime}
        changes.append((p,delta))
    event = {'id':uuid.uuid4().hex,'action':'handling','handling_action':action,'item_id':item_id,
             'item':deepcopy(item),'ts':now.isoformat(),'by':by,'by_name':by_name,'handling_before':{},'handling_after':{}}
    for p,delta in changes:
        event['handling_before'][str(p['n'])] = {k:deepcopy(p[k]) for k in delta if k in p}
        event['handling_after'][str(p['n'])] = delta
        p.update(delta)
    store.history.insert(0,event)
    del store.history[500:]
    item['updated_at']=now.isoformat()
    return event


def undo_event(store, event):
    item=store.items.get(event['item_id'])
    if not item:
        return None
    if any('location' in delta for delta in event['handling_after'].values()) and item.get('location') != event['item'].get('location'):
        return None
    portions={str(p['n']):p for p in store._portions(item)}
    for n,after in event['handling_after'].items():
        p=portions.get(n)
        if not p or p.get('status')!='open' or any(p.get(k)!=v for k,v in after.items()):
            return None
        if event['handling_action']=='start_defrost' and p.get('defrosted_at'):
            return None
    for n,after in event['handling_after'].items():
        for key in after:
            if key in event['handling_before'][n]:portions[n][key]=event['handling_before'][n][key]
            else:portions[n].pop(key,None)
    return item
