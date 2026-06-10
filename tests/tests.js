/* Unit-Tests für die Kern-Logik (Parser, Zuordnung, Kennzahlen, Migration v1→v2,
   Gast-Automatik, Dran-Ranking, Excel-Import).
   Läuft mit JavaScriptCore (jsc) oder Node: tests/run-tests.sh
   Erwartet, dass der CORE-Block aus index.html davor geladen wurde.
   Alle Namen hier sind Fantasienamen. */

let _pass = 0, _fail = 0;
function assert(cond, msg) {
  if (cond) { _pass++; }
  else { _fail++; print('FAIL: ' + msg); }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, msg + ' — erwartet ' + e + ', bekommen ' + a);
}
function approx(a, b) { return Math.abs(a - b) < 1e-9; }

/* Kurzschreibweise: Kategorien-Liste → v2-Zuordnungseinträge ohne Rolle */
const A = (...kats) => kats.map(k => ({ kat: k, rolle: null }));
/* Kurzschreibweise: v2-Person */
function P(id, fahrlizenz, stufe, extra) {
  return Object.assign({ id, nachname: id, vorname: 'X', fahrlizenz, stufe, status: 'aktiv', df: false, austritt: null, aliases: [] }, extra || {});
}

/* ============ Tour-Code → Kategorien ============ */
(function () {
  const cats = defaultCategories();
  assertEq(codeToCategories('R1', cats).catIds, ['RTW'], 'R1 → RTW');
  assertEq(codeToCategories('R12', cats).catIds, ['RTW'], 'R12 → RTW');
  assertEq(codeToCategories('K01', cats).catIds, ['KTW'], 'K01 → KTW');
  assertEq(codeToCategories('K01*', cats).catIds, ['KTW'], 'K01* → KTW (Sternchen ignoriert)');
  assertEq(codeToCategories('ÄBD', cats).catIds, ['ABD'], 'ÄBD → ABD');
  assertEq(codeToCategories('ÄND', cats).catIds, ['ABD'], 'ÄND → ABD');
  assertEq(codeToCategories('ZBV', cats).catIds, ['ZBV'], 'ZBV → ZBV');
  assertEq(codeToCategories('ÄBD/ZBV', cats).catIds, ['ABD', 'ZBV'], 'ÄBD/ZBV → beide');
  assertEq(codeToCategories('DF', cats).catIds, ['DF'], 'DF → DF');
  const nef = codeToCategories('NEF', cats);
  assertEq(nef.catIds, [], 'NEF → keine Kategorie');
  assertEq(nef.unknownParts, ['NEF'], 'NEF als unbekannt gemeldet');
  assert(codeToCategories('RTW-X', cats).catIds.length === 0, 'RTW-X matcht Präfix R nicht (Rest keine Ziffern)');
})();

/* ============ Migration v1 → v2: Mapping-Tabelle ============ */
(function () {
  const cases = [
    ['Prkt',   'keine', 'Praktikant'],
    ['TF-R1',  'keine', 'RS1'],
    ['TF-R2',  'keine', 'RS2'],
    ['B3-NFS', 'B3',    'NFS'],
    ['A',      'A',     null],
    ['B2',     'B2',    null],
    ['B3',     'B3',    null]
  ];
  for (const [alt, lizenz, stufe] of cases) {
    const p = { id: 'p', nachname: 'N', vorname: 'V', qualifikation: alt, status: 'aktiv', df: false, eintritt: null, austritt: null, aliases: [] };
    migratePersonV2(p);
    assertEq(p.fahrlizenz, lizenz, 'Mapping ' + alt + ' → Lizenz ' + lizenz);
    assertEq(p.stufe, stufe, 'Mapping ' + alt + ' → Stufe ' + JSON.stringify(stufe));
    assertEq(p.qualifikationAlt, alt, 'alter Wert als qualifikationAlt mitgeführt (' + alt + ')');
    assert(!('qualifikation' in p), 'qualifikation-Feld ersetzt (' + alt + ')');
  }
  /* leer / unbekannt */
  const leer = { id: 'p', nachname: 'N', vorname: 'V', qualifikation: '', status: 'aktiv', aliases: [] };
  migratePersonV2(leer);
  assertEq([leer.fahrlizenz, leer.stufe], ['keine', null], 'leere Qualifikation → keine/null');
  assert(!('qualifikationAlt' in leer), 'kein qualifikationAlt bei leerer Qualifikation');
  const fremd = { id: 'p', nachname: 'N', vorname: 'V', qualifikation: 'XYZ', status: 'aktiv', aliases: [] };
  migratePersonV2(fremd);
  assertEq([fremd.fahrlizenz, fremd.stufe, fremd.qualifikationAlt], ['keine', null, 'XYZ'], 'unbekannte Qualifikation → keine/null, Wert bleibt erhalten');
})();

/* ============ Migration: Praktikant erzwingt fahrlizenz=keine ============ */
(function () {
  const p1 = { id: 'p', nachname: 'N', vorname: 'V', qualifikation: 'Prkt', status: 'aktiv', aliases: [] };
  migratePersonV2(p1);
  assertEq(p1.fahrlizenz, 'keine', 'Migration: Prkt → keine Lizenz');
  /* defensiv: auch eine (kaputte) v2-Person wird korrigiert */
  const p2 = P('p2', 'B3', 'Praktikant');
  migratePersonV2(p2);
  assertEq(p2.fahrlizenz, 'keine', 'Decoder: Praktikant mit Lizenz wird auf keine korrigiert');
})();

