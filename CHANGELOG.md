# Changelog

## v1.2.2 — 2026-06-11

Reines Feinschliff-Update — keine Schema-Änderung, keine Änderung an
Zählregeln oder gespeicherten Daten.

* **DF-Statistik:** zweite Prozent-Spalte „DF %“ (DF-Dienste ÷ Gesamt-Dienste
  der Person, Faktor-gewichtet wie alle Kategorie-Prozente) neben der
  bestehenden Bilanz-Spalte „Anteil an allen DF“; beide mit erklärendem
  Tooltip. Keine Heatmap in dieser Tabelle.
* **Begriff vereinheitlicht:** Alle sichtbaren „Abend/Abende“ in der
  Oberfläche heißen jetzt „Dienst/Dienste“ (Navigation „Dienst erfassen“ /
  „Dienste“, Liste „Erfasste Dienste“, Dialoge, Datenprüfung, Bericht,
  „zuletzt vor N Diensten“). Interne Bezeichner, Datenfelder (`evenings`,
  `date` …) und der Inhalt der Statistik.json sind unverändert.
* **„Wer ist dran?“-Karten:** Standard 4 sichtbare Kandidaten; schlanke
  Kandidatenzeile (Name + Anteil als Amber-Balken, dezent „zuletzt vor N
  Diensten“), Details (Anzahl, Dienste gesamt) im Tooltip bzw. beim
  Aufklappen; Platz 1 deutlich hervorgehoben. Ranking-Logik, TF×RTW-Regel
  und „wenig Daten“-Badge unverändert.
* **Gäste-Tabelle:** Zahlenspalten samt Köpfen mittig ausgerichtet (eigener
  Tabellen-Modifier, andere Tabellen unberührt). Die „?“-Spalte (Alt-Einsätze
  ohne Kategorie) wurde später entfernt — wird nicht benötigt.
* **TF × RTW mit NFS-Ausnahme:** Im Eignungs-Filter „Transportführer × RTW“
  und in der RTW-Dran-Karte bleiben NFS-Fahrer (B3 + NFS) jetzt gelistet —
  jeder RTW braucht mindestens einen NFS, der üblicherweise als TF mitfährt.
  Ausgeblendet werden nur noch B3-Fahrer ohne NFS (Fußnote entsprechend).

## v1.2.1 — 2026-06-11

**Regeländerung — ÄBD/ZBV-Kombi zählt 0,5 / 0,5:** Der kombinierte Tour-Code
gibt je +0,5 ÄBD und +0,5 ZBV (× Personen-Faktor: Kombi + 0,7 ⇒ 0,35/0,35);
reine Codes bleiben 1,0. Damit gilt die Invariante „Summe der Kategorie-Werte
= Dienste“ — Prozentsummen können nie mehr über 100 % gehen (in der
Datenprüfung und den Tests verankert; der alte Kombi-Hinweis entfällt).
Anzeige mit bis zu 2 Nachkommastellen (0,35). Der Altbestand enthält keine
Kombi-Abende (verifiziert) — reine Regeländerung ohne Daten-Migration.

**Datei-Schema v4** (Migrationskette v1→v4, verlustfrei wie immer):

* **Quittierbare Hinweise:** Gelbe Datenprüfungs-Hinweise haben stabile
  Schlüssel und lassen sich dauerhaft quittieren (`quittierungen` in der
  Datei). Das Sidebar-Badge zählt nur offene Einträge; quittierte sind über
  einen Link einsehbar und rücksetzbar. Fehler (rot) sind nicht quittierbar.
* **0-Werte-Bereinigung beim Laden:** Gespeicherte 0-Werte ohne Zuordnungen
  am selben Abend sind redundant (Abwesenheit ergibt sich automatisch) und
  werden beziffert entfernt. Faktor 0 *mit* Zuordnungen bleibt ein roter
  Fehler (Widerspruch: gefahren, aber zählt 0).
