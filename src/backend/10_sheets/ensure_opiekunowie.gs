// =================================================================
// Sheet: OPIEKUNOWIE (legacy lookup — Imię/Email/Aktywny)
// =================================================================

function ensureOpiekunowieSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (sheet) return;
  sheet = ss.insertSheet(CONFIG.SHEET_OPIEKUNOWIE);
  sheet.appendRow(['Imię i nazwisko', 'Email', 'Aktywny']);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 100);
  sheet.setFrozenRows(1);
}
