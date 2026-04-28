// =================================================================
// Sheets: UZYTKOWNICY (przewoźnicy), ADMIN, PRACOWNIK, OPIEKUN
// =================================================================

// ── UTWÓRZ ARKUSZ UŻYTKOWNIKÓW ──
function ensureUsersSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma przewoznika']];

  // Arkusz ADMIN
  if (!ss.getSheetByName(CONFIG.SHEET_ADMIN)) {
    var sa = ss.insertSheet(CONFIG.SHEET_ADMIN);
    sa.getRange(1, 1, 1, 6).setValues(headers);
    sa.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#b71c1c').setFontColor('white');
    sa.getRange(2, 1, 1, 6).setValues([
      ['maksim', 'magtrans2026', 'admin', 'Maksim Siankevich', 'maksim.siankevich@magtrans.eu', '']
    ]);
    sa.getRange(2, 1, 1, 6).setBackground('#ffebee');
    sa.autoResizeColumns(1, 6);
    sa.setFrozenRows(1);
  }

  // Arkusz PRACOWNIK
  if (!ss.getSheetByName(CONFIG.SHEET_PRACOWNIK)) {
    var sp = ss.insertSheet(CONFIG.SHEET_PRACOWNIK);
    sp.getRange(1, 1, 1, 6).setValues(headers);
    sp.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1a237e').setFontColor('white');
    sp.getRange(2, 1, 1, 6).setValues([
      ['pracownik', 'magtrans2026', 'pracownik', 'Pracownik Magtrans', '', '']
    ]);
    sp.getRange(2, 1, 1, 6).setBackground('#e3f2fd');
    sp.autoResizeColumns(1, 6);
    sp.setFrozenRows(1);
  }

  // Arkusz UZYTKOWNICY (przewoznicy) — 11 kolumn:
  // A:Login B:Haslo C:Rola D:Nazwa E:Email F:Firma G:NIP H:Aktywny I:LastLogin J:DataUtworzenia K:OpiekunLogin
  // Auta per przewoźnik są w osobnym arkuszu AUTA (referencja po Login)
  if (!ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY)) {
    var su = ss.insertSheet(CONFIG.SHEET_UZYTKOWNICY);
    var uHeaders = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma przewoznika', 'NIP', 'Aktywny', 'LastLogin', 'DataUtworzenia', 'OpiekunLogin']];
    su.getRange(1, 1, 1, 11).setValues(uHeaders);
    su.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1b5e20').setFontColor('white');
    var _today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    su.getRange(2, 1, 9, 11).setValues([
      ['klama',      'klama2026',     'przewoznik', 'KLAMA',           '', 'KLAMA',           '', 'Tak', '', _today, ''],
      ['zorol',      'zorol2026',     'przewoznik', 'ZOROL SPOLKA',    '', 'ZOROL SPOLKA',    '', 'Tak', '', _today, ''],
      ['platinum',   'platinum2026',  'przewoznik', 'PLATINUM GLOBAL', '', 'PLATINUM GLOBAL', '', 'Tak', '', _today, ''],
      ['gabarczyk',  'gabarczyk2026', 'przewoznik', 'GABARCZYK',       '', 'GABARCZYK',       '', 'Tak', '', _today, ''],
      ['wiptrans',   'wiptrans2026',  'przewoznik', 'WIP-TRANS',       '', 'WIP-TRANS',       '', 'Tak', '', _today, ''],
      ['marcelbis',  'marcelbis2026', 'przewoznik', 'MARCEL BIS',      '', 'MARCEL BIS',      '', 'Tak', '', _today, ''],
      ['jotmar',     'jotmar2026',    'przewoznik', 'JOT MAR',         '', 'JOT MAR',         '', 'Tak', '', _today, ''],
      ['tobtrans',   'tobtrans2026',  'przewoznik', 'TOBTRANS',        '', 'TOBTRANS',        '', 'Tak', '', _today, ''],
      ['test',       'test2026',      'przewoznik', 'TESTTRANS',       '', 'TESTTRANS',       '', 'Tak', '', _today, ''],
    ]);
    su.getRange(2, 1, 9, 11).setBackground('#e8f5e9');
    su.autoResizeColumns(1, 11);
    su.setFrozenRows(1);
  }
  // Arkusz OPIEKUN (widok tylko do podglądu — może przeglądać wnioski bez edycji)
  if (!ss.getSheetByName(CONFIG.SHEET_OPIEKUN)) {
    var so = ss.insertSheet(CONFIG.SHEET_OPIEKUN);
    so.getRange(1, 1, 1, 6).setValues(headers);
    so.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#4a148c').setFontColor('white');
    so.getRange(2, 1, 1, 6).setValues([
      ['opiekun', 'magtrans2026', 'opiekun', 'Opiekun Magtrans', '', '']
    ]);
    so.getRange(2, 1, 1, 6).setBackground('#f3e5f5');
    so.autoResizeColumns(1, 6);
    so.setFrozenRows(1);
  }
}

// Auto-extend UZYTKOWNICY o brakującą kolumnę K (OpiekunLogin) + L-V (rozszerzone dane firmy)
// Schemat docelowy 22 kolumny:
// A:Login B:Haslo C:Rola D:Nazwa E:Email F:Firma G:NIP H:Aktywny I:LastLogin J:DataUtworzenia K:OpiekunLogin
// L:OsobaKontaktowa M:Telefon N:EmailZlecenia O:TerminPlatnosci P:KontoEUR Q:KontoPLN
// R:UbezpWartosc S:UbezpWaznosc T:LicencjaWaznosc U:LiczbaWypisow V:AdresFirmy
function ensureUsersColumnsExtended(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!su) return;
  var headerK = (su.getRange(1, 11).getValue() || '').toString().trim();
  if (headerK !== 'OpiekunLogin') {
    su.getRange(1, 11).setValue('OpiekunLogin');
    su.getRange(1, 11).setFontWeight('bold').setBackground('#1b5e20').setFontColor('white');
    su.setColumnWidth(11, 140);
    Logger.log('UZYTKOWNICY: rozszerzone o kolumnę K (OpiekunLogin)');
  }
  // L-V — rozszerzone dane firmy (kontakt + finansowe + dokumenty)
  var headerL = (su.getRange(1, 12).getValue() || '').toString().trim();
  if (headerL !== 'OsobaKontaktowa') {
    var newHeaders = ['OsobaKontaktowa','Telefon','EmailZlecenia','TerminPlatnosci',
                      'KontoEUR','KontoPLN','UbezpWartosc','UbezpWaznosc',
                      'LicencjaWaznosc','LiczbaWypisow','AdresFirmy'];
    su.getRange(1, 12, 1, 11).setValues([newHeaders]);
    su.getRange(1, 12, 1, 11).setFontWeight('bold').setBackground('#1b5e20').setFontColor('white');
    var widthsExt = [160, 130, 200, 110, 220, 220, 110, 110, 110, 80, 280];
    for (var i = 0; i < widthsExt.length; i++) su.setColumnWidth(12 + i, widthsExt[i]);
    Logger.log('UZYTKOWNICY: rozszerzone o kolumny L-V (kontakt/konta/ubezpieczenie/licencja)');
  }
}
