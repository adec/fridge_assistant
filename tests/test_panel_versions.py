"""Prevent mixed frontend modules after an integration update."""
import json
import re
import unittest
from pathlib import Path

class PanelVersionTests(unittest.TestCase):
    def test_all_relative_imports_use_manifest_version(self):
        root = Path(__file__).resolve().parents[1] / 'custom_components/fridge_assistant'
        version = json.loads((root / 'manifest.json').read_text())['version']
        for path in (root / 'panel').rglob('*.js'):
            if 'vendor' in path.parts:
                continue
            for target in re.findall(r'\bfrom\s+["\'](\.{1,2}/[^"\']+)["\']', path.read_text()):
                with self.subTest(module=path.name, target=target):
                    self.assertEqual(target.partition('?')[2], 'v=' + version)
                    self.assertTrue((path.parent / target.partition('?')[0]).is_file())
