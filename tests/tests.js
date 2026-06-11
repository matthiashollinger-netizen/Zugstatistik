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
  assertEq(v1.version, 4, 'version → 4 (v1→v4-Kette)');
  assertEq(v1.quittierungen, [], 'quittierungen ergänzt');
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
  /* Zählwerte nach v3-Semantik: der alte partials-Wert 0,5 wirkt als Faktor */
  const stats = computeStats(v1);
  assert(approx(stats.perPerson.pa.dienste, 1.5), 'Dienste mit Faktor (0,5 + 1)');
  assert(approx(stats.perPerson.pa.catCounts.RTW, 0.5), 'Faktor wirkt auf die Kategorie des Abends');
  assert(approx(stats.perPerson.pa.catCounts.ABD, 0.5) && approx(stats.perPerson.pa.catCounts.ZBV, 0.5), 'Kombi-Abend zählt je 0,5');
  assert(approx(stats.perPerson.pa.presenceSum, 1.5), 'Migration ändert Anwesenheit nicht');
})();

/* ============ Migration: v2/v3 → v4 (Gäste werden Objekte), v4 lädt unverändert ============ */
(function () {
  const mk = (version, gaeste) => {
    const d = defaultData();
    d.version = version;
    d.gastListe = ['Gerda Gast'];
    if (version >= 4) d.quittierungen = [{ key: 'doppel-df:2026-01-05', datum: '2026-06-10' }];
    else delete d.quittierungen;
    d.people.push(P('pa', 'B3', 'NFS', { qualifikationAlt: 'B3-NFS' }));
    d.evenings.push({ date: '2026-01-05', assignments: { pa: [{ kat: 'RTW', rolle: 'fahrer' }] }, partials: { pa: 0.5 }, gaeste });
    return d;
  };
  /* v3 → v4: Gast-Strings werden zu Objekten mit kats: null (Kategorie unbekannt) */
  const v3 = mk(3, ['Gerda Gast', 'Hans Helfer']);
  assert(migrateData(v3) === true, 'v3-Datei wird migriert gemeldet');
  assertEq(v3.version, 4, 'v3 → version 4');
  assertEq(v3.quittierungen, [], 'quittierungen ergänzt');
  assertEq(v3.evenings[0].gaeste, [{ name: 'Gerda Gast', kats: null }, { name: 'Hans Helfer', kats: null }],
    'Gast-Strings → {name, kats: null}');
  assertEq(v3.evenings[0].partials, { pa: 0.5 }, 'Faktor-Map unverändert');

  /* v2 → v4: dieselbe Kette */
  const v2 = mk(2, ['Gerda Gast']);
  assert(migrateData(v2) === true, 'v2-Datei wird migriert gemeldet');
  assertEq(v2.version, 4, 'v2 → version 4');
  assertEq(v2.evenings[0].gaeste[0].kats, null, 'v2-Gast migriert');

  /* v4 lädt byte-identisch */
  const v4 = mk(4, [{ name: 'Gerda Gast', kats: [{ kat: 'KTW', wert: 1 }], rolle: 'p2' }]);
  const before4 = JSON.stringify(v4);
  assert(migrateData(v4) === false, 'v4-Datei wird nicht als migriert gemeldet');
  assertEq(JSON.stringify(v4), before4, 'v4-Datei bleibt byte-identisch (inkl. Quittierungen und Gast-Objekten)');
})();

