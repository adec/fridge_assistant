"""Month-only dates retain precision and resolve to the final calendar day."""
import subprocess
import unittest
from pathlib import Path
from tests.hastubs import load_module
from tests.test_store import make_store

precision = load_module('date_precision')


class DatePrecisionTests(unittest.TestCase):
    def test_calendar_boundaries(self):
        for value, expected in [('2028-02-01','2028-02-29'),('2027-02-15','2027-02-28'),('2100-02-01','2100-02-28'),('2000-02-01','2000-02-29'),('2026-04-01','2026-04-30'),('2026-12-01','2026-12-31')]:
            self.assertEqual(precision.normalise_expiry(value, 'month'), expected)
        self.assertIsNone(precision.normalise_expiry(None, 'month'))
        with self.assertRaises(ValueError): precision.normalise_expiry(None, 'invalid')

    def test_store_create_edit_and_legacy_update(self):
        store = make_store('en')
        item = store.add_item(store.build_item({'name':'Beans','expiry_date':'2028-02-01','expiry_precision':'month','expiry_source':'manual'}))
        self.assertEqual(item['expiry_date'], '2028-02-29')
        self.assertEqual(item['expiry_precision'], 'month')
        store.update_item(item['id'], {'notes':'keep month'})
        self.assertEqual(item['expiry_precision'], 'month')
        store.update_item(item['id'], {'expiry_date':'2028-04-01','expiry_precision':'month'})
        self.assertEqual(item['expiry_date'], '2028-04-30')
        store.update_item(item['id'], {'expiry_date':'2028-04-12'})
        self.assertEqual(item['expiry_precision'], 'day')
        self.assertEqual(item['expiry_date'], '2028-04-12')
        with self.assertRaises(ValueError): store.update_item(item['id'], {'expiry_precision':'wrong','name':'changed'})
        self.assertEqual(item['name'], 'Beans')

    def test_handling_deadline_uses_exact_precision(self):
        from datetime import datetime, timezone
        handling = load_module('handling')
        item = {'expiry_date':'2028-02-29','expiry_precision':'month','date_type':'best_before'}
        portion = {'n':1,'opened_at':'2026-10-26T12:00:00+00:00','opening_hours':24}
        projected = handling.portion_projection(item, portion, datetime(2026,10,26,tzinfo=timezone.utc))
        self.assertEqual(projected['expiry_precision'], 'day')
        self.assertEqual(projected['original_expiry_precision'], 'month')
        details = load_module('label_details').label_sections(projected)
        self.assertIn('Best Before: Feb 2028', details[0][1])
        projected = handling.portion_projection(item, {'n':1}, datetime(2026,10,26,tzinfo=timezone.utc))
        self.assertEqual(projected['expiry_precision'], 'month')

    def test_browser_calendar_and_display(self):
        script = r'''
import assert from 'node:assert/strict';
import {monthEnd} from './custom_components/fridge_assistant/panel/lib/date-precision.js';
import {fmtCardDate} from './custom_components/fridge_assistant/panel/lib/format.js';
for (const [input,expected] of [['2028-02','2028-02-29'],['2027-02','2027-02-28'],['2100-02','2100-02-28'],['2000-02','2000-02-29'],['2026-04','2026-04-30'],['2026-12','2026-12-31'],['','']]) assert.equal(monthEnd(input), expected);
for (const value of ['2026-00','2026-13','no','0000-02']) assert.throws(()=>monthEnd(value));
assert.equal(fmtCardDate('2028-02-29','en','2026-10-26','month'),'Feb 2028');
assert.equal(fmtCardDate('2026-12-31','en','2026-10-26','month'),'Dec 2026');
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