/* ============ Migration: komplette v1-Datei, verlustfrei ============ */
(function () {
  const v1 = {
    version: 1,
    notizGlobal: 'darf nicht verloren gehen',
    categories: [
      { id: 'RTW', label: 'RTW', matchPrefixes: ['R'], matchCodes: [], fairness: true, eligibleQuals: ['B3', 'B3-NFS', 'TF-R2'] },
      { id: 'KTW', label: 'KTW', matchPrefixes: ['K'], matchCodes: [], fairness: false, eligibleQuals: ['A', 'Prkt', 'B2', 'B3', 'B3-NFS', 'TF-R1', 'TF-R2'] },
      { id: 'ABD', label: 'ÄBD', matchPrefixes: [], matchCodes: ['ÄBD', 'ÄND'], fairness: true, eligibleQuals: ['A', 'B2', 'B3', 'B3-NFS'] },
      { id: 'ZBV', label: 'ZBV', matchPrefixes: [], matchCodes: ['ZBV'], fairness: false, eligibleQuals: ['A', 'B2', 'B3', 'B3-NFS'] },
      { id: 'DF', label: 'DF', matchPrefixes: [], matchCodes: ['DF'], fairness: true, eligibleFlag: 'df' },
      { id: 'NEF', label: 'NEF', matchPrefixes: [], matchCodes: ['NEF'], fairness: false, eligibleQuals: ['B3-NFS', 'TF-R2'] }
    ],
    people: [
      { id: 'pa', nachname: 'Alt', vorname: 'Anna', qualifikation: 'B3', status: 'aktiv', df: true, eintritt: '2026-01-05', austritt: null, aliases: ['Anni Alt'], notiz: 'bleibt' },
      { id: 'pb', nachname: 'Beck', vorname: 'Bert', qualifikation: 'TF-R2', status: 'ausgetreten', df: false, eintritt: null, austritt: '2026-02-01', aliases: [] }
    ],
    evenings: [
      { date: '2026-01-05', assignments: { pa: ['RTW'], pb: ['KTW'] }, partials: { pa: 0.5 } },
      { date: '2026-01-12', assignments: { pa: ['ABD', 'ZBV'] } }
    ]
  };
  const before = JSON.parse(JSON.stringify(v1));
  const migrated = migrateData(v1);
  assert(migrated === true, 'v1-Datei wird als migriert gemeldet');
  assertEq(v1.version, 2, 'version → 2');
  assertEq(v1.gastListe, [], 'gastListe ergänzt');
  assertEq(v1.notizGlobal, before.notizGlobal, 'unbekanntes Wurzel-Feld bleibt');
  assertEq(v1.people[0].notiz, 'bleibt', 'unbekanntes Personen-Feld bleibt');
  assertEq(v1.people[0].eintritt, '2026-01-05', 'eintritt wird toleriert und bleibt');
  assertEq(v1.people[0].aliases, ['Anni Alt'], 'aliases unverändert');
  assertEq(v1.people[0].df, true, 'df-Häkchen unverändert');
  assertEq([v1.people[0].fahrlizenz, v1.people[0].stufe], ['B3', null], 'Person B3 migriert');
  assertEq([v1.people[1].fahrlizenz, v1.people[1].stufe], ['keine', 'RS2'], 'Person TF-R2 migriert');
  /* Kategorien: bekannte IDs → Spezifikations-Defaults */
  const rtw = v1.categories[0];
  assertEq([rtw.eligibleFahrer, rtw.eligibleTf], [['B3'], ['RS2', 'NFS']], 'RTW-Eignung nach Default');
  const ktw = v1.categories[1];
  assertEq([ktw.eligibleFahrer, ktw.eligibleTf], [['A', 'B2', 'B3'], ['RS1', 'RS2', 'NFS']], 'KTW-Eignung nach Default');
  const abd = v1.categories[2];
  assertEq([abd.eligibleFahrer, abd.eligibleTf], [['A', 'B2', 'B3'], []], 'ÄBD: kein TF möglich');
  assertEq(v1.categories[3].eligibleTf, [], 'ZBV wie ÄBD');
  assert(v1.categories[4].eligibleFlag === 'df', 'DF weiter über Häkchen');
  /* eigene Kategorie: Ableitung aus alten Quali-Codes */
  const nef = v1.categories[5];
  assertEq([nef.eligibleFahrer, nef.eligibleTf], [['B3'], ['NFS', 'RS2']], 'eigene Kategorie: Eignung abgeleitet');
  assertEq(nef.eligibleQualsAlt, before.categories[5].eligibleQuals, 'alte eligibleQuals als ...Alt erhalten');
  /* Abende: Rolle null, partials erhalten */
  assertEq(v1.evenings[0].assignments.pa, [{ kat: 'RTW', rolle: null }], 'String-Zuordnung → {kat, rolle:null}');
  assertEq(v1.evenings[0].partials, { pa: 0.5 }, 'partials unverändert');
  assertEq(v1.evenings[1].assignments.pa.map(e => e.kat), ['ABD', 'ZBV'], 'Doppelzuordnung bleibt');
  /* Zählwerte identisch zu v1-Semantik */
  const stats = computeStats(v1);
  assertEq(stats.perPerson.pa.dienste, 2, 'Migration ändert Dienste nicht');
  assertEq(stats.perPerson.pa.catCounts.ABD, 1, 'Migration ändert Kategorie-Zählung nicht');
  assert(approx(stats.perPerson.pa.presenceSum, 1.5), 'Migration ändert Anwesenheit nicht');
})();

