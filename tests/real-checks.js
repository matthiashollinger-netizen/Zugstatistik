/* Abnahme-Checks gegen die echten Referenzdaten (werden von check-real-data.sh
   lokal eingespeist; dieses Skript enthält selbst keine Personendaten).
   Erwartet: CORE-Block + globale Variable REAL = {stammdaten, anwesenheit, ktw, uebersicht, plan}. */

let _pass = 0, _fail = 0;
function assert(cond, msg) {
  if (cond) _pass++;
  else { _fail++; print('FAIL: ' + msg); }
}
function approx(a, b, eps) { return Math.abs(a - b) < (eps || 1e-6); }

/* ============ 1) Dienstplan-Parser gegen echtes Paste-Format ============ */
(function () {
  const r = parsePlan(REAL.plan, defaultCategories());
  assert(r.date === '2026-06-09', 'Datum 09.06.2026 erkannt (war: ' + r.date + ')');
  assert(r.tours.length === 12, '12 Touren erkannt (war: ' + r.tours.length + ')');

  const byCat = { RTW: 0, KTW: 0, ABD: 0, ZBV: 0, DF: 0 };
  let unknown = 0, names = 0;
  for (const t of r.tours) {
    for (const c of t.catIds) byCat[c]++;
    unknown += t.unknownParts.length;
    names += t.crew.length;
    for (const c of t.crew) {
      assert(/[A-Za-zÄÖÜäöüß]/.test(c.name) && !/^\d/.test(c.name), 'Crew-Name plausibel: ' + c.name);
      assert(c.name.toLowerCase() !== 'eintragen', '„eintragen“ nicht als Name: ' + c.name);
      assert(!/^\d{1,2}[:.\-]/.test(c.name), 'keine Zeiten/Zimmer als Name: ' + c.name);
    }
  }
  assert(byCat.RTW === 4, '4 RTW-Touren (war: ' + byCat.RTW + ')');
  assert(byCat.KTW === 6, '6 KTW-Touren (war: ' + byCat.KTW + ')');
  assert(byCat.ABD === 1, '1 ÄBD-Tour (war: ' + byCat.ABD + ')');
  assert(byCat.DF === 1, '1 DF-Tour (war: ' + byCat.DF + ')');
  assert(unknown === 0, 'keine unbekannten Codes (war: ' + unknown + ')');
  assert(names === 29, '29 besetzte Crew-Plätze (war: ' + names + ')');

  // K-Tour mit 3 Personen: alle 3 Spalten belegt
  const k01 = r.tours.find(t => t.code.replace('*', '') === 'K01');
  assert(k01 && k01.crew.length === 3, 'K01*: alle 3 Crew-Spalten erkannt');
  assert(k01 && k01.catIds.join() === 'KTW', 'K01* → KTW (Sternchen ignoriert)');
  // ÄBD/DF-Touren: genau 1 Person (Fahrer-Spalte), trotz fehlender Zimmer-Zelle
  const abd = r.tours.find(t => t.catIds.join() === 'ABD');
  assert(abd && abd.crew.length === 1 && abd.crew[0].role === 'Fahrer', 'ÄBD: 1 Person in Fahrer-Spalte');
  const df = r.tours.find(t => t.catIds.join() === 'DF');
  assert(df && df.crew.length === 1, 'DF: 1 Person erkannt');

  // Namensabgleich gegen importierte Stammdaten: bekannte Mitglieder matchen,
  // Gäste/Tippfehler landen als „unklar“ (none), nichts wird still verworfen.
  const imp = importFromExcelSheets({ stammdaten: REAL.stammdaten, anwesenheit: REAL.anwesenheit, ktw: REAL.ktw }, defaultCategories());
  let matched = 0, unclear = 0, ambiguous = 0;
  for (const t of r.tours) for (const c of t.crew) {
    const m = matchPersonName(c.name, imp.data.people);
    if (m.status === 'match') matched++;
    else if (m.status === 'ambiguous') ambiguous++;
    else unclear++;
  }
  print('Namensabgleich: ' + matched + ' eindeutig, ' + unclear + ' unklar (Gast/Tippfehler), ' + ambiguous + ' mehrdeutig');
  assert(matched >= 20, 'Großteil der Namen eindeutig zugeordnet (war: ' + matched + ')');
  assert(unclear >= 5, 'Gäste/abweichende Schreibweisen werden als unklar gemeldet (war: ' + unclear + ')');
  assert(ambiguous === 0, 'keine mehrdeutigen Namen (war: ' + ambiguous + ')');
})();

