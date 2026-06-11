# Zug 11 Statistik

Web-Tool für ein Rotes-Kreuz-Zugskommando zur Erfassung und Auswertung von
Diensten (RTW / KTW / ÄBD / ZBV / DF). Es ersetzt eine manuell gepflegte
Excel-Statistik und hilft dem Kommando, faire Dienstpläne zu schreiben.

**Eine einzige Datei, kein Server:** Die komplette App ist `index.html`
(HTML + CSS + JS, keine Build-Tools, keine externen Netzwerk-Aufrufe).
Sie läuft direkt per `file://` (z. B. aus einem OneDrive-Ordner in Edge
geöffnet) oder über GitHub Pages.

## Dokumentation für das Kommando

Im Ordner [`doku/`](doku/) liegen zwei bebilderte Anleitungen (als Markdown
und als fertiges PDF zum Ausdrucken):

* **[Inbetriebnahme](doku/INBETRIEBNAHME.md)**
  ([PDF](doku/Zug11-Inbetriebnahme.pdf)) — Schritt-für-Schritt für den ersten
  Start: wie die `Statistik.json` im Edge verbunden wird.
* **[Handbuch](doku/HANDBUCH.md)** ([PDF](doku/Zug11-Handbuch.pdf)) —
  vollständige Erklärung aller Ansichten und Konzepte.

Die PDFs und Screenshots werden aus den Markdown-Dateien erzeugt
(`doku/build-pdf.py`, `doku/_shots.py`); die Screenshots nutzen nur die
anonyme `Statistik.beispiel.json`.

## Benutzung

1. `index.html` in Microsoft Edge öffnen (Doppelklick oder über die
   GitHub-Pages-URL).
2. Unter **Datei & Excel** die Statistik-Datei (JSON) öffnen oder neu anlegen.
   * Über **https** (GitHub Pages) merkt sich die App die Datei und verbindet
     sich beim nächsten Mal mit einem Klick wieder; Änderungen werden
     automatisch gespeichert.
   * Über **file://** steht der direkte Dateizugriff browserbedingt nicht zur
     Verfügung — dann gilt der manuelle Modus: „Datei laden“ und nach
     Änderungen „Datei speichern“ (Download in den OneDrive-Ordner legen).
3. Unter **Dienst erfassen** den Dienstplan von der Dienstplan-Webseite
   kopieren und einfügen → **Vorschau** → Gäste bestätigen / unklare Namen
   auflösen → **Dienst verbuchen**. Nicht zuordenbare Namen werden automatisch
   als Gast erfasst (die App merkt sich bestätigte Gäste); Namen, die einem
   Mitglied verdächtig ähneln (Tippfehler), bleiben zur Entscheidung in der
   Unklar-Liste. Neue Mitglieder lassen sich direkt in der Vorschau anlegen.
4. Das **Dashboard** zeigt oben je Fairness-Kategorie eine **„Wer ist
   dran?“-Karte** (RTW getrennt nach Fahrer und Transportführer; in der
   TF-Spalte sind B3-Fahrer ausgeblendet, weil sie als Fahrer gebraucht
   werden): Reihung nach niedrigstem Anteil, dann „am längsten her“, dann
   wenigste Dienste. Darunter je aktiver Person Dienste, Anwesenheit, je
   Kategorie Anzahl + Anteil (als Heatmap: Rot 0 % → Gelb 50 % → Grün 100 %)
   sowie „zuletzt“-Spalten; Filter nach Eignung (Rolle × Kategorie).
   Teil-Dienste (z. B. späterer Beginn) zählen mit ihrem Faktor — der Parser
   erkennt eigene Zeitangaben im Dienstplan automatisch.
5. **Bericht** (Seitenleiste) öffnet eine kompakte, farbige Druckansicht
   (A4 quer) — über den Browser-Druck auch als PDF speicherbar.
6. Die **Datenprüfung** (unter Datei & Excel, Badge in der Seitenleiste)
   macht Auffälligkeiten sichtbar — z. B. zwei DF am selben Termin (geteilter
   Dienst) oder Werte außerhalb des gültigen Bereichs. Gelbe Hinweise sind
   quittierbar (das Badge zählt nur offene), rote Fehler nicht. Sie
   korrigiert nie automatisch.