/* ============ Migration: v2-Datei lädt unverändert ============ */
(function () {
  const v2 = defaultData();
  v2.gastListe = ['Gerda Gast'];
  v2.people.push(P('pa', 'B3', 'NFS', { qualifikationAlt: 'B3-NFS' }));
  v2.evenings.push({ date: '2026-01-05', assignments: { pa: [{ kat: 'RTW', rolle: 'fahrer' }] }, gaeste: ['Gerda Gast'] });
  const before = JSON.stringify(v2);
  const migrated = migrateData(v2);
  assert(migrated === false, 'v2-Datei wird nicht als migriert gemeldet');
  assertEq(JSON.stringify(v2), before, 'v2-Datei bleibt byte-identisch');
})();

/* ============ Eignungsableitung (darfFahren / darfTf / isEligible) ============ */
(function () {
  const cats = defaultCategories();
  const rtw = cats.find(c => c.id === 'RTW'), ktw = cats.find(c => c.id === 'KTW'),
        abd = cats.find(c => c.id === 'ABD'), df = cats.find(c => c.id === 'DF');
  const b3nfs = P('a', 'B3', 'NFS'), b2rs1 = P('b', 'B2', 'RS1'), rs2 = P('c', 'keine', 'RS2'),
        offen = P('d', 'B3', null), prkt = P('e', 'keine', 'Praktikant'), dfp = P('f', 'A', 'RS1', { df: true });
  assert(darfFahren(b3nfs, rtw) && darfTf(b3nfs, rtw), 'B3+NFS: RTW-Fahrer und -TF');
  assert(!darfFahren(b2rs1, rtw) && !darfTf(b2rs1, rtw), 'B2+RS1: kein RTW');
  assert(darfFahren(b2rs1, ktw) && darfTf(b2rs1, ktw), 'B2+RS1: KTW-Fahrer und -TF');
  assert(!darfFahren(rs2, rtw) && darfTf(rs2, rtw), 'keine Lizenz + RS2: nur RTW-TF');
  assert(darfFahren(offen, rtw) && !darfTf(offen, rtw), 'Stufe fehlt: Fahrer-Eignung normal, nicht TF-geeignet');
  assert(!darfTf(offen, ktw), 'Stufe fehlt: auch kein KTW-TF');
  assert(!darfFahren(prkt, ktw) && !darfTf(prkt, ktw), 'Praktikant: weder Fahrer noch TF');
  assert(darfFahren(b2rs1, abd) && !darfTf(b3nfs, abd), 'ÄBD: Fahrer ja, TF gibt es nicht (leere Liste)');
  assert(isEligible(dfp, df) && !isEligible(b3nfs, df), 'DF-Berechtigung über df-Häkchen');
  assert(isEligible(rs2, rtw), 'isEligible = Fahrer oder TF');
  assert(!isEligible(offen, abd) === !darfFahren(offen, abd), 'ÄBD-Eignung = nur Fahrer');
})();

/* ============ Namensabgleich ============ */
(function () {
  const people = [
    { id: 'p1', nachname: 'Almberger', vorname: 'Greta', status: 'aktiv', aliases: [] },
    { id: 'p2', nachname: 'Bachner', vorname: 'Tobias', status: 'aktiv', aliases: ['Tobi Bachner'] },
    { id: 'p3', nachname: 'Cerny', vorname: 'Paul', status: 'aktiv', aliases: [] },
    { id: 'p4', nachname: 'Cerny', vorname: 'Mia', status: 'aktiv', aliases: [] },
    { id: 'p5', nachname: 'Dollinger', vorname: 'Lisa Marie', status: 'aktiv', aliases: [] },
    { id: 'p6', nachname: 'Ebner', vorname: 'Karl', status: 'ausgetreten', aliases: [] },
    { id: 'p7', nachname: 'Ebner', vorname: 'Karl', status: 'aktiv', aliases: [] }
  ];
  assertEq(matchPersonName('Greta Almberger', people).person.id, 'p1', 'Vorname Nachname');
  assertEq(matchPersonName('Almberger Greta', people).person.id, 'p1', 'Nachname Vorname');
  assertEq(matchPersonName('  greta   ALMBERGER ', people).person.id, 'p1', 'case-insensitiv + Whitespace');
  assertEq(matchPersonName('Tobi Bachner', people).person.id, 'p2', 'Alias greift');
  assertEq(matchPersonName('Bachner Tobi', people).person.id, 'p2', 'Alias auch gedreht');
  assertEq(matchPersonName('Paul Cerny', people).person.id, 'p3', 'Zwei-Cerny-Fall über Vor+Nachname');
  assertEq(matchPersonName('Mia Cerny', people).person.id, 'p4', 'Zwei-Cerny-Fall, zweite Person');
  assertEq(matchPersonName('Lisa Marie Dollinger', people).person.id, 'p5', 'mehrteiliger Vorname');
  assertEq(matchPersonName('Unbekannte Person', people).status, 'none', 'kein Match → none');
  assertEq(matchPersonName('Karl Ebner', people).person.id, 'p7', 'bei Duplikat gewinnt die aktive Person');
})();

