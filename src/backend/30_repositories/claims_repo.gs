// =================================================================
// Repository: WNIOSEK (zgłoszenia gwarancji km)
// =================================================================
//
// Zależy od helperów z 90_utils/safe.gs (safeStr/safeVal/safeFmtDate/safeFmtTime/safeFmtDT)
// — które na obecnym etapie nadal żyją w Code.gs i są dostępne w globalnym namespace GAS.

// Buduje obiekt wniosku z wiersza arkusza WNIOSEK (50 kolumn)
function buildClaimObj(row, i) {
  // Copy row into plain array — GAS row arrays are read-only
  var r = new Array(50);
  for (var _c = 0; _c < 50; _c++) r[_c] = (row.length > _c) ? row[_c] : '';
  return {
    wiersz: i + 1,
    nrZgl:               safeStr(r[0]),
    przewoznik:          safeStr(r[1]),
    pojazd:              safeStr(r[2]),
    dataStart:           safeFmtDate(r[3]),
    godzinaStart:        safeFmtTime(r[4]),
    dataStop:            safeFmtDate(r[5]),
    godzinaStop:         safeFmtTime(r[6]),
    dniJezdne:           safeVal(r[7]),
    przebieg:            safeVal(r[8]),
    kmNaDzien:           safeVal(r[9]),
    kmGwarant:           safeVal(r[10]),
    roznica:             safeVal(r[11]),
    doplata:             safeStr(r[12]),
    status:              safeStr(r[13]),
    komentarz:           safeStr(r[14]),
    nrZlecenia:          safeStr(r[15]),
    dataZlecenia:        safeFmtDT(r[16]),
    limitGwarancyjny:    safeVal(r[17]),
    planista:            safeStr(r[18]),
    ocenaKontakt:        safeVal(r[19]),
    ocenaTrasa:          safeVal(r[20]),
    ocenaZlecenia:       safeVal(r[21]),
    zmianaSped:          safeStr(r[22]),
    argumentacja:        safeStr(r[23]),
    opiekun:             safeStr(r[24]),
    ocenaOpKontakt:      safeVal(r[25]),
    ocenaOpDostepnosc:   safeVal(r[26]),
    ocenaOpProblemy:     safeVal(r[27]),
    zmianaOpiekun:       safeStr(r[28]),
    argOpiekun:          safeStr(r[29]),
    autoryzacja:         safeStr(r[30]),
    autoryzacjaOpis:     safeStr(r[31]),
    autoryzacjaData:     safeStr(r[32]),
    dataZgloszenia:      safeStr(r[33]),
    dataZmianyStatusu:   safeStr(r[34]),
    kwotaWnioskowana:    safeStr(r[35]),
    reklamacjaZlozona:   safeStr(r[36]),
    reklamacjaTresc:     safeStr(r[37]),
    reklamacjaOdpMagtrans: safeStr(r[38]),
    reklamacjaKwota:     safeStr(r[39]),
    reklamacjaZatwKwota: safeStr(r[40]),
    korektaGodzin:       (function(v){ try { return parseFloat(v) || 0; } catch(e){ return 0; } })(r[41]),
    statusPrzedReklamacja: safeStr(r[42]),
    origDataStart:       safeFmtDate(r[43]),
    origGodzinaStart:    safeFmtTime(r[44]),
    origDataStop:        safeFmtDate(r[45]),
    origGodzinaStop:     safeFmtTime(r[46]),
    origPrzebieg:        safeVal(r[47]),
    marza:               safeStr(r[48]),
    kwotaMaksima:        safeStr(r[49])
  };
}

// Znajdź wiersz wniosku po numerze (sprawdzenie uprawnień + pobranie przewoznika/planisty)
function _findClaimByNr(nrZgl) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === nrZgl) {
      return { rowIdx: i + 1, przewoznik: (data[i][1] || '').toString().trim(), planista: (data[i][18] || '').toString().trim() };
    }
  }
  return null;
}
