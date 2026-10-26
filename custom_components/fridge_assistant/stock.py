"""Simple integer counts and low-stock totals; no measured quantities."""
from copy import deepcopy
from datetime import datetime, timezone
import uuid


def integer(value, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= 1000000 or int(value) != value:
        raise ValueError(f'Enter a whole number from {minimum} to 1000000')
    return int(value)


def template_fields(data, existing):
    mode = data.get('stock_mode', existing.get('stock_mode', 'packs'))
    if mode not in ('packs', 'count'):
        raise ValueError('Stock mode must be packs or count')
    limit = data.get('reorder_limit', existing.get('reorder_limit'))
    if limit is not None:
        limit = integer(limit)
    unit = data.get('stock_unit', existing.get('stock_unit', ''))
    if not isinstance(unit, str) or len(unit) > 40:
        raise ValueError('Stock unit must be text of no more than 40 characters')
    return {'stock_mode':mode, 'stock_unit':unit.strip(), 'reorder_limit':limit}


def total_for(store, template):
    return sum(i.get('stock_count', 1) if i.get('stock_count') is not None else 1
               for i in store.items.values() if i.get('template_id') == template['id'])


def low_stock(store):
    return [{'template_id':t['id'], 'name':t['name'], 'emoji':t.get('emoji'),
             'remaining':total_for(store,t), 'limit':t['reorder_limit'],
             'unit':t.get('stock_unit','') if t.get('stock_mode') == 'count' else ''}
            for t in store.all_templates() if t.get('reorder_limit') is not None
            and total_for(store,t) <= t['reorder_limit']]


def consume(store, template_id, amount=1, item_id=None, by=None, by_name=None):
    amount = integer(amount, 1)
    template = store.get_template(template_id)
    if not template or template_id in store.hidden:
        raise ValueError('Choose an active template')
    items = [i for i in store.items.values() if i.get('template_id') == template_id and (not item_id or i['id'] == item_id)]
    if not items:
        raise ValueError('No matching stock entry')
    counted = items[0].get('stock_count') is not None
    if any((i.get('stock_count') is not None) != counted for i in items):
        raise ValueError('Stock tracking differs from this template. Edit the stock entries before consuming.')
    if any(len(i.get('portions', [])) > 1 or any(p.get('opened_at') or p.get('defrost_started_at') for p in i.get('portions', [])) for i in items):
        raise ValueError('Use the existing portion actions for individually tracked or handled portions')
    items.sort(key=lambda i:(not bool(i.get('expiry_date')), i.get('expiry_date') or '', i.get('added_date') or '', i['id']))
    if sum(i['stock_count'] if counted else 1 for i in items) < amount:
        raise ValueError('Insufficient stock; nothing was consumed')
    before, after = {}, {}
    remaining = amount
    for item in items:
        if not remaining:
            break
        iid = item['id']
        before[iid] = deepcopy(item)
        available = item['stock_count'] if counted else 1
        used = min(remaining, available)
        remaining -= used
        if used == available:
            store.items.pop(iid)
            after[iid] = None
        else:
            item['stock_count'] -= used
            item['stock_revision'] = uuid.uuid4().hex
            after[iid] = deepcopy(item)
    event = {'id':uuid.uuid4().hex, 'ts':datetime.now(timezone.utc).isoformat(),
             'action':'stock_consumed', 'amount':amount, 'by':by, 'by_name':by_name,
             'item':deepcopy(next(iter(before.values()))), 'stock_before':before, 'stock_after':after}
    store.history.insert(0,event)
    from .const import MAX_HISTORY
    del store.history[MAX_HISTORY:]
    return event


def undo(store, event):
    before, after = event['stock_before'], event['stock_after']
    if any(store.items.get(iid) != snapshot for iid, snapshot in after.items()):
        return None
    for iid, snapshot in before.items():
        store.items[iid] = deepcopy(snapshot)
    return store.items[next(iter(before))]
