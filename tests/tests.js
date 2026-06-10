/* Unit-Tests für die Kern-Logik (Parser, Zuordnung, Kennzahlen, Excel-Import).
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

/* ============ Dienstplan-Parser (Struktur wie echtes Copy-Paste) ============ */
(function () {
  const plan = [
    'RKT SBG Zug 11 - 09.06.2026',
    'Tour / Fzg', 'Zeiten', 'Zimmer', 'Fahrer', 'Transportführer', '2. Trspf. / Praktikant',
    ' \tR1', '20-201\t\t18:30', '06:00\t1-37 ', '1-36\tGreta Almberger\tTobias Bachner\tPaul Cerny',
    ' \tR2', '20-202\t\t18:30', '05:00\t2-20 ', '1-34\tMia Cerny\tLisa Marie Dollinger\t',
    ' \tK01*', '20-321\t\t18:30', '06:00\t2-35 ', '2-34\tKarl Ebner\teintragen\tNora Fuchs',
    ' \tK02', '20-322\t\t18:30', '06:00\t1-32 ', '1-31\t\tJonas Gruberbauer\t',
    ' \tÄBD/ZBV', '20-703\t\t18:00', '23:00\t2.41 \nHelga Innerhofer\t\t'.split('\n')[0], 'Helga Innerhofer\t\t',
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
  assertEq(r1.crew.map(c => c.role), ['Fahrer', 'Transportführer', '2. Trspf./Praktikant'], 'Rollen nach Spaltenposition');

  const r2 = r.tours[1];
  assertEq(r2.crew.length, 2, 'leere 3. Spalte → 2 Personen');

  const k01 = r.tours[2];
  assertEq(k01.catIds, ['KTW'], 'K01* → KTW');
  assertEq(k01.crew.map(c => c.name), ['Karl Ebner', 'Nora Fuchs'], '„eintragen“ wird ignoriert');
  assertEq(k01.crew[1].role, '2. Trspf./Praktikant', 'Spaltenposition bleibt trotz „eintragen“ erhalten');

  const k02 = r.tours[3];
  assertEq(k02.crew.map(c => ({ n: c.name, r: c.role })), [{ n: 'Jonas Gruberbauer', r: 'Transportführer' }], 'leerer Fahrer, TF nach Position');

  const abd = r.tours[4];
  assertEq(abd.catIds, ['ABD', 'ZBV'], 'ÄBD/ZBV zählt für beide Kategorien');
  assertEq(abd.crew.map(c => c.name), ['Helga Innerhofer'], 'ÄBD-Zeile ohne Zimmerspalte: Fahrer erkannt');

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
  data.people.push({ id: 'pa', nachname: 'Almberger', vorname: 'Greta', qualifikation: 'B3', status: 'aktiv', df: false, eintritt: null, austritt: null, aliases: [] });
  const days = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23', '2026-03-02', '2026-03-09'];
  const cats = [['KTW'], ['KTW'], ['KTW'], ['KTW'], ['KTW'], ['KTW'], ['RTW'], ['RTW'], ['RTW'], ['ABD', 'ZBV']];
  for (let i = 0; i < 10; i++) data.evenings.push({ date: days[i], assignments: { pa: cats[i] } });
  const s = computeStats(data).perPerson['pa'];
  assertEq(s.dienste, 10, '10 Dienste');
  assert(approx(s.catPct['KTW'], 0.6), 'KTW 60 %');
  assert(approx(s.catPct['RTW'], 0.3), 'RTW 30 %');
  assert(approx(s.catPct['ABD'], 0.1), 'ÄBD 10 %');
  assert(approx(s.catPct['ZBV'], 0.1), 'ZBV 10 % (Summe 110 %)');
  assert(approx(s.presencePct, 1), 'Anwesenheit 100 %');
})();

(function () {
  // Neuzugang: erst ab erstem Auftreten erwartet; 3× anwesend, 1× abwesend = 75 %
  const data = defaultData();
  data.people.push({ id: 'pn', nachname: 'Neu', vorname: 'Nina', qualifikation: 'B2', status: 'aktiv', df: false, eintritt: null, austritt: null, aliases: [] });
  data.evenings.push({ date: '2026-01-05', assignments: {} });                       // vor Eintritt → zählt nicht
  data.evenings.push({ date: '2026-01-12', assignments: { pn: ['KTW'] } });          // erstes Auftreten
  data.evenings.push({ date: '2026-01-19', assignments: { pn: ['KTW'] } });
  data.evenings.push({ date: '2026-01-26', assignments: {} });                       // abwesend
  data.evenings.push({ date: '2026-02-02', assignments: { pn: ['RTW'] } });
  const s = computeStats(data).perPerson['pn'];
  assertEq(s.expected, 4, 'Neuzugang: 4 erwartete Abende ab erstem Auftreten');
  assert(approx(s.presencePct, 0.75), 'Neuzugang: 75 % Anwesenheit');
  assertEq(s.dienste, 3, 'abwesender Abend ist kein Dienst');
})();

(function () {
  // Teil-Anwesenheit & Anwesenheit ohne Dienst (partials-Override)
  const data = defaultData();
  data.people.push({ id: 'pt', nachname: 'Teil', vorname: 'Toni', qualifikation: 'B3', status: 'aktiv', df: false, eintritt: '2026-01-05', austritt: null, aliases: [] });
  data.evenings.push({ date: '2026-01-05', assignments: { pt: ['RTW'] }, partials: { pt: 0.5 } }); // halb da, gefahren
  data.evenings.push({ date: '2026-01-12', assignments: {}, partials: { pt: 1 } });               // da, aber kein Dienst
  data.evenings.push({ date: '2026-01-19', assignments: {} });                                    // abwesend
  const s = computeStats(data).perPerson['pt'];
  assertEq(s.dienste, 1, 'nur der RTW-Abend ist ein Dienst');
  assert(approx(s.presenceSum, 1.5), 'Anwesenheitssumme 0,5 + 1');
  assert(approx(s.presencePct, 0.5), 'Anwesenheit 1,5 / 3 = 50 %');
})();

(function () {
  // Austritt begrenzt erwartete Abende; Eintritt explizit vor erstem Dienst
  const data = defaultData();
  data.people.push({ id: 'px', nachname: 'Alt', vorname: 'Anna', qualifikation: 'A', status: 'ausgetreten', df: false, eintritt: '2026-01-05', austritt: '2026-01-12', aliases: [] });
  data.evenings.push({ date: '2026-01-05', assignments: { px: ['KTW'] } });
  data.evenings.push({ date: '2026-01-12', assignments: {} });
  data.evenings.push({ date: '2026-01-19', assignments: {} }); // nach Austritt
  const s = computeStats(data).perPerson['px'];
  assertEq(s.expected, 2, 'Abende nach Austritt zählen nicht als erwartet');
  assert(approx(s.presencePct, 0.5), '1 von 2 = 50 %');
})();

/* ============ Fairness & Berechtigung ============ */
(function () {
  const data = defaultData();
  const mk = (id, q, df) => ({ id, nachname: id, vorname: 'X', qualifikation: q, status: 'aktiv', df: !!df, eintritt: null, austritt: null, aliases: [] });
  data.people.push(mk('a', 'B3'), mk('b', 'B3-NFS'), mk('c', 'TF-R2'), mk('d', 'A'), mk('e', 'B3', true), mk('f', 'B2', true));
  // a: 2 Dienste, 2 RTW (100 %); b: 2 Dienste, 1 RTW (50 %); c: 2 Dienste, 0 RTW (0 %); d: nicht RTW-berechtigt
  data.evenings.push({ date: '2026-01-05', assignments: { a: ['RTW'], b: ['RTW'], c: ['KTW'], d: ['KTW'], e: ['DF'], f: ['KTW'] } });
  data.evenings.push({ date: '2026-01-12', assignments: { a: ['RTW'], b: ['KTW'], c: ['KTW'], d: ['ABD'] } });
  const stats = computeStats(data);
  const marks = fairnessMarks(data, stats);
  const rtw = data.categories.find(c => c.id === 'RTW');
  assert(isEligible(data.people[0], rtw), 'B3 ist RTW-berechtigt');
  assert(!isEligible(data.people[3], rtw), 'A ist nicht RTW-berechtigt');
  assertEq((marks['c'] || {})['RTW'], 'low', 'niedrigster RTW-Anteil markiert („dran“)');
  assertEq((marks['b'] || {})['RTW'], 'next', 'zweitniedrigster RTW-Anteil markiert');
  assert(!(marks['d'] || {})['RTW'], 'nicht berechtigte Person wird nicht markiert');
  const df = data.categories.find(c => c.id === 'DF');
  assert(isEligible(data.people[4], df) && !isEligible(data.people[0], df), 'DF-Berechtigung über df-Häkchen');
  assertEq((marks['f'] || {})['DF'], 'low', 'DF-Fairness: f hat 0 DF und ist „dran“');
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
  const names = res.data.people.map(p => p.nachname);
  assert(!names.includes('ZZ'), 'ZZ-Müllzeilen verworfen');
  assert(names.includes('Weggang'), 'Austritt-Name als Person übernommen');
  const willi = res.data.people.find(p => p.nachname === 'Weggang');
  assertEq(willi.status, 'ausgetreten', 'Austritt-Name als ausgetreten markiert');
  const tobias = res.data.people.find(p => p.nachname === 'Bachner');
  assertEq(tobias.qualifikation, 'TF-R2', 'Qualifikation „TF - R2“ normalisiert');
  const mia = res.data.people.find(p => p.nachname === 'Cerny');
  assertEq(mia.qualifikation, 'B3-NFS', 'Qualifikation „B3 - NFS“ normalisiert (trotz Leerzeichen im Namen)');
  assertEq(res.data.evenings.length, 4, '4 Abende aus Datumsspalten');
  assertEq(res.data.evenings[0].date, '2026-01-01', 'Excel-Serial → ISO-Datum');

  const stats = computeStats(res.data);
  const greta = res.data.people.find(p => p.nachname === 'Almberger');
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
  data.evenings.push({ date: '2026-06-09', assignments: { a: ['KTW'] }, partials: { a: 0.5 } });
  upsertEvening(data, { date: '2026-06-09', assignments: { a: ['RTW'], b: ['KTW'] } }, 'zusammenführen');
  assertEq(data.evenings[0].assignments['a'].sort(), ['KTW', 'RTW'], 'Zusammenführen vereinigt Kategorien');
  assertEq(data.evenings[0].assignments['b'], ['KTW'], 'Zusammenführen ergänzt Personen');
  upsertEvening(data, { date: '2026-06-09', assignments: { c: ['DF'] } }, 'überschreiben');
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
