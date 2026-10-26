"""Per-portion lifetimes never alter siblings, labels or previously established clocks."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock
import unittest
from tests.test_store import make_store
from tests.hastubs import load_module
h = load_module('handling')
s = load_module('store')
m = load_module('mealie_matching')
NOW = datetime(2026,10,26,18,tzinfo=timezone.utc)

class HandlingTests(unittest.TestCase):
    def setUp(self):
        self.store=make_store('en')
        self.template=self.store.upsert_user_template({'name':'Handling beans','kind':'ingredient','after_opening_hours':48,'after_defrosting_hours':24})
        self.item=self.store.add_item(self.store.build_item({'name':'Handling beans','template_id':self.template['id'],'location':'freezer','expiry_date':'2027-12-18','date_type':'best_before','portions':3}))
        self.original=deepcopy(self.item)

    def event(self,action,portions=None,now=NOW,lifetime='template',when=None,location='fridge'):
        return h.apply_event(self.store,self.item['id'],portions or [1],action,(when or now).isoformat(),location,lifetime,now)

    def test_move_one_portion_preserves_label_siblings_and_codes(self):
        self.event('start_defrost')
        p=self.item['portions']
        self.assertEqual(p[0]['location'],'fridge')
        self.assertNotIn('defrosted_at',p[0])
        self.assertEqual(p[1:],self.original['portions'][1:])
        self.assertEqual(self.item['expiry_date'],'2027-12-18')
        self.assertEqual(self.item['code'],self.original['code'])
        self.assertEqual([p['n'] for p in p],[1,2,3])
        self.assertEqual(len(h.inventory_groups(self.item,NOW)),2)

    def test_confirm_starts_timer_and_template_edits_do_not_reset_it(self):
        self.event('start_defrost',now=NOW-timedelta(hours=3))
        self.event('defrosted')
        self.store.upsert_user_template({'id':self.template['id'],'after_defrosting_hours':240})
        projection=h.projected_items(self.item,NOW)[0]
        self.assertEqual(h.timestamp(projection['handling_due_at']),NOW+timedelta(hours=24))
        self.assertEqual(self.item['portions'][0]['defrost_hours'],24)
        self.assertEqual(projection['handling_reason'],'defrosted')
        self.assertEqual(projection['date_type'],'best_before')
        self.assertEqual(projection['original_expiry_date'],'2027-12-18')

    def test_earliest_opened_and_thawed_deadline(self):
        self.event('start_defrost',now=NOW-timedelta(hours=3))
        self.event('defrosted')
        self.event('opened')
        self.assertEqual(h.earliest(self.item,NOW)['handling_reason'],'defrosted')

    def test_original_use_by_never_extended(self):
        self.item['expiry_date']='2026-10-26';self.item['date_type']='use_by'
        self.event('opened')
        self.assertIsNone(h.earliest(self.item,NOW)['handling_reason'])
        self.assertTrue(h.earliest(self.item,NOW)['handling_lifetime_configured'])
        self.assertEqual(self.item['expiry_date'],'2026-10-26')

    def test_empty_override_records_event_without_inventing_deadline(self):
        self.event('opened',lifetime=None)
        self.assertIsNone(self.item['portions'][0]['opening_hours'])
        self.assertIsNone(h.projected_items(self.item,NOW)[0]['handling_due_at'])

    def test_bulk_scope_and_atomic_validation(self):
        self.event('start_defrost',[1])
        before=deepcopy(self.item)
        with self.assertRaises(ValueError):self.event('defrosted',[1,2])
        self.assertEqual(self.item,before)
        self.event('opened',[1,2,3])
        self.assertTrue(all(p.get('opened_at') for p in self.item['portions']))
        self.assertEqual(len(self.item['portions']),3)

    def test_cannot_confirm_before_start_or_future(self):
        for action in ['defrosted']:
            with self.assertRaises(ValueError):self.event(action)
        with self.assertRaises(ValueError):self.event('opened',when=NOW+timedelta(minutes=1))
        self.event('start_defrost')
        with self.assertRaises(ValueError):self.event('defrosted',when=NOW-timedelta(hours=1))

    def test_invalid_destination_and_consumed_selection(self):
        with self.assertRaises(ValueError):self.event('start_defrost',location='pantry')
        self.store.consume_portion(self.item['id'],portion=2)
        with self.assertRaises(ValueError):self.event('opened',[1,2])
        self.assertNotIn('opened_at',self.item['portions'][0])

    def test_exact_overdue_in_same_day(self):
        self.event('opened',now=NOW-timedelta(hours=2),lifetime=1)
        with patch.object(s.dt_util,'now',return_value=NOW):
            self.assertLess(s.item_days_left(self.item,NOW.date()),0)
        self.assertTrue(h.earliest(self.item,NOW)['handling_overdue'])

    def test_undo_restores_only_affected_fields(self):
        event=self.event('start_defrost')
        self.event('opened',[2])
        self.assertIsNotNone(self.store.restore_item(event['id']))
        self.assertNotIn('location',self.item['portions'][0])
        self.assertIn('opened_at',self.item['portions'][1])

    def test_undo_requires_reverse_dependent_order_and_never_revives_consumed(self):
        start=self.event('start_defrost');thaw=self.event('defrosted')
        self.assertIsNone(self.store.restore_item(start['id']))
        self.assertIsNotNone(self.store.restore_item(thaw['id']))
        self.assertIsNotNone(self.store.restore_item(start['id']))
        opening=self.event('opened')
        self.store.consume_portion(self.item['id'],portion=1)
        self.assertIsNone(self.store.restore_item(opening['id']))

    def test_tracked_portions_not_removed_by_resize(self):
        self.event('opened',[3])
        self.store.set_portions(self.item['id'],1)
        self.assertEqual(self.item['portions'][0]['n'],3)
        self.assertIn('opened_at',self.item['portions'][0])

    def test_location_in_use_by_portion_is_protected(self):
        self.event('start_defrost')
        with self.assertRaises(ValueError):self.store.remove_location('fridge')

    def test_lifetime_validation(self):
        for value in [-1,0,False,float('nan'),float('inf'),9000]:
            with self.assertRaises(ValueError):h.hours(value)
        self.assertIsNone(h.hours(None));self.assertEqual(h.hours(1.5),1.5)
        with self.assertRaises(ValueError):h.timestamp('2026-10-26T12:00')

    def test_round_trip(self):
        self.event('start_defrost');self.event('defrosted');self.event('opened')
        asyncio.run(self.store.async_save())
        other=make_store('en');other.hass.async_add_executor_job=AsyncMock(side_effect=lambda fn:fn());other._store.async_load=AsyncMock(return_value=self.store._store.saved)
        asyncio.run(other.async_load())
        self.assertEqual(other.items[self.item['id']]['portions'],self.item['portions'])
        self.assertEqual(other.user_templates[self.template['id']]['after_opening_hours'],48)

    def test_recipe_uses_ready_portion_and_excludes_elapsed_handling(self):
        self.event('start_defrost');self.event('defrosted')
        args=dict(recipes=[{'id':'r','name':'Beans','ingredients':[{'food_id':'b','name':'Handling beans'}]}],foods=[{'id':'b','name':'Handling beans'}],templates=[self.template],items=[self.item],locations=self.store.locations,saved={},today=NOW.date(),now=NOW)
        recipe=m.rank_recipes(**args)[0]
        self.assertEqual(recipe['matched'][0]['portion'],1)
        self.assertFalse(recipe['matched'][0]['thaw'])
        args['now']=NOW+timedelta(hours=25);args['today']=args['now'].date()
        recipe=m.rank_recipes(**args)[0]
        self.assertNotEqual(recipe['matched'][0]['portion'],1)
        self.assertTrue(recipe['matched'][0]['thaw'])

    def test_cleanup_only_consumes_expired_portions(self):
        # Execute the real runtime method without importing HA's unrelated integrations.
        import ast
        from pathlib import Path
        from types import SimpleNamespace
        source=Path(s.__file__).with_name('coordinator.py').read_text()
        tree=ast.parse(source)
        cls=next(node for node in tree.body if isinstance(node,ast.ClassDef) and node.name=='FridgeRuntime')
        method=next(node for node in cls.body if isinstance(node,ast.AsyncFunctionDef) and node.name=='async_remove_expired')
        namespace={'__package__':s.__package__,'Any':object,'ACTION_TOSSED':'tossed','dt_util':s.dt_util,'item_days_left':s.item_days_left}
        exec(compile(ast.Module(body=[method],type_ignores=[]),'<runtime cleanup>','exec'),namespace)
        self.event('opened',now=NOW-timedelta(hours=2),lifetime=1)
        runtime=SimpleNamespace(store=self.store,async_changed=AsyncMock())
        with patch.object(s.dt_util,'now',return_value=NOW):
            removed=asyncio.run(namespace['async_remove_expired'](runtime))
        self.assertEqual(len(removed),1)
        self.assertIn(self.item['id'],self.store.items)
        self.assertEqual(self.item['portions'][0]['status'],'tossed')
        self.assertTrue(all(p['status']=='open' for p in self.item['portions'][1:]))
        runtime.async_changed.assert_awaited_once()

    def test_expired_handling_remains_active_independent_of_setting(self):
        self.event('opened',now=NOW-timedelta(hours=2),lifetime=1)
        with patch.object(s.dt_util,'now',return_value=NOW):
            self.assertEqual(len(self.store.expired_items()),1)
            self.assertEqual(len(self.store.soon_items(3)),0)
            self.assertEqual(self.store.expiring_items(3)[0]['id'],self.item['id'])
