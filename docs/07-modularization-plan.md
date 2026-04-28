# 07. План разбиения проекта на модули

Текущее состояние:

- `Code.gs` — 7 482 строки, ~150 функций.
- `index.html` — 10 584 строки, 352 функции, CSS+HTML+JS вместе.

Это монолит. Цель — разделить на ~25–30 файлов так, чтобы:
- Каждый файл < 600 строк.
- Каждый файл отвечал за одну предметную область (SRP).
- Дублирование сократилось как минимум в 2 раза.
- Можно было находить нужное место за секунды.

## Ограничения Google Apps Script

GAS не имеет привычных модулей `import/export`. Но:

1. **Файлы `.gs` объединяются в один глобальный namespace** при выполнении — можно разбивать на любое количество файлов, и все функции видны друг другу.
2. **HTML-файлы можно подключать через `HtmlService`-include**:
   ```javascript
   HtmlService.createTemplateFromFile('index')
   ```
   а в HTML:
   ```html
   <?!= include('css/main') ?>
   <?!= include('js/login') ?>
   ```
   с хелпером:
   ```javascript
   function include(filename) {
     return HtmlService.createHtmlOutputFromFile(filename).getContent();
   }
   ```
3. **`clasp`** позволяет работать с проектом как с обычным git-репо — каждый `.gs` файл = отдельный файл на диске.

## Предлагаемая структура backend

```
src/
├── 00_config.gs                 ─── глобальный CONFIG, константы
├── 00_lock_cache.gs             ─── обёртки LockService, CacheService
├── 01_doget.gs                  ─── doGet, onOpen, setupTriggers
│
├── 10_sheets/
│   ├── ensure_users.gs          ─── ensureUsersSheet, columns_extended
│   ├── ensure_auta.gs
│   ├── ensure_kierowcy.gs
│   ├── ensure_naczepy.gs
│   ├── ensure_naczepy_typy.gs
│   ├── ensure_delegacje.gs
│   ├── ensure_audit_log.gs
│   ├── ensure_planisci.gs
│   ├── ensure_dyspozytor.gs
│   ├── ensure_eksport.gs
│   ├── ensure_weryfikator.gs
│   ├── ensure_opiekunowie.gs
│   ├── ensure_limity.gs
│   ├── ensure_chat.gs
│   └── _sheet_utils.gs          ─── общие хелперы (header, ensureColumn)
│
├── 20_auth/
│   ├── auth_login_code.gs       ─── sendLoginCode, verifyLoginCode, resendLoginCode
│   ├── auth_validate.gs         ─── validateCaller, requireXxx (все требования)
│   ├── auth_password.gs         ─── _generateRandomPassword, (будущий) hash
│   └── auth_validators.gs       ─── _isValidEmail, _isValidLogin, _isValidVehicleNr
│
├── 30_repositories/             ─── data access (CRUD по сущности)
│   ├── carriers_repo.gs         ─── _parseCarrierRow, getCarrier, listCarriers
│   ├── vehicles_repo.gs         ─── _parseAutoRow, getVehicle, listVehicles
│   ├── drivers_repo.gs
│   ├── trailers_repo.gs
│   ├── claims_repo.gs           ─── buildClaimObj, listClaims, getClaim
│   ├── delegations_repo.gs
│   ├── naczepy_typy_repo.gs
│   └── audit_repo.gs            ─── _writeAuditLog
│
├── 40_services/                 ─── бизнес-логика
│   ├── km_calc.gs               ─── calcKmGwarantPerMonth, getMonthLimit, getMonthRate
│   ├── km_calendar.gs           ─── calcEasterGS, getEUBanDaysGS
│   ├── claim_workflow.gs        ─── submitNewClaim, updateClaimFull, submitReklamacja
│   ├── delegation_workflow.gs   ─── addDelegacja, markInTransit, markReturned
│   ├── carrier_workflow.gs      ─── addCarrier, updateCarrier, ...
│   ├── vehicle_workflow.gs
│   ├── driver_workflow.gs
│   ├── trailer_workflow.gs
│   └── auth_threshold.gs        ─── getAuthThreshold, sendAuthorizationRequest
│
├── 50_api/                      ─── публичные google.script.run эндпоинты
│   ├── api_admin.gs             ─── функции admin/pracownik
│   ├── api_opiekun.gs           ─── *ByOpiekun (тонкие обёртки over services + audit)
│   ├── api_carrier.gs           ─── getMyFleet, submitNewClaim, ...
│   ├── api_planista.gs
│   ├── api_dyspozytor.gs
│   ├── api_eksport.gs
│   └── api_weryfikator.gs
│
├── 60_email/
│   ├── email_sender.gs          ─── _sendThreadedEmail
│   ├── email_templates.gs       ─── buildCarrierEmail, escHtml, fmtEUR
│   ├── email_account.gs         ─── sendAccountCreatedEmail, ...
│   ├── email_decisions.gs       ─── sendInternalDecisionEmail
│   └── email_triggers.gs        ─── sendDailyReminders, sendWeeklyReport
│
├── 70_integrations/
│   ├── ext_vies.gs              ─── viesLookup
│   ├── ext_white_list.gs        ─── whiteListCheckAccount
│   └── ext_inspection.gs        ─── inspectionCheckLink
│
├── 80_chat/
│   ├── chat_api.gs              ─── sendChatMessage, getChatMessages
│   └── chat_utils.gs
│
├── 90_utils/
│   ├── format.gs                ─── fmtEUR, fmtDate, fmtDateTime, fmtTime
│   ├── parse.gs                 ─── parseDatePL, parseTimeGS
│   ├── safe.gs                  ─── safeStr, safeVal, safeFmtDate
│   └── columns.gs               ─── именованные индексы COLS_AUTA, COLS_WNIOSEK
│
└── 99_diagnostics.gs            ─── debug*, diagnostykaMaili, getDashboardStats
```

