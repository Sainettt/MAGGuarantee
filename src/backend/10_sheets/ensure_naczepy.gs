// =================================================================
// Sheet: NACZEPY (rejestr konkretnych naczep per przewoźnik)
// =================================================================

// ── UTWÓRZ ARKUSZ NACZEPY ──
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