/* ============ Gast-Automatik inkl. Fuzzy-Schutz ============ */
(function () {
  const people = [
    { id: 'p1', nachname: 'Huber', vorname: 'Christina', status: 'aktiv', aliases: [] },
    { id: 'p2', nachname: 'Maier', vorname: 'Max', status: 'aktiv', aliases: [] },
    { id: 'p3', nachname: 'Weg', vorname: 'Willi', status: 'ausgetreten', aliases: [] }
  ];
  const gastListe = ['Gerda Gastfrau'];

  assertEq(resolvePlanName('Christina Huber', people, gastListe).status, 'match', 'exakter Name → match');
  assertEq(resolvePlanName('Huber Christina', people, gastListe).status, 'match', 'gedrehter Name → match');

  /* Der Christina/Christine-Fall darf NICHT still Gast werden */
  const r1 = resolvePlanName('Christine Huber', people, gastListe);
  assertEq(r1.status, 'unklar', 'Christine ≈ Christina → unklar, nicht Gast');
  assertEq(r1.suggestion.id, 'p1', 'Vorschlag „Wahrscheinlich Christina Huber?“');
  const r2 = resolvePlanName('Huber Christine', people, gastListe);
  assertEq(r2.status, 'unklar', 'auch gedreht mit Tippfehler → unklar');
  const r3 = resolvePlanName('Maxi Maier', people, gastListe);
  assertEq(r3.status, 'unklar', 'gleicher Nachname + ähnlicher Vorname → unklar');
  assertEq(r3.suggestion.id, 'p2', 'Vorschlag Max Maier');

  /* eindeutig fremde Namen → automatisch Gast */
  assertEq(resolvePlanName('Sepp Fremdling', people, gastListe).status, 'gast-neu', 'fremder Name → automatisch Gast');
  assertEq(resolvePlanName('Gerda Gastfrau', people, gastListe).status, 'gast', 'Name aus gastListe → still Gast');
  assertEq(resolvePlanName('gastfrau gerda', people, gastListe).status, 'gast', 'gastListe case-insensitiv'
    + ' (gedreht zählt nicht, gleiche Schreibweise normalisiert)' );

  /* Ausgetretene lösen keinen Fuzzy-Verdacht aus */
  assertEq(resolvePlanName('Willi Weeg', people, gastListe).status, 'gast-neu', 'Ähnlichkeit zu Ausgetretenem → trotzdem Gast');

  /* editDistance-Basics */
  assertEq(editDistance('christina', 'christine'), 1, 'Edit-Distanz 1');
  assertEq(editDistance('abc', 'abc'), 0, 'Edit-Distanz 0');
  assert(editDistance('kurz', 'ganzanders') > 2, 'große Distanz');
})();

/* ============ Dienstplan-Parser (Struktur wie echtes Copy-Paste) ============ */
(function () {
  const plan = [
    'RKT SBG Zug 11 - 09.06.2026',
    'Tour / Fzg', 'Zeiten', 'Zimmer', 'Fahrer', 'Transportführer', '2. Trspf. / Praktikant',
    ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tGreta Almberger\tTobias Bachner\tPaul Cerny',
    ' \tR2', '20-202\t\t18:30', '05:00\t2-20 ', '1-34\tMia Cerny\tLisa Marie Dollinger\t',
    ' \tK01*', '20-321\t\t18:30', '06:00\t2-35 ', '2-34\tKarl Ebner\teintragen\tNora Fuchs',
    ' \tK02', '20-322\t\t18:30', '06:00\t1-32 ', '1-31\t\tJonas Gruberbauer\t',
    ' \tÄBD/ZBV', '20-703\t\t18:00', '23:00\t2.41 ', 'Helga Innerhofer\t\t',
    ' \tDF', '20-701\t\t18:00', '06:00\t2-36 ', 'Rudolf Jagersberger\t\t',
    ' \tNEF', '20-110\t\t18:30', '06:00\t2-12 ', '2-11\tSepp Kainz\t\t'
  ].join('\n');
  const r = parsePlan(plan, defaultCategories());
  assertEq(r.date, '2026-06-09', 'Datum aus Kopfzeile (TT.MM.JJJJ → ISO)');
  assertEq(r.tours.length, 7, 'sieben Touren erkannt');
  const codes = r.tours.map(t => t.code);
  assertEq(codes, ['R1', 'R2', 'K01*', 'K02', 'ÄBD/ZBV', 'DF', 'NEF'], 'Tour-Codes in Reihenfolge');

  const r1 = r.tours[0];
  assertEq(r1.catIds, ['RTW'], 'R1 → RTW');
  assertEq(r1.crew.map(c => c.name), ['Greta Almberger', 'Tobias Bachner', 'Paul Cerny'], 'alle 3 Crew-Spalten');
  assertEq(r1.crew.map(c => c.role), ['Fahrer', 'Transportführer', '2. Trspf./Praktikant'], 'Rollen-Label nach Spaltenposition');
  /* Rollen-Parsing: maschinenlesbare Rolle aus der Spaltenposition */
  assertEq(r1.crew.map(c => c.rolle), ['fahrer', 'tf', 'p2'], 'Rollen-Keys fahrer/tf/p2 nach Spaltenposition');

  const r2 = r.tours[1];
  assertEq(r2.crew.length, 2, 'leere 3. Spalte → 2 Personen');

  const k01 = r.tours[2];
  assertEq(k01.catIds, ['KTW'], 'K01* → KTW');
  assertEq(k01.crew.map(c => c.name), ['Karl Ebner', 'Nora Fuchs'], '„eintragen“ wird ignoriert');
  assertEq(k01.crew[1].role, '2. Trspf./Praktikant', 'Spaltenposition bleibt trotz „eintragen“ erhalten');
  assertEq(k01.crew.map(c => c.rolle), ['fahrer', 'p2'], 'Rollen-Keys überspringen die leere TF-Spalte nicht');

  const k02 = r.tours[3];
  assertEq(k02.crew.map(c => ({ n: c.name, r: c.rolle })), [{ n: 'Jonas Gruberbauer', r: 'tf' }], 'leerer Fahrer, TF nach Position');

  const abd = r.tours[4];
  assertEq(abd.catIds, ['ABD', 'ZBV'], 'ÄBD/ZBV zählt für beide Kategorien');
  assertEq(abd.crew.map(c => c.name), ['Helga Innerhofer'], 'ÄBD-Zeile ohne Zimmerspalte: Fahrer erkannt');
  assertEq(abd.crew[0].rolle, 'fahrer', 'ÄBD: Rolle wie gelesen (Fahrer-Spalte), keine Validierung');

  const df = r.tours[5];
  assertEq(df.catIds, ['DF'], 'DF → DF');
  assertEq(df.crew.map(c => c.name), ['Rudolf Jagersberger'], 'DF-Crew erkannt');

  const nef = r.tours[6];
  assertEq(nef.unknownParts, ['NEF'], 'unbekannter Code NEF wird gemeldet, nicht verworfen');

  // Datum fehlt → null
  assertEq(parsePlan(' \tR1\nx\t1-1\tAnna Test\t\t', defaultCategories()).date, null, 'ohne Kopfzeile kein Datum');
  // alternative Kopfzeile
  assertEq(parseGermanDate('zum Datum: 09.06.2026'), '2026-06-09', '„zum Datum:“-Format');
})();

