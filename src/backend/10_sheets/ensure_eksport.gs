// =================================================================
// Sheet: EKSPORT (dział eksportu — widzi delegacje przewoźników)
// =================================================================

// ── UTWÓRZ ARKUSZ EKSPORT ──
// Dział eksportu widzi zgłoszone wyjazdy/delegacje przewoźników
function ensureEksportSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_EKSPORT)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_EKSPORT);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma']];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#0d4f3c').setFontColor('white');
  // Domyślne konto demo
  sheet.getRange(2, 1, 1, 6).setValues([
    ['eksport', 'magtrans2026', 'eksport', 'Dział Eksportu Magtrans', '', '']
  ]);
  sheet.getRange(2, 1, 1, 6).setBackground('#dcfce7');
  sheet.autoResizeColumns(1, 6);
  sheet.setFrozenRows(1);
}
