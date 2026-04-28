// =================================================================
// Repository: AUTA (pojazdy/ciągniki)
// =================================================================

// Helper: rozpakuj pełny wiersz AUTA do obiektu (używane przez wszystkie get-funkcje)
// row = pełna tablica wiersza z arkusza AUTA (do 36 kolumn)
function _parseAutoRow(row, wiersz) {
  var adr = (row[14] || '').toString().trim();
  var odpadyKraje = (row[29] || '').toString().trim();
  return {
    wiersz: wiersz,
    przewoznikLogin: (row[0] || '').toString().trim(),
    nrRej:           (row[1] || '').toString().trim(),
    aktywne:         ((row[2] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[3] || '').toString().trim(),
    dataDezaktywacji:(row[4] || '').toString().trim(),
    utworzonePrzez:  (row[5] || '').toString().trim(),
    planista:        (row[6] || '').toString().trim(),
    // (col H=7 Wyposazenie — legacy, pomijamy)
    marka:           (row[8] || '').toString().trim(),
    model:           (row[9] || '').toString().trim(),
    rok:             (row[10] || '').toString().trim(),
    uwagi:           (row[11] || '').toString().trim(),
    certyfikatL:     (row[12] || '').toString().trim(),
    euro:            (row[13] || '').toString().trim(),
    adr:             adr ? adr.split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
    gps:             (row[15] || '').toString().trim(),
    kartaPaliwowa:   (row[16] || '').toString().trim(),
    typ:             (row[17] || '').toString().trim(),
    dyspozytor:      (row[18] || '').toString().trim(),
    gb:              (row[19] || '').toString().trim(),
    it:              (row[20] || '').toString().trim(),
    fr:              (row[21] || '').toString().trim(),
    porozumienie:    (row[22] || '').toString().trim(),
    umowa:           (row[23] || '').toString().trim(),
    stawkaDE:        (row[24] !== undefined && row[24] !== null && row[24] !== '') ? row[24] : '',
    stawkaUE:        (row[25] !== undefined && row[25] !== null && row[25] !== '') ? row[25] : '',
    stawkaEksport:   (row[26] !== undefined && row[26] !== null && row[26] !== '') ? row[26] : '',
    stawkaImport:    (row[27] !== undefined && row[27] !== null && row[27] !== '') ? row[27] : '',
    odpady:          (row[28] || '').toString().trim(),
    odpadyKraje:     odpadyKraje ? odpadyKraje.split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
    kabotazDE:       (row[30] || '').toString().trim(),
    kabotazFR:       (row[31] || '').toString().trim(),
    gpsMobNr:        (row[32] || '').toString().trim(),
    nastepnyPrzeglad:(row[33] || '').toString().trim(),
    nrBoczny:        (row[34] || '').toString().trim(),
    ostatnioJezdzilo:(function(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'yyyy-MM-dd');
        var s = v.toString().trim();
        // Jeśli już ISO format yyyy-MM-dd, zostaw
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
        var d2 = new Date(s);
        return isNaN(d2.getTime()) ? s : Utilities.formatDate(d2, 'Europe/Warsaw', 'yyyy-MM-dd');
      } catch(e) { return v.toString(); }
    })(row[35])
  };
}

// ── Helpery dostępu do aut ──
// Zwraca listę AKTYWNYCH nr rej dla danego przewoźnika (z arkusza AUTA)
function getActiveVehiclesForLogin(login) {
  if (!login) return [];
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
  if (!sa) return [];
  var data = sa.getDataRange().getValues();
  var result = [];
  var loginUp = login.toString().trim().toUpperCase();
  for (var i = 1; i < data.length; i++) {
    var rowLogin = (data[i][0] || '').toString().trim().toUpperCase();
    var rowNrRej = (data[i][1] || '').toString().trim().toUpperCase();
    var rowActive = (data[i][2] || '').toString().trim().toUpperCase();
    if (rowLogin === loginUp && rowNrRej && rowActive === 'TAK') {
      result.push(rowNrRej);
    }
  }
  return result;
}
