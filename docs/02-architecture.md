# 02. Архитектура

## Многоуровневая структура

```
┌─────────────────────────────────────────────────────────────┐
│                  Браузер (клиент)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  index.html (монолит 10 584 строк)                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │    │
│  │  │  CSS 8-  │  │ HTML     │  │ JS (3 <script>   │   │    │
│  │  │  502     │  │ 505-2633 │  │ блока, 352 fn)   │   │    │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │ google.script.run
                           ▼
┌─────────────────────────────────────────────────────────────┐
│             Google Apps Script (V8 runtime)                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  API слой (публичные функции, вызываются с клиента) │    │
│  │   submitNewClaim, updateClaimFull, getMyFleet, …    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Авторизация (валидация caller-а, проверка ролей)   │    │
│  │   validateCaller, requireAdmin, _requireOpiekun, …  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Бизнес-логика                                      │    │
│  │   calcKmGwarantPerMonth, getMonthLimit, getMonthRate│    │
│  │   getEUBanDaysGS, calcEasterGS, getAuthThreshold    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Data Access (прямые вызовы Sheets API)             │    │
│  │   getDataRange, getValues, setValues, appendRow     │    │
│  │   _parseCarrierRow, _parseAutoRow, …                │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Утилиты (форматирование, валидация)                │    │
│  │   fmtEUR, fmtDate, parseTimeGS, _isValidEmail, …    │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Email / уведомления                                │    │
│  │   _sendThreadedEmail, sendInternalDecisionEmail,    │    │
│  │   sendAccountCreatedEmail, buildCarrierEmail        │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
       ┌───────────────────┼───────────────────────┐
       ▼                   ▼                       ▼
┌──────────────┐    ┌──────────────┐      ┌────────────────┐
│ Google       │    │ Google Mail  │      │ Внешние REST   │
│ Sheets       │    │ + Drive      │      │  • VIES        │
│ (18 листов)  │    │              │      │  • Biała Lista │
└──────────────┘    └──────────────┘      │  • info-car.pl │
                                          └────────────────┘
```

## Слои backend (Code.gs)

### 1. API слой (публичный)

Функции, вызываемые из браузера через `google.script.run`. Все они принимают первым параметром `login` или payload-объект и обязаны валидировать caller-а перед действием.

Примеры:
- `getMyFleet(login)` — данные для перевозчика
- `submitNewClaim(login, payload)` — создание заявления
- `updateClaimFull(login, rowNumber, payload)` — верификация
- `getOpiekunFleet(login)` — флота куратора

### 2. Авторизация

| Функция | Что делает |
|---------|-----------|
| `validateCaller(login)` | Ищет login во всех auth-листах, возвращает `{login, rola, nazwa, email, …}` или `null` |
| `requireAdmin(login)` | Бросает, если rola ≠ `admin` |
| `requireEmployee(login)` | Бросает, если rola ∉ {pracownik, admin, opiekun} |
| `_requireOpiekun(login)` | Внутренний shortcut |
| `_requireCarrier(login)` | Внутренний shortcut |
| `_requirePlanista`, `_requireDyspozytor`, `_requireEksport`, `_requireWeryfikator` | Аналогично |
| `requireCarrierOwner(login, rowNumber)` | Проверяет, что заявление действительно принадлежит этому перевозчику |

### 3. Бизнес-логика

Ключевая функция — **`calcKmGwarantPerMonth(start, end, hours)`** (`Code.gs:862`). Алгоритм:

1. Разбивает интервал на месяцы.
2. Для каждого месяца: считает рабочие дни (исключая ЕС-выходные и праздники из `getEUBanDaysGS`).
3. Умножает на месячный лимит км/день из `LIMITY KM` (с fallback на CONFIG).
4. Учитывает дробные дни (если интервал начинается / заканчивается посреди дня).
5. Корректирует на часы простоя/сервиса.
6. Возвращает `{totalDays, kmGwarant, breakdown[], stawka}` с **взвешенной** ставкой EUR/км.

### 4. Data Access