/* ============ 0-Werte-Bereinigung ============ */
(function () {
  const d = defaultData();
  d.people.push(P('pa', 'B3', null), P('pb', 'B2', null));
  /* redundante 0 ohne Zuordnung → entfernen; 0 mit Zuordnung → bleibt (Fehler) */
  d.evenings.push({ date: '2026-01-05', assignments: { pa: A('KTW') }, partials: { pa: 0, pb: 0 } });
  d.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pa: 0, pb: 0.5 } });
  const n = cleanupNullWerte(d);
  assertEq(n, 2, '2 redundante 0-Werte bereinigt (beziffert)');
  assertEq(d.evenings[0].partials, { pa: 0 }, 'Faktor 0 MIT Zuordnung bleibt (Widerspruch sichtbar lassen)');
  assertEq(d.evenings[1].partials, { pb: 0.5 }, 'Teilwert ohne Zuordnung bleibt (echte Teil-Anwesenheit)');
  const fehler = checkData(d).filter(f => f.typ === 'fehler');
  assertEq(fehler.map(f => f.code), ['faktor'], 'nach Bereinigung bleibt genau der Widerspruchs-Fehler');
  assertEq(cleanupNullWerte(d), 0, 'zweiter Lauf findet nichts mehr');
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
  /* 0,5-Regel: der Kombi-Abend teilt sich auf ÄBD und ZBV auf */
  assert(approx(s.catPct['ABD'], 0.05), 'ÄBD 5 % (Kombi zählt 0,5)');
  assert(approx(s.catPct['ZBV'], 0.05), 'ZBV 5 % (Summe exakt 100 %)');
  assert(approx(s.catCounts['KTW'] + s.catCounts['RTW'] + s.catCounts['ABD'] + s.catCounts['ZBV'] + s.catCounts['DF'], s.dienste),
    'Invariante: Summe der Kategorie-Werte = Dienste');
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
  assertEq(fmtVorN(3), 'vor 3 Diensten', 'Format N (UI-Begriff „Dienst“)');
  assertEq(fmtVorN(1), 'vor 1 Dienst', 'Format Singular');
  assertEq(fmtVorN(0), 'beim letzten Dienst', 'Format 0');
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
  // v3-Faktor: wirkt einheitlich auf Anwesenheit, Dienste und Kategorien;
  // Anwesenheit ohne Dienst (Override 1) zählt weiterhin nicht als Dienst
  const data = defaultData();
  data.people.push(P('pt', 'B3', null, { eintritt: '2026-01-05' }));
  data.evenings.push({ date: '2026-01-05', assignments: { pt: A('RTW') }, partials: { pt: 0.5 } }); // halber Dienst
  data.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pt: 1 } });                 // da, aber kein Dienst
  data.evenings.push({ date: '2026-01-19', assignments: {} });                                      // abwesend
  const stats = computeStats(data);
  const s = stats.perPerson['pt'];
  assert(approx(s.dienste, 0.5), 'Faktor 0,5 → 0,5 Dienste (nicht 1)');
  assert(approx(s.catCounts['RTW'], 0.5), 'Faktor wirkt auf die Kategorie (RTW 0,5)');
  assert(approx(stats.catTotals['RTW'], 0.5), 'Faktor wirkt auf die Gesamtsumme');
  assertEq(s.catPct['RTW'], 1, 'Anteil bleibt 0,5/0,5 = 100 %');
  assert(approx(s.presenceSum, 1.5), 'Anwesenheitssumme 0,5 + 1');
  assert(approx(s.presencePct, 0.5), 'Anwesenheit 1,5 / 3 = 50 %');
})();

(function () {
  // 0,5-Regel: Kombi ÄBD/ZBV teilt den Dienst — mit Faktor 0,7 je 0,35
  const data = defaultData();
  data.people.push(P('pz', 'B2', null), P('pr', 'B2', null));
  data.evenings.push({ date: '2026-01-05', assignments: { pz: A('ABD', 'ZBV'), pr: A('ABD') }, partials: { pz: 0.7 } });
  const stats = computeStats(data);
  const s = stats.perPerson['pz'];
  assert(approx(s.dienste, 0.7), 'der Abend zählt wie gehabt als 1 × Faktor Dienst');
  assert(approx(s.catCounts['ABD'], 0.35) && approx(s.catCounts['ZBV'], 0.35), 'Kombi + Faktor 0,7 ⇒ 0,35 / 0,35');
  assert(approx(s.catPct['ABD'], 0.5) && approx(s.catPct['ZBV'], 0.5), 'Anteile je 50 % — Summe exakt 100 %');
  /* reine Codes bleiben 1,0 */
  assert(approx(stats.perPerson['pr'].catCounts['ABD'], 1), 'reines ÄBD bleibt 1,0');
  assert(approx(stats.catTotals['ABD'], 1.35) && approx(stats.catTotals['ZBV'], 0.35), 'Gesamtsummen mit 0,5-Regel');
})();

/* ============ Invariante: Summe Kategorien = Dienste (Eigenschaft) ============ */
(function () {
  const data = defaultData();
  data.people.push(P('a', 'B3', 'NFS', { df: true }), P('b', 'B2', 'RS1'), P('c', 'keine', 'Praktikant'));
  data.evenings.push({ date: '2026-01-05', assignments: { a: A('RTW'), b: A('ABD', 'ZBV'), c: A('KTW') }, partials: { c: 0.5 } });
  data.evenings.push({ date: '2026-01-12', assignments: { a: A('DF'), b: A('KTW', 'RTW') }, partials: { b: 0.7 } });
  data.evenings.push({ date: '2026-01-19', assignments: { a: A('ABD', 'ZBV') }, partials: { a: 0.3 } });
  const stats = computeStats(data);
  for (const p of data.people) {
    const s = stats.perPerson[p.id];
    const summe = Object.values(s.catCounts).reduce((x, y) => x + y, 0);
    assert(approx(summe, s.dienste), 'Invariante hält für ' + p.id + ' (' + summe + ' = ' + s.dienste + ')');
    let pctSum = 0;
    for (const cid of Object.keys(s.catPct)) pctSum += s.catPct[cid] || 0;
    assert(s.dienste === 0 || pctSum <= 1 + 1e-9, 'Prozentsumme nie über 100 % (' + p.id + ')');
  }
  assertEq(checkData(data).filter(f => f.code === 'kategorien-summe'), [], 'Datenprüfungs-Invariante meldet nichts bei korrekten Daten');
})();

