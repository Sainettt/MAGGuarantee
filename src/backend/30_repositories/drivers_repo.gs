// =================================================================
// Repository: KIEROWCY
// =================================================================

// Helper: parsuj wiersz KIEROWCY na obiekt (cols A-M = 1..13)
function _parseDriverRow(row, wiersz) {
  return {
    wiersz: wiersz,
    login:           (row[0] || '').toString().trim(),
    imie:            (row[1] || '').toString().trim(),
    nazwisko:        (row[2] || '').toString().trim(),
    przewoznikLogin: (row[3] || '').toString().trim(),
    telefonFirmowy:  (row[4] || '').toString().trim(),
    email:           (row[5] || '').toString().trim(),
    nrPrawaJazdy:    (row[6] || '').toString().trim(),
    aktywny:         ((row[7] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[8] || '').toString().trim(),
    utworzonePrzez:  (row[9] || '').toString().trim(),
    telefonPrywatny: (row[10] || '').toString().trim(),
    prawoJazdyWaznosc: (row[11] || '').toString().trim(),
    kontoAmazon:     (row[12] || '').toString().trim()
  };
}

// Auto-generuj login kierowcy z imienia+nazwiska (np. "Jan Kowalski" → "j.kowalski")
// Konflikt? Dodaje sufiks -2, -3, itd.
function _generateDriverLogin(imie, nazwisko, kierowcySheet) {
  // Polish chars → ASCII
  function deAccent(s) {
    return s.toLowerCase()
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
      .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
      .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/[^a-z0-9]/g, '');
  }
  var first = deAccent(imie || '').substring(0, 1);
  var last  = deAccent(nazwisko || '').substring(0, 25);
  if (!first && !last) return 'kierowca-' + Date.now().toString(36);
  var base = (first ? (first + '.') : '') + last;
  if (base.length < 3) base = base + 'xx'; // zabezpieczenie minimalnej długości
  if (base.length > 30) base = base.substring(0, 30);

  // Pobierz wszystkie istniejące loginy
  var existing = {};
  if (kierowcySheet) {
    var data = kierowcySheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var l = (data[i][0] || '').toString().trim().toLowerCase();
      if (l) existing[l] = true;
    }
  }
  if (!existing[base]) return base;
  // Konflikt — dodawaj sufiks -2, -3...
  for (var n = 2; n <= 999; n++) {
    var candidate = base + '-' + n;
    if (candidate.length > 30) candidate = base.substring(0, 30 - String(n).length - 1) + '-' + n;
    if (!existing[candidate]) return candidate;
  }
  return base + '-' + Date.now().toString(36); // fallback
}
