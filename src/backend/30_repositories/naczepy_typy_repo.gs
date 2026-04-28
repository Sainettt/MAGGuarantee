// =================================================================
// Repository: NACZEPY_TYPY (słownik typów naczep — lookup)
// =================================================================

// Publiczne (dostępne wszystkim zalogowanym) — dla dropdownów
function getNaczepyTypyList() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sht = ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY);
    if (!sht) { ensureNaczepyTypySheet(ss); sht = ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY); }
    var data = sht.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var nazwa = (data[i][0] || '').toString().trim();
      if (!nazwa) continue;
      list.push({
        nazwa: nazwa,
        skrot: (data[i][1] || '').toString().trim(),
        opis:  (data[i][2] || '').toString().trim(),
        aktywna: ((data[i][3] || 'Tak').toString().trim() || 'Tak')
      });
    }
    return { ok: true, typy: list };
  } catch(e) {
    return { error: e.message };
  }
}