* **Gäste mit Kategorien:** `gaeste` je Abend sind Objekte
  `{name, kats: [{kat, wert}], rolle}` — der Parser erfasst Tour-Kategorie(n)
  (Kombi je 0,5; Zeitfaktoren gelten bei Gästen nicht) und Rolle.
  Alt-Einträge bekommen „Kategorie unbekannt“.

**Neue Ansicht „Gäste“** (Sidebar): Gast-Quote (aus der Abende-Ansicht
umgezogen) + sortierbare Tabelle je Gast mit Einsätzen, Kategorien-Anzahl und
„?“-Spalte für Alt-Einsätze — bewusst reine Statistik ohne Verwaltung. Die
Top-5-Liste der Abende-Ansicht geht darin auf.

**Personen-Übersicht umgebaut:** „Zuletzt“-Spalten und DF/DF-%-Spalten
entfernt (die Zuletzt-Information bleibt im Dran-Ranking und in den
Dran-Karten); Sortierzustände überleben den Umbau. Darunter neu die Karte
**DF-Statistik** (provisorisch — Layout-Review durch das Kommando): alle
Personen mit DF-Häkchen oder DF-Diensten, Bilanz der Anteile (100 %),
Markierung „ohne DF-Berechtigung“.

**Außerdem:** KTW-Spalten grauen nie aus (auch Praktikanten fahren als
2. Trspf. mit); RTW/ÄBD/ZBV-Ausgrauen unverändert. Abend-Editor: Faktor je
Person validiert auf (0, 1], Gäste des Abends mit Kategorie sichtbar und für
Alt-Einträge nachtragbar.

## v1.2 — 2026-06-10

**Datei-Schema v3** (Migration v2→v3 trivial, v1→v3-Kette funktioniert;
verlustfrei, Hinweis beim Laden, persistiert beim nächsten Speichern):

* **Teil-Dienst-Faktor:** Die partials-Map ist jetzt eine Faktor-Map — ein
  Faktor f ∈ (0, 1] je Person und Abend wirkt einheitlich auf Anwesenheit,
  Dienste-Zählung und jede Kategorie des Abends. Alle abgeleiteten Werte
  (Anteile, Dran-Ranking, Summen, Bericht) rechnen mit den Bruchwerten;
  Anzeige im de-AT-Format (Komma, max. 1 Nachkommastelle).
* **Zeiterkennung im Parser:** Eigene Zeitangabe bei einem Namen
  („Gudrun Huber 22:00 - 06:00“, auch in der Folgezeile derselben Zelle)
  → Faktor = Personendauer ÷ Tourdauer (Über-Mitternacht-fest, Referenz
  8,0/11,5 → 0,7), in der Vorschau vorbefüllt und manuell änderbar.

**Neue Funktionen:**

* **Datenprüfung** unter Datei & Excel + Sidebar-Badge, nach jedem
  Laden/Verbuchen/Edit. Hinweise (gelb): Doppel-DF (kann geteilter Dienst
  sein), ÄBD/ZBV-Kombi, fehlende Stufen. Fehler (rot): Kategorie > Dienste,
  Anwesenheit/Faktor außerhalb des gültigen Bereichs, doppelte Abend-Daten.
  Einträge verlinken zum Abend bzw. zur Person; nichts wird automatisch
  korrigiert. Im Altbestand deckt sie real 3 Abende mit „Anwesenheit 0 trotz
  Dienst“ auf — die 16-DF-Beobachtung ist Datenrealität (5 geteilte
  DF-Dienste), kein Bug.
* **Heatmap** statt Amber-Zellmarkierung: alle %-Spalten mit der Farbskala
  der alten Excel (Anker 0 % Rot / 50 % Gelb / 100 % Grün, fest), im
  Dashboard gedämpft, im Bericht volle Skala. Amber bleibt den Dran-Karten.
* **Mehrfachbearbeitung** in der Personen-Verwaltung: Checkboxen + Dialog
  mit „— unverändert —“-Feldern (Lizenz, Stufe, Status, DF), ein
  Speichervorgang, Bestätigungs-Zusammenfassung, Praktikant-Regel inklusive.
