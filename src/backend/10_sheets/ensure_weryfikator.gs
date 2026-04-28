// =================================================================
// Sheet: WERYFIKATOR (zarządza statusem delegacji)
// =================================================================

// ── UTWÓRZ ARKUSZ WERYFIKATOR ──
// Weryfikator zarządza statusem delegacji (w trasie / zjechało)
function ensureWeryfikatorSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_WERYFIKATOR)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_WERYFIKATOR);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma']];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#7c3aed').setFontColor('white');
  // Domyślne konto demo
  sheet.getRange(2, 1, 1, 6).setValues([
    ['weryfikator', 'magtrans2026', 'weryfikator', 'Weryfikator Magtrans', '', '']
  ]);
  sheet.getRange(2, 1, 1, 6).setBackground('#f3e8ff');
  sheet.autoResizeColumns(1, 6);
  sheet.setFrozenRows(1);
}
