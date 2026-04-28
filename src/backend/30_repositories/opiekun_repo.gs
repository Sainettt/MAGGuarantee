// =================================================================
// Repository: OPIEKUNOWIE / OPIEKUN (lookup)
// =================================================================

function getOpiekunList() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUN);
  // Fallback do starego arkusza jeśli OPIEKUN jeszcze nie istnieje
  if (!sheet) sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var list = [];
  // Wykryj format arkusza po nagłówku
  var isNewFormat = (data[0] && (data[0][0] || '').toString().toUpperCase() === 'LOGIN');
  for (var i = 1; i < data.length; i++) {
    var login = '', name = '', email = '';
    if (isNewFormat) {
      // Nowy format: Login(A) Haslo(B) Rola(C) Nazwa(D) Email(E) Firma(F)
      login = (data[i][0] || '').toString().trim();
      name  = (data[i][3] || '').toString().trim();
      email = (data[i][4] || '').toString().trim();
    } else {
      // Stary format: Imię i nazwisko(A) Email(B) Aktywny(C)
      name  = (data[i][0] || '').toString().trim();
      email = (data[i][1] || '').toString().trim();
      var active = (data[i][2] || '').toString().toUpperCase().trim();
      if (active === 'NIE') continue;
    }
    // Dodaj login do zwracanego obiektu (additywnie — stare kod używa p.name)
    if (name && email) list.push({ login: login, name: name, email: email });
  }
  return list;
}

// ── LOOKUP: Opiekun email by name ──
function getOpiekunEmail(opiekunName) {
  if (!opiekunName) return '';
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUN);
  if (!sheet) sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (!sheet) return '';
  var data = sheet.getDataRange().getValues();
  var nameUp = opiekunName.toUpperCase().trim();
  var isNewFormat = (data[0] && (data[0][0] || '').toString().toUpperCase() === 'LOGIN');
  for (var i = 1; i < data.length; i++) {
    var n, em;
    if (isNewFormat) {
      n  = (data[i][3] || '').toString().trim().toUpperCase(); // Nazwa — kol D
      em = (data[i][4] || '').toString().trim();               // Email — kol E
    } else {
      n  = (data[i][0] || '').toString().trim().toUpperCase();
      em = (data[i][1] || '').toString().trim();
    }
    if (n === nameUp) return em;
  }
  return '';
}
