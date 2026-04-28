// =================================================================
// Sheet: AUDIT_LOG (log akcji destrukcyjnych + zmian wrażliwych)
// =================================================================

// ── AUDIT LOG ──
// Schemat: Data | User | UserRola | Akcja | Target | Przed | Po | Powod | Metadata (JSON)
function ensureAuditLogSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_AUDIT_LOG)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_AUDIT_LOG);
  sheet.getRange(1, 1, 1, 9).setValues([['Data', 'User', 'UserRola', 'Akcja', 'Target', 'Przed', 'Po', 'Powod', 'Metadata']]);
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  var widths = [160, 120, 100, 180, 200, 200, 200, 300, 300];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}