/* ============ de-AT-Formatierung (Komma, bis zu 2 Nachkommastellen) ============ */
(function () {
  assertEq(fmtZahl(1), '1', 'glatte 1 ohne „,0“');
  assertEq(fmtZahl(7), '7', 'glatte 7');
  assertEq(fmtZahl(0.5), '0,5', 'Komma statt Punkt');
  assertEq(fmtZahl(0.7), '0,7', '0,7');
  assertEq(fmtZahl(0.35), '0,35', 'zwei Nachkommastellen wo nötig (Kombi × Faktor)');
  assertEq(fmtZahl(1.25), '1,25', '1,25 bleibt exakt');
  assertEq(fmtZahl(0.349), '0,35', 'auf 2 Nachkommastellen gerundet');
  assertEq(fmtZahl(2.004), '2', '2,004 → glatt 2');
  assertEq(fmtZahl(null), '–', 'null → Strich');
})();

/* ============ katWerte (Tour-Kategorien → Werte, auch für Gäste) ============ */
(function () {
  assertEq(katWerte(['KTW']), [{ kat: 'KTW', wert: 1 }], 'reiner Code → 1,0');
  assertEq(katWerte(['ABD', 'ZBV']), [{ kat: 'ABD', wert: 0.5 }, { kat: 'ZBV', wert: 0.5 }], 'Kombi → je 0,5');
  assertEq(katWerte([]), [], 'leer bleibt leer');
})();

/* ============ Ausgrauen: KTW nie (auch Praktikant nicht) ============ */
(function () {
  const cats = defaultCategories();
  const ktw = cats.find(c => c.id === 'KTW'), rtw = cats.find(c => c.id === 'RTW'), abd = cats.find(c => c.id === 'ABD');
  const prkt = P('p1', 'keine', 'Praktikant'), offen = P('p2', 'keine', null), b3 = P('p3', 'B3', 'NFS');
  assert(!istAusgegraut(prkt, ktw), 'Praktikant: KTW nicht ausgegraut (fährt als 2. Trspf. mit)');
  assert(!istAusgegraut(offen, ktw), 'Stufe fehlt: KTW nicht ausgegraut');
  assert(!istAusgegraut(b3, ktw), 'Berechtigter: KTW nicht ausgegraut');
  assert(istAusgegraut(prkt, rtw), 'RTW bleibt für Nicht-Berechtigte grau');
  assert(istAusgegraut(prkt, abd), 'ÄBD bleibt für Nicht-Berechtigte grau');
  assert(!istAusgegraut(b3, rtw), 'RTW-Berechtigte nicht grau');
})();

/* ============ DF-Statistik (Personenauswahl, 100-%-Bilanz, Grau-Zeile) ============ */
(function () {
  const data = defaultData();
  data.people.push(
    P('mit', 'B3', 'RS2', { df: true }),       // Häkchen + Dienste
    P('nur_haken', 'B2', 'RS1', { df: true }), // Häkchen ohne Dienste
    P('ohne_haken', 'B3', 'NFS'),              // Dienste ohne Häkchen → grau
    P('nix', 'A', 'RS1')                       // weder noch → fehlt
  );
  data.evenings.push({ date: '2026-01-05', assignments: { mit: A('DF'), ohne_haken: A('DF'), nix: A('KTW') } });
  data.evenings.push({ date: '2026-01-12', assignments: { mit: A('DF'), nix: A('KTW') } });
  const rows = dfStatistik(data, computeStats(data));
  assertEq(rows.map(r => r.p.id), ['mit', 'ohne_haken', 'nur_haken'], 'Auswahl: Häkchen oder DF > 0, sortiert nach DF-Diensten');
  assert(approx(rows[0].anteil, 2 / 3) && approx(rows[1].anteil, 1 / 3), 'Bilanz untereinander');
  assert(approx(rows.reduce((x, r) => x + (r.anteil || 0), 0), 1), 'Anteile summieren sich auf 100 %');
  assert(rows[1].ohneBerechtigung === true, 'DF-Dienste ohne Häkchen werden markiert');
  assert(rows[2].ohneBerechtigung === false && rows[2].dfDienste === 0, 'Häkchen ohne Dienste: normale Zeile mit 0');
  assert(approx(rows[0].dienste, 2), 'DF zählt unverändert in die Gesamt-Dienste');
  /* DF % = DF-Dienste ÷ Gesamt-Dienste der Person (≠ Bilanz „Anteil an allen DF“) */
  assert(approx(rows[0].dfPct, 1), '„mit“: 2 von 2 Diensten sind DF → 100 %');
  assert(approx(rows[1].dfPct, 1), '„ohne_haken“: 1 von 1 → 100 % (obwohl Bilanz nur 33 %)');
  assertEq(rows[2].dfPct, null, 'ohne Dienste kein DF % (–)');
})();