7. Die Ansicht **Gäste** zeigt die Gast-Quote und je Gast die Einsätze nach
   Kategorie („?“ = Alt-Einsätze, deren Kategorie vor Version 4 nicht
   erfasst wurde) — reine Statistik, etwa um zu sehen, wer oft aushilft.

Zum Ausprobieren ohne echte Daten: `Statistik.beispiel.json` laden
(Fantasienamen).

## Datenhaltung & Mehrbenutzer

* Quelle der Wahrheit ist genau eine JSON-Datei (z. B. `Statistik.json` in
  einem geteilten OneDrive-Ordner). Kein localStorage, keine Datenbank.
* Aktuelles Datei-Schema: **Version 4** (Fahrlizenz `keine/A/B2/B3` und Stufe
  `Praktikant/RS1/RS2/NFS`; Zuordnungen mit Rolle; Teil-Dienst-Faktor f ∈
  (0, 1] wirkt einheitlich auf Anwesenheit, Dienste und Kategorien; Gäste je
  erfasstem Dienst als Objekte mit Kategorien und Rolle; `quittierungen` für quittierte
  Datenprüfungs-Hinweise). Ältere Dateien (v1–v3) werden beim Laden
  automatisch und verlustfrei migriert; redundante 0-Werte werden dabei
  beziffert bereinigt. Zählregel: ÄBD/ZBV-Kombi zählt je 0,5 — die Summe der
  Kategorie-Werte einer Person ist immer gleich ihren Diensten.
* Vor jedem Speichern prüft die App, ob die Datei zwischenzeitlich geändert
  wurde (z. B. von einem anderen Kommandomitglied), und warnt dann.
* OneDrive kann bei gleichzeitigem Speichern Konfliktkopien anlegen — größere
  Eingaben am besten kurz absprechen.

## Excel

* **Excel importieren** übernimmt die alte Statistik-Mappe einmalig
  (Blätter „Stammdaten“, „Anwesenheit_…“, „KTW_RTW_ÄND_…“); altes „ÄND“ wird
  zur Kategorie ÄBD, DF-Berechtigungen werden zur Bestätigung vorgeschlagen.
* **Excel exportieren** erzeugt eine .xlsx mit Übersicht und Rohdaten
  (Backup/Weitergabe).
* Dafür liegt [SheetJS](https://sheetjs.com) lokal unter
  `vendor/xlsx.full.min.js` bei — es wird nichts aus dem Netz geladen.

## Entwicklung

* Logik-Kern (Parser, Zuordnung, Kennzahlen, Excel-Mapping) liegt als
  markierter `CORE`-Block in `index.html` und ist ohne Browser testbar:
  * `tests/run-tests.sh` — Unit-Tests (anonymisierte Fixtures, läuft mit
    macOS-JavaScriptCore oder Node).
  * `tests/check-real-data.sh` — Abgleich gegen die echten Referenzdateien
    in `referenz/` (lokal, gitignored; ohne diese Dateien wird übersprungen).
* Echte Personendaten (Ordner `referenz/`, `Statistik.json`, Exporte) sind
  per `.gitignore` ausgeschlossen und dürfen nie ins Repo.
* CSS ist als Design-Token-Schicht aufgebaut (`--rk-red`, `--amber-*`,
  `--sp-*` usw.), Klassennamen sind stabil/semantisch. Seit dem Design-Pass
  (Zug-11-Design-System): dunkle linke Seitenleiste, lokale IBM-Plex-Schriften
  (`fonts/`, SIL-OFL-Lizenz liegt bei — kein Google-Fonts-Import), Markenrot
  nur als Akzent, Fairness-Markierung in Bernstein. Konventionen: bestehende
  Klassen (`.card`, `.btn`, `table.data`, `.chip`, `.notice`, `.stat-box` …)
  verwenden statt Ad-hoc-Styles; Farb-/Abstandsanpassungen nur über die
  Token-Schicht. Branding ist eine Wortmarke mit „11“-Badge (bewusst kein
  rotes Kreuz — geschütztes Emblem).
