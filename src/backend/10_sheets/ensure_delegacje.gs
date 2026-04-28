// =================================================================
// Sheet: DELEGACJE (wyjazdy/delegacje zgłaszane przez przewoźników)
// =================================================================

// ── UTWÓRZ ARKUSZ DELEGACJE ──
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