/* ============ DF %: Faktor-gewichtet wie alle Kategorie-Prozente ============ */
(function () {
  const data = defaultData();
  data.people.push(P('pa', 'B3', 'RS2', { df: true }));
  data.evenings.push({ date: '2026-01-05', assignments: { pa: A('DF') }, partials: { pa: 0.5 } }); // halber DF
  data.evenings.push({ date: '2026-01-12', assignments: { pa: A('KTW') } });
  data.evenings.push({ date: '2026-01-19', assignments: { pa: A('KTW') } });
  const rows = dfStatistik(data, computeStats(data));
  assert(approx(rows[0].dfDienste, 0.5), 'halber DF-Dienst zählt 0,5');
  assert(approx(rows[0].dienste, 2.5), 'Gesamt-Dienste Faktor-gewichtet (0,5 + 1 + 1)');
  assert(approx(rows[0].dfPct, 0.2), 'DF % = 0,5 / 2,5 = 20 %');
  assert(approx(rows[0].anteil, 1), 'Bilanz: 100 % aller DF-Dienste (Abgrenzung zur DF-%-Spalte)');
})();

/* ============ Gäste: Aggregation inkl. „?“-Spalte ============ */
(function () {
  const data = defaultData();
  data.evenings.push({ date: '2026-01-05', gaeste: [
    { name: 'Gerda Gast', kats: [{ kat: 'KTW', wert: 1 }], rolle: 'p2' },
    { name: 'Hans Helfer', kats: null }                                    // Alt-Einsatz, Kategorie unbekannt
  ], assignments: {} });
  data.evenings.push({ date: '2026-01-12', gaeste: [
    { name: 'gerda gast', kats: [{ kat: 'ABD', wert: 0.5 }, { kat: 'ZBV', wert: 0.5 }], rolle: 'fahrer' },
    'Hans Helfer'                                                          // toleranter Alt-String
  ], assignments: {} });
  const rows = gastTabelle(data);
  assertEq(rows.length, 2, 'zwei Gäste aggregiert (case-insensitiv)');
  const gerda = rows.find(r => normKey(r.name) === 'gerda gast');
  assertEq(gerda.einsaetze, 2, 'Gerda: 2 Einsätze');
  assert(approx(gerda.counts['KTW'], 1) && approx(gerda.counts['ABD'], 0.5) && approx(gerda.counts['ZBV'], 0.5), 'Kombi zählt auch bei Gästen je 0,5');
  assertEq(gerda.unbekannt, 0, 'Gerda: keine unbekannten');
  const hans = rows.find(r => normKey(r.name) === 'hans helfer');
  assertEq(hans.einsaetze, 2, 'Hans: 2 Einsätze');
  assertEq(hans.unbekannt, 2, 'Hans: beide in der „?“-Spalte (kats null bzw. Alt-String)');
  /* Standard-Sortierung: Einsätze absteigend, dann Name */
  assertEq(rows.map(r => r.einsaetze), [2, 2], 'Sortierung nach Einsätzen');
})();

