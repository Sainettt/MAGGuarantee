// =================================================================
// Entry points: doGet (web app), onOpen (sheet menu), setupTriggers, onEditTrigger
// =================================================================

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
