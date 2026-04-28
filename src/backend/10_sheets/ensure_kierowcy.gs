// =================================================================
// Sheet: KIEROWCY (baza kierowców per przewoźnik)
// =================================================================

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
