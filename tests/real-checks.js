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

  // Gast-Automatik gegen importierte Stammdaten: bekannte Mitglieder matchen,
  // fremde Namen werden automatisch Gast, verdächtig ähnliche Namen (Tippfehler
  // wie Christina/Christine) bleiben in der Unklar-Liste. Nichts geht still verloren.
  const imp = importFromExcelSheets({ stammdaten: REAL.stammdaten, anwesenheit: REAL.anwesenheit, ktw: REAL.ktw }, defaultCategories());
  let matched = 0, gastNeu = 0, verdacht = 0, bekannt = 0, total = 0;
  const rollen = { fahrer: 0, tf: 0, p2: 0 };
  for (const t of r.tours) for (const c of t.crew) {
    total++;
    rollen[c.rolle] = (rollen[c.rolle] || 0) + 1;
    const res2 = resolvePlanName(c.name, imp.data.people, []);
    if (res2.status === 'match') matched++;
    else if (res2.status === 'gast-neu') gastNeu++;
    else if (res2.status === 'gast') bekannt++;
    else verdacht++;
  }
  print('Gast-Automatik: ' + matched + ' Mitglieder, ' + gastNeu + ' automatisch Gast, ' + verdacht + ' unklar (Verdacht/mehrdeutig)');
  print('Rollen aus Spaltenposition: ' + rollen.fahrer + ' Fahrer, ' + rollen.tf + ' TF, ' + rollen.p2 + ' 2. Trspf.');
  assert(matched + gastNeu + verdacht + bekannt === total, 'jeder Name bekommt genau einen Status');
  assert(matched >= 20, 'Großteil der Namen eindeutig zugeordnet (war: ' + matched + ')');
  assert(verdacht >= 1, 'der Tippfehler-Fall (z. B. Christina/Christine) wird NICHT still Gast (war: ' + verdacht + ')');
  assert(gastNeu >= 1, 'echte Gäste werden automatisch als Gast vorgeschlagen (war: ' + gastNeu + ')');
  assert(rollen.fahrer + rollen.tf + rollen.p2 === total, 'jede Crew-Position hat eine Rolle');
  assert(rollen.fahrer >= rollen.tf && rollen.fahrer > 0, 'Fahrer-Spalte am stärksten besetzt (ÄBD/DF nur Fahrer)');

  // Mitglieder aus der gastListe werden still als Gast übernommen
  const gastName = (() => {
    for (const t of r.tours) for (const c of t.crew) {
      if (resolvePlanName(c.name, imp.data.people, []).status === 'gast-neu') return c.name;
    }
    return null;
  })();
  if (gastName) {
    assert(resolvePlanName(gastName, imp.data.people, [gastName]).status === 'gast', 'Name aus gastListe → still Gast (kein erneutes Nachfragen)');
  }
})();

/* ============ 2) Excel-Import gegen alte „Übersicht“ ============ */
(function () {
  const res = importFromExcelSheets({ stammdaten: REAL.stammdaten, anwesenheit: REAL.anwesenheit, ktw: REAL.ktw }, defaultCategories());
  const stats = computeStats(res.data);
  print('Import: ' + res.data.people.length + ' Personen, ' + res.data.evenings.length + ' Abende, ' +
        res.dfCandidates.length + ' DF-Kandidaten' + (res.warnings.length ? ', Hinweise: ' + res.warnings.join(' | ') : ''));
  assert(res.data.evenings.length >= 10, 'Abende importiert (war: ' + res.data.evenings.length + ')');

  // ---- Schema v2 nach Import: Migration der Quali-Werte stichprobenhaft prüfen ----
  assert(res.data.version === 2, 'Import liefert Schema v2 (war: ' + res.data.version + ')');
  assert(Array.isArray(res.data.gastListe), 'gastListe vorhanden');
  let migChecked = 0, stufeFehlt = 0;
  for (const row of REAL.stammdaten.slice(1)) {
    if (!row || isJunkName(row[0], row[1])) continue;
    const alt = normQual(String(row[2] === null || row[2] === undefined ? '' : row[2]));
    const m = matchPersonName(normSpace(row[0]) + ' ' + normSpace(String(row[1] || '')), res.data.people);
    if (m.status !== 'match' || !alt) continue;
    const exp = QUAL_MIGRATION[alt];
    if (!exp) continue;
    migChecked++;
    const p = m.person;
    assert(p.fahrlizenz === exp.fahrlizenz, p.id + ': Lizenz ' + p.fahrlizenz + ' ≠ Mapping(' + alt + ')=' + exp.fahrlizenz);
    assert(p.stufe === exp.stufe, p.id + ': Stufe ' + JSON.stringify(p.stufe) + ' ≠ Mapping(' + alt + ')=' + JSON.stringify(exp.stufe));
    assert(p.qualifikationAlt === alt, p.id + ': qualifikationAlt mitgeführt');
    assert(!('qualifikation' in p), p.id + ': altes Feld ersetzt');
    if (p.stufe === null) stufeFehlt++;
  }
  print('Migration: ' + migChecked + ' Personen gegen das Mapping geprüft, ' + stufeFehlt + ' davon „Stufe nachpflegen“ (A/B2/B3)');
  assert(migChecked >= 20, 'genug Personen migrations-geprüft (war: ' + migChecked + ')');
  assert(stufeFehlt >= 1, 'A/B2/B3-Fälle als „Stufe fehlt“ markiert (war: ' + stufeFehlt + ')');
  // Abend-Zuordnungen im v2-Format (Altdaten: Rolle null)
  for (const ev of res.data.evenings.slice(0, 3)) {
    for (const pid of Object.keys(ev.assignments)) {
      for (const e of ev.assignments[pid]) {
        assert(typeof e === 'object' && typeof e.kat === 'string' && e.rolle === null, 'Zuordnung {kat, rolle:null}: ' + JSON.stringify(e));
      }
    }
  }
  // Eignungs-Defaults der Kategorien nach Spezifikation
  const catById = {};
  for (const c of res.data.categories) catById[c.id] = c;
  assert(JSON.stringify(catById.RTW.eligibleFahrer) === '["B3"]' && JSON.stringify(catById.RTW.eligibleTf) === '["RS2","NFS"]', 'RTW-Eignung nach Default');
  assert(JSON.stringify(catById.ABD.eligibleTf) === '[]' && JSON.stringify(catById.ZBV.eligibleTf) === '[]', 'ÄBD/ZBV ohne TF');

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
