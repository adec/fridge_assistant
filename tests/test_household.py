"""Household stock stays count-only without changing existing food entries."""
import unittest
from tests.test_store import make_store
from tests.hastubs import load_module
stock=load_module('stock')
handling=load_module('handling')

class HouseholdTests(unittest.TestCase):
    def setUp(self):
        self.store=make_store('en')
        self.tpl=self.store.upsert_user_template({'name':'Dishwasher tablets','kind':'household','category':'household','stock_mode':'packs','stock_unit':'tablets','reorder_limit':10,'shelf_life':{'freezer':30},'after_opening_hours':24})

    def test_template_and_stock_are_counts_without_food_defaults(self):
        self.assertEqual(self.tpl['stock_mode'],'count')
        self.assertEqual(self.tpl['shelf_life'],{})
        self.assertIsNone(self.tpl['after_opening_hours'])
        for location in self.store.active_locations():
            item=self.store.build_item({'template_id':self.tpl['id'],'location':location})
            self.assertEqual(item['kind'],'household')
            self.assertEqual(item['stock_count'],1)
            self.assertIsNone(item['expiry_date'])
            self.assertEqual(len(item['portions']),1)

    def test_optional_date_and_consumption(self):
        item=self.store.add_item(self.store.build_item({'template_id':self.tpl['id'],'stock_count':80,'expiry_date':'2030-12-31'}))
        stock.consume(self.store,self.tpl['id'],amount=1)
        self.assertEqual(self.store.items[item['id']]['stock_count'],79)
        self.assertEqual(self.store.items[item['id']]['expiry_date'],'2030-12-31')
        with self.assertRaises(ValueError):self.store.set_portions(item['id'],2)
        with self.assertRaises(ValueError):self.store.build_item({'template_id':self.tpl['id'],'portions':2})
        with self.assertRaises(ValueError):self.store.update_item(item['id'],{'stock_count':1.5})
        self.store.update_item(item['id'],{'stock_count':None})
        self.assertEqual(self.store.items[item['id']]['stock_count'],79)

    def test_legacy_food_is_not_reclassified_when_template_changes(self):
        template=self.store.upsert_user_template({'name':'Existing food','kind':'ingredient','shelf_life':{'fridge':5}})
        item=self.store.add_item(self.store.build_item({'template_id':template['id'],'location':'fridge'}))
        self.store.upsert_user_template({'id':template['id'],'kind':'household'})
        self.assertEqual(item['kind'],'ingredient')
        self.assertNotIn('stock_count',item)
        self.assertIsNotNone(item['expiry_date'])

    def test_household_requires_template_and_rejects_portion_conversion(self):
        with self.assertRaises(ValueError):self.store.build_item({'name':'No template','kind':'household'})
        food=self.store.upsert_user_template({'name':'Food','kind':'ingredient'})
        item=self.store.add_item(self.store.build_item({'template_id':food['id'],'portions':2}))
        with self.assertRaises(ValueError):self.store.update_item(item['id'],{'kind':'household'})
        self.assertEqual(item['kind'],'ingredient')

    def test_household_is_excluded_from_mealie_even_with_saved_link(self):
        matching=load_module('mealie_matching')
        foods=[{'id':'food','name':'Dishwasher tablets'}]
        links=matching.food_links(foods,[self.tpl],{'food':self.tpl['id']})
        self.assertIsNone(links[0]['template_id'])

    def test_household_defaults_to_cupboard_but_preserves_explicit_locations(self):
        item=self.store.build_item({'template_id':self.tpl['id']})
        self.assertEqual(item['location'],'pantry')
        item=self.store.add_item(self.store.build_item({'template_id':self.tpl['id'],'location':'freezer'}))
        self.assertEqual(item['location'],'freezer')
        self.store.update_item(item['id'],{'stock_count':4})
        self.assertEqual(item['location'],'freezer')

    def test_household_backend_defaults_are_english(self):
        const=load_module('const')
        self.assertEqual(const.KINDS['household']['short'],'Household')
        self.assertEqual(self.store.categories['household']['label'],'Household')
