#!/bin/sh
# Prüft Parser und Excel-Import gegen die echten Referenzdateien in referenz/
# (gitignored — dieses Skript enthält keine Personendaten, die Daten werden
# nur lokal zur Laufzeit eingelesen). Ohne referenz/ wird übersprungen.
set -e
cd "$(dirname "$0")/.."

if [ ! -f referenz/Statistik_Zug_11_2026.xlsx ] || [ ! -f referenz/dienstplan_beispiel.txt ]; then
  echo "referenz/-Dateien nicht vorhanden — Real-Daten-Check übersprungen."
  exit 0
fi

REAL_JSON=$(mktemp /tmp/zugstat_real.XXXXXX)
python3 - "$REAL_JSON" <<'PYEOF'
import zipfile, json, sys
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z = zipfile.ZipFile('referenz/Statistik_Zug_11_2026.xlsx')
root = ET.fromstring(z.read('xl/sharedStrings.xml'))
T = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'
ss = [''.join(t.text or '' for t in si.iter(T)) for si in root.findall('m:si', NS)]

wb = ET.fromstring(z.read('xl/workbook.xml'))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
rid2file = {r.get('Id'): 'xl/' + r.get('Target') for r in rels}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
name2file = {s.get('name'): rid2file[s.get(RID)] for s in wb.findall('.//m:sheet', NS)}

def colnum(ref):
    c = 0
    for ch in ref:
        if ch.isalpha(): c = c * 26 + ord(ch.upper()) - 64
        else: break
    return c

def aoa(path):
    root = ET.fromstring(z.read(path))
    rows = []
    for row in root.findall('.//m:row', NS):
        r = int(row.get('r'))
        while len(rows) < r: rows.append([])
        cells = rows[r - 1]
        for c in row.findall('m:c', NS):
            col = colnum(c.get('r')); t = c.get('t')
            v = c.find('m:v', NS)
            if v is None or v.text is None: val = None
            elif t == 's': val = ss[int(v.text)]
            elif t in ('str', 'e'): val = v.text
            else:
                try: val = float(v.text)
                except ValueError: val = v.text
            while len(cells) < col: cells.append(None)
            cells[col - 1] = val
    return rows

def find(sub):
    for n, f in name2file.items():
        if sub.lower() in n.lower(): return aoa(f)
    raise SystemExit('Blatt nicht gefunden: ' + sub)

out = {
    'stammdaten': find('Stammdaten'),
    'anwesenheit': find('Anwesenheit'),
    'ktw': find('KTW'),
    'uebersicht': find('bersicht'),
    'plan': open('referenz/dienstplan_beispiel.txt', encoding='utf-8').read(),
}
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write('const REAL = ' + json.dumps(out, ensure_ascii=False) + ';\n')
PYEOF

CORE=$(mktemp /tmp/zugstat_core.XXXXXX)
sed -n '/CORE-START/,/CORE-END/p' index.html > "$CORE"
COMBINED=$(mktemp /tmp/zugstat_realcheck.XXXXXX)
cat "$CORE" "$REAL_JSON" tests/real-checks.js > "$COMBINED"

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
if [ -x "$JSC" ]; then "$JSC" "$COMBINED"
else node -e "global.print = console.log; require('$COMBINED');"
fi
rm -f "$CORE" "$REAL_JSON" "$COMBINED"
