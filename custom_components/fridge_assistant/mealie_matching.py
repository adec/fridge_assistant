"""Presence matching and use-first ranking; deliberately no unit arithmetic."""
from datetime import date
import unicodedata


def normal(value):
    return ' '.join(unicodedata.normalize('NFKC', value or '').casefold().split())


def food_links(foods, templates, saved):
    by_id = {t['id']: t for t in templates}
    names = {}
    for template in templates:
        for name in [template.get('name'), *template.get('aliases', [])]:
            key = normal(name)
            if key:
                names.setdefault(key, set()).add(template['id'])
    links = []
    for food in foods:
        explicit = saved.get(food['id'])
        candidates = names.get(normal(food.get('name')), set())
        target = explicit if explicit in by_id else next(iter(candidates)) if not explicit and len(candidates) == 1 else None
        links.append({**food, 'template_id': target,
                      'source': 'saved' if explicit and target else 'exact' if target else 'unmapped'})
    return links


def rank_recipes(recipes, foods, templates, items, locations, saved, today=None):
    today = today or date.today()
    links = {f['id']: f for f in food_links(foods, templates, saved)}
    stock = {}
    for item in items:
        # Meals are not treated as raw ingredients.
        if item.get('kind') in ('dish', 'meal') or (item.get('portions') and not any(p.get('status') == 'open' for p in item['portions'])):
            continue
        try:
            due = date.fromisoformat(item.get('expiry_date') or '')
        except (ValueError, TypeError):
            due = None
        days = (due - today).days if due else None
        if days is not None and days < 0 and item.get('date_type', 'use_by') != 'best_before':
            continue
        stock.setdefault(item.get('template_id'), []).append({
            'id': item['id'], 'name': item.get('name', ''), 'days': days,
            'past_best_before': days is not None and days < 0,
            'thaw': locations.get(item.get('location'), {}).get('storage_type') == 'freezer'})
    results = []
    for recipe in recipes:
        matched, missing, unresolved = [], [], []
        seen = set()
        for ingredient in recipe['ingredients']:
            food_id = ingredient.get('food_id')
            if food_id and food_id in seen:
                continue
            seen.add(food_id)
            link = links.get(food_id)
            name = ingredient.get('name') or ingredient.get('text') or 'Unknown ingredient'
            if not link or not link['template_id']:
                unresolved.append(name)
                continue
            available = stock.get(link['template_id'], [])
            if not available:
                missing.append(name)
                continue
            # Select one pack to explain priority; prefer earliest dated stock.
            chosen = min(available, key=lambda i: (i['days'] is None, i['days'] if i['days'] is not None else 0, i['thaw'], i['id']))
            matched.append({'ingredient': name, **chosen})
        due_soon = [i for i in matched if i['days'] is not None and i['days'] <= 3]
        results.append({**recipe, 'matched': matched, 'missing': missing, 'unresolved': unresolved,
                        'all_present': bool(recipe['ingredients']) and not missing and not unresolved,
                        'due_soon_count': len(due_soon),
                        'earliest_days': min((i['days'] for i in matched if i['days'] is not None), default=None)})
    # Complete recipes first, then fewer unknown/missing foods, then use-first priority.
    results.sort(key=lambda r: (not r['all_present'], len(r['missing']) + len(r['unresolved']),
                               -r['due_soon_count'], r['earliest_days'] is None,
                               r['earliest_days'] if r['earliest_days'] is not None else 0, r['name'].casefold()))
    return results
