// =================================================================
// SYSTEM GWARANCJI KM - Wersja z kontami uzytkownikow
// Panel Przewoznika + Panel Pracownika
// Magtrans - Maksim Siankevich
// =================================================================

var CONFIG = {
  SPREADSHEET_ID: '109XKHArODxrbVdXIj0WddEwpJqd-vzA8dMQ67RcbEqI',
  SHEET_GWARANCJA:   'GWARANCJA',
  SHEET_WNIOSEK:     'WNIOSEK',
  SHEET_UZYTKOWNICY: 'UZYTKOWNICY',   // przewoźnicy
  SHEET_ADMIN:       'ADMIN',           // administratorzy
  SHEET_PRACOWNIK:   'PRACOWNIK',       // opiekunowie wniosków (UI label: "Opiekun wniosków")
  SHEET_PLANISCI:    'PLANISCI',        // planiści (spedytorzy) — mają login i panel
  SHEET_DYSPOZYTOR:  'DYSPOZYTOR',      // dyspozytorzy — mają login i panel
  SHEET_OPIEKUNOWIE: 'OPIEKUNOWIE',
  SHEET_OPIEKUN:     'OPIEKUN',
  SHEET_EKSPORT:     'EKSPORT',         // dział eksportu — widzi delegacje
  SHEET_WERYFIKATOR: 'WERYFIKATOR',     // weryfikator — zarządza statusem delegacji
  SHEET_DELEGACJE:   'DELEGACJE',       // wyjazdy/delegacje (Faza 2)
  SHEET_LIMITY:      'LIMITY KM',
  SHEET_AUTA:        'AUTA',            // pojazdy (ciagniki) per przewoznik
  SHEET_KIEROWCY:    'KIEROWCY',        // baza kierowcow per przewoznik
  SHEET_NACZEPY:     'NACZEPY',         // rejestr konkretnych naczep per przewoznik
  SHEET_NACZEPY_TYPY:'NACZEPY_TYPY',    // slownik typow naczep
  SHEET_AUDIT_LOG:   'AUDIT_LOG',       // log akcji destrukcyjnych + zmian wra\u017cliwych
  SHEET_CHAT:        'CHAT',            // czat per wniosek
  CHAT_ENABLED:      true,              // feature flag — ustaw false żeby wyłączyć cały moduł czatu
  ADMIN_EMAIL: 'maksim.siankevich@magtrans.eu',
  WNIOSKI_EMAIL: 'wnioski@magtrans.eu',
  STAWKA_EUR_ZA_KM: 0.5,
  KM_DZIENNIE: 540,
  // Stala lista typow wyposazenia aut (uzywana w AUTA.Wyposazenie jako CSV)
  WYPOSAZENIE_TYPES: [
    'GPS', 'HDS (dźwig)', 'Winda załadunkowa', 'Chłodnia',
    'Plandeka', 'Pasy zabezpieczające', 'Hakowiec',
    'Tempomat', 'Lodówka w kabinie', 'Kamera cofania', 'Mega (wysoka przestrzeń)'
  ],
  // Certyfikat halasu (AT/CH) — poziomy L1 (najcichsze) → L3
  CERTYFIKAT_L_VALUES: ['L1', 'L2', 'L3'],
  // Norma EURO silnika (wyzsze = lepsze, VI to najnowsza)
  EURO_VALUES: ['III', 'IV', 'V', 'VI'],
  // Typy aut (ciągników)
  TYPY_AUT: ['MEGA', 'STD', 'COIL'],
  // Klasy ADR (towary niebezpieczne) — CSV w kolumnie AUTA.ADR
  ADR_KLASY: [
    { id: '1', nazwa: 'Materiały wybuchowe' },
    { id: '2', nazwa: 'Gazy' },
    { id: '3', nazwa: 'Ciecze palne' },
    { id: '4', nazwa: 'Substancje stałe palne' },
    { id: '5', nazwa: 'Utleniacze / nadtlenki' },
    { id: '6', nazwa: 'Substancje trujące' },
    { id: '7', nazwa: 'Materiały radioaktywne' },
    { id: '8', nazwa: 'Substancje żrące' },
    { id: '9', nazwa: 'Różne (w tym akumulatory Li-ion)' }
  ],
  // Odpady (A-schild) — kraje, w których przewoźnik posiada zezwolenie / oznakowanie A-schild
  // CSV w kolumnie AUTA.OdpadyKraje
  // Statusy delegacji (wyjazdy)
  STATUSY_DELEGACJI: ['zgloszony', 'w_trasie', 'zjechal', 'anulowany'],
  ODPADY_KRAJE: [
    { id: 'PL', nazwa: 'Polska' },
    { id: 'DE', nazwa: 'Niemcy' },
    { id: 'AT', nazwa: 'Austria' },
    { id: 'CH', nazwa: 'Szwajcaria' },
    { id: 'NL', nazwa: 'Holandia' },
    { id: 'BE', nazwa: 'Belgia' },
    { id: 'LU', nazwa: 'Luksemburg' },
    { id: 'FR', nazwa: 'Francja' },
    { id: 'IT', nazwa: 'Włochy' },
    { id: 'CZ', nazwa: 'Czechy' },
    { id: 'SK', nazwa: 'Słowacja' },
    { id: 'HU', nazwa: 'Węgry' },
    { id: 'SI', nazwa: 'Słowenia' },
    { id: 'HR', nazwa: 'Chorwacja' },
    { id: 'ES', nazwa: 'Hiszpania' },
    { id: 'PT', nazwa: 'Portugalia' },
    { id: 'DK', nazwa: 'Dania' },
    { id: 'SE', nazwa: 'Szwecja' },
    { id: 'NO', nazwa: 'Norwegia' },
    { id: 'FI', nazwa: 'Finlandia' },
    { id: 'GB', nazwa: 'Wielka Brytania' },
    { id: 'IE', nazwa: 'Irlandia' },
    { id: 'RO', nazwa: 'Rumunia' },
    { id: 'BG', nazwa: 'Bułgaria' },
    { id: 'LT', nazwa: 'Litwa' },
    { id: 'LV', nazwa: 'Łotwa' },
    { id: 'EE', nazwa: 'Estonia' }
  ],
  KOLORY: {
    'ZAAKCEPTOWANO':   '#00FF00',
    'NA WERYFIKACJI':  '#FFFF00',
    'ODRZUCONO':       '#FF0000',
    'REKLAMACJA':      '#FFA500',
    'OCZEKUJE NA AUTORYZACJĘ': '#E0E0FF'
  }
};

// ── SERWUJ APLIKACJĘ ──
function doGet(e) {
  // Otwórz arkusz raz i przekaż do ensure* (optymalizacja — 1 zamiast wielu wywołań openById)
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  ensureUsersSheet(ss);
  ensurePlanisciSheet(ss);
  ensureOpiekunowieSheet(ss);
  ensureLimitySheet(ss);
  ensureAutaSheet(ss);
  ensureAutaColumnsExtended(ss);
  ensureKierowcySheet(ss);
  ensureKierowcyColumnsExtended(ss);
  ensureNaczepyTypySheet(ss);
  ensureNaczepySheet(ss);
  ensureNaczepyColumnsExtended(ss);
  ensureDyspozytorSheet(ss);
  ensureEksportSheet(ss);
  ensureWeryfikatorSheet(ss);
  ensureDelegacjeSheet(ss);
  ensureUsersColumnsExtended(ss);
  ensureAuditLogSheet(ss);
  if (CONFIG.CHAT_ENABLED) ensureChatSheet(ss);

  return HtmlService.createHtmlOutputFromFile('App')
    .setTitle('MAGGuarantee — Magtrans')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

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

// ── UTWÓRZ ARKUSZ AUTA ──
// Schemat 28 kolumn:
// A-F: Login|NrRej|Aktywne|DataDod|DataDezakt|UtworzonePrzez
// G-L: Planista|Wyposazenie(legacy)|Marka|Model|Rok|Uwagi
// M-O: CertyfikatL|EURO|ADR
// P-Q: GPS|KartaPaliwowa
// R-X: Typ|Dyspozytor|GB|IT|FR|Porozumienie|Umowa
// Y-AB: StawkaDE|StawkaUE|StawkaEksport|StawkaImport
function ensureAutaSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_AUTA)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_AUTA);
  var headers = [[
    'LoginPrzewoznika', 'NrRej', 'Aktywne', 'DataDodania', 'DataDezaktywacji', 'UtworzonePrzez',
    'Planista', 'Wyposazenie', 'Marka', 'Model', 'Rok', 'Uwagi',
    'CertyfikatL', 'EURO', 'ADR',
    'GPS', 'KartaPaliwowa',
    'Typ', 'Dyspozytor', 'GB', 'IT', 'FR', 'Porozumienie', 'Umowa',
    'StawkaDE', 'StawkaUE', 'StawkaEksport', 'StawkaImport',
    'Odpady', 'OdpadyKraje',
    'KabotazDE', 'KabotazFR', 'GPSMobNr', 'NastepnyPrzeglad', 'NrBoczny', 'OstatnioJezdzilo'
  ]];
  sheet.getRange(1, 1, 1, 36).setValues(headers);
  sheet.getRange(1, 1, 1, 36).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  var widths = [150, 120, 80, 140, 140, 120, 130, 220, 100, 100, 60, 200, 100, 80, 120, 70, 110, 70, 130, 60, 60, 60, 110, 80, 90, 90, 100, 100, 80, 200, 90, 90, 130, 130, 100, 130];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
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

// Auto-extend istniejącego arkusza AUTA o brakujące kolumny — bezpieczne (tylko dodawanie)
function ensureAutaColumnsExtended(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_AUTA);
  if (!sheet) return;
  // Sprawdz header G (Planista) — stary schemat ma tu pustą komórkę
  var headerG = (sheet.getRange(1, 7).getValue() || '').toString().trim();
  if (headerG !== 'Planista') {
    sheet.getRange(1, 7, 1, 6).setValues([['Planista', 'Wyposazenie', 'Marka', 'Model', 'Rok', 'Uwagi']]);
    sheet.getRange(1, 7, 1, 6).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    var w1 = [130, 220, 100, 100, 60, 200];
    for (var i = 0; i < w1.length; i++) sheet.setColumnWidth(7 + i, w1[i]);
    Logger.log('AUTA: rozszerzone o kolumny G-L');
  }
  // Sprawdz header M (CertyfikatL)
  var headerM = (sheet.getRange(1, 13).getValue() || '').toString().trim();
  if (headerM !== 'CertyfikatL') {
    sheet.getRange(1, 13, 1, 3).setValues([['CertyfikatL', 'EURO', 'ADR']]);
    sheet.getRange(1, 13, 1, 3).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    var w2 = [100, 80, 120];
    for (var j = 0; j < w2.length; j++) sheet.setColumnWidth(13 + j, w2[j]);
    Logger.log('AUTA: rozszerzone o kolumny M-O (CertyfikatL, EURO, ADR)');
  }
  // Sprawdz header P (GPS) — nowy schemat z flagami
  var headerP = (sheet.getRange(1, 16).getValue() || '').toString().trim();
  if (headerP !== 'GPS') {
    sheet.getRange(1, 16, 1, 2).setValues([['GPS', 'KartaPaliwowa']]);
    sheet.getRange(1, 16, 1, 2).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    var w3 = [70, 110];
    for (var k = 0; k < w3.length; k++) sheet.setColumnWidth(16 + k, w3[k]);
    Logger.log('AUTA: rozszerzone o kolumny P-Q (GPS, KartaPaliwowa)');
  }
  // Sprawdz header R (Typ) — Faza 3 extension
  var headerR = (sheet.getRange(1, 18).getValue() || '').toString().trim();
  if (headerR !== 'Typ') {
    sheet.getRange(1, 18, 1, 11).setValues([['Typ','Dyspozytor','GB','IT','FR','Porozumienie','Umowa','StawkaDE','StawkaUE','StawkaEksport','StawkaImport']]);
    sheet.getRange(1, 18, 1, 11).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    var w4 = [70, 130, 60, 60, 60, 110, 80, 90, 90, 100, 100];
    for (var m = 0; m < w4.length; m++) sheet.setColumnWidth(18 + m, w4[m]);
    Logger.log('AUTA: rozszerzone o kolumny R-AB (Typ/Dyspozytor/GB/IT/FR/Porozumienie/Umowa/Stawki)');
  }
  // Sprawdz header AC (Odpady) — extension dla A-schild
  var headerAC = (sheet.getRange(1, 29).getValue() || '').toString().trim();
  if (headerAC !== 'Odpady') {
    sheet.getRange(1, 29, 1, 2).setValues([['Odpady', 'OdpadyKraje']]);
    sheet.getRange(1, 29, 1, 2).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setColumnWidth(29, 80);
    sheet.setColumnWidth(30, 200);
    Logger.log('AUTA: rozszerzone o kolumny AC-AD (Odpady, OdpadyKraje)');
  }
  // Sprawdz header AE (KabotazDE) — kabotaż + GPS MOB nr
  var headerAE = (sheet.getRange(1, 31).getValue() || '').toString().trim();
  if (headerAE !== 'KabotazDE') {
    sheet.getRange(1, 31, 1, 3).setValues([['KabotazDE', 'KabotazFR', 'GPSMobNr']]);
    sheet.getRange(1, 31, 1, 3).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setColumnWidth(31, 90);
    sheet.setColumnWidth(32, 90);
    sheet.setColumnWidth(33, 130);
    Logger.log('AUTA: rozszerzone o kolumny AE-AG (KabotazDE, KabotazFR, GPSMobNr)');
  }
  // Sprawdz header AH (NastepnyPrzeglad)
  var headerAH = (sheet.getRange(1, 34).getValue() || '').toString().trim();
  if (headerAH !== 'NastepnyPrzeglad') {
    sheet.getRange(1, 34).setValue('NastepnyPrzeglad');
    sheet.getRange(1, 34).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setColumnWidth(34, 130);
    Logger.log('AUTA: rozszerzone o kolumnę AH (NastepnyPrzeglad)');
  }
  // Sprawdz header AI (NrBoczny) — numer boczny pojazdu (oznaczenie ręczne floty)
  var headerAI = (sheet.getRange(1, 35).getValue() || '').toString().trim();
  if (headerAI !== 'NrBoczny') {
    sheet.getRange(1, 35).setValue('NrBoczny');
    sheet.getRange(1, 35).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setColumnWidth(35, 100);
    Logger.log('AUTA: rozszerzone o kolumnę AI (NrBoczny)');
  }
  // Sprawdz header AJ (OstatnioJezdzilo) — data ostatniej aktywności pojazdu
  var headerAJ = (sheet.getRange(1, 36).getValue() || '').toString().trim();
  if (headerAJ !== 'OstatnioJezdzilo') {
    sheet.getRange(1, 36).setValue('OstatnioJezdzilo');
    sheet.getRange(1, 36).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sheet.setColumnWidth(36, 130);
    Logger.log('AUTA: rozszerzone o kolumnę AJ (OstatnioJezdzilo)');
  }
}

// ── UTWÓRZ ARKUSZ KIEROWCY ──
// Schemat 13 kolumn
// A-J: Login|Imie|Nazwisko|PrzewoznikLogin|TelefonFirmowy|Email|NrPrawaJazdy|Aktywny|DataDodania|UtworzonePrzez
// K-M: TelefonPrywatny|PrawoJazdyWaznosc|KontoAmazon
function ensureKierowcySheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_KIEROWCY)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_KIEROWCY);
  var headers = [[
    'Login', 'Imie', 'Nazwisko', 'PrzewoznikLogin', 'TelefonFirmowy', 'Email',
    'NrPrawaJazdy', 'Aktywny', 'DataDodania', 'UtworzonePrzez',
    'TelefonPrywatny', 'PrawoJazdyWaznosc', 'KontoAmazon'
  ]];
  sheet.getRange(1, 1, 1, 13).setValues(headers);
  sheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#075985').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  var widths = [120, 100, 120, 150, 120, 180, 140, 80, 140, 120, 130, 130, 100];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}

// Auto-extend istniejącego KIEROWCY o brakujące kolumny K-M
function ensureKierowcyColumnsExtended(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
  if (!sheet) return;
  // Najpierw rename E (Telefon → TelefonFirmowy) jeśli stary header
  var headerE = (sheet.getRange(1, 5).getValue() || '').toString().trim();
  if (headerE === 'Telefon') {
    sheet.getRange(1, 5).setValue('TelefonFirmowy');
    Logger.log('KIEROWCY: zmieniono nagłówek E (Telefon → TelefonFirmowy)');
  }
  var headerK = (sheet.getRange(1, 11).getValue() || '').toString().trim();
  if (headerK !== 'TelefonPrywatny') {
    sheet.getRange(1, 11, 1, 3).setValues([['TelefonPrywatny', 'PrawoJazdyWaznosc', 'KontoAmazon']]);
    sheet.getRange(1, 11, 1, 3).setFontWeight('bold').setBackground('#075985').setFontColor('#ffffff');
    sheet.setColumnWidth(11, 130);
    sheet.setColumnWidth(12, 130);
    sheet.setColumnWidth(13, 100);
    Logger.log('KIEROWCY: rozszerzone o kolumny K-M (TelefonPrywatny, PrawoJazdyWaznosc, KontoAmazon)');
  }
}

// ── UTWÓRZ ARKUSZ NACZEPY (rejestr konkretnych naczep) ──
// Schemat 22 kolumn
// A-I: NrRej|PrzewoznikLogin|TypNaczepy|Marka|Model|Rok|Aktywna|DataDodania|UtworzonePrzez
// J-K: XLCode|Multilock
// L-N: WyposPasy|WyposMaty|WyposKatowniki
// O-P: DeskiAluLiczba|DeskiDrewLiczba
// Q: PodnoszonyDach
// R-S: BocznyPrzeswit|TylnyPrzeswit (cm)
// T-V: LadowanieTyl|LadowanieBok|LadowanieGora
function ensureNaczepySheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_NACZEPY)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_NACZEPY);
  var headers = [[
    'NrRej', 'PrzewoznikLogin', 'TypNaczepy', 'Marka', 'Model', 'Rok',
    'Aktywna', 'DataDodania', 'UtworzonePrzez',
    'XLCode', 'Multilock',
    'WyposPasy', 'WyposMaty', 'WyposKatowniki',
    'DeskiAluLiczba', 'DeskiDrewLiczba',
    'PrzesuwnyDach', 'BocznyPrzeswit', 'TylnyPrzeswit',
    'LadowanieTyl', 'LadowanieBok', 'LadowanieGora',
    'NastepnyPrzeglad', 'PrzesuwnyDachEdscha'
  ]];
  sheet.getRange(1, 1, 1, 24).setValues(headers);
  sheet.getRange(1, 1, 1, 24).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  var widths = [120, 150, 130, 100, 100, 60, 80, 140, 120,
                80, 80, 80, 80, 100, 110, 120, 110, 100, 100, 80, 80, 80, 130, 130];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}

// Auto-extend istniejącego arkusza NACZEPY o brakujące kolumny J-V (+W NastepnyPrzeglad)
function ensureNaczepyColumnsExtended(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
  if (!sheet) return;
  var headerJ = (sheet.getRange(1, 10).getValue() || '').toString().trim();
  if (headerJ !== 'XLCode') {
    var ext = [['XLCode', 'Multilock', 'WyposPasy', 'WyposMaty', 'WyposKatowniki',
                'DeskiAluLiczba', 'DeskiDrewLiczba', 'PodnoszonyDach',
                'BocznyPrzeswit', 'TylnyPrzeswit',
                'LadowanieTyl', 'LadowanieBok', 'LadowanieGora']];
    sheet.getRange(1, 10, 1, 13).setValues(ext);
    sheet.getRange(1, 10, 1, 13).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
    var widthsExt = [80, 80, 80, 80, 100, 110, 120, 110, 100, 100, 80, 80, 80];
    for (var i = 0; i < widthsExt.length; i++) sheet.setColumnWidth(10 + i, widthsExt[i]);
    Logger.log('NACZEPY: rozszerzone o kolumny J-V (XLCode/Multilock/Wyposazenie/Wymiary/Ladowanie)');
  }
  // Kolumna W = NastepnyPrzeglad
  var headerW = (sheet.getRange(1, 23).getValue() || '').toString().trim();
  if (headerW !== 'NastepnyPrzeglad') {
    sheet.getRange(1, 23).setValue('NastepnyPrzeglad');
    sheet.getRange(1, 23).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
    sheet.setColumnWidth(23, 130);
    Logger.log('NACZEPY: rozszerzone o kolumnę W (NastepnyPrzeglad)');
  }
  // Rename Q (PodnoszonyDach → PrzesuwnyDach) — semantyka zmieniona
  var headerQ = (sheet.getRange(1, 17).getValue() || '').toString().trim();
  if (headerQ === 'PodnoszonyDach') {
    sheet.getRange(1, 17).setValue('PrzesuwnyDach');
    Logger.log('NACZEPY: rename Q PodnoszonyDach → PrzesuwnyDach');
  }
  // Kolumna X = PrzesuwnyDachEdscha
  var headerX = (sheet.getRange(1, 24).getValue() || '').toString().trim();
  if (headerX !== 'PrzesuwnyDachEdscha') {
    sheet.getRange(1, 24).setValue('PrzesuwnyDachEdscha');
    sheet.getRange(1, 24).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
    sheet.setColumnWidth(24, 130);
    Logger.log('NACZEPY: rozszerzone o kolumnę X (PrzesuwnyDachEdscha)');
  }
}

// ── UTWÓRZ SŁOWNIK TYPÓW NACZEP ──
// Schemat 4 kolumny: Nazwa | Skrot | Opis | Aktywna
function ensureNaczepyTypySheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_NACZEPY_TYPY);
  sheet.getRange(1, 1, 1, 4).setValues([['Nazwa', 'Skrot', 'Opis', 'Aktywna']]);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#7c2d12').setFontColor('#ffffff');
  // Seed
  var seed = [
    ['Firanka',       'FIR',  'Naczepa kurtynowa, boki otwierane', 'Tak'],
    ['Plandeka',      'PLA',  'Naczepa plandekowa (klasyk)',        'Tak'],
    ['Chłodnia',      'CHL',  'Naczepa chłodnicza (frigo)',         'Tak'],
    ['Wywrotka',      'WYW',  'Naczepa samowyładowcza',             'Tak'],
    ['Mega',          'MEG',  'Naczepa o zwiększonej wysokości',    'Tak'],
    ['Jumbo',         'JUM',  'Naczepa ekstra wysoka i dluga',      'Tak'],
    ['Frigo',         'FRI',  'Frigo (synonim chłodni)',            'Tak'],
    ['Niska',         'NIS',  'Naczepa niskopodłogowa',             'Tak'],
    ['Burtowa',       'BUR',  'Naczepa burtowa',                    'Tak'],
    ['Kontener',      'KON',  'Platforma pod kontener',             'Tak'],
    ['Cysterna',      'CYS',  'Cysterna (ADR)',                     'Tak'],
    ['HDS',           'HDS',  'Naczepa z dźwigiem (hakowiec)',      'Tak'],
    ['Walking Floor', 'WF',   'Podłoga ruchoma (Walking Floor)',    'Tak']
  ];
  sheet.getRange(2, 1, seed.length, 4).setValues(seed);
  sheet.getRange(2, 1, seed.length, 4).setBackground('#fff7ed');
  sheet.setFrozenRows(1);
  var widths = [160, 80, 320, 80];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}

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

// Helper: zapisz wpis do AUDIT_LOG + opcjonalnie wyślij email do admina
// user: login wykonującego; rola: user.rola; akcja: np. 'carrier_delete'; target: np. login przewoźnika
// before/after: stara/nowa wartość (może być string lub JSON); powod: wymagany dla destrukcji; metadata: JSON object
function _writeAuditLog(user, rola, akcja, target, before, after, powod, metadata, sendMail) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_AUDIT_LOG);
    if (!sheet) { ensureAuditLogSheet(ss); sheet = ss.getSheetByName(CONFIG.SHEET_AUDIT_LOG); }
    var timestamp = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    var metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : '';
    sheet.appendRow([timestamp, user || '', rola || '', akcja || '', target || '', (before || '').toString(), (after || '').toString(), powod || '', metaStr]);

    // Email do admina przy destrukcyjnych akcjach
    if (sendMail !== false) {
      try {
        var icon = '🔔';
        if (akcja.indexOf('delete') >= 0) icon = '🗑️';
        else if (akcja.indexOf('deactivate') >= 0 || akcja.indexOf('toggle') >= 0) icon = '⏸️';
        else if (akcja.indexOf('planista') >= 0 || akcja.indexOf('stawka') >= 0) icon = '✏️';
        MailApp.sendEmail({
          to: CONFIG.ADMIN_EMAIL,
          subject: icon + ' AUDIT: ' + akcja + ' przez ' + (user || '?') + ' (' + (rola || '?') + ')',
          htmlBody: '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto">' +
            '<div style="background:#7c2d12;padding:16px 24px;border-radius:12px 12px 0 0">' +
              '<h2 style="color:#fff;margin:0;font-size:17px">' + icon + ' Akcja w systemie MAGGuarantee</h2>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 24px">' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Data:</b></td><td style="padding:8px 12px">' + timestamp + '</td></tr>' +
                '<tr><td style="padding:8px 12px;color:#64748b"><b>Użytkownik:</b></td><td style="padding:8px 12px;font-weight:700">' + escHtml(user || '') + ' (' + escHtml(rola || '') + ')</td></tr>' +
                '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Akcja:</b></td><td style="padding:8px 12px;font-family:monospace;color:#b91c1c;font-weight:700">' + escHtml(akcja) + '</td></tr>' +
                '<tr><td style="padding:8px 12px;color:#64748b"><b>Target:</b></td><td style="padding:8px 12px;font-family:monospace">' + escHtml(target || '') + '</td></tr>' +
                (before ? '<tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b"><b>Przed:</b></td><td style="padding:8px 12px">' + escHtml(before.toString()) + '</td></tr>' : '') +
                (after  ? '<tr><td style="padding:8px 12px;color:#64748b"><b>Po:</b></td><td style="padding:8px 12px">' + escHtml(after.toString()) + '</td></tr>' : '') +
                (powod  ? '<tr style="background:#fef3c7"><td style="padding:8px 12px;color:#92400e"><b>Powód:</b></td><td style="padding:8px 12px;color:#78350f">' + escHtml(powod) + '</td></tr>' : '') +
              '</table>' +
            '</div>' +
          '</div>'
        });
      } catch(me) { Logger.log('audit email ERR: ' + me.message); }
    }
  } catch(e) {
    Logger.log('_writeAuditLog ERR: ' + e.message);
  }
}

// ── Helpery dostępu do aut ──
// Zwraca listę AKTYWNYCH nr rej dla danego przewoźnika (z arkusza AUTA)
function getActiveVehiclesForLogin(login) {
  if (!login) return [];
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
  if (!sa) return [];
  var data = sa.getDataRange().getValues();
  var result = [];
  var loginUp = login.toString().trim().toUpperCase();
  for (var i = 1; i < data.length; i++) {
    var rowLogin = (data[i][0] || '').toString().trim().toUpperCase();
    var rowNrRej = (data[i][1] || '').toString().trim().toUpperCase();
    var rowActive = (data[i][2] || '').toString().trim().toUpperCase();
    if (rowLogin === loginUp && rowNrRej && rowActive === 'TAK') {
      result.push(rowNrRej);
    }
  }
  return result;
}

// ── UTWÓRZ ARKUSZ PLANISTÓW ──
// Schemat 7 kolumn: Login | Haslo | Rola | Nazwa | Email | Lider email | Aktywny
// Planiści mają login+hasło i własny panel (identyczny flow jak pracownik/opiekun)
function ensurePlanisciSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  if (sheet) return;

  sheet = ss.insertSheet(CONFIG.SHEET_PLANISCI);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Lider (email)', 'Aktywny']];
  sheet.getRange(1, 1, 1, 7).setValues(headers);
  sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a237e').setFontColor('white');

  // Seed 8 planistów bez loginów (admin ustawia przez panel albo w arkuszu)
  sheet.getRange(2, 1, 8, 7).setValues([
    ['', '', 'planista', 'DAMIAN SALATA',      '', '', 'Tak'],
    ['', '', 'planista', 'BOGUSLAW GOLDYN',    '', '', 'Tak'],
    ['', '', 'planista', 'ANDREI HRETSKI',     '', '', 'Tak'],
    ['', '', 'planista', 'OSKAR PACHOLSKI',    '', '', 'Tak'],
    ['', '', 'planista', 'PAWEL GLINICKI',     '', '', 'Tak'],
    ['', '', 'planista', 'MARCIN TRUSZKOWSKI', '', '', 'Tak'],
    ['', '', 'planista', 'KAMIL KADROWSKI',    '', '', 'Tak'],
    ['', '', 'planista', 'KAMIL HUBNER',       '', '', 'Tak'],
  ]);
  sheet.getRange(2, 1, 8, 7).setBackground('#e8eaf6');
  sheet.autoResizeColumns(1, 7);
  sheet.setFrozenRows(1);
}

// ── UTWÓRZ ARKUSZ DYSPOZYTORÓW ──
// Schemat 6 kolumn: Login | Haslo | Rola | Nazwa | Email | Firma (empty)
function ensureDyspozytorSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_DYSPOZYTOR);
  if (sheet) return;

  sheet = ss.insertSheet(CONFIG.SHEET_DYSPOZYTOR);
  var headers = [['Login', 'Haslo', 'Rola', 'Nazwa', 'Email', 'Firma']];
  sheet.getRange(1, 1, 1, 6).setValues(headers);
  sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#006064').setFontColor('white');
  sheet.autoResizeColumns(1, 6);
  sheet.setFrozenRows(1);
}

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

// ── UTWÓRZ ARKUSZ DELEGACJE (wyjazdy zgłaszane przez przewoźników) ──
// Schemat 20 kolumn:
// A:Id B:NrRej C:NaczepaNrRej D:KierowcaLogin E:KierowcaImieNazw F:TelefonKierowcy
// G:DataWyjazdu (yyyy-MM-dd HH:mm)
// H:KrajWyjazdu I:KodPocztowyWyjazdu
// J:DataZjazduPlan K:KrajZjazdu L:KodPocztowyZjazdu
// M:Status (zgloszony/w_trasie/zjechal/anulowany)
// N:DataZjazduRzeczywista
// O:ZgloszonePrzez P:DataZgloszenia Q:ZweryfikowanePrzez R:DataWeryfikacji
// S:PrzewoznikLogin T:Uwagi
function ensureDelegacjeSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  if (ss.getSheetByName(CONFIG.SHEET_DELEGACJE)) return;
  var sheet = ss.insertSheet(CONFIG.SHEET_DELEGACJE);
  var headers = [[
    'Id','NrRej','NaczepaNrRej','KierowcaLogin','KierowcaImieNazw','TelefonKierowcy',
    'DataWyjazdu','KrajWyjazdu','KodPocztowyWyjazdu',
    'DataZjazduPlan','KrajZjazdu','KodPocztowyZjazdu',
    'Status','DataZjazduRzeczywista',
    'ZgloszonePrzez','DataZgloszenia','ZweryfikowanePrzez','DataWeryfikacji',
    'PrzewoznikLogin','Uwagi'
  ]];
  sheet.getRange(1, 1, 1, 20).setValues(headers);
  sheet.getRange(1, 1, 1, 20).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  var widths = [110, 110, 110, 130, 180, 130, 140, 60, 100, 110, 60, 100, 110, 140, 130, 140, 130, 140, 130, 200];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}

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

// ── OPIEKUNOWIE ──
function ensureOpiekunowieSheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (sheet) return;
  sheet = ss.insertSheet(CONFIG.SHEET_OPIEKUNOWIE);
  sheet.appendRow(['Imię i nazwisko', 'Email', 'Aktywny']);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 250);
  sheet.setColumnWidth(2, 250);
  sheet.setColumnWidth(3, 100);
  sheet.setFrozenRows(1);
}

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
// ── LIMITY KM ──
function ensureLimitySheet(ss) {
  if (!ss) ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY);
  if (sheet) return;
  sheet = ss.insertSheet(CONFIG.SHEET_LIMITY);
  // A=Rok, B=Sty km, C=Sty €, D=Lut km, E=Lut €, ... X=Gru km, Y=Gru €
  var months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  var headers = ['Rok'];
  for (var i = 0; i < 12; i++) {
    headers.push(months[i] + ' km');
    headers.push(months[i] + ' €');
  }
  sheet.appendRow(headers);
  sheet.appendRow([2025, 500,0.50, '','', 500,0.50, 540,0.50, 540,0.50, 540,0.50, 500,0.50, '','', 540,0.50, 540,0.50, 540,0.50, 540,0.50]);
  sheet.appendRow([2026, 500,0.50, '','', 500,0.50, 540,0.50, 540,0.50, 540,0.50, 500,0.50, '','', 540,0.50, '','', '','', '','']);
  sheet.getRange(1, 1, 1, 25).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 60);
  for (var c = 2; c <= 25; c++) sheet.setColumnWidth(c, c % 2 === 0 ? 75 : 55);
  // Kolorowanie kolumn € na jasny fiolet
  for (var c = 3; c <= 25; c += 2) {
    sheet.getRange(1, c, sheet.getMaxRows(), 1).setBackground('#f5f3ff');
  }
}

function getLimityKm() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY);
  if (!sheet) { ensureLimitySheet(); sheet = ss.getSheetByName(CONFIG.SHEET_LIMITY); }
  if (!sheet) return { km: {}, stawki: {} };
  var data = sheet.getDataRange().getValues();
  var km = {};
  var stawki = {};
  for (var i = 1; i < data.length; i++) {
    var rok = parseInt(data[i][0]) || 0;
    if (!rok) continue;
    km[rok] = {};
    stawki[rok] = {};
    for (var m = 1; m <= 12; m++) {
      // B,D,F,...,X = km (index: (m-1)*2+1)
      // C,E,G,...,Y = €  (index: (m-1)*2+2)
      var kmIdx = (m - 1) * 2 + 1;
      var rateIdx = (m - 1) * 2 + 2;

      var val = data[i][kmIdx];
      if (val === '' || val === null || val === undefined || val.toString().toLowerCase() === 'brak') {
        km[rok][m] = 0;
      } else {
        km[rok][m] = parseFloat(val) || 0;
      }

      var rateVal = data[i][rateIdx];
      if (rateVal === '' || rateVal === null || rateVal === undefined) {
        stawki[rok][m] = null;
      } else {
        stawki[rok][m] = parseFloat(rateVal) || 0;
      }
    }
  }
  return { km: km, stawki: stawki };
}

function getMonthLimit(limity, year, month) {
  if (limity[year] && limity[year][month] !== undefined) return limity[year][month];
  return CONFIG.KM_DZIENNIE; // fallback
}

function getMonthRate(stawki, year, month) {
  if (stawki[year] && stawki[year][month] !== null && stawki[year][month] !== undefined) return stawki[year][month];
  return CONFIG.STAWKA_EUR_ZA_KM; // fallback
}


// Per-month km calculation (backend)
function calcKmGwarantPerMonth(ds, de, hStart, hStop, limity, stawki) {
  if (!ds || !de || isNaN(ds.getTime()) || isNaN(de.getTime())) return { totalDays: 0, kmGwarant: 0, breakdown: [], stawka: CONFIG.STAWKA_EUR_ZA_KM };
  
  var banDays = getEUBanDaysGS(ds.getFullYear(), de.getFullYear());
  var monthData = {};
  var totalDays = 0;

  // Normalize to midnight to avoid time comparison issues
  var startDay = new Date(ds.getFullYear(), ds.getMonth(), ds.getDate());
  var endDay = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  var cur = new Date(startDay);
  
  while (cur <= endDay) {
    var dayOfWeek = cur.getDay();
    var dateKey = fmtDateKey(cur);
    var curY = cur.getFullYear(), curM = cur.getMonth(), curD = cur.getDate();
    var isFirst = (curY === startDay.getFullYear() && curM === startDay.getMonth() && curD === startDay.getDate());
    var isLast = (curY === endDay.getFullYear() && curM === endDay.getMonth() && curD === endDay.getDate());
    var isSingle = isFirst && isLast;
    
    var year = curY;
    var month = curM + 1;
    var monthKey = year + '-' + (month < 10 ? '0' : '') + month;
    
    if (!monthData[monthKey]) {
      monthData[monthKey] = {
        year: year,
        month: month,
        days: 0,
        limit: getMonthLimit(limity, year, month),
        rate: stawki ? getMonthRate(stawki, year, month) : CONFIG.STAWKA_EUR_ZA_KM
      };
    }
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !banDays[dateKey]) {
      var fraction = 1.0;
      if (isSingle) {
        if (hStart !== null && hStop !== null) fraction = Math.max(0, (hStop - hStart)) / 24;
        else if (hStart !== null) fraction = (24 - hStart) / 24;
        else if (hStop !== null) fraction = hStop / 24;
      } else if (isFirst) {
        if (hStart !== null) fraction = (24 - hStart) / 24;
      } else if (isLast) {
        if (hStop !== null) fraction = hStop / 24;
      }
      monthData[monthKey].days += fraction;
      totalDays += fraction;
    }
    cur.setDate(cur.getDate() + 1);
  }
  
  totalDays = Math.round(totalDays * 100) / 100;
  var kmGwarant = 0;
  var breakdown = [];
  var monthNames = ['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
  
  // Oblicz km per miesiac i wazona stawke
  var weightedRateSum = 0;
  
  Object.keys(monthData).sort().forEach(function(key) {
    var md = monthData[key];
    var days = Math.round(md.days * 100) / 100;
    var km = Math.round(days * md.limit);
    kmGwarant += km;
    weightedRateSum += km * md.rate;
    breakdown.push({
      monthName: monthNames[md.month] + ' ' + md.year,
      days: days,
      limit: md.limit,
      rate: md.rate,
      km: km
    });
  });
  
  // Wazona stawka: proporcjonalna do udzialu km kazdego miesiaca
  var stawka = kmGwarant > 0 ? (weightedRateSum / kmGwarant) : CONFIG.STAWKA_EUR_ZA_KM;
  stawka = Math.round(stawka * 1000) / 1000; // zaokraglij do 3 miejsc
  
  return { totalDays: totalDays, kmGwarant: kmGwarant, breakdown: breakdown, stawka: stawka };
}

// Admin = widzi wszystko, pełny dostęp do ustawień
// Pracownik = widzi wszystko, rozlicza wnioski, BEZ ustawień
// Przewoźnik = widzi TYLKO swoje wnioski, składa nowe
// ── POMOCNICZA: szuka w jednym arkuszu (bez hasła = tylko po loginie) ──
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

// ── Maskuje email: maksim.siankevich@magtrans.eu → ma***@magtrans.eu ──
function maskEmail(email) {
  if (!email) return '(brak emaila w bazie)';
  var parts = email.split('@');
  if (parts.length !== 2) return email;
  var name = parts[0];
  var masked = name.substring(0, Math.min(2, name.length)) + '***';
  return masked + '@' + parts[1];
}

