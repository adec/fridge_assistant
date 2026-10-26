"""Compact shelf durations convert to calendar days without silent truncation."""
import subprocess
import unittest
from pathlib import Path


class ShelfDurationTests(unittest.TestCase):
    def test_parsing_and_round_trip(self):
        script = r'''
import assert from 'node:assert/strict';
import {parseShelfDuration as parse, formatShelfDuration as format} from './custom_components/fridge_assistant/panel/lib/durations.js';
for (const [input, expected] of [['',null],['  ',null],['0',null],['5',5],['5d',5],['2w',14],[' 5 W ',35],['3650d',3650]]) assert.equal(parse(input),expected);
for (const input of ['-1','1.5w','12h','1m','5days','Infinity','5w junk','522w','999999999999999999999']) assert.throws(()=>parse(input));
for(let days=1; days<=3650; days++) assert.equal(parse(format(days)),days);
assert.equal(format(35),'5w'); assert.equal(format(5),'5d'); assert.equal(format(null),'');
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
