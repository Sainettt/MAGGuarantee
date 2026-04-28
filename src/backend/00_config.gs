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
  SHEET_AUDIT_LOG:   'AUDIT_LOG',       // log akcji destrukcyjnych + zmian wrażliwych
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