// ── KROK 1: Sprawdź login+hasło, wyślij kod na email ──
function sendLoginCode(login, password) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var u, rola;
    u = findUserInSheet(ss, CONFIG.SHEET_ADMIN, login, password);
    if (u) rola = 'admin';
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_PRACOWNIK, login, password); if (u) rola = 'pracownik'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_OPIEKUN, login, password); if (u) rola = 'opiekun'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_PLANISCI, login, password); if (u) rola = 'planista'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_DYSPOZYTOR, login, password); if (u) rola = 'dyspozytor'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_EKSPORT, login, password); if (u) rola = 'eksport'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_WERYFIKATOR, login, password); if (u) rola = 'weryfikator'; }
    if (!u) { u = findUserInSheet(ss, CONFIG.SHEET_UZYTKOWNICY, login, password); if (u) rola = 'przewoznik'; }

    if (!u) return { error: 'Nieprawidłowy login lub hasło' };
    // Blokada dezaktywowanych kont przewoźników
    if (rola === 'przewoznik' && (u.aktywny || 'Tak').toString().toUpperCase() === 'NIE') {
      return { error: 'Konto zostało dezaktywowane. Skontaktuj się z opiekunem Magtrans.' };
    }
    if (!u.email) return { error: 'Brak adresu email w bazie dla tego konta. Skontaktuj się z administratorem.' };

    // Generuj 6-cyfrowy kod
    var code = Math.floor(100000 + Math.random() * 900000).toString();
    var cacheKey = 'loginCode_' + login.trim();

    // Zapisz kod w CacheService (ważny 10 minut = 600 sekund)
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify({ code: code, rola: rola, nazwa: u.nazwa, email: u.email, przewoznik: u.przewoznik, auta: u.auta || [] }), 600);

    // Wyślij email z kodem
    MailApp.sendEmail({
      to: u.email,
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">' +
        '<div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0">' +
          '<h2 style="color:#fff;margin:0;font-size:18px">🚛 MAGGuarantee</h2>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">' +
          '<p style="color:#334155;font-size:15px;margin:0 0 8px">Cześć, <b>' + u.nazwa + '</b></p>' +
          '<p style="color:#64748b;font-size:14px;margin:0 0 24px">Twój jednorazowy kod logowania:</p>' +
          '<div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px;margin-bottom:20px">' +
            code +
          '</div>' +
          '<p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">Kod ważny przez <b>10 minut</b>. Nie udostępniaj go nikomu.</p>' +
          '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">' +
          '<p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">Jeśli to nie Ty próbujesz się zalogować, zignoruj tę wiadomość.</p>' +
        '</div>' +
        '</div>'
    });

    Logger.log('Kod logowania wysłany do: ' + u.email + ' dla loginu: ' + login);
    return { step: 'code', emailHint: maskEmail(u.email) };

  } catch(e) {
    Logger.log('sendLoginCode ERR: ' + e.message);
    return { error: 'Błąd wysyłki kodu: ' + e.message };
  }
}

// ── KROK 2: Zweryfikuj kod, zwróć obiekt użytkownika ──
function verifyLoginCode(login, code) {
  try {
    if (!login || !code) return { error: 'Brak danych' };
    var cacheKey = 'loginCode_' + login.trim();
    var cache = CacheService.getScriptCache();
    var raw = cache.get(cacheKey);
    if (!raw) return { error: 'Kod wygasł lub jest nieprawidłowy. Spróbuj zalogować się ponownie.' };

    var data = JSON.parse(raw);
    if (data.code !== code.trim()) {
      // Zliczaj błędne próby (max 5, potem usuń kod)
      data.attempts = (data.attempts || 0) + 1;
      if (data.attempts >= 5) {
        cache.remove(cacheKey);
        return { error: 'Zbyt wiele błędnych prób. Zaloguj się ponownie.' };
      }
      cache.put(cacheKey, JSON.stringify(data), 600);
      return { error: 'Nieprawidłowy kod. Pozostało prób: ' + (5 - data.attempts) };
    }

    // Kod poprawny — usuń z cache i zwróć użytkownika
    cache.remove(cacheKey);

    // Dla przewoźnika — sprawdź czy konto nie zostało dezaktywowane między sendLoginCode
    // a verifyLoginCode (cache trwa 10 min). Przy okazji zapisz LastLogin.
    if (data.rola === 'przewoznik') {
      var deactivated = false;
      try {
        var ssLog = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
        var suLog = ssLog.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
        if (suLog) {
          var uData = suLog.getDataRange().getValues();
          var lTr = login.trim();
          for (var li = 1; li < uData.length; li++) {
            if ((uData[li][0] || '').toString().trim() === lTr) {
              // Recheck Aktywny (col H = index 7)
              var akt = (uData[li][7] || 'Tak').toString().trim().toUpperCase();
              if (akt === 'NIE') { deactivated = true; break; }
              // Update LastLogin (col I = pozycja 9)
              suLog.getRange(li + 1, 9).setValue(
                Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss')
              );
              break;
            }
          }
        }
      } catch(ll) { Logger.log('verifyLoginCode recheck/LastLogin ERR: ' + ll.message); }
      if (deactivated) {
        return { error: 'Konto zostało dezaktywowane. Skontaktuj się z opiekunem Magtrans.' };
      }
    }

    return {
      login: login.trim(),
      rola: data.rola,
      nazwa: data.nazwa,
      email: data.email,
      przewoznik: data.przewoznik || '',
      auta: data.auta || []
    };
  } catch(e) {
    Logger.log('verifyLoginCode ERR: ' + e.message);
    return { error: 'Błąd weryfikacji' };
  }
}

