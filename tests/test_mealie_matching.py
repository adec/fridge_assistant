import unittest
from datetime import date
from tests.hastubs import load_module
m = load_module('mealie_matching')

class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.templates = [{'id': 'milk', 'name': 'Milk', 'aliases': ['whole milk']}, {'id': 'fish', 'name': 'Fish'}]
        self.foods = [{'id': 'm', 'name': ' WHOLE  MILK '}, {'id': 'f', 'name': 'Fish'}]
        self.recipes = [{'id': 'r', 'name': 'Dinner', 'ingredients': [{'food_id': 'm', 'name': 'Milk'}]}]
        self.items = [{'id': 'i', 'template_id': 'milk', 'name': 'Milk pack', 'expiry_date': '2026-10-06', 'location': 'cold'}]
    def rank(self, **kwargs):
        args = dict(recipes=self.recipes, foods=self.foods, templates=self.templates, items=self.items, locations={'cold': {'storage_type':'freezer'}}, saved={}, today=date(2026,10,6))
        args.update(kwargs)
        return m.rank_recipes(**args)
    def test_exact_alias_and_frozen_stock(self):
        r = self.rank()[0]
        self.assertTrue(r['all_present'])
        self.assertTrue(r['matched'][0]['thaw'])
        self.assertEqual(r['due_soon_count'],1)
    def test_past_use_by_excluded_today_included(self):
        self.items[0]['expiry_date']='2026-10-05'
        self.assertEqual(self.rank()[0]['missing'],['Milk'])
    def test_past_best_before_flagged(self):
        self.items[0].update(expiry_date='2026-10-05',date_type='best_before')
        self.assertTrue(self.rank()[0]['matched'][0]['past_best_before'])
    def test_unknown_date_has_no_priority(self):
        self.items[0]['expiry_date']='invalid'
        self.assertEqual(self.rank()[0]['due_soon_count'],0)
    def test_ambiguous_alias_needs_mapping(self):
        self.templates.append({'id':'other','name':'Whole milk'})
        self.assertFalse(self.rank()[0]['all_present'])
        self.assertTrue(self.rank(saved={'m':'milk'})[0]['all_present'])
    def test_missing_saved_target_does_not_fallback(self):
        self.assertEqual(self.rank(saved={'m':'deleted'})[0]['unresolved'],['Milk'])
    def test_unparsed_and_empty_recipes_not_complete(self):
        self.recipes[0]['ingredients']=[{'food_id':None,'text':'some salt'}]
        self.assertEqual(self.rank()[0]['unresolved'],['some salt'])
        self.recipes[0]['ingredients']=[]
        self.assertFalse(self.rank()[0]['all_present'])
    def test_duplicate_food_is_presence_once(self):
        self.recipes[0]['ingredients'] *= 2
        self.assertEqual(len(self.rank()[0]['matched']),1)
    def test_earliest_pack_selected_and_complete_first(self):
        self.items.append({**self.items[0],'id':'later','expiry_date':'2026-10-10'})
        self.recipes.append({'id':'missing','name':'Missing','ingredients':[{'food_id':'f','name':'Fish'}]})
        result=self.rank()
        self.assertEqual(result[0]['id'],'r')
        self.assertEqual(result[0]['matched'][0]['id'],'i')
    def test_meal_stock_does_not_supply_ingredients(self):
        self.items[0]['kind']='meal'
        self.assertFalse(self.rank()[0]['all_present'])
