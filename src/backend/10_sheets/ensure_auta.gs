// =================================================================
// Sheet: AUTA (pojazdy/ciągniki per przewoźnik)
// =================================================================

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
