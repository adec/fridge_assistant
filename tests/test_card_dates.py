"""Card dates distinguish distant years without lengthening nearby dates."""
import subprocess
import unittest
from pathlib import Path

class CardDateTests(unittest.TestCase):
    def test_calendar_year_threshold_and_leap_day(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
import assert from 'node:assert/strict';
import {fmtCardDate} from './custom_components/fridge_assistant/panel/lib/format.js';
assert.equal(fmtCardDate('2027-01-01','en','2026-10-09'),'1 Jan');
assert.equal(fmtCardDate('2027-10-09','en','2026-10-09'),'9 Oct');
assert.equal(fmtCardDate('2027-10-10','en','2026-10-09'),'10 Oct 2027');
assert.equal(fmtCardDate('2028-10-10','nl','2026-10-09'),'10 okt 2028');
assert.equal(fmtCardDate('2025-10-09','en','2026-10-09'),'9 Oct');
assert.equal(fmtCardDate(null,'en','2026-10-09'),'—');
assert.equal(fmtCardDate('2025-02-28','en','2024-02-29'),'28 Feb');
assert.equal(fmtCardDate('2025-03-01','en','2024-02-29'),'1 Mar 2025');
assert.equal(fmtCardDate('2024-03-01','en','2023-03-01'),'1 Mar');
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
