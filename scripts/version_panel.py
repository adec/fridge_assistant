"""Version every relative panel module import before publishing a release.

Run after changing manifest.json. The entry URL alone cannot invalidate imported
modules in an already-running Home Assistant browser.
"""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'custom_components' / 'fridge_assistant'
version = json.loads((root / 'manifest.json').read_text())['version']
pattern = re.compile(r'(\bfrom\s+[\"\'])(\.{1,2}/[^\"\'?]+\.js)(?:\?[^\"\']*)?([\"\'])')
for path in (root / 'panel').rglob('*.js'):
    if 'vendor' not in path.parts:
        original = path.read_text()
        updated = pattern.sub(lambda m: m[1] + m[2] + '?v=' + version + m[3], original)
        if original != updated:
            path.write_text(updated)
