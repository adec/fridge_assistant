"""Dashboard launch navigation never sends users to an external or API URL."""
import subprocess
import unittest
from pathlib import Path


class LaunchNavigationTests(unittest.TestCase):
    def test_explicit_same_origin_return_path(self):
        script = r'''
import assert from 'node:assert/strict';
import {homePath} from './custom_components/fridge_assistant/panel/lib/navigation.js';
const origin='https://ha.example';
assert.equal(homePath('',origin),null);
assert.equal(homePath('?return_to=%2Fcasora-dashboard%2Fkitchen',origin),'/casora-dashboard/kitchen');
assert.equal(homePath('?return_to=%2Flovelace%2Fhome%3Fkiosk%3D1%23top',origin),'/lovelace/home?kiosk=1#top');
for(const path of ['https://evil.example/','//evil.example/','/\\evil.example/','javascript:alert(1)','/api/services/homeassistant/restart','/fridge-assistant']) assert.equal(homePath('?return_to='+encodeURIComponent(path),origin),null);
'''
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[1],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