/* ============ Kennzahlen ============ */
(function () {
  // Beispiel aus der Spezifikation: 10 Dienste, 6× KTW, 3× RTW, 1× ÄBD/ZBV → Summe 110 %
  const data = defaultData();
  data.people.push(P('pa', 'B3', null));
  const days = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23', '2026-03-02', '2026-03-09'];
  const cats = [['KTW'], ['KTW'], ['KTW'], ['KTW'], ['KTW'], ['KTW'], ['RTW'], ['RTW'], ['RTW'], ['ABD', 'ZBV']];
  for (let i = 0; i < 10; i++) data.evenings.push({ date: days[i], assignments: { pa: A(...cats[i]) } });
  const s = computeStats(data).perPerson['pa'];
  assertEq(s.dienste, 10, '10 Dienste');
  assert(approx(s.catPct['KTW'], 0.6), 'KTW 60 %');
  assert(approx(s.catPct['RTW'], 0.3), 'RTW 30 %');
  assert(approx(s.catPct['ABD'], 0.1), 'ÄBD 10 %');
  assert(approx(s.catPct['ZBV'], 0.1), 'ZBV 10 % (Summe 110 %)');
  assert(approx(s.presencePct, 1), 'Anwesenheit 100 %');
  /* Zuletzt-Daten */
  assertEq(s.lastCat['RTW'], '2026-03-02', 'letzter RTW-Dienst');
  assertEq(s.lastCat['KTW'], '2026-02-09', 'letzter KTW-Dienst');
  assertEq(s.lastCat['DF'], undefined, 'nie DF');
})();

/* ============ „vor N Abenden“ ============ */
(function () {
  const data = defaultData();
  data.people.push(P('pa', 'B3', 'RS2'));
  for (const [d, k] of [['2026-01-05', 'RTW'], ['2026-01-12', 'KTW'], ['2026-01-19', 'KTW'], ['2026-01-26', 'KTW']]) {
    data.evenings.push({ date: d, assignments: { pa: A(k) } });
  }
  const stats = computeStats(data);
  assertEq(eveningsSince(stats, stats.perPerson.pa.lastCat['RTW']), 3, 'RTW vor 3 Abenden');
  assertEq(eveningsSince(stats, stats.perPerson.pa.lastCat['KTW']), 0, 'KTW beim letzten Abend → 0');
  assertEq(eveningsSince(stats, null), null, 'nie → null');
  assertEq(fmtVorN(3), 'vor 3 Abenden', 'Format N');
  assertEq(fmtVorN(1), 'vor 1 Abend', 'Format Singular');
  assertEq(fmtVorN(0), 'beim letzten Abend', 'Format 0');
  assertEq(fmtVorN(null), 'nie', 'Format nie');
})();

(function () {
  // Neuzugang: erst ab erstem Auftreten erwartet; 3× anwesend, 1× abwesend = 75 %
  const data = defaultData();
  data.people.push(P('pn', 'B2', null));
  data.evenings.push({ date: '2026-01-05', assignments: {} });                       // vor Eintritt → zählt nicht
  data.evenings.push({ date: '2026-01-12', assignments: { pn: A('KTW') } });         // erstes Auftreten
  data.evenings.push({ date: '2026-01-19', assignments: { pn: A('KTW') } });
  data.evenings.push({ date: '2026-01-26', assignments: {} });                       // abwesend
  data.evenings.push({ date: '2026-02-02', assignments: { pn: A('RTW') } });
  const s = computeStats(data).perPerson['pn'];
  assertEq(s.expected, 4, 'Neuzugang: 4 erwartete Abende ab erstem Auftreten');
  assert(approx(s.presencePct, 0.75), 'Neuzugang: 75 % Anwesenheit');
  assertEq(s.dienste, 3, 'abwesender Abend ist kein Dienst');
})();

