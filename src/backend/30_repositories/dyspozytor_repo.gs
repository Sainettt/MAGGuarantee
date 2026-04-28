// =================================================================
// Repository: DYSPOZYTOR (lookup)
// =================================================================

// Lista dyspozytorów (dla dropdowna w modal szczegółów auta)
function getDyspozytorList() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_DYSPOZYTOR);
    if (!sheet) return { ok: true, list: [] };
    var data = sheet.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var login = (data[i][0] || '').toString().trim();
      var nazwa = (data[i][3] || '').toString().trim();
      if (!login) continue;
      list.push({ login: login, nazwa: nazwa });
    }
    return { ok: true, list: list };
  } catch(e) {
    return { error: e.message };
  }
}
