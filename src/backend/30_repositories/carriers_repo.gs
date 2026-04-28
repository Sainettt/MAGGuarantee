// =================================================================
// Repository: UZYTKOWNICY (przewoźnicy)
// =================================================================

// ── HELPERY: rozszerzone pola przewoźnika (kolumny L-V) ──
// Buduje 11-elementową tablicę dla cols L:OsobaKontaktowa..V:AdresFirmy
function _carrierExtFromData(data) {
  return [
    (data.osobaKontaktowa || '').toString().trim(),
    (data.telefon || '').toString().trim(),
    (data.emailZlecenia || '').toString().trim(),
    (data.terminPlatnosci || '').toString().trim(),
    (data.kontoEUR || '').toString().trim().replace(/\s+/g, ''),
    (data.kontoPLN || '').toString().trim().replace(/\s+/g, ''),
    (data.ubezpWartosc !== undefined && data.ubezpWartosc !== null && data.ubezpWartosc !== '') ? parseFloat(data.ubezpWartosc) : '',
    (data.ubezpWaznosc || '').toString().trim(),
    (data.licencjaWaznosc || '').toString().trim(),
    (data.liczbaWypisow !== undefined && data.liczbaWypisow !== null && data.liczbaWypisow !== '') ? parseInt(data.liczbaWypisow) : '',
    (data.adresFirmy || '').toString().trim()
  ];
}

// Parsuje wiersz UZYTKOWNICY (tablica) na obiekt z wszystkimi polami
function _parseCarrierRow(row, wiersz) {
  return {
    wiersz: wiersz,
    login: (row[0] || '').toString().trim(),
    nazwa: (row[3] || '').toString().trim(),
    email: (row[4] || '').toString().trim(),
    firma: (row[5] || '').toString().trim(),
    nip: (row[6] || '').toString().trim(),
    aktywny: ((row[7] || 'Tak').toString().trim() || 'Tak'),
    lastLogin: (row[8] || '').toString().trim(),
    dataUtworzenia: (row[9] || '').toString().trim(),
    opiekunLogin: (row[10] || '').toString().trim(),
    osobaKontaktowa: (row[11] || '').toString().trim(),
    telefon: (row[12] || '').toString().trim(),
    emailZlecenia: (row[13] || '').toString().trim(),
    terminPlatnosci: (row[14] || '').toString().trim(),
    kontoEUR: (row[15] || '').toString().trim(),
    kontoPLN: (row[16] || '').toString().trim(),
    ubezpWartosc: (row[17] !== undefined && row[17] !== null && row[17] !== '') ? row[17] : '',
    ubezpWaznosc: (row[18] || '').toString().trim(),
    licencjaWaznosc: (row[19] || '').toString().trim(),
    liczbaWypisow: (row[20] !== undefined && row[20] !== null && row[20] !== '') ? row[20] : '',
    adresFirmy: (row[21] || '').toString().trim()
  };
}

// Znajdź email przewoźnika po nazwie firmy (kolumna F)
function findCarrierEmail(przewoznikName) {
  if (!przewoznikName) return '';
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!sheet) return '';
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var firma = (data[i][5] || '').toString().trim(); // kolumna F = Firma przewoznika
    if (firma && firma.toUpperCase() === przewoznikName.toUpperCase().trim()) {
      var email = (data[i][4] || '').toString().trim(); // kolumna E = Email
      if (email) return email;
    }
  }
  return '';
}