(function () {
  // Teil-Anwesenheit & Anwesenheit ohne Dienst (partials-Override)
  const data = defaultData();
  data.people.push(P('pt', 'B3', null, { eintritt: '2026-01-05' }));
  data.evenings.push({ date: '2026-01-05', assignments: { pt: A('RTW') }, partials: { pt: 0.5 } }); // halb da, gefahren
  data.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pt: 1 } });                 // da, aber kein Dienst
  data.evenings.push({ date: '2026-01-19', assignments: {} });                                      // abwesend
  const s = computeStats(data).perPerson['pt'];
  assertEq(s.dienste, 1, 'nur der RTW-Abend ist ein Dienst');
  assert(approx(s.presenceSum, 1.5), 'Anwesenheitssumme 0,5 + 1');
  assert(approx(s.presencePct, 0.5), 'Anwesenheit 1,5 / 3 = 50 %');
})();

(function () {
  // Austritt begrenzt erwartete Abende; Eintritt explizit vor erstem Dienst
  const data = defaultData();
  data.people.push(P('px', 'A', null, { status: 'ausgetreten', eintritt: '2026-01-05', austritt: '2026-01-12' }));
  data.evenings.push({ date: '2026-01-05', assignments: { px: A('KTW') } });
  data.evenings.push({ date: '2026-01-12', assignments: {} });
  data.evenings.push({ date: '2026-01-19', assignments: {} }); // nach Austritt
  const s = computeStats(data).perPerson['px'];
  assertEq(s.expected, 2, 'Abende nach Austritt zählen nicht als erwartet');
  assert(approx(s.presencePct, 0.5), '1 von 2 = 50 %');
})();

/* ============ Fairness & Berechtigung ============ */
(function () {
  const data = defaultData();
  data.people.push(P('a', 'B3', null), P('b', 'B3', 'NFS'), P('c', 'keine', 'RS2'), P('d', 'A', null), P('e', 'B3', null, { df: true }), P('f', 'B2', null, { df: true }));
  // a: 2 Dienste, 2 RTW (100 %); b: 2 Dienste, 1 RTW (50 %); c: 2 Dienste, 0 RTW (0 %); d: nicht RTW-berechtigt
  data.evenings.push({ date: '2026-01-05', assignments: { a: A('RTW'), b: A('RTW'), c: A('KTW'), d: A('KTW'), e: A('DF'), f: A('KTW') } });
  data.evenings.push({ date: '2026-01-12', assignments: { a: A('RTW'), b: A('KTW'), c: A('KTW'), d: A('ABD') } });
  const stats = computeStats(data);
  const marks = fairnessMarks(data, stats);
  const rtw = data.categories.find(c => c.id === 'RTW');
  assert(isEligible(data.people[0], rtw), 'B3 ist RTW-berechtigt');
  assert(!isEligible(data.people[3], rtw), 'A ist nicht RTW-berechtigt');
  assertEq((marks['c'] || {})['RTW'], 'low', 'niedrigster RTW-Anteil markiert („dran“) — TF-Eignung reicht');
  assertEq((marks['b'] || {})['RTW'], 'next', 'zweitniedrigster RTW-Anteil markiert');
  assert(!(marks['d'] || {})['RTW'], 'nicht berechtigte Person wird nicht markiert');
  const df = data.categories.find(c => c.id === 'DF');
  assert(isEligible(data.people[4], df) && !isEligible(data.people[0], df), 'DF-Berechtigung über df-Häkchen');
  assertEq((marks['f'] || {})['DF'], 'low', 'DF-Fairness: f hat 0 DF und ist „dran“');
  /* Teilmenge (gefilterte Ansicht): nur a und b betrachten */
  const sub = fairnessMarks(data, stats, [data.people[0], data.people[1]]);
  assertEq((sub['b'] || {})['RTW'], 'low', 'in der Teilmenge ist b „dran“');
  assertEq((sub['a'] || {})['RTW'], 'next', 'in der Teilmenge ist a zweiter');
  assert(!(sub['c'] || {})['RTW'], 'c steht außerhalb der Teilmenge');
})();

