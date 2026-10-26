"""Combined inventory filters, date boundaries and legacy classifications."""
import subprocess
import unittest
from pathlib import Path

class InventoryFilterTests(unittest.TestCase):
    def test_combinations_dates_and_search(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
import assert from 'node:assert/strict';
import {emptyFilters,filterInventory,activeFilterGroups} from './custom_components/fridge_assistant/panel/lib/inventory-filters.js';
const rows=[
{id:'past',name:'Milk',code:'AB12',location:'fridge',kind:'ingredient',category:'dairy',days_left:-1,expiry_date:'2026-10-25',date_type:'use_by'},
{id:'today',name:'Curry',location:'freezer',kind:'dish',category:'dairy',days_left:0,expiry_date:'2026-10-26',date_type:'best_before'},
{id:'3',name:'Pepper',location:'fridge',kind:'ingredient',category:'veg',days_left:3,expiry_date:'2026-10-29',date_type:'best_before'},
{id:'7',name:'Bread',location:'cupboard',kind:'ingredient',category:'bakery',days_left:7,expiry_date:'2026-11-02'},
{id:'none',name:'Yeast',contents:'Active yeast',location:'cupboard',kind:'ingredient',category:'baking',days_left:null,expiry_date:null}
];
const ids=f=>filterInventory(rows,{...emptyFilters(),...f}).map(i=>i.id);
assert.equal(ids({}).length,5);
assert.deepEqual(ids({locations:['fridge','freezer'],categories:['dairy']}),['past','today']);
assert.deepEqual(ids({kind:'dish',categories:['dairy']}),['today']); // preserve legacy mixed-kind assignments
assert.deepEqual(ids({due:'past'}),['past']);assert.deepEqual(ids({due:'today'}),['today']);
assert.deepEqual(ids({due:'soon'}),['today','3']);assert.deepEqual(ids({due:'week'}),['today','3','7']);
assert.deepEqual(ids({due:'none'}),['none']);assert.deepEqual(ids({dateType:'best_before'}),['today','3']);
assert.deepEqual(ids({dateType:'use_by'}),['past','7']);
assert.deepEqual(ids({due:'custom',from:'2026-10-26',to:'2026-10-29'}),['today','3']);
assert.deepEqual(ids({due:'custom',to:'2026-10-25'}),['past']);assert.deepEqual(ids({due:'custom',from:'2026-10-27',to:'2026-10-25'}),[]);
assert.deepEqual(filterInventory(rows,emptyFilters(),{search:'ab12'}).map(i=>i.id),['past']);
assert.deepEqual(filterInventory(rows,emptyFilters(),{search:'ACTIVE'}).map(i=>i.id),['none']);
assert.equal(filterInventory(rows,{...emptyFilters(),locations:['fridge']},{skip:'locations'}).length,5);
const filters={...emptyFilters(),locations:['fridge'],due:'soon'};assert.deepEqual(activeFilterGroups(filters),['locations','due']);
const draft=JSON.parse(JSON.stringify(filters));draft.locations.push('freezer');assert.deepEqual(filters.locations,['fridge']);
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
