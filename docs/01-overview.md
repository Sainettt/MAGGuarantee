# 01. Обзор проекта

## Назначение

**MagTrans** — внутренняя система управления **гарантией километража** для логистической компании MagTrans. Перевозчики (subcontractors) подают заявления (wnioski) на компенсацию, когда автомобиль за период проехал меньше гарантированного количества километров. Система рассчитывает доплату в EUR на основе:

- дневного лимита километров (по месяцам года),
- ставки EUR/км (тоже помесячно),
- учёта выходных и праздничных дней ЕС,
- корректировки на простой / сервис.

Помимо ядра «гарантия», система включает:

- **CRUD автопарка** — автомобили, прицепы, водители каждого перевозчика;
- **модуль делегаций (выездов)** — учёт фактических рейсов (status: `zgloszony` → `w_trasie` → `zjechal`);
- **рекламации** — частичный пересмотр уже принятого решения;
- **email-нотификации** через Gmail (тред-сообщения с одинаковым subject);
- **аудит-лог** всех критических операций;
- **внутренний чат** на каждое заявление (Phase 2);
- **двухфакторную авторизацию** через 6-значный код по email.

## Технологический стек

- **Google Apps Script (V8 runtime)** — серверный код в `Code.gs`
- **HtmlService** — рендер монолитного `index.html`
- **Google Sheets** — хранилище данных (~18 листов)
- **Google Mail (MailApp / GmailApp)** — рассылка
- **Google Drive** — приём скриншотов авторизации
- **CacheService** — хранение login-кодов 2FA
- **LockService** — защита от race conditions
- **Внешние REST API**:
  - VIES (проверка VAT/NIP в ЕС)
  - Biała Lista MF (проверка связи NIP↔IBAN, Польша)
  - info-car.pl (генерация ссылки на проверку техосмотра)

## Ключевые бизнес-процессы

### 1. Подача заявления (wniosek)

```
Перевозчик → форма → submitNewClaim() → расчёт km гарантии
                                     → запись в WNIOSEK
                                     → email админу
                                     → email перевозчику (подтверждение)
                                     → email внутр. сотрудникам (planista, opiekun)
                                     → статус: NA WERYFIKACJI
```

### 2. Верификация заявления

```
Работник → openStatusModal() → корректирует данные
                            → updateClaimFull() (re-calc + decision)
                            → email перевозчику (HTML с цветным header)
                            → email внутр. сотрудникам
                            → статус: ZAAKCEPTOWANO / ODRZUCONO
```

### 3. Делегация (выезд)

```
Перевозчик → addDelegacja(auto, kierowca, naczepa, маршрут)
          → status: zgloszony
          
Верификатор → markDelegacjaInTransit()  → status: w_trasie
            → markDelegacjaReturned()    → status: zjechal
                                         → AUTA.OstatnioJezdzilo обновляется
```

### 4. Авторизация (логин)

```
1) Перевозчик вводит login + password → sendLoginCode()
   - проверяется в одной из таблиц (ADMIN, PRACOWNIK, UZYTKOWNICY, ...)
   - генерируется 6-значный код, кладётся в CacheService на 600с
   - отправляется email с кодом
2) Перевозчик вводит код → verifyLoginCode()
   - 5 неверных попыток → блокировка на 5 минут
   - валидный → возвращается user object {login, rola, nazwa, email, auta, ...}
   - LastLogin обновляется
3) Frontend сохраняет user в памяти (не в localStorage) и показывает соответствующий экран
```

## Конфигурация (CONFIG)

Глобальный объект на строках `Code.gs:6–95`. Содержит:

- `SPREADSHEET_ID` — ID Google Sheets с данными;
- имена всех листов (`SHEET_WNIOSEK`, `SHEET_AUTA`, …);
- email-адреса админа и `wnioski@`;
- бизнес-параметры по умолчанию: `STAWKA_EUR_ZA_KM = 0.5`, `KM_DZIENNIE = 540`;
- enum-справочники: `CERTYFIKAT_L_VALUES`, `EURO_VALUES`, `TYPY_AUT`, `STATUSY_DELEGACJI`, `ADR_KLASY`, `ODPADY_KRAJE`, `KOLORY` (HEX по статусам).

## Точки входа

| Точка | Файл:строка | Назначение |
|-------|-------------|-----------|
| `doGet(e)` | `Code.gs:100` | HTTP GET → отдаёт `index.html` |
| `onOpen()` | `Code.gs:6950` | Меню в Google Sheets |
| `setupTriggers()` | `Code.gs:6963` | Time-based триггеры для daily/weekly emails |
| `google.script.run.<func>()` | вся клиентская часть | Вызов backend из браузера |

## Объём проекта

| Метрика | Значение |
|---------|----------|
| Backend (Code.gs) | 7 482 строки, ~150 функций |
| Frontend (index.html) | 10 584 строки, 352 функции |
| Listов Google Sheets | 18 |
| Ролей пользователей | 8 |
| Экранов в UI | 8 (login, carrier, planista, dyspozytor, eksport, weryfikator, comingSoon, employee) |
| Модальных окон | 18+ |
| Inline style= атрибутов | 1 375 |
| Event handlers (onclick/onchange) | 300+ |
