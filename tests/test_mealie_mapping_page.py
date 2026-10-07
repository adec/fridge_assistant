"""Verify filtering and pagination for large ingredient catalogues."""
import subprocess
import unittest
from pathlib import Path

class MappingPageTests(unittest.TestCase):
    def test_catalogue_filters_search_and_page_clamping(self):
        root = Path(__file__).resolve().parents[1]
        code = r'''
import assert from 'node:assert/strict';
import { mappingPage } from './custom_components/fridge_assistant/panel/views/mealie-mappings.js';
const data = {templates:[{id:'t',name:'Bell pepper'}],foods:Array.from({length:80},(_,i)=>({id:String(i),name:`Ingredient ${String(i).padStart(3,'0')}`,used_in_recipes:i<60,source:i<55?'unmapped':i<70?'exact':'saved',template_id:i>=55?'t':null}))};
assert.equal(mappingPage(data).total,55);
assert.equal(mappingPage(data).rows.length,25);
assert.equal(mappingPage(data,{page:2}).rows.length,5);
assert.equal(mappingPage(data,{page:99}).page,2);
assert.equal(mappingPage(data,{source:'all'}).total,60);
assert.equal(mappingPage(data,{source:'all',usedOnly:false}).total,80);
assert.equal(mappingPage(data,{source:'all',usedOnly:false,query:'BELL PEPPER'}).total,25);
assert.equal(mappingPage(data,{source:'saved',usedOnly:false}).total,10);
assert.equal(mappingPage(data,{query:'not here',page:8}).page,0);
'''
        result = subprocess.run(['node','--input-type=module','-e',code],cwd=root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