* **TF × RTW ohne B3-Fahrer:** Filter und RTW-Dran-Karte blenden B3-Fahrer
  in der TF-Sicht aus (Fußnote nennt die Anzahl) — sie werden als Fahrer
  gebraucht. KTW-TF zeigt weiterhin alle.
* **Bericht** jetzt A4 quer, kompakt (eine Zeile pro Person, ohne
  Zuletzt-Spalten und Dran-Block), %-Zellen mit voller Farbskala
  (print-color-adjust: exact).

**Aufgeräumt:** Statistik-Karten-Zeile entfernt; Gast-Quote in die
Abende-Ansicht umgezogen; Dashboard zeigt immer nur Aktive (Toggle entfernt,
Personen-Verwaltung listet Ausgetretene weiterhin); DF-Dran-Karte entfernt
(DF-Spalten bleiben).

## v1.1 — 2026-06-10

**Datei-Schema v2** (automatische, verlustfreie Migration beim Laden einer
v1-Datei; Hinweis im UI, persistiert beim nächsten Speichern):

* Personen: `fahrlizenz` (keine/A/B2/B3) und `stufe` (Praktikant/RS1/RS2/NFS)
  ersetzen `qualifikation`. Mapping: Prkt→keine+Praktikant, TF-R1→keine+RS1,
  TF-R2→keine+RS2, B3-NFS→B3+NFS; A/B2/B3 behalten die Lizenz, die Stufe
  fehlt („nachpflegen“, bis dahin nicht TF-geeignet). Der alte Wert bleibt
  als `qualifikationAlt` sichtbar. Praktikant erzwingt „keine“ Lizenz.
  `eintritt` aus dem UI entfernt (wird weiterhin toleriert und gezählt).
* Kategorien: `eligibleFahrer` (Lizenzen) + `eligibleTf` (Stufen, leer = kein
  TF) ersetzen `eligibleQuals`. RTW: Fahrer B3, TF RS2/NFS; KTW: Fahrer
  A/B2/B3, TF RS1/RS2/NFS; ÄBD/ZBV: nur Fahrer; DF weiter über das Häkchen.
* Abende: Zuordnungen speichern Kategorie + Rolle (`fahrer/tf/p2`, aus der
  Spaltenposition des Dienstplans); historische Abende haben `rolle: null`.
  Neu: `gaeste` je Abend und globale `gastListe`.
  Die Zählregeln sind unverändert.

**Neue Funktionen:**

* **„Wer ist dran?“-Karten** oben im Dashboard je Fairness-Kategorie (RTW
  getrennt nach Fahrer/TF; ersetzt die DF-Balance-Karte). Reihung:
  niedrigster Anteil → am längsten her → wenigste Dienste; „wenig Daten“-
  Badge unter 5 Diensten.
* **„Zuletzt“-Spalten** (RTW/ÄBD/DF) als „vor N Abenden“, sortierbar.
* **Bericht**: Druckansicht (Titel, Stichtag, Zusammenfassung, Personen-
  tabelle, Dran-Übersicht) über den Browser-Druck, ohne Library.
* **Gast-Automatik**: fremde Namen werden automatisch als Gast erfasst,
  Tippfehler-Verdacht (z. B. Christina/Christine) bleibt in der Unklar-Liste;
  Gäste-Sektion in der Vorschau mit Umschalt-Option und Mini-Formular zum
  direkten Neu-Anlegen. **Gast-Quote** in der Zusammenfassung inkl.
  Top-5-Gästen.
* Dashboard-Filter nach **Eignung (Rolle × Kategorie)**; Lizenz/Stufe als
  Badges mit „Stufe fehlt“-Schnellbearbeitung.
* Statuszeile nennt im manuellen Modus den Grund (Browser ohne
  File-System-Access-API, file:// statt Web-Adresse, Zugriff blockiert).

## v1.0 — 2026-06-09

* Erste Version: selbständige `index.html`, Dienstplan-Paste mit Vorschau,
  Dashboard mit Fairness-Markierung, Excel-Import/-Export (lokales SheetJS),
  Datei-Anbindung über File System Access API bzw. manueller Modus.