// ── Ponowne wysłanie kodu (tylko jeśli istnieje sesja w cache) ──
function resendLoginCode(login) {
  try {
    var cacheKey = 'loginCode_' + login.trim();
    var cache = CacheService.getScriptCache();
    var raw = cache.get(cacheKey);
    if (!raw) return { ok: false, error: 'Sesja wygasła' };
    var data = JSON.parse(raw);

    var code = Math.floor(100000 + Math.random() * 900000).toString();
    data.code = code;
    data.attempts = 0;
    cache.put(cacheKey, JSON.stringify(data), 600);

    MailApp.sendEmail({
      to: data.email,
      subject: 'Nowy kod weryfikacyjny — MAGGuarantee',
      htmlBody:
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">' +
        '<div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0">' +
          '<h2 style="color:#fff;margin:0">🚛 Nowy kod weryfikacyjny</h2>' +
        '</div>' +
        '<div style="background:#f8fafc;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0">' +
          '<div style="background:#1e40af;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;padding:20px;border-radius:10px">' +
            code +
          '</div>' +
          '<p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px">Kod ważny przez 10 minut.</p>' +
        '</div>' +
        '</div>'
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
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
// Szuka loginu we wszystkich trzech arkuszach, zwraca obiekt z rolą
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

// Helper: wymaga roli admin; zwraca user jeśli admin, null w przeciwnym razie
function requireAdmin(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'admin') return null;
  return u;
}

// Sprawdza czy caller jest pracownikiem/adminem
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

// =================================================================
// ═══════════  PANEL ADMINA: ZARZĄDZANIE PRZEWOŹNIKAMI + AUTA  ═════
// =================================================================
// Wszystkie funkcje wymagają rola='admin'; sprawdza requireAdmin().

// Generator losowego hasła (10 znaków: małe/duże litery + cyfry, bez mylących 0/O/l/1)
function _generateRandomPassword() {
  var chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var result = '';
  for (var i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Walidacja emaila (prosty regex)
function _isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toString().trim());
}

// Walidacja loginu (3-20 znaków, lowercase alnum + _ -)
function _isValidLogin(login) {
  if (!login) return false;
  return /^[a-z0-9_\-]{3,20}$/.test(login.toString().trim());
}

// Walidacja nr rej. (3-10 znaków, tylko A-Z0-9, bez spacji)
function _isValidVehicleNr(nrRej) {
  if (!nrRej) return false;
  return /^[A-Z0-9]{3,10}$/.test(nrRej.toString().trim().toUpperCase());
}

// ── Lista przewoźników (admin) ──
// ── HELPERY: rozszerzone pola przewoźnika (kolumny L-V) ──
// Buduje 11-elementową tablicę dla cols L:OsobaKontaktowa..V:AdresFirmy
function _carrierExtFromData(data) {
  return [
    (data.osobaKontaktowa || '').toString().trim(),
    (data.telefon || '').toString().trim(),
    (data.emailZlecenia || '').toString().trim(),
    (data.terminPlatnosci || '').toString().trim(),
    (data.kontoEUR || '').toString().trim().replace(/\s+/g, ''),
    (data.kontoPLN || '').toString().trim().replace(/\s+/g, ''),
    (data.ubezpWartosc !== undefined && data.ubezpWartosc !== null && data.ubezpWartosc !== '') ? parseFloat(data.ubezpWartosc) : '',
    (data.ubezpWaznosc || '').toString().trim(),
    (data.licencjaWaznosc || '').toString().trim(),
    (data.liczbaWypisow !== undefined && data.liczbaWypisow !== null && data.liczbaWypisow !== '') ? parseInt(data.liczbaWypisow) : '',
    (data.adresFirmy || '').toString().trim()
  ];
}

// Parsuje wiersz UZYTKOWNICY (tablica) na obiekt z wszystkimi polami
function _parseCarrierRow(row, wiersz) {
  return {
    wiersz: wiersz,
    login: (row[0] || '').toString().trim(),
    nazwa: (row[3] || '').toString().trim(),
    email: (row[4] || '').toString().trim(),
    firma: (row[5] || '').toString().trim(),
    nip: (row[6] || '').toString().trim(),
    aktywny: ((row[7] || 'Tak').toString().trim() || 'Tak'),
    lastLogin: (row[8] || '').toString().trim(),
    dataUtworzenia: (row[9] || '').toString().trim(),
    opiekunLogin: (row[10] || '').toString().trim(),
    osobaKontaktowa: (row[11] || '').toString().trim(),
    telefon: (row[12] || '').toString().trim(),
    emailZlecenia: (row[13] || '').toString().trim(),
    terminPlatnosci: (row[14] || '').toString().trim(),
    kontoEUR: (row[15] || '').toString().trim(),
    kontoPLN: (row[16] || '').toString().trim(),
    ubezpWartosc: (row[17] !== undefined && row[17] !== null && row[17] !== '') ? row[17] : '',
    ubezpWaznosc: (row[18] || '').toString().trim(),
    licencjaWaznosc: (row[19] || '').toString().trim(),
    liczbaWypisow: (row[20] !== undefined && row[20] !== null && row[20] !== '') ? row[20] : '',
    adresFirmy: (row[21] || '').toString().trim()
  };
}

function getCarriersList(callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień (wymaga admin)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var data = su.getDataRange().getValues();

    // Single-pass: zbuduj mapę login → {active, total} jednym odczytem AUTA
    var vcMap = {};
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var k = 1; k < aData.length; k++) {
        var kLogin = (aData[k][0] || '').toString().trim().toLowerCase();
        if (!kLogin) continue;
        if (!vcMap[kLogin]) vcMap[kLogin] = { active: 0, total: 0 };
        vcMap[kLogin].total++;
        if ((aData[k][2] || '').toString().trim().toUpperCase() === 'TAK') vcMap[kLogin].active++;
      }
    }

    var list = [];
    for (var i = 1; i < data.length; i++) {
      var login = (data[i][0] || '').toString().trim();
      if (!login) continue;
      var vc = vcMap[login.toLowerCase()] || { active: 0, total: 0 };
      var c = _parseCarrierRow(data[i], i + 1);
      c.liczbaAut = vc.active;
      c.liczbaAutTotal = vc.total;
      list.push(c);
    }
    return { ok: true, carriers: list };
  } catch(e) {
    Logger.log('getCarriersList ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Dodaj przewoźnika (admin) ──
function addCarrier(data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień (wymaga admin)' };
    if (!data) return { error: 'Brak danych' };

    var login = (data.login || '').toString().trim().toLowerCase();
    var nazwa = (data.nazwa || '').toString().trim();
    var email = (data.email || '').toString().trim();
    var firma = (data.firma || '').toString().trim();
    var nip = (data.nip || '').toString().trim();
    var hasloRaw = (data.haslo || '').toString().trim();
    var firstVehicle = (data.firstVehicle || '').toString().trim().toUpperCase().replace(/\s+/g,'');

    // Walidacje
    if (!_isValidLogin(login)) return { error: 'Login musi być 3-20 znaków (małe litery, cyfry, _ lub -)' };
    if (!nazwa) return { error: 'Nazwa przewoźnika wymagana' };
    if (!_isValidEmail(email)) return { error: 'Nieprawidłowy adres email' };
    if (!firma) return { error: 'Nazwa firmy wymagana' };
    if (!nip || nip.length < 10) return { error: 'NIP musi mieć minimum 10 znaków (z prefiksem kraju, np. PL1234567890)' };
    if (hasloRaw && hasloRaw.length < 8) return { error: 'Hasło musi mieć minimum 8 znaków (lub pozostaw puste — wygenerujemy)' };
    if (firstVehicle && !_isValidVehicleNr(firstVehicle)) return { error: 'Nr rejestracyjny musi być 3-10 znaków (A-Z, 0-9, bez spacji)' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };

    // Sprawdź unique login (we wszystkich arkuszach auth)
    var loginSheets = [CONFIG.SHEET_ADMIN, CONFIG.SHEET_PRACOWNIK, CONFIG.SHEET_OPIEKUN,
                       CONFIG.SHEET_PLANISCI, CONFIG.SHEET_DYSPOZYTOR,
                       CONFIG.SHEET_EKSPORT, CONFIG.SHEET_WERYFIKATOR,
                       CONFIG.SHEET_UZYTKOWNICY];
    for (var si = 0; si < loginSheets.length; si++) {
      var sh = ss.getSheetByName(loginSheets[si]);
      if (!sh) continue;
      var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues();
      for (var vi = 0; vi < vals.length; vi++) {
        if ((vals[vi][0] || '').toString().trim().toLowerCase() === login) {
          return { error: 'Login "' + login + '" już istnieje (arkusz: ' + loginSheets[si] + ')' };
        }
      }
    }

    // Sprawdź unique email w UZYTKOWNICY
    var uData = su.getDataRange().getValues();
    for (var ui = 1; ui < uData.length; ui++) {
      if ((uData[ui][4] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
        return { error: 'Email "' + email + '" jest już używany przez innego przewoźnika' };
      }
    }

    // Generuj hasło jeśli brak
    var haslo = hasloRaw || _generateRandomPassword();
    var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    var opiekunLogin = (data.opiekunLogin || '').toString().trim().toLowerCase();

    // Zapisz nowy wiersz: A..K (11 kolumn)
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty, spróbuj ponownie' }; }
    try {
      su.appendRow([login, haslo, 'przewoznik', nazwa, email, firma, nip, 'Tak', '', today, opiekunLogin]);
      var newRow = su.getLastRow();
      // Zapisz extended fields L-V
      su.getRange(newRow, 12, 1, 11).setValues([_carrierExtFromData(data)]);
      // Dodaj pierwszy pojazd jeśli podany
      if (firstVehicle) {
        var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
        if (!sa) { ensureAutaSheet(ss); sa = ss.getSheetByName(CONFIG.SHEET_AUTA); }
        sa.appendRow([login, firstVehicle, 'Tak', today, '', callerLogin]);
      }
    } finally { try { lock.releaseLock(); } catch(le){} }

    // Email powitalny
    try { sendAccountCreatedEmail({nazwa: nazwa, email: email, login: login, firma: firma}, haslo); }
    catch(me) { Logger.log('addCarrier mail ERR: ' + me.message); }

    return { ok: true, login: login, hasloGenerated: !hasloRaw, haslo: haslo };
  } catch(e) {
    Logger.log('addCarrier ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Edytuj przewoźnika (admin) ──
function updateCarrier(login, data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!login || !data) return { error: 'Brak danych' };

    var loginLc = login.toString().trim().toLowerCase();
    var nazwa = (data.nazwa || '').toString().trim();
    var email = (data.email || '').toString().trim();
    var firma = (data.firma || '').toString().trim();
    var nip = (data.nip || '').toString().trim();

    if (!nazwa) return { error: 'Nazwa wymagana' };
    if (!_isValidEmail(email)) return { error: 'Nieprawidłowy email' };
    if (!firma) return { error: 'Firma wymagana' };
    if (!nip || nip.length < 10) return { error: 'NIP min 10 znaków' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var uData = su.getDataRange().getValues();

    // Znajdź przewoźnika
    var targetRow = -1;
    for (var i = 1; i < uData.length; i++) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { error: 'Przewoźnik nie istnieje' };

    // Sprawdź unique email (wyłączając self)
    for (var j = 1; j < uData.length; j++) {
      if ((j + 1) === targetRow) continue;
      if ((uData[j][4] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
        return { error: 'Email "' + email + '" jest używany przez innego przewoźnika' };
      }
    }

    // Zapisz D-G (Nazwa, Email, Firma, NIP)
    su.getRange(targetRow, 4, 1, 4).setValues([[nazwa, email, firma, nip]]);
    // Zapisz K (OpiekunLogin) jeśli podano (pusty string = wyczyść opiekuna)
    if (data.opiekunLogin !== undefined) {
      su.getRange(targetRow, 11).setValue((data.opiekunLogin || '').toString().trim().toLowerCase());
    }
    // Zapisz extended fields L-V (jeśli którekolwiek pole rozszerzone obecne)
    var hasExt = ['osobaKontaktowa','telefon','emailZlecenia','terminPlatnosci','kontoEUR','kontoPLN',
                  'ubezpWartosc','ubezpWaznosc','licencjaWaznosc','liczbaWypisow','adresFirmy']
                  .some(function(k) { return data[k] !== undefined; });
    if (hasExt) {
      // Merge z aktualnymi wartościami żeby nie nadpisać tym co nie jest w data
      var current = uData[targetRow - 1];
      var mergedData = {
        osobaKontaktowa: data.osobaKontaktowa !== undefined ? data.osobaKontaktowa : current[11],
        telefon:         data.telefon         !== undefined ? data.telefon         : current[12],
        emailZlecenia:   data.emailZlecenia   !== undefined ? data.emailZlecenia   : current[13],
        terminPlatnosci: data.terminPlatnosci !== undefined ? data.terminPlatnosci : current[14],
        kontoEUR:        data.kontoEUR        !== undefined ? data.kontoEUR        : current[15],
        kontoPLN:        data.kontoPLN        !== undefined ? data.kontoPLN        : current[16],
        ubezpWartosc:    data.ubezpWartosc    !== undefined ? data.ubezpWartosc    : current[17],
        ubezpWaznosc:    data.ubezpWaznosc    !== undefined ? data.ubezpWaznosc    : current[18],
        licencjaWaznosc: data.licencjaWaznosc !== undefined ? data.licencjaWaznosc : current[19],
        liczbaWypisow:   data.liczbaWypisow   !== undefined ? data.liczbaWypisow   : current[20],
        adresFirmy:      data.adresFirmy      !== undefined ? data.adresFirmy      : current[21]
      };
      su.getRange(targetRow, 12, 1, 11).setValues([_carrierExtFromData(mergedData)]);
    }
    return { ok: true };
  } catch(e) {
    Logger.log('updateCarrier ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Toggle aktywacji (admin) ──
function toggleCarrierActive(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var uData = su.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    for (var i = 1; i < uData.length; i++) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        var current = (uData[i][7] || 'Tak').toString().trim().toUpperCase();
        var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
        su.getRange(i + 1, 8).setValue(newVal);
        // Wyślij email
        try {
          var carrier = { nazwa: uData[i][3], email: uData[i][4], login: uData[i][0], firma: uData[i][5] };
          if (newVal === 'Nie') sendAccountDeactivatedEmail(carrier);
          else sendAccountReactivatedEmail(carrier);
        } catch(me) { Logger.log('toggleCarrierActive mail ERR: ' + me.message); }
        return { ok: true, aktywny: newVal };
      }
    }
    return { error: 'Przewoźnik nie istnieje' };
  } catch(e) {
    Logger.log('toggleCarrierActive ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Hard delete (admin) ──
function deleteCarrierHard(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var loginLc = login.toString().trim().toLowerCase();

    // Usuń wiersz z UZYTKOWNICY
    var uData = su.getDataRange().getValues();
    var deletedRow = -1;
    for (var i = uData.length - 1; i >= 1; i--) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        su.deleteRow(i + 1);
        deletedRow = i + 1;
        break;
      }
    }
    if (deletedRow < 0) return { error: 'Przewoźnik nie istnieje' };

    // Usuń wszystkie auta tego przewoźnika z AUTA
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var j = aData.length - 1; j >= 1; j--) {
        if ((aData[j][0] || '').toString().trim().toLowerCase() === loginLc) {
          sa.deleteRow(j + 1);
        }
      }
    }
    return { ok: true };
  } catch(e) {
    Logger.log('deleteCarrierHard ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Reset hasła (admin) ──
function resetCarrierPassword(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var uData = su.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    for (var i = 1; i < uData.length; i++) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        var newHaslo = _generateRandomPassword();
        su.getRange(i + 1, 2).setValue(newHaslo);
        try {
          var carrier = { nazwa: uData[i][3], email: uData[i][4], login: uData[i][0], firma: uData[i][5] };
          sendPasswordResetEmail(carrier, newHaslo);
        } catch(me) { Logger.log('resetCarrierPassword mail ERR: ' + me.message); }
        return { ok: true };
      }
    }
    return { error: 'Przewoźnik nie istnieje' };
  } catch(e) {
    Logger.log('resetCarrierPassword ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Pojazdy: lista (admin) ──
function getVehiclesForCarrier(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) { ensureAutaSheet(ss); return { ok: true, vehicles: [] }; }
    var data = sa.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() !== loginLc) continue;
      list.push({
        wiersz: i + 1,
        nrRej: (data[i][1] || '').toString().trim(),
        aktywne: ((data[i][2] || 'Tak').toString().trim() || 'Tak'),
        dataDodania: (data[i][3] || '').toString().trim(),
        dataDezaktywacji: (data[i][4] || '').toString().trim(),
        utworzonePrzez: (data[i][5] || '').toString().trim()
      });
    }
    return { ok: true, vehicles: list };
  } catch(e) {
    Logger.log('getVehiclesForCarrier ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Pojazdy: dodaj (admin) ──
// P4: LockService — check duplikatu + append wewnątrz locka, żeby uniknąć race
function addVehicle(login, nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!login) return { error: 'Brak loginu przewoźnika' };
    var nrRejClean = (nrRej || '').toString().trim().toUpperCase().replace(/\s+/g, '');
    if (!_isValidVehicleNr(nrRejClean)) return { error: 'Nr rejestracyjny musi być 3-10 znaków (A-Z, 0-9, bez spacji)' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) { ensureAutaSheet(ss); sa = ss.getSheetByName(CONFIG.SHEET_AUTA); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty, spróbuj ponownie' }; }
    try {
      // Unique per przewoźnik — sprawdzamy wewnątrz locka
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      for (var i = 1; i < data.length; i++) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejClean) {
          return { error: 'Pojazd "' + nrRejClean + '" już istnieje dla tego przewoźnika' };
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      sa.appendRow([login, nrRejClean, 'Tak', today, '', callerLogin]);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true };
  } catch(e) {
    Logger.log('addVehicle ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Pojazdy: toggle aktywne (admin) ──
// P4: LockService — znalezienie wiersza + setValue wewnątrz locka
function toggleVehicleActive(login, nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty, spróbuj ponownie' }; }
    try {
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < data.length; i++) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          var current = (data[i][2] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sa.getRange(i + 1, 3).setValue(newVal);
          // DataDezaktywacji (kol E) — ustaw przy blokadzie, wyczyść przy odblokowaniu
          if (newVal === 'Nie') {
            sa.getRange(i + 1, 5).setValue(Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss'));
          } else {
            sa.getRange(i + 1, 5).setValue('');
          }
          return { ok: true, aktywne: newVal };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('toggleVehicleActive ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Pojazdy: usuń (admin) ──
// P4: LockService — znalezienie + deleteRow wewnątrz locka
function removeVehicle(login, nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty, spróbuj ponownie' }; }
    try {
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = data.length - 1; i >= 1; i--) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          sa.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('removeVehicle ERR: ' + e.message);
    return { error: e.message };
  }
}

// Helper: rozpakuj pełny wiersz AUTA do obiektu (używane przez wszystkie get-funkcje)
// row = pełna tablica wiersza z arkusza AUTA (28 kolumn)
function _parseAutoRow(row, wiersz) {
  var adr = (row[14] || '').toString().trim();
  var odpadyKraje = (row[29] || '').toString().trim();
  return {
    wiersz: wiersz,
    przewoznikLogin: (row[0] || '').toString().trim(),
    nrRej:           (row[1] || '').toString().trim(),
    aktywne:         ((row[2] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[3] || '').toString().trim(),
    dataDezaktywacji:(row[4] || '').toString().trim(),
    utworzonePrzez:  (row[5] || '').toString().trim(),
    planista:        (row[6] || '').toString().trim(),
    // (col H=7 Wyposazenie — legacy, pomijamy)
    marka:           (row[8] || '').toString().trim(),
    model:           (row[9] || '').toString().trim(),
    rok:             (row[10] || '').toString().trim(),
    uwagi:           (row[11] || '').toString().trim(),
    certyfikatL:     (row[12] || '').toString().trim(),
    euro:            (row[13] || '').toString().trim(),
    adr:             adr ? adr.split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
    gps:             (row[15] || '').toString().trim(),
    kartaPaliwowa:   (row[16] || '').toString().trim(),
    typ:             (row[17] || '').toString().trim(),
    dyspozytor:      (row[18] || '').toString().trim(),
    gb:              (row[19] || '').toString().trim(),
    it:              (row[20] || '').toString().trim(),
    fr:              (row[21] || '').toString().trim(),
    porozumienie:    (row[22] || '').toString().trim(),
    umowa:           (row[23] || '').toString().trim(),
    stawkaDE:        (row[24] !== undefined && row[24] !== null && row[24] !== '') ? row[24] : '',
    stawkaUE:        (row[25] !== undefined && row[25] !== null && row[25] !== '') ? row[25] : '',
    stawkaEksport:   (row[26] !== undefined && row[26] !== null && row[26] !== '') ? row[26] : '',
    stawkaImport:    (row[27] !== undefined && row[27] !== null && row[27] !== '') ? row[27] : '',
    odpady:          (row[28] || '').toString().trim(),
    odpadyKraje:     odpadyKraje ? odpadyKraje.split(',').map(function(s){return s.trim();}).filter(Boolean) : [],
    kabotazDE:       (row[30] || '').toString().trim(),
    kabotazFR:       (row[31] || '').toString().trim(),
    gpsMobNr:        (row[32] || '').toString().trim(),
    nastepnyPrzeglad:(row[33] || '').toString().trim(),
    nrBoczny:        (row[34] || '').toString().trim(),
    ostatnioJezdzilo:(function(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'yyyy-MM-dd');
        var s = v.toString().trim();
        // Jeśli już ISO format yyyy-MM-dd, zostaw
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
        var d2 = new Date(s);
        return isNaN(d2.getTime()) ? s : Utilities.formatDate(d2, 'Europe/Warsaw', 'yyyy-MM-dd');
      } catch(e) { return v.toString(); }
    })(row[35])
  };
}

// ── AUTA: lista wszystkich aut (admin only) ──
// Single-pass read — 1 query do AUTA, 0 kolejnych wywołań (per P1 pattern)
function getAllVehiclesForAdmin(callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień (wymaga admin)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) { ensureAutaSheet(ss); return { ok: true, vehicles: [] }; }
    var data = sa.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var login = (data[i][0] || '').toString().trim();
      var nrRej = (data[i][1] || '').toString().trim();
      if (!login || !nrRej) continue;
      list.push(_parseAutoRow(data[i], i + 1));
    }
    return { ok: true, vehicles: list };
  } catch(e) {
    Logger.log('getAllVehiclesForAdmin ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── AUTA: szczegóły + edycja (cols G-L) ──
function updateVehicleDetails(login, nrRej, data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!login || !nrRej || !data) return { error: 'Brak danych' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var aData = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < aData.length; i++) {
        if ((aData[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (aData[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          // Walidacja pól
          var planista       = (data.planista    || '').toString().trim();
          var marka          = (data.marka       || '').toString().trim();
          var model          = (data.model       || '').toString().trim();
          var rok            = (data.rok !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : '';
          var uwagi          = (data.uwagi       || '').toString().trim();
          var certyfikatL    = (data.certyfikatL || '').toString().trim();
          var euro           = (data.euro        || '').toString().trim();
          var adr            = Array.isArray(data.adr) ? data.adr.join(',') : (data.adr || '').toString().trim();
          var gps            = (data.gps            || '').toString().trim(); // 'Tak' | 'Nie' | ''
          var kartaPaliwowa  = (data.kartaPaliwowa  || '').toString().trim();
          var typ            = (data.typ            || '').toString().trim();
          var dyspozytor     = (data.dyspozytor     || '').toString().trim().toLowerCase();
          var gb             = (data.gb             || '').toString().trim();
          var it             = (data.it             || '').toString().trim();
          var fr             = (data.fr             || '').toString().trim();
          var porozumienie   = (data.porozumienie   || '').toString().trim();
          var umowa          = (data.umowa          || '').toString().trim();
          var stawkaDE       = (data.stawkaDE !== undefined && data.stawkaDE !== null && data.stawkaDE !== '') ? parseFloat(data.stawkaDE) : '';
          var stawkaUE       = (data.stawkaUE !== undefined && data.stawkaUE !== null && data.stawkaUE !== '') ? parseFloat(data.stawkaUE) : '';
          var stawkaEksport  = (data.stawkaEksport !== undefined && data.stawkaEksport !== null && data.stawkaEksport !== '') ? parseFloat(data.stawkaEksport) : '';
          var stawkaImport   = (data.stawkaImport !== undefined && data.stawkaImport !== null && data.stawkaImport !== '') ? parseFloat(data.stawkaImport) : '';
          // Odpady (A-schild) — Tak/Nie + lista krajów (CSV). Jeśli Nie → kraje wymuszamy puste.
          var odpady         = (data.odpady || '').toString().trim();
          var odpadyKrajeArr = Array.isArray(data.odpadyKraje) ? data.odpadyKraje : [];
          var odpadyKraje    = (odpady === 'Tak') ? odpadyKrajeArr.join(',') : '';
          // ADR — jeśli adrEnabled = 'Nie' → wymuś pustą listę
          var adrEnabled     = (data.adrEnabled || '').toString().trim();
          if (adrEnabled === 'Nie') adr = '';
          // Walidacja wartości enum
          if (certyfikatL && CONFIG.CERTYFIKAT_L_VALUES.indexOf(certyfikatL) < 0) return { error: 'Nieprawidłowa wartość CertyfikatL: ' + certyfikatL };
          if (euro && CONFIG.EURO_VALUES.indexOf(euro) < 0) return { error: 'Nieprawidłowa wartość EURO: ' + euro };
          if (gps && gps !== 'Tak' && gps !== 'Nie') return { error: 'GPS: tylko Tak / Nie' };
          if (kartaPaliwowa && kartaPaliwowa !== 'Tak' && kartaPaliwowa !== 'Nie') return { error: 'Karta paliwowa: tylko Tak / Nie' };
          if (typ && CONFIG.TYPY_AUT.indexOf(typ) < 0) return { error: 'Typ auta: tylko ' + CONFIG.TYPY_AUT.join('/') };
          if (odpady && odpady !== 'Tak' && odpady !== 'Nie') return { error: 'Odpady (A-schild): tylko Tak / Nie' };
          // Walidacja krajów Odpady (gdy Tak) — każdy kod musi być na liście
          if (odpady === 'Tak' && odpadyKrajeArr.length) {
            var validOdpKraje = CONFIG.ODPADY_KRAJE.map(function(k){ return k.id; });
            for (var ok = 0; ok < odpadyKrajeArr.length; ok++) {
              if (validOdpKraje.indexOf(odpadyKrajeArr[ok]) < 0) return { error: 'Nieprawidłowy kraj Odpady: ' + odpadyKrajeArr[ok] };
            }
          }
          ['gb','it','fr','porozumienie','umowa'].forEach(function(_) {}); // placeholder walidacji
          var flagChecks = { gb: gb, it: it, fr: fr, porozumienie: porozumienie, umowa: umowa };
          for (var fk in flagChecks) {
            var fv = flagChecks[fk];
            if (fv && fv !== 'Tak' && fv !== 'Nie') return { error: fk.toUpperCase() + ': tylko Tak / Nie' };
          }
          // Kabotaż + GPS MOB Nr + Następny przegląd + NrBoczny + OstatnioJezdzilo (cols AE-AJ = 31-36)
          var kabotazDE = (data.kabotazDE || '').toString().trim();
          var kabotazFR = (data.kabotazFR || '').toString().trim();
          var gpsMobNr  = (gps === 'Tak') ? (data.gpsMobNr || '').toString().trim() : '';
          var nastepnyPrzeglad = (data.nastepnyPrzeglad || '').toString().trim();
          var nrBoczny = (data.nrBoczny || '').toString().trim();
          var ostatnioJezdzilo = (data.ostatnioJezdzilo || '').toString().trim();
          if (kabotazDE && kabotazDE !== 'Tak' && kabotazDE !== 'Nie') return { error: 'KabotazDE: tylko Tak / Nie' };
          if (kabotazFR && kabotazFR !== 'Tak' && kabotazFR !== 'Nie') return { error: 'KabotazFR: tylko Tak / Nie' };
          // Wyposazenie (col H) — wyczyszczone; zastąpione flagami GPS + KartaPaliwowa
          // cols G-L (7-12) + M-O (13-15) + P-Q (16-17) + R-X (18-24) + Y-AB (25-28) + AC-AD (29-30) + AE-AJ (31-36)
          sa.getRange(i + 1, 7, 1, 6).setValues([[planista, '', marka, model, rok, uwagi]]);
          sa.getRange(i + 1, 13, 1, 3).setValues([[certyfikatL, euro, adr]]);
          sa.getRange(i + 1, 16, 1, 2).setValues([[gps, kartaPaliwowa]]);
          sa.getRange(i + 1, 18, 1, 7).setValues([[typ, dyspozytor, gb, it, fr, porozumienie, umowa]]);
          sa.getRange(i + 1, 25, 1, 4).setValues([[stawkaDE, stawkaUE, stawkaEksport, stawkaImport]]);
          sa.getRange(i + 1, 29, 1, 2).setValues([[odpady, odpadyKraje]]);
          sa.getRange(i + 1, 31, 1, 6).setValues([[kabotazDE, kabotazFR, gpsMobNr, nastepnyPrzeglad, nrBoczny, ostatnioJezdzilo]]);
          return { ok: true };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('updateVehicleDetails ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── AUTA: pełne dane jednego pojazdu (szczegóły + cols G-L) ──
function getVehicleDetails(login, nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };
    var data = sa.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    var nrRejUp = nrRej.toString().trim().toUpperCase();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
          (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
        return { ok: true, vehicle: _parseAutoRow(data[i], i + 1) };
      }
    }
    return { error: 'Pojazd nie istnieje' };
  } catch(e) {
    Logger.log('getVehicleDetails ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  KIEROWCY (admin CRUD)  ══════════════════════════════
// =================================================================

// Walidacja loginu kierowcy (3-30 znaków, lowercase alnum + _- .)
function _isValidDriverLogin(login) {
  if (!login) return false;
  return /^[a-z0-9_\-\.]{3,30}$/.test(login.toString().trim());
}

// Auto-generuj login kierowcy z imienia+nazwiska (np. "Jan Kowalski" → "j.kowalski")
// Konflikt? Dodaje sufiks -2, -3, itd.
function _generateDriverLogin(imie, nazwisko, kierowcySheet) {
  // Polish chars → ASCII
  function deAccent(s) {
    return s.toLowerCase()
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
      .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
      .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/[^a-z0-9]/g, '');
  }
  var first = deAccent(imie || '').substring(0, 1);
  var last  = deAccent(nazwisko || '').substring(0, 25);
  if (!first && !last) return 'kierowca-' + Date.now().toString(36);
  var base = (first ? (first + '.') : '') + last;
  if (base.length < 3) base = base + 'xx'; // zabezpieczenie minimalnej długości
  if (base.length > 30) base = base.substring(0, 30);

  // Pobierz wszystkie istniejące loginy
  var existing = {};
  if (kierowcySheet) {
    var data = kierowcySheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var l = (data[i][0] || '').toString().trim().toLowerCase();
      if (l) existing[l] = true;
    }
  }
  if (!existing[base]) return base;
  // Konflikt — dodawaj sufiks -2, -3...
  for (var n = 2; n <= 999; n++) {
    var candidate = base + '-' + n;
    if (candidate.length > 30) candidate = base.substring(0, 30 - String(n).length - 1) + '-' + n;
    if (!existing[candidate]) return candidate;
  }
  return base + '-' + Date.now().toString(36); // fallback
}

function getDriversList(callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień (wymaga admin)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) { ensureKierowcySheet(ss); return { ok: true, drivers: [] }; }
    var data = sk.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var login = (data[i][0] || '').toString().trim();
      if (!login) continue;
      list.push({
        wiersz: i + 1,
        login:           login,
        imie:            (data[i][1] || '').toString().trim(),
        nazwisko:        (data[i][2] || '').toString().trim(),
        przewoznikLogin: (data[i][3] || '').toString().trim(),
        telefon:         (data[i][4] || '').toString().trim(),
        email:           (data[i][5] || '').toString().trim(),
        nrPrawaJazdy:    (data[i][6] || '').toString().trim(),
        aktywny:         ((data[i][7] || 'Tak').toString().trim() || 'Tak'),
        dataDodania:     (data[i][8] || '').toString().trim(),
        utworzonePrzez:  (data[i][9] || '').toString().trim()
      });
    }
    return { ok: true, drivers: list };
  } catch(e) {
    Logger.log('getDriversList ERR: ' + e.message);
    return { error: e.message };
  }
}

// Helper: parsuj wiersz KIEROWCY na obiekt (cols A-M = 1..13)
function _parseDriverRow(row, wiersz) {
  return {
    wiersz: wiersz,
    login:           (row[0] || '').toString().trim(),
    imie:            (row[1] || '').toString().trim(),
    nazwisko:        (row[2] || '').toString().trim(),
    przewoznikLogin: (row[3] || '').toString().trim(),
    telefonFirmowy:  (row[4] || '').toString().trim(),
    email:           (row[5] || '').toString().trim(),
    nrPrawaJazdy:    (row[6] || '').toString().trim(),
    aktywny:         ((row[7] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[8] || '').toString().trim(),
    utworzonePrzez:  (row[9] || '').toString().trim(),
    telefonPrywatny: (row[10] || '').toString().trim(),
    prawoJazdyWaznosc: (row[11] || '').toString().trim(),
    kontoAmazon:     (row[12] || '').toString().trim()
  };
}

// Pobierz pełne dane jednego kierowcy
function getDriverDetails(login, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (caller.rola !== 'admin' && caller.rola !== 'opiekun') return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };
    var data = sk.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        var d = _parseDriverRow(data[i], i + 1);
        if (caller.rola === 'opiekun' && !_opiekunOwnsCarrier(caller.login, d.przewoznikLogin)) {
          return { error: 'Brak uprawnień do tego kierowcy' };
        }
        return { ok: true, driver: d };
      }
    }
    return { error: 'Kierowca nie istnieje' };
  } catch(e) {
    Logger.log('getDriverDetails ERR: ' + e.message);
    return { error: e.message };
  }
}

function addDriver(data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!data) return { error: 'Brak danych' };
    var login           = (data.login || '').toString().trim().toLowerCase();
    var imie            = (data.imie || '').toString().trim();
    var nazwisko        = (data.nazwisko || '').toString().trim();
    var przewoznikLogin = (data.przewoznikLogin || '').toString().trim().toLowerCase();
    var telefon         = (data.telefon || data.telefonFirmowy || '').toString().trim();
    var email           = (data.email || '').toString().trim();
    var nrPrawa         = (data.nrPrawaJazdy || '').toString().trim();
    var telefonPrywatny = (data.telefonPrywatny || '').toString().trim();
    var prawoJazdyWaznosc = (data.prawoJazdyWaznosc || '').toString().trim();
    var kontoAmazon     = (data.kontoAmazon || '').toString().trim();
    if (kontoAmazon && kontoAmazon !== 'Tak' && kontoAmazon !== 'Nie') return { error: 'KontoAmazon: tylko Tak / Nie' };

    if (!imie || !nazwisko) return { error: 'Imię i nazwisko wymagane' };
    if (!przewoznikLogin) return { error: 'Wybierz przewoźnika' };
    if (email && !_isValidEmail(email)) return { error: 'Nieprawidłowy email' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    // Przewoźnik musi istnieć
    var suPrz = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (suPrz) {
      var przExists = false;
      var prz = suPrz.getRange(2, 1, Math.max(1, suPrz.getLastRow() - 1), 1).getValues();
      for (var pi = 0; pi < prz.length; pi++) {
        if ((prz[pi][0] || '').toString().trim().toLowerCase() === przewoznikLogin) { przExists = true; break; }
      }
      if (!przExists) return { error: 'Przewoźnik "' + przewoznikLogin + '" nie istnieje' };
    }

    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) { ensureKierowcySheet(ss); sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      // Auto-generuj login jeśli brak (z imienia+nazwiska)
      if (!login) {
        login = _generateDriverLogin(imie, nazwisko, sk);
      } else {
        if (!_isValidDriverLogin(login)) return { error: 'Login 3-30 znaków, małe litery/cyfry/_-.' };
        // Unique login (gdy podany ręcznie)
        var kData = sk.getDataRange().getValues();
        for (var i = 1; i < kData.length; i++) {
          if ((kData[i][0] || '').toString().trim().toLowerCase() === login) {
            return { error: 'Kierowca "' + login + '" już istnieje' };
          }
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      sk.appendRow([login, imie, nazwisko, przewoznikLogin, telefon, email, nrPrawa, 'Tak', today, callerLogin]);
      var newRow = sk.getLastRow();
      // Extended cols K-M
      sk.getRange(newRow, 11, 1, 3).setValues([[telefonPrywatny, prawoJazdyWaznosc, kontoAmazon]]);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true, login: login };
  } catch(e) {
    Logger.log('addDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateDriver(login, data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!login || !data) return { error: 'Brak danych' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      for (var i = 1; i < kData.length; i++) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          // cols B-G (pos 2-7): Imie, Nazwisko, PrzewoznikLogin, TelefonFirmowy, Email, NrPrawaJazdy
          var imie     = (data.imie            || '').toString().trim() || (kData[i][1] || '').toString();
          var nazw     = (data.nazwisko        || '').toString().trim() || (kData[i][2] || '').toString();
          var prz      = (data.przewoznikLogin || '').toString().trim().toLowerCase() || (kData[i][3] || '').toString();
          var tel      = (data.telefon !== undefined ? data.telefon : (data.telefonFirmowy || '')).toString().trim();
          var em       = (data.email           || '').toString().trim();
          var np       = (data.nrPrawaJazdy    || '').toString().trim();
          if (em && !_isValidEmail(em)) return { error: 'Nieprawidłowy email' };
          sk.getRange(i + 1, 2, 1, 6).setValues([[imie, nazw, prz, tel, em, np]]);
          // Extended K-M (merge z aktualnymi)
          var cur = kData[i];
          var telP = (data.telefonPrywatny   !== undefined) ? (data.telefonPrywatny   || '').toString().trim() : (cur[10] || '').toString();
          var pjW  = (data.prawoJazdyWaznosc !== undefined) ? (data.prawoJazdyWaznosc || '').toString().trim() : (cur[11] || '').toString();
          var kAmz = (data.kontoAmazon       !== undefined) ? (data.kontoAmazon       || '').toString().trim() : (cur[12] || '').toString();
          if (kAmz && kAmz !== 'Tak' && kAmz !== 'Nie') return { error: 'KontoAmazon: tylko Tak / Nie' };
          sk.getRange(i + 1, 11, 1, 3).setValues([[telP, pjW, kAmz]]);
          return { ok: true };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('updateDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

function toggleDriverActive(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      for (var i = 1; i < kData.length; i++) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          var current = (kData[i][7] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sk.getRange(i + 1, 8).setValue(newVal);
          return { ok: true, aktywny: newVal };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('toggleDriverActive ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeDriver(login, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      for (var i = kData.length - 1; i >= 1; i--) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          sk.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('removeDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  NACZEPY (rejestr konkretnych) — admin CRUD  ═════════
// =================================================================

function _isValidNaczepaNr(nrRej) {
  if (!nrRej) return false;
  return /^[A-Z0-9]{3,12}$/.test(nrRej.toString().trim().toUpperCase());
}

// Helper: parsuj wiersz NACZEPY na obiekt (cols A-X = 1..24)
// pasy/maty/katowniki = LICZBA SZTUK (zmiana semantyki z Tak/Nie)
function _parseNaczepaRow(row, wiersz) {
  function num(v) { return (v !== undefined && v !== null && v !== '') ? v : ''; }
  return {
    wiersz: wiersz,
    nrRej:           (row[0] || '').toString().trim(),
    przewoznikLogin: (row[1] || '').toString().trim(),
    typNaczepy:      (row[2] || '').toString().trim(),
    marka:           (row[3] || '').toString().trim(),
    model:           (row[4] || '').toString().trim(),
    rok:             (row[5] || '').toString().trim(),
    aktywna:         ((row[6] || 'Tak').toString().trim() || 'Tak'),
    dataDodania:     (row[7] || '').toString().trim(),
    utworzonePrzez:  (row[8] || '').toString().trim(),
    xlCode:          (row[9] || '').toString().trim(),
    multilock:       (row[10] || '').toString().trim(),
    wyposPasy:       num(row[11]),
    wyposMaty:       num(row[12]),
    wyposKatowniki:  num(row[13]),
    deskiAluLiczba:  num(row[14]),
    deskiDrewLiczba: num(row[15]),
    przesuwnyDach:   (row[16] || '').toString().trim(),
    bocznyPrzeswit:  num(row[17]),
    tylnyPrzeswit:   num(row[18]),
    ladowanieTyl:    (row[19] || '').toString().trim(),
    ladowanieBok:    (row[20] || '').toString().trim(),
    ladowanieGora:   (row[21] || '').toString().trim(),
    nastepnyPrzeglad:(row[22] || '').toString().trim(),
    przesuwnyDachEdscha: (row[23] || '').toString().trim()
  };
}

// Helper: 15-elementowa tablica dla cols J-X (10..24)
function _naczepaExtFromData(data) {
  function tn(v) { var t = (v || '').toString().trim(); return (t === 'Tak' || t === 'Nie') ? t : ''; }
  function num(v) { return (v !== undefined && v !== null && v !== '') ? (parseFloat(v) || '') : ''; }
  // Edscha resetuje się jeśli przesuwnyDach != Tak
  var przesuwny = tn(data.przesuwnyDach);
  var edscha = (przesuwny === 'Tak') ? tn(data.przesuwnyDachEdscha) : '';
  return [
    tn(data.xlCode), tn(data.multilock),
    num(data.wyposPasy), num(data.wyposMaty), num(data.wyposKatowniki),
    num(data.deskiAluLiczba), num(data.deskiDrewLiczba),
    przesuwny,
    num(data.bocznyPrzeswit), num(data.tylnyPrzeswit),
    tn(data.ladowanieTyl), tn(data.ladowanieBok), tn(data.ladowanieGora),
    (data.nastepnyPrzeglad || '').toString().trim(),
    edscha
  ];
}

function getNaczepyList(callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień (wymaga admin)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) { ensureNaczepySheet(ss); return { ok: true, naczepy: [] }; }
    var data = sn.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var nrRej = (data[i][0] || '').toString().trim();
      if (!nrRej) continue;
      list.push(_parseNaczepaRow(data[i], i + 1));
    }
    return { ok: true, naczepy: list };
  } catch(e) {
    Logger.log('getNaczepyList ERR: ' + e.message);
    return { error: e.message };
  }
}

// Pobierz pełne dane jednej naczepy (admin lub opiekun właściciela)
function getNaczepaDetails(nrRej, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (caller.rola !== 'admin' && caller.rola !== 'opiekun') return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };
    var data = sn.getDataRange().getValues();
    var nrUp = nrRej.toString().trim().toUpperCase();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toUpperCase() === nrUp) {
        var n = _parseNaczepaRow(data[i], i + 1);
        if (caller.rola === 'opiekun' && !_opiekunOwnsCarrier(caller.login, n.przewoznikLogin)) {
          return { error: 'Brak uprawnień do tej naczepy' };
        }
        return { ok: true, naczepa: n };
      }
    }
    return { error: 'Naczepa nie istnieje' };
  } catch(e) {
    Logger.log('getNaczepaDetails ERR: ' + e.message);
    return { error: e.message };
  }
}

function addNaczepa(data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!data) return { error: 'Brak danych' };
    var nrRej      = (data.nrRej || '').toString().trim().toUpperCase().replace(/\s+/g, '');
    var prz        = (data.przewoznikLogin || '').toString().trim().toLowerCase();
    var typ        = (data.typNaczepy || '').toString().trim();
    var marka      = (data.marka || '').toString().trim();
    var model      = (data.model || '').toString().trim();
    var rok        = (data.rok  !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : '';

    if (!_isValidNaczepaNr(nrRej)) return { error: 'Nr rejestracyjny 3-12 znaków (A-Z, 0-9)' };
    if (!prz) return { error: 'Wybierz przewoźnika' };
    if (!typ) return { error: 'Wybierz typ naczepy' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) { ensureNaczepySheet(ss); sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrRej) {
          return { error: 'Naczepa "' + nrRej + '" już istnieje' };
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      sn.appendRow([nrRej, prz, typ, marka, model, rok, 'Tak', today, callerLogin]);
      var newRow = sn.getLastRow();
      // Zapisz extended fields J-X (cols 10..24)
      sn.getRange(newRow, 10, 1, 15).setValues([_naczepaExtFromData(data)]);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true };
  } catch(e) {
    Logger.log('addNaczepa ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateNaczepa(nrRej, data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!nrRej || !data) return { error: 'Brak danych' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          var prz   = (data.przewoznikLogin || '').toString().trim().toLowerCase() || (nData[i][1] || '');
          var typ   = (data.typNaczepy      || '').toString().trim() || (nData[i][2] || '');
          var marka = (data.marka           || '').toString().trim();
          var model = (data.model           || '').toString().trim();
          var rok   = (data.rok !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : (nData[i][5] || '');
          // cols B-F (pos 2-6)
          sn.getRange(i + 1, 2, 1, 5).setValues([[prz, typ, marka, model, rok]]);
          // Extended fields J-X (cols 10..24) — merge z aktualnymi
          var current = nData[i];
          var merged = {
            xlCode:           data.xlCode           !== undefined ? data.xlCode           : current[9],
            multilock:        data.multilock        !== undefined ? data.multilock        : current[10],
            wyposPasy:        data.wyposPasy        !== undefined ? data.wyposPasy        : current[11],
            wyposMaty:        data.wyposMaty        !== undefined ? data.wyposMaty        : current[12],
            wyposKatowniki:   data.wyposKatowniki   !== undefined ? data.wyposKatowniki   : current[13],
            deskiAluLiczba:   data.deskiAluLiczba   !== undefined ? data.deskiAluLiczba   : current[14],
            deskiDrewLiczba:  data.deskiDrewLiczba  !== undefined ? data.deskiDrewLiczba  : current[15],
            przesuwnyDach:    data.przesuwnyDach    !== undefined ? data.przesuwnyDach    : current[16],
            bocznyPrzeswit:   data.bocznyPrzeswit   !== undefined ? data.bocznyPrzeswit   : current[17],
            tylnyPrzeswit:    data.tylnyPrzeswit    !== undefined ? data.tylnyPrzeswit    : current[18],
            ladowanieTyl:     data.ladowanieTyl     !== undefined ? data.ladowanieTyl     : current[19],
            ladowanieBok:     data.ladowanieBok     !== undefined ? data.ladowanieBok     : current[20],
            ladowanieGora:    data.ladowanieGora    !== undefined ? data.ladowanieGora    : current[21],
            nastepnyPrzeglad: data.nastepnyPrzeglad !== undefined ? data.nastepnyPrzeglad : current[22],
            przesuwnyDachEdscha: data.przesuwnyDachEdscha !== undefined ? data.przesuwnyDachEdscha : current[23]
          };
          sn.getRange(i + 1, 10, 1, 15).setValues([_naczepaExtFromData(merged)]);
          return { ok: true };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('updateNaczepa ERR: ' + e.message);
    return { error: e.message };
  }
}

function toggleNaczepaActive(nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          var current = (nData[i][6] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sn.getRange(i + 1, 7).setValue(newVal);
          return { ok: true, aktywna: newVal };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('toggleNaczepaActive ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeNaczepa(nrRej, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      for (var i = nData.length - 1; i >= 1; i--) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          sn.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('removeNaczepa ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  NACZEPY_TYPY (słownik) — admin CRUD  ════════════════
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

function addNaczepaTyp(data, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    if (!data || !data.nazwa) return { error: 'Nazwa wymagana' };
    var nazwa = data.nazwa.toString().trim();
    var skrot = (data.skrot || '').toString().trim().toUpperCase();
    var opis  = (data.opis || '').toString().trim();
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sht = ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY);
    if (!sht) { ensureNaczepyTypySheet(ss); sht = ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var tData = sht.getDataRange().getValues();
      for (var i = 1; i < tData.length; i++) {
        if ((tData[i][0] || '').toString().trim().toLowerCase() === nazwa.toLowerCase()) {
          return { error: 'Typ "' + nazwa + '" już istnieje' };
        }
      }
      sht.appendRow([nazwa, skrot, opis, 'Tak']);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true };
  } catch(e) {
    return { error: e.message };
  }
}

function toggleNaczepaTypActive(nazwa, callerLogin) {
  try {
    if (!requireAdmin(callerLogin)) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sht = ss.getSheetByName(CONFIG.SHEET_NACZEPY_TYPY);
    if (!sht) return { error: 'Brak arkusza NACZEPY_TYPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var tData = sht.getDataRange().getValues();
      var nazwaLc = nazwa.toString().trim().toLowerCase();
      for (var i = 1; i < tData.length; i++) {
        if ((tData[i][0] || '').toString().trim().toLowerCase() === nazwaLc) {
          var current = (tData[i][3] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sht.getRange(i + 1, 4).setValue(newVal);
          return { ok: true, aktywna: newVal };
        }
      }
      return { error: 'Typ nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    return { error: e.message };
  }
}

// Publiczne — lista typów wyposażenia (do UI dropdownów)
function getWyposazenieTypes() {
  return { ok: true, types: CONFIG.WYPOSAZENIE_TYPES };
}

// ══════════════════════════════════════════════════════════════
// ═══ INTEGRACJE ZEWNĘTRZNE (VIES + Biała Lista MF) ═════════════
// ══════════════════════════════════════════════════════════════

// VIES REST API — sprawdzenie nazwy i adresu firmy po NIP (UE)
// Działa BEZ rejestracji klucza. URL: https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{number}
// Zwraca: { ok: true, valid: true, name: "...", address: "..." } lub { error: "..." }
function viesLookup(nip) {
  try {
    if (!nip) return { error: 'Brak NIP' };
    var raw = nip.toString().replace(/[\s\-]/g, '').toUpperCase();
    // Wykryj prefix kraju (np. "PL1234567890" lub samo "1234567890")
    var country = 'PL';
    var number = raw;
    var m = raw.match(/^([A-Z]{2})(\d+)$/);
    if (m) { country = m[1]; number = m[2]; }
    if (!/^\d{8,12}$/.test(number)) return { error: 'NIP musi mieć 8-12 cyfr' };

    var url = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/' + country + '/vat/' + number;
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'Accept': 'application/json' }
    });
    var code = resp.getResponseCode();
    if (code !== 200) return { error: 'VIES HTTP ' + code };
    var body;
    try { body = JSON.parse(resp.getContentText()); }
    catch(je) { return { error: 'VIES: nieprawidłowa odpowiedź' }; }

    if (body.userError && body.userError !== 'VALID') {
      return { ok: true, valid: false, reason: body.userError, country: country, nip: number };
    }
    if (body.isValid === false) {
      return { ok: true, valid: false, reason: 'NIP nie istnieje w VIES', country: country, nip: number };
    }

    var name = (body.name || '').toString().trim();
    var address = (body.address || '').toString().trim().replace(/\s+/g, ' ');
    return {
      ok: true,
      valid: true,
      country: country,
      nip: number,
      name: name,
      address: address
    };
  } catch(e) {
    Logger.log('viesLookup ERR: ' + e.message);
    return { error: 'VIES: ' + e.message };
  }
}

// Biała Lista MF — bool (Tak/Nie czy konto bankowe jest powiązane z NIP-em)
// URL: https://wl-api.mf.gov.pl/api/check/nip/{nip}/bank-account/{account}?date={YYYY-MM-DD}
// Zwraca tylko { ok: true, valid: true|false } albo { error }.
function whiteListCheckAccount(nip, account) {
  try {
    if (!nip || !account) return { error: 'Brak NIP lub konta' };
    var nipClean = nip.toString().replace(/[^0-9]/g, '');
    if (nipClean.length !== 10) return { error: 'NIP musi mieć 10 cyfr' };
    var accClean = account.toString().replace(/[^0-9]/g, '');
    if (accClean.length !== 26) return { error: 'Konto musi mieć 26 cyfr (PL IBAN)' };
    var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd');
    var url = 'https://wl-api.mf.gov.pl/api/check/nip/' + nipClean + '/bank-account/' + accClean + '?date=' + today;
    var resp = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
    var code = resp.getResponseCode();
    if (code !== 200) {
      // 400/404 = NIP/konto nieprawidłowy → traktuj jako "nie na liście"
      if (code === 400 || code === 404) return { ok: true, valid: false, reason: 'Konto nie znalezione' };
      return { error: 'Biała Lista HTTP ' + code };
    }
    var body;
    try { body = JSON.parse(resp.getContentText()); }
    catch(je) { return { error: 'Biała Lista: nieprawidłowa odpowiedź' }; }
    var assigned = (body.result && body.result.accountAssigned) || '';
    return { ok: true, valid: assigned === 'TAK' };
  } catch(e) {
    Logger.log('whiteListCheckAccount ERR: ' + e.message);
    return { error: 'Biała Lista: ' + e.message };
  }
}

// Helper: link do info-car.pl dla sprawdzenia przeglądu technicznego pojazdu/naczepy
// (info-car.pl nie ma publicznego API → frontend otwiera URL z prefilled nrRej)
function inspectionCheckLink(nrRej) {
  if (!nrRej) return '';
  // info-car.pl strona "Historia pojazdu" — user wprowadza VIN/nrRej w formularzu
  return 'https://info-car.pl/infocar/dowod-rejestracyjny/historia.html?rej=' + encodeURIComponent(nrRej.toString().toUpperCase().replace(/\s+/g, ''));
}

// Publiczne — stałe certyfikatów dla UI dropdownów
function getVehicleCertTypes() {
  return {
    ok: true,
    certyfikatL: CONFIG.CERTYFIKAT_L_VALUES,
    euro: CONFIG.EURO_VALUES,
    adr: CONFIG.ADR_KLASY,
    typyAut: CONFIG.TYPY_AUT,
    odpadyKraje: CONFIG.ODPADY_KRAJE,
    typyNaczep: ['STD', 'MEGA', 'FRIGO', 'COIL']
  };
}

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

// =================================================================
// ═══════════  PANEL OPIEKUNA — MOJA OPIEKA (READ-ONLY)  ═══════════
// =================================================================
// Opiekun widzi:
//   - swoich przewoźników (filtr UZYTKOWNICY.OpiekunLogin = caller.login)
//   - auta tych przewoźników
//   - ich kierowców
//   - ich naczepy
// Wszystko read-only.

function _requireOpiekun(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'opiekun') return null;
  return u;
}

function getOpiekunFleet(callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta opiekuna)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);

    var opiekunLc = caller.login.toString().trim().toLowerCase();
    var carriers = [];
    var carrierLogins = {}; // set loginów moich przewoźników
    var sumaWypisowKreptd = 0; // suma wypisów licencji KREPTD (dla statystyki "potencjalne")

    // 1. Przewoźnicy (filtr po OpiekunLogin)
    if (su) {
      var uData = su.getDataRange().getValues();
      for (var i = 1; i < uData.length; i++) {
        var login = (uData[i][0] || '').toString().trim();
        if (!login) continue;
        var opLc = (uData[i][10] || '').toString().trim().toLowerCase();
        if (opLc !== opiekunLc) continue;
        carrierLogins[login.toLowerCase()] = true;
        var liczbaWypisow = (uData[i][20] !== undefined && uData[i][20] !== null && uData[i][20] !== '') ? (parseInt(uData[i][20]) || 0) : 0;
        sumaWypisowKreptd += liczbaWypisow;
        carriers.push({
          login: login,
          nazwa: (uData[i][3] || '').toString().trim(),
          email: (uData[i][4] || '').toString().trim(),
          firma: (uData[i][5] || '').toString().trim(),
          nip:   (uData[i][6] || '').toString().trim(),
          aktywny: ((uData[i][7] || 'Tak').toString().trim() || 'Tak'),
          lastLogin: (uData[i][8] || '').toString().trim(),
          dataUtworzenia: (uData[i][9] || '').toString().trim(),
          liczbaWypisow: liczbaWypisow
        });
      }
    }

    // 2. Auta moich przewoźników
    var vehicles = [];
    if (sa && Object.keys(carrierLogins).length > 0) {
      var aData = sa.getDataRange().getValues();
      for (var j = 1; j < aData.length; j++) {
        var przLc = (aData[j][0] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLc]) continue;
        var nrRej = (aData[j][1] || '').toString().trim();
        if (!nrRej) continue;
        vehicles.push(_parseAutoRow(aData[j], j + 1));
      }
    }

    // 3. Kierowcy moich przewoźników
    var drivers = [];
    if (sk && Object.keys(carrierLogins).length > 0) {
      var kData = sk.getDataRange().getValues();
      for (var k = 1; k < kData.length; k++) {
        var przLcK = (kData[k][3] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLcK]) continue;
        drivers.push({
          login:           (kData[k][0] || '').toString().trim(),
          imie:            (kData[k][1] || '').toString().trim(),
          nazwisko:        (kData[k][2] || '').toString().trim(),
          przewoznikLogin: (kData[k][3] || '').toString().trim(),
          telefon:         (kData[k][4] || '').toString().trim(),
          email:           (kData[k][5] || '').toString().trim(),
          nrPrawaJazdy:    (kData[k][6] || '').toString().trim(),
          aktywny:         ((kData[k][7] || 'Tak').toString().trim() || 'Tak')
        });
      }
    }

    // 4. Naczepy moich przewoźników
    var trailers = [];
    if (sn && Object.keys(carrierLogins).length > 0) {
      var nData = sn.getDataRange().getValues();
      for (var m = 1; m < nData.length; m++) {
        var przLcN = (nData[m][1] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLcN]) continue;
        trailers.push({
          nrRej:           (nData[m][0] || '').toString().trim(),
          przewoznikLogin: (nData[m][1] || '').toString().trim(),
          typNaczepy:      (nData[m][2] || '').toString().trim(),
          marka:           (nData[m][3] || '').toString().trim(),
          model:           (nData[m][4] || '').toString().trim(),
          rok:             (nData[m][5] || '').toString().trim(),
          aktywna:         ((nData[m][6] || 'Tak').toString().trim() || 'Tak')
        });
      }
    }

    // 5. Statystyki — jeżdżą / stoją / stoją >7 dni / potencjalne (z KREPTD)
    var todayMs = new Date().getTime();
    var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    var statyAktywne = 0;     // Aktywne=Tak
    var statyJezdzace = 0;    // Aktywne=Tak + ostatnioJezdzilo <= 7 dni (lub puste = uznajemy że jeździ)
    var statyStojace7d = 0;   // Aktywne=Tak ale ostatnioJezdzilo > 7 dni temu
    var statyNieaktywne = 0;  // Aktywne=Nie
    var stojaceList = [];     // lista aut stojących > 7 dni dla UI
    for (var sj = 0; sj < vehicles.length; sj++) {
      var vv = vehicles[sj];
      if (vv.aktywne === 'Nie') { statyNieaktywne++; continue; }
      statyAktywne++;
      var oj = vv.ostatnioJezdzilo || '';
      if (!oj) {
        statyJezdzace++; // brak danych — domyślnie zakładamy że jeździ
        continue;
      }
      try {
        var ojDate = new Date(oj);
        if (isNaN(ojDate.getTime())) { statyJezdzace++; continue; }
        var diffMs = todayMs - ojDate.getTime();
        if (diffMs > SEVEN_DAYS) {
          statyStojace7d++;
          var dni = Math.floor(diffMs / (24 * 60 * 60 * 1000));
          stojaceList.push({
            nrRej: vv.nrRej,
            przewoznikLogin: vv.przewoznikLogin,
            ostatnioJezdzilo: oj,
            dniBezJazdy: dni,
            planista: vv.planista,
            dyspozytor: vv.dyspozytor,
            stawkaDE: vv.stawkaDE,
            stawkaUE: vv.stawkaUE
          });
        } else {
          statyJezdzace++;
        }
      } catch(e) { statyJezdzace++; }
    }
    // Potencjalne auta z KREPTD = suma wypisów - liczba wprowadzonych aut (aktywne + nieaktywne)
    var potencjalneAuta = Math.max(0, sumaWypisowKreptd - vehicles.length);

    return {
      ok: true,
      opiekunNazwa: caller.nazwa,
      carriers: carriers,
      vehicles: vehicles,
      drivers:  drivers,
      trailers: trailers,
      stats: {
        liczbaPrzewoznikow: carriers.length,
        liczbaAut: vehicles.length,
        autaAktywne: statyAktywne,
        autaJezdzace: statyJezdzace,
        autaStojace7dni: statyStojace7d,
        autaNieaktywne: statyNieaktywne,
        sumaWypisowKreptd: sumaWypisowKreptd,
        potencjalneAuta: potencjalneAuta,
        liczbaKierowcow: drivers.length,
        liczbaNaczep: trailers.length
      },
      stojaceList: stojaceList
    };
  } catch(e) {
    Logger.log('getOpiekunFleet ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  OPIEKUN — CRUD (z audit log) ════════════════════════
// =================================================================
// Opiekun ma pełne uprawnienia w zakresie SWOICH przewoźników.
// Zmiany destrukcyjne (delete) wymagają powodu i są logowane w AUDIT_LOG.

// Helper: sprawdza czy caller jest opiekunem danego przewoźnika (ownership)
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

// ── PRZEWOŹNICY (opiekun) ──

// Dodaj nowego przewoźnika (od razu aktywny, opiekunLogin wymuszony = caller.login)
function addCarrierByOpiekun(data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta opiekuna)' };
    if (!data) return { error: 'Brak danych' };
    // Force opiekunLogin = caller.login (opiekun dodaje do SIEBIE)
    data.opiekunLogin = caller.login;
    return _internalAddCarrier(data, caller);
  } catch(e) {
    Logger.log('addCarrierByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Wspólna logika dodawania przewoźnika (używana przez admin i opiekun)
function _internalAddCarrier(data, caller) {
  var login = (data.login || '').toString().trim().toLowerCase();
  var nazwa = (data.nazwa || '').toString().trim();
  var email = (data.email || '').toString().trim();
  var firma = (data.firma || '').toString().trim();
  var nip = (data.nip || '').toString().trim();
  var hasloRaw = (data.haslo || '').toString().trim();
  var firstVehicle = (data.firstVehicle || '').toString().trim().toUpperCase().replace(/\s+/g,'');
  var opiekunLogin = (data.opiekunLogin || '').toString().trim().toLowerCase();

  if (!_isValidLogin(login)) return { error: 'Login musi być 3-20 znaków (małe litery, cyfry, _ lub -)' };
  if (!nazwa) return { error: 'Nazwa przewoźnika wymagana' };
  if (!_isValidEmail(email)) return { error: 'Nieprawidłowy adres email' };
  if (!firma) return { error: 'Nazwa firmy wymagana' };
  if (!nip || nip.length < 10) return { error: 'NIP musi mieć minimum 10 znaków' };
  if (hasloRaw && hasloRaw.length < 8) return { error: 'Hasło musi mieć minimum 8 znaków (lub pozostaw puste)' };
  if (firstVehicle && !_isValidVehicleNr(firstVehicle)) return { error: 'Nr rejestracyjny musi być 3-10 znaków' };

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };

  // Unique login w 4 arkuszach auth
  var loginSheets = [CONFIG.SHEET_ADMIN, CONFIG.SHEET_PRACOWNIK, CONFIG.SHEET_OPIEKUN,
                     CONFIG.SHEET_PLANISCI, CONFIG.SHEET_DYSPOZYTOR,
                     CONFIG.SHEET_EKSPORT, CONFIG.SHEET_WERYFIKATOR,
                     CONFIG.SHEET_UZYTKOWNICY];
  for (var si = 0; si < loginSheets.length; si++) {
    var sh = ss.getSheetByName(loginSheets[si]);
    if (!sh) continue;
    var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues();
    for (var vi = 0; vi < vals.length; vi++) {
      if ((vals[vi][0] || '').toString().trim().toLowerCase() === login) {
        return { error: 'Login "' + login + '" już istnieje (arkusz: ' + loginSheets[si] + ')' };
      }
    }
  }

  // Unique email
  var uData = su.getDataRange().getValues();
  for (var ui = 1; ui < uData.length; ui++) {
    if ((uData[ui][4] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
      return { error: 'Email "' + email + '" jest już używany' };
    }
  }

  var haslo = hasloRaw || _generateRandomPassword();
  var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
  try {
    su.appendRow([login, haslo, 'przewoznik', nazwa, email, firma, nip, 'Tak', '', today, opiekunLogin]);
    var newRow = su.getLastRow();
    // Zapisz extended fields L-V (jeśli przekazane)
    su.getRange(newRow, 12, 1, 11).setValues([_carrierExtFromData(data)]);
    if (firstVehicle) {
      var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
      if (!sa) { ensureAutaSheet(ss); sa = ss.getSheetByName(CONFIG.SHEET_AUTA); }
      sa.appendRow([login, firstVehicle, 'Tak', today, '', caller.login]);
    }
  } finally { try { lock.releaseLock(); } catch(le){} }

  // Audit log (info)
  _writeAuditLog(caller.login, caller.rola, 'carrier_add', login, '', 'login=' + login + ' firma=' + firma + ' email=' + email,
    '', { opiekunLogin: opiekunLogin, nazwa: nazwa }, false); // bez maila dla zwykłego add

  // Email powitalny
  try { sendAccountCreatedEmail({nazwa: nazwa, email: email, login: login, firma: firma}, haslo); } catch(me) {}

  return { ok: true, login: login, hasloGenerated: !hasloRaw, haslo: haslo };
}

// Edycja przewoźnika (opiekun — tylko swoich)
function updateCarrierByOpiekun(login, data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Nie możesz edytować tego przewoźnika (nie jest pod Twoją opieką)' };
    // Reuse admin updateCarrier (ale admin check failuje, więc inline)
    return _internalUpdateCarrier(login, data, caller);
  } catch(e) {
    Logger.log('updateCarrierByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

function _internalUpdateCarrier(login, data, caller) {
  var loginLc = login.toString().trim().toLowerCase();
  var nazwa = (data.nazwa || '').toString().trim();
  var email = (data.email || '').toString().trim();
  var firma = (data.firma || '').toString().trim();
  var nip = (data.nip || '').toString().trim();
  if (!nazwa) return { error: 'Nazwa wymagana' };
  if (!_isValidEmail(email)) return { error: 'Nieprawidłowy email' };
  if (!firma) return { error: 'Firma wymagana' };
  if (!nip || nip.length < 10) return { error: 'NIP min 10 znaków' };

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
  var uData = su.getDataRange().getValues();
  var targetRow = -1;
  for (var i = 1; i < uData.length; i++) {
    if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) { targetRow = i + 1; break; }
  }
  if (targetRow < 0) return { error: 'Przewoźnik nie istnieje' };

  for (var j = 1; j < uData.length; j++) {
    if ((j + 1) === targetRow) continue;
    if ((uData[j][4] || '').toString().trim().toLowerCase() === email.toLowerCase()) {
      return { error: 'Email "' + email + '" jest używany przez innego przewoźnika' };
    }
  }
  su.getRange(targetRow, 4, 1, 4).setValues([[nazwa, email, firma, nip]]);
  // OpiekunLogin — opiekun NIE może zmienić (jego przypisanie stałe). Admin może.
  if (caller.rola === 'admin' && data.opiekunLogin !== undefined) {
    su.getRange(targetRow, 11).setValue((data.opiekunLogin || '').toString().trim().toLowerCase());
  }
  // Extended fields L-V (merge z aktualnymi)
  var hasExtO = ['osobaKontaktowa','telefon','emailZlecenia','terminPlatnosci','kontoEUR','kontoPLN',
                 'ubezpWartosc','ubezpWaznosc','licencjaWaznosc','liczbaWypisow','adresFirmy']
                 .some(function(k) { return data[k] !== undefined; });
  if (hasExtO) {
    var cur = uData[targetRow - 1];
    var merged = {
      osobaKontaktowa: data.osobaKontaktowa !== undefined ? data.osobaKontaktowa : cur[11],
      telefon:         data.telefon         !== undefined ? data.telefon         : cur[12],
      emailZlecenia:   data.emailZlecenia   !== undefined ? data.emailZlecenia   : cur[13],
      terminPlatnosci: data.terminPlatnosci !== undefined ? data.terminPlatnosci : cur[14],
      kontoEUR:        data.kontoEUR        !== undefined ? data.kontoEUR        : cur[15],
      kontoPLN:        data.kontoPLN        !== undefined ? data.kontoPLN        : cur[16],
      ubezpWartosc:    data.ubezpWartosc    !== undefined ? data.ubezpWartosc    : cur[17],
      ubezpWaznosc:    data.ubezpWaznosc    !== undefined ? data.ubezpWaznosc    : cur[18],
      licencjaWaznosc: data.licencjaWaznosc !== undefined ? data.licencjaWaznosc : cur[19],
      liczbaWypisow:   data.liczbaWypisow   !== undefined ? data.liczbaWypisow   : cur[20],
      adresFirmy:      data.adresFirmy      !== undefined ? data.adresFirmy      : cur[21]
    };
    su.getRange(targetRow, 12, 1, 11).setValues([_carrierExtFromData(merged)]);
  }
  return { ok: true };
}

// Pobierz pełne dane jednego przewoźnika (dla modala edycji)
function getCarrierDetails(login, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var loginLc = login.toString().trim().toLowerCase();
    if (caller.rola === 'opiekun') {
      if (!_opiekunOwnsCarrier(caller.login, loginLc)) return { error: 'Brak uprawnień do tego przewoźnika' };
    } else if (caller.rola !== 'admin') {
      return { error: 'Brak uprawnień' };
    }
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var data = su.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        return { ok: true, carrier: _parseCarrierRow(data[i], i + 1) };
      }
    }
    return { error: 'Przewoźnik nie istnieje' };
  } catch(e) {
    Logger.log('getCarrierDetails ERR: ' + e.message);
    return { error: e.message };
  }
}

// Dezaktywacja/aktywacja (opiekun) — bez powodu, ale audit log
function toggleCarrierActiveByOpiekun(login, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    // Reuse admin toggle logic (inline)
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    var uData = su.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    for (var i = 1; i < uData.length; i++) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        var current = (uData[i][7] || 'Tak').toString().trim().toUpperCase();
        var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
        su.getRange(i + 1, 8).setValue(newVal);
        try {
          var carrier = { nazwa: uData[i][3], email: uData[i][4], login: uData[i][0], firma: uData[i][5] };
          if (newVal === 'Nie') sendAccountDeactivatedEmail(carrier);
          else sendAccountReactivatedEmail(carrier);
        } catch(me) {}
        _writeAuditLog(caller.login, caller.rola, newVal === 'Nie' ? 'carrier_deactivate' : 'carrier_activate',
          login, current, newVal, '', { firma: uData[i][5] });
        return { ok: true, aktywny: newVal };
      }
    }
    return { error: 'Przewoźnik nie istnieje' };
  } catch(e) {
    Logger.log('toggleCarrierActiveByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Usunięcie trwałe (opiekun) — WYMAGA POWODU
function deleteCarrierByOpiekunHard(login, powod, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    if (!powod || powod.toString().trim().length < 10) return { error: 'Podaj powód usunięcia (min. 10 znaków)' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!su) return { error: 'Brak arkusza UZYTKOWNICY' };
    var loginLc = login.toString().trim().toLowerCase();

    var uData = su.getDataRange().getValues();
    var deletedRow = -1;
    var deletedFirma = '';
    for (var i = uData.length - 1; i >= 1; i--) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        deletedFirma = (uData[i][5] || '').toString();
        su.deleteRow(i + 1);
        deletedRow = i + 1;
        break;
      }
    }
    if (deletedRow < 0) return { error: 'Przewoźnik nie istnieje' };

    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var j = aData.length - 1; j >= 1; j--) {
        if ((aData[j][0] || '').toString().trim().toLowerCase() === loginLc) sa.deleteRow(j + 1);
      }
    }
    _writeAuditLog(caller.login, caller.rola, 'carrier_delete_hard', login, deletedFirma, 'USUNIĘTO', powod, null);
    return { ok: true };
  } catch(e) {
    Logger.log('deleteCarrierByOpiekunHard ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── AUTA (opiekun) ──

// Dodaj auto SWOJEMU przewoźnikowi
function addVehicleByOpiekun(login, nrRej, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta opiekuna)' };
    if (!login || !nrRej) return { error: 'Brak danych' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Ten przewoźnik nie jest pod Twoją opieką' };
    var nrRejClean = (nrRej || '').toString().trim().toUpperCase().replace(/\s+/g, '');
    if (!_isValidVehicleNr(nrRejClean)) return { error: 'Nr rejestracyjny musi być 3-10 znaków (A-Z, 0-9)' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) { ensureAutaSheet(ss); sa = ss.getSheetByName(CONFIG.SHEET_AUTA); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      for (var i = 1; i < data.length; i++) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejClean) {
          return { error: 'Pojazd "' + nrRejClean + '" już istnieje dla tego przewoźnika' };
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      sa.appendRow([login, nrRejClean, 'Tak', today, '', caller.login]);
    } finally { try { lock.releaseLock(); } catch(le){} }

    _writeAuditLog(caller.login, caller.rola, 'vehicle_add', login + '/' + nrRejClean, '', 'Dodano auto', '', { przewoznik: login }, false);
    return { ok: true };
  } catch(e) {
    Logger.log('addVehicleByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Toggle aktywne (bez powodu, ale audit)
function toggleVehicleActiveByOpiekun(login, nrRej, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < data.length; i++) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          var current = (data[i][2] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sa.getRange(i + 1, 3).setValue(newVal);
          if (newVal === 'Nie') sa.getRange(i + 1, 5).setValue(Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss'));
          else sa.getRange(i + 1, 5).setValue('');
          _writeAuditLog(caller.login, caller.rola, newVal === 'Nie' ? 'vehicle_deactivate' : 'vehicle_activate',
            login + '/' + nrRejUp, current, newVal, '', null, false);
          return { ok: true, aktywne: newVal };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally { try { lock.releaseLock(); } catch(le){} }
  } catch(e) {
    Logger.log('toggleVehicleActiveByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Usuń auto (z powodem)
function removeVehicleByOpiekun(login, nrRej, powod, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    if (!powod || powod.toString().trim().length < 10) return { error: 'Podaj powód usunięcia (min. 10 znaków)' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var data = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = data.length - 1; i >= 1; i--) {
        if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          sa.deleteRow(i + 1);
          _writeAuditLog(caller.login, caller.rola, 'vehicle_delete', login + '/' + nrRejUp, nrRejUp, 'USUNIĘTO', powod, null);
          return { ok: true };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally { try { lock.releaseLock(); } catch(le){} }
  } catch(e) {
    Logger.log('removeVehicleByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Pobierz szczegóły auta (opiekun — swoich)
function getVehicleDetailsByOpiekun(login, nrRej, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };
    var data = sa.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    var nrRejUp = nrRej.toString().trim().toUpperCase();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim().toLowerCase() === loginLc &&
          (data[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
        return { ok: true, vehicle: _parseAutoRow(data[i], i + 1) };
      }
    }
    return { error: 'Pojazd nie istnieje' };
  } catch(e) {
    Logger.log('getVehicleDetailsByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Aktualizuj szczegóły auta (opiekun) — z detekcją zmian planisty/stawek (wymaga powodu)
function updateVehicleDetailsByOpiekun(login, nrRej, data, powod, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    if (!login || !nrRej || !data) return { error: 'Brak danych' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { error: 'Brak arkusza AUTA' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var aData = sa.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var nrRejUp = nrRej.toString().trim().toUpperCase();
      for (var i = 1; i < aData.length; i++) {
        if ((aData[i][0] || '').toString().trim().toLowerCase() === loginLc &&
            (aData[i][1] || '').toString().trim().toUpperCase() === nrRejUp) {
          // Stare wartości (do detekcji zmian)
          var oldRow = _parseAutoRow(aData[i], i + 1);

          // Nowe wartości
          var planista       = (data.planista    || '').toString().trim();
          var marka          = (data.marka       || '').toString().trim();
          var model          = (data.model       || '').toString().trim();
          var rok            = (data.rok !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : '';
          var uwagi          = (data.uwagi       || '').toString().trim();
          var certyfikatL    = (data.certyfikatL || '').toString().trim();
          var euro           = (data.euro        || '').toString().trim();
          var adr            = Array.isArray(data.adr) ? data.adr.join(',') : (data.adr || '').toString().trim();
          var gps            = (data.gps            || '').toString().trim();
          var kartaPaliwowa  = (data.kartaPaliwowa  || '').toString().trim();
          var typ            = (data.typ            || '').toString().trim();
          var dyspozytor     = (data.dyspozytor     || '').toString().trim().toLowerCase();
          var gb             = (data.gb             || '').toString().trim();
          var it             = (data.it             || '').toString().trim();
          var fr             = (data.fr             || '').toString().trim();
          var porozumienie   = (data.porozumienie   || '').toString().trim();
          var umowa          = (data.umowa          || '').toString().trim();
          var stawkaDE       = (data.stawkaDE !== undefined && data.stawkaDE !== null && data.stawkaDE !== '') ? parseFloat(data.stawkaDE) : '';
          var stawkaUE       = (data.stawkaUE !== undefined && data.stawkaUE !== null && data.stawkaUE !== '') ? parseFloat(data.stawkaUE) : '';
          var stawkaEksport  = (data.stawkaEksport !== undefined && data.stawkaEksport !== null && data.stawkaEksport !== '') ? parseFloat(data.stawkaEksport) : '';
          var stawkaImport   = (data.stawkaImport !== undefined && data.stawkaImport !== null && data.stawkaImport !== '') ? parseFloat(data.stawkaImport) : '';
          // Odpady (A-schild)
          var odpady         = (data.odpady || '').toString().trim();
          var odpadyKrajeArr = Array.isArray(data.odpadyKraje) ? data.odpadyKraje : [];
          var odpadyKraje    = (odpady === 'Tak') ? odpadyKrajeArr.join(',') : '';
          // ADR — jeśli adrEnabled = 'Nie' → wymuś pustą listę
          var adrEnabled     = (data.adrEnabled || '').toString().trim();
          if (adrEnabled === 'Nie') adr = '';

          // Walidacje enum
          if (certyfikatL && CONFIG.CERTYFIKAT_L_VALUES.indexOf(certyfikatL) < 0) return { error: 'Nieprawidłowa wartość CertyfikatL' };
          if (euro && CONFIG.EURO_VALUES.indexOf(euro) < 0) return { error: 'Nieprawidłowa wartość EURO' };
          if (gps && gps !== 'Tak' && gps !== 'Nie') return { error: 'GPS: tylko Tak / Nie' };
          if (kartaPaliwowa && kartaPaliwowa !== 'Tak' && kartaPaliwowa !== 'Nie') return { error: 'Karta paliwowa: tylko Tak / Nie' };
          if (typ && CONFIG.TYPY_AUT.indexOf(typ) < 0) return { error: 'Typ: tylko ' + CONFIG.TYPY_AUT.join('/') };
          if (odpady && odpady !== 'Tak' && odpady !== 'Nie') return { error: 'Odpady (A-schild): tylko Tak / Nie' };
          if (odpady === 'Tak' && odpadyKrajeArr.length) {
            var validOdpKraje = CONFIG.ODPADY_KRAJE.map(function(k){ return k.id; });
            for (var ok = 0; ok < odpadyKrajeArr.length; ok++) {
              if (validOdpKraje.indexOf(odpadyKrajeArr[ok]) < 0) return { error: 'Nieprawidłowy kraj Odpady: ' + odpadyKrajeArr[ok] };
            }
          }
          var flagChecks = { gb: gb, it: it, fr: fr, porozumienie: porozumienie, umowa: umowa };
          for (var fk in flagChecks) {
            var fv = flagChecks[fk];
            if (fv && fv !== 'Tak' && fv !== 'Nie') return { error: fk.toUpperCase() + ': tylko Tak / Nie' };
          }

          // Detekcja zmian planisty/stawek — wymaga powodu
          function _normNum(v) { return (v === '' || v === null || v === undefined) ? '' : String(parseFloat(v) || 0); }
          var planistaChanged    = (oldRow.planista || '') !== planista;
          var stawkaDEChanged    = _normNum(oldRow.stawkaDE)      !== _normNum(stawkaDE);
          var stawkaUEChanged    = _normNum(oldRow.stawkaUE)      !== _normNum(stawkaUE);
          var stawkaEksChanged   = _normNum(oldRow.stawkaEksport) !== _normNum(stawkaEksport);
          var stawkaImpChanged   = _normNum(oldRow.stawkaImport)  !== _normNum(stawkaImport);
          var sensitiveChanged   = planistaChanged || stawkaDEChanged || stawkaUEChanged || stawkaEksChanged || stawkaImpChanged;

          if (sensitiveChanged && (!powod || powod.toString().trim().length < 10)) {
            return { error: 'Wymagany powód (min. 10 znaków) — zmieniłeś planistę lub stawkę.' };
          }

          // Kabotaż + GPS MOB Nr + Następny przegląd + NrBoczny + OstatnioJezdzilo (cols AE-AJ)
          var kabotazDE = (data.kabotazDE || '').toString().trim();
          var kabotazFR = (data.kabotazFR || '').toString().trim();
          var gpsMobNr  = (gps === 'Tak') ? (data.gpsMobNr || '').toString().trim() : '';
          var nastepnyPrzeglad = (data.nastepnyPrzeglad || '').toString().trim();
          var nrBoczny = (data.nrBoczny || '').toString().trim();
          var ostatnioJezdzilo = (data.ostatnioJezdzilo || '').toString().trim();
          if (kabotazDE && kabotazDE !== 'Tak' && kabotazDE !== 'Nie') return { error: 'KabotazDE: tylko Tak / Nie' };
          if (kabotazFR && kabotazFR !== 'Tak' && kabotazFR !== 'Nie') return { error: 'KabotazFR: tylko Tak / Nie' };

          // Zapis wartości
          sa.getRange(i + 1, 7, 1, 6).setValues([[planista, '', marka, model, rok, uwagi]]);
          sa.getRange(i + 1, 13, 1, 3).setValues([[certyfikatL, euro, adr]]);
          sa.getRange(i + 1, 16, 1, 2).setValues([[gps, kartaPaliwowa]]);
          sa.getRange(i + 1, 18, 1, 7).setValues([[typ, dyspozytor, gb, it, fr, porozumienie, umowa]]);
          sa.getRange(i + 1, 25, 1, 4).setValues([[stawkaDE, stawkaUE, stawkaEksport, stawkaImport]]);
          sa.getRange(i + 1, 29, 1, 2).setValues([[odpady, odpadyKraje]]);
          sa.getRange(i + 1, 31, 1, 6).setValues([[kabotazDE, kabotazFR, gpsMobNr, nastepnyPrzeglad, nrBoczny, ostatnioJezdzilo]]);

          // Audit log dla każdej wrażliwej zmiany osobno
          var target = login + '/' + nrRejUp;
          if (planistaChanged) _writeAuditLog(caller.login, caller.rola, 'vehicle_planista_change', target, oldRow.planista || '', planista, powod, null);
          if (stawkaDEChanged) _writeAuditLog(caller.login, caller.rola, 'vehicle_stawkaDE_change', target, _normNum(oldRow.stawkaDE), _normNum(stawkaDE), powod, null);
          if (stawkaUEChanged) _writeAuditLog(caller.login, caller.rola, 'vehicle_stawkaUE_change', target, _normNum(oldRow.stawkaUE), _normNum(stawkaUE), powod, null);
          if (stawkaEksChanged) _writeAuditLog(caller.login, caller.rola, 'vehicle_stawkaEksport_change', target, _normNum(oldRow.stawkaEksport), _normNum(stawkaEksport), powod, null);
          if (stawkaImpChanged) _writeAuditLog(caller.login, caller.rola, 'vehicle_stawkaImport_change', target, _normNum(oldRow.stawkaImport), _normNum(stawkaImport), powod, null);

          return { ok: true, sensitiveChanged: sensitiveChanged };
        }
      }
      return { error: 'Pojazd nie istnieje' };
    } finally { try { lock.releaseLock(); } catch(le){} }
  } catch(e) {
    Logger.log('updateVehicleDetailsByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// Reset hasła (opiekun — swoich przewoźników)
function resetCarrierPasswordByOpiekun(login, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!_opiekunOwnsCarrier(caller.login, login)) return { error: 'Brak uprawnień do tego przewoźnika' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
    var uData = su.getDataRange().getValues();
    var loginLc = login.toString().trim().toLowerCase();
    for (var i = 1; i < uData.length; i++) {
      if ((uData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
        var newHaslo = _generateRandomPassword();
        su.getRange(i + 1, 2).setValue(newHaslo);
        try {
          sendPasswordResetEmail({ nazwa: uData[i][3], email: uData[i][4], login: uData[i][0], firma: uData[i][5] }, newHaslo);
        } catch(me) {}
        _writeAuditLog(caller.login, caller.rola, 'carrier_password_reset', login, '', 'Nowe hasło wygenerowane', '', null, false);
        return { ok: true };
      }
    }
    return { error: 'Przewoźnik nie istnieje' };
  } catch(e) {
    Logger.log('resetCarrierPasswordByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── NACZEPY (opiekun) ──
function addNaczepaByOpiekun(data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta opiekuna)' };
    if (!data) return { error: 'Brak danych' };
    var prz = (data.przewoznikLogin || '').toString().trim().toLowerCase();
    if (!_opiekunOwnsCarrier(caller.login, prz)) return { error: 'Nie możesz dodać naczepy temu przewoźnikowi (nie jest pod Twoją opieką)' };
    // Reuse admin addNaczepa logic — wywołujemy z forced caller=opiekun
    var result = addNaczepa(data, caller.login);
    if (result && result.ok) {
      _writeAuditLog(caller.login, caller.rola, 'naczepa_add', prz + '/' + (data.nrRej || ''), '', 'typ=' + (data.typNaczepy || ''), '', null, false);
    }
    return result;
  } catch(e) {
    Logger.log('addNaczepaByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateNaczepaByOpiekun(nrRej, data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    // Sprawdź własność po nrRej
    var det = getNaczepaDetails(nrRej, callerLogin);
    if (det && det.error) return det;
    return updateNaczepa(nrRej, data, caller.login);
  } catch(e) {
    Logger.log('updateNaczepaByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeNaczepaByOpiekun(nrRej, powod, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!powod || powod.toString().trim().length < 10) return { error: 'Wymagany powód (min. 10 znaków)' };
    var det = getNaczepaDetails(nrRej, callerLogin);
    if (det && det.error) return det;
    var result = removeNaczepa(nrRej, caller.login);
    if (result && result.ok) {
      _writeAuditLog(caller.login, caller.rola, 'naczepa_remove', nrRej, JSON.stringify(det.naczepa || {}), '(usunięto)', powod, null, true);
    }
    return result;
  } catch(e) {
    Logger.log('removeNaczepaByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── KIEROWCY (opiekun) ──
function addDriverByOpiekun(data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!data) return { error: 'Brak danych' };
    var prz = (data.przewoznikLogin || '').toString().trim().toLowerCase();
    if (!_opiekunOwnsCarrier(caller.login, prz)) return { error: 'Nie możesz dodać kierowcy temu przewoźnikowi' };
    var result = addDriver(data, caller.login);
    if (result && result.ok) {
      _writeAuditLog(caller.login, caller.rola, 'driver_add', prz + '/' + (data.login || ''), '', 'imie=' + (data.imie || '') + ' nazwisko=' + (data.nazwisko || ''), '', null, false);
    }
    return result;
  } catch(e) {
    Logger.log('addDriverByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateDriverByOpiekun(login, data, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var det = getDriverDetails(login, callerLogin);
    if (det && det.error) return det;
    return updateDriver(login, data, caller.login);
  } catch(e) {
    Logger.log('updateDriverByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeDriverByOpiekun(login, powod, callerLogin) {
  try {
    var caller = _requireOpiekun(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!powod || powod.toString().trim().length < 10) return { error: 'Wymagany powód (min. 10 znaków)' };
    var det = getDriverDetails(login, callerLogin);
    if (det && det.error) return det;
    var result = removeDriver(login, caller.login);
    if (result && result.ok) {
      _writeAuditLog(caller.login, caller.rola, 'driver_remove', login, JSON.stringify(det.driver || {}), '(usunięto)', powod, null, true);
    }
    return result;
  } catch(e) {
    Logger.log('removeDriverByOpiekun ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  PANEL PLANISTY — MOJA FLOTA (READ-ONLY)  ════════════
// =================================================================
// Planista widzi:
//   - swoje auta (filtr AUTA.Planista = caller.nazwa)
//   - kierowców przewoźników, którzy mają jego auta
//   - naczepy tych samych przewoźników
// Wszystko read-only (edytuje admin).

function _requirePlanista(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'planista') return null;
  return u;
}

function getPlanistaFleet(callerLogin) {
  try {
    var caller = _requirePlanista(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta planisty)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);

    var nazwaUp = (caller.nazwa || '').toString().trim().toUpperCase();
    if (!nazwaUp) return { ok: true, vehicles: [], drivers: [], trailers: [], carriers: [] };

    // 1. Auta (filtr po planiście)
    var vehicles = [];
    var carrierLogins = {}; // set przewoźników którzy mają moje auta
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var i = 1; i < aData.length; i++) {
        var plan = (aData[i][6] || '').toString().trim().toUpperCase();
        if (plan !== nazwaUp) continue;
        var login = (aData[i][0] || '').toString().trim();
        var nrRej = (aData[i][1] || '').toString().trim();
        if (!login || !nrRej) continue;
        carrierLogins[login.toLowerCase()] = true;
        vehicles.push(_parseAutoRow(aData[i], i + 1));
      }
    }

    // 2. Kierowcy moich przewoźników (read KIEROWCY, filter PrzewoznikLogin IN carrierLogins)
    var drivers = [];
    if (sk && Object.keys(carrierLogins).length > 0) {
      var kData = sk.getDataRange().getValues();
      for (var j = 1; j < kData.length; j++) {
        var przLc = (kData[j][3] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLc]) continue;
        drivers.push({
          login:          (kData[j][0] || '').toString().trim(),
          imie:           (kData[j][1] || '').toString().trim(),
          nazwisko:       (kData[j][2] || '').toString().trim(),
          przewoznikLogin:(kData[j][3] || '').toString().trim(),
          telefon:        (kData[j][4] || '').toString().trim(),
          email:          (kData[j][5] || '').toString().trim(),
          nrPrawaJazdy:   (kData[j][6] || '').toString().trim(),
          aktywny:        ((kData[j][7] || 'Tak').toString().trim() || 'Tak')
        });
      }
    }

    // 3. Naczepy moich przewoźników
    var trailers = [];
    if (sn && Object.keys(carrierLogins).length > 0) {
      var nData = sn.getDataRange().getValues();
      for (var k = 1; k < nData.length; k++) {
        var przLcN = (nData[k][1] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLcN]) continue;
        trailers.push({
          nrRej:          (nData[k][0] || '').toString().trim(),
          przewoznikLogin:(nData[k][1] || '').toString().trim(),
          typNaczepy:     (nData[k][2] || '').toString().trim(),
          marka:          (nData[k][3] || '').toString().trim(),
          model:          (nData[k][4] || '').toString().trim(),
          rok:            (nData[k][5] || '').toString().trim(),
          aktywna:        ((nData[k][6] || 'Tak').toString().trim() || 'Tak')
        });
      }
    }

    return {
      ok: true,
      planistaNazwa: caller.nazwa,
      vehicles: vehicles,
      drivers:  drivers,
      trailers: trailers,
      carriers: Object.keys(carrierLogins) // dla informacji ile przewoźników obsługuje
    };
  } catch(e) {
    Logger.log('getPlanistaFleet ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  PANEL DYSPOZYTORA — MOJA FLOTA (READ-ONLY)  ═════════
// =================================================================
// Dyspozytor widzi auta gdzie AUTA.Dyspozytor = caller.login
// + kierowców i naczepy przewoźników, którzy mają jego auta.

function _requireDyspozytor(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'dyspozytor') return null;
  return u;
}

function getDyspozytorFleet(callerLogin) {
  try {
    var caller = _requireDyspozytor(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta dyspozytora)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);

    var loginLc = (caller.login || '').toString().trim().toLowerCase();
    if (!loginLc) return { ok: true, vehicles: [], drivers: [], trailers: [], carriers: [] };

    // 1. Auta (filtr po Dyspozytor = caller.login)
    var vehicles = [];
    var carrierLogins = {};
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var i = 1; i < aData.length; i++) {
        var dys = (aData[i][18] || '').toString().trim().toLowerCase();
        if (dys !== loginLc) continue;
        var login = (aData[i][0] || '').toString().trim();
        var nrRej = (aData[i][1] || '').toString().trim();
        if (!login || !nrRej) continue;
        carrierLogins[login.toLowerCase()] = true;
        vehicles.push(_parseAutoRow(aData[i], i + 1));
      }
    }

    // 2. Kierowcy moich przewoźników
    var drivers = [];
    if (sk && Object.keys(carrierLogins).length > 0) {
      var kData = sk.getDataRange().getValues();
      for (var j = 1; j < kData.length; j++) {
        var przLc = (kData[j][3] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLc]) continue;
        drivers.push(_parseDriverRow(kData[j], j + 1));
      }
    }

    // 3. Naczepy moich przewoźników
    var trailers = [];
    if (sn && Object.keys(carrierLogins).length > 0) {
      var nData = sn.getDataRange().getValues();
      for (var k = 1; k < nData.length; k++) {
        var przLcN = (nData[k][1] || '').toString().trim().toLowerCase();
        if (!carrierLogins[przLcN]) continue;
        trailers.push(_parseNaczepaRow(nData[k], k + 1));
      }
    }

    // Statystyki — analogicznie do opiekuna
    var todayMs = new Date().getTime();
    var SEVEN = 7 * 24 * 60 * 60 * 1000;
    var statyAktywne = 0, statyJezdzace = 0, statyStojace7d = 0, statyNieaktywne = 0;
    var stojaceList = [];
    for (var sj = 0; sj < vehicles.length; sj++) {
      var vv = vehicles[sj];
      if (vv.aktywne === 'Nie') { statyNieaktywne++; continue; }
      statyAktywne++;
      var oj = vv.ostatnioJezdzilo || '';
      if (!oj) { statyJezdzace++; continue; }
      try {
        var ojDate = new Date(oj);
        if (isNaN(ojDate.getTime())) { statyJezdzace++; continue; }
        var diffMs = todayMs - ojDate.getTime();
        if (diffMs > SEVEN) {
          statyStojace7d++;
          var dni = Math.floor(diffMs / (24*60*60*1000));
          stojaceList.push({ nrRej: vv.nrRej, przewoznikLogin: vv.przewoznikLogin, ostatnioJezdzilo: oj, dniBezJazdy: dni, planista: vv.planista });
        } else { statyJezdzace++; }
      } catch(e) { statyJezdzace++; }
    }

    return {
      ok: true,
      dyspozytorNazwa: caller.nazwa,
      dyspozytorLogin: caller.login,
      vehicles: vehicles,
      drivers:  drivers,
      trailers: trailers,
      carriers: Object.keys(carrierLogins),
      stats: {
        liczbaAut: vehicles.length,
        autaAktywne: statyAktywne,
        autaJezdzace: statyJezdzace,
        autaStojace7dni: statyStojace7d,
        autaNieaktywne: statyNieaktywne,
        liczbaKierowcow: drivers.length,
        liczbaNaczep: trailers.length
      },
      stojaceList: stojaceList
    };
  } catch(e) {
    Logger.log('getDyspozytorFleet ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  DELEGACJE (wyjazdy) — pełny moduł  ══════════════════
// =================================================================

// Helper: parsuj wiersz DELEGACJE na obiekt (cols A-T = 1..20)
function _parseDelegacjaRow(row, wiersz) {
  function fd(v) {
    if (!v) return '';
    try {
      if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
      var s = v.toString().trim();
      if (!s) return '';
      // Spróbuj sparsować jako Date
      var d = new Date(s);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
      return s;
    } catch(e) { return v.toString(); }
  }
  return {
    wiersz: wiersz,
    id:                  (row[0] || '').toString().trim(),
    nrRej:               (row[1] || '').toString().trim(),
    naczepaNrRej:        (row[2] || '').toString().trim(),
    kierowcaLogin:       (row[3] || '').toString().trim(),
    kierowcaImieNazw:    (row[4] || '').toString().trim(),
    telefonKierowcy:     (row[5] || '').toString().trim(),
    dataWyjazdu:         fd(row[6]),
    krajWyjazdu:         (row[7] || '').toString().trim(),
    kodPocztowyWyjazdu:  (row[8] || '').toString().trim(),
    dataZjazduPlan:      fd(row[9]),
    krajZjazdu:          (row[10] || '').toString().trim(),
    kodPocztowyZjazdu:   (row[11] || '').toString().trim(),
    status:              (row[12] || 'zgloszony').toString().trim(),
    dataZjazduRzeczywista: fd(row[13]),
    zgloszonePrzez:      (row[14] || '').toString().trim(),
    dataZgloszenia:      fd(row[15]),
    zweryfikowanePrzez:  (row[16] || '').toString().trim(),
    dataWeryfikacji:     fd(row[17]),
    przewoznikLogin:     (row[18] || '').toString().trim(),
    uwagi:               (row[19] || '').toString().trim()
  };
}

// Generuj numer delegacji w formacie: DEL/NNN/MM/YY
// NNN = 001-999 (sekwencja w danym miesiącu, reset 1-go każdego miesiąca)
// MM  = 01-12 (miesiąc)
// YY  = 26 (ostatnie 2 cyfry roku)
// Wymaga aby caller trzymał LockService — czyta arkusz DELEGACJE i znajduje max sekwencję
// dla bieżącego MM/YY, +1.
function _generateDelegacjaId(sd) {
  var now = new Date();
  var mm = Utilities.formatDate(now, 'Europe/Warsaw', 'MM');
  var yy = Utilities.formatDate(now, 'Europe/Warsaw', 'yy');
  var maxSeq = 0;
  if (sd) {
    try {
      var data = sd.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var id = (data[i][0] || '').toString().trim();
        var m = id.match(/^DEL\/(\d{3})\/(\d{2})\/(\d{2})$/);
        if (!m) continue;
        if (m[2] === mm && m[3] === yy) {
          var seq = parseInt(m[1], 10) || 0;
          if (seq > maxSeq) maxSeq = seq;
        }
      }
    } catch(e) { Logger.log('_generateDelegacjaId scan ERR: ' + e.message); }
  }
  var newSeq = maxSeq + 1;
  if (newSeq > 999) newSeq = 999; // safety cap
  var seqStr = ('000' + newSeq).slice(-3);
  return 'DEL/' + seqStr + '/' + mm + '/' + yy;
}

// Przewoźnik zgłasza wyjazd (delegację)
function addDelegacja(data, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta przewoźnika)' };
    if (!data) return { error: 'Brak danych' };

    var nrRej = (data.nrRej || '').toString().trim().toUpperCase();
    var naczepaNrRej = (data.naczepaNrRej || '').toString().trim().toUpperCase();
    var kierowcaLogin = (data.kierowcaLogin || '').toString().trim().toLowerCase();
    var telefonKierowcy = (data.telefonKierowcy || '').toString().trim();
    var dataWyjazdu = (data.dataWyjazdu || '').toString().trim();
    var krajWyjazdu = (data.krajWyjazdu || '').toString().trim().toUpperCase();
    var kodPocztowyWyjazdu = (data.kodPocztowyWyjazdu || '').toString().trim();
    var dataZjazduPlan = (data.dataZjazduPlan || '').toString().trim();
    var krajZjazdu = (data.krajZjazdu || '').toString().trim().toUpperCase();
    var kodPocztowyZjazdu = (data.kodPocztowyZjazdu || '').toString().trim();
    var uwagi = (data.uwagi || '').toString().trim();

    // Walidacje minimalne
    if (!nrRej) return { error: 'Wybierz ciągnik' };
    if (!kierowcaLogin) return { error: 'Wybierz kierowcę' };
    if (!dataWyjazdu) return { error: 'Podaj datę i godzinę wyjazdu' };
    if (!krajWyjazdu) return { error: 'Podaj kraj wyjazdu' };
    if (!krajZjazdu) return { error: 'Podaj kraj zjazdu' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) { ensureDelegacjeSheet(ss); sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE); }

    var callerLc = caller.login.toString().trim().toLowerCase();

    // Walidacja: ciągnik należy do przewoźnika
    var nrRejOK = false;
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var i = 1; i < aData.length; i++) {
        if ((aData[i][0] || '').toString().trim().toLowerCase() === callerLc &&
            (aData[i][1] || '').toString().trim().toUpperCase() === nrRej &&
            (aData[i][2] || 'Tak').toString().trim().toUpperCase() === 'TAK') {
          nrRejOK = true; break;
        }
      }
    }
    if (!nrRejOK) return { error: 'Ciągnik "' + nrRej + '" nie należy do Ciebie lub jest nieaktywny' };

    // Walidacja: kierowca należy do przewoźnika + auto-fill imie/nazwisko/telefon
    var kierowcaImieNazw = '';
    var kierowcaOK = false;
    if (sk) {
      var kData = sk.getDataRange().getValues();
      for (var k = 1; k < kData.length; k++) {
        if ((kData[k][0] || '').toString().trim().toLowerCase() === kierowcaLogin &&
            (kData[k][3] || '').toString().trim().toLowerCase() === callerLc) {
          kierowcaOK = true;
          kierowcaImieNazw = ((kData[k][1] || '') + ' ' + (kData[k][2] || '')).toString().trim();
          if (!telefonKierowcy) telefonKierowcy = (kData[k][4] || '').toString().trim();
          break;
        }
      }
    }
    if (!kierowcaOK) return { error: 'Kierowca "' + kierowcaLogin + '" nie należy do Ciebie' };

    // Walidacja: naczepa (opcjonalna) — jeśli podana, musi należeć do przewoźnika
    if (naczepaNrRej) {
      var naczepaOK = false;
      if (sn) {
        var nData = sn.getDataRange().getValues();
        for (var nn = 1; nn < nData.length; nn++) {
          if ((nData[nn][0] || '').toString().trim().toUpperCase() === naczepaNrRej &&
              (nData[nn][1] || '').toString().trim().toLowerCase() === callerLc) {
            naczepaOK = true; break;
          }
        }
      }
      if (!naczepaOK) return { error: 'Naczepa "' + naczepaNrRej + '" nie należy do Ciebie' };
    }

    var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');

    // LOCK — sekwencja DEL/NNN/MM/YY musi być atomowa
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty, spróbuj ponownie' }; }
    var id;
    try {
      id = _generateDelegacjaId(sd);
      sd.appendRow([
        id, nrRej, naczepaNrRej, kierowcaLogin, kierowcaImieNazw, telefonKierowcy,
        dataWyjazdu, krajWyjazdu, kodPocztowyWyjazdu,
        dataZjazduPlan, krajZjazdu, kodPocztowyZjazdu,
        'zgloszony', '',
        caller.login, today, '', '',
        caller.login, uwagi
      ]);
    } finally { try { lock.releaseLock(); } catch(le) {} }

    return { ok: true, id: id };
  } catch(e) {
    Logger.log('addDelegacja ERR: ' + e.message);
    return { error: e.message };
  }
}

// Lista delegacji przewoźnika
function getDelegacjeForCarrier(callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { ok: true, delegacje: [] };
    var data = sd.getDataRange().getValues();
    var callerLc = caller.login.toString().trim().toLowerCase();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var pl = (data[i][18] || '').toString().trim().toLowerCase();
      if (pl !== callerLc) continue;
      list.push(_parseDelegacjaRow(data[i], i + 1));
    }
    // Sort: najnowsze (po DataZgloszenia desc)
    list.sort(function(a, b) { return (b.dataZgloszenia || '').localeCompare(a.dataZgloszenia || ''); });
    return { ok: true, delegacje: list };
  } catch(e) {
    Logger.log('getDelegacjeForCarrier ERR: ' + e.message);
    return { error: e.message };
  }
}

// Lista delegacji dla eksportu (widzi wszystkie zgłoszone i w trasie domyślnie)
function getDelegacjeForEksport(callerLogin, includeHistory) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller || (caller.rola !== 'eksport' && caller.rola !== 'admin' && caller.rola !== 'pracownik')) {
      return { error: 'Brak uprawnień (wymaga konta eksportu)' };
    }
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { ok: true, delegacje: [] };
    var data = sd.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var del = _parseDelegacjaRow(data[i], i + 1);
      if (!del.id) continue;
      if (!includeHistory && (del.status === 'zjechal' || del.status === 'anulowany')) continue;
      list.push(del);
    }
    // Sort: po DataWyjazdu rosnąco (najbliższe najpierw)
    list.sort(function(a, b) { return (a.dataWyjazdu || '').localeCompare(b.dataWyjazdu || ''); });
    return { ok: true, delegacje: list };
  } catch(e) {
    Logger.log('getDelegacjeForEksport ERR: ' + e.message);
    return { error: e.message };
  }
}

// Lista delegacji dla weryfikatora (widzi wszystkie + filtr historii)
function getDelegacjeForWeryfikator(callerLogin, includeHistory) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller || (caller.rola !== 'weryfikator' && caller.rola !== 'admin')) {
      return { error: 'Brak uprawnień (wymaga konta weryfikatora)' };
    }
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { ok: true, delegacje: [] };
    var data = sd.getDataRange().getValues();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var del = _parseDelegacjaRow(data[i], i + 1);
      if (!del.id) continue;
      if (!includeHistory && (del.status === 'zjechal' || del.status === 'anulowany')) continue;
      list.push(del);
    }
    list.sort(function(a, b) { return (a.dataWyjazdu || '').localeCompare(b.dataWyjazdu || ''); });
    return { ok: true, delegacje: list };
  } catch(e) {
    Logger.log('getDelegacjeForWeryfikator ERR: ' + e.message);
    return { error: e.message };
  }
}

// Lista delegacji dla dyspozytora (jego aut)
function getDelegacjeForDyspozytor(callerLogin) {
  try {
    var caller = _requireDyspozytor(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { ok: true, delegacje: [] };

    // Najpierw zbuduj zbiór nrRej aut, których jestem dyspozytorem
    var loginLc = caller.login.toString().trim().toLowerCase();
    var myNrRej = {};
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var i = 1; i < aData.length; i++) {
        if ((aData[i][18] || '').toString().trim().toLowerCase() === loginLc) {
          var nr = (aData[i][1] || '').toString().trim().toUpperCase();
          if (nr) myNrRej[nr] = true;
        }
      }
    }
    var data = sd.getDataRange().getValues();
    var list = [];
    for (var j = 1; j < data.length; j++) {
      var del = _parseDelegacjaRow(data[j], j + 1);
      if (!del.id) continue;
      if (!myNrRej[(del.nrRej || '').toUpperCase()]) continue;
      list.push(del);
    }
    list.sort(function(a, b) { return (b.dataWyjazdu || '').localeCompare(a.dataWyjazdu || ''); });
    return { ok: true, delegacje: list };
  } catch(e) {
    Logger.log('getDelegacjeForDyspozytor ERR: ' + e.message);
    return { error: e.message };
  }
}

// Weryfikator oznacza "w trasie"
function markDelegacjaInTransit(id, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller || (caller.rola !== 'weryfikator' && caller.rola !== 'admin')) {
      return { error: 'Brak uprawnień' };
    }
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { error: 'Brak arkusza DELEGACJE' };
    var data = sd.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var st = (data[i][12] || '').toString().trim();
        if (st === 'zjechal' || st === 'anulowany') return { error: 'Nie można zmienić statusu — delegacja zakończona' };
        var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
        sd.getRange(i + 1, 13).setValue('w_trasie');
        sd.getRange(i + 1, 17).setValue(caller.login);
        sd.getRange(i + 1, 18).setValue(today);
        return { ok: true };
      }
    }
    return { error: 'Delegacja nie istnieje' };
  } catch(e) {
    Logger.log('markDelegacjaInTransit ERR: ' + e.message);
    return { error: e.message };
  }
}

// Weryfikator oznacza "zjechał" + auto-update AUTA.OstatnioJezdzilo
function markDelegacjaReturned(id, dataZjazduRzeczywista, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller || (caller.rola !== 'weryfikator' && caller.rola !== 'admin')) {
      return { error: 'Brak uprawnień' };
    }
    if (!dataZjazduRzeczywista) return { error: 'Podaj datę zjazdu' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { error: 'Brak arkusza DELEGACJE' };
    var data = sd.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var st = (data[i][12] || '').toString().trim();
        if (st === 'anulowany') return { error: 'Nie można zmienić statusu — delegacja anulowana' };
        var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
        sd.getRange(i + 1, 13).setValue('zjechal');
        sd.getRange(i + 1, 14).setValue(dataZjazduRzeczywista);
        sd.getRange(i + 1, 17).setValue(caller.login);
        sd.getRange(i + 1, 18).setValue(today);

        // Auto-update AUTA.OstatnioJezdzilo (col 36)
        var nrRej = (data[i][1] || '').toString().trim().toUpperCase();
        var carrierLc = (data[i][18] || '').toString().trim().toLowerCase();
        if (nrRej && carrierLc) {
          var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
          if (sa) {
            var aData = sa.getDataRange().getValues();
            for (var ai = 1; ai < aData.length; ai++) {
              if ((aData[ai][0] || '').toString().trim().toLowerCase() === carrierLc &&
                  (aData[ai][1] || '').toString().trim().toUpperCase() === nrRej) {
                // Zapisz tylko datę (yyyy-MM-dd) bez godziny
                var dateOnly = dataZjazduRzeczywista.toString().substring(0, 10);
                sa.getRange(ai + 1, 36).setValue(dateOnly);
                break;
              }
            }
          }
        }
        return { ok: true };
      }
    }
    return { error: 'Delegacja nie istnieje' };
  } catch(e) {
    Logger.log('markDelegacjaReturned ERR: ' + e.message);
    return { error: e.message };
  }
}

