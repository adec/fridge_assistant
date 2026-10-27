"""Deployment packages isolate source and stamp imports without editing the checkout."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_dev', Path(__file__).resolve().parents[1]/'scripts/deploy_dev.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

class DevDeployTests(unittest.TestCase):
    def test_archive_is_source_only_and_does_not_change_source(self):
        source=deploy.ROOT/'custom_components/fridge_assistant/manifest.json'
        original=source.read_bytes()
        with tarfile.open(fileobj=io.BytesIO(deploy.archive())) as package:
            names=package.getnames()
            self.assertIn('manifest.json',names)
            self.assertFalse(any('__pycache__' in n or n.startswith(('/', '../', '.storage')) for n in names))
            version=json.load(package.extractfile('manifest.json'))['version']
            self.assertIn('.dev',version)
            panel=package.extractfile('panel/fridge-assistant-panel.js').read().decode()
            self.assertIn('?v='+version,panel)
        self.assertEqual(source.read_bytes(),original)

    def test_remote_program_compiles(self):
        compile(deploy.REMOTE,'remote_deploy','exec')

    def test_production_names_rejected(self):
        for host in ['production.example.invalid','PRODUCTION.EXAMPLE.INVALID']:
            with self.subTest(host=host), patch.object(Path,'exists',return_value=True), patch.object(Path,'read_text',return_value=json.dumps({'host':host,'user':'root','identity':'test','environment':'development','blocked_hosts':['production.example.invalid']})):
                with self.assertRaises(SystemExit):deploy.configuration()
