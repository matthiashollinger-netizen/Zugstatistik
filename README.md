# Zug 11 Statistik

Web-Tool für ein Rotes-Kreuz-Zugskommando zur Erfassung und Auswertung von
Diensten (RTW / KTW / ÄBD / ZBV / DF). Es ersetzt eine manuell gepflegte
Excel-Statistik und hilft dem Kommando, faire Dienstpläne zu schreiben.

**Eine einzige Datei, kein Server:** Die komplette App ist `index.html`
(HTML + CSS + JS, keine Build-Tools, keine externen Netzwerk-Aufrufe).
Sie läuft direkt per `file://` (z. B. aus einem OneDrive-Ordner in Edge
geöffnet) oder über GitHub Pages.

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
3. Unter **Abend erfassen** den Dienstplan von der Dienstplan-Webseite
   kopieren und einfügen → **Vorschau** → Gäste bestätigen / unklare Namen
   auflösen → **Abend verbuchen**. Nicht zuordenbare Namen werden automatisch
   als Gast erfasst (die App merkt sich bestätigte Gäste); Namen, die einem
   Mitglied verdächtig ähneln (Tippfehler), bleiben zur Entscheidung in der
   Unklar-Liste. Neue Mitglieder lassen sich direkt in der Vorschau anlegen.
4. Das **Dashboard** zeigt oben je Fairness-Kategorie (RTW, ÄBD, DF) eine
   **„Wer ist dran?“-Karte** (bei RTW getrennt nach Fahrer und
   Transportführer): Reihung nach niedrigstem Anteil, dann „am längsten her“,
   dann wenigste Dienste. Darunter je Person Dienste, Anwesenheit, je
   Kategorie Anzahl + Anteil sowie „zuletzt“-Spalten; Filter nach Eignung
   (Rolle × Kategorie). Die Gast-Quote zeigt, wie viele Crew-Plätze von
   Gästen gefüllt wurden.
5. **Bericht** (Kopfzeile) öffnet eine aufgeräumte Druckansicht des aktuellen
   Stands — über den Browser-Druck auch als PDF speicherbar.

Zum Ausprobieren ohne echte Daten: `Statistik.beispiel.json` laden
(Fantasienamen).

## Datenhaltung & Mehrbenutzer

* Quelle der Wahrheit ist genau eine JSON-Datei (z. B. `Statistik.json` in
  einem geteilten OneDrive-Ordner). Kein localStorage, keine Datenbank.
* Aktuelles Datei-Schema: **Version 2** (Fahrlizenz `keine/A/B2/B3` und Stufe
  `Praktikant/RS1/RS2/NFS` statt einem Qualifikationsfeld; Zuordnungen mit
  Rolle; Gäste je Abend). Eine v1-Datei wird beim Laden automatisch und
  verlustfrei migriert — bei A/B2/B3 fehlt danach die Stufe und wird im UI
  als „Stufe nachpflegen“ markiert.
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
* CSS ist als Design-Token-Schicht aufgebaut (`--rk-red` usw.), Klassennamen
  sind stabil/semantisch. Der optische Feinschliff (RK-Look, eigenes Logo)
  folgt mit Claude Design auf einem eigenen `design`-Branch und kommt erst
  nach Review per Merge nach `main`. Das aktuelle Logo ist ein neutraler
  Platzhalter-Schriftzug (bewusst kein rotes Kreuz — geschütztes Emblem).