// Anulowanie delegacji (przewoznik gdy 'zgloszony' lub admin/weryfikator)
function cancelDelegacja(id, powod, callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sd = ss.getSheetByName(CONFIG.SHEET_DELEGACJE);
    if (!sd) return { error: 'Brak arkusza DELEGACJE' };
    var data = sd.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() === id) {
        var st = (data[i][12] || '').toString().trim();
        var owner = (data[i][18] || '').toString().trim().toLowerCase();
        // Permission: admin/weryfikator zawsze; przewoźnik tylko swoja + zgloszony
        if (caller.rola === 'przewoznik') {
          if (owner !== caller.login.toString().toLowerCase()) return { error: 'To nie jest Twoja delegacja' };
          if (st !== 'zgloszony') return { error: 'Można anulować tylko zgłoszone (jeszcze nie potwierdzone)' };
        } else if (caller.rola !== 'admin' && caller.rola !== 'weryfikator') {
          return { error: 'Brak uprawnień' };
        }
        var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
        sd.getRange(i + 1, 13).setValue('anulowany');
        sd.getRange(i + 1, 17).setValue(caller.login);
        sd.getRange(i + 1, 18).setValue(today);
        // Append do Uwag
        var oldUwagi = (data[i][19] || '').toString().trim();
        var newUwagi = (oldUwagi ? oldUwagi + ' | ' : '') + 'ANULOWANE (' + caller.login + '): ' + (powod || '');
        sd.getRange(i + 1, 20).setValue(newUwagi);
        return { ok: true };
      }
    }
    return { error: 'Delegacja nie istnieje' };
  } catch(e) {
    Logger.log('cancelDelegacja ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  PANEL EKSPORT — placeholder (pełen w Fazie 2)  ══════
// =================================================================
function _requireEksport(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'eksport') return null;
  return u;
}

function getEksportData(callerLogin, includeHistory) {
  try {
    var caller = _requireEksport(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta eksportu)' };
    var r = getDelegacjeForEksport(callerLogin, includeHistory);
    if (!r || r.error) return r;
    return { ok: true, eksportNazwa: caller.nazwa, delegacje: r.delegacje };
  } catch(e) {
    Logger.log('getEksportData ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  PANEL WERYFIKATOR — placeholder  ═══════════════════
// =================================================================
function _requireWeryfikator(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'weryfikator') return null;
  return u;
}

function getWeryfikatorData(callerLogin, includeHistory) {
  try {
    var caller = _requireWeryfikator(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta weryfikatora)' };
    var r = getDelegacjeForWeryfikator(callerLogin, includeHistory);
    if (!r || r.error) return r;
    return { ok: true, weryfikatorNazwa: caller.nazwa, delegacje: r.delegacje };
  } catch(e) {
    Logger.log('getWeryfikatorData ERR: ' + e.message);
    return { error: e.message };
  }
}

// =================================================================
// ═══════════  PANEL PRZEWOŹNIKA — MOJA FLOTA  ═════════════════════
// =================================================================
// Przewoźnik widzi i edytuje TYLKO swoich kierowców i swoje naczepy.
// Auta — readonly (edytuje admin).

// Helper: sprawdza rolę przewoznika. Zwraca caller lub null.
function _requireCarrier(callerLogin) {
  var u = validateCaller(callerLogin);
  if (!u || u.rola !== 'przewoznik') return null;
  return u;
}

// ── AUTA — moje (readonly) ──
// Agregator: zwraca jednym strzałem wszystkie auta + kierowców + naczepy przewoźnika
// Używane przez modal "Zgłoś wyjazd" do wypełnienia 3 dropdownów
function getMyFleet(callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta przewoźnika)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    var loginLc = caller.login.toString().trim().toLowerCase();

    var vehicles = [];
    if (sa) {
      var aData = sa.getDataRange().getValues();
      for (var i = 1; i < aData.length; i++) {
        if ((aData[i][0] || '').toString().trim().toLowerCase() !== loginLc) continue;
        if (!(aData[i][1] || '').toString().trim()) continue;
        vehicles.push(_parseAutoRow(aData[i], i + 1));
      }
    }

    var drivers = [];
    if (sk) {
      var kData = sk.getDataRange().getValues();
      for (var j = 1; j < kData.length; j++) {
        if ((kData[j][3] || '').toString().trim().toLowerCase() !== loginLc) continue;
        drivers.push(_parseDriverRow(kData[j], j + 1));
      }
    }

    var trailers = [];
    if (sn) {
      var nData = sn.getDataRange().getValues();
      for (var k = 1; k < nData.length; k++) {
        if ((nData[k][1] || '').toString().trim().toLowerCase() !== loginLc) continue;
        if (!(nData[k][0] || '').toString().trim()) continue;
        trailers.push(_parseNaczepaRow(nData[k], k + 1));
      }
    }

    return { ok: true, vehicles: vehicles, drivers: drivers, trailers: trailers };
  } catch(e) {
    Logger.log('getMyFleet ERR: ' + e.message);
    return { error: e.message };
  }
}

function getMyVehicles(callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień (wymaga konta przewoźnika)' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sa = ss.getSheetByName(CONFIG.SHEET_AUTA);
    if (!sa) return { ok: true, vehicles: [] };
    var data = sa.getDataRange().getValues();
    var loginLc = caller.login.toString().trim().toLowerCase();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var login = (data[i][0] || '').toString().trim().toLowerCase();
      if (login !== loginLc) continue;
      list.push(_parseAutoRow(data[i], i + 1));
    }
    return { ok: true, vehicles: list };
  } catch(e) {
    Logger.log('getMyVehicles ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── KIEROWCY — moi ──
function getMyDrivers(callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) { ensureKierowcySheet(ss); return { ok: true, drivers: [] }; }
    var data = sk.getDataRange().getValues();
    var loginLc = caller.login.toString().trim().toLowerCase();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var przewoznik = (data[i][3] || '').toString().trim().toLowerCase();
      if (przewoznik !== loginLc) continue;
      list.push({
        wiersz: i + 1,
        login:         (data[i][0] || '').toString().trim(),
        imie:          (data[i][1] || '').toString().trim(),
        nazwisko:      (data[i][2] || '').toString().trim(),
        telefon:       (data[i][4] || '').toString().trim(),
        email:         (data[i][5] || '').toString().trim(),
        nrPrawaJazdy:  (data[i][6] || '').toString().trim(),
        aktywny:       ((data[i][7] || 'Tak').toString().trim() || 'Tak'),
        dataDodania:   (data[i][8] || '').toString().trim()
      });
    }
    return { ok: true, drivers: list };
  } catch(e) {
    Logger.log('getMyDrivers ERR: ' + e.message);
    return { error: e.message };
  }
}

