// =================================================================
// Sheet: NACZEPY_TYPY (słownik typów naczep)
// =================================================================

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
