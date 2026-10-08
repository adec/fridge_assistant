"""Mutations must not be skipped while recipe refresh requests are running."""
import subprocess
import unittest
from pathlib import Path

class RequestQueueTests(unittest.TestCase):
    def test_refresh_then_map_and_recovery(self):
        root = Path(__file__).resolve().parents[1]
        script = r'''
import assert from 'node:assert/strict';
import { serializeRequests } from './custom_components/fridge_assistant/panel/lib/request-queue.js';
let finishRefresh;
const blocked = new Promise(resolve=>finishRefresh=resolve);
const calls=[];
const request=serializeRequests(async action=>{
 calls.push(action);
 if(action==='list') await blocked;
 if(action==='fail') throw new Error('failed');
 return true;
});
const refresh=request('list');
await Promise.resolve();
const link=request('map');
await Promise.resolve();
assert.deepEqual(calls,['list']);
finishRefresh();
assert.equal(await refresh,true);
assert.equal(await link,true);
assert.deepEqual(calls,['list','map']);
await assert.rejects(request('fail'));
assert.equal(await request('map'),true);
assert.deepEqual(calls,['list','map','fail','map']);
'''
        result = subprocess.run(['node','--input-type=module','-e',script],cwd=root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