function addMyDriver(data, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!data) return { error: 'Brak danych' };
    var login      = (data.login || '').toString().trim().toLowerCase();
    var imie       = (data.imie || '').toString().trim();
    var nazwisko   = (data.nazwisko || '').toString().trim();
    var telefon    = (data.telefon || '').toString().trim();
    var email      = (data.email || '').toString().trim();
    var nrPrawa    = (data.nrPrawaJazdy || '').toString().trim();

    if (!imie || !nazwisko) return { error: 'Imię i nazwisko wymagane' };
    if (email && !_isValidEmail(email)) return { error: 'Nieprawidłowy email' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) { ensureKierowcySheet(ss); sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      // Auto-generuj login jeśli brak
      if (!login) {
        login = _generateDriverLogin(imie, nazwisko, sk);
      } else {
        if (!_isValidDriverLogin(login)) return { error: 'Login 3-30 znaków, małe litery/cyfry/_-.' };
        var kData = sk.getDataRange().getValues();
        for (var i = 1; i < kData.length; i++) {
          if ((kData[i][0] || '').toString().trim().toLowerCase() === login) {
            return { error: 'Kierowca "' + login + '" już istnieje' };
          }
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      // PrzewoznikLogin wymuszony = caller.login (przewoznik nie może dodać do cudzej firmy)
      sk.appendRow([login, imie, nazwisko, caller.login, telefon, email, nrPrawa, 'Tak', today, caller.login]);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true, login: login };
  } catch(e) {
    Logger.log('addMyDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateMyDriver(login, data, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!login || !data) return { error: 'Brak danych' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = 1; i < kData.length; i++) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          // Ownership check — kierowca musi należeć do callera
          if ((kData[i][3] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz edytować kierowcy innego przewoźnika' };
          }
          var imie     = (data.imie         || '').toString().trim() || (kData[i][1] || '').toString();
          var nazw     = (data.nazwisko     || '').toString().trim() || (kData[i][2] || '').toString();
          // PrzewoznikLogin — zablokowany, przewoźnik nie może "przenieść" kierowcy
          var tel      = (data.telefon      || '').toString().trim();
          var em       = (data.email        || '').toString().trim();
          var np       = (data.nrPrawaJazdy || '').toString().trim();
          if (em && !_isValidEmail(em)) return { error: 'Nieprawidłowy email' };
          // cols B, C, E, F, G (pos 2, 3, 5, 6, 7) — NIE ruszamy D (PrzewoznikLogin)
          sk.getRange(i + 1, 2, 1, 2).setValues([[imie, nazw]]);
          sk.getRange(i + 1, 5, 1, 3).setValues([[tel, em, np]]);
          return { ok: true };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('updateMyDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

function toggleMyDriverActive(login, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = 1; i < kData.length; i++) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          if ((kData[i][3] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz zmienić kierowcy innego przewoźnika' };
          }
          var current = (kData[i][7] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sk.getRange(i + 1, 8).setValue(newVal);
          return { ok: true, aktywny: newVal };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('toggleMyDriverActive ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeMyDriver(login, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sk = ss.getSheetByName(CONFIG.SHEET_KIEROWCY);
    if (!sk) return { error: 'Brak arkusza KIEROWCY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var kData = sk.getDataRange().getValues();
      var loginLc = login.toString().trim().toLowerCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = kData.length - 1; i >= 1; i--) {
        if ((kData[i][0] || '').toString().trim().toLowerCase() === loginLc) {
          if ((kData[i][3] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz usunąć kierowcy innego przewoźnika' };
          }
          sk.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { error: 'Kierowca nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('removeMyDriver ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── NACZEPY — moje ──
function getMyTrailers(callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) { ensureNaczepySheet(ss); return { ok: true, naczepy: [] }; }
    var data = sn.getDataRange().getValues();
    var loginLc = caller.login.toString().trim().toLowerCase();
    var list = [];
    for (var i = 1; i < data.length; i++) {
      var przewoznik = (data[i][1] || '').toString().trim().toLowerCase();
      if (przewoznik !== loginLc) continue;
      list.push({
        wiersz: i + 1,
        nrRej:        (data[i][0] || '').toString().trim(),
        typNaczepy:   (data[i][2] || '').toString().trim(),
        marka:        (data[i][3] || '').toString().trim(),
        model:        (data[i][4] || '').toString().trim(),
        rok:          (data[i][5] || '').toString().trim(),
        aktywna:      ((data[i][6] || 'Tak').toString().trim() || 'Tak'),
        dataDodania:  (data[i][7] || '').toString().trim()
      });
    }
    return { ok: true, naczepy: list };
  } catch(e) {
    Logger.log('getMyTrailers ERR: ' + e.message);
    return { error: e.message };
  }
}

function addMyTrailer(data, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!data) return { error: 'Brak danych' };
    var nrRej = (data.nrRej || '').toString().trim().toUpperCase().replace(/\s+/g, '');
    var typ   = (data.typNaczepy || '').toString().trim();
    var marka = (data.marka || '').toString().trim();
    var model = (data.model || '').toString().trim();
    var rok   = (data.rok !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : '';

    if (!_isValidNaczepaNr(nrRej)) return { error: 'Nr rejestracyjny 3-12 znaków (A-Z, 0-9)' };
    if (!typ) return { error: 'Wybierz typ naczepy' };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) { ensureNaczepySheet(ss); sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrRej) {
          return { error: 'Naczepa "' + nrRej + '" już istnieje' };
        }
      }
      var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
      // PrzewoznikLogin wymuszony = caller.login
      sn.appendRow([nrRej, caller.login, typ, marka, model, rok, 'Tak', today, caller.login]);
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
    return { ok: true };
  } catch(e) {
    Logger.log('addMyTrailer ERR: ' + e.message);
    return { error: e.message };
  }
}

function updateMyTrailer(nrRej, data, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    if (!nrRej || !data) return { error: 'Brak danych' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          if ((nData[i][1] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz edytować naczepy innego przewoźnika' };
          }
          var typ   = (data.typNaczepy || '').toString().trim() || (nData[i][2] || '');
          var marka = (data.marka      || '').toString().trim();
          var model = (data.model      || '').toString().trim();
          var rok   = (data.rok !== undefined && data.rok !== null) ? (parseInt(data.rok) || '') : (nData[i][5] || '');
          // cols C, D, E, F (pos 3-6) — NIE ruszamy B (PrzewoznikLogin)
          sn.getRange(i + 1, 3, 1, 4).setValues([[typ, marka, model, rok]]);
          return { ok: true };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('updateMyTrailer ERR: ' + e.message);
    return { error: e.message };
  }
}

function toggleMyTrailerActive(nrRej, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = 1; i < nData.length; i++) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          if ((nData[i][1] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz zmienić naczepy innego przewoźnika' };
          }
          var current = (nData[i][6] || 'Tak').toString().trim().toUpperCase();
          var newVal = (current === 'NIE') ? 'Tak' : 'Nie';
          sn.getRange(i + 1, 7).setValue(newVal);
          return { ok: true, aktywna: newVal };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('toggleMyTrailerActive ERR: ' + e.message);
    return { error: e.message };
  }
}

function removeMyTrailer(nrRej, callerLogin) {
  try {
    var caller = _requireCarrier(callerLogin);
    if (!caller) return { error: 'Brak uprawnień' };
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sn = ss.getSheetByName(CONFIG.SHEET_NACZEPY);
    if (!sn) return { error: 'Brak arkusza NACZEPY' };

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch(le) { return { error: 'System zajęty' }; }
    try {
      var nData = sn.getDataRange().getValues();
      var nrUp = nrRej.toString().trim().toUpperCase();
      var callerLc = caller.login.toString().trim().toLowerCase();
      for (var i = nData.length - 1; i >= 1; i--) {
        if ((nData[i][0] || '').toString().trim().toUpperCase() === nrUp) {
          if ((nData[i][1] || '').toString().trim().toLowerCase() !== callerLc) {
            return { error: 'Nie możesz usunąć naczepy innego przewoźnika' };
          }
          sn.deleteRow(i + 1);
          return { ok: true };
        }
      }
      return { error: 'Naczepa nie istnieje' };
    } finally {
      try { lock.releaseLock(); } catch(le) {}
    }
  } catch(e) {
    Logger.log('removeMyTrailer ERR: ' + e.message);
    return { error: e.message };
  }
}

// ── Szablony email ──
function sendAccountCreatedEmail(carrier, haslo) {
  if (!carrier || !carrier.email) return;
  var appUrl = ''; try { appUrl = ScriptApp.getService().getUrl(); } catch(e){}
  var html = buildCarrierEmail({
    headerColor: '#16a34a',
    title: 'Witamy w portalu <b>MAGGuarantee</b>! Twoje konto zostało pomyślnie utworzone.',
    boxBg: '#f0fdf4', boxBorder: '#22c55e',
    rows: [
      { label: 'Firma:', value: escHtml(carrier.firma || carrier.nazwa), bold: true },
      { label: 'Login:', value: '<b style="font-family:monospace;font-size:15px">' + escHtml(carrier.login) + '</b>' },
      { label: 'Hasło:', value: '<b style="font-family:monospace;font-size:15px;background:#fef3c7;padding:4px 10px;border-radius:4px">' + escHtml(haslo) + '</b>' }
    ],
    paragraphs: [
      'Prosimy zachować te dane w bezpiecznym miejscu.',
      appUrl ? 'Zaloguj się do portalu: <a href="' + appUrl + '">' + appUrl + '</a>' : 'Zaloguj się do portalu MAGGuarantee.',
      'Przy pierwszym logowaniu otrzymasz na e-mail 6-cyfrowy kod weryfikacyjny (2FA).'
    ],
    year: new Date().getFullYear()
  });
  _sendThreadedEmail({
    to: carrier.email,
    subject: 'MAGGuarantee — konto utworzone',
    htmlBody: html,
    name: 'MAGGuarantee'
  });
}

function sendPasswordResetEmail(carrier, haslo) {
  if (!carrier || !carrier.email) return;
  var appUrl = ''; try { appUrl = ScriptApp.getService().getUrl(); } catch(e){}
  var html = buildCarrierEmail({
    headerColor: '#f59e0b',
    title: 'Twoje hasło w portalu MAGGuarantee zostało <b>zresetowane</b> przez administratora.',
    boxBg: '#fffbeb', boxBorder: '#f59e0b',
    rows: [
      { label: 'Login:', value: '<b style="font-family:monospace">' + escHtml(carrier.login) + '</b>' },
      { label: 'Nowe hasło:', value: '<b style="font-family:monospace;font-size:15px;background:#fef3c7;padding:4px 10px;border-radius:4px">' + escHtml(haslo) + '</b>' }
    ],
    paragraphs: [
      'Zalecamy zmianę hasła przy pierwszym logowaniu.',
      appUrl ? 'Zaloguj się: <a href="' + appUrl + '">' + appUrl + '</a>' : 'Zaloguj się do portalu MAGGuarantee.'
    ],
    year: new Date().getFullYear()
  });
  _sendThreadedEmail({
    to: carrier.email,
    subject: 'MAGGuarantee — reset hasła',
    htmlBody: html,
    name: 'MAGGuarantee'
  });
}

function sendAccountDeactivatedEmail(carrier) {
  if (!carrier || !carrier.email) return;
  var html = buildCarrierEmail({
    headerColor: '#dc2626',
    title: 'Twoje konto w portalu MAGGuarantee zostało <b>dezaktywowane</b>.',
    boxBg: '#fef2f2', boxBorder: '#ef4444',
    rows: [
      { label: 'Login:', value: '<b style="font-family:monospace">' + escHtml(carrier.login) + '</b>' },
      { label: 'Firma:', value: escHtml(carrier.firma || carrier.nazwa) }
    ],
    paragraphs: [
      'Logowanie do portalu jest obecnie zablokowane.',
      'W celu uzyskania dodatkowych informacji prosimy o kontakt z opiekunem Magtrans.'
    ],
    year: new Date().getFullYear()
  });
  _sendThreadedEmail({
    to: carrier.email,
    subject: 'MAGGuarantee — konto dezaktywowane',
    htmlBody: html,
    name: 'MAGGuarantee'
  });
}

function sendAccountReactivatedEmail(carrier) {
  if (!carrier || !carrier.email) return;
  var appUrl = ''; try { appUrl = ScriptApp.getService().getUrl(); } catch(e){}
  var html = buildCarrierEmail({
    headerColor: '#16a34a',
    title: 'Twoje konto w portalu MAGGuarantee zostało <b>ponownie aktywowane</b>.',
    boxBg: '#f0fdf4', boxBorder: '#22c55e',
    rows: [
      { label: 'Login:', value: '<b style="font-family:monospace">' + escHtml(carrier.login) + '</b>' }
    ],
    paragraphs: [
      'Możesz ponownie zalogować się do portalu.',
      appUrl ? 'Logowanie: <a href="' + appUrl + '">' + appUrl + '</a>' : 'Zaloguj się do portalu MAGGuarantee.'
    ],
    year: new Date().getFullYear()
  });
  _sendThreadedEmail({
    to: carrier.email,
    subject: 'MAGGuarantee — konto aktywowane',
    htmlBody: html,
    name: 'MAGGuarantee'
  });
}

// =================================================================
// ═══════════  KONIEC PANEL ADMINA  ════════════════════════════════
// =================================================================

// ── WNIOSKI DLA PRZEWOŹNIKA (tylko swoje) ──
// Przyjmuje login — serwer sam weryfikuje użytkownika i pobiera nazwę
// To zapewnia spójność: col B w WNIOSEK zapisywana jest z caller.nazwa (col D),
// a filtrowanie odbywa się po tej samej wartości. Dodatkowy fallback na col F.
function getClaimsForCarrier(callerLogin) {
  try {
    var caller = validateCaller(callerLogin);
    if (!caller || (caller.rola !== 'przewoznik' && caller.rola !== 'admin')) return [];
    var nazwaUp = caller.nazwa ? caller.nazwa.toUpperCase() : '';
    var firmaUp = caller.przewoznik ? caller.przewoznik.toUpperCase() : '';
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var claims = [];

    function sv(v) { return (v !== undefined && v !== null) ? v.toString().trim() : ''; }
    function sn(v) { return (v !== undefined && v !== null) ? (parseFloat(v) || 0) : 0; }
    function sd(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'dd.MM.yyyy');
        var s = v.toString().trim();
        if (!s) return '';
        var d2 = new Date(s);
        return isNaN(d2.getTime()) ? s : Utilities.formatDate(d2, 'Europe/Warsaw', 'dd.MM.yyyy');
      } catch(e2) { return v.toString(); }
    }
    function st2(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) {
          var h = v.getHours(), m = v.getMinutes();
          return (h<10?'0'+h:h)+':'+(m<10?'0'+m:m);
        }
        var s = v.toString().trim();
        if (s.length >= 4 && s.indexOf(':') > 0) return s.substring(0,5);
        return '';
      } catch(e2) { return ''; }
    }

    for (var i = 1; i < data.length; i++) {
      var d = data[i];
      var colB = sv(d[1]).toUpperCase();
      if (!colB) continue;
      // Dopasuj po nazwie (col D) lub firmie (col F)
      // Admin widzi wszystkie wnioski w panelu przewoźnika (bez filtra po nazwie)
      if (caller.rola !== 'admin') {
        if (colB !== nazwaUp && (!firmaUp || colB !== firmaUp)) continue;
      }

      var status = sv(d[13]);
      var statusMasked = status;
      if (status.toUpperCase().indexOf('OCZEKUJE') >= 0 || status.toUpperCase().indexOf('AUTORYZACJA') >= 0) {
        statusMasked = 'NA WERYFIKACJI';
      }

      claims.push({
        wiersz: i + 1,
        nrZgl:    sv(d[0]),
        przewoznik: sv(d[1]),
        pojazd:   sv(d[2]),
        dataStart: sd(d[3]),
        godzinaStart: st2(d[4]),
        dataStop:  sd(d[5]),
        godzinaStop: st2(d[6]),
        dniJezdne: sv(d[7]),
        przebieg:  sv(d[8]),
        kmNaDzien: sv(d[9]),
        kmGwarant: sv(d[10]),
        roznica:   sv(d[11]),
        doplata:   sv(d[12]),
        status:    statusMasked,
        komentarz: sv(d[14]).substring(0, 500),
        nrZlecenia: sv(d[15]),
        dataZlecenia: sv(d[16]),
        limitGwarancyjny: sv(d[17]),
        planista:  '',
        ocenaKontakt: '',
        ocenaTrasa: '',
        ocenaZlecenia: '',
        zmianaSped: '',
        argumentacja: '',
        opiekun:   sv(d[24]),
        ocenaOpKontakt: '',
        ocenaOpDostepnosc: '',
        ocenaOpProblemy: '',
        zmianaOpiekun: '',
        argOpiekun: '',
        autoryzacja: '',
        autoryzacjaOpis: '',
        autoryzacjaData: '',
        dataZgloszenia: sv(d[33]),
        dataZmianyStatusu: sv(d[34]),
        kwotaWnioskowana: sv(d[35]),
        reklamacjaZlozona: sv(d[36]),
        reklamacjaTresc: sv(d[37]).substring(0, 300),
        reklamacjaOdpMagtrans: sv(d[38]).substring(0, 300),
        reklamacjaKwota: sv(d[39]),
        reklamacjaZatwKwota: sv(d[40]),
        korektaGodzin: sn(d[41]),
        statusPrzedReklamacja: sv(d[42]),
        origDataStart: sd(d[43]),
        origGodzinaStart: st2(d[44]),
        origDataStop: sd(d[45]),
        origGodzinaStop: st2(d[46]),
        origPrzebieg: sv(d[47]),
        marza:        '',
        kwotaMaksima: ''
      });
    }
    claims.reverse();
    return claims;
  } catch(e) {
    Logger.log('getClaimsForCarrier ERR: ' + e.message);
    return [{ _error: e.message }];
  }
}

// ── WNIOSKI DLA PRACOWNIKA (wszystkie) ──
function getAllClaims(filterStatus, filterPrzewoznik, callerLogin) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var claims = [];

    // Filtr dla opiekuna: widzi tylko wnioski SWOICH przewoźników (po firmie)
    // Budujemy zbiór nazw firm dla opiekuna (col F w UZYTKOWNICY).
    var opiekunCarrierFirmsUp = null; // null = brak filtra (admin/pracownik widzą wszystko)
    if (callerLogin) {
      var caller = validateCaller(callerLogin);
      if (caller && caller.rola === 'opiekun') {
        opiekunCarrierFirmsUp = {};
        var su = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
        if (su) {
          var uData = su.getDataRange().getValues();
          var opLc = caller.login.toString().trim().toLowerCase();
          for (var ui = 1; ui < uData.length; ui++) {
            if ((uData[ui][10] || '').toString().trim().toLowerCase() === opLc) {
              var firmaUp = (uData[ui][5] || '').toString().trim().toUpperCase();
              if (firmaUp) opiekunCarrierFirmsUp[firmaUp] = true;
              // także dopasowanie po nazwie (col D) gdyby wnioski używały nazwy zamiast firmy
              var nazwaUp = (uData[ui][3] || '').toString().trim().toUpperCase();
              if (nazwaUp) opiekunCarrierFirmsUp[nazwaUp] = true;
            }
          }
        }
      }
    }
    var fs = (filterStatus || 'ALL').toString().toUpperCase().trim();
    var fp = (filterPrzewoznik || 'ALL').toString().toUpperCase().trim();

    // Pomocnicze — MUSZĄ być poza pętlą (GAS Rhino ES5 nie pozwala deklarować funkcji w pętli)
    function sv(v) { return (v !== undefined && v !== null) ? v.toString().trim() : ''; }
    function sn(v) { return (v !== undefined && v !== null) ? (parseFloat(v) || 0) : 0; }
    function sd(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'dd.MM.yyyy');
        var s = v.toString().trim();
        if (!s) return '';
        var d2 = new Date(s);
        return isNaN(d2.getTime()) ? s : Utilities.formatDate(d2, 'Europe/Warsaw', 'dd.MM.yyyy');
      } catch(e2) { return v.toString(); }
    }
    function st2(v) {
      if (!v) return '';
      try {
        if (v instanceof Date) {
          var h = v.getHours(), m = v.getMinutes();
          return (h<10?'0'+h:h)+':'+(m<10?'0'+m:m);
        }
        var s = v.toString().trim();
        if (/\d{1,2}:\d{2}/.test(s)) return s.substring(0,5);
        return '';
      } catch(e2) { return ''; }
    }

    for (var i = 1; i < data.length; i++) {
      var d = data[i];
      var colA = (d[0] !== undefined && d[0] !== null) ? d[0].toString().trim() : '';
      var colB = (d[1] !== undefined && d[1] !== null) ? d[1].toString().trim() : '';
      var colN = (d[13] !== undefined && d[13] !== null) ? d[13].toString().trim() : '';

      if (!colA && !colB) continue;

      // Filtr opiekuna (scope do jego przewoźników)
      if (opiekunCarrierFirmsUp && !opiekunCarrierFirmsUp[colB.toUpperCase()]) continue;

      // Filtr statusu
      if (fs !== 'ALL') {
        var stUp = colN.toUpperCase();
        if (stUp !== fs) continue;
      }

      // Filtr przewoźnika
      if (fp !== 'ALL' && colB.toUpperCase() !== fp) continue;

      claims.push({
        wiersz: i + 1,
        nrZgl:    sv(d[0]),
        przewoznik: sv(d[1]),
        pojazd:   sv(d[2]),
        dataStart: sd(d[3]),
        godzinaStart: st2(d[4]),
        dataStop:  sd(d[5]),
        godzinaStop: st2(d[6]),
        dniJezdne: sv(d[7]),
        przebieg:  sv(d[8]),
        kmNaDzien: sv(d[9]),
        kmGwarant: sv(d[10]),
        roznica:   sv(d[11]),
        doplata:   sv(d[12]),
        status:    sv(d[13]),
        komentarz: sv(d[14]).substring(0, 500),
        nrZlecenia: sv(d[15]),
        dataZlecenia: sv(d[16]),
        limitGwarancyjny: sv(d[17]),
        planista:  sv(d[18]),
        ocenaKontakt: sv(d[19]),
        ocenaTrasa: sv(d[20]),
        ocenaZlecenia: sv(d[21]),
        zmianaSped: sv(d[22]),
        argumentacja: sv(d[23]).substring(0, 300),
        opiekun:   sv(d[24]),
        ocenaOpKontakt: sv(d[25]),
        ocenaOpDostepnosc: sv(d[26]),
        ocenaOpProblemy: sv(d[27]),
        zmianaOpiekun: sv(d[28]),
        argOpiekun: sv(d[29]).substring(0, 300),
        autoryzacja: sv(d[30]),
        autoryzacjaOpis: sv(d[31]).substring(0, 300),
        autoryzacjaData: sv(d[32]),
        dataZgloszenia: sv(d[33]),
        dataZmianyStatusu: sv(d[34]),
        kwotaWnioskowana: sv(d[35]),
        reklamacjaZlozona: sv(d[36]),
        reklamacjaTresc: sv(d[37]).substring(0, 300),
        reklamacjaOdpMagtrans: sv(d[38]).substring(0, 300),
        reklamacjaKwota: sv(d[39]),
        reklamacjaZatwKwota: sv(d[40]),
        korektaGodzin: sn(d[41]),
        statusPrzedReklamacja: sv(d[42]),
        origDataStart: sd(d[43]),
        origGodzinaStart: st2(d[44]),
        origDataStop: sd(d[45]),
        origGodzinaStop: st2(d[46]),
        origPrzebieg: sv(d[47]),
        marza:        sv(d[48]),
        kwotaMaksima: sv(d[49])
      });
    }
    claims.reverse();
    return claims;
  } catch(e) {
    Logger.log('getAllClaims ERR: ' + e.message);
    return [{ _error: e.message }];
  }
}


// ── HELPERY DLA buildClaimObj ──
function safeStr(v) {
  return (v !== undefined && v !== null) ? v.toString().trim() : '';
}

function safeVal(v) {
  if (v === undefined || v === null || v === '') return 0;
  return parseFloat(v.toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;
}

function safeFmtDate(v) {
  if (!v) return '';
  try {
    if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Warsaw', 'dd.MM.yyyy');
    var s = v.toString().trim();
    if (!s) return '';
    var d = new Date(s);
    return isNaN(d.getTime()) ? s : Utilities.formatDate(d, 'Europe/Warsaw', 'dd.MM.yyyy');
  } catch(e) { return v.toString(); }
}

function safeFmtTime(v) {
  if (!v) return '';
  try {
    if (v instanceof Date) {
      var h = v.getHours(), m = v.getMinutes();
      return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    }
    var s = v.toString().trim();
    if (s.length >= 4 && s.indexOf(':') > 0) return s.substring(0, 5);
    return '';
  } catch(e) { return ''; }
}

function safeFmtDT(v) {
  if (!v) return '';
  try {
    var s = v.toString().trim();
    if (/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}$/.test(s)) return s;
    var d = new Date(v);
    if (isNaN(d.getTime())) return s;
    return Utilities.formatDate(d, 'Europe/Warsaw', 'dd.MM.yyyy HH:mm');
  } catch(e) { return v.toString(); }
}

function buildClaimObj(row, i) {
  // Copy row into plain array — GAS row arrays are read-only
  var r = new Array(50);
  for (var _c = 0; _c < 50; _c++) r[_c] = (row.length > _c) ? row[_c] : '';
  return {
    wiersz: i + 1,
    nrZgl:               safeStr(r[0]),
    przewoznik:          safeStr(r[1]),
    pojazd:              safeStr(r[2]),
    dataStart:           safeFmtDate(r[3]),
    godzinaStart:        safeFmtTime(r[4]),
    dataStop:            safeFmtDate(r[5]),
    godzinaStop:         safeFmtTime(r[6]),
    dniJezdne:           safeVal(r[7]),
    przebieg:            safeVal(r[8]),
    kmNaDzien:           safeVal(r[9]),
    kmGwarant:           safeVal(r[10]),
    roznica:             safeVal(r[11]),
    doplata:             safeStr(r[12]),
    status:              safeStr(r[13]),
    komentarz:           safeStr(r[14]),
    nrZlecenia:          safeStr(r[15]),
    dataZlecenia:        safeFmtDT(r[16]),
    limitGwarancyjny:    safeVal(r[17]),
    planista:            safeStr(r[18]),
    ocenaKontakt:        safeVal(r[19]),
    ocenaTrasa:          safeVal(r[20]),
    ocenaZlecenia:       safeVal(r[21]),
    zmianaSped:          safeStr(r[22]),
    argumentacja:        safeStr(r[23]),
    opiekun:             safeStr(r[24]),
    ocenaOpKontakt:      safeVal(r[25]),
    ocenaOpDostepnosc:   safeVal(r[26]),
    ocenaOpProblemy:     safeVal(r[27]),
    zmianaOpiekun:       safeStr(r[28]),
    argOpiekun:          safeStr(r[29]),
    autoryzacja:         safeStr(r[30]),
    autoryzacjaOpis:     safeStr(r[31]),
    autoryzacjaData:     safeStr(r[32]),
    dataZgloszenia:      safeStr(r[33]),
    dataZmianyStatusu:   safeStr(r[34]),
    kwotaWnioskowana:    safeStr(r[35]),
    reklamacjaZlozona:   safeStr(r[36]),
    reklamacjaTresc:     safeStr(r[37]),
    reklamacjaOdpMagtrans: safeStr(r[38]),
    reklamacjaKwota:     safeStr(r[39]),
    reklamacjaZatwKwota: safeStr(r[40]),
    korektaGodzin:       (function(v){ try { return parseFloat(v) || 0; } catch(e){ return 0; } })(r[41]),
    statusPrzedReklamacja: safeStr(r[42]),
    origDataStart:       safeFmtDate(r[43]),
    origGodzinaStart:    safeFmtTime(r[44]),
    origDataStop:        safeFmtDate(r[45]),
    origGodzinaStop:     safeFmtTime(r[46]),
    origPrzebieg:        safeVal(r[47]),
    marza:               safeStr(r[48]),
    kwotaMaksima:        safeStr(r[49])
  };
}

function fmtTime(val) {
  if (!val) return '';
  try {
    if (val instanceof Date || (typeof val === 'object' && val.getHours)) {
      var h = val.getHours();
      var m = val.getMinutes();
      return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    }
    var s = val.toString().trim();
    // Already HH:mm format
    if (/^\d{1,2}:\d{2}$/.test(s)) return s;
    // Try parsing as date
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      var h2 = d.getHours();
      var m2 = d.getMinutes();
      return (h2 < 10 ? '0' + h2 : h2) + ':' + (m2 < 10 ? '0' + m2 : m2);
    }
    return s;
  } catch (e) { return val.toString(); }
}

