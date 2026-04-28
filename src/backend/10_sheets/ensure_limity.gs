// =================================================================
// Sheet: LIMITY KM (miesięczne limity i stawki €/km)
// =================================================================

// ── LIMITY KM ──
function ensureLimitySheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY);
  if (sheet) return;
  sheet = ss.insertSheet(CONFIG.SHEET_LIMITY);
  // A=Rok, B=Sty km, C=Sty €, D=Lut km, E=Lut €, ... X=Gru km, Y=Gru €
  var months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  var headers = ['Rok'];
  for (var i = 0; i < 12; i++) {
    headers.push(months[i] + ' km');
    headers.push(months[i] + ' €');
  }
  sheet.appendRow(headers);
  sheet.appendRow([2025, 500,0.50, '','', 500,0.50, 540,0.50, 540,0.50, 540,0.50, 500,0.50, '','', 540,0.50, 540,0.50, 540,0.50, 540,0.50]);
  sheet.appendRow([2026, 500,0.50, '','', 500,0.50, 540,0.50, 540,0.50, 540,0.50, 500,0.50, '','', 540,0.50, '','', '','', '','']);
  sheet.getRange(1, 1, 1, 25).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 60);
  for (var c = 2; c <= 25; c++) sheet.setColumnWidth(c, c % 2 === 0 ? 75 : 55);
  // Kolorowanie kolumn € na jasny fiolet
  for (var c = 3; c <= 25; c += 2) {
    sheet.getRange(1, c, sheet.getMaxRows(), 1).setBackground('#f5f3ff');
  }
}
