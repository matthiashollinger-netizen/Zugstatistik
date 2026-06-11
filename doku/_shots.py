#!/usr/bin/env python3
"""Erzeugt echte App-Screenshots per headless Edge.
Injiziert nach dem App-Init ein Stück JS, das die Beispiel-Daten lädt, den
direkten Dateizugriff (FSA) erzwingt (sonst wäre file:// im manuellen Modus)
und in die gewünschte Ansicht navigiert. Nur Fantasienamen (Beispiel-JSON).
Aufruf:  python3 doku/_shots.py
"""
import base64, json, os, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
IMG = os.path.join(ROOT, "doku", "img")
os.makedirs(IMG, exist_ok=True)

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
example = open(os.path.join(ROOT, "Statistik.beispiel.json"), encoding="utf-8").read()

# Gemeinsamer Init-Block, der NACH dem App-Script läuft.
# %%BODY%% wird je Shot ersetzt.
INIT = """
<script>
window.addEventListener('load', function () {
  try { fsaUsable = function () { return true; }; } catch (e) {}
  try { data = applyLoadedData(%%EX%%); } catch (e) { console.log('load', e); }
  fileMode = 'none';
  try { renderAll(); updateFileStatus(); } catch (e) { console.log('render', e); }
  // vom Init/Reconnect evtl. oben eingefügte Banner entfernen (saubere Shots)
  var main = document.querySelector('.app-main');
  if (main) [].slice.call(main.children).forEach(function (c) {
    if (c.classList && (c.classList.contains('notice') || c.classList.contains('notice-ok'))) c.remove();
  });
  function go(v){ var b=document.querySelector('#mainNav button[data-view="'+v+'"]'); if(b) b.click(); }
  %%BODY%%
  document.documentElement.setAttribute('data-shot-ready','1');
});
</script>
"""

SHOTS = {
    # Inbetriebnahme: Startbildschirm „Datei & Excel“ mit FSA-Buttons
    "datei-start": ("go('datei');", 1180, 760),
    # Inbetriebnahme: verbundener Zustand (grüne Statuszeile)
    "datei-verbunden": (
        "fileMode='fsa'; fileHandle={name:'Statistik.json'}; lastSavedAt='14:312'.slice(0,5);"
        "updateFileStatus(); go('datei');", 1180, 760),
    # Handbuch: Dashboard (Dran-Karten + Heatmap-Tabelle)
    "dashboard": ("go('dashboard');", 1320, 1180),
    # Handbuch: DF-Statistik isoliert (andere Dashboard-Karten ausblenden)
    "df-statistik": (
        "go('dashboard');"
        "document.querySelector('#dranCards').style.display='none';"
        "document.querySelectorAll('#view-dashboard > .card')[0].style.display='none';",
        1180, 560),
    # Handbuch: Dienst erfassen → Vorschau mit Beispiel-Paste
    "erfassen": (
        "go('erfassen');"
        "var plan=['RKT SBG Zug 11 - 16.06.2026','Tour / Fzg','Zeiten','Zimmer',"
        "'Fahrer','Transportf\\u00fchrer','2. Trspf. / Praktikant',"
        "' \\tR1','20-201\\t\\t18:30','06:00\\t1-37 ','1-36\\tHelga Innerhofer\\tPaul Cerny\\tNora Fuchs',"
        "' \\tK01','20-321\\t\\t18:30','06:00\\t2-35 ','2-34\\tMia Cerny\\tJonas Gruberbauer\\t'].join('\\n');"
        "document.querySelector('#pasteInput').value=plan;"
        "document.querySelector('#btnParse').click();", 1320, 1180),
    # Handbuch: Gäste-Ansicht
    "gaeste": ("go('gaeste');", 1180, 620),
    # Handbuch: Personen-Verwaltung
    "personen": ("go('personen');", 1320, 760),
    # Handbuch: Datenprüfung isoliert (nur die Datenprüfungs-Karte zeigen)
    "datenpruefung": (
        "go('datei');"
        "var cards=document.querySelectorAll('#view-datei > .card');"
        "[].slice.call(cards).forEach(function(c){ if(c.querySelector('#checkPanel')===null) c.style.display='none'; });",
        1180, 460),
}

def render(name, body, w, h):
    page = html.replace("</body>", INIT.replace("%%EX%%", example).replace("%%BODY%%", body) + "</body>")
    tmp = tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, dir=ROOT, encoding="utf-8")
    tmp.write(page); tmp.close()
    out = os.path.join(IMG, name + ".png")
    prof = "/tmp/edge-shot-" + name
    try:
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
                        "--no-pings", "--disable-background-networking",
                        "--hide-scrollbars", "--force-device-scale-factor=2",
                        "--user-data-dir=" + prof,
                        "--window-size=%d,%d" % (w, h),
                        "--virtual-time-budget=6000",
                        "--screenshot=" + out, "file://" + tmp.name],
                       capture_output=True, timeout=45)
    except subprocess.TimeoutExpired:
        pass
    # nur das eigene Shot-Edge beenden (nie das normale Edge des Nutzers)
    subprocess.run(["pkill", "-f", "edge-shot-" + name], capture_output=True)
    time.sleep(1)
    os.unlink(tmp.name)
    ok = os.path.exists(out) and os.path.getsize(out) > 2000
    print(("OK  " if ok else "ERR ") + name + (" (%d B)" % os.path.getsize(out) if ok else ""))

only = sys.argv[1:] or list(SHOTS)
for name in only:
    body, w, h = SHOTS[name]
    render(name, body, w, h)