// ── WERYFIKACJA WNIOSKU (pracownik/admin) ──
// data = { status, komentarz, dataStart, godzinaStart, dataStop, godzinaStop,
//          przebieg, limitGwarancyjny, nrZlecenia }
function updateClaimFull(rowNumber, data, callerLogin) {
  // Walidacja: tylko pracownik/admin może weryfikować wnioski
  var caller = validateCaller(callerLogin);
  if (!caller || (caller.rola !== 'pracownik' && caller.rola !== 'admin')) {
    return { success: false, error: 'Brak uprawnień do edycji wniosków.' };
  }
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return { success: false, error: 'Brak arkusza WNIOSEK' };
  // Walidacja rowNumber — zabezpieczenie przed nadpisaniem nagłówków lub wyjściem poza zakres
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return { success: false, error: 'Nieprawidłowy numer wiersza (' + rowNumber + ').' };
  }
  try {
    // === BATCH READ: Odczyt całego wiersza jednym wywołaniem (zamiast ~25 oddzielnych getValue) ===
    var numCols = Math.max(sheet.getLastColumn(), 50);
    var row = sheet.getRange(rowNumber, 1, 1, numCols).getValues()[0];

    // 1. Aktualizuj daty i godziny (D-G) → row[3]-row[6]
    if (data.dataStart) row[3] = data.dataStart;           // D = col 4
    if (data.godzinaStart) row[4] = data.godzinaStart;     // E = col 5
    if (data.dataStop) row[5] = data.dataStop;             // F = col 6
    if (data.godzinaStop) row[6] = data.godzinaStop;       // G = col 7

    // 2. Aktualizuj km zrealizowane (I) → row[8]
    if (data.przebieg !== undefined && data.przebieg !== '') {
      row[8] = parseFloat(data.przebieg) || 0;            // I = col 9
    }

    // 3. Parse dates and times for calculation
    var ds = data.dataStart ? parseDatePL(data.dataStart) : null;
    var de = data.dataStop ? parseDatePL(data.dataStop) : null;
    var hStart = parseTimeGS(data.godzinaStart);  // np. 12.5 dla 12:30
    var hStop = parseTimeGS(data.godzinaStop);

    // 4. Limit gwarancyjny i przeliczenie (per-month limits)
    // Odczytaj starą dopłatę PRZED przeliczeniem (potrzebne dla reklamacji)
    var oldDoplataRaw = (row[12] || '0').toString().replace(/[€\s]/g, '').replace(',', '.');
    var oldDoplata = parseFloat(oldDoplataRaw) || 0;

    var limityData = getLimityKm();
    var calcResult = calcKmGwarantPerMonth(ds, de, hStart, hStop, limityData.km, limityData.stawki);
    var dniJezdne = calcResult.totalDays;

    // Korekta godzin (serwis/przestój) — pomniejsza dni jezdne
    var korektaH = parseFloat(data.korektaGodzin) || 0;
    row[41] = korektaH; // AP = col 42
    if (korektaH > 0 && dniJezdne > 0) {
      var korektaDni = Math.round((korektaH / 24) * 100) / 100;
      var originalDays = dniJezdne;
      dniJezdne = Math.max(0, Math.round((dniJezdne - korektaDni) * 100) / 100);
      // Odejmij korektę TYLKO z miesięcy z limitem > 0
      var totalActiveDays = 0;
      calcResult.breakdown.forEach(function(b) { if (b.limit > 0) totalActiveDays += b.days; });
      if (totalActiveDays > 0) {
        var newKmGwarant = 0;
        calcResult.breakdown.forEach(function(b) {
          if (b.limit > 0 && totalActiveDays > 0) {
            var share = (b.days / totalActiveDays) * korektaDni;
            b.days = Math.max(0, Math.round((b.days - share) * 100) / 100);
          }
          b.km = Math.round(b.days * b.limit);
          newKmGwarant += b.km;
        });
        calcResult.kmGwarant = newKmGwarant;
      }
    }

    row[7] = dniJezdne; // H = col 8

    // UWAGA: parseFloat(0) jest falsy — nie używaj || do fallbacku!
    var kmZreal = (data.przebieg !== undefined && data.przebieg !== '' && !isNaN(parseFloat(data.przebieg)))
      ? parseFloat(data.przebieg)
      : (parseFloat(row[8]) || 0); // I = col 9
    var kmGwarant = calcResult.kmGwarant;
    var roznica = kmZreal - kmGwarant;
    var doplata = roznica < 0 ? Math.ceil(Math.abs(roznica) * calcResult.stawka) : 0;
    var limitInfo = calcResult.breakdown.map(function(b) { return b.monthName + ':' + b.limit + 'km/' + b.rate + '€'; }).join('; ');

    // Jeśli pracownik podał kwotę Maksima (ręcznie) — użyj jej zamiast przeliczonej
    var kwotaMaksimaVal = parseFloat(data.kwotaMaksima) || 0;
    if (kwotaMaksimaVal > 0) {
      doplata = kwotaMaksimaVal;
    }

    row[9]  = limitInfo;              // J = col 10 — Limity per miesiąc
    row[10] = kmGwarant;              // K = col 11 — Km gwarantowane
    row[11] = roznica;                // L = col 12 — Różnica
    row[12] = fmtEUR(doplata);        // M = col 13 — Dopłata (przeliczona)
    row[17] = '';                      // R = col 18 — Limit gwarancyjny (legacy)

    // 5. Status (N) — odczytaj poprzedni status przed zmianą
    var prevStatus = (row[13] || '').toString().trim().toUpperCase(); // N = col 14
    // Detekcja reklamacji: sprawdź status LUB flagę reklamacjaZlozona (AK = col 37, row[36])
    // Flaga AK='Tak' wyłapuje statusy autoryzacyjne (OCZEKUJE NA AUTORYZACJĘ, AUTORYZACJA — KWOTA MAKSIMA)
    var reklamacjaZlozona = (row[36] || '').toString().trim() === 'Tak';
    var wasReklamacja = prevStatus.indexOf('REKLAMACJA') >= 0 ||
        (reklamacjaZlozona && prevStatus !== 'NA WERYFIKACJI' &&
         prevStatus !== 'ZAAKCEPTOWANO' && prevStatus !== 'ODRZUCONO');
    var newStatus = data.status || 'NA WERYFIKACJI';

    // 5a. Obsługa kwot przy reklamacji
    if (wasReklamacja) {
      var rekZatwKwota = parseFloat(data.reklamacjaZatwKwota) || 0;
      // Czy wniosek był wcześniej zaakceptowany (ma nr zlecenia)?
      var hadNrZlecenia = (row[15] || '').toString().trim(); // P = col 16

      if (newStatus === 'ZAAKCEPTOWANO' && rekZatwKwota > 0) {
        // Reklamacja zaakceptowana: M = stara dopłata + kwota reklamacji zatwierdzona
        var totalPayout = (hadNrZlecenia ? oldDoplata : 0) + rekZatwKwota;
        row[12] = fmtEUR(totalPayout);        // M = col 13 — łączna wypłata
        row[40] = fmtEUR(rekZatwKwota);       // AO = col 41 — kwota rek. zatwierdzona
      } else if (newStatus === 'ZAAKCEPTOWANO' && rekZatwKwota <= 0) {
        // P2: Reklamacja zamknięta ze statusem ZAAKCEPTOWANO ale 0 uznanych — zachowaj oryginalną kwotę
        row[12] = fmtEUR(hadNrZlecenia ? oldDoplata : 0);
        row[40] = fmtEUR(0);
      } else if (newStatus === 'ODRZUCONO') {
        // Reklamacja odrzucona: przywróć oryginalną dopłatę (0 jeśli wniosek był odrzucony)
        var restoreAmount = hadNrZlecenia ? oldDoplata : 0;
        row[12] = fmtEUR(restoreAmount);      // M = col 13 — oryginalna kwota lub 0
        row[40] = fmtEUR(0);                  // AO = col 41
      }
    }
    // P1: ODRZUCONO bez reklamacji — wyczyść M (nie trzymaj przeliczonej dopłaty dla odrzuconego wniosku)
    if (!wasReklamacja && newStatus === 'ODRZUCONO') {
      row[12] = fmtEUR(0);
    }

    row[13] = newStatus; // N = col 14

    // 6. Komentarz (O) → row[14]
    if (data.komentarz) {
      var existing = row[14] || '';
      var ts = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM HH:mm');
      var nc = '[' + ts + '] ' + data.komentarz;
      row[14] = existing ? existing + '\n' + nc : nc; // O = col 15
    }

    // 6a. Odpowiedź Magtrans na reklamację (AM = col 39 → row[38])
    if (wasReklamacja && data.komentarz && (newStatus === 'ZAAKCEPTOWANO' || newStatus === 'ODRZUCONO')) {
      var rekTs = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM HH:mm');
      var rekStatus = newStatus === 'ZAAKCEPTOWANO' ? 'ZAAKCEPTOWANO' : 'ODRZUCONO';
      row[38] = '[' + rekTs + ' ' + rekStatus + '] ' + data.komentarz; // AM = col 39
    }

    // 6b. Data zmiany statusu (AI = col 35 → row[34])
    if (newStatus !== 'NA WERYFIKACJI') {
      row[34] = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    }

    // 6c. Wyczyść flagę autoryzacji po finalnym zapisie (ZAAKCEPTOWANO/ODRZUCONO)
    if (newStatus === 'ZAAKCEPTOWANO' || newStatus === 'ODRZUCONO') {
      row[30] = '';  // AE = col 31 — autoryzacja (czyść żeby modal nie pokazywał formularza auth)
    }

    // 7. Nr zlecenia (P) i data zlecenia (Q)
    if (data.nrZlecenia) {
      row[15] = data.nrZlecenia;     // P = col 16
      row[16] = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm'); // Q = col 17
    }

    // === BATCH WRITE: Zapis całego wiersza jednym wywołaniem (zamiast ~20 oddzielnych setValue) ===
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

    // Kolor statusu — setBackground musi być osobnym wywołaniem (nie obsługuje batch)
    if (CONFIG.KOLORY[newStatus.toUpperCase()]) {
      sheet.getRange(rowNumber, 14).setBackground(CONFIG.KOLORY[newStatus.toUpperCase()]);
    }

    // === Od tego miejsca korzystamy z tablicy row[] zamiast ponownych odczytów z arkusza ===
    var nrZgl = (row[0] || '').toString();          // A = col 1
    var przewoznik = (row[1] || '').toString();     // B = col 2
    var pojazd = (row[2] || '').toString();          // C = col 3

    // 8. Email powiadomienie do admina
    try {
      var icon = newStatus === 'ZAAKCEPTOWANO' ? '✅' : newStatus === 'ODRZUCONO' ? '❌' : '⚠️';
      MailApp.sendEmail({
        to: CONFIG.ADMIN_EMAIL,
        subject: icon + ' ' + nrZgl + ' — ' + newStatus + (data.nrZlecenia ? ' | Zlecenie: ' + data.nrZlecenia : ''),
        htmlBody: '<div style="font-family:Arial;padding:20px"><h2>' + icon + ' ' + newStatus + '</h2>' +
          '<p><b>Nr:</b> ' + nrZgl + '</p><p><b>Przewoznik:</b> ' + przewoznik + '</p>' +
          '<p><b>Km zreal.:</b> ' + kmZreal + ' | <b>Km gwarant.:</b> ' + kmGwarant + ' | <b>Roznica:</b> ' + roznica + '</p>' +
          (doplata > 0 ? '<p><b>Dopłata:</b> ' + fmtEUR(doplata) + '</p>' : '') +
          (data.nrZlecenia ? '<p><b>Nr zlecenia:</b> ' + data.nrZlecenia + '</p>' : '') +
          (data.komentarz ? '<p><b>Komentarz:</b> ' + data.komentarz + '</p>' : '') +
          '<p><a href="https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '">Otworz arkusz</a></p></div>'
      });
    } catch (e) {}

    // 9. Email powiadomienie do PRZEWOŹNIKA (akceptacja / odrzucenie / reklamacja)
    if (newStatus === 'ZAAKCEPTOWANO' || newStatus === 'ODRZUCONO') {
      try {
        var carrierEmail = findCarrierEmail(przewoznik);
        if (carrierEmail) {
          var yr = new Date().getFullYear();
          var nrZleceniaDisplay = (data.nrZlecenia || row[15] || '').toString().trim(); // P = col 16

          // Kwota wnioskowana (oryginalna z momentu złożenia)
          var kwotaWnioskowana = parseFloat((row[35] || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0; // AJ = col 36

          if (wasReklamacja && newStatus === 'ZAAKCEPTOWANO') {
            // ─── REKLAMACJA ZAAKCEPTOWANA (pełna lub częściowa) ───
            var rekKwotaRaw = parseFloat((row[39] || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;  // AN = col 40
            var rekZatwRaw = parseFloat((row[40] || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;   // AO = col 41
            var isPartial = rekZatwRaw < rekKwotaRaw;

            // Sprawdź czy wniosek był pierwotnie zaakceptowany czy odrzucony
            var orgStatus = (row[42] || '').toString().trim(); // AQ = col 43
            var wasOriginallyAccepted = orgStatus === 'ZAAKCEPTOWANO';
            var hadNrZlec = (row[15] || '').toString().trim(); // P = col 16

            // Kwota pierwotnie wypłacona: 0 jeśli odrzucono
            var pierwotnieZaakceptowana = (wasOriginallyAccepted && hadNrZlec) ? oldDoplata : 0;
            // Łączna kwota do FV
            var kwotaDoFV = pierwotnieZaakceptowana + rekZatwRaw;

            if (!isPartial) {
              // ─── REKLAMACJA ZAAKCEPTOWANA W CAŁOŚCI ───
              _sendThreadedEmail({
                to: carrierEmail,
                threadKey: 'carrier-' + nrZgl,
                name: 'MAGGuarantee',
                subject: nrZgl + ' - Twoja reklamacja została zaakceptowana w całości',
                htmlBody: buildCarrierEmail({
                  headerColor: '#16a34a',
                  title: 'Twoja reklamacja do wniosku gwarancyjnego została <b style="color:#16a34a">zaakceptowana w całości</b>.',
                  boxBg: '#f0fdf4', boxBorder: '#22c55e',
                  rows: [
                    { label: 'Nr wniosku:', value: nrZgl, color: '#16a34a', bold: true, big: true },
                    { label: 'Pojazd:', value: pojazd },
                    { label: 'Kwota wnioskowana:', value: fmtEUR(kwotaWnioskowana) },
                    { label: 'Kwota zaakceptowana:', value: fmtEUR(kwotaDoFV), color: '#16a34a', bold: true, big: true },
                    { label: 'Nr zlecenia:', value: nrZleceniaDisplay, bold: true }
                  ],
                  paragraphs: [
                    'Prosimy o wystawienie <b>faktury VAT</b> na kwotę <b>' + fmtEUR(kwotaDoFV) + '</b> z zastosowaniem usługi <b>„Gwarancja kilometrowa"</b>. W polu „Uwagi" prosimy dopisać numer zlecenia MAGTRANS oraz numer Wniosku Gwarancyjnego, a następnie przesłać fakturę VAT do opiekuna.'
                  ],
                  year: yr
                })
              });
            } else {
              // ─── REKLAMACJA ZAAKCEPTOWANA CZĘŚCIOWO ───
              var partialRows = [
                { label: 'Nr wniosku:', value: nrZgl, color: '#f59e0b', bold: true, big: true },
                { label: 'Pojazd:', value: pojazd },
                { label: 'Kwota wnioskowana:', value: fmtEUR(kwotaWnioskowana) }
              ];
              // Wiersz "Zaakceptowano pierwotnie" tylko gdy wniosek BYŁ zaakceptowany
              if (wasOriginallyAccepted && pierwotnieZaakceptowana > 0) {
                partialRows.push({ label: 'Zaakceptowano pierwotnie:', value: fmtEUR(pierwotnieZaakceptowana) });
              }
              partialRows.push({ label: 'Kwota reklamacji:', value: fmtEUR(rekKwotaRaw) });
              partialRows.push({ label: 'Uznano z reklamacji:', value: fmtEUR(rekZatwRaw), color: '#f59e0b', bold: true });
              partialRows.push({ label: 'Kwota do faktury:', value: fmtEUR(kwotaDoFV), color: '#7c3aed', bold: true, big: true });
              partialRows.push({ label: 'Nr zlecenia:', value: nrZleceniaDisplay, bold: true });

              var partialParagraphs = [
                'Reklamacja została uznana częściowo. Zatwierdzona kwota reklamacji: <b>' + fmtEUR(rekZatwRaw) + '</b> z wnioskowanych <b>' + fmtEUR(rekKwotaRaw) + '</b>.'
              ];
              if (wasOriginallyAccepted && pierwotnieZaakceptowana > 0) {
                partialParagraphs.push('Prosimy o wystawienie <b>faktury VAT</b> na łączną kwotę <b>' + fmtEUR(kwotaDoFV) + '</b> (' + fmtEUR(pierwotnieZaakceptowana) + ' pierwotna akceptacja + ' + fmtEUR(rekZatwRaw) + ' uznana reklamacja) z zastosowaniem usługi <b>„Gwarancja kilometrowa"</b>.');
              } else {
                partialParagraphs.push('Prosimy o wystawienie <b>faktury VAT</b> na kwotę <b>' + fmtEUR(kwotaDoFV) + '</b> z zastosowaniem usługi <b>„Gwarancja kilometrowa"</b>.');
              }
              partialParagraphs.push('W polu „Uwagi" prosimy dopisać numer zlecenia MAGTRANS oraz numer Wniosku Gwarancyjnego, a następnie przesłać fakturę VAT do opiekuna.');

              _sendThreadedEmail({
                to: carrierEmail,
                threadKey: 'carrier-' + nrZgl,
                name: 'MAGGuarantee',
                subject: nrZgl + ' - Twoja reklamacja została zaakceptowana częściowo',
                htmlBody: buildCarrierEmail({
                  headerColor: '#f59e0b',
                  title: 'Twoja reklamacja do wniosku gwarancyjnego została <b style="color:#f59e0b">zaakceptowana częściowo</b>.',
                  boxBg: '#fffbeb', boxBorder: '#f59e0b',
                  rows: partialRows,
                  paragraphs: partialParagraphs,
                  year: yr
                })
              });
            }

          } else if (wasReklamacja && newStatus === 'ODRZUCONO') {
            // ─── REKLAMACJA ODRZUCONA ───
            var orgStatus2 = (row[42] || '').toString().trim(); // AQ = col 43
            var wasOrigAccepted2 = orgStatus2 === 'ZAAKCEPTOWANO';

            // Kwota pierwotnie zaakceptowana (sprzed reklamacji)
            var pierwotnaKwota = oldDoplata;

            var rejRows = [
              { label: 'Nr wniosku:', value: nrZgl, color: '#dc2626', bold: true, big: true },
              { label: 'Pojazd:', value: pojazd },
              { label: 'Kwota wnioskowana:', value: fmtEUR(kwotaWnioskowana) }
            ];
            var rejParagraphs = [];

            if (wasOrigAccepted2 && pierwotnaKwota > 0) {
              rejRows.push({ label: 'Zaakceptowano pierwotnie:', value: fmtEUR(pierwotnaKwota), color: '#16a34a', bold: true });
              rejRows.push({ label: 'Kwota do faktury:', value: fmtEUR(pierwotnaKwota), color: '#7c3aed', bold: true, big: true });
              if (nrZleceniaDisplay) rejRows.push({ label: 'Nr zlecenia:', value: nrZleceniaDisplay, bold: true });
              rejParagraphs.push('Reklamacja została odrzucona. Decyzja pierwotna pozostaje bez zmian.');
              rejParagraphs.push('Prosimy o wystawienie <b>faktury VAT</b> na kwotę <b>' + fmtEUR(pierwotnaKwota) + '</b> (pierwotnie zaakceptowana kwota) z zastosowaniem usługi <b>„Gwarancja kilometrowa"</b>.');
              rejParagraphs.push('W polu „Uwagi" prosimy dopisać numer zlecenia MAGTRANS oraz numer Wniosku Gwarancyjnego, a następnie przesłać fakturę VAT do opiekuna.');
            } else {
              rejParagraphs.push('Reklamacja została odrzucona. Decyzja pierwotna o odrzuceniu wniosku pozostaje bez zmian.');
            }

            _sendThreadedEmail({
              to: carrierEmail,
              threadKey: 'carrier-' + nrZgl,
              name: 'MAGGuarantee',
              subject: nrZgl + ' - Reklamacja odrzucona',
              htmlBody: buildCarrierEmail({
                headerColor: '#dc2626',
                title: 'Twoja reklamacja do wniosku została <b style="color:#dc2626">odrzucona</b>.',
                boxBg: '#fef2f2', boxBorder: '#ef4444',
                rows: rejRows,
                paragraphs: rejParagraphs,
                year: yr
              })
            });

          } else if (newStatus === 'ZAAKCEPTOWANO') {
            // ─── WNIOSEK ZAAKCEPTOWANY (bez reklamacji) ───
            var zaakceptowanaKwota = doplata; // przeliczona kwota po weryfikacji
            var isPartialAcc = kwotaWnioskowana > 0 && zaakceptowanaKwota < kwotaWnioskowana;

            if (isPartialAcc) {
              // ─── CZĘŚCIOWA AKCEPTACJA ───
              var roznicaDoRekl = kwotaWnioskowana - zaakceptowanaKwota;
              _sendThreadedEmail({
                to: carrierEmail,
                threadKey: 'carrier-' + nrZgl,
                name: 'MAGGuarantee',
                subject: nrZgl + ' - Twój wniosek gwarancyjny został częściowo zaakceptowany',
                htmlBody: buildCarrierEmail({
                  headerColor: '#f59e0b',
                  title: 'Twój wniosek gwarancyjny został <b style="color:#f59e0b">częściowo zaakceptowany</b>.',
                  boxBg: '#fffbeb', boxBorder: '#f59e0b',
                  rows: [
                    { label: 'Nr wniosku:', value: nrZgl, color: '#f59e0b', bold: true, big: true },
                    { label: 'Pojazd:', value: pojazd },
                    { label: 'Kwota wnioskowana:', value: fmtEUR(kwotaWnioskowana) },
                    { label: 'Kwota zaakceptowana:', value: fmtEUR(zaakceptowanaKwota), color: '#f59e0b', bold: true, big: true },
                    { label: 'Nr zlecenia:', value: nrZleceniaDisplay, bold: true }
                  ],
                  paragraphs: [
                    'Prosimy o wystawienie <b>faktury VAT</b> na kwotę <b>' + fmtEUR(zaakceptowanaKwota) + '</b> z zastosowaniem usługi <b>„Gwarancja kilometrowa"</b>. W polu „Uwagi" prosimy dopisać numer zlecenia MAGTRANS oraz numer Wniosku Gwarancyjnego, a następnie przesłać fakturę VAT do opiekuna.',
                    'Kwota zaakceptowana jest niższa od wnioskowanej o <b>' + fmtEUR(roznicaDoRekl) + '</b>. Informujemy, że przysługuje Państwu prawo złożenia <b>reklamacji na różnicę w terminie 48 godzin</b> od momentu akceptacji, za pośrednictwem Portalu Przewoźnika.'
                  ],
                  year: yr
                })
              });
            } else {
              // ─── PEŁNA AKCEPTACJA ───
              _sendThreadedEmail({
                to: carrierEmail,
                threadKey: 'carrier-' + nrZgl,
                name: 'MAGGuarantee',
                subject: nrZgl + ' - Twój wniosek gwarancyjny został zaakceptowany',
                htmlBody: buildCarrierEmail({
                  headerColor: '#16a34a',
                  title: 'Twój wniosek gwarancyjny został <b style="color:#16a34a">zaakceptowany</b>.',
                  boxBg: '#f0fdf4', boxBorder: '#22c55e',
                  rows: [
                    { label: 'Nr wniosku:', value: nrZgl, color: '#16a34a', bold: true, big: true },
                    { label: 'Pojazd:', value: pojazd },
                    { label: 'Kwota zaakceptowana:', value: fmtEUR(zaakceptowanaKwota), color: '#16a34a', bold: true, big: true },
                    { label: 'Nr zlecenia:', value: nrZleceniaDisplay, bold: true }
                  ],
                  paragraphs: [
                    'Prosimy o wystawienie <b>faktury VAT</b> na kwotę <b>' + fmtEUR(zaakceptowanaKwota) + '</b> z zastosowaniem usługi <b>„Gwarancja kilometrowa”</b>. W polu „Uwagi” prosimy dopisać numer zlecenia MAGTRANS oraz numer Wniosku Gwarancyjnego, a następnie przesłać fakturę VAT do opiekuna.'
                  ],
                  year: yr
                })
              });
            }

          } else {
            // ─── WNIOSEK ODRZUCONY (bez reklamacji) ───
            _sendThreadedEmail({
              to: carrierEmail,
              threadKey: 'carrier-' + nrZgl,
              name: 'MAGGuarantee',
              subject: nrZgl + ' - Twój wniosek gwarancyjny został odrzucony',
              htmlBody: buildCarrierEmail({
                headerColor: '#dc2626',
                title: 'Twój wniosek gwarancyjny został <b style="color:#dc2626">odrzucony</b>.',
                boxBg: '#fef2f2', boxBorder: '#ef4444',
                rows: [
                  { label: 'Nr wniosku:', value: nrZgl, color: '#dc2626', bold: true, big: true },
                  { label: 'Pojazd:', value: pojazd },
                  { label: 'Kwota wnioskowana:', value: fmtEUR(kwotaWnioskowana) }
                ],
                paragraphs: [
                  'Sprawdź powód odrzucenia na <b>Portalu Przewoźnika</b>.',
                  'Jednocześnie informujemy, że do wniosku przysługuje prawo złożenia <b>reklamacji w terminie 48 godzin</b> od momentu jego odrzucenia, za pośrednictwem Portalu Przewoźnika.'
                ],
                year: yr
              })
            });
          }
        }
      } catch (mailErr) { Logger.log('MAIL CARRIER STATUS — BLAD: ' + mailErr.message); }
    }

    // 10. Email wewnętrzny do planisty, opiekuna, wnioski@ — informacja o decyzji
    try {
      var kwotaWnR = parseFloat((row[35] || '0').toString().replace(/[€\s]/g,'').replace(',','.')) || 0; // AJ = col 36
      var nrZlec = (data.nrZlecenia || row[15] || '').toString().trim(); // P = col 16
      if (wasReklamacja && newStatus === 'ZAAKCEPTOWANO') {
        var rekKwR  = parseFloat((row[39] || '0').toString().replace(/[€\s]/g,'').replace(',','.')) || 0;  // AN = col 40
        var rekZatwR = parseFloat((row[40] || '0').toString().replace(/[€\s]/g,'').replace(',','.')) || 0; // AO = col 41
        var orgSt   = (row[42] || '').toString().trim(); // AQ = col 43
        // WAŻNE: nie czytaj col M ponownie — jest już zaktualizowana do sumy!
        // Użyj oldDoplata (kwota przed zapisem) jako kwota pierwotnie zatwierdzona
        var pierwKwInt = (orgSt === 'ZAAKCEPTOWANO' && row[15]) ? oldDoplata : 0; // P = col 16
        var kwotaFV = pierwKwInt + rekZatwR;
        var isPartR = rekZatwR < rekKwR;
        sendInternalDecisionEmail(sheet, rowNumber, isPartR ? 'REKLAMACJA_CZESCIOWO' : 'REKLAMACJA_ZATW', {
          kwotaWnioskowana: fmtEUR(kwotaWnR),
          kwotaReklamacji:  fmtEUR(rekKwR),
          kwotaWyplaty:     fmtEUR(kwotaFV),
          nrZlecenia:       nrZlec || '—'
        }, row);
      } else if (wasReklamacja && newStatus === 'ODRZUCONO') {
        var orgSt2   = (row[42] || '').toString().trim(); // AQ = col 43
        // Użyj oldDoplata — col M mogła być zmieniona
        var pierwKw2 = orgSt2 === 'ZAAKCEPTOWANO' ? oldDoplata : 0;
        sendInternalDecisionEmail(sheet, rowNumber, 'REKLAMACJA_ODRZUCONA', {
          kwotaWnioskowana: fmtEUR(kwotaWnR),
          kwotaWyplaty:     pierwKw2 > 0 ? fmtEUR(pierwKw2) : 'brak',
          powod:            data.komentarz || '—'
        }, row);
      } else if (newStatus === 'ZAAKCEPTOWANO') {
        var isPartInt = kwotaWnR > 0 && doplata < kwotaWnR;
        sendInternalDecisionEmail(sheet, rowNumber, isPartInt ? 'CZESCIOWO' : 'ZAAKCEPTOWANO', {
          kwotaWnioskowana: fmtEUR(kwotaWnR),
          kwotaWyplaty:     fmtEUR(doplata),
          nrZlecenia:       nrZlec || '—'
        }, row);
      } else if (newStatus === 'ODRZUCONO') {
        sendInternalDecisionEmail(sheet, rowNumber, 'ODRZUCONO', {
          kwotaWnioskowana: fmtEUR(kwotaWnR),
          powod:            data.komentarz || '—'
        }, row);
      }
    } catch (intMailErr) { Logger.log('INTERNAL DECISION MAIL ERR: ' + intMailErr.message); }

    return {
      success: true,
      calc: { dniJezdne: dniJezdne, kmGwarant: kmGwarant, roznica: roznica, doplata: doplata, stawka: calcResult.stawka }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── WEWNĘTRZNY EMAIL O DECYZJI (do planisty, opiekuna, wnioski@) ──
// rowData: opcjonalna tablica wiersza (row[]) — jeśli podana, unika odczytów z arkusza
function sendInternalDecisionEmail(sheet, rowNumber, decisionType, extraData, rowData) {
  try {
    var nrZgl, przewoznik, pojazd, planista, opiekun;
    if (rowData) {
      nrZgl      = (rowData[0] || '').toString();
      przewoznik = (rowData[1] || '').toString();
      pojazd     = (rowData[2] || '').toString();
      planista   = (rowData[18] || '').toString().trim(); // S = col 19
      opiekun    = (rowData[24] || '').toString().trim(); // Y = col 25
    } else {
      nrZgl      = sheet.getRange(rowNumber, 1).getValue().toString();
      przewoznik = sheet.getRange(rowNumber, 2).getValue().toString();
      pojazd     = sheet.getRange(rowNumber, 3).getValue().toString();
      planista   = sheet.getRange(rowNumber, 19).getValue().toString().trim();
      opiekun    = sheet.getRange(rowNumber, 25).getValue().toString().trim();
    }

    var plannerInfo    = getPlannerEmailAndLider(planista);
    var opiekunEmailAd = getOpiekunEmail(opiekun);
    var emailRe        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Buduj listę odbiorców: planista, lider planisty, opiekun, wnioski@
    var recipients = [];
    if (plannerInfo.email && emailRe.test(plannerInfo.email)) recipients.push(plannerInfo.email.trim());
    if (plannerInfo.liderEmail && emailRe.test(plannerInfo.liderEmail)) recipients.push(plannerInfo.liderEmail.trim());
    if (opiekunEmailAd && emailRe.test(opiekunEmailAd)) recipients.push(opiekunEmailAd.trim());
    recipients.push('wnioski@magtrans.eu');
    // Deduplikacja
    var seen = {}; recipients = recipients.filter(function(e) { var k = e.toLowerCase(); if (seen[k]) return false; seen[k] = true; return true; });

    if (!recipients.length) return;

    // Konfiguracja per typ decyzji
    var configs = {
      'ZAAKCEPTOWANO':         { icon: '✅', color: '#16a34a', label: 'ZAAKCEPTOWANY',             bgColor: '#f0fdf4', borderColor: '#22c55e' },
      'CZESCIOWO':             { icon: '⚠️', color: '#d97706', label: 'ZAAKCEPTOWANY CZĘŚCIOWO',   bgColor: '#fffbeb', borderColor: '#f59e0b' },
      'ODRZUCONO':             { icon: '❌', color: '#dc2626', label: 'ODRZUCONY',                  bgColor: '#fef2f2', borderColor: '#ef4444' },
      'REKLAMACJA_ZLOZONA':    { icon: '📣', color: '#c2410c', label: 'ZŁOŻONO REKLAMACJĘ',         bgColor: '#fff7ed', borderColor: '#f97316' },
      'REKLAMACJA_ZATW':       { icon: '✅', color: '#16a34a', label: 'REKLAMACJA ZAAKCEPTOWANA',   bgColor: '#f0fdf4', borderColor: '#22c55e' },
      'REKLAMACJA_CZESCIOWO':  { icon: '⚠️', color: '#d97706', label: 'REKLAMACJA ZATW. CZĘŚCIOWO',bgColor: '#fffbeb', borderColor: '#f59e0b' },
      'REKLAMACJA_ODRZUCONA':  { icon: '❌', color: '#dc2626', label: 'REKLAMACJA ODRZUCONA',       bgColor: '#fef2f2', borderColor: '#ef4444' }
    };
    var cfg = configs[decisionType] || { icon: 'ℹ️', color: '#475569', label: decisionType, bgColor: '#f8fafc', borderColor: '#cbd5e1' };
    var d = extraData || {};

    // Buduj wiersze tabeli
    var rows = [
      ['Nr wniosku', '<b style="color:' + cfg.color + ';font-size:15px">' + nrZgl + '</b>'],
      ['Przewoźnik', przewoznik],
      ['Pojazd', '<span style="font-family:monospace">' + pojazd + '</span>'],
      ['Planista', planista || '—'],
      ['Opiekun', opiekun || '—']
    ];
    if (d.kwotaWnioskowana) rows.push(['Kwota wnioskowana', '<b>' + d.kwotaWnioskowana + '</b>']);
    if (d.kwotaWyplaty)    rows.push(['Kwota wypłaty', '<b style="color:' + cfg.color + ';font-size:15px">' + d.kwotaWyplaty + '</b>']);
    if (d.nrZlecenia)      rows.push(['Nr zlecenia', '<b>' + d.nrZlecenia + '</b>']);
    if (d.kwotaReklamacji) rows.push(['Kwota reklamacji', '<b>' + d.kwotaReklamacji + '</b>']);
    if (d.powod)           rows.push(['Powód / komentarz', d.powod]);

    var rowsHtml = rows.map(function(r, idx) {
      return '<tr style="background:' + (idx % 2 === 0 ? '#fff' : '#f8fafc') + '">' +
        '<td style="padding:8px 12px;color:#64748b;font-size:13px;width:170px"><b>' + r[0] + ':</b></td>' +
        '<td style="padding:8px 12px;font-size:13px;color:#1e293b">' + r[1] + '</td>' +
      '</tr>';
    }).join('');

    var htmlBody =
      '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">' +
        '<div style="background:#fef2f2;padding:12px 28px;border-radius:12px 12px 0 0;border:2px solid #dc2626;text-align:center">' +
          '<p style="margin:0;font-size:13px;font-weight:800;color:#dc2626">⚠️ Mail wewnętrzny — nie przesyłaj i nie dodawaj przewoźnika do konwersacji!</p>' +
        '</div>' +
        '<div style="background:' + cfg.color + ';padding:20px 28px">' +
          '<h2 style="color:#fff;margin:0;font-size:17px;text-align:center">' + cfg.icon + ' Wniosek ' + cfg.label + '</h2>' +
        '</div>' +
        '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;overflow:hidden">' +
          '<table style="width:100%;border-collapse:collapse">' + rowsHtml + '</table>' +
        '</div>' +
      '</div>';

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: cfg.icon + ' ' + nrZgl + ' — ' + cfg.label + ' | ' + przewoznik + ' / ' + pojazd,
      htmlBody: htmlBody
    });
  } catch (e) {
    Logger.log('sendInternalDecisionEmail ERR [' + decisionType + ']: ' + e.message);
  }
}

// ── UNIFIED CARRIER EMAIL TEMPLATE ──
function buildCarrierEmail(opts) {
  var rowsHtml = '';
  (opts.rows || []).forEach(function(r) {
    var valStyle = 'padding:6px 0;font-weight:' + (r.bold ? '700' : '600') + ';color:' + (r.color || '#334155') + (r.big ? ';font-size:16px' : '');
    rowsHtml += '<tr><td style="padding:6px 0;color:#64748b;width:140px">' + r.label + '</td><td style="' + valStyle + '">' + r.value + '</td></tr>';
  });
  var parasHtml = '';
  (opts.paragraphs || []).forEach(function(p) {
    parasHtml += '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px">' + p + '</p>';
  });
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:0">' +
    '<div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">' +
      '<h1 style="color:#fff;margin:0;font-size:20px">🚛 MAGGuarantee</h1>' +
      '<p style="color:#94a3b8;margin:4px 0 0;font-size:13px">MAGGuarantee</p>' +
    '</div>' +
    '<div style="background:#ffffff;padding:32px;border:1px solid #e2e8f0;border-top:none">' +
      '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px">Dzień dobry,</p>' +
      '<p style="font-size:15px;color:#334155;line-height:1.6;margin:0 0 16px">informujemy, że ' + opts.title + '</p>' +
      '<div style="background:' + opts.boxBg + ';border:2px solid ' + opts.boxBorder + ';border-radius:10px;padding:20px;margin:20px 0">' +
        '<table style="width:100%;border-collapse:collapse">' + rowsHtml + '</table>' +
      '</div>' +
      parasHtml +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">' +
      '<p style="font-size:12px;color:#94a3b8;margin:0 0 8px;font-style:italic">Wiadomość automatyczna, prosimy nie odpowiadać.</p>' +
      '<p style="font-size:14px;color:#475569;margin:0">Dziękujemy za współpracę,<br><b>Załoga MAGTRANS</b></p>' +
    '</div>' +
    '<div style="background:#f8fafc;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center">' +
      '<p style="font-size:11px;color:#94a3b8;margin:0">© ' + opts.year + ' MAGGuarantee | Magtrans</p>' +
    '</div>' +
  '</div>';
}

// Znajdź email przewoźnika po nazwie firmy
function findCarrierEmail(przewoznikName) {
  if (!przewoznikName) return '';
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_UZYTKOWNICY);
  if (!sheet) return '';
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var firma = (data[i][5] || '').toString().trim(); // kolumna F = Firma przewoznika
    if (firma && firma.toUpperCase() === przewoznikName.toUpperCase().trim()) {
      var email = (data[i][4] || '').toString().trim(); // kolumna E = Email
      if (email) return email;
    }
  }
  return '';
}

// ═══════════════════════════════════════════════════════════
// ── THREADED EMAIL — wszystkie maile per wniosek w jednym wątku Gmail ──
// threadKey: np. "carrier-GWA/001/03/26" lub "internal-GWA/001/03/26"
// ═══════════════════════════════════════════════════════════
function _sendThreadedEmail(opts) {
  // opts: { to, subject, htmlBody, threadKey, cc, name }
  if (!opts || !opts.to || !opts.htmlBody) return false;
  var name = opts.name || 'MAGGuarantee';
  var props = PropertiesService.getScriptProperties();
  var storageKey = 'thread_' + (opts.threadKey || '');

  // 1. Spróbuj odpowiedzieć na istniejący wątek
  if (opts.threadKey) {
    try {
      var existingId = props.getProperty(storageKey);
      if (existingId) {
        var thread = GmailApp.getThreadById(existingId);
        if (thread) {
          var replyOpts = { htmlBody: opts.htmlBody, name: name };
          // Reply wysyła na adres z oryginalnego wątku — wymuśmy "to"
          // GmailApp.reply nie obsługuje "to" override, musimy użyć GmailApp.sendEmail z In-Reply-To
          var firstMsg = thread.getMessages()[0];
          var origMsgId = firstMsg.getHeader('Message-ID') || firstMsg.getHeader('Message-Id');
          if (origMsgId) {
            // Użyj własnego subject z Re: + oryginalny subject żeby Gmail zagnieździł
            var origSubject = thread.getFirstMessageSubject();
            var replySubject = (origSubject.indexOf('Re:') === 0) ? origSubject : ('Re: ' + origSubject);
            GmailApp.sendEmail(opts.to, replySubject, '', {
              htmlBody: opts.htmlBody,
              name: name,
              cc: opts.cc || '',
              inReplyTo: origMsgId
            });
            return true;
          }
          // Fallback — zwykły reply (pójdzie do adresu z wątku)
          thread.reply('', replyOpts);
          return true;
        }
      }
    } catch(e) { Logger.log('_sendThreadedEmail reply fail: ' + e.message); }
  }

  // 2. Nowy email
  try {
    GmailApp.sendEmail(opts.to, opts.subject, '', {
      htmlBody: opts.htmlBody,
      name: name,
      cc: opts.cc || ''
    });
    // Zapisz thread ID pierwszego znalezionego wątku po subject+to
    if (opts.threadKey) {
      Utilities.sleep(1500); // daj Gmailowi chwilę na indeksację
      try {
        var threads = GmailApp.search('subject:"' + opts.subject.replace(/"/g, '') + '" from:me', 0, 3);
        if (threads && threads.length > 0) {
          props.setProperty(storageKey, threads[0].getId());
        }
      } catch(se) { Logger.log('thread lookup fail: ' + se.message); }
    }
    return true;
  } catch(e) {
    Logger.log('_sendThreadedEmail send fail: ' + e.message);
    // Fallback do MailApp
    try {
      MailApp.sendEmail({ to: opts.to, subject: opts.subject, htmlBody: opts.htmlBody, cc: opts.cc || '', name: name });
      return true;
    } catch(me) { return false; }
  }
}

// Escapowanie HTML — zabezpieczenie przed XSS w emailach
function escHtml(s) {
  if (!s) return '';
  return s.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formatowanie waluty: zawsze "1234 €" (integer, bez groszy)
function fmtEUR(val) {
  if (!val && val !== 0) return '0 €';
  var s = val.toString().replace(/[€\s]/g, '').replace(',', '.').trim();
  var n = parseFloat(s) || 0;
  return Math.round(n) + ' €';
}

// Parsowanie dat w formacie dd.MM.yyyy lub yyyy-MM-dd
function parseDatePL(s) {
  if (!s) return null;
  s = s.toString().trim();
  var d;
  if (s.indexOf('.') > 0) {
    var p = s.split('.');
    d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  } else if (s.indexOf('-') > 0) {
    d = new Date(s);
  } else {
    d = new Date(s);
  }
  return (d && !isNaN(d.getTime())) ? d : null;
}

// Parsowanie godziny HH:mm → ułamek godziny (np. 12:30 → 12.5)
function parseTimeGS(s) {
  if (!s) return null;
  s = s.toString().trim();
  var parts = s.split(':');
  if (parts.length >= 2) {
    return parseInt(parts[0]) + parseInt(parts[1]) / 60;
  }
  return null;
}

// Format daty na klucz dd.MM.yyyy
function fmtDateKey(d) {
  var dd = d.getDate(); var mm = d.getMonth() + 1; var yy = d.getFullYear();
  return (dd < 10 ? '0' + dd : dd) + '.' + (mm < 10 ? '0' + mm : mm) + '.' + yy;
}

// Oblicz datę Wielkanocy (algorytm Gaussa)
function calcEasterGS(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Zakazy jazdy ciężarówek w UE (DE, IT, AT, FR, BE, NL, LU)
function getEUBanDaysGS(yearFrom, yearTo) {
  var bans = {};
  for (var y = yearFrom; y <= yearTo; y++) {
    var fixed = [
      [1, 1, 'Nowy Rok'], [1, 6, 'Trzech Kroli (DE/IT/AT)'],
      [5, 1, 'Swieto Pracy'], [6, 2, 'Dzien Republiki (IT)'],
      [7, 14, 'Dzien Bastylii (FR)'], [7, 21, 'Dzien Belgii (BE)'],
      [8, 15, 'Wniebowziecie NMP'], [10, 3, 'Dzien Jednosci (DE)'],
      [10, 26, 'Dzien Narodowy (AT)'], [11, 1, 'Wszystkich Swietych'],
      [11, 11, 'Dzien Niepodleglosci (FR/BE)'],
      [12, 8, 'Niepokalane Poczecie (IT/AT)'],
      [12, 25, 'Boze Narodzenie'], [12, 26, 'Sw. Szczepana'],
    ];
    for (var fi = 0; fi < fixed.length; fi++) {
      var h = fixed[fi];
      var dd = new Date(y, h[0] - 1, h[1]);
      if (dd.getDay() !== 0 && dd.getDay() !== 6) {
        bans[fmtDateKey(dd)] = h[2];
      }
    }
    var easter = calcEasterGS(y);
    var easterDays = [
      [-2, 'Wielki Piatek (DE/NL)'],
      [1, 'Poniedzialek Wielkanocny'],
      [39, 'Wniebowstapienie'],
      [50, 'Poniedzialek Zielonych Swiatek'],
      [60, 'Boze Cialo (DE/AT/IT)'],
    ];
    for (var ei = 0; ei < easterDays.length; ei++) {
      var ed = easterDays[ei];
      var dd2 = new Date(easter);
      dd2.setDate(dd2.getDate() + ed[0]);
      if (dd2.getDay() !== 0 && dd2.getDay() !== 6) {
        bans[fmtDateKey(dd2)] = ed[1];
      }
    }
  }
  return bans;
}

// ── PRÓG AUTORYZACJI WG DNI W TRASIE ──
function getAuthThreshold(dniJezdne) {
  var days = Math.floor(parseFloat(dniJezdne) || 0);
  if (days >= 61) return 1000;
  if (days >= 31) return 800;
  if (days >= 16) return 500;
  return 300; // 10-15
}

// ── UPLOAD SCREENSHOTA AUTORYZACJI DO GOOGLE DRIVE ──
function uploadAuthScreenshot(rowNumber, base64Data, fileName, callerLogin) {
  if (!requireEmployee(callerLogin)) return { success: false, error: 'Brak uprawnień.' };
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return { success: false, error: 'Brak arkusza WNIOSEK' };
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return { success: false, error: 'Nieprawidłowy numer wiersza.' };
  }
  try {
    // Znajdź lub utwórz folder
    var folderName = 'MAGGuarantee_Autoryzacje';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // Dekoduj base64 i zapisz plik
    var nrZgl = (sheet.getRange(rowNumber, 1).getValue() || '').toString();
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, 'image/png', fileName || ('auth_' + nrZgl + '.png'));
    var file = folder.createFile(blob);
    var fileUrl = file.getUrl();

    // Zapisz link w kolumnie AE (31) — dopisz do istniejącego opisu
    var existing = (sheet.getRange(rowNumber, 32).getValue() || '').toString();
    sheet.getRange(rowNumber, 32).setValue(existing + '\n[SCREENSHOT ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm') + '] ' + fileUrl);

    return { success: true, fileUrl: fileUrl };
  } catch(e) {
    Logger.log('uploadAuthScreenshot ERR: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ── WYSŁANIE EMAILA AUTORYZACYJNEGO DO MAKSIMA (informacyjny) ──
function sendAuthorizationRequest(rowNumber, data, callerLogin) {
  if (!requireEmployee(callerLogin)) return { success: false, error: 'Brak uprawnień.' };
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return { success: false, error: 'Brak arkusza WNIOSEK' };
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    return { success: false, error: 'Nieprawidłowy numer wiersza (' + rowNumber + ').' };
  }
  try {
    // Zapisz marżę w arkuszu
    sheet.getRange(rowNumber, 49).setValue(data.marza || '');
    // Zapisz flagę że email autoryzacyjny wysłany + opis
    var ts = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm');
    sheet.getRange(rowNumber, 31).setValue('EMAIL_WYSŁANY');
    sheet.getRange(rowNumber, 32).setValue(data.authOpis || '');
    sheet.getRange(rowNumber, 33).setValue(ts);

    // Zapisz dane weryfikacyjne — żeby nie zginęły gdy pracownik zamknie modal
    if (data.dataStart)    sheet.getRange(rowNumber, 4).setValue(data.dataStart);    // D
    if (data.godzinaStart) sheet.getRange(rowNumber, 5).setValue(data.godzinaStart); // E
    if (data.dataStop)     sheet.getRange(rowNumber, 6).setValue(data.dataStop);     // F
    if (data.godzinaStop)  sheet.getRange(rowNumber, 7).setValue(data.godzinaStop);  // G
    if (data.przebieg !== undefined && data.przebieg !== '' && parseFloat(data.przebieg) > 0) {
      sheet.getRange(rowNumber, 9).setValue(parseFloat(data.przebieg)); // I = km zreal.
    }
    if (parseFloat(data.korektaGodzin) > 0) {
      sheet.getRange(rowNumber, 42).setValue(parseFloat(data.korektaGodzin)); // AP
    }
    // NIE zapisuj calcDoplata do kolumny M — kolumna M musi zachować oryginalną kwotę
    // (potrzebna jako oldDoplata w updateClaimFull, szczególnie przy reklamacjach).
    // Dopłata jest przeliczana od nowa w updateClaimFull na podstawie zapisanych dat/godzin/km.

    // Dane do emaila
    var nrZgl      = (sheet.getRange(rowNumber, 1).getValue() || '').toString();
    var przewoznik = (sheet.getRange(rowNumber, 2).getValue() || '').toString();
    var pojazd     = (sheet.getRange(rowNumber, 3).getValue() || '').toString();
    var planista   = (sheet.getRange(rowNumber, 19).getValue() || '').toString();
    var doplata    = parseFloat(data.calcDoplata) || 0;
    var dniJezdne  = parseFloat(data.calcDniJezdne) || 0;
    var km         = parseFloat(data.przebieg) || 0;
    var kmNaDzien  = dniJezdne > 0 ? Math.round(km / dniJezdne) : 0;
    var korektaH   = parseFloat(data.korektaGodzin) || 0;
    var threshold  = getAuthThreshold(dniJezdne);

    // Buduj wiersze tabeli (styl jak sendInternalDecisionEmail)
    var rows = [
      ['Nr wniosku', '<b style="color:#b91c1c;font-size:15px">' + nrZgl + '</b>'],
      ['Przewoźnik', przewoznik],
      ['Pojazd', '<span style="font-family:monospace">' + pojazd + '</span>'],
      ['Spedytor', '<b>' + (planista || '—') + '</b>'],
      ['Dni w trasie', '<b>' + dniJezdne + ' dni</b>'],
      ['Km / dzień', '<b>' + kmNaDzien + ' km</b>'],
      ['Próg autoryzacji', threshold + ' €']
    ];
    if (korektaH > 0) rows.push(['Korekta (h)', '<span style="color:#c2410c;font-weight:700">' + korektaH + 'h — ' + escHtml(data.korektaOpis || '(brak)') + '</span>']);

    var rowsHtml = rows.map(function(r, idx) {
      return '<tr style="background:' + (idx % 2 === 0 ? '#fff' : '#f8fafc') + '">' +
        '<td style="padding:8px 12px;color:#64748b;font-size:13px;width:170px"><b>' + r[0] + ':</b></td>' +
        '<td style="padding:8px 12px;font-size:13px;color:#1e293b">' + r[1] + '</td></tr>';
    }).join('');

    var htmlBody =
      '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">' +
        '<div style="background:#fef2f2;padding:12px 28px;border-radius:12px 12px 0 0;border:2px solid #dc2626;text-align:center">' +
          '<p style="margin:0;font-size:13px;font-weight:800;color:#dc2626">⚠️ Mail wewnętrzny — nie przesyłaj i nie dodawaj przewoźnika do konwersacji!</p>' +
        '</div>' +
        '<div style="background:#b91c1c;padding:20px 28px">' +
          '<h2 style="color:#fff;margin:0;font-size:17px;text-align:center">🔒 Prośba o autoryzację dopłaty</h2>' +
        '</div>' +
        '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;overflow:hidden">' +
          '<table style="width:100%;border-collapse:collapse">' + rowsHtml + '</table>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e2e8f0;border-top:none">' +
          '<div style="background:#fef2f2;padding:18px;text-align:center;border-right:1px solid #e2e8f0">' +
            '<div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:6px">Dopłata</div>' +
            '<div style="font-size:28px;font-weight:800;color:#b91c1c">' + fmtEUR(doplata) + '</div>' +
          '</div>' +
          '<div style="background:#f0fdf4;padding:18px;text-align:center">' +
            '<div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:6px">Marża na aucie</div>' +
            '<div style="font-size:28px;font-weight:800;color:#16a34a">' + (data.marza || '—') + ' €</div>' +
          '</div>' +
        '</div>' +
        (data.authOpis ? '<div style="background:#fff7ed;border:1px solid #e2e8f0;border-top:none;padding:16px 24px;font-size:13px;color:#1e293b"><b style="color:#c2410c">Opis sprawy:</b><br>' + escHtml(data.authOpis) + '</div>' : '') +
        '<div style="background:#eff6ff;border:1px solid #e2e8f0;border-top:none;padding:16px 24px;border-radius:0 0 12px 12px;text-align:center">' +
          '<p style="margin:0;font-size:14px;color:#1e40af;font-weight:700">Odpowiedz na tego maila: OK / NIE OK</p>' +
          '<p style="margin:6px 0 0;font-size:12px;color:#64748b">Pracownik potwierdzi w systemie, że uzyskał Twoją autoryzację</p>' +
        '</div>' +
      '</div>';

    _sendThreadedEmail({
      to: CONFIG.ADMIN_EMAIL + ',' + CONFIG.WNIOSKI_EMAIL,
      threadKey: 'internal-' + nrZgl,
      subject: '[AUTORYZACJA] — ' + nrZgl + ' — dopłata ' + fmtEUR(doplata) + ' (próg ' + threshold + ' €)',
      htmlBody: htmlBody,
      name: 'MAGGuarantee'
    });
    return { success: true };
  } catch(e) {
    Logger.log('sendAuthorizationRequest ERR: ' + e.message);
    return { success: false, error: e.message };
  }
}

// adminSignAuthorization usunięte — autoryzacja teraz mailowa


// ── NOWY WNIOSEK (przewoźnik) ──
function submitNewClaim(data, callerLogin) {
  // Walidacja: tylko przewoźnik może składać wnioski
  var caller = validateCaller(callerLogin);
  if (!caller || caller.rola !== 'przewoznik') {
    return { success: false, error: 'Brak uprawnień do składania wniosków.' };
  }
  // Wymuś nazwę przewoźnika z bazy (nie z frontendu)
  data.przewoznikNazwa = caller.nazwa;
  
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheetG = ss.getSheetByName(CONFIG.SHEET_GWARANCJA);
  var sheetW = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheetG) return { success: false, error: 'Brak arkusza GWARANCJA' };
  if (!sheetW) return { success: false, error: 'Brak arkusza WNIOSEK' };

  try {
    var teraz = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss');
    var pojazd = (data.pojazd || '').toUpperCase();
    var km = parseFloat(data.km) || 0;
    var przewoznikNazwa = data.przewoznikNazwa || '?';

    // 1. Oblicz NAJPIERW — walidacja PRZED zapisem
    var dStartRaw = data.dataZaladunku ? new Date(data.dataZaladunku) : null;
    var dStopRaw = data.dataRozladunku ? new Date(data.dataRozladunku) : null;
    var hStartVal = dStartRaw ? (dStartRaw.getHours() + dStartRaw.getMinutes() / 60) : null;
    var hStopVal = dStopRaw ? (dStopRaw.getHours() + dStopRaw.getMinutes() / 60) : null;
    var dStart = dStartRaw ? new Date(dStartRaw.getFullYear(), dStartRaw.getMonth(), dStartRaw.getDate()) : null;
    var dStop = dStopRaw ? new Date(dStopRaw.getFullYear(), dStopRaw.getMonth(), dStopRaw.getDate()) : null;
    
    var limityData = getLimityKm();
    
    // Walidacja: 7 dni na złożenie wniosku od daty rozładunku
    if (dStop) {
      var nowDate = new Date();
      var diffMs = nowDate.getTime() - dStop.getTime();
      var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        return { success: false, error: 'Termin na złożenie wniosku minął. Zgodnie z umową współpracy masz 7 dni od daty rozładunku na złożenie wniosku (upłynęło ' + diffDays + ' dni).' };
      }
    }
    
    var calcResult = calcKmGwarantPerMonth(dStart, dStop, hStartVal, hStopVal, limityData.km, limityData.stawki);
    var dniJezdne = calcResult.totalDays;
    var kmGwarant = calcResult.kmGwarant;
    var roznica = km - kmGwarant;
    var doplata = roznica < 0 ? Math.ceil(Math.abs(roznica) * calcResult.stawka) : 0;
    
    // Walidacja: blokada gdy brak dopłaty
    if (dniJezdne < 10) {
      return { success: false, error: 'Samochód był w trasie mniej niż 10 dni roboczych (' + dniJezdne + ' dni). Minimum to 10 dni.' };
    }
    if (kmGwarant === 0) {
      return { success: false, error: 'Brak limitu km gwarantowanych w tym okresie. Miesiące objęte wnioskiem mają limit 0 km.' };
    }
    if (doplata === 0) {
      return { success: false, error: 'Km zrealizowane (' + km + ') są równe lub wyższe niż km gwarantowane (' + kmGwarant + '). Brak podstaw do dopłaty. Zgłoś kolejny pojazd.' };
    }

    // 2. LOCK — zabezpieczenie numeracji przed równoczesnym dostępem (200 przewoźników)
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000); // czekaj max 15 sek
    } catch (lockErr) {
      return { success: false, error: 'System jest zajęty — spróbuj ponownie za chwilę.' };
    }

    try {
    // 3. Zapisz do GWARANCJA (wewnątrz locka — spójność z WNIOSEK)
    sheetG.appendRow([teraz, pojazd, data.dataZaladunku || '', data.dataRozladunku || '', km, data.opis || '']);
    // Generuj nr zgłoszenia: GWA/NNN/MM/RR (resetuje się co miesiąc)
    var now = new Date();
    var miesiac = now.getMonth() + 1;
    var rok = now.getFullYear();
    var rokSkrot = rok.toString().slice(-2); // 2026 → "26"
    var mm = miesiac < 10 ? '0' + miesiac : '' + miesiac;
    var suffix = '/' + mm + '/' + rokSkrot; // np. /02/26

    var dataW = sheetW.getDataRange().getValues();
    var maxNr = 0;
    for (var i = 1; i < dataW.length; i++) {
      var nr = (dataW[i][0] || '').toString();
      // Szukaj: GWA/NNN/MM/RR — tylko ten sam miesiąc/rok
      if (nr.indexOf('GWA/') === 0 && nr.indexOf(suffix) > 0) {
        var parts = nr.replace('GWA/', '').split('/');
        var n = parseInt(parts[0]) || 0;
        if (n > maxNr) maxNr = n;
      }
      // Fallback: stary format GWA/NNN/MM/RRRR (4-cyfrowy rok)
      var suffixOld = '/' + mm + '/' + rok;
      if (nr.indexOf('GWA/') === 0 && nr.indexOf(suffixOld) > 0) {
        var partsOld = nr.replace('GWA/', '').split('/');
        var nOld = parseInt(partsOld[0]) || 0;
        if (nOld > maxNr) maxNr = nOld;
      }
    }
    var nextNr = maxNr + 1;
    var nnn = nextNr < 10 ? '00' + nextNr : nextNr < 100 ? '0' + nextNr : '' + nextNr;
    var nrZgl = 'GWA/' + nnn + '/' + mm + '/' + rokSkrot;

    // Build limit info string for column J
    var limitInfo = calcResult.breakdown.map(function(b) { return b.monthName + ':' + b.limit; }).join('; ');

    // 4. Zapisz do WNIOSEK
    // Kolumny: A=Nr, B=Przewoźnik, C=Pojazd, D=DataStart, E=GodzStart, F=DataStop, G=GodzStop,
    //          H=DniJezdne, I=Przebieg, J=KmNaDzien, K=KmGwarant, L=Różnica, M=Dopłata, N=Status, O=Komentarz
    var dataStartStr = dStartRaw ? Utilities.formatDate(dStartRaw, 'Europe/Warsaw', 'dd.MM.yyyy') : '';
    var godzinaStart = dStartRaw ? Utilities.formatDate(dStartRaw, 'Europe/Warsaw', 'HH:mm') : '';
    var dataStopStr = dStopRaw ? Utilities.formatDate(dStopRaw, 'Europe/Warsaw', 'dd.MM.yyyy') : '';
    var godzinaStop = dStopRaw ? Utilities.formatDate(dStopRaw, 'Europe/Warsaw', 'HH:mm') : '';

    sheetW.appendRow([
      nrZgl,                                    // A - Nr zgłoszenia
      przewoznikNazwa,                           // B - Nazwa przewoźnika
      pojazd,                                    // C - Nr rej
      dataStartStr,                              // D - Data start
      godzinaStart,                              // E - Godzina start
      dataStopStr,                               // F - Data stop
      godzinaStop,                               // G - Godzina stop
      dniJezdne,                                 // H - Dni jezdne
      km,                                        // I - Przebieg (km zrealizowane)
      limitInfo,                                   // J - Limity km/dzień per miesiąc
      kmGwarant,                                 // K - Km gwarantowane
      roznica,                                   // L - Różnica
      fmtEUR(doplata),     // M - Dopłata
      'NA WERYFIKACJI',                          // N - Status
      'Komentarz Przewoźnik:\n' + (data.opis || '(brak)') + '\nKomentarz Magtrans:\n', // O - Komentarz
      '',                                        // P - Nr zlecenia (wypełnia weryfikujący)
      '',                                        // Q - Data zlecenia
      '',                                        // R - (reserved)
      data.planista || '',                        // S - Spedytor
      '',                                        // T - (reserved)
      '',                                        // U - (reserved)
      '',                                        // V - (reserved)
      '',                                        // W - (reserved)
      '',                                        // X - (reserved)
      data.opiekun || '',                          // Y - Opiekun
      '',                                        // Z - (reserved)
      '',                                        // AA - (reserved)
      '',                                        // AB - (reserved)
      '',                                        // AC - (reserved)
      '',                                        // AD - (reserved)
      '',                                            // AE - Autoryzacja status
      '',                                            // AF - Autoryzacja opis
      '',                                            // AG - Autoryzacja token
      teraz,                                         // AH - Data zgłoszenia
      '',                                              // AI - Data zmiany statusu
      fmtEUR(doplata),           // AJ - Kwota wnioskowana (oryginalna)
    ]);

    // Koloruj status
    var lastRow = sheetW.getLastRow();
    sheetW.getRange(lastRow, 14).setBackground(CONFIG.KOLORY['NA WERYFIKACJI']);

    // Zamroź oryginalne dane przewoźnika (AR-AV = kolumny 44-48)
    sheetW.getRange(lastRow, 44).setValue(dataStartStr);
    sheetW.getRange(lastRow, 45).setValue(godzinaStart);
    sheetW.getRange(lastRow, 46).setValue(dataStopStr);
    sheetW.getRange(lastRow, 47).setValue(godzinaStop);
    sheetW.getRange(lastRow, 48).setValue(km);

    } finally {
      lock.releaseLock(); // ZAWSZE zwolnij lock
    }

    // 5. Email do Magtrans (admin)
    try {
      MailApp.sendEmail({
        to: CONFIG.ADMIN_EMAIL,
        subject: '🆕 Nowy wniosek od ' + przewoznikNazwa + ' — ' + pojazd,
        htmlBody: '<div style="font-family:Arial;padding:20px"><h2>📋 Nowy wniosek</h2>' +
          '<p><b>Nr:</b> ' + escHtml(nrZgl) + '</p>' +
          '<p><b>Przewoznik:</b> ' + escHtml(przewoznikNazwa) + '</p>' +
          '<p><b>Pojazd:</b> ' + escHtml(pojazd) + '</p>' +
          '<p><b>Spedytor:</b> ' + escHtml(data.planista || '—') + '</p>' +
          '<p><b>Km:</b> ' + km + '</p>' +
          '<p><b>Dni jezdne:</b> ' + dniJezdne + ' | <b>Km gwarant.:</b> ' + kmGwarant + ' | <b>Roznica:</b> ' + roznica + '</p>' +
          (doplata > 0 ? '<p><b>Szacowana doplata:</b> ' + fmtEUR(doplata) + '</p>' : '') +
          '<p><a href="https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '">Otworz arkusz</a></p></div>'
      });
    } catch (e) { Logger.log('MAIL ADMIN — BŁĄD: ' + e.message); }

    // 6. Email do przewoźnika (potwierdzenie rejestracji)
    try {
      var carrierEmail = (data.przewoznikEmail || '').trim();
      if (carrierEmail) {
        _sendThreadedEmail({
          to: carrierEmail,
          threadKey: 'carrier-' + nrZgl,
          subject: nrZgl + ' - Twój wniosek gwarancyjny został zarejestrowany',
          name: 'MAGGuarantee',
          htmlBody: buildCarrierEmail({
            title: 'Twój wniosek gwarancyjny został pomyślnie <b style="color:#1e40af">zarejestrowany</b> w naszym systemie.',
            boxBg: '#f0f9ff', boxBorder: '#3b82f6',
            rows: [
              { label: 'Nr wniosku:', value: nrZgl, color: '#1e40af', bold: true, big: true },
              { label: 'Pojazd:', value: pojazd },
              { label: 'Km zrealizowane:', value: km },
              { label: 'Szacowana dopłata:', value: fmtEUR(doplata), color: '#7c3aed', bold: true, big: true },
              { label: 'Data zgłoszenia:', value: Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm') }
            ],
            paragraphs: [
              'Wniosek zostanie rozpatrzony w terminie do <b>7 dni roboczych</b> od daty rejestracji.',
              'Status wniosku możesz na bieżąco śledzić po zalogowaniu do Portalu Przewoźnika w sekcji <b>„Moje Wnioski"</b>.'
            ],
            year: now.getFullYear()
          })
        });
      }
    } catch (e) { Logger.log('MAIL CARRIER — BŁĄD: ' + e.message); }

    // 7. Email wewnętrzny (planista, opiekun, lider planisty, wnioski@magtrans.eu)
    try {
      var plannerInfo = getPlannerEmailAndLider(data.planista);
      var opiekunEmailAddr = getOpiekunEmail(data.opiekun);

      Logger.log('MAIL WEWNĘTRZNY — planista: ' + data.planista + ' email: ' + plannerInfo.email + ' lider: ' + plannerInfo.liderEmail + ' opiekun: ' + data.opiekun + ' opiekunEmail: ' + opiekunEmailAddr);

      // Walidacja adresów email (prosty regex)
      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      var internalTo = [];
      if (plannerInfo.email && emailRe.test(plannerInfo.email)) internalTo.push(plannerInfo.email.trim());
      if (plannerInfo.liderEmail && emailRe.test(plannerInfo.liderEmail)) internalTo.push(plannerInfo.liderEmail.trim());
      if (opiekunEmailAddr && emailRe.test(opiekunEmailAddr)) internalTo.push(opiekunEmailAddr.trim());
      internalTo.push('wnioski@magtrans.eu');

      // Deduplikacja
      var seenTo = {}; internalTo = internalTo.filter(function(em) { var k = em.toLowerCase(); if (seenTo[k]) return false; seenTo[k] = true; return true; });

      var toList = internalTo.join(',');
      var ccList = '';

      Logger.log('MAIL WEWNĘTRZNY — TO: ' + toList);

      // Escapuj komentarz przewoźnika
      var opisSafe = (data.opis || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/\n/g, '<br>');

      if (toList) {
        var intSubject = 'Nowy wniosek ' + nrZgl + ' — ' + przewoznikNazwa + ' / ' + pojazd;
        var intBody = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">' +
          '<div style="background:#fef2f2;padding:14px 32px;border-radius:12px 12px 0 0;border:2px solid #dc2626;text-align:center">' +
            '<p style="margin:0;font-size:14px;font-weight:800;color:#dc2626">⚠️ Uwaga! Mail wewnętrzny — nie przesyłaj i nie dodawaj przewoźnika do konwersacji wewnętrznej!</p>' +
          '</div>' +
          '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 32px">' +
            '<h2 style="color:#fff;margin:0;font-size:18px;text-align:center">Nowy wniosek gwarancyjny</h2>' +
          '</div>' +
          '<div style="background:#fff;padding:24px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
              '<tr><td style="padding:8px 0;color:#64748b;width:160px"><b>Nr wniosku:</b></td><td style="padding:8px 0;font-weight:700;color:#1e40af;font-size:16px">' + nrZgl + '</td></tr>' +
              '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Przewoźnik:</b></td><td style="padding:8px 0;font-weight:700">' + przewoznikNazwa + '</td></tr>' +
              '<tr><td style="padding:8px 0;color:#64748b"><b>Pojazd:</b></td><td style="padding:8px 0;font-weight:600;font-family:monospace">' + pojazd + '</td></tr>' +
              '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Planista:</b></td><td style="padding:8px 0;font-weight:600">' + (data.planista || '—') + '</td></tr>' +
              '<tr><td style="padding:8px 0;color:#64748b"><b>Opiekun:</b></td><td style="padding:8px 0;font-weight:600">' + (data.opiekun || '—') + '</td></tr>' +
              '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Okres:</b></td><td style="padding:8px 0">' + dataStartStr + ' — ' + dataStopStr + '</td></tr>' +
              '<tr><td style="padding:8px 0;color:#64748b"><b>Dni jezdne:</b></td><td style="padding:8px 0">' + dniJezdne + '</td></tr>' +
              '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Km zrealizowane:</b></td><td style="padding:8px 0;font-weight:600">' + km + '</td></tr>' +
              '<tr><td style="padding:8px 0;color:#64748b"><b>Km gwarantowane:</b></td><td style="padding:8px 0">' + kmGwarant + '</td></tr>' +
              '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Różnica:</b></td><td style="padding:8px 0;font-weight:700;color:' + (roznica < 0 ? '#ef4444' : '#22c55e') + '">' + roznica + ' km</td></tr>' +
              '<tr><td style="padding:8px 0;color:#64748b"><b>Szacowana dopłata:</b></td><td style="padding:8px 0;font-weight:800;color:#7c3aed;font-size:16px">' + fmtEUR(doplata) + '</td></tr>' +
            '</table>' +
            (opisSafe ? '<div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px"><div style="font-size:11px;color:#92400e;font-weight:700;margin-bottom:4px">KOMENTARZ PRZEWOŹNIKA:</div><div style="font-size:13px;color:#78350f">' + opisSafe + '</div></div>' : '') +
          '</div>' +
        '</div>';

        var emailOpts = {
          to: toList,
          subject: intSubject,
          body: 'Nowy wniosek ' + nrZgl + ' od ' + przewoznikNazwa + ' / ' + pojazd + '. Planista: ' + (data.planista || '-') + ', Opiekun: ' + (data.opiekun || '-') + '. Dopłata: ' + fmtEUR(doplata),
          htmlBody: intBody
        };
        if (ccList) emailOpts.cc = ccList;

        Logger.log('MAIL WEWNĘTRZNY — wysyłam...');
        MailApp.sendEmail(emailOpts);
        Logger.log('MAIL WEWNĘTRZNY — wysłano OK');
      } else {
        Logger.log('MAIL WEWNĘTRZNY — brak adresów TO, nie wysłano');
      }
    } catch (emailErr) {
      Logger.log('MAIL WEWNĘTRZNY — BŁĄD: ' + emailErr.message + ' | stack: ' + emailErr.stack);
    }

    return { success: true, sygnatura: teraz, nrZgl: nrZgl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── DIAGNOSTYKA MAILI — uruchom ręcznie w Apps Script ──
function diagnostykaMaili() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var log = [];

  // 1. Sprawdź arkusz PLANISCI
  var sheetP = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  if (!sheetP) {
    log.push('BŁĄD: Brak arkusza PLANISCI');
  } else {
    var dataP = sheetP.getDataRange().getValues();
    log.push('PLANISCI — wierszy (z nagłówkiem): ' + dataP.length);
    log.push('PLANISCI — nagłówki: ' + JSON.stringify(dataP[0]));
    for (var i = 1; i < dataP.length; i++) {
      var name = (dataP[i][0] || '').toString().trim();
      var email = (dataP[i][1] || '').toString().trim();
      var active = (dataP[i][2] || '').toString().trim();
      var lider = (dataP[i][3] || '').toString().trim();
      log.push('  [' + i + '] Nazwa: "' + name + '" | Email: "' + email + '" | Aktywny: "' + active + '" | Lider: "' + lider + '"');
    }
  }

  // 2. Sprawdź arkusz OPIEKUN (lub stary OPIEKUNOWIE)
  var sheetO = ss.getSheetByName(CONFIG.SHEET_OPIEKUN) || ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (!sheetO) {
    log.push('BŁĄD: Brak arkusza OPIEKUN / OPIEKUNOWIE');
  } else {
    var dataO = sheetO.getDataRange().getValues();
    log.push('OPIEKUN — wierszy (z nagłówkiem): ' + dataO.length);
    log.push('OPIEKUN — nagłówki: ' + JSON.stringify(dataO[0]));
    for (var j = 1; j < dataO.length; j++) {
      var nameO = (dataO[j][0] || '').toString().trim();
      var emailO = (dataO[j][1] || '').toString().trim();
      var activeO = (dataO[j][2] || '').toString().trim();
      log.push('  [' + j + '] Nazwa: "' + nameO + '" | Email: "' + emailO + '" | Aktywny: "' + activeO + '"');
    }
  }

  // 3. Testowy lookup
  if (sheetP && sheetP.getLastRow() > 1) {
    var testName = (sheetP.getRange(2, 1).getValue() || '').toString().trim();
    log.push('--- TEST LOOKUP dla: "' + testName + '" ---');
    var result = getPlannerEmailAndLider(testName);
    log.push('getPlannerEmailAndLider wynik: email="' + result.email + '" liderEmail="' + result.liderEmail + '"');
  }

  if (sheetO && sheetO.getLastRow() > 1) {
    var testNameO = (sheetO.getRange(2, 1).getValue() || '').toString().trim();
    log.push('--- TEST LOOKUP dla opiekuna: "' + testNameO + '" ---');
    var resultO = getOpiekunEmail(testNameO);
    log.push('getOpiekunEmail wynik: email="' + resultO + '"');
  }

  // 4. MailApp quota
  var remaining = MailApp.getRemainingDailyQuota();
  log.push('--- MailApp remaining daily quota: ' + remaining + ' ---');

  var fullLog = log.join('\n');
  Logger.log(fullLog);
  return fullLog;
}

// Ponowne wysłanie emaila wewnętrznego dla istniejącego wniosku
// Użycie: ponowWyslijEmail('GWA/017/03/26')
function ponowWyslijEmail(nrZgl) {
  if (!nrZgl) return 'Podaj nr wniosku, np: ponowWyslijEmail("GWA/017/03/26")';
  
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return 'Brak arkusza WNIOSEK';
  
  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === nrZgl.trim()) { rowIdx = i; break; }
  }
  if (rowIdx < 0) return 'Nie znaleziono wniosku: ' + nrZgl;
  
  var row = data[rowIdx];
  var przewoznikNazwa = (row[1] || '').toString().trim();
  var pojazd = (row[2] || '').toString().trim();
  var dataStartStr = (row[3] || '').toString().trim();
  var dataStopStr = (row[5] || '').toString().trim();
  var dniJezdne = row[7] || 0;
  var km = row[8] || 0;
  var kmGwarant = row[10] || 0;
  var roznica = row[11] || 0;
  var doplata = (row[12] || '').toString().trim();
  var planista = (row[18] || '').toString().trim();
  var opiekun = (row[24] || '').toString().trim();
  var opis = (row[14] || '').toString().trim();
  
  var opisPrzewoznika = '';
  if (opis.indexOf('Komentarz Przewo') >= 0) {
    var parts = opis.split('Komentarz Magtrans:');
    opisPrzewoznika = parts[0].replace(/Komentarz Przewo[a-zżźćńółęąś]*:/i, '').trim();
  }
  var opisSafe = opisPrzewoznika.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
  
  var plannerInfo = getPlannerEmailAndLider(planista);
  var opiekunEmailAddr = getOpiekunEmail(opiekun);
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  var internalTo = [];
  internalTo.push(CONFIG.ADMIN_EMAIL); // Maksim
  if (plannerInfo.email && emailRe.test(plannerInfo.email)) internalTo.push(plannerInfo.email.trim());
  if (plannerInfo.liderEmail && emailRe.test(plannerInfo.liderEmail)) internalTo.push(plannerInfo.liderEmail.trim());

  var seenTo = {}; internalTo = internalTo.filter(function(em) { var k = em.toLowerCase(); if (seenTo[k]) return false; seenTo[k] = true; return true; });

  var toList = internalTo.join(',');
  var ccList = '';
  
  var remaining = MailApp.getRemainingDailyQuota();
  if (remaining < 1) return 'Quota MailApp wyczerpana (0). Spróbuj jutro.';
  
  var intSubject = 'Nowy wniosek ' + nrZgl + ' — ' + przewoznikNazwa + ' / ' + pojazd;
  var intBody = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto">' +
    '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 32px;border-radius:12px 12px 0 0">' +
      '<h2 style="color:#fff;margin:0;font-size:18px">Nowy wniosek gwarancyjny</h2>' +
    '</div>' +
    '<div style="background:#fff;padding:24px 32px;border:1px solid #e2e8f0;border-top:none">' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
        '<tr><td style="padding:8px 0;color:#64748b;width:160px"><b>Nr wniosku:</b></td><td style="padding:8px 0;font-weight:700;color:#1e40af;font-size:16px">' + nrZgl + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Przewoznik:</b></td><td style="padding:8px 0;font-weight:700">' + przewoznikNazwa + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b"><b>Pojazd:</b></td><td style="padding:8px 0;font-weight:600;font-family:monospace">' + pojazd + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Planista:</b></td><td style="padding:8px 0;font-weight:600">' + (planista || '—') + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b"><b>Opiekun:</b></td><td style="padding:8px 0;font-weight:600">' + (opiekun || '—') + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Okres:</b></td><td style="padding:8px 0">' + dataStartStr + ' — ' + dataStopStr + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b"><b>Dni jezdne:</b></td><td style="padding:8px 0">' + dniJezdne + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Km zrealizowane:</b></td><td style="padding:8px 0;font-weight:600">' + km + '</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b"><b>Km gwarantowane:</b></td><td style="padding:8px 0">' + kmGwarant + '</td></tr>' +
        '<tr style="background:#f8fafc"><td style="padding:8px 0;color:#64748b"><b>Roznica:</b></td><td style="padding:8px 0;font-weight:700;color:' + (roznica < 0 ? '#ef4444' : '#22c55e') + '">' + roznica + ' km</td></tr>' +
        '<tr><td style="padding:8px 0;color:#64748b"><b>Szacowana doplata:</b></td><td style="padding:8px 0;font-weight:800;color:#7c3aed;font-size:16px">' + doplata + '</td></tr>' +
      '</table>' +
      (opisSafe ? '<div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px"><div style="font-size:11px;color:#92400e;font-weight:700;margin-bottom:4px">KOMENTARZ PRZEWOZNIKA:</div><div style="font-size:13px;color:#78350f">' + opisSafe + '</div></div>' : '') +
    '</div>' +
    '<div style="background:#fef2f2;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;text-align:center">' +
      '<p style="margin:0;font-size:14px;font-weight:700;color:#dc2626">Uwaga! Mail wewnętrzny - nie przesyłaj i nie dodawaj przewoźnika do konwersacji wewnętrznej!</p>' +
    '</div>' +
  '</div>';
  
  var emailOpts = {
    to: toList,
    subject: intSubject,
    body: 'Wniosek ' + nrZgl + ' od ' + przewoznikNazwa + ' / ' + pojazd,
    htmlBody: intBody
  };
  if (ccList) emailOpts.cc = ccList;
  
  try {
    MailApp.sendEmail(emailOpts);
    var msg = 'Wysłano email dla ' + nrZgl + '\nTO: ' + toList + (ccList ? '\nCC: ' + ccList : '') + '\nQuota remaining: ' + (remaining - 1);
    Logger.log(msg);
    return msg;
  } catch (e) {
    var errMsg = 'Błąd wysyłki: ' + e.message;
    Logger.log(errMsg);
    return errMsg;
  }
}

// ── STATYSTYKI (dashboard) ──
// ══ DIAGNOSTYKA — uruchom z edytora aby sprawdzić błędy ══
function DIAGNOSTYKA_WNIOSKÓW() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) { Logger.log('BRAK ARKUSZA WNIOSEK!'); return; }
  var data = sheet.getDataRange().getValues();
  Logger.log('Wierszy: ' + data.length + ' | Kolumn: ' + (data[0] ? data[0].length : 0));
  
  var errors = [];
  for (var i = 1; i < data.length; i++) {
    var nrZgl = (data[i][0] || '').toString().trim();
    if (!nrZgl) continue;
    try {
      var claim = buildClaimObj(data[i], i);
      Logger.log('OK wiersz ' + (i+1) + ': ' + nrZgl + ' | status=' + claim.status + ' | kolumn=' + data[i].length);
    } catch (e) {
      var msg = 'BŁĄD wiersz ' + (i+1) + ': ' + nrZgl + ' | ' + e.message;
      Logger.log(msg);
      errors.push(msg);
      // Pokaż wartości kolumn 43-48 dla debugowania
      Logger.log('  row[43]=' + JSON.stringify(data[i][43]) + ' row[44]=' + JSON.stringify(data[i][44]) + 
                 ' row[45]=' + JSON.stringify(data[i][45]) + ' row[46]=' + JSON.stringify(data[i][46]) +
                 ' row[47]=' + JSON.stringify(data[i][47]) + ' row[48]=' + JSON.stringify(data[i][48]));
    }
  }
  
  if (errors.length > 0) {
    Logger.log('=== ZNALEZIONE BŁĘDY: ' + errors.length + ' ===');
    errors.forEach(function(e) { Logger.log(e); });
  } else {
    Logger.log('=== BRAK BŁĘDÓW — wszystkie wnioski się ładują ===');
  }
}

function getDashboardStats() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return { total: 0, zaakceptowane: 0, odrzucone: 0, naWeryfikacji: 0, reklamacja: 0, oczekujeAuth: 0, sumaDoplat: 0, wnioskowana: 0, wyplacona: 0, przewoznicy: [], claimsByStatus: {}, monthly: [], topCarriers: [], urgent: [], recentActivity: [], avgProcessingH: 0, reklamacjeStats: {} };
  var data = sheet.getDataRange().getValues();
  var s = {
    total: 0, zaakceptowane: 0, odrzucone: 0, naWeryfikacji: 0, reklamacja: 0, oczekujeAuth: 0,
    sumaDoplat: 0, wnioskowana: 0, wyplacona: 0,
    ps: {},
    claimsByStatus: { all: [], zaakceptowane: [], odrzucone: [], naWeryfikacji: [], reklamacja: [] },
    monthly: {},           // month -> {submitted, accepted, rejected, reklamacja, amount}
    carrierStats: {},      // carrier -> {total, accepted, rejected, pending, payout, wnioskowana}
    processingTimes: [],   // hours to resolve
    urgent: [],            // claims needing attention
    recentActivity: [],    // last 10 status changes
    reklamacjeStats: { total: 0, accepted: 0, rejected: 0, pending: 0, partiallyAccepted: 0 },
    topPayouts: [],        // biggest individual payouts
    spedytorStats: {}      // spedytor -> {name, total, payout, count}
  };

  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var st = (data[i][13] || '').toString().toUpperCase().trim();
    var n = (data[i][1] || '').toString().trim();
    var dp = parseFloat((data[i][12] || '0').toString().replace(/[€ ]/g, '').replace(',', '.')) || 0;
    var kwOrig = parseFloat((data[i][35] || '0').toString().replace(/[€ ]/g, '').replace(',', '.')) || 0;
    var kwWnioskowana = kwOrig > 0 ? kwOrig : dp;
    var pojazd = (data[i][2] || '').toString().trim();
    var dataZgl = data[i][33] ? new Date(data[i][33]) : null; // AH = data zgłoszenia
    var dataZmiany = data[i][34] ? new Date(data[i][34]) : null; // AI = data zmiany statusu
    var hadRekl = (data[i][36] || '').toString().trim() === 'Tak';
    var orgStat = (data[i][42] || '').toString().trim().toUpperCase();
    var nrZgl = (data[i][0] || '').toString();

    var mini = {
      nr: nrZgl,
      przewoznik: n,
      planista: (data[i][18] || '').toString().trim(),
      pojazd: pojazd,
      doplata: dp,
      status: st,
      dataZgl: dataZgl ? Utilities.formatDate(dataZgl, 'Europe/Warsaw', 'dd.MM.yyyy HH:mm') : '',
      dataZmiany: dataZmiany ? Utilities.formatDate(dataZmiany, 'Europe/Warsaw', 'dd.MM.yyyy HH:mm') : ''
    };

    s.total++;
    s.wnioskowana += kwWnioskowana;
    s.claimsByStatus.all.push(mini);

    // Status counting
    if (st.indexOf('ZAAKCEPTOWANO') >= 0) {
      s.zaakceptowane++; s.sumaDoplat += dp; s.wyplacona += dp;
      s.claimsByStatus.zaakceptowane.push(mini);
    } else if (st.indexOf('ODRZUCONO') >= 0) {
      s.odrzucone++;
      if (hadRekl && orgStat.indexOf('ZAAKCEPTOWANO') >= 0) { s.sumaDoplat += dp; s.wyplacona += dp; }
      s.claimsByStatus.odrzucone.push(mini);
    } else if (st.indexOf('OCZEKUJE') >= 0 || st.indexOf('AUTORYZACJA') >= 0) {
      s.oczekujeAuth++;
      s.claimsByStatus.naWeryfikacji.push(mini);
    } else if (st.indexOf('WERYFIKACJI') >= 0) {
      s.naWeryfikacji++;
      s.claimsByStatus.naWeryfikacji.push(mini);
    } else if (st.indexOf('REKLAMACJA') >= 0) {
      s.reklamacja++;
      s.claimsByStatus.reklamacja.push(mini);
    }

    // Monthly trends
    if (dataZgl && !isNaN(dataZgl.getTime())) {
      var mk = Utilities.formatDate(dataZgl, 'Europe/Warsaw', 'yyyy-MM');
      if (!s.monthly[mk]) s.monthly[mk] = { key: mk, submitted: 0, accepted: 0, rejected: 0, reklamacja: 0, amount: 0 };
      s.monthly[mk].submitted++;
      if (st.indexOf('ZAAKCEPTOWANO') >= 0) { s.monthly[mk].accepted++; s.monthly[mk].amount += dp; }
      else if (st.indexOf('ODRZUCONO') >= 0) { s.monthly[mk].rejected++; }
      else if (st.indexOf('REKLAMACJA') >= 0) { s.monthly[mk].reklamacja++; }
    }

    // Carrier stats
    if (n) {
      s.ps[n] = true;
      if (!s.carrierStats[n]) s.carrierStats[n] = { name: n, total: 0, accepted: 0, rejected: 0, pending: 0, payout: 0, wnioskowana: 0 };
      s.carrierStats[n].total++;
      s.carrierStats[n].wnioskowana += kwWnioskowana;
      if (st.indexOf('ZAAKCEPTOWANO') >= 0) { s.carrierStats[n].accepted++; s.carrierStats[n].payout += dp; }
      else if (st.indexOf('ODRZUCONO') >= 0) { s.carrierStats[n].rejected++; }
      else { s.carrierStats[n].pending++; }
    }

    // Processing times (for resolved claims)
    if (dataZgl && dataZmiany && !isNaN(dataZgl.getTime()) && !isNaN(dataZmiany.getTime()) &&
        (st.indexOf('ZAAKCEPTOWANO') >= 0 || st.indexOf('ODRZUCONO') >= 0)) {
      var hours = (dataZmiany - dataZgl) / 3600000;
      if (hours >= 0 && hours < 720) s.processingTimes.push(hours); // max 30 days
    }

    // Urgent: pending claims
    if (st.indexOf('WERYFIKACJI') >= 0 || st.indexOf('REKLAMACJA') >= 0 || st.indexOf('OCZEKUJE') >= 0) {
      var waitH = dataZgl && !isNaN(dataZgl.getTime()) ? Math.round((now - dataZgl) / 3600000) : 0;
      s.urgent.push({ nr: nrZgl, przewoznik: n, pojazd: pojazd, status: st, waitH: waitH, doplata: dp });
    }

    // Recent activity (resolved)
    if (dataZmiany && !isNaN(dataZmiany.getTime()) && (st.indexOf('ZAAKCEPTOWANO') >= 0 || st.indexOf('ODRZUCONO') >= 0)) {
      s.recentActivity.push({ nr: nrZgl, przewoznik: n, pojazd: pojazd, status: st, date: dataZmiany.getTime(), dateStr: Utilities.formatDate(dataZmiany, 'Europe/Warsaw', 'dd.MM HH:mm'), doplata: dp });
    }

    // Reklamacje stats
    if (hadRekl) {
      s.reklamacjeStats.total++;
      if (st.indexOf('REKLAMACJA') >= 0) s.reklamacjeStats.pending++;
      else if (st.indexOf('ZAAKCEPTOWANO') >= 0) {
        var rekKw = parseFloat((data[i][39] || '0').toString().replace(/[€ ]/g, '').replace(',', '.')) || 0;
        var rekZatw = parseFloat((data[i][40] || '0').toString().replace(/[€ ]/g, '').replace(',', '.')) || 0;
        if (rekZatw < rekKw) s.reklamacjeStats.partiallyAccepted++;
        else s.reklamacjeStats.accepted++;
      }
      else if (st.indexOf('ODRZUCONO') >= 0) s.reklamacjeStats.rejected++;
    }

    // Top payouts (accepted claims only)
    if (st.indexOf('ZAAKCEPTOWANO') >= 0 && dp > 0) {
      s.topPayouts.push({ nr: nrZgl, przewoznik: n, pojazd: pojazd, payout: dp, planista: mini.planista });
    }

    // Spedytor (planista) stats
    var sped = mini.planista || '(brak)';
    if (!s.spedytorStats[sped]) s.spedytorStats[sped] = { name: sped, total: 0, accepted: 0, payout: 0, wnioskowana: 0 };
    s.spedytorStats[sped].total++;
    s.spedytorStats[sped].wnioskowana += kwWnioskowana;
    if (st.indexOf('ZAAKCEPTOWANO') >= 0) { s.spedytorStats[sped].accepted++; s.spedytorStats[sped].payout += dp; }
  }

  // Finalize
  s.przewoznicy = Object.keys(s.ps).sort();
  delete s.ps;

  // Monthly -> sorted array (last 6 months)
  var monthKeys = Object.keys(s.monthly).sort();
  s.monthly = monthKeys.slice(-6).map(function(k) { return s.monthly[k]; });

  // Top carriers sorted by payout desc
  s.topCarriers = Object.keys(s.carrierStats).map(function(k) { return s.carrierStats[k]; });
  s.topCarriers.sort(function(a, b) { return b.payout - a.payout; });
  s.topCarriers = s.topCarriers.slice(0, 10);
  delete s.carrierStats;

  // Avg processing time
  if (s.processingTimes.length > 0) {
    s.avgProcessingH = Math.round(s.processingTimes.reduce(function(a, b) { return a + b; }, 0) / s.processingTimes.length);
  } else {
    s.avgProcessingH = 0;
  }
  delete s.processingTimes;

  // Urgent sorted by wait time desc
  s.urgent.sort(function(a, b) { return b.waitH - a.waitH; });
  s.urgent = s.urgent.slice(0, 15);

  // Recent activity sorted by date desc
  s.recentActivity.sort(function(a, b) { return b.date - a.date; });
  s.recentActivity = s.recentActivity.slice(0, 10);

  // Top payouts sorted by amount desc
  s.topPayouts.sort(function(a, b) { return b.payout - a.payout; });
  s.topPayouts = s.topPayouts.slice(0, 10);

  // Spedytor stats sorted by payout desc
  var spedArr = Object.keys(s.spedytorStats).map(function(k) { return s.spedytorStats[k]; });
  spedArr.sort(function(a, b) { return b.payout - a.payout; });
  s.spedytorStats = spedArr;

  return s;
}

