# 04. Структура данных (Google Sheets)

Все данные хранятся в одном Google Spreadsheet (`CONFIG.SPREADSHEET_ID`). 18 листов, описаны ниже.

## Карта связей

```
                    ┌─────────────┐
                    │   ADMIN     │
                    │  PRACOWNIK  │   (пользователи MagTrans)
                    │   OPIEKUN   │
                    │  PLANISCI   │
                    │ DYSPOZYTOR  │
                    │   EKSPORT   │
                    │ WERYFIKATOR │
                    └─────────────┘
                          │
                          │ Login
                          ▼
                    ┌─────────────┐
                    │ UZYTKOWNICY │ ◄────────── OpiekunLogin
                    │ (przewoznik)│
                    └─────────────┘
                          │
              Login ──────┼─────────────────────┐
                          │                     │
              ┌───────────┴───────────┐         │
              ▼                       ▼         ▼
        ┌──────────┐            ┌──────────┐ ┌──────────┐
        │   AUTA   │            │ KIEROWCY │ │ NACZEPY  │
        └──────────┘            └──────────┘ └──────────┘
              │ NrRej                 │ Login    │ NrRej
              │                       │          │
              └─────────┬─────────────┴──────────┘
                        ▼
                  ┌───────────┐
                  │ DELEGACJE │
                  └───────────┘
              
              ┌──────────┐         ┌──────────────┐
              │ WNIOSEK  │ ──────► │ AUTA (NrRej) │
              │          │         │ UZYTKOWNICY  │
              └──────────┘         └──────────────┘
              
              ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────┐
              │ AUDIT_LOG  │ │ LIMITY KM    │ │   CHAT   │ │ NACZEPY_TYPY │
              │  (универс) │ │ (год×месяц)  │ │ (на nrZgl)│ │ (справочник) │
              └────────────┘ └──────────────┘ └──────────┘ └──────────────┘
```

## Листы

### 1. WNIOSEK — заявления (50 колонок A–AX)

| Col | Поле | Описание |
|-----|------|----------|
| A | NrZgl | `GWA/NNN/MM/RR`, уникальный |
| B | Przewoznik | nazwa перевозчика |
| C | Pojazd | NrRej авто |
| D | DataStart | начало периода |
| E | DataStop | конец периода |
| F | GodzinaOd | время начала |
| G | GodzinaDo | время конца |
| H | DniJezdne | количество дней |
| I | Przebieg | фактический км |
| J | KmNaD | км на день |
| K | KmGwarant | гарантированный км (рассчитанный) |
| L | Roznica | KmGwarant − Przebieg |
| M | Doplata | EUR компенсации |
| N | Status | NA WERYFIKACJI / ZAAKCEPTOWANO / ODRZUCONO / … |
| O | Komentarz | текст |
| P | NrZlecenia | номер задания |
| Q | DataZlecenia | дата задания |
| R–X | (зарезервированы) | |
| Y | Opiekun | имя куратора |
| Z–AD | (зарезервированы) | |
| AE | Autoryzacja | флаг авторизации крупной суммы |
| AF | OpisAutoryzacji | |
| AG | TokenAutoryzacji | |
| AH | DataAutoryzacji | |
| AI | DataZmianyStatusu | |
| AJ | KwotaWnioskowana | EUR, заявленная сумма |
| AK | ReklamacjaZlozona | флаг рекламации |
| AL | ReklamacjaTresc | текст рекламации |
| AM | OdpMagtrans | ответ MagTrans |
| AN | KwotaReklamacji | |
| AO | ZatwKwota | утверждённая сумма |
| AP | KorektaGodzin | флаг корректировки часов |
| AQ | StatusPrzedReklamacja | предыдущий статус (для отката) |
| AR | OrigData | оригинальные даты (до рекламации) |
| AS | OrigGodzina | |
| AT | OrigPrzebieg | |
| AU–AV | (резерв) | |
| AW | Marża | внутренняя маржа |
| AX | KwotaMaksima | |

**Цветовое выделение строки** по `Status` через `CONFIG.KOLORY` (HEX).

### 2. UZYTKOWNICY — перевозчики (22 колонки A–V)