/* ============ Dran-Ranking (alle drei Stufen inkl. Tiebreaks) ============ */
(function () {
  const data = defaultData();
  /* alle RTW-fahrberechtigt */
  data.people.push(P('hoch', 'B3', null), P('mittel', 'B3', null), P('frueh', 'B3', null), P('spaet', 'B3', null), P('wenig', 'B3', null), P('viel', 'B3', null), P('nie2', 'B3', null));
  /* hoch: 2/2 RTW; mittel: 1/2 RTW (zuletzt d2);
     frueh/spaet: je 1/4 RTW — frueh zuletzt d1, spaet zuletzt d2 (Stufe-2-Tiebreak);
     wenig/viel: 0 RTW, nie — wenig 1 Dienst, viel 2 Dienste (Stufe-3-Tiebreak);
     nie2: 0 RTW nie, 1 Dienst → namentlicher Tiebreak mit wenig */
  const E = (d, asg) => data.evenings.push({ date: d, assignments: asg });
  E('2026-01-05', { hoch: A('RTW'), mittel: A('KTW'), frueh: A('RTW'), spaet: A('KTW'), viel: A('KTW'), wenig: A('KTW'), nie2: A('KTW') });
  E('2026-01-12', { hoch: A('RTW'), mittel: A('RTW'), frueh: A('KTW'), spaet: A('RTW'), viel: A('KTW') });
  E('2026-01-19', { frueh: A('KTW'), spaet: A('KTW') });
  E('2026-01-26', { frueh: A('KTW'), spaet: A('KTW') });
  const stats = computeStats(data);
  const ranked = rankDran(data.people, stats, 'RTW');
  /* Anteile: wenig/viel/nie2 = 0 (nie), frueh/spaet = 0.25, mittel = 0.5, hoch = 1 */
  assertEq(ranked.map(r => r.p.id), ['nie2', 'wenig', 'viel', 'frueh', 'spaet', 'mittel', 'hoch'],
    'Ranking: Anteil, dann am längsten her (nie zuerst), dann weniger Dienste, dann Name');
  assert(ranked[0].last === null && ranked[0].lastN === null, '„nie“ hat kein Datum');
  assertEq(ranked[3].lastN, 3, 'frueh: RTW vor 3 Abenden');
  assertEq(ranked[4].lastN, 2, 'spaet: RTW vor 2 Abenden');
  assert(ranked[0].wenigDaten && ranked[6].wenigDaten, 'unter 5 Diensten → „wenig Daten“-Badge');
  /* 0 Dienste ⇒ Anteil 0 und ganz vorne */
  data.people.push(P('neu', 'B3', null));
  const ranked2 = rankDran(data.people, stats === computeStats(data) ? stats : computeStats(data), 'RTW');
  assertEq(ranked2[0].p.id, 'neu', '0 Dienste ⇒ Anteil 0, nie ⇒ ganz vorne (Name „neu“ < „nie2“)');
})();

/* ============ Gast-Quote ============ */
(function () {
  const data = defaultData();
  data.people.push(P('pa', 'B3', null), P('pb', 'B2', null));
  data.evenings.push({ date: '2026-01-05', assignments: { pa: A('RTW'), pb: A('KTW') }, gaeste: ['Gerda Gast', 'Hans Helfer'] });
  data.evenings.push({ date: '2026-01-12', assignments: { pa: A('KTW') }, gaeste: ['Gerda Gast'] });
  data.evenings.push({ date: '2026-01-19', assignments: { pb: A('KTW') } });
  const g = computeGastStats(data);
  assertEq(g.einsaetze, 3, '3 Gast-Einsätze');
  assertEq(g.verschiedene, 2, '2 verschiedene Gäste');
  assert(approx(g.anteil, 3 / 7), 'Anteil 3 von 7 Crew-Plätzen');
  assertEq(g.top.map(t => t.name + ':' + t.count), ['Gerda Gast:2', 'Hans Helfer:1'], 'Top-Gäste sortiert');
  /* Gäste zählen nicht in die Dienst-Statistik */
  const stats = computeStats(data);
  assertEq(stats.catTotals['RTW'], 1, 'Gäste erhöhen keine Kategorie-Summen');
})();