Шаблонные операции:
- `ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)`
- `sheet = ss.getSheetByName(CONFIG.SHEET_X)`
- `data = sheet.getDataRange().getValues()` — читает всё (узкое место для крупных листов)
- `sheet.appendRow(arr)` или `sheet.getRange(row, col, n, m).setValues(arr)`

Для парсинга — функции `_parseXxxRow()`, преобразующие row-массив в объект с осмысленными именами полей.

### 5. Email слой

Все email проходят через **`_sendThreadedEmail({to, cc, subject, htmlBody, threadKey})`** (`Code.gs:5788`). `threadKey` гарантирует, что письма по одному заявлению попадают в один Gmail-тред.

Шаблоны:
- `buildCarrierEmail({nrZgl, decision, claim, color})` — HTML для писем перевозчику с цветным header (по `CONFIG.KOLORY`).
- `sendInternalDecisionEmail()` — внутренние уведомления (planista, opiekun, lider, wnioski@).
- `sendAccountCreatedEmail`, `sendPasswordResetEmail`, `sendAccountDeactivatedEmail`, `sendAccountReactivatedEmail` — стандартные транзакционные письма.

## Frontend (index.html)

Один файл с 3 крупными `<script>`-блоками:

| Блок | Строки | Содержимое |
|------|--------|-----------|
| `<style>` | 8–502 | CSS variables, light/dark theme, компоненты (`.card`, `.modal`, `.btn`, `.tabs`) |
| `<body>` | 505–2633 | 8 экранов + 18 модалов |
| `<script>` #1 | 2634–7186 | login, panels, claims, fleet, render-функции |
| `<script>` #2 | 7187–7245 | мелкие утилиты |
| `<script>` #3 | 7246–10584 | админская часть (employee panel, dashboard, dark mode) |

Все 352 клиентские функции — **в глобальном scope**. Никаких модулей, IIFE, namespaces.

UI-логика построена на:
- Переключение `display:none/block` для секций;
- Inline `onclick="…"` (~300 шт.) вместо `addEventListener`;
- Динамическое построение HTML через `innerHTML` с конкатенацией строк;
- `google.script.run.withSuccessHandler(cb).withFailureHandler(eb).<fn>(args)` для вызовов backend.

## Внешние интеграции — детально

### VIES (`viesLookup`, `Code.gs:2599`)

```
GET https://ec.europa.eu/taxation_customs/vies/rest-api/ms/{country}/vat/{number}
Использование: проверка валидности VAT перевозчика при добавлении.
```

### Biała Lista MF (`whiteListCheckAccount`, `Code.gs:2649`)

```
GET https://wl-api.mf.gov.pl/api/check/nip/{nip}/bank-account/{account}
Использование: проверка, привязан ли IBAN к указанному NIP (комплаенс PL).
```

### Gmail thread (`_sendThreadedEmail`, `Code.gs:5788`)

Использует свойство Gmail: письма с одинаковым `subject` от одних участников склеиваются в тред. Отсюда параметр `threadKey` (фактически — суффикс subject).

## Хранилище

### Постоянное

Всё в одном Google Sheets (ID в `CONFIG.SPREADSHEET_ID`). 18 листов, см. [04-data-model.md](04-data-model.md).

### Временное

- **CacheService** — login-коды 2FA (TTL 600с), счётчики неудачных попыток.
- **LockService** — защита критических секций (добавление wniosek, генерация nrZgl, добавление авто).

### Сессии

❌ **Сессии не хранятся.** После `verifyLoginCode` фронт получает user-объект и хранит его в памяти JS. При перезагрузке страницы — повторный логин. Cookie / localStorage не используются.

## Триггеры (cron-style)

| Триггер | Функция | Частота |
|---------|---------|---------|
| `sendDailyReminders` | `Code.gs:6987` | ежедневно |
| `sendWeeklyReport` | `Code.gs:7056` | еженедельно |
| `onEdit` | `Code.gs:6977` | при редактировании листа |
| `onOpen` | `Code.gs:6950` | при открытии Spreadsheet |

Создаются вручную через `setupTriggers()` (`Code.gs:6963`).
