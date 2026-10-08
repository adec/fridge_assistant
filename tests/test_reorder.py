"""Exercise pointer drops, cancellation and hidden category order with a DOM stub."""
import subprocess
import unittest
from pathlib import Path

class TestReorder(unittest.TestCase):
    def test_reorder_interactions(self):
        module = (Path(__file__).resolve().parents[1] / 'custom_components/fridge_assistant/panel/lib/reorder.js').as_uri()
        script = r'''
import assert from 'node:assert/strict';
const {bindReorder,mergeVisibleOrder}=await import(MODULE);
assert.deepEqual(mergeVisibleOrder(['a','hidden','b','c'],['c','a','b']),['c','hidden','a','b']);
globalThis.document={createElement:()=>({setAttribute(){},remove(){}})};
globalThis.requestAnimationFrame=()=>1; globalThis.cancelAnimationFrame=()=>{};
const saved=[];
const list={isConnected:true,parentElement:null,children:[],querySelectorAll(){return this.children.filter(x=>x.dataset)},append(x){this.children.push(x)},insertBefore(row,next){this.children.splice(this.children.indexOf(row),1);let n=this.children.indexOf(next);this.children.splice(n<0?this.children.length:n,0,row)}};
for(const id of ['a','b','c']) {
 const listeners={};
 const handle={disabled:false,setAttribute(){},addEventListener(n,fn){listeners[n]=fn},removeEventListener(){},setPointerCapture(){},hasPointerCapture(){return false},getRootNode(){return {activeElement:null}},focus(){},closest(){return row}};
 const row={dataset:{reorderId:id},classList:{add(){},remove(){}},querySelector(){return handle},getBoundingClientRect(){const i=list.children.indexOf(row);return {top:i*100,height:100}},get nextSibling(){return list.children[list.children.indexOf(row)+1]}};
 row.handle=handle;row.listeners=listeners;list.children.push(row);
}
const initial=list.children.slice();
const dispose=bindReorder(list,{save:ids=>saved.push(ids),label:id=>id,announcement:(p,n)=>`${p}/${n}`});
const event=y=>({button:0,pointerId:1,clientY:y,preventDefault(){}});
initial[2].listeners.pointerdown(event(250));initial[2].listeners.pointermove(event(0));initial[2].listeners.pointerup(event(0));
assert.deepEqual(saved.pop(),['c','a','b']);
initial[2].listeners.pointerdown(event(0));initial[2].listeners.pointermove(event(500));initial[2].listeners.pointercancel();
assert.equal(saved.length,0);assert.deepEqual(list.querySelectorAll().map(r=>r.dataset.reorderId),['c','a','b']);
initial[2].listeners.keydown({key:'End',preventDefault(){}});
assert.deepEqual(saved.pop(),['a','b','c']);
dispose();
'''.replace('MODULE', repr(module))
        result = subprocess.run(['node','--input-type=module','-e',script], capture_output=True, text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_category_kind_filter_preserves_existing_exceptions(self):
        module = (Path(__file__).resolve().parents[1] / 'custom_components/fridge_assistant/panel/lib/categories.js').as_uri()
        script = """
import assert from 'node:assert/strict';
const {categoryIds}=await import(MODULE);
const cats={fruit:{kind:'ingredient'},dinner:{kind:'dish'},old:{kind:'dish',archived:true},deleted:{kind:'ingredient',deleted:true}};
assert.deepEqual(categoryIds(cats,'ingredient'),['fruit']);
assert.deepEqual(categoryIds(cats,'dish'),['dinner']);
assert.deepEqual(categoryIds(cats,'ingredient','dinner',true),['fruit','dinner']);
assert.deepEqual(categoryIds(cats,'ingredient','old',true),['fruit','old']);
assert.deepEqual(categoryIds(cats,'ingredient','dinner'),['fruit']);
""".replace('MODULE', repr(module))
        result = subprocess.run(['node','--input-type=module','-e',script], capture_output=True, text=True)
        self.assertEqual(result.returncode,0,result.stderr)