/* ============ 2) Excel-Import gegen alte „Übersicht“ ============ */
(function () {
  const res = importFromExcelSheets({ stammdaten: REAL.stammdaten, anwesenheit: REAL.anwesenheit, ktw: REAL.ktw }, defaultCategories());
  const stats = computeStats(res.data);
  print('Import: ' + res.data.people.length + ' Personen, ' + res.data.evenings.length + ' Abende, ' +
        res.dfCandidates.length + ' DF-Kandidaten' + (res.warnings.length ? ', Hinweise: ' + res.warnings.join(' | ') : ''));
  assert(res.data.evenings.length >= 10, 'Abende importiert (war: ' + res.data.evenings.length + ')');

  // alte Anwesenheits-Durchschnitte (Σ/Anzahl expliziter Zellen) zur Rekonstruktion
  const oldAttend = new Map(); // nameKey -> {sum, n}
  const anwHead = REAL.anwesenheit[0] || [];
  for (const row of REAL.anwesenheit.slice(1)) {
    if (!row || isJunkName(row[0], row[1])) continue;
    let sum = 0, n = 0;
    for (let c = 0; c < anwHead.length; c++) {
      const h = parseNumCell(anwHead[c]);
      if (h === null || h < 40000 || h > 60000) continue;
      const v = parseNumCell(row[c]);
      if (v !== null) { sum += v; n++; }
    }
    oldAttend.set(normKey(row[0] + ' ' + row[1]), { sum, n });
  }

  // Übersicht: [Nachname, Vorname, Qual, Nr, Anwesenheit, KTW, RTW, ÄND, DF, KTW%, RTW%, ÄND%, DF%]
  const catCols = [[5, 'KTW'], [6, 'RTW'], [7, 'ABD'], [8, 'DF']];
  const pctCols = [[9, 'KTW'], [10, 'RTW'], [11, 'ABD'], [12, 'DF']];
  let checked = 0;
  for (const row of REAL.uebersicht.slice(1)) {
    if (!row || isJunkName(row[0], row[1])) continue;
    const m = matchPersonName(normSpace(row[0]) + ' ' + normSpace(row[1]), res.data.people);
    assert(m.status === 'match', 'Übersicht-Person gefunden: ' + row[0]);
    if (m.status !== 'match') continue;
    const s = stats.perPerson[m.person.id];
    const who = normSpace(row[0]) + ' ' + normSpace(row[1]);
    checked++;

    for (const [col, cid] of catCols) {
      const want = parseNumCell(row[col]);
      if (want === null) continue;
      assert(s.catCounts[cid] === want, who + ': ' + cid + '-Anzahl ' + s.catCounts[cid] + ' ≠ Übersicht ' + want);
    }
    for (const [col, cid] of pctCols) {
      const want = parseNumCell(row[col]);
      if (want === null) continue; // #DIV/0! oder leer
      const got = s.catPct[cid];
      assert(got !== null && approx(got, want), who + ': ' + cid + '-%: ' + got + ' ≠ Übersicht ' + want);
    }

    // Anwesenheit: Summe muss dem Altbestand exakt entsprechen. Der Nenner ist im
    // neuen Modell „alle erwarteten Abende seit Eintritt“ — bei Personen, deren
    // Zeile im alten Blatt für die letzten Abende einfach leer blieb, ist er
    // größer als im Altbestand (leer = im neuen Modell abwesend).
    const old = oldAttend.get(normKey(row[0] + ' ' + row[1]));
    const wantA = parseNumCell(row[4]);
    if (old && wantA !== null) {
      assert(approx(s.presenceSum, old.sum), who + ': Anwesenheits-Summe ' + s.presenceSum + ' ≠ alt ' + old.sum);
      assert(approx(old.n ? old.sum / old.n : 0, wantA, 1e-6), who + ': Altbestand in sich konsistent');
      if (s.expected === old.n) {
        assert(approx(s.presencePct, wantA), who + ': Anwesenheit-% ' + s.presencePct + ' ≠ Übersicht ' + wantA);
      } else {
        print('Info: ' + who + ' – Anwesenheit alt ' + Math.round(wantA * 100) + ' % (' + old.n + ' Abende erfasst), neu ' +
              Math.round(s.presencePct * 100) + ' % (' + s.expected + ' erwartete Abende; leere Zellen gelten neu als abwesend)');
      }
    }
  }
  assert(checked >= 25, 'genug Personen verglichen (war: ' + checked + ')');
  print('Übersicht-Abgleich: ' + checked + ' Personen geprüft.');
})();

print('');
print('Real-Daten-Checks: ' + (_pass + _fail) + ', bestanden: ' + _pass + ', fehlgeschlagen: ' + _fail);
if (_fail > 0) throw new Error(_fail + ' Checks fehlgeschlagen');
