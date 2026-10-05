"""Date meanings survive migration, template edits and item/history operations."""
import asyncio
import copy
import unittest
from tests.hastubs import fake_hass, load_module
store_mod = load_module('store')

class TestDateTypes(unittest.TestCase):
    def setUp(self):
        self.store = store_mod.FridgeStore(fake_hass('en'))
        self.store._seed = self.store._read_seed()

    def template(self):
        return self.store.upsert_user_template({'name':'Quality crackers','date_type':'best_before','shelf_life':{'pantry':30}})

    def test_new_item_inherits_matched_template(self):
        tpl=self.template()
        item=self.store.build_item({'name':tpl['name'],'location':'pantry','added_date':'2026-10-06'})
        self.assertEqual(item['date_type'],'best_before')
        self.assertEqual(item['expiry_date'],'2026-11-05')

    def test_explicit_override_and_template_changes_are_independent(self):
        tpl=self.template()
        item=self.store.add_item(self.store.build_item({'name':'Quality crackers','template_id':tpl['id'],'date_type':'use_by'}))
        self.store.upsert_user_template({'id':tpl['id'],'date_type':'best_before'})
        self.assertEqual(item['date_type'],'use_by')
        before=item['expiry_date']
        self.store.update_item(item['id'],{'date_type':'best_before'})
        self.assertEqual(item['expiry_date'],before)
        self.store.upsert_user_template({'id':tpl['id'],'date_type':'use_by'})
        self.assertEqual(item['date_type'],'best_before')

    def test_invalid_type_update_is_atomic(self):
        item=self.store.add_item(self.store.build_item({'name':'Milk'}));before=copy.deepcopy(item)
        with self.assertRaises(ValueError):self.store.update_item(item['id'],{'name':'Changed','date_type':'bad'})
        self.assertEqual(item,before)
        with self.assertRaises(ValueError):self.store.build_item({'name':'Milk','date_type':'bad'})
        with self.assertRaises(ValueError):self.store.upsert_user_template({'name':'Bad','date_type':'bad'})

    def test_old_data_defaults_without_changing_dates_or_saved_types(self):
        data={'items':[{'id':'a','expiry_date':'2026-10-06'},{'id':'b','date_type':'best_before'}], 'user_templates':[{'id':'t'}], 'history':[{'item':{'id':'h','expiry_date':'2026-10-01'}}]}
        result=asyncio.run(self.store._store._async_migrate_func(5,1,copy.deepcopy(data)))
        self.assertEqual(result['items'][0],{**data['items'][0],'date_type':'use_by'})
        self.assertEqual(result['items'][1]['date_type'],'best_before')
        self.assertEqual(result['user_templates'][0]['date_type'],'use_by')
        self.assertEqual(result['history'][0]['item'],{**data['history'][0]['item'],'date_type':'use_by'})
        self.assertEqual(asyncio.run(self.store._store._async_migrate_func(5,1,copy.deepcopy(result))),result)

    def test_history_and_undo_keep_date_meaning(self):
        item=self.store.add_item(self.store.build_item({'name':'Crackers','date_type':'best_before'}))
        event=self.store.complete_item(item['id'],'eaten')
        self.assertEqual(event['item']['date_type'],'best_before')
        restored=self.store.restore_item(event['id'])
        self.assertEqual(restored['date_type'],'best_before')

    def test_builtins_default_to_use_by(self):
        self.assertTrue(all(t['date_type']=='use_by' for t in self.store._seed.values()))

    def test_persistence_retains_item_and_template_types(self):
        tpl=self.template();item=self.store.add_item(self.store.build_item({'name':'Crackers','template_id':tpl['id']}))
        saved={}
        async def save(data): saved.update(copy.deepcopy(data))
        async def load():return saved
        async def executor(fn):return fn()
        self.store._store.async_save=save
        asyncio.run(self.store.async_save())
        loaded=store_mod.FridgeStore(fake_hass('en'));loaded._store.async_load=load;loaded.hass.async_add_executor_job=executor
        asyncio.run(loaded.async_load())
        self.assertEqual(loaded.items[item['id']]['date_type'],'best_before')
        self.assertEqual(loaded.get_template(tpl['id'])['date_type'],'best_before')
