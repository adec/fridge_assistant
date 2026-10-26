"""Location summary uses distinct locations of remaining stock, including moved single jars."""
import subprocess
import unittest
from pathlib import Path


class InspectorLocationTests(unittest.TestCase):
    def test_remaining_portion_locations(self):
        script = r'''
import assert from 'node:assert/strict';
import {currentPortionLocations as locations} from './custom_components/fridge_assistant/panel/views/inspector.js';
const batch = {location:'pantry',portions:[{n:1,status:'open'}],portion_states:[{portion_number:1,location:'fridge'}]};
assert.deepEqual(locations(batch),['fridge']); // Previously reported multiple locations.
assert.deepEqual(locations({...batch,portions:[{n:1,status:'open',location:'fridge'}]}),['fridge']);
assert.deepEqual(locations({location:'pantry',portions:[{n:1,status:'open',location:'fridge'},{n:2,status:'open',location:'fridge'}]}),['fridge']);
assert.deepEqual(locations({location:'pantry',portions:[{n:1,status:'open',location:'fridge'},{n:2,status:'open'}]}),['fridge','pantry']);
assert.deepEqual(locations({location:'pantry',portions:[{n:1,status:'open',location:'fridge'},{n:2,status:'eaten',location:'pantry'},{n:3,status:'tossed',location:'freezer'}]}),['fridge']);
assert.deepEqual(locations({location:'pantry'}),['pantry']); // Legacy stock.
assert.deepEqual(locations({location:'custom-fridge',stock_count:80}),['custom-fridge']);
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
