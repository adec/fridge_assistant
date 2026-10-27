"""Grouping preserves rows and uses configured urgency without changing preferences."""
import subprocess
import unittest
from pathlib import Path

class InventoryGroupsTests(unittest.TestCase):
    def test_groups_and_saved_expansion(self):
        script=r'''
import assert from 'node:assert/strict';
import {groupInventory,groupingMode,groupExpanded} from './custom_components/fridge_assistant/panel/lib/inventory-groups.js';
const items=[{id:'later',expiry_date:'2030-01-01',days_left:9,location:'a',category:'b'},
{id:'none',expiry_date:null,days_left:null,location:'b',category:'a'},
{id:'soon',expiry_date:'2030-01-01',days_left:5,location:'b',category:'a'},
{id:'past',expiry_date:'2030-01-01',days_left:0,handling_overdue:true,location:'a',category:'b'}];
const original=JSON.stringify(items);
assert.deepEqual(groupInventory(items,'due',{warnDays:5}).map(g=>[g.key,g.items.map(i=>i.id)]),[['past',['past']],['soon',['soon']],['later',['later']],['none',['none']]]);
assert.equal(JSON.stringify(items),original);
assert.deepEqual(groupInventory(items,'location',{locationLabel:k=>k==='a'?'Zulu':'Alpha'}).map(g=>g.key),['b','a']);
assert.deepEqual(groupInventory(items,'category').map(g=>g.items.length),[2,2]);
assert.deepEqual(groupInventory(items,'none')[0].items,items);
assert.deepEqual(groupInventory([],'due'),[]);
assert.equal(groupingMode('auto','due-desc'),'due');assert.equal(groupingMode('auto','name'),'none');assert.equal(groupingMode('auto','location'),'location');assert.equal(groupingMode('category','due'),'category');
const saved={'due:past':false,'due:later':true};const before=JSON.stringify(saved);
assert.equal(groupExpanded('due','past',saved),false);assert.equal(groupExpanded('due','later',{}),false);assert.equal(groupExpanded('due','soon',{}),true);
assert.equal(groupExpanded('due','past',saved,'milk'),true);assert.equal(JSON.stringify(saved),before);
assert.equal(groupExpanded('location','a',{}),true);
'''
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
