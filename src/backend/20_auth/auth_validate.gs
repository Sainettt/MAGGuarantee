// =================================================================
// Auth: walidacja tożsamości i wymagania ról
// findUserInSheet, authenticateUser, validateCaller, requireXxx
// =================================================================

// Szuka użytkownika po loginie (i opcjonalnie haśle) w danym arkuszu.
// Zwraca obiekt {login, nazwa, email, przewoznik, nip, aktywny, auta, rowIdx} lub null.
function findUserInSheet(ss, sheetName, login, password) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var lTrim = login.trim();
  var pTrim = password ? password.trim() : null;
  for (var i = 1; i < data.length; i++) {
    var rl = (data[i][0] || '').toString().trim();
    if (rl !== lTrim) continue;
    if (pTrim !== null) {
      var rp = (data[i][1] || '').toString().trim();
      if (rp !== pTrim) continue;
    }

    // Struktura zależy od arkusza:
    // - UZYTKOWNICY (przewoźnicy): 10 kolumn, G=NIP, H=Aktywny, I=LastLogin, J=DataUtworzenia
    //   auta per przewoźnik są w osobnym arkuszu AUTA (tylko aktywne)
    // - PLANISCI: 7 kolumn, F=Lider email, G=Aktywny
    // - ADMIN/PRACOWNIK/OPIEKUN/DYSPOZYTOR: 6 kolumn — brak Aktywny, aut
    var nip = '', aktywny = 'Tak';
    var auta = [];
    if (sheetName === CONFIG.SHEET_UZYTKOWNICY) {
      nip = (data[i][6] || '').toString().trim();
      aktywny = (data[i][7] || 'Tak').toString().trim() || 'Tak';
      auta = getActiveVehiclesForLogin(rl);
    } else if (sheetName === CONFIG.SHEET_PLANISCI) {
      aktywny = (data[i][6] || 'Tak').toString().trim() || 'Tak'; // col G
      // col F = Lider email; pole `przewoznik` przechowa je (nieużywane dla planisty)
    }
    // Dla ADMIN/PRACOWNIK/OPIEKUN/DYSPOZYTOR pozostają wartości domyślne (nip='', aktywny='Tak', auta=[])

    return {
      login: rl,
      nazwa: (data[i][3] || '').toString().trim(),
      email: (data[i][4] || '').toString().trim(),
      przewoznik: (data[i][5] || '').toString().trim(),
      nip: nip,
      aktywny: aktywny,
      auta: auta,
      rowIdx: i + 1
    };
  }
  return null;
}

// ── STARA authenticateUser — zachowana dla kompatybilności (używana wewnętrznie) ──
function authenticateUser(login, password) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var u;
  u = findUserInSheet(ss, CONFIG.SHEET_ADMIN, login, password);
  if (u) { u.rola = 'admin'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_PRACOWNIK, login, password);
  if (u) { u.rola = 'pracownik'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_OPIEKUN, login, password);
  if (u) { u.rola = 'opiekun'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_UZYTKOWNICY, login, password);
  if (u) { u.rola = 'przewoznik'; return u; }
  return null;
}

// ── WALIDACJA TOŻSAMOŚCI (server-side) ──
// Szuka loginu we wszystkich arkuszach ról, zwraca obiekt z rolą
function validateCaller(callerLogin) {
  if (!callerLogin) return null;
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var u;
  u = findUserInSheet(ss, CONFIG.SHEET_ADMIN, callerLogin, null);
  if (u) { u.rola = 'admin'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_PRACOWNIK, callerLogin, null);
  if (u) { u.rola = 'pracownik'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_OPIEKUN, callerLogin, null);
  if (u) { u.rola = 'opiekun'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_PLANISCI, callerLogin, null);
  if (u) { u.rola = 'planista'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_DYSPOZYTOR, callerLogin, null);
  if (u) { u.rola = 'dyspozytor'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_EKSPORT, callerLogin, null);
  if (u) { u.rola = 'eksport'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_WERYFIKATOR, callerLogin, null);
  if (u) { u.rola = 'weryfikator'; return u; }
  u = findUserInSheet(ss, CONFIG.SHEET_UZYTKOWNICY, callerLogin, null);
  if (u) {
    // Blokada dezaktywowanych przewoźników — nie mogą wykonywać żadnych akcji
    if ((u.aktywny || 'Tak').toString().toUpperCase() === 'NIE') return null;
    u.rola = 'przewoznik';
    return u;
  }
  return null;
}

// ── WYMAGANIA ROLI ──

// Wymaga roli admin; zwraca user jeśli admin, null w przeciwnym razie
function requireAdmin(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'admin') return null;
  return u;
}

// Sprawdza czy caller jest pracownikiem/adminem/opiekunem
function requireEmployee(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || (u.rola !== 'pracownik' && u.rola !== 'admin' && u.rola !== 'opiekun')) return null;
  return u;
}

// Sprawdza czy caller jest przewoźnikiem i posiada dany wniosek
function requireCarrierOwner(callerLogin, rowNumber) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'przewoznik') return null;
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return null;
  var claimOwner = (sheet.getRange(rowNumber, 2).getValue() || '').toString().trim();
  if (claimOwner.toUpperCase() !== u.przewoznik.toUpperCase()) return null;
  return u;
}

function _requireOpiekun(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'opiekun') return null;
  return u;
}

function _requirePlanista(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'planista') return null;
  return u;
}

function _requireDyspozytor(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'dyspozytor') return null;
  return u;
}

function _requireEksport(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'eksport') return null;
  return u;
}

function _requireWeryfikator(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'weryfikator') return null;
  return u;
}

function _requireCarrier(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'przewoznik') return null;
  return u;
}

// Sprawdza czy caller (opiekun) jest opiekunem danego przewoźnika (ownership)
function _opiekunOwnsCarrier(opiekunLogin, carrierLogin) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!su) return false;
  var data = su.getDataRange().getValues();
  var opLc = opiekunLogin.toString().trim().toLowerCase();
  var carLc = carrierLogin.toString().trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim().toLowerCase() === carLc) {
      return (data[i][10] || '').toString().trim().toLowerCase() === opLc;
    }
  }
  return false;
}