// ── NARZĘDZIA ──
function fmtDate(val) {
  try {
    var d = new Date(val);
    if (isNaN(d.getTime())) return val.toString();
    return Utilities.formatDate(d, 'Europe/Warsaw', 'dd.MM.yyyy');
  } catch (e) { return val.toString(); }
}

function fmtDateTime(val) {
  if (!val) return '';
  try {
    // If already a nice string like "25.02.2026 14:30", return as-is
    var s = val.toString().trim();
    if (/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}$/.test(s)) return s;
    var d = new Date(val);
    if (isNaN(d.getTime())) return s;
    return Utilities.formatDate(d, 'Europe/Warsaw', 'dd.MM.yyyy HH:mm');
  } catch (e) { return val.toString(); }
}

// ── REKLAMACJA (carrier submits once per claim) ──
function submitReklamacja(rowNumber, tresc, kwotaReklamacji, callerLogin) {
  // Walidacja: przewoźnik może składać reklamację TYLKO na swoje wnioski
  if (!requireCarrierOwner(callerLogin, rowNumber)) {
    return { success: false, error: 'Brak uprawnień do reklamacji tego wniosku.' };
  }
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return { success: false, error: 'Brak arkusza' };

  // Check if already submitted
  var existing = (sheet.getRange(rowNumber, 37).getValue() || '').toString().trim();
  if (existing === 'Tak') {
    return { success: false, error: 'Reklamacja została już złożona dla tego wniosku.' };
  }

  // Validate kwota
  var kwota = parseFloat(kwotaReklamacji) || 0;
  if (kwota <= 0) {
    return { success: false, error: 'Wpisz kwotę reklamacji.' };
  }

  // Validate max: kwota <= (kwotaWnioskowana - doplata paid)
  var kwotaWnioskowana = parseFloat((sheet.getRange(rowNumber, 36).getValue() || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;
  var doplata = parseFloat((sheet.getRange(rowNumber, 13).getValue() || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;
  var currentStatus = (sheet.getRange(rowNumber, 14).getValue() || '').toString().toUpperCase();
  var paidAmount = currentStatus.indexOf('ZAAKCEPTOWANO') >= 0 ? doplata : 0;
  var maxRek = kwotaWnioskowana - paidAmount;
  if (kwota > maxRek + 1) { // +1 for rounding tolerance
    return { success: false, error: 'Kwota reklamacji (' + kwota + ' €) przekracza maksimum (' + Math.round(maxRek) + ' €).' };
  }

  // Check 48h limit from status change
  var statusChangeRaw = sheet.getRange(rowNumber, 35).getValue();
  if (statusChangeRaw) {
    var statusChanged = new Date(statusChangeRaw);
    if (!isNaN(statusChanged.getTime())) {
      var hoursPassed = (new Date() - statusChanged) / 3600000;
      if (hoursPassed > 48) {
        return { success: false, error: 'Czas na złożenie reklamacji minął. Reklamację można złożyć maksymalnie 48 godzin od rozpatrzenia wniosku.' };
      }
    }
  }

  // Mark reklamacja
  sheet.getRange(rowNumber, 37).setValue('Tak');                           // AK - reklamacja złożona
  sheet.getRange(rowNumber, 38).setValue(tresc);                           // AL - treść reklamacji
  sheet.getRange(rowNumber, 40).setValue(fmtEUR(kwota));                   // AN - kwota reklamacji

  // Reset autoryzacji — przy reklamacji obieg od nowa
  sheet.getRange(rowNumber, 31).setValue('');  // AE - autoryzacja status
  sheet.getRange(rowNumber, 32).setValue('');  // AF - autoryzacja opis
  sheet.getRange(rowNumber, 33).setValue('');  // AG - autoryzacja data/token

  // Change status to REKLAMACJA
  var prevStatus = (sheet.getRange(rowNumber, 14).getValue() || '').toString();
  // Zapisz oryginalny status wniosku PRZED reklamacją (AQ = 43)
  sheet.getRange(rowNumber, 43).setValue(prevStatus.toUpperCase().indexOf('ZAAKCEPTOWANO') >= 0 ? 'ZAAKCEPTOWANO' : 'ODRZUCONO');
  sheet.getRange(rowNumber, 14).setValue('REKLAMACJA');
  sheet.getRange(rowNumber, 35).setValue(
    Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm:ss')
  ); // AI - update timestamp for reklamacja tracking
  if (CONFIG.KOLORY['REKLAMACJA']) {
    sheet.getRange(rowNumber, 14).setBackground(CONFIG.KOLORY['REKLAMACJA']);
  }

  // Append reklamacja to CARRIER section of comments
  var existingComment = sheet.getRange(rowNumber, 15).getValue() || '';
  var ts = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM HH:mm');
  var rekComment = '[REKLAMACJA ' + ts + '] ' + tresc;
  
  // Insert into Przewoźnik section (before Komentarz Magtrans:)
  var mIdx = existingComment.indexOf('Komentarz Magtrans:');
  var newComment;
  if (mIdx >= 0) {
    newComment = existingComment.substring(0, mIdx).trimEnd() + '\n' + rekComment + '\n' + existingComment.substring(mIdx);
  } else {
    newComment = existingComment + '\n' + rekComment;
  }
  sheet.getRange(rowNumber, 15).setValue(newComment);

  // Notify admin by email
  var nrZgl = sheet.getRange(rowNumber, 1).getValue();
  var przewoznik = sheet.getRange(rowNumber, 2).getValue();
  try {
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: '⚠️ REKLAMACJA — ' + nrZgl + ' — ' + przewoznik,
      htmlBody: '<div style="font-family:Arial;padding:20px">' +
        '<h2 style="color:#c2410c">⚠️ Reklamacja wniosku</h2>' +
        '<p><b>Nr:</b> ' + escHtml(nrZgl) + '</p>' +
        '<p><b>Przewoznik:</b> ' + escHtml(przewoznik) + '</p>' +
        '<p><b>Poprzedni status:</b> ' + escHtml(prevStatus) + '</p>' +
        '<p style="background:#fff3e0;padding:16px;border-radius:8px;border-left:4px solid #f59e0b"><b>Treść reklamacji:</b><br>' + escHtml(tresc) + '</p>' +
        '<p><a href="https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '">Otworz arkusz</a></p></div>'
    });
  } catch (e) {}

  // Email do przewoźnika (potwierdzenie rejestracji reklamacji)
  try {
    var pojazd = sheet.getRange(rowNumber, 3).getValue();
    var carrierEmail = findCarrierEmail(przewoznik);
    if (carrierEmail) {
      var yr = new Date().getFullYear();
      var kwotaWnioskowanaRek = parseFloat((sheet.getRange(rowNumber, 36).getValue() || '0').toString().replace(/[€\s]/g, '').replace(',', '.')) || 0;
      _sendThreadedEmail({
        to: carrierEmail,
        threadKey: 'carrier-' + nrZgl,
        name: 'MAGGuarantee',
        subject: nrZgl + ' - Twoja reklamacja do wniosku zarejestrowana',
        htmlBody: buildCarrierEmail({
          title: 'Twoja reklamacja do wniosku została <b style="color:#c2410c">zarejestrowana</b>.',
          boxBg: '#fff7ed', boxBorder: '#f59e0b',
          rows: [
            { label: 'Nr wniosku:', value: nrZgl, color: '#c2410c', bold: true, big: true },
            { label: 'Pojazd:', value: pojazd },
            { label: 'Wnioskowana kwota:', value: fmtEUR(kwotaWnioskowanaRek) },
            { label: 'Zaakceptowana kwota:', value: fmtEUR(paidAmount) },
            { label: 'Kwota reklamacji:', value: fmtEUR(kwota), color: '#c2410c', bold: true, big: true }
          ],
          paragraphs: [
            'Reklamacja zostanie rozpatrzona w terminie <b>4 dni roboczych</b> od daty rejestracji.',
            'Status reklamacji możesz na bieżąco śledzić po zalogowaniu do Portalu Przewoźnika w sekcji <b>„Moje Wnioski"</b>.'
          ],
          year: yr
        })
      });
    }
  } catch (e) { Logger.log('MAIL CARRIER REKLAMACJA REG — BLAD: ' + e.message); }

  // Email wewnętrzny do planisty, opiekuna, wnioski@ — informacja o złożonej reklamacji
  try {
    var kwotaWnioskowanaRekInt = parseFloat((sheet.getRange(rowNumber, 36).getValue() || '0').toString().replace(/[€\s]/g,'').replace(',','.')) || 0;
    sendInternalDecisionEmail(sheet, rowNumber, 'REKLAMACJA_ZLOZONA', {
      kwotaWnioskowana: fmtEUR(kwotaWnioskowanaRekInt),
      kwotaReklamacji:  fmtEUR(kwota),
      kwotaWyplaty:     paidAmount > 0 ? fmtEUR(paidAmount) : 'brak (wniosek odrzucony)',
      powod:            tresc
    });
  } catch (e) { Logger.log('INTERNAL REKLAMACJA MAIL ERR: ' + e.message); }

  return { success: true };
}

// getVehicleList usunięto — arkusz REJESTR był pusty

// ── MENU W ARKUSZU ──
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🔧 System Gwarancji')
      .addItem('⚙️ Ustaw automatyzacje (jednorazowo)', 'setupTriggers')
      .addItem('👤 Utworz arkusz uzytkownikow', 'ensureUsersSheet')
      .addSeparator()
      .addItem('🧪 TEST: Wyslij testowy email', 'testEmail')
      .addItem('🔍 TEST: Diagnostyka maila wewnętrznego', 'testInternalEmail')
      .addToUi();
  } catch (e) {}
}

