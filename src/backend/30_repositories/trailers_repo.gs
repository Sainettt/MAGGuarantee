// =================================================================
// Repository: NACZEPY (rejestr konkretnych naczep)
// =================================================================

// Helper: parsuj wiersz NACZEPY na obiekt (cols A-X = 1..24)
// pasy/maty/katowniki = LICZBA SZTUK (zmiana semantyki z Tak/Nie)
function _parseNaczepaRow(row, wiersz) {
  function num(v) { return (v !== undefined && v !== null && v !== '') ? v : ''; }
  return {
    wiersz: wiersz,
    nrRej:           (row[0] || '').toString().trim(),
    przewoznikLogin: (row[1] || '').toString().trim(),
    typNaczepy:      (row[2] || '').toString().trim(),
    marka:           (row[3] || '').toString().trim(),
    model:           (row[4] || '').toString().trim(),
    rok:             (row[5] || '').toString().trim(),
    aktywna:         ((row[6] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[7] || '').toString().trim(),
    utworzonePrzez:  (row[8] || '').toString().trim(),
    xlCode:          (row[9] || '').toString().trim(),
    multilock:       (row[10] || '').toString().trim(),
    wyposPasy:       num(row[11]),
    wyposMaty:       num(row[12]),
    wyposKatowniki:  num(row[13]),
    deskiAluLiczba:  num(row[14]),
    deskiDrewLiczba: num(row[15]),
    przesuwnyDach:   (row[16] || '').toString().trim(),
    bocznyPrzeswit:  num(row[17]),
    tylnyPrzeswit:   num(row[18]),
    ladowanieTyl:    (row[19] || '').toString().trim(),
    ladowanieBok:    (row[20] || '').toString().trim(),
    ladowanieGora:   (row[21] || '').toString().trim(),
    nastepnyPrzeglad:(row[22] || '').toString().trim(),
    przesuwnyDachEdscha: (row[23] || '').toString().trim()
  };
}

// Helper: 15-elementowa tablica dla cols J-X (10..24)
function _naczepaExtFromData(data) {
  function tn(v) { var t = (v || '').toString().trim(); return (t === 'Tak' || t === 'Nie') ? t : ''; }
  function num(v) { return (v !== undefined && v !== null && v !== '') ? (parseFloat(v) || '') : ''; }
  // Edscha resetuje się jeśli przesuwnyDach != Tak
  var przesuwny = tn(data.przesuwnyDach);
  var edscha = (przesuwny === 'Tak') ? tn(data.przesuwnyDachEdscha) : '';
  return [
    tn(data.xlCode), tn(data.multilock),
    num(data.wyposPasy), num(data.wyposMaty), num(data.wyposKatowniki),
    num(data.deskiAluLiczba), num(data.deskiDrewLiczba),
    przesuwny,
    num(data.bocznyPrzeswit), num(data.tylnyPrzeswit),
    tn(data.ladowanieTyl), tn(data.ladowanieBok), tn(data.ladowanieGora),
    (data.nastepnyPrzeglad || '').toString().trim(),
    edscha
  ];
}