/* ============ Quittieren (offene vs. quittierte Befunde) ============ */
(function () {
  const data = defaultData();
  data.people.push(P('pa', 'B3', null, { df: true }), P('pb', 'B2', 'RS1', { df: true }));
  data.evenings.push({ date: '2026-01-12', assignments: { pa: A('DF'), pb: A('DF') } });
  data.evenings.push({ date: '2026-01-12', assignments: {} }); // Fehler: doppeltes Datum
  const findings = checkData(data);
  /* stabile Schlüssel */
  assert(findings.some(f => f.key === 'doppel-df:2026-01-12'), 'Schlüssel doppel-df:<datum>');
  assert(findings.some(f => f.key === 'stufe-fehlt:pa'), 'Schlüssel stufe-fehlt:<personId>');
  assert(findings.every(f => typeof f.key === 'string' && f.key.length), 'jeder Befund hat einen Schlüssel');

  const o0 = offeneBefunde(findings, []);
  assertEq(o0.quittiert.length, 0, 'ohne Quittierungen ist alles offen');

  const quitt = [{ key: 'doppel-df:2026-01-12', datum: '2026-06-11' }, { key: 'stufe-fehlt:pa', datum: '2026-06-11' }];
  const o1 = offeneBefunde(findings, quitt);
  assertEq(o1.quittiert.map(f => f.key).sort(), ['doppel-df:2026-01-12', 'stufe-fehlt:pa'], 'quittierte Hinweise ausgeblendet');
  assert(o1.offen.some(f => f.code === 'datum-doppelt'), 'Fehler sind nie quittierbar');
  assert(!o1.offen.some(f => f.key === 'doppel-df:2026-01-12'), 'quittierter Hinweis nicht mehr offen');
  /* Badge-Zählung = offene; Zurücksetzen = alles wieder offen */
  assertEq(offeneBefunde(findings, []).offen.length, findings.length, 'Zurücksetzen: alle wieder offen');
  /* unbekannte Schlüssel in der Datei stören nicht */
  assertEq(offeneBefunde(findings, [{ key: 'gibt-es-nicht', datum: '2026-01-01' }]).offen.length, findings.length, 'verwaiste Quittierung ist harmlos');
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

/* ============ Berechtigung & TF × RTW ohne B3-Fahrer ============ */
(function () {
  const data = defaultData();
  data.people.push(P('a', 'B3', null), P('d', 'A', null), P('e', 'B3', null, { df: true }));
  const rtw = data.categories.find(c => c.id === 'RTW');
  assert(isEligible(data.people[0], rtw), 'B3 ist RTW-berechtigt');
  assert(!isEligible(data.people[1], rtw), 'A ist nicht RTW-berechtigt');
  const df = data.categories.find(c => c.id === 'DF');
  assert(isEligible(data.people[2], df) && !isEligible(data.people[0], df), 'DF-Berechtigung über df-Häkchen');

  /* FEATURE: TF × RTW — B3-Fahrer werden als Fahrer gebraucht */
  const ktw = data.categories.find(c => c.id === 'KTW');
  const leute = [P('b3nfs', 'B3', 'NFS'), P('b3rs2', 'B3', 'RS2'), P('rs2', 'keine', 'RS2'), P('b2nfs', 'B2', 'NFS'), P('offen', 'B3', null)];
  const tkRtw = tfKandidaten(rtw, leute);
  assertEq(tkRtw.kandidaten.map(p => p.id), ['rs2', 'b2nfs'], 'RTW-TF: B3-Fahrer ausgeschlossen, stufe=null sowieso nicht TF');
  assertEq(tkRtw.ausgeblendet, 2, '2 B3-Fahrer ausgeblendet (für die Fußnote)');
  const tkKtw = tfKandidaten(ktw, leute);
  assertEq(tkKtw.kandidaten.map(p => p.id), ['b3nfs', 'b3rs2', 'rs2', 'b2nfs'], 'KTW-TF: weiterhin alle TF-Geeigneten');
  assertEq(tkKtw.ausgeblendet, 0, 'KTW: niemand ausgeblendet');
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
  assertEq(res.data.version, 4, 'Import liefert das aktuelle Schema (v4)');
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
  assert(approx(sm.catCounts['RTW'], 0.5), 'v3: Bruch-Anwesenheit bei Dienst wirkt als Faktor auf die Kategorie');
  assert(approx(sm.dienste, 1.5), 'v3: Dienste mit Faktor (1 + 0,5)');
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

/* ============ Zeiterkennung & Faktor-Berechnung ============ */
(function () {
  const z = parseTimeRange('Gudrun Huber 22:00 - 06:00');
  assert(z !== null, 'Zeitspanne im Namen erkannt');
  assertEq([z.von, z.bis], [22 * 60, 6 * 60], 'von/bis in Minuten');
  assertEq(z.text, '22:00–06:00', 'normalisierter Anzeigetext');
  assertEq(parseTimeRange('Hans Huber'), null, 'kein Treffer ohne Zeitspanne');
  assertEq(parseTimeRange('Zimmer 1-36'), null, 'Zimmernummern sind keine Zeitspanne');
  assert(parseTimeRange('18.30 – 06.00') !== null, 'Punkt statt Doppelpunkt und Gedankenstrich');
  assertEq(spanMinutes({ von: 22 * 60, bis: 6 * 60 }), 480, 'über Mitternacht: 22:00–06:00 = 8 h');
  assertEq(spanMinutes({ von: 18 * 60 + 30, bis: 6 * 60 }), 690, '18:30–06:00 = 11,5 h');
  assertEq(spanMinutes({ von: 8 * 60, bis: 12 * 60 }), 240, 'normaler Tagesbereich');
  /* Referenzfall der Spezifikation */
  assertEq(zeitFaktor({ von: 22 * 60, bis: 6 * 60 }, { von: 18 * 60 + 30, bis: 6 * 60 }), 0.7, 'Referenz: 8,0/11,5 → 0,7');
  assertEq(zeitFaktor({ von: 18 * 60, bis: 6 * 60 }, { von: 20 * 60, bis: 6 * 60 }), 1, 'länger als die Tour → auf 1 geklemmt');
  assertEq(zeitFaktor({ von: 20 * 60, bis: 20 * 60 + 30 }, { von: 18 * 60, bis: 6 * 60 }), 0.1, 'sehr kurz → mindestens 0,1 (offenes Intervall)');
  assertEq(zeitFaktor(null, { von: 0, bis: 60 }), null, 'ohne Personenzeit kein Faktor');
  assertEq(zeitFaktor({ von: 0, bis: 60 }, null), null, 'ohne Tourzeit kein Faktor');
})();

/* ============ Parser: Zeitangabe in der Crew-Zelle ============ */
(function () {
  const kopf = ['RKT SBG Zug 11 - 09.06.2026', 'Tour / Fzg', 'Zeiten', 'Zimmer', 'Fahrer', 'Transportführer', '2. Trspf. / Praktikant'];
  /* Fall 1: Zeit in derselben Zelle */
  const plan1 = [...kopf,
    ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tAnna Fahrer\tGudrun Huber 22:00 - 06:00\tPaul Dritter'
  ].join('\n');
  const r1 = parsePlan(plan1, defaultCategories()).tours[0];
  assertEq(r1.zeit, { von: 18 * 60 + 30, bis: 6 * 60 }, 'Tourzeiten aus der Zeiten-Spalte');
  assertEq(r1.crew.map(c => c.name), ['Anna Fahrer', 'Gudrun Huber', 'Paul Dritter'], 'Zeit aus dem Namen gelöst');
  assertEq(r1.crew[1].faktor, 0.7, 'Faktor 0,7 am TF erkannt (Referenzfall)');
  assertEq(r1.crew[1].zeit.text, '22:00–06:00', 'erkannte Zeit fürs UI');
  assertEq(r1.crew[0].faktor, null, 'ohne eigene Zeit kein Faktor');

  /* Fall 2: Zeit in der Folgezeile derselben Zelle (Zellumbruch beim Kopieren) */
  const plan2 = [...kopf,
    ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tAnna Fahrer\tGudrun Huber\tPaul Dritter', '22:00 - 06:00'
  ].join('\n');
  const r2 = parsePlan(plan2, defaultCategories()).tours[0];
  assertEq(r2.crew.map(c => c.name), ['Anna Fahrer', 'Gudrun Huber', 'Paul Dritter'], 'Folgezeile: Crew bleibt vollständig');
  assertEq(r2.crew.filter(c => c.faktor !== null).map(c => [c.name, c.faktor])[0], ['Paul Dritter', 0.7], 'Folgezeile hängt an der umgebrochenen Zelle');

  /* Fall 2b: Zellumbruch mitten in der Zeile — Rest der Zeile folgt nach der Zeit */
  const plan3 = [...kopf,
    ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tAnna Fahrer\tGudrun Huber', '22:00 - 06:00\tPaul Dritter'
  ].join('\n');
  const r3 = parsePlan(plan3, defaultCategories()).tours[0];
  assertEq(r3.crew.map(c => c.name), ['Anna Fahrer', 'Gudrun Huber', 'Paul Dritter'], 'Zeilenumbruch mitten in der Zelle: alle 3 erkannt');
  assertEq(r3.crew[1].faktor, 0.7, 'Faktor landet bei der richtigen Person (TF)');

  /* Ohne Zeitangaben bleibt alles wie bisher */
  const plan4 = [...kopf, ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tAnna Fahrer\tBert Zweiter\t'].join('\n');
  const r4 = parsePlan(plan4, defaultCategories()).tours[0];
  assertEq(r4.crew.length, 2, 'normale Crew-Zeile unverändert');
  assert(r4.crew.every(c => c.faktor === null), 'keine Faktoren ohne Zeitangabe');
})();

/* ============ Heatmap-Interpolation (feste Anker 0/50/100 %) ============ */
(function () {
  assertEq(heatRGB(0), [0xF8, 0x69, 0x6B], 'Anker 0 % = Rot');
  assertEq(heatRGB(0.5), [0xFF, 0xEB, 0x84], 'Anker 50 % = Gelb');
  assertEq(heatRGB(1), [0x63, 0xBE, 0x7B], 'Anker 100 % = Grün');
  assertEq(heatRGB(0.25), [252, 170, 120], '25 % = Mitte Rot→Gelb');
  assertEq(heatRGB(0.75), [177, 213, 128], '75 % = Mitte Gelb→Grün');
  assertEq(heatRGB(-0.5), heatRGB(0), 'unter 0 geklemmt');
  assertEq(heatRGB(1.5), heatRGB(1), 'über 1 geklemmt');
  assertEq(heatCss(0.5, 0), 'rgb(255,235,132)', 'volle Skala (Bericht)');
  assertEq(heatCss(1, 0.5), 'rgb(177,223,189)', 'gedämpft = Richtung Weiß gemischt (Dashboard)');
  assertEq(heatCss(null), '', 'kein Wert → keine Farbe');
})();

/* ============ Datenprüfung (jede Regel positiv/negativ) ============ */
(function () {
  const code = (findings, c) => findings.filter(f => f.code === c);

  /* sauberer Datensatz → keine Befunde */
  const clean = defaultData();
  clean.people.push(P('pa', 'B3', 'NFS', { df: true }));
  clean.evenings.push({ date: '2026-01-05', assignments: { pa: A('RTW') }, partials: { pa: 0.5 } });
  assertEq(checkData(clean), [], 'sauberer Datensatz: keine Auffälligkeiten');

  /* Hinweis: mehr als 1 DF pro Abend */
  const d1 = defaultData();
  d1.people.push(P('pa', 'B3', 'NFS', { df: true }), P('pb', 'B2', 'RS1', { df: true }));
  d1.evenings.push({ date: '2026-01-05', assignments: { pa: A('DF'), pb: A('DF') } });
  const f1 = checkData(d1);
  assertEq(code(f1, 'df-mehrfach').length, 1, 'Doppel-DF wird gemeldet');
  assertEq(code(f1, 'df-mehrfach')[0].typ, 'hinweis', 'Doppel-DF ist Hinweis, kein Fehler (geteilter Dienst möglich)');
  assert(code(f1, 'df-mehrfach')[0].text.includes('pa X') && code(f1, 'df-mehrfach')[0].text.includes('pb X'), 'Personen werden genannt');
  d1.evenings[0].assignments = { pa: A('DF') };
  assertEq(code(checkData(d1), 'df-mehrfach').length, 0, 'einzelner DF: kein Hinweis');

  /* ÄBD/ZBV-Kombi ist seit der 0,5-Regel kein Hinweis mehr (entfällt ersatzlos) */
  const d2 = defaultData();
  d2.people.push(P('pa', 'B2', 'RS1'));
  d2.evenings.push({ date: '2026-01-05', assignments: { pa: A('ABD', 'ZBV') } });
  const f2 = checkData(d2);
  assertEq(f2.filter(f => f.code === 'abd-zbv').length, 0, 'kein ÄBD/ZBV-Hinweis mehr');
  assertEq(f2.length, 0, 'Kombi-Abend erzeugt gar keinen Befund mehr (Summen können nicht mehr über 100 % gehen)');

  /* Hinweis: Stufe fehlt — je Person, quittierbar */
  const d3 = defaultData();
  d3.people.push(P('pa', 'B3', null), P('pb', 'B2', null), P('px', 'B2', null, { status: 'ausgetreten' }));
  const f3 = code(checkData(d3), 'stufe-fehlt');
  assertEq(f3.length, 2, 'je Person ein Stufe-fehlt-Hinweis (Ausgetretene zählen nicht)');
  assertEq(f3.map(f => f.key).sort(), ['stufe-fehlt:pa', 'stufe-fehlt:pb'], 'stabile Schlüssel je Person');
  d3.people[0].stufe = 'RS2'; d3.people[1].stufe = 'NFS';
  assertEq(code(checkData(d3), 'stufe-fehlt').length, 0, 'alle gepflegt: kein Hinweis');

  /* Fehler: Faktor außerhalb (0, 1] */
  const d4 = defaultData();
  d4.people.push(P('pa', 'B3', null));
  d4.evenings.push({ date: '2026-01-05', assignments: { pa: A('KTW') }, partials: { pa: 0 } });
  assertEq(code(checkData(d4), 'faktor').length, 1, 'Faktor 0 bei Dienst ist Fehler');
  d4.evenings[0].partials.pa = 1.5;
  assertEq(code(checkData(d4), 'faktor').length, 1, 'Faktor 1,5 ist Fehler');
  d4.evenings[0].partials.pa = 0.7;
  assertEq(code(checkData(d4), 'faktor').length, 0, 'Faktor 0,7 ist gültig');

  /* Fehler: Anwesenheitswert außerhalb [0, 1] (ohne Dienst) */
  const d5 = defaultData();
  d5.people.push(P('pa', 'B3', null));
  d5.evenings.push({ date: '2026-01-05', assignments: { pa: A('KTW') } });
  d5.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pa: -0.2 } });
  assertEq(code(checkData(d5), 'anwesenheitswert').length, 1, 'negativer Anwesenheitswert ist Fehler');
  d5.evenings[1].partials.pa = 0;
  assertEq(code(checkData(d5), 'anwesenheitswert').length, 0, '0 ohne Dienst ist gültig (abwesend)');

  /* Fehler: Anwesenheit > 100 % */
  const d6 = defaultData();
  d6.people.push(P('pa', 'B3', null));
  d6.evenings.push({ date: '2026-01-05', assignments: { pa: A('KTW') } });
  d6.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pa: 1.6 } });
  const f6 = checkData(d6);
  assertEq(code(f6, 'anwesenheit-ueber-100').length, 1, 'Anwesenheit über 100 % ist Fehler');
  assertEq(code(f6, 'anwesenheitswert').length, 1, '… zusätzlich ist der Abend-Wert außerhalb [0, 1]');

  /* Invariante: auch ein (korrupter) Doppel-Eintrag derselben Kategorie kann die
     Summe nicht mehr über die Dienste heben (je Eintrag f/n) */
  const d7 = defaultData();
  d7.people.push(P('pa', 'B3', null));
  d7.evenings.push({ date: '2026-01-05', assignments: { pa: [{ kat: 'KTW', rolle: null }, { kat: 'KTW', rolle: null }] } });
  const s7 = computeStats(d7).perPerson['pa'];
  assert(approx(s7.catCounts['KTW'], 1) && approx(s7.dienste, 1), 'Doppel-Eintrag: Summe bleibt = Dienste');
  assertEq(code(checkData(d7), 'kategorien-summe').length, 0, 'Invariante hält auch hier');

  /* Fehler: doppelte Abend-Daten */
  const d8 = defaultData();
  d8.evenings.push({ date: '2026-01-05', assignments: {} }, { date: '2026-01-05', assignments: {} });
  assertEq(code(checkData(d8), 'datum-doppelt').length, 1, 'doppeltes Datum wird gemeldet');
  d8.evenings.pop();
  assertEq(code(checkData(d8), 'datum-doppelt').length, 0, 'eindeutige Daten: kein Fehler');
})();

