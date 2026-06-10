# Changelog

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
