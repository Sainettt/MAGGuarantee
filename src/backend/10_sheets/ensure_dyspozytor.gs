// =================================================================
// Sheet: DYSPOZYTOR (dyspozytorzy — login + panel)
// =================================================================

// ── UTWÓRZ ARKUSZ DYSPOZYTORÓW ──
// Schemat 6 kolumn: Login | Haslo | Rola | Nazwa | Email | Firma (empty)
function ensureDyspozytorSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_DYSPOZYTOR);
  if (sheet) return;

  sheet = ss.insertSheet(CONFIG.SHEET_DYSPOZYTOR);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma']];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#006064').setFontColor('white');
  sheet.autoResizeColumns(1, 6);
  sheet.setFrozenRows(1);
}
