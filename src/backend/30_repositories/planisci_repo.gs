// =================================================================
// Repository: PLANISCI (planiści/spedytorzy — lookup)
// =================================================================

// ── POBIERZ LISTĘ PLANISTÓW (dla dropdowna wniosku) ──
function getPlannerList() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  if (!sheet) {
    ensurePlanisciSheet();
    sheet = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  }
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var planners = [];
  for (var i = 1; i < data.length; i++) {
    // D=Nazwa (3), E=Email (4), G=Aktywny (6)
    var name = (data[i][3] || '').toString().trim();
    var email = (data[i][4] || '').toString().trim();
    var active = (data[i][6] || '').toString().toUpperCase().trim();
    if (name && active !== 'NIE') {
      planners.push({ name: name, email: email });
    }
  }
  return planners;
}

// ── LOOKUP: Planista email + lider email by name ──
function getPlannerEmailAndLider(plannerName) {
  if (!plannerName) return { email: '', liderEmail: '' };
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  if (!sheet) return { email: '', liderEmail: '' };
  var data = sheet.getDataRange().getValues();
  var nameUp = plannerName.toUpperCase().trim();
  for (var i = 1; i < data.length; i++) {
    // D=Nazwa (3), E=Email (4), F=Lider email (5)
    var n = (data[i][3] || '').toString().trim().toUpperCase();
    if (n === nameUp) {
      return {
        email: (data[i][4] || '').toString().trim(),
        liderEmail: (data[i][5] || '').toString().trim()
      };
    }
  }
  return { email: '', liderEmail: '' };
}