См. подробное описание в [03-roles.md](03-roles.md#przewoznik).

### 3. ADMIN, PRACOWNIK, OPIEKUN, DYSPOZYTOR, EKSPORT, WERYFIKATOR (6 колонок каждый)

| Col | Поле |
|-----|------|
| A | Login |
| B | Hasło |
| C | Rola |
| D | Nazwa |
| E | Email |
| F | Firma |

### 4. PLANISCI (7 колонок)

Дополнительная колонка **Lider** (email лидера группы) и **Aktywny**.

### 5. OPIEKUNOWIE (legacy, 3 колонки)

`Imię i nazwisko`, `Email`, `Aktywny`. Используется для рассылки decision-уведомлений. ⚠️ Дублирует `OPIEKUN` — см. [08-issues-and-solutions.md](08-issues-and-solutions.md#13-два-листа-opiekun-и-opiekunowie).

### 6. AUTA — автомобили (36 колонок A–AJ)

| Col | Поле | Тип |
|-----|------|-----|
| A | LoginPrzewoznika | string (FK → UZYTKOWNICY) |
| B | NrRej | string (PK составной с A) |
| C | Aktywne | Tak/Nie |
| D | DataDodania | datetime |
| E | DataDezaktywacji | datetime |
| F | UtworzonePrzez | login |
| G | Planista | имя планисты (FK → PLANISCI) |
| H | Wyposazenie | (legacy) |
| I | Marka | string |
| J | Model | string |
| K | Rok | number |
| L | Uwagi | string |
| M | CertyfikatL | L1/L2/L3 |
| N | EURO | III/IV/V/VI |
| O | ADR | CSV классов |
| P | GPS | Tak/Nie |
| Q | KartaPaliwowa | Tak/Nie |
| R | Typ | MEGA/STD/COIL |
| S | Dyspozytor | login (FK → DYSPOZYTOR) |
| T | GB | Tak/Nie (право работы) |
| U | IT | |
| V | FR | |
| W | Porozumienie | |
| X | Umowa | Tak/Nie |
| Y | StawkaDE | EUR/км |
| Z | StawkaUE | |
| AA | StawkaEksport | |
| AB | StawkaImport | |
| AC | Odpady | Tak/Nie |
| AD | OdpadyKraje | CSV кодов стран |
| AE | KabotazDE | Tak/Nie |
| AF | KabotazFR | |
| AG | GPSMobNr | телефон |
| AH | NastepnyPrzeglad | date |
| AI | NrBoczny | string |
| AJ | OstatnioJezdzilo | date (auto-update от delegacji) |

### 7. KIEROWCY — водители (13 колонок A–M)

| Col | Поле |
|-----|------|
| A | Login (PK, генерится автоматом) |
| B | Imie |
| C | Nazwisko |
| D | PrzewoznikLogin (FK → UZYTKOWNICY) |
| E | Telefon |
| F | Email |
| G | NrPrawaJazdy |
| H | Aktywny |
| I | DataDodania |
| J | PrawoJazdyWaznosc |
| K | Telefon2 |
| L | Konto |
| M | Uwagi |

### 8. NACZEPY — прицепы (24 колонки A–X)

| Col | Поле |
|-----|------|
| A | NrRej (PK) |
| B | PrzewoznikLogin |
| C | TypNaczepy (FK → NACZEPY_TYPY) |
| D | Marka |
| E | Model |
| F | Rok |
| G | Aktywna |
| H | DataDodania |
| I | Wyposazenie |
| J | NastepnyPrzeglad |
| K | Pasy |
| L | Maty |
| M | DlugoscWewn |
| N | SzerokoscWewn |
| O | WysokoscWewn |
| P | Pojemnosc |
| Q | Wyprez |
| R | LadowanieTyl |
| S | LadowanieBok |
| T | LadowanieGora |
| U | PrzesuwnyDach |
| V | PrzesuwnyDachEdscha |
| W | Uwagi |
| X | (резерв) |

### 9. NACZEPY_TYPY — справочник типов прицепов (4 колонки)

| Col | Поле |
|-----|------|
| A | Nazwa | (Firanka, Plandeka, Chłodnia, …) |
| B | Skrot |
| C | Opis |
| D | Aktywna |

Предзаполненные 14 типов: Firanka, Plandeka, Chłodnia, Wywrotka, Mega, Jumbo, Frigo, Niska, Burtowa, Kontener, Cysterna, HDS, Walking Floor.

### 10. DELEGACJE — выезды (20 колонок A–T)

| Col | Поле |
|-----|------|
| A | Id (генерится) |
| B | NrRej (FK → AUTA) |
| C | NaczepaNrRej (FK → NACZEPY) |
| D | KierowcaLogin (FK → KIEROWCY) |
| E | KierowcaImieNazwisko |
| F | KierowcaTelefon |
| G | DataWyjazdu |
| H | KrajWyjazdu |
| I | KodPocztowyWyjazdu |
| J | DataZjazduPlan |
| K | KrajZjazdu |
| L | KodPocztowyZjazdu |
| M | Status (zgloszony/w_trasie/zjechal/anulowany) |
| N | DataZjazduRzeczywista |
| O | ZgloszonePrzez (login) |
| P | DataZgloszenia |
| Q | ZweryfikowanePrzez (login) |
| R | DataWeryfikacji |
| S | PrzewoznikLogin |
| T | Uwagi |

### 11. LIMITY KM — лимиты на месяц (25 колонок)

Каждая строка — один год. Колонки парами: `<Месяц> km`, `<Месяц> €`.

| Col | Поле |
|-----|------|
| A | Rok | 2026 |
| B | Sty km |
| C | Sty € |
| D | Lut km |
| E | Lut € |
| … | … |
| X | Gru km |
| Y | Gru € |

Если ячейка пустая — fallback на `CONFIG.KM_DZIENNIE` (540) и `CONFIG.STAWKA_EUR_ZA_KM` (0.5).

### 12. AUDIT_LOG (9 колонок)

| Col | Поле |
|-----|------|
| A | Data |
| B | User |
| C | UserRola |
| D | Akcja |
| E | Target (тип объекта + ключ) |
| F | Przed (JSON) |
| G | Po (JSON) |
| H | Powód |
| I | Metadata (JSON) |

Записывается через `_writeAuditLog()` (`Code.gs:503`). Доп. эффект — отправка email админу при критических действиях.

### 13. CHAT (если включён)

Сообщения по заявлениям. Точная структура зависит от инициализации в `ensureChatSheet` (`Code.gs:7247`). Содержит `NrZgl`, `User`, `Timestamp`, `Message`, `IsRead`.

### 14. GWARANCJA (legacy)

История заявлений — упоминается в коде, но новые операции пишут только в `WNIOSEK`. Похоже на legacy с миграции.

## Ключевые инварианты

| Инвариант | Где проверяется |
|-----------|-----------------|
| `NrRej` уникален в рамках одного перевозчика | `addVehicle` (lock + проверка) |
| `NrZgl` уникален глобально | `submitNewClaim` (lock + генерация) |
| Login водителя уникален в KIEROWCY | `_generateDriverLogin` (суффиксы -2, -3) |
| `OpiekunLogin` ссылается на существующий `OPIEKUN.Login` | ⚠️ FK не проверяется |
| Статус `WNIOSEK` всегда из enum | ⚠️ Нет валидации (можно записать что угодно) |
| `DELEGACJE.Status` из `CONFIG.STATUSY_DELEGACJI` | проверяется в mark-функциях |

## Проблемы модели данных

См. [08-issues-and-solutions.md](08-issues-and-solutions.md), но основное:

1. **Нет реляционной целостности** — Google Sheets не FK-aware. Удаление перевозчика не каскадирует на DELEGACJE/WNIOSEK.
2. **Магические индексы колонок** — код полон `row[0]`, `row[18]`. Добавление колонки в середину сломает всё.
3. **Денормализация** — `Przewoznik` в WNIOSEK хранится как nazwa, не login. При переименовании перевозчика — рассинхрон.
4. **Listов «расширений»** — `ensureUsersColumnsExtended`, `ensureAutaColumnsExtended` и др. пристраивают колонки задним числом. История эволюции прибита гвоздями.
5. **Plaintext пароли** в листах ADMIN/PRACOWNIK/UZYTKOWNICY/etc.
