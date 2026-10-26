"""Integer stock consumption, low-stock totals and dependency-safe undo."""
import unittest
from copy import deepcopy
from unittest.mock import AsyncMock
from tests.test_store import make_store
from tests.hastubs import load_module
stock = load_module('stock')


class StockTests(unittest.TestCase):
    def setUp(self):
        self.store = make_store('en')
        self.tpl = self.store.upsert_user_template({'name':'Dishwasher tablets','stock_mode':'count','stock_unit':'tablets','reorder_limit':15})

    def add(self, count=80, **fields):
        return self.store.add_item(self.store.build_item({'template_id':self.tpl['id'], 'stock_count':count, **fields}))

    def test_count_is_one_portion_and_template_default(self):
        item = self.add()
        self.assertEqual(len(item['portions']), 1)
        self.assertEqual(item['stock_count'], 80)
        item = self.store.build_item({'template_id':self.tpl['id']})
        self.assertEqual(item['stock_count'], 1)
        with self.assertRaises(ValueError): self.add(portions=80)
        with self.assertRaises(ValueError): self.store.set_portions(next(iter(self.store.items)), 2)

    def test_use_one_undo_and_manual_change_guard(self):
        item = self.add()
        event = stock.consume(self.store, self.tpl['id'], by='automation')
        self.assertEqual(item['stock_count'], 79)
        self.assertEqual(event['by'], 'automation')
        self.assertEqual(self.store.restore_item(event['id'])['stock_count'], 80)
        event = stock.consume(self.store, self.tpl['id'])
        self.store.update_item(item['id'], {'stock_count':70})
        self.assertIsNone(self.store.restore_item(event['id']))
        self.assertEqual(self.store.items[item['id']]['stock_count'], 70)

    def test_threshold_aggregates_restock_and_zero_stock(self):
        self.assertEqual(stock.low_stock(self.store)[0]['remaining'], 0)
        a = self.add(10); b = self.add(10)
        self.assertEqual(stock.low_stock(self.store), [])
        stock.consume(self.store, self.tpl['id'], 5)
        self.assertEqual(len(stock.low_stock(self.store)), 1)
        self.assertEqual(stock.low_stock(self.store)[0]['remaining'], 15)
        stock.consume(self.store, self.tpl['id'], 1)
        self.assertEqual(len(stock.low_stock(self.store)), 1)
        self.add(80)
        self.assertEqual(stock.low_stock(self.store), [])

    def test_earliest_date_then_oldest_undated_and_depletion_undo(self):
        later = self.add(10, expiry_date='2028-01-01', expiry_source='manual')
        early = self.add(2, expiry_date='2027-01-01', expiry_source='manual')
        undated = self.add(9, expiry_source='manual', added_date='2020-01-01')
        event = stock.consume(self.store, self.tpl['id'], 5)
        self.assertNotIn(early['id'], self.store.items)
        self.assertEqual(later['stock_count'], 7)
        self.assertEqual(undated['stock_count'], 9)
        self.store.restore_item(event['id'])
        self.assertEqual(self.store.items[early['id']]['stock_count'], 2)
        self.assertEqual(self.store.items[later['id']]['stock_count'], 10)
        self.assertEqual(len(self.store.history), 0)

    def test_insufficient_or_invalid_is_atomic(self):
        item = self.add(2)
        before = deepcopy(self.store.items)
        for amount in [3, 0, -1, 1.5, True]:
            with self.assertRaises(ValueError): stock.consume(self.store, self.tpl['id'], amount)
            self.assertEqual(self.store.items, before)
            self.assertEqual(self.store.history, [])
        for count in [0, -1, 1.2, True]:
            with self.assertRaises(ValueError): self.store.update_item(item['id'], {'stock_count':count, 'name':'wrong'})
        self.assertEqual(self.store.items, before)

    def test_specific_entry_and_consecutive_undo(self):
        a = self.add(5); b = self.add(5)
        first = stock.consume(self.store, self.tpl['id'], 1, b['id'])
        second = stock.consume(self.store, self.tpl['id'], 1, b['id'])
        self.assertEqual(a['stock_count'], 5)
        self.assertIsNone(self.store.restore_item(first['id']))
        self.assertIsNotNone(self.store.restore_item(second['id']))
        self.assertIsNotNone(self.store.restore_item(first['id']))
        self.assertEqual(self.store.items[b['id']]['stock_count'], 5)

    def test_packs_consume_whole_entries_and_portions_are_protected(self):
        t = self.store.upsert_user_template({'name':'Beans','reorder_limit':1})
        for _ in range(2): self.store.add_item(self.store.build_item({'template_id':t['id']}))
        event = stock.consume(self.store,t['id'],2)
        self.assertEqual(next(t for t in stock.low_stock(self.store) if t['template_id']==event['item']['template_id'])['remaining'],0)
        self.store.restore_item(event['id'])
        self.assertEqual(stock.total_for(self.store,t),2)
        self.store.add_item(self.store.build_item({'template_id':t['id'],'portions':2}))
        with self.assertRaises(ValueError): stock.consume(self.store,t['id'])

    def test_count_requires_template_and_mixed_stock_is_explicit(self):
        with self.assertRaises(ValueError): self.store.build_item({'name':'Loose count','stock_count':80})
        counted = self.add(6)
        ordinary = self.add(None)
        with self.assertRaises(ValueError): stock.consume(self.store,self.tpl['id'])
        event = stock.consume(self.store,self.tpl['id'],1.0,counted['id'])
        self.assertEqual(event['amount'],1)
        self.assertIsInstance(event['amount'],int)
        self.assertEqual(counted['stock_count'],5)
        self.assertIn(ordinary['id'],self.store.items)

    def test_oldest_undated_and_disabled_threshold(self):
        newer = self.add(5, added_date='2026-10-26', expiry_source='manual')
        older = self.add(5, added_date='2026-10-01', expiry_source='manual')
        stock.consume(self.store,self.tpl['id'])
        self.assertEqual(older['stock_count'],4)
        self.assertEqual(newer['stock_count'],5)
        self.store.upsert_user_template({'id':self.tpl['id'],'reorder_limit':None})
        self.assertEqual(stock.low_stock(self.store),[])

    def test_template_validation_and_mode_snapshot(self):
        for data in [{'reorder_limit':-1},{'reorder_limit':True},{'stock_mode':'weight'},{'stock_unit':'x'*41}]:
            with self.assertRaises(ValueError): self.store.upsert_user_template({'id':self.tpl['id'], **data})
        self.add()
        self.store.upsert_user_template({'id':self.tpl['id'],'stock_mode':'packs'})
        self.assertEqual(next(iter(self.store.items.values()))['stock_count'],80)


class StockPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_reload_preserves_count_limits_and_undo(self):
        store = make_store('en')
        t = store.upsert_user_template({'name':'Tablets','stock_mode':'count','reorder_limit':5})
        item = store.add_item(store.build_item({'template_id':t['id'],'stock_count':6}))
        event = stock.consume(store,t['id'])
        await store.async_save()
        restored = make_store('en')
        restored._store.async_load = AsyncMock(return_value=store._store.saved)
        restored.hass.async_add_executor_job = AsyncMock(side_effect=lambda func:func())
        await restored.async_load()
        self.assertEqual(stock.low_stock(restored)[0]['remaining'],5)
        self.assertEqual(restored.restore_item(event['id'])['stock_count'],6)


class StockRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_action_persists_attributes_and_fires_event_only_on_success(self):
        import sys
        import types
        from unittest.mock import patch, Mock
        components = types.ModuleType('homeassistant.components')
        components.persistent_notification = types.SimpleNamespace()
        entries = types.ModuleType('homeassistant.config_entries')
        entries.ConfigEntry = object
        dispatcher = types.ModuleType('homeassistant.helpers.dispatcher')
        dispatcher.async_dispatcher_send = Mock()
        with patch.dict(sys.modules, {'homeassistant.components':components, 'homeassistant.config_entries':entries, 'homeassistant.helpers.dispatcher':dispatcher}):
            runtime_module = load_module('coordinator')
        runtime = object.__new__(runtime_module.FridgeRuntime)
        runtime.store = make_store('en')
        runtime.hass = types.SimpleNamespace(bus=types.SimpleNamespace(async_fire=Mock()))
        template = runtime.store.upsert_user_template({'name':'Tablets','stock_mode':'count','reorder_limit':5})
        runtime.store.add_item(runtime.store.build_item({'template_id':template['id'],'stock_count':6}))
        result = await runtime.async_consume_stock(template['id'], by='user-1', by_name='Adrian')
        self.assertEqual(result['event']['by_name'],'Adrian')
        self.assertEqual(result['low_stock'][0]['remaining'],5)
        self.assertEqual(runtime.store._store.saved['items'][0]['stock_count'],5)
        runtime.hass.bus.async_fire.assert_called_once()
        self.assertEqual(runtime.hass.bus.async_fire.call_args.args[0],'fridge_assistant_stock_consumed')
        with self.assertRaises(ValueError): await runtime.async_consume_stock(template['id'],amount=6)
        runtime.hass.bus.async_fire.assert_called_once()
        self.assertEqual(runtime.store._store.saved['items'][0]['stock_count'],5)
