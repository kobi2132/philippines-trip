"""Build a single self-contained HTML file with the trip data baked in.

Used for previews (no sign-in) and for local testing:
    python3 tools/build_preview.py path/to/trip.json out.html
The output contains personal data: never commit it.
"""
import json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
trip_path, out_path = sys.argv[1], sys.argv[2]
trip = json.loads(Path(trip_path).read_text(encoding='utf-8'))
html = (root / 'index.html').read_text(encoding='utf-8')

css = (root / 'css/app.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="css/app.css">', f'<style>\n{css}\n</style>')
html = re.sub(r'\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>', '', html)

data = json.dumps(trip, ensure_ascii=False).replace('</', '<\\/')
def inline(m):
    src = m.group(1)
    code = (root / src).read_text(encoding='utf-8')
    extra = f'window.TRIP_DATA = {data};\n' if src == 'js/config.js' else ''
    return f'<script>\n{extra}{code}\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
Path(out_path).write_text(html, encoding='utf-8')
print('wrote', out_path, len(html), 'bytes')
