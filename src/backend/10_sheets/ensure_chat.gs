// =================================================================
// Sheet: CHAT (wiadomości czatu per wniosek)
// =================================================================

function ensureChatSheet(ss) {
  if (!CONFIG.CHAT_ENABLED) return;
  try {
    ss = ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_CHAT);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_CHAT);
      sheet.getRange(1, 1, 1, 7).setValues([[
        'nrZgloszenia', 'timestamp', 'senderLogin', 'senderName', 'senderRole', 'message', 'notified'
      ]]);
      sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1e293b').setFontColor('#fff');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 120);
      sheet.setColumnWidth(2, 180);
      sheet.setColumnWidth(6, 400);
    }
  } catch(e) { Logger.log('ensureChatSheet ERR: ' + e.message); }
}