/* ============ Excel-Import (synthetische Mappe, Struktur wie Original) ============ */
(function () {
  const D = (iso) => { // ISO → Excel-Serial
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
  };
  const d1 = D('2026-01-01'), d2 = D('2026-01-12'), d3 = D('2026-01-24'), d4 = D('2026-02-25');
  const sheets = {
    stammdaten: [
      ['Nachname', 'Vorname', 'Qualifikation', 'Namen Austritt'],
      ['Almberger', 'Greta', 'B3', null],
      ['ZZ', 'ZZ', 0, 'Weggang Willi '],
      ['Bachner', 'Tobias', 'TF - R2', null],
      ['Cerny ', 'Mia', 'B3 - NFS', null],
      ['Dollinger', 'Lisa Marie', 'Prkt', null],
      ['Jagersberger', 'Rudolf', 'B3', null]
    ],
    anwesenheit: [
      [null, null, null, d1, d2, d3, d4],
      ['Almberger', 'Greta', 0.75, 0, 1, 1, 1],          // expliziter 0er vor erstem Dienst
      ['Bachner', 'Tobias', 1, 1, 1, 1, 1],              // 1 ohne Dienst am d3
      ['Cerny', 'Mia', 0.5, null, 1, 0.5, 0],            // Bruch + Neuzugang ab d2
      ['ZZ', 'ZZ', 0, 0, 0, null, null],
      ['Dollinger', 'Lisa Marie', 1, 1, 1, 1, 1],
      ['Jagersberger', 'Rudolf', 1, 1, 1, 1, 1]
    ],
    ktw: [
      ['Nachname', 'Vorname', 'KTW', 'RTW', 'ÄND/ZBV', 'DF', d1, d2, d3, d4],
      ['Almberger', 'Greta', 1, 2, 0, 0, null, 'RTW', 'KTW', 'RTW'],
      ['Bachner', 'Tobias', 2, 1, 0, 0, 'KTW', 'RTW', null, 'KTW'],
      ['Cerny', 'Mia', 0, 1, 1, 0, null, 'ÄND', 'RTW', null],
      ['ZZ', 'ZZ', 0, 0, 0, 0, null, null, null, null],
      ['Dollinger', 'Lisa Marie', 4, 0, 0, 0, 'KTW', 'KTW', 'KTW', 'KTW'],
      ['Jagersberger', 'Rudolf', 0, 0, 0, 3, 'DF', 'DF', 'DF', null]
    ]
  };
  const res = importFromExcelSheets(sheets, defaultCategories());
  assertEq(res.data.version, 2, 'Import liefert v2-Schema');
  const names = res.data.people.map(p => p.nachname);
  assert(!names.includes('ZZ'), 'ZZ-Müllzeilen verworfen');
  assert(names.includes('Weggang'), 'Austritt-Name als Person übernommen');
  const willi = res.data.people.find(p => p.nachname === 'Weggang');
  assertEq(willi.status, 'ausgetreten', 'Austritt-Name als ausgetreten markiert');
  const tobias = res.data.people.find(p => p.nachname === 'Bachner');
  assertEq([tobias.fahrlizenz, tobias.stufe], ['keine', 'RS2'], '„TF - R2“ normalisiert und migriert');
  assertEq(tobias.qualifikationAlt, 'TF-R2', 'alter Wert mitgeführt');
  const mia = res.data.people.find(p => p.nachname === 'Cerny');
  assertEq([mia.fahrlizenz, mia.stufe], ['B3', 'NFS'], '„B3 - NFS“ migriert (trotz Leerzeichen im Namen)');
  const lisa = res.data.people.find(p => p.nachname === 'Dollinger');
  assertEq([lisa.fahrlizenz, lisa.stufe], ['keine', 'Praktikant'], 'Prkt migriert');
  const greta = res.data.people.find(p => p.nachname === 'Almberger');
  assertEq([greta.fahrlizenz, greta.stufe], ['B3', null], 'B3 → Stufe nachpflegen');
  assertEq(res.data.evenings.length, 4, '4 Abende aus Datumsspalten');
  assertEq(res.data.evenings[0].date, '2026-01-01', 'Excel-Serial → ISO-Datum');
  assertEq(res.data.evenings[0].assignments[tobias.id], [{ kat: 'KTW', rolle: null }], 'Import-Zuordnungen im v2-Format ohne Rolle');

  const stats = computeStats(res.data);
  const sg = stats.perPerson[greta.id];
  assertEq(sg.catCounts['RTW'], 2, 'Greta 2× RTW');
  assertEq(sg.catCounts['KTW'], 1, 'Greta 1× KTW');
  assert(approx(sg.presencePct, 0.75), 'Greta 75 % (expliziter 0er vor erstem Dienst zählt als erwartet)');
  const st = stats.perPerson[tobias.id];
  assert(approx(st.presencePct, 1), 'Tobias 100 % (anwesend ohne Dienst via partials)');
  assertEq(st.dienste, 3, 'Tobias 3 Dienste (Anwesenheit ohne Dienst zählt nicht als Dienst)');
  const sm = stats.perPerson[mia.id];
  assertEq(sm.catCounts['ABD'], 1, 'altes ÄND → Kategorie ABD');
  assert(approx(sm.presencePct, 0.5), 'Mia 50 % (Neuzugang ab d2, Bruch 0,5)');
  assertEq(res.dfCandidates.map(c => c.dfCount), [3], 'DF-Kandidat mit 3 DF-Diensten erkannt');
  const rudolf = res.data.people.find(p => p.nachname === 'Jagersberger');
  assert(rudolf.df === true, 'df-Flag vorbelegt');
})();

/* ============ Abend verbuchen (überschreiben/zusammenführen) ============ */
(function () {
  const data = defaultData();
  data.evenings.push({ date: '2026-06-09', assignments: { a: [{ kat: 'KTW', rolle: 'fahrer' }] }, partials: { a: 0.5 }, gaeste: ['Gerda Gast'] });
  upsertEvening(data, { date: '2026-06-09', assignments: { a: [{ kat: 'RTW', rolle: 'tf' }], b: A('KTW') }, gaeste: ['Gerda Gast', 'Hans Helfer'] }, 'zusammenführen');
  assertEq(data.evenings[0].assignments['a'].map(e => e.kat).sort(), ['KTW', 'RTW'], 'Zusammenführen vereinigt Kategorien');
  assertEq(data.evenings[0].assignments['a'].find(e => e.kat === 'KTW').rolle, 'fahrer', 'bestehende Rolle bleibt beim Zusammenführen');
  assertEq(data.evenings[0].assignments['b'].map(e => e.kat), ['KTW'], 'Zusammenführen ergänzt Personen');
  assertEq(data.evenings[0].gaeste, ['Gerda Gast', 'Hans Helfer'], 'Gäste werden vereinigt (ohne Duplikate)');
  upsertEvening(data, { date: '2026-06-09', assignments: { c: A('DF') } }, 'überschreiben');
  assertEq(Object.keys(data.evenings[0].assignments), ['c'], 'Überschreiben ersetzt den Abend');
  upsertEvening(data, { date: '2026-06-16', assignments: {} }, 'neu');
  assertEq(data.evenings.length, 2, 'neues Datum wird angehängt');
})();

/* ============ Validierung ============ */
(function () {
  let threw = false;
  try { validateData({ people: [] }); } catch (e) { threw = true; }
  assert(threw, 'unvollständige Datei wird abgelehnt');
  const ok = validateData({ version: 1, categories: [], people: [], evenings: [{ date: '2026-01-01' }] });
  assertEq(ok.evenings[0].assignments, {}, 'fehlende assignments werden ergänzt');
})();

print('');
print('Tests: ' + (_pass + _fail) + ', bestanden: ' + _pass + ', fehlgeschlagen: ' + _fail);
if (_fail > 0) { throw new Error(_fail + ' Tests fehlgeschlagen'); }
