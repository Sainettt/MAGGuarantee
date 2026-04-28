// =================================================================
// Repository: DELEGACJE (wyjazdy/delegacje przewoźników)
// =================================================================

// Helper: parsuj wiersz DELEGACJE na obiekt (cols A-T = 1..20)
function _parseDelegacjaRow(row, wiersz) {
  function fd(v) {
    if (!v) return '';
    try {
      if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
      var s = v.toString().trim();
      if (!s) return '';
      // Spróbuj sparsować jako Date
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
      return s;
    } catch(e) { return v.toString(); }
  }
  return {
    wiersz: wiersz,
    id:                  (row[0] || '').toString().trim(),
    nrRej:               (row[1] || '').toString().trim(),
    naczepaNrRej:        (row[2] || '').toString().trim(),
    kierowcaLogin:       (row[3] || '').toString().trim(),
    kierowcaImieNazw:    (row[4] || '').toString().trim(),
    telefonKierowcy:     (row[5] || '').toString().trim(),
    dataWyjazdu:         fd(row[6]),
    krajWyjazdu:         (row[7] || '').toString().trim(),
    kodPocztowyWyjazdu:  (row[8] || '').toString().trim(),
    dataZjazduPlan:      fd(row[9]),
    krajZjazdu:          (row[10] || '').toString().trim(),
    kodPocztowyZjazdu:   (row[11] || '').toString().trim(),
    status:              (row[12] || 'zgloszony').toString().trim(),
    dataZjazduRzeczywista: fd(row[13]),
    zgloszonePrzez:      (row[14] || '').toString().trim(),
    dataZgloszenia:      fd(row[15]),
    zweryfikowanePrzez:  (row[16] || '').toString().trim(),
    dataWeryfikacji:     fd(row[17]),
    przewoznikLogin:     (row[18] || '').toString().trim(),
    uwagi:               (row[19] || '').toString().trim()
  };
}

// Generuj numer delegacji w formacie: DEL/NNN/MM/YY
// NNN = 001-999 (sekwencja w danym miesiącu, reset 1-go każdego miesiąca)
// MM  = 01-12 (miesiąc)
// YY  = 26 (ostatnie 2 cyfry roku)
// Wymaga aby caller trzymał LockService — czyta arkusz DELEGACJE i znajduje max sekwencję
// dla bieżącego MM/YY, +1.
function _generateDelegacjaId(sd) {
  var now = new Date();
  var mm = Utilities.formatDate(now, 'Europe/Warsaw', 'MM');
  var yy = Utilities.formatDate(now, 'Europe/Warsaw', 'yy');
  var maxSeq = 0;
  if (sd) {
    try {
      var data = sd.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var id = (data[i][0] || '').toString().trim();
        var m = id.match(/^DEL\/(\d{3})\/(\d{2})\/(\d{2})$/);
        if (!m) continue;
        if (m[2] === mm && m[3] === yy) {
          var seq = parseInt(m[1], 10) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    } catch(e) { Logger.log('_generateDelegacjaId scan ERR: ' + e.message); }
  }
  var newSeq = maxSeq + 1;
  if (newSeq > 999) newSeq = 999; // safety cap
  var seqStr = ('000' + newSeq).slice(-3);
  return 'DEL/' + seqStr + '/' + mm + '/' + yy;
}
