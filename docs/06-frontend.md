# 06. Frontend (index.html)

Один монолитный файл на 10 584 строки. CSS, HTML и JS — всё внутри.

## Состав файла

| Секция | Строки | % | Содержимое |
|--------|--------|---|------------|
| `<head>` (meta, title, fonts) | 1–7 | <1% | Google Fonts: DM Sans |
| `<style>` | 8–502 | 4.7% | CSS variables, темы, компоненты |
| `<body>` (HTML экраны и модалы) | 505–2633 | 20% | 8 экранов + 18 модалов |
| `<script>` #1 | 2634–7186 | 43% | Login, panels, claims, fleet, render |
| `<script>` #2 | 7187–7245 | <1% | Утилиты |
| `<script>` #3 | 7246–10584 | 32% | Employee panel, dashboard, dark mode |

## Экраны

UI устроен через переключение `display:none/block` на корневых div-ах.

| ID | Строки HTML | Роль |
|----|-------------|------|
| `#loginScreen` | 508–559 | Все (логин + 2FA код) |
| `#carrierScreen` | 562–1035 | przewoznik |
| `#planistaScreen` | 1037–1121 | planista |
| `#dyspozytorScreen` | 1124–1194 | dyspozytor |
| `#eksportScreen` | 1195–1220 | eksport |
| `#weryfikatorScreen` | 1223–1248 | weryfikator |
| `#comingSoonScreen` | 1251–1281 | placeholder |
| `#employeeScreen` | 1284–2633 | admin / pracownik / opiekun |

## Модалы (overlay)

18+ всплывающих окон. Открываются классом `.show` или `display:flex`.

Основные:
- `#statusModal` (~2291) — модал верификации заявления; самое сложное окно с пересчётом и историей.
- `#vehicleDetailsOverlay` (~1876) — детали авто, 36 полей.
- `#addCarrierOverlay`, `#editCarrierOverlay`, `#deleteCarrierOverlay` (~2012–2217) — CRUD перевозчика.
- `#reklamacjaOverlay`, `#reklamacjaConfirmOverlay`, `#reklamacjaSuccessOverlay` (~971–1034) — флоу рекламации.
- Модалы для авто, водителей, прицепов (admin и carrier варианты — разные, но с одинаковой структурой).

## Клиентские функции

352 функции в **глобальном scope**. Сгруппируем условно:

### A. Аутентификация (~9 fn)

`doLogin`, `verifyCode`, `resendCode`, `backToCredentials`, `initCodeBoxes`, `getCodeValue`, `syncCodeInput`, `clearCodeBoxes`, `doLogout`.

### B. Переключение панелей и табов (~25 fn)

`showCarrierPanel`, `showEmployeePanel`, `showPlanistaPanel`, `showDyspozytorPanel`, `showEksportPanel`, `showWeryfikatorPanel`, `switchCarrierTab`, `switchEmployeeTab`, `switchPlanistaTab`, `switchDyspozytorTab`, `switchOpiekaSection`, `openDashPanel`.

### C. Загрузка / отправка через `google.script.run` (~104 вызова)

`loadLimityKm`, `loadCarrierClaims`, `loadEmployeeClaims`, `loadPlanistaFleet`, `loadDyspozytorFleet`, `loadEksportData`, `loadWeryfikatorData`, `submitClaim`, `saveFinalDecision`, `saveCarrier`, `updateCarrier`, `updateCarrierByOpiekun`, `updateVehicle`, `updateDriver`, `updateNaczepa` и многие др.

### D. Render-функции (~40 fn)

`renderOpiekaStats`, `renderOpiekaCarriers`, `renderOpiekaVehicles`, `renderOpiekaDrivers`, `renderOpiekaTrailers`, `renderDashboard`, `renderDashUrgent`, `renderDashRecent`, `renderDashMonthly`, `renderDashPie`, `renderDashTopCarriers`, `renderDashReklamacje`, `renderDashTopPayouts`, и эквиваленты для каждой роли.

### E. Валидация форм (~15 fn)

`validateDateField`, `validateTimeField`, `sanitizeKm`, `sanitizeVehicle`, `parseDDMMYYYY`, `maskDate`, `pickDate`.

