#!/usr/bin/env python3
"""Wandelt die Doku-Markdown-Dateien in PDF um.
Kein pandoc nötig: eigener kleiner Markdown->HTML-Konverter + Edge --print-to-pdf.
Aufruf:  python3 doku/build-pdf.py
Ergebnis: doku/Zug11-Inbetriebnahme.pdf und doku/Zug11-Handbuch.pdf
"""
import html as _html
import os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOKU = os.path.join(ROOT, "doku")
EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"

CSS = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #1a1d23; font-size: 11.5pt; line-height: 1.5; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: -.01em; }
h2 { font-size: 15pt; margin: 20pt 0 6pt; padding-bottom: 3pt;
  border-bottom: 2px solid #E2001A; }
h3 { font-size: 12.5pt; margin: 14pt 0 4pt; color: #9F0012; }
p { margin: 6pt 0; }
a { color: #154FAE; text-decoration: none; }
ul, ol { margin: 6pt 0; padding-left: 22pt; }
li { margin: 3pt 0; }
code { font-family: "SF Mono", Consolas, monospace; font-size: 10pt;
  background: #f1f3f5; padding: 1px 4px; border-radius: 3px; }
strong { font-weight: 650; }
hr { border: none; border-top: 1px solid #dde2e8; margin: 14pt 0; }
blockquote { margin: 8pt 0; padding: 8pt 12pt; background: #FFF8EB;
  border-left: 4px solid #C77700; border-radius: 4px; }
blockquote p { margin: 3pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10.5pt; }
th, td { border: 1px solid #cfd5dc; padding: 4pt 8pt; text-align: left; vertical-align: top; }
th { background: #f1f3f5; }
figure { margin: 10pt 0; text-align: center; page-break-inside: avoid; }
figure img { max-width: 100%; border: 1px solid #dde2e8; border-radius: 6px; }
figcaption { font-size: 9.5pt; color: #6B7480; margin-top: 4pt; }
.pagebreak { page-break-after: always; }
.titlebadge { display: inline-block; background: #14181f; color: #fff; font-weight: 700;
  border-radius: 6px; padding: 2px 9px; margin-right: 6px; }
"""

def inline(t):
    t = _html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r"", t)  # images sep. behandelt
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", t)
    return t

def convert(md):
    lines = md.split("\n")
    out, i, n = [], 0, len(lines)
    while i < n:
        ln = lines[i]
        s = ln.strip()
        if s == "<!-- pagebreak -->":
            out.append('<div class="pagebreak"></div>'); i += 1; continue
        if not s:
            i += 1; continue
        if s.startswith("# "):   out.append("<h1>" + inline(s[2:]) + "</h1>"); i += 1; continue
        if s.startswith("## "):  out.append("<h2>" + inline(s[3:]) + "</h2>"); i += 1; continue
        if s.startswith("### "): out.append("<h3>" + inline(s[4:]) + "</h3>"); i += 1; continue
        if s == "---": out.append("<hr>"); i += 1; continue
        # Bild als eigener Absatz
        m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", s)
        if m:
            cap = inline(m.group(1))
            out.append('<figure><img src="%s">%s</figure>' % (
                m.group(2), ("<figcaption>" + cap + "</figcaption>") if cap else ""))
            i += 1; continue
        # Blockquote
        if s.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].lstrip()); i += 1
            out.append("<blockquote>" + "".join("<p>" + inline(x) + "</p>" for x in buf if x) + "</blockquote>")
            continue
        # Tabelle
        if s.startswith("|") and i + 1 < n and re.match(r"^\|[\s:|-]+\|?$", lines[i+1].strip()):
            header = [c.strip() for c in s.strip("|").split("|")]
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            th = "".join("<th>" + inline(c) + "</th>" for c in header)
            trs = "".join("<tr>" + "".join("<td>" + inline(c) + "</td>" for c in r) + "</tr>" for r in rows)
            out.append("<table><thead><tr>" + th + "</tr></thead><tbody>" + trs + "</tbody></table>")
            continue
        # Listen
        if re.match(r"^[-*] ", s):
            buf = []
            while i < n and re.match(r"^\s*[-*] ", lines[i]):
                buf.append(re.sub(r"^\s*[-*] ", "", lines[i])); i += 1
            out.append("<ul>" + "".join("<li>" + inline(x) + "</li>" for x in buf) + "</ul>")
            continue
        if re.match(r"^\d+\. ", s):
            buf = []
            while i < n and re.match(r"^\s*\d+\. ", lines[i]):
                buf.append(re.sub(r"^\s*\d+\. ", "", lines[i])); i += 1
            out.append("<ol>" + "".join("<li>" + inline(x) + "</li>" for x in buf) + "</ol>")
            continue
        # Absatz (Folgezeilen bis Leerzeile)
        buf = [s]; i += 1
        while i < n and lines[i].strip() and not re.match(r"^(#|>|\||[-*] |\d+\. |!\[|---|<!--)", lines[i].strip()):
            buf.append(lines[i].strip()); i += 1
        out.append("<p>" + inline(" ".join(buf)) + "</p>")
    return "\n".join(out)

def build(md_name, pdf_name):
    md = open(os.path.join(DOKU, md_name), encoding="utf-8").read()
    body = convert(md)
    page = "<!doctype html><html lang=de><head><meta charset=utf-8><style>" + CSS + "</style></head><body>" + body + "</body></html>"
    htmlpath = os.path.join(DOKU, "_" + md_name.replace(".md", ".html"))
    open(htmlpath, "w", encoding="utf-8").write(page)
    pdfpath = os.path.join(DOKU, pdf_name)
    try:
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-first-run",
                        "--no-pdf-header-footer", "--user-data-dir=/tmp/edge-pdf-" + md_name,
                        "--print-to-pdf=" + pdfpath, "file://" + htmlpath],
                       capture_output=True, timeout=60)
    except subprocess.TimeoutExpired:
        pass
    subprocess.run(["pkill", "-f", "edge-pdf-" + md_name], capture_output=True)
    time.sleep(1)
    ok = os.path.exists(pdfpath) and os.path.getsize(pdfpath) > 5000
    print(("OK  " if ok else "ERR ") + pdf_name + ((" (%d B)" % os.path.getsize(pdfpath)) if ok else ""))

if __name__ == "__main__":
    build("INBETRIEBNAHME.md", "Zug11-Inbetriebnahme.pdf")
    build("HANDBUCH.md", "Zug11-Handbuch.pdf")