### Принципы разделения backend

1. **Repositories** работают только с одним листом, парсят/собирают строку. **Не вызывают** email, audit, другие репо.
2. **Services** содержат бизнес-логику и могут использовать несколько репо + utils. Не знают про google.script.run.
3. **API-слой** — тонкие обёртки. Делают: `validateCaller()` → `requireXxx()` → `service.action()` → `audit_repo.write()`. **Никакой бизнес-логики**.
4. **Utils** — без побочных эффектов, чистые функции.
5. **Email** изолирован: нигде, кроме email/, нет MailApp.
6. **Integrations** изолированы: нигде, кроме integrations/, нет UrlFetchApp.

### Именованные индексы колонок

Создать `90_utils/columns.gs`:

```javascript
const COLS_AUTA = Object.freeze({
  LOGIN_PRZEWOZNIKA: 0,
  NR_REJ: 1,
  AKTYWNE: 2,
  DATA_DODANIA: 3,
  // ...
  OSTATNIO_JEZDZILO: 35
});

const COLS_WNIOSEK = Object.freeze({
  NR_ZGL: 0,
  PRZEWOZNIK: 1,
  POJAZD: 2,
  // ...
});
```

Везде заменить `row[18]` → `row[COLS_AUTA.DYSPOZYTOR]`. Это **единственное безопасное** изменение, которое можно делать без риска. Дальше любые добавления колонок — правка только в одном месте.

## Предлагаемая структура frontend

```
ui/
├── index.html                   ─── только <head> + body shell с include
│
├── css/
│   ├── main.html                ─── базовые стили, переменные, layout
│   ├── theme_light.html         ─── light variables
│   ├── theme_dark.html          ─── dark variables (без !important hacks)
│   ├── components.html          ─── .card, .btn, .modal, .tabs
│   └── screens.html             ─── специфика по экранам
│
├── partials/                    ─── HTML-шаблоны экранов
│   ├── login.html
│   ├── screen_carrier.html
│   ├── screen_planista.html
│   ├── screen_dyspozytor.html
│   ├── screen_eksport.html
│   ├── screen_weryfikator.html
│   ├── screen_employee.html
│   ├── screen_coming_soon.html
│   ├── modal_status.html
│   ├── modal_vehicle_details.html
│   ├── modal_carrier_crud.html
│   ├── modal_reklamacja.html
│   └── _filters_table.html      ─── переиспользуемый блок: search + filter + table
│
├── js/
│   ├── _state.html              ─── currentUser, кеши (модуль через IIFE)
│   ├── _api.html                ─── обёртки google.script.run с retry/error UI
│   ├── _ui.html                 ─── показать/скрыть screens, modal helpers
│   ├── _format.html             ─── escHtml, fmtEUR, fmtDate (зеркало backend)
│   ├── _validate.html           ─── validateDate/Time/Km
│   │
│   ├── login.html               ─── doLogin, verifyCode, resendCode
│   ├── carrier_panel.html       ─── show, switchCarrierTab, loadCarrierClaims
│   ├── carrier_new_claim.html   ─── form + carrierPreviewCalc + submit
│   ├── carrier_fleet.html       ─── рендер своего автопарка
│   ├── carrier_delegacje.html
│   │
│   ├── planista_panel.html
│   ├── dyspozytor_panel.html
│   ├── eksport_panel.html
│   ├── weryfikator_panel.html
│   │
│   ├── employee_panel.html
│   ├── employee_dashboard.html  ─── KPI, графики, диаграммы
│   ├── employee_claims.html     ─── список + statusModal + decision
│   ├── employee_carriers.html
│   ├── employee_vehicles.html
│   ├── employee_drivers.html
│   ├── employee_trailers.html
│   ├── employee_opieka.html     ─── только для opiekun
│   │
│   └── km_calc_client.html      ─── зеркало backend для preview
│
└── i18n/
    └── strings_pl.html          ─── { LOGIN_TITLE: 'Zaloguj się…', ... }
```

### Принципы разделения frontend