/* ============ Mehrfachbearbeitung (Kern) ============ */
(function () {
  const mk = () => [
    P('a', 'B3', 'NFS', { df: true, status: 'aktiv', austritt: null }),
    P('b', 'A', null, { qualifikationAlt: 'A' }),
    P('c', 'keine', 'RS1', { status: 'ausgetreten' })
  ];
  /* „unverändert“ lässt Felder wirklich unangetastet */
  let people = mk();
  const before = JSON.stringify(people);
  const r0 = applyBulkEdit(people, ['a', 'b', 'c'], {});
  assertEq(r0.count, 3, 'alle 3 besucht');
  assertEq(JSON.stringify(people), before, 'leere Änderungsmenge ändert nichts');

  /* nur ein Feld setzen — Rest bleibt */
  people = mk();
  applyBulkEdit(people, ['a', 'b'], { stufe: 'RS2' });
  assertEq(people[0].stufe, 'RS2', 'Stufe gesetzt (a)');
  assertEq(people[1].stufe, 'RS2', 'Stufe gesetzt (b)');
  assert(!('qualifikationAlt' in people[1]), 'Stufe gepflegt → Migrations-Hinweis weg');
  assertEq(people[0].fahrlizenz, 'B3', 'Lizenz unangetastet');
  assertEq(people[0].df, true, 'DF unangetastet');
  assertEq(people[2].stufe, 'RS1', 'nicht ausgewählte Person unangetastet');

  /* DF explizit auf nein */
  people = mk();
  applyBulkEdit(people, ['a'], { df: false });
  assertEq(people[0].df, false, 'DF → nein');

  /* Praktikant erzwingt Fahrlizenz keine (mit Zähler für den Hinweis) */
  people = mk();
  const r1 = applyBulkEdit(people, ['a', 'c'], { stufe: 'Praktikant' });
  assertEq(people[0].fahrlizenz, 'keine', 'B3 wurde entfernt');
  assertEq(r1.lizenzEntfernt, 1, 'genau 1 Lizenz entfernt (c hatte keine)');

  /* unbekannte IDs überspringen */
  const r2 = applyBulkEdit(mk(), ['a', 'fehlt'], { status: 'ausgetreten' });
  assertEq(r2.count, 1, 'unbekannte ID wird übersprungen');
})();

