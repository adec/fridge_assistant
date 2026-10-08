"""Category identity, reassignment and persistence protect existing inventory."""
import asyncio
import unittest
from unittest.mock import AsyncMock
from tests.test_store import make_store


class TestCategories(unittest.TestCase):
    def setUp(self):
        self.store = make_store('en')
        self.store.hass.async_add_executor_job = AsyncMock(side_effect=lambda fn: fn())

    def category(self, **extra):
        return self.store.save_category({'name': 'Desserts', 'kind': 'dish', **extra})

    def test_new_category_sets_default_kind_without_affecting_existing_item(self):
        cat = self.category()
        item = self.store.build_item({'name': 'New pudding', 'category': cat['id']})
        self.assertEqual(item['kind'], 'dish')
        self.store.save_category({'id': cat['id'], 'name': 'Sweet treats', 'kind': 'ingredient'})
        self.assertEqual(item['kind'], 'dish')
        self.assertEqual(self.store.categories[cat['id']]['name'], 'Sweet treats')

    def test_duplicate_name_case_insensitive(self):
        self.category()
        with self.assertRaises(ValueError):
            self.category(name='DESSERTS')

    def test_archive_preserves_assignments(self):
        cat = self.category()
        item = self.store.add_item(self.store.build_item({'name': 'Pudding', 'category': cat['id']}))
        self.store.save_category({'id': cat['id'], 'archived': True})
        self.assertEqual(item['category'], cat['id'])
        self.assertTrue(self.store.categories[cat['id']]['archived'])

    def test_used_category_removal_requires_replacement(self):
        cat = self.category()
        self.store.add_item(self.store.build_item({'name': 'Pudding', 'category': cat['id']}))
        with self.assertRaises(ValueError):
            self.store.remove_category(cat['id'])
        self.assertFalse(self.store.categories[cat['id']].get('deleted'))

    def test_removal_reassigns_stock_and_templates_preserving_kind_dates(self):
        cat = self.category()
        item = self.store.add_item(self.store.build_item({'name': 'Pudding', 'category': cat['id'], 'expiry_date': '2026-10-20'}))
        self.store.upsert_user_template({'id': 'pudding', 'name': 'Pudding', 'category': cat['id'], 'kind': 'dish', 'shelf_life': {'fridge': 3}})
        self.store.remove_category(cat['id'], 'other')
        self.assertEqual(item['category'], 'other')
        self.assertEqual(item['kind'], 'dish')
        self.assertEqual(item['expiry_date'], '2026-10-20')
        self.assertEqual(self.store.user_templates['pudding']['category'], 'other')
        self.assertEqual(self.store.user_templates['pudding']['kind'], 'dish')
        self.assertEqual(self.store.user_templates['pudding']['shelf_life'], {'fridge': 3})
        self.assertTrue(self.store.categories[cat['id']]['deleted'])

    def test_other_remains_available(self):
        for operation in [lambda: self.store.remove_category('other'), lambda: self.store.save_category({'id': 'other', 'archived': True})]:
            with self.assertRaises(ValueError): operation()

    def test_reorder_validates_complete_order(self):
        ids = list(reversed(self.store.categories))
        self.store.reorder_categories(ids)
        self.assertEqual(list(self.store.categories), ids)
        with self.assertRaises(ValueError): self.store.reorder_categories(ids[:-1])

    def test_round_trip_persists_custom_categories_and_order(self):
        cat = self.category()
        ids = list(reversed(self.store.categories))
        self.store.reorder_categories(ids)
        asyncio.run(self.store.async_save())
        other = make_store('en')
        other.hass.async_add_executor_job = AsyncMock(side_effect=lambda fn: fn())
        other._store.async_load = AsyncMock(return_value=self.store._store.saved)
        asyncio.run(other.async_load())
        self.assertEqual(list(other.categories), ids)
        self.assertEqual(other.categories[cat['id']]['name'], 'Desserts')

    def test_old_store_keeps_defaults(self):
        self.store._store.async_load = AsyncMock(return_value={'items': []})
        asyncio.run(self.store.async_load())
        self.assertIn('other', self.store.categories)
        self.assertGreater(len(self.store.categories), 1)