1. **Один экран = один HTML + один JS файл.**
2. **Шаблон-фрагменты** для повторяющихся блоков (поиск + фильтр + таблица — 5 копий → 1 шаблон).
3. **CSS отделён от HTML.** Все inline `style=` (1 375 шт.) переходят в utility-классы (`.p-2`, `.mt-1`, `.text-navy`) или семантические (`.btn-primary`).
4. **`onclick=` → `addEventListener`.** Один файл инициализации делает делегирование.
5. **Модули через IIFE**:
   ```javascript
   const App = (function() {
     const state = { currentUser: null };
     function login(...) { ... }
     return { login, getCurrentUser: () => state.currentUser };
   })();
   ```
   Все 352 функции уходят из global scope в `App.*` неймспейсы (`App.Login`, `App.Carrier`, `App.Employee`, …).
6. **`escHtml` обязательна для всего, что попадает в `innerHTML`.** Чтобы это гарантировать — обёртка `setHtml(el, ...parts)`, которая принимает строки и автоматически escape-ит.
7. **i18n** — все строки UI в одном объекте. На будущее (мультиязычность). Прямо сейчас экономит усилия: меняешь `'Wniosek wysłany!'` в одном месте, не в 5.

## Этапы миграции

Полный рефакторинг займёт несколько недель. Не делать всё сразу — сломаешь систему. Разбить на изолированные шаги.

### Этап 1. Безопасные подготовительные работы (1–2 дня)
- Установить `clasp`, выгрузить проект как git-репо.
- Создать backup spreadsheet (копия всех листов).
- Добавить именованные константы колонок (`COLS_AUTA`, `COLS_WNIOSEK`, …) — заменить `row[N]` постепенно.
- Унифицировать формат ответов: завести хелпер `ok(data) / err(msg, code)`. Применять только в новых функциях, старые править по мере касания.
- **Никаких функциональных изменений.** Только переименование и константы.

### Этап 2. Выделение utils и repositories (3–5 дней)
- Перенести `fmt*`, `parse*`, `safe*`, `escHtml`, валидаторы в отдельные файлы.
- Завести `*_repo.gs` для каждой сущности — функции get/list/parse/serialize. Все остальные функции **не трогать**, но переписать так, чтобы они **вызывали** repo, а не работали с Sheets напрямую.
- Это можно делать постепенно по одной сущности.

### Этап 3. Выделение services (5–7 дней)
- Из длинных функций (`updateClaimFull`, `submitNewClaim`) выделить в services чистую логику. API-функции остаются обёртками.
- Параллельно: добавить unit-тесты для `calcKmGwarantPerMonth`, `getMonthLimit` и др. (через GAS Test Framework или отдельный test-doc).

### Этап 4. Дублирование операций по ролям (3–5 дней)
- Сейчас `addCarrier` и `addCarrierByOpiekun` — копипаст. Создать `_addCarrierImpl` в service, обёртки только проверяют права + audit.
- То же для авто, водителей, прицепов.
- Аналогично для `removeMyDriver` / `removeDriver`.

### Этап 5. Frontend partials (5–7 дней)
- Включить `HtmlService` partials: вынести каждый экран в отдельный HTML-файл.
- Вынести CSS в отдельный файл.
- Сначала разбиваем по разделам, не трогая JS.

### Этап 6. Frontend JS-модули (7–10 дней)
- Завернуть в IIFE / namespace `App`.
- Перевести inline `onclick` в `addEventListener` (по экрану за раз).
- Удалить hacks dark mode (заменить на CSS classes без `!important`).

### Этап 7. Безопасность (3–5 дней)
- Хеширование паролей (см. [08-issues-and-solutions.md](08-issues-and-solutions.md#1-хранение-паролей-в-plaintext)).
- XSS-санитизация всех `innerHTML`.
- Защита от formula injection.
- Rate limiting.

### Этап 8. Тесты и документация (постоянно)
- JSDoc на все публичные функции.
- Юнит-тесты на расчёты.
- Smoke-тесты на каждую роль.

## Что **не** делать

- ❌ Переписывать всё с нуля. Вы потеряете тонкие edge-cases (рекламации, корректировки часов, ЕС-праздники).
- ❌ Менять структуру Google Sheets без миграционного скрипта и backup.
- ❌ Внедрять фронтенд-фреймворк (React/Vue) — выгода не покрывает риск. Native + IIFE достаточно.
- ❌ Делать всё в одном PR. Каждый этап — отдельный мердж + ручная проверка.

## Метрики успеха рефакторинга

| Метрика | Сейчас | Цель |
|---------|--------|------|
| Самый длинный файл (.gs) | 7 482 | < 600 |
| Самая длинная функция | 462 (updateClaimFull) | < 80 |
| Inline `style=` | 1 375 | < 100 |
| Inline `onclick=` | ~300 | 0 |
| Дублирующиеся CRUD-функции (carrier vs ByOpiekun) | ~30 | 0 |
| Magic column indices `row[N]` | везде | 0 |
| Покрытие тестами | 0% | > 30% (расчёты) |
| Время найти функцию по имени | 30+с | <5с |
