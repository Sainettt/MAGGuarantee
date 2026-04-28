// =================================================================
// Repository: LIMITY KM (miesięczne limity i stawki €/km)
// =================================================================

// Pobierz limity i stawki ze sheetu LIMITY KM jako { km: {rok:{m:val}}, stawki: {rok:{m:val}} }
function getLimityKm() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY);
  if (!sheet) { ensureLimitySheet(); sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY); }
  if (!sheet) return { km: {}, stawki: {} };
  var data = sheet.getDataRange().getValues();
  var km = {};
  var stawki = {};
  for (var i = 1; i < data.length; i++) {
    var rok = parseInt(data[i][0]) || 0;
    if (!rok) continue;
    km[rok] = {};
    stawki[rok] = {};
    for (var m = 1; m <= 12; m++) {
      // B,D,F,...,X = km (index: (m-1)*2+1)
      // C,E,G,...,Y = €  (index: (m-1)*2+2)
      var kmIdx = (m - 1) * 2 + 1;
      var rateIdx = (m - 1) * 2 + 2;

      var val = data[i][kmIdx];
      if (val === '' || val === null || val === undefined || val.toString().toLowerCase() === 'brak') {
        km[rok][m] = 0;
      } else {
        km[rok][m] = parseFloat(val) || 0;
      }

      var rateVal = data[i][rateIdx];
      if (rateVal === '' || rateVal === null || rateVal === undefined) {
        stawki[rok][m] = null;
      } else {
        stawki[rok][m] = parseFloat(rateVal) || 0;
      }
    }
  }
  return { km: km, stawki: stawki };
}