/* ============ Bericht (kompakte Zeilen) ============ */
(function () {
  const data = defaultData();
  data.people.push(P('zz', 'B3', 'NFS'), P('aa', 'A', null), P('weg', 'B2', 'RS1', { status: 'ausgetreten' }));
  data.people[0].nachname = 'Zander'; data.people[1].nachname = 'Adler';
  data.evenings.push({ date: '2026-01-05', assignments: { zz: A('RTW'), aa: A('KTW') }, partials: { aa: 0.5 } });
  const rows = reportRows(data, computeStats(data));
  assertEq(rows.length, 2, 'eine Zeile pro aktiver Person (Ausgetretene fehlen)');
  assertEq(rows.map(r => r.name.split(' ')[0]), ['Adler', 'Zander'], 'nach Nachname sortiert');
  assertEq(rows[0].stufe, 'fehlt', 'fehlende Stufe wird benannt');
  assert(approx(rows[0].dienste, 0.5), 'Teil-Dienst-Faktor in den Berichtszeilen');
  assertEq(rows[0].cats.length, data.categories.length, 'je Kategorie Anzahl + % (keine Zuletzt-Spalten)');
  assert(!('lastCat' in rows[0]) && !('dran' in rows[0]), 'kein Zuletzt-/Dran-Material im Bericht');
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