### F. Бизнес-расчёты на клиенте (~12 fn)

⚠️ **Дублируют backend!** `calcKmPerMonth`, `calcBusinessDays`, `getEUBanDays`, `calcEaster`, `carrierPreviewCalc`. Используются для live-preview в форме нового wniosku, но зависят от тех же лимитов.

### G. Модалы и UI (~40 fn)

`openStatusModal`, `closeStatusModal`, `openAddCarrierModal`, `openEditCarrierModal`, `openAddAutoModal`, `closeModal`, `showSuccessModal`, `showAlert`.

### H. Dark mode

`toggleDarkMode` — переключает класс `body.dark` через CSS variables override.

### I. Утилиты

`escHtml` (на стр. 6835) — **единственная** XSS-санитизация. Применяется ~70% случаев, в остальных — нет.

## Стили

### CSS-переменные

Используются для тем (light + dark): `--blue`, `--red`, `--navy`, `--g100`, `--g600`, `--text`, `--input-bg` и т.п.

### Dark mode

⚠️ **Антипаттерн**: 150+ строк дополнительных правил вида:

```css
body.dark [style*="color:var(--navy)"] { color:var(--text) !important; }
body.dark button[style*="var(--g100)"] { background:var(--input-bg) !important; }
```

Это нужно потому, что много значений вшито в `style="…"` напрямую — без CSS-классов.

### Адаптивность

Минимальная: `@media (max-width:900px)` (планшет) и `@media (max-width:640px)` (моб.).

### Зависимости

- Google Fonts (DM Sans) — только эта.
- Никаких jQuery / React / Vue. Чистый vanilla JS.
- Логотипы / картинки — `https://www.magtrans.eu/img/`.

## Связь с backend

Каждый сервер-вызов:

```javascript
google.script.run
  .withSuccessHandler(data => { /* render */ })
  .withFailureHandler(err => { /* show error */ })
  .functionName(currentUser.login, payload);
```

`currentUser` — глобальная переменная, заполняется при `verifyCode`. Если страница перезагружена — пользователь снова на `#loginScreen`.

## Глобальные переменные клиента

Объявлены через `var` в глобальном scope:

```javascript
var currentUser = null;          // user object after login
var _limityKm = {};              // кеш лимитов
var _opiekaStats = undefined;    // кеш статистики опекуна
window.CHAT_ENABLED = true;      // feature flag (hardcoded)
```

## Ключевые UX-потоки

### Поток «Подача заявления» (carrier)

```
switchCarrierTab('newClaim')
  → форма отображается
  → user заполняет → carrierPreviewCalc() (live preview)
  → submitClaim() → google.script.run.submitNewClaim
  → withSuccessHandler → showSuccessModal → loadCarrierClaims()
```

### Поток «Верификация» (employee)

```
loadEmployeeClaims()
  → клик на строку → openStatusModal(rowIdx)
  → google.script.run.buildClaimObj(login, rowIdx) → форма заполнена
  → корректировки → live recalc
  → клик "Zaakceptuj" / "Odrzuć" → saveFinalDecision()
  → updateClaimFull() на бэке
  → withSuccessHandler → закрытие, refresh таблицы
```

## Проблемы фронтенда

См. [08-issues-and-solutions.md](08-issues-and-solutions.md), кратко:

1. **Монолит 10.5к строк** — невозможно тестировать, разбирать в git.
2. **5+ XSS-уязвимостей** в обработке ошибок (`innerHTML` с `err.message` без escape).
3. **1 375 inline `style=`** — невозможно изменить тему без правки HTML.
4. **300+ inline `onclick=`** — не подключить event delegation, мешают рефакторингу.
5. **352 функции в global scope** — коллизии возможны.
6. **Дублирование расчётов** — `calcKmPerMonth` живёт и на клиенте, и на сервере; легко рассинхрон.
7. **Hardcoded UI-строки** — нет i18n, смешение PL/EN в коде.
8. **Дублирование шаблонов** — фильтры/поиск похожи у каждой роли (~600 строк копипаста).