// ── SETUP ──
function setupTriggers() {
  var ex = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ex.length; i++) ScriptApp.deleteTrigger(ex[i]);
  ScriptApp.newTrigger('onEditTrigger').forSpreadsheet(CONFIG.SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger('sendDailyReminders').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('sendWeeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  ensureUsersSheet();
  ensurePlanisciSheet();
  try {
    SpreadsheetApp.getUi().alert('✅ GOTOWE!\n\nAutomatyzacje ustawione.\nArkusze ADMIN, PRACOWNIK, UZYTKOWNICY i PLANISCI utworzone.\n\nNastepny krok:\nWdroz → Nowe wdrozenie → Aplikacja internetowa');
  } catch (e) {}
}

// ── AUTOMATYCZNE REAKCJE ──
function onEditTrigger(e) {
  try {
    var sh = e.source.getActiveSheet();
    if (sh.getName() !== CONFIG.SHEET_WNIOSEK) return;
    if (e.range.getColumn() !== 14 || e.range.getRow() <= 1) return;
    var val = e.range.getValue().toString().toUpperCase().trim();
    if (CONFIG.KOLORY[val]) e.range.setBackground(CONFIG.KOLORY[val]);
  } catch (er) {}
}

function sendDailyReminders() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var data = ss.getSheetByName(CONFIG.SHEET_WNIOSEK).getDataRange().getValues();
    var p = 0;
    for (var i = 1; i < data.length; i++) {
      if ((data[i][13] || '').toString().toUpperCase().indexOf('WERYFIKACJI') >= 0) p++;
    }
    if (p === 0) return;

    // Pobierz URL aplikacji webowej
    var appUrl = ScriptApp.getService().getUrl();

    // Zbierz emaile wszystkich pracownikow i adminow (z właściwych arkuszy)
    var recipients = [CONFIG.ADMIN_EMAIL];
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Pracownicy z arkusza PRACOWNIK
    var sheetPrac = ss.getSheetByName(CONFIG.SHEET_PRACOWNIK);
    if (sheetPrac) {
      var pracData = sheetPrac.getDataRange().getValues();
      for (var j = 1; j < pracData.length; j++) {
        var email = (pracData[j][4] || '').toString().trim();
        if (email && emailRe.test(email)) recipients.push(email);
      }
    }

    // Admini z arkusza ADMIN
    var sheetAdm = ss.getSheetByName(CONFIG.SHEET_ADMIN);
    if (sheetAdm) {
      var admData = sheetAdm.getDataRange().getValues();
      for (var j = 1; j < admData.length; j++) {
        var email = (admData[j][4] || '').toString().trim();
        if (email && emailRe.test(email)) recipients.push(email);
      }
    }

    // Deduplikacja
    var seen = {};
    recipients = recipients.filter(function(em) {
      var k = em.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });

    // Email do pracowników (weryfikacje)
    if (p > 0) {
      var subject = '[PRZYPOMNIENIE] ' + p + ' wnioskow NA WERYFIKACJI';
      var htmlBody = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">' +
        '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 32px;border-radius:12px 12px 0 0">' +
          '<h2 style="color:#fff;margin:0;font-size:18px">⏰ Przypomnienie</h2>' +
          '<p style="color:#94a3b8;margin:6px 0 0;font-size:13px">' + p + ' wnioskow oczekuje na weryfikacje</p>' +
        '</div>' +
        '<div style="background:#fff;padding:24px 32px;border:1px solid #e2e8f0;border-top:none;text-align:center">' +
          '<p style="font-size:15px;color:#334155;margin:0 0 12px">W systemie: <b style="color:#dc2626;font-size:18px">' + p + '</b> wnioskow NA WERYFIKACJI</p>' +
          '<a href="' + appUrl + '" style="display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Przejdz do aplikacji</a>' +
        '</div>' +
        '<div style="background:#fef2f2;padding:10px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;text-align:center">' +
          '<p style="margin:0;font-size:11px;font-weight:700;color:#dc2626">Wiadomość wewnętrzna — nie przesyłaj przewoźnikom</p>' +
        '</div></div>';
      MailApp.sendEmail({ to: recipients.join(','), subject: subject, htmlBody: htmlBody });
      Logger.log('REMINDER wyslany do: ' + recipients.join(', ') + ' | wnioskow: ' + p);
    }
  } catch (er) {
    Logger.log('REMINDER BLAD: ' + er.message);
  }
}

function sendWeeklyReport() {
  try {
    var s = getDashboardStats();
    MailApp.sendEmail({
      to: CONFIG.ADMIN_EMAIL,
      subject: '📊 Raport tygodniowy — ' + s.total + ' wnioskow, ' + fmtEUR(s.sumaDoplat),
      htmlBody: '<div style="font-family:Arial;padding:20px"><h2>📊 Raport tygodniowy</h2>' +
        '<p>Lacznie: ' + s.total + '</p><p style="color:green">Zaakceptowane: ' + s.zaakceptowane + '</p>' +
        '<p style="color:red">Odrzucone: ' + s.odrzucone + '</p><p style="color:orange">Na weryfikacji: ' + s.naWeryfikacji + '</p>' +
        '<p><b>Suma doplat: ' + fmtEUR(s.sumaDoplat) + '</b></p></div>'
    });
  } catch (er) {}
}

function testEmail() {
  MailApp.sendEmail({ to: CONFIG.ADMIN_EMAIL, subject: '🧪 Test systemu gwarancji KM', body: 'Email testowy dziala prawidlowo.' });
  try { SpreadsheetApp.getUi().alert('✅ Email wyslany na: ' + CONFIG.ADMIN_EMAIL); } catch (e) {}
}

// ── TEST: Diagnostyka maila wewnętrznego ──
function testInternalEmail() {
  var ui = SpreadsheetApp.getUi();
  var log = [];
  
  // 1. Sprawdź arkusz PLANISCI
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheetP = ss.getSheetByName(CONFIG.SHEET_PLANISCI);
  if (!sheetP) {
    ui.alert('BŁĄD: Brak arkusza ' + CONFIG.SHEET_PLANISCI);
    return;
  }
  var dataP = sheetP.getDataRange().getValues();
  log.push('=== PLANISCI (wierszy: ' + dataP.length + ') ===');
  log.push('Nagłówki: ' + dataP[0].join(' | '));
  for (var i = 1; i < dataP.length; i++) {
    log.push('  [' + i + '] Nazwa="' + dataP[i][0] + '" Email="' + dataP[i][1] + '" Aktywny="' + dataP[i][2] + '" Lider="' + (dataP[i][3] || '(BRAK kolumny D!)') + '"');
  }
  
  // 2. Sprawdź arkusz OPIEKUN (lub stary OPIEKUNOWIE)
  var sheetO = ss.getSheetByName(CONFIG.SHEET_OPIEKUN) || ss.getSheetByName(CONFIG.SHEET_OPIEKUNOWIE);
  if (!sheetO) {
    log.push('\nBŁĄD: Brak arkusza OPIEKUN / OPIEKUNOWIE');
  } else {
    var dataO = sheetO.getDataRange().getValues();
    log.push('\n=== OPIEKUN (wierszy: ' + dataO.length + ') ===');
    log.push('Nagłówki: ' + dataO[0].join(' | '));
    for (var j = 1; j < dataO.length; j++) {
      log.push('  [' + j + '] Nazwa="' + dataO[j][0] + '" Email="' + dataO[j][1] + '" Aktywny="' + dataO[j][2] + '"');
    }
  }
  
  // 3. Testuj lookup na pierwszym planiście
  var testPlanista = (dataP.length > 1) ? (dataP[1][0] || '').toString().trim() : '';
  if (testPlanista) {
    var info = getPlannerEmailAndLider(testPlanista);
    log.push('\n=== LOOKUP TEST: "' + testPlanista + '" ===');
    log.push('  email: "' + info.email + '"');
    log.push('  liderEmail: "' + info.liderEmail + '"');
  }
  
  // 4. Quota check
  var remaining = MailApp.getRemainingDailyQuota();
  log.push('\n=== MAIL QUOTA ===');
  log.push('Pozostało maili dzisiaj: ' + remaining);
  
  // 5. Wyślij testowy mail wewnętrzny
  log.push('\n=== PRÓBA WYSŁANIA ===');
  try {
    var testTo = CONFIG.ADMIN_EMAIL;
    log.push('TO: ' + testTo);
    
    MailApp.sendEmail({
      to: testTo,
      subject: 'TEST mail wewnetrzny - diagnostyka',
      body: 'To jest test maila wewnetrznego.\n\nPlanista lookup: ' + testPlanista + ' -> email: ' + (testPlanista ? getPlannerEmailAndLider(testPlanista).email : 'brak') + '\n\nJesli widzisz ten mail, MailApp dziala OK.',
      htmlBody: '<h2>TEST mail wewnetrzny</h2><p>Planista lookup: ' + testPlanista + '</p><p>Email planisty: ' + (testPlanista ? getPlannerEmailAndLider(testPlanista).email : 'brak') + '</p><p>Jesli widzisz ten mail, MailApp dziala OK.</p>'
    });
    log.push('WYSLANO OK!');
  } catch (sendErr) {
    log.push('BŁĄD WYSYŁKI: ' + sendErr.message);
  }
  
  // Pokaż wynik
  var fullLog = log.join('\n');
  Logger.log(fullLog);
  ui.alert('Diagnostyka maila wewnętrznego:\n\n' + fullLog);
}

// ── DIAGNOSTYKA: sprawdź stan arkusza WNIOSEK ──
function debugClaimsSheet() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
    if (!sheet) return { error: 'Brak arkusza WNIOSEK', sheets: ss.getSheets().map(function(s){ return s.getName(); }) };
    var data = sheet.getDataRange().getValues();
    var totalRows = data.length - 1; // minus header
    var sample = [];
    for (var i = 1; i <= Math.min(5, data.length - 1); i++) {
      sample.push({
        row: i + 1,
        colA: (data[i][0] || '').toString().substring(0, 30),
        colB: (data[i][1] || '').toString().substring(0, 30),
        colN: (data[i][13] || '').toString().substring(0, 30)
      });
    }
    return { totalRows: totalRows, sample: sample, sheetName: sheet.getName() };
  } catch(e) {
    return { error: e.message };
  }
}

// ── TEST: zwraca dokładny błąd buildClaimObj dla pierwszego wiersza ──
function debugBuildRow() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
    if (!sheet) return { error: 'Brak arkusza WNIOSEK' };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { error: 'Brak danych (tylko nagłówek)' };
    
    var row = data[1];
    var results = { rowLength: row.length, cells: {} };
    
    // Test każdej kolumny osobno
    var tests = {
      'A(nrZgl)': function() { return (row[0]||'').toString().trim(); },
      'B(przewoznik)': function() { return (row[1]||'').toString().trim(); },
      'D(dataStart)': function() { return row[3] ? fmtDate(row[3]) : ''; },
      'E(godzinaStart)': function() { return fmtTime(row[4]); },
      'F(dataStop)': function() { return row[5] ? fmtDate(row[5]) : ''; },
      'G(godzinaStop)': function() { return fmtTime(row[6]); },
      'N(status)': function() { return (row[13]||'').toString().trim(); },
      'AH(dataZgloszenia)': function() { return (row[33]||'').toString().trim(); },
      'typeD': function() { return typeof row[3] + ' | ' + (row[3] instanceof Date ? 'Date' : 'notDate'); },
      'typeE': function() { return typeof row[4] + ' | ' + (row[4] instanceof Date ? 'Date' : 'notDate'); }
    };
    
    for (var key in tests) {
      try {
        results.cells[key] = tests[key]();
      } catch(e) {
        results.cells[key] = 'ERROR: ' + e.message;
      }
    }
    
    // Spróbuj buildClaimObj
    try {
      var obj = buildClaimObj(data[1], 1);
      results.buildOK = true;
      results.nrZgl = obj.nrZgl;
    } catch(e) {
      results.buildOK = false;
      results.buildError = e.message;
      results.buildStack = e.stack;
    }
    
    return results;
  } catch(e) {
    return { fatalError: e.message };
  }
}


// ── TEST: zwraca surowe dane bez żadnego przetwarzania ──
function getRawClaims() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
    if (!sheet) return { error: 'Brak arkusza WNIOSEK' };
    var data = sheet.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var colA = (data[i][0] || '').toString().trim();
      var colB = (data[i][1] || '').toString().trim();
      var colN = (data[i][13] || '').toString().trim();
      if (!colA && !colB) continue;
      rows.push({ a: colA, b: colB, n: colN, len: data[i].length });
    }
    return { total: rows.length, rows: rows.slice(0, 10) };
  } catch(e) {
    return { error: e.message };
  }
}

// =================================================================
// ═══════════════════════  CZAT PER WNIOSEK  ═══════════════════════
// Feature flag: CONFIG.CHAT_ENABLED
// Arkusz CHAT: A=nrZgl, B=timestamp, C=senderLogin, D=senderName,
//              E=senderRole, F=message, G=notified
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

// Znajdź wiersz wniosku (sprawdzenie uprawnień + pobranie przewoznika)
function _findClaimByNr(nrZgl) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_WNIOSEK);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === nrZgl) {
      return { rowIdx: i + 1, przewoznik: (data[i][1] || '').toString().trim(), planista: (data[i][18] || '').toString().trim() };
    }
  }
  return null;
}

// Weryfikacja dostępu do czatu
function _canAccessChat(caller, claim) {
  if (!caller || !claim) return false;
  if (caller.rola === 'admin' || caller.rola === 'pracownik') return true;
  if (caller.rola === 'przewoznik') {
    var firma = (caller.przewoznik || caller.nazwa || '').toUpperCase();
    return firma === claim.przewoznik.toUpperCase();
  }
  return false;
}

// Wyślij wiadomość czatu
function sendChatMessage(callerLogin, nrZgl, messageText) {
  if (!CONFIG.CHAT_ENABLED) return { ok: false, error: 'Czat wyłączony' };
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { ok: false, error: 'Brak uprawnień' };
    if (!nrZgl || !messageText) return { ok: false, error: 'Brakujące dane' };
    var claim = _findClaimByNr(nrZgl);
    if (!claim) return { ok: false, error: 'Wniosek nie istnieje' };
    if (!_canAccessChat(caller, claim)) return { ok: false, error: 'Brak dostępu do wniosku' };

    var msg = messageText.toString().trim();
    if (!msg) return { ok: false, error: 'Pusta wiadomość' };
    if (msg.length > 1000) msg = msg.substring(0, 1000);

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_CHAT);
    if (!sheet) { ensureChatSheet(ss); sheet = ss.getSheetByName(CONFIG.SHEET_CHAT); }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(3000); } catch(le) {}
    var timestamp = new Date().toISOString();
    var senderName = (caller.nazwa || caller.login || '').toString();
    try {
      sheet.appendRow([nrZgl, timestamp, callerLogin, senderName, caller.rola, msg, '']);
    } finally { try { lock.releaseLock(); } catch(le) {} }

    // Email do drugiej strony — z throttle 5 min
    try {
      _maybeSendChatEmail(sheet, nrZgl, caller, claim, msg, timestamp);
    } catch(me) { Logger.log('chat email ERR: ' + me.message); }

    return { ok: true, timestamp: timestamp };
  } catch(e) {
    Logger.log('sendChatMessage ERR: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Pobierz wiadomości (z filtrem delta po timestamp)
function getChatMessages(callerLogin, nrZgl, sinceTimestamp) {
  if (!CONFIG.CHAT_ENABLED) return { ok: false, messages: [] };
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return { ok: false, messages: [] };
    var claim = _findClaimByNr(nrZgl);
    if (!claim || !_canAccessChat(caller, claim)) return { ok: false, messages: [] };

    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_CHAT);
    if (!sheet) return { ok: true, messages: [] };

    // Lazy cleanup starych wiadomości (>24h) — z szansą 10% żeby nie obciążać
    if (Math.random() < 0.1) _cleanupOldChatMessages(sheet);

    // Filtr 24h
    var cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    var data = sheet.getDataRange().getValues();
    var messages = [];
    for (var i = 1; i < data.length; i++) {
      if ((data[i][0] || '').toString().trim() !== nrZgl) continue;
      var ts = (data[i][1] || '').toString();
      if (ts < cutoff24h) continue; // starsze niż 24h — pomiń
      if (sinceTimestamp && ts <= sinceTimestamp) continue;
      messages.push({
        timestamp: ts,
        senderLogin: (data[i][2] || '').toString(),
        senderName: (data[i][3] || '').toString(),
        senderRole: (data[i][4] || '').toString(),
        message: (data[i][5] || '').toString()
      });
    }
    return { ok: true, messages: messages };
  } catch(e) {
    return { ok: false, messages: [], error: e.message };
  }
}

// Usuń wiadomości starsze niż 24h (lazy cleanup)
function _cleanupOldChatMessages(sheet) {
  try {
    var cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    var data = sheet.getDataRange().getValues();
    var rowsToDelete = [];
    for (var i = 1; i < data.length; i++) {
      var ts = (data[i][1] || '').toString();
      if (ts && ts < cutoff) rowsToDelete.push(i + 1); // numer wiersza 1-based
    }
    // Usuwaj od końca żeby numeracja nie przesuwała się
    for (var j = rowsToDelete.length - 1; j >= 0; j--) {
      sheet.deleteRow(rowsToDelete[j]);
    }
    if (rowsToDelete.length > 0) Logger.log('chat cleanup: usunieto ' + rowsToDelete.length + ' starych wiadomosci');
  } catch(e) { Logger.log('_cleanupOldChatMessages ERR: ' + e.message); }
}

// Batch: policz nieprzeczytane wiadomości dla listy wniosków
// Bierze pod uwagę: tylko wiadomości z ostatnich 24h od drugiej strony z timestamp > sinceMap[nr]
// sinceMap: { nrZgl: lastReadTimestamp } — frontend wysyła zapamiętane timestampy
function getChatUnreadCounts(callerLogin, claimNumbers, sinceMap) {
  if (!CONFIG.CHAT_ENABLED) return {};
  try {
    var caller = validateCaller(callerLogin);
    if (!caller) return {};
    if (!claimNumbers || !claimNumbers.length) return {};
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_CHAT);
    if (!sheet) return {};
    var cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    var data = sheet.getDataRange().getValues();
    var nrSet = {};
    for (var k = 0; k < claimNumbers.length; k++) nrSet[claimNumbers[k]] = true;
    var myRole = caller.rola;
    var myLogin = callerLogin;
    var result = {};
    for (var i = 1; i < data.length; i++) {
      var nr = (data[i][0] || '').toString().trim();
      if (!nrSet[nr]) continue;
      var ts = (data[i][1] || '').toString();
      if (ts < cutoff24h) continue; // starsze niż 24h pomijamy
      var senderLogin = (data[i][2] || '').toString().trim();
      if (senderLogin === myLogin) continue; // nie licz własnych wiadomości
      // Jeśli frontend wysłał sinceMap, licz tylko wiadomości nowsze niż lastRead
      if (sinceMap && sinceMap[nr] && ts <= sinceMap[nr]) continue;
      result[nr] = (result[nr] || 0) + 1;
    }
    return result;
  } catch(e) { return {}; }
}

// Wewnętrzna: wyślij email z throttle
function _maybeSendChatEmail(sheet, nrZgl, sender, claim, msg, timestamp) {
  // Throttle: sprawdź czy w ciągu ostatnich 5 min była już wiadomość od tej samej strony
  var data = sheet.getDataRange().getValues();
  var fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  var recentFromSameSide = 0;
  for (var i = 1; i < data.length - 1; i++) { // -1 żeby pominąć właśnie dodany wiersz
    if ((data[i][0] || '').toString().trim() !== nrZgl) continue;
    var ts = (data[i][1] || '').toString();
    if (ts < fiveMinAgo) continue;
    var role = (data[i][4] || '').toString().trim();
    var notified = (data[i][6] || '').toString().trim();
    if (role === sender.rola && notified === 'YES') recentFromSameSide++;
  }
  if (recentFromSameSide > 0) {
    Logger.log('chat email throttled for ' + nrZgl);
    return;
  }

  // Znajdź adres odbiorcy
  var recipientEmail = '';
  if (sender.rola === 'przewoznik') {
    recipientEmail = CONFIG.WNIOSKI_EMAIL; // pracownicy
  } else {
    recipientEmail = findCarrierEmail(claim.przewoznik);
  }
  if (!recipientEmail) return;

  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl(); } catch(ue) {}

  var htmlBody = buildCarrierEmail({
    headerColor: '#3b82f6',
    title: 'Otrzymałeś nową wiadomość w sprawie wniosku <b>' + escHtml(nrZgl) + '</b>',
    boxBg: '#eff6ff', boxBorder: '#3b82f6',
    rows: [
      { label: 'Wniosek:', value: escHtml(nrZgl), bold: true },
      { label: 'Od:', value: escHtml(sender.nazwa || sender.login) + ' (' + escHtml(sender.rola) + ')' },
      { label: 'Wiadomość:', value: escHtml(msg) }
    ],
    paragraphs: [
      appUrl ? 'Zaloguj się do <a href="' + appUrl + '">MAGGuarantee</a>, aby odpowiedzieć.' : 'Zaloguj się do MAGGuarantee, aby odpowiedzieć.'
    ],
    year: new Date().getFullYear()
  });

  try {
    // Thread: jeden wątek per wniosek+strona (carrier vs internal)
    var side = (sender.rola === 'przewoznik') ? 'internal' : 'carrier';
    _sendThreadedEmail({
      to: recipientEmail,
      subject: 'Wniosek ' + nrZgl + ' — MAGGuarantee',
      htmlBody: htmlBody,
      threadKey: side + '-' + nrZgl,
      name: 'MAGGuarantee'
    });
    // Zaznacz ostatni wiersz jako notified
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 7).setValue('YES');
  } catch(me) { Logger.log('chat email send ERR: ' + me.message); }
}
