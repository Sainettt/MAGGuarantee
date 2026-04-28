// =================================================================
// Sheet: PLANISCI (planiści/spedytorzy — login + panel)
// =================================================================

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
