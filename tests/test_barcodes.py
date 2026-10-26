"""Permanent barcode ownership is independent of inventory/history."""
import unittest
from unittest.mock import AsyncMock
from tests.test_store import make_store
from tests.hastubs import load_module

barcodes = load_module('barcodes')


class BarcodeTests(unittest.TestCase):
    def test_validation_and_leading_zeroes(self):
        self.assertEqual(barcodes.barcode_list([' 00123456 ', '00123456','0012345678901']), ['00123456','0012345678901'])
        for value in [None, '12345678', ['letters12345678'], [12345678], ['１２３４５６７８'], ['1234567'], ['1'*15], ['1'*8]*201]:
            with self.assertRaises(ValueError): barcodes.barcode_list(value)

    def test_many_codes_one_template_and_partial_update(self):
        store = make_store('en')
        t = store.upsert_user_template({'name':'Tinned beans','barcodes':['00123456','9876543210123']})
        for code in t['barcodes']: self.assertEqual(store.template_for_barcode(code)['id'], t['id'])
        store.upsert_user_template({'id':t['id'],'name':'Beans renamed'})
        self.assertEqual(store.template_for_barcode('00123456')['name'], 'Beans renamed')
        self.assertEqual(store.items, {})
        self.assertEqual(store.history, [])

    def test_conflict_atomic_remove_and_reassign(self):
        store = make_store('en')
        a = store.upsert_user_template({'name':'A','barcodes':['00123456']})
        b = store.upsert_user_template({'name':'B'})
        with self.assertRaises(ValueError): store.upsert_user_template({'id':b['id'],'name':'Changed','barcodes':['00123456']})
        self.assertEqual(store.get_template(b['id'])['name'], 'B')
        store.upsert_user_template({'id':a['id'],'barcodes':[]})
        self.assertIsNone(store.template_for_barcode('00123456'))
        store.upsert_user_template({'id':b['id'],'barcodes':['00123456']})
        self.assertEqual(store.template_for_barcode('00123456')['id'], b['id'])
        store.remove_user_template(b['id'])
        self.assertIsNone(store.template_for_barcode('00123456'))

    def test_link_stock_barcode_without_retaining_stock(self):
        store = make_store('en')
        t = store.upsert_user_template({'name':'Tinned beans'})
        item = store.build_item({'template_id':t['id'],'barcode':'00123456'})
        store.link_item_barcode(item)
        store.link_item_barcode(item)
        self.assertEqual(store.get_template(t['id'])['barcodes'], ['00123456'])
        self.assertEqual(store.template_for_barcode('00123456')['name'], 'Tinned beans')
        with self.assertRaises(ValueError): store.link_item_barcode({'barcode':'00123456'})

    def test_link_at_limit_is_idempotent(self):
        store = make_store('en')
        codes = [f'{n:08}' for n in range(200)]
        t = store.upsert_user_template({'name':'Beans','barcodes':codes})
        store.link_item_barcode({'template_id':t['id'],'barcode':codes[0]})
        self.assertEqual(len(store.get_template(t['id'])['barcodes']), 200)
        with self.assertRaises(ValueError): store.link_item_barcode({'template_id':t['id'],'barcode':'99999999'})
        self.assertEqual(len(store.get_template(t['id'])['barcodes']), 200)

    def test_builtin_override_preserves_template_and_hidden_lifecycle(self):
        store = make_store('en')
        t = store.all_templates()[0]
        store.link_item_barcode({'template_id':t['id'],'barcode':'00123456'})
        self.assertEqual(store.get_template(t['id'])['shelf_life'], t['shelf_life'])
        store.hide_template(t['id'])
        self.assertIsNone(store.template_for_barcode('00123456'))
        store.unhide_template(t['id'])
        self.assertIsNone(store.template_for_barcode('00123456'))


class BarcodePersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_survives_save_and_reload(self):
        store = make_store('en')
        t = store.upsert_user_template({'name':'Beans','barcodes':['00123456','9876543210123']})
        await store.async_save()
        restored = make_store('en')
        restored._store.async_load = AsyncMock(return_value=store._store.saved)
        restored.hass.async_add_executor_job = AsyncMock(side_effect=lambda func: func())
        await restored.async_load()
        for code in t['barcodes']: self.assertEqual(restored.template_for_barcode(code)['id'], t['id'])
