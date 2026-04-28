# 03. Роли и сущности системы

В системе **8 ролей пользователей**. Каждый пользователь хранится в одном из специализированных листов авторизации (а не в общем `users`-листе). Поле `Rola` определяет, что пользователь видит и что может делать.

## Сводная таблица ролей

| Роль | Где хранится | Видит экран | Основная функция |
|------|--------------|-------------|------------------|
| `admin` | `ADMIN` | `#employeeScreen` | Полный доступ ко всему |
| `pracownik` | `PRACOWNIK` | `#employeeScreen` | Верифицирует заявления |
| `opiekun` | `OPIEKUN` | `#employeeScreen` (раздел «Moja opieka») | Куратор группы перевозчиков |
| `planista` | `PLANISCI` | `#planistaScreen` | Спедитор закреплённых авто |
| `dyspozytor` | `DYSPOZYTOR` | `#dyspozytorScreen` | Диспетчер закреплённых авто |
| `przewoznik` | `UZYTKOWNICY` | `#carrierScreen` | Подаёт заявления, ведёт автопарк |
| `eksport` | `EKSPORT` | `#eksportScreen` | Просмотр выездов экспорта |
| `weryfikator` | `WERYFIKATOR` | `#weryfikatorScreen` | Верифицирует выезды |

---

## <a id="przewoznik"></a>🚛 Перевозчик (`przewoznik`)

**Кто это:** субподрядчик MagTrans — компания, владеющая автомобилями и водителями. Подаёт заявления о компенсации.

### Где хранится
Лист `UZYTKOWNICY`, 22 колонки (A–V):

| Поле | Описание |
|------|----------|
| `Login` | Уникальный идентификатор |
| `Hasło` | ⚠️ plaintext |
| `Rola` | `przewoznik` |
| `Nazwa`, `Firma`, `NIP`, `Email` | Контактные данные |
| `Aktywny` | `Tak`/`Nie` — блокировка доступа |
| `OpiekunLogin` | Связь с куратором |
| `OsobaKontaktowa`, `Telefon`, `EmailZlecenia` | Расширенные контакты |
| `KontoEUR`, `KontoPLN`, `TerminPlatnosci` | Финансы |
| `UbezpWartosc`, `UbezpWaznosc`, `LicencjaWaznosc` | Документы |
| `LiczbaWypisow`, `AdresFirmy` | KREPTD-данные, адрес |

### Что может делать

| Действие | Функция backend |
|----------|----------------|
| Подать заявление о гарантии км | `submitNewClaim` |
| Просмотреть свои заявления | `getClaimsForCarrier` |
| Подать рекламацию к заявлению | `submitReklamacja` |
| Управлять своими водителями | `getMyDrivers`, `addMyDriver`, `updateMyDriver`, `toggleMyDriverActive`, `removeMyDriver` |
| Управлять своими прицепами | `getMyTrailers`, `addMyTrailer`, `updateMyTrailer`, `toggleMyTrailerActive`, `removeMyTrailer` |
| Зарегистрировать выезд (delegacja) | `addDelegacja` |
| Анулировать свой выезд (только `zgloszony`) | `cancelDelegacja` |
| Просмотреть свои выезды | `getDelegacjeForCarrier` |
| Получить агрегат «моя флота» | `getMyFleet` |

### Что НЕ может
- Создавать или редактировать **автомобили** — это делает админ/опекун.
- Менять статус заявления.
- Видеть данные других перевозчиков.
- Менять ставки EUR/км или лимиты.

### Особенности
- При `Aktywny = 'Nie'` логин блокируется (`validateCaller` вернёт сигнал блокировки).
- Поле `auta` в user-объекте — массив активных `nrRej` его автомобилей.
- Может переключиться на админ-панель кнопкой `#btnSwitchToEmployee` — **только если** имеет соответствующую запись в `ADMIN`/`PRACOWNIK`/`OPIEKUN`.

---

## <a id="opiekun"></a>🛡️ Опекун (`opiekun`)

**Кто это:** сотрудник MagTrans, курирующий **группу перевозчиков**. Может полноценно администрировать «своих» (тех, у кого `OpiekunLogin = его login`).

### Где хранится
Лист `OPIEKUN` — 6 колонок (Login, Hasło, Rola, Nazwa, Email, Firma).

> ⚠️ Существует также **legacy-лист `OPIEKUNOWIE`** (строка `Code.gs:700`) с 3 колонками (`Imię i nazwisko`, `Email`, `Aktywny`). Используется для поиска email-получателей при decision-уведомлениях. Это источник путаницы — см. [08-issues-and-solutions.md](08-issues-and-solutions.md#13-два-листа-opiekun-и-opiekunowie).

### Что может делать (только для своих перевозчиков)

| Действие | Функция |
|----------|---------|
| Просмотр флоты (агрегат) со статистикой | `getOpiekunFleet` |
| CRUD перевозчиков | `addCarrierByOpiekun`, `updateCarrierByOpiekun`, `toggleCarrierActiveByOpiekun`, `deleteCarrierByOpiekunHard`, `resetCarrierPasswordByOpiekun` |
| CRUD авто | `addVehicleByOpiekun`, `updateVehicleDetailsByOpiekun`, `toggleVehicleActiveByOpiekun`, `removeVehicleByOpiekun`, `getVehicleDetailsByOpiekun` |
| CRUD прицепов | `addNaczepaByOpiekun`, `updateNaczepaByOpiekun`, `removeNaczepaByOpiekun` |
| CRUD водителей | `addDriverByOpiekun`, `updateDriverByOpiekun`, `removeDriverByOpiekun` |

### Что НЕ может
- Действовать на перевозчиках, у которых другой `OpiekunLogin` — `_opiekunOwnsCarrier()` (`Code.gs:2901`) бросает ошибку.
- Верифицировать заявления (это `pracownik`/`admin`).

### Audit log
Каждое действие опекуна **обязательно** пишется в `AUDIT_LOG` через `_writeAuditLog()` (`Code.gs:503`) с указанием user, action, target, before/after, reason.

### Статистика «Moja opieka»
`getOpiekunFleet()` возвращает по каждому перевозчику:
- `jezdzace` — авто, у которых `OstatnioJezdzilo` свежее N дней;
- `stojace` — авто, не выезжавшие давно;
- `nieaktywne` — `Aktywne='Nie'`;
- `potencjalne` — `LiczbaWypisow - aktualnaLiczbaAut` (потенциальный апсайд по KREPTD).

---

## <a id="planista"></a>📋 Планиста (`planista`)

**Кто это:** спедитор, отвечающий за загрузку конкретных автомобилей.

### Где хранится
Лист `PLANISCI`, 7 колонок: Login, Hasło, Rola, Nazwa, Email, **Lider** (email лидера группы), Aktywny.

### Что может делать
- Видеть авто, у которых в колонке `Planista` (AUTA col G) указано его имя.
- `getPlanistaFleet(login)` (`Code.gs:3583`) — фильтрует AUTA по этой колонке.
- Видеть водителей и прицепы перевозчиков своих авто (read-only).

### Что НЕ может
- Ничего редактировать.
- Видеть заявления / делегации.

### Особенности
- Поле `Lider` (email) используется в `sendInternalDecisionEmail` — лидер группы тоже получает уведомление о решении по заявлению авто планисты.

---

## <a id="dyspozytor"></a>🎯 Диспетчер (`dyspozytor`)

**Кто это:** диспетчер по конкретным автомобилям. Обычно работает в паре с планистой.

### Где хранится
Лист `DYSPOZYTOR`, 6 колонок (Login, Hasło, Rola, Nazwa, Email, Firma).

### Что может делать
- Видеть авто, у которых `Dyspozytor` (AUTA col S) указывает на его login.
- `getDyspozytorFleet(login)` (`Code.gs:3676`) — фильтрует AUTA.
- Видеть **делегации (выезды)** этих авто: `getDelegacjeForDyspozytor` (`Code.gs:4033`).
- Просматривать водителей и прицепы.

### Что НЕ может
- Менять данные авто или подавать заявления.

### Отличие от планисты
- Планиста смотрит на загрузку (что заказать, куда поедет).
- Диспетчер смотрит на текущий рейс (где машина, когда вернётся).

---

## <a id="pracownik"></a>👨‍💼 Работник (`pracownik`) и Админ (`admin`)

**Кто это:** сотрудник MagTrans, верифицирующий заявления.

### Где хранится
- `pracownik` → лист `PRACOWNIK` (6 колонок).
- `admin` → лист `ADMIN` (6 колонок).

### Различия
- `admin` имеет дополнительные права: hard-delete, управление лимитами, диагностические функции (`diagnostykaMaili`, `DIAGNOSTYKA_WNIOSKÓW`, `getDashboardStats`).
- `pracownik` ограничен верификацией.

### Что могут оба
| Действие | Функция |
|----------|---------|
| Видеть все заявления с фильтром | `getAllClaims` |
| Верифицировать (изменить статус, пересчитать) | `updateClaimFull` |
| Просмотр всех перевозчиков | `getCarriersList` |
| CRUD перевозчиков | `addCarrier`, `updateCarrier`, `toggleCarrierActive`, `deleteCarrierHard`, `resetCarrierPassword` |
| CRUD авто (всех) | `getAllVehiclesForAdmin`, `addVehicle`, `updateVehicleDetails`, `toggleVehicleActive`, `removeVehicle`, `getVehicleDetails` |
| CRUD водителей (всех) | `getDriversList`, `addDriver`, `updateDriver`, `toggleDriverActive`, `removeDriver` |
| CRUD прицепов | `getNaczepyList`, `addNaczepa`, `updateNaczepa`, `toggleNaczepaActive`, `removeNaczepa` |
| Управление справочником типов прицепов | `getNaczepyTypyList`, `addNaczepaTyp`, `toggleNaczepaTypActive` |
| Внешние проверки | `viesLookup`, `whiteListCheckAccount`, `inspectionCheckLink` |

### Только для admin
- `setupTriggers` — создание cron-триггеров.
- Диагностические endpoint-ы.
- Прямая запись в `LIMITY KM`.

---

## <a id="специальные-роли"></a>🔍 Специальные роли

### `eksport` — Эксперт экспорта

**Где:** лист `EKSPORT`. **Экран:** `#eksportScreen`.

Видит выезды (delegacje), относящиеся к экспортным операциям. Функция: `getEksportData` / `getDelegacjeForEksport` (`Code.gs:3980`).

Read-only.

### `weryfikator` — Верификатор выездов

**Где:** лист `WERYFIKATOR`. **Экран:** `#weryfikatorScreen`.

Управляет статусом делегаций:
- `markDelegacjaInTransit` — переводит из `zgloszony` в `w_trasie`.
- `markDelegacjaReturned` — переводит в `zjechal`, обновляет `OstatnioJezdzilo` авто.
- `cancelDelegacja` — может анулировать любую (в отличие от перевозчика).

Видит **все** делегации: `getDelegacjeForWeryfikator` (`Code.gs:4007`), параметр `includeHistory` для архивных.

---

## Сущности (entities) — данные, не пользователи

### 🚚 Автомобиль (Auto)
Лист `AUTA`, 36 колонок. Принадлежит перевозчику (`LoginPrzewoznika`). Имеет планисту (`Planista`) и диспетчера (`Dyspozytor`) — это связи на сотрудников MagTrans, а не на перевозчика.

Ключевые поля: `NrRej`, `Aktywne`, `Marka`, `Model`, `Rok`, `CertyfikatL` (L1/L2/L3 — шумовой класс), `EURO` (III/IV/V/VI), `ADR` (CSV классы опасных грузов), `GPS`, `Typ` (MEGA/STD/COIL), 4 ставки EUR/км (DE, UE, Eksport, Import), `Odpady` (флаг отходов), `OdpadyKraje` (CSV стран с разрешением), `Kabotaz` (DE/FR), `NastepnyPrzeglad`, `OstatnioJezdzilo`.

### 👨‍✈️ Водитель (Kierowca)
Лист `KIEROWCY`, 13 колонок. Привязан к перевозчику через `PrzewoznikLogin`. Login генерируется автоматически из `Imię.Nazwisko` (с деакцентификацией и суффиксами `-2`, `-3` при коллизии).

### 🚃 Прицеп (Naczepa)
Лист `NACZEPY`, 24 колонки. Привязан к перевозчику. Тип берётся из справочника `NACZEPY_TYPY`.

### 📄 Заявление (Wniosek)
Лист `WNIOSEK`, 50 колонок (A–AX). Уникальный `NrZgl` формата `GWA/NNN/MM/RR`. Статусы: `NA WERYFIKACJI`, `ZAAKCEPTOWANO`, `ODRZUCONO`, `REKLAMACJA`, `OCZEKUJE NA AUTORYZACJĘ`, `AUTORYZACJA — KWOTA MAKSIMA`.

Имеет «зеркальные» поля для рекламации: `OrigData`, `OrigGodzina`, `OrigPrzebieg`, `StatusPrzedReklamacja` — чтобы можно было откатиться.

### 🚀 Делегация (Delegacja, Wyjazd)
Лист `DELEGACJE`, 20 колонок. Описывает один рейс. Статусы: `zgloszony` → `w_trasie` → `zjechal` (или `anulowany` на любой стадии).

### 💬 Чат (Chat)
Лист `CHAT`, активируется флагом `window.CHAT_ENABLED`. Сообщения привязаны к `NrZgl`. Функции: `sendChatMessage`, `getChatMessages`, `getChatUnreadCounts`. Старые (>30 дней) удаляются `_cleanupOldChatMessages`.

### 📊 Audit Log
Лист `AUDIT_LOG`, 9 колонок: Data, User, UserRola, Akcja, Target, Przed, Po, Powód, Metadata (JSON). Заполняется через `_writeAuditLog()`.

### 🌍 Лимиты (Limity)
Лист `LIMITY KM`. Двумерная таблица: `Rok` × месяцы. На каждый месяц — 2 значения: км/день и ставка EUR. Используется в `calcKmGwarantPerMonth`.

---

## Матрица доступа (упрощённая)

| Действие | admin | pracownik | opiekun | planista | dyspozytor | przewoznik | eksport | weryfikator |
|----------|:-----:|:---------:|:-------:|:--------:|:----------:|:----------:|:-------:|:-----------:|
| Подать заявление | — | — | — | — | — | ✅ | — | — |
| Верифицировать заявление | ✅ | ✅ | — | — | — | — | — | — |
| Видеть все заявления | ✅ | ✅ | — | — | — | — | — | — |
| Видеть свои заявления | — | — | — | — | — | ✅ | — | — |
| CRUD перевозчиков (все) | ✅ | ✅ | — | — | — | — | — | — |
| CRUD перевозчиков (свои) | — | — | ✅ | — | — | — | — | — |
| CRUD авто (все) | ✅ | ✅ | — | — | — | — | — | — |
| CRUD авто (свои перев.) | — | — | ✅ | — | — | — | — | — |
| Видеть свои авто (планист.) | — | — | — | ✅ | ✅ | — | — | — |
| CRUD водителей/прицепов (свои) | ✅ | ✅ | ✅ | — | — | ✅ | — | — |
| Зарегистрировать выезд | — | — | — | — | — | ✅ | — | — |
| Изменить статус выезда | ✅ | — | — | — | — | — | — | ✅ |
| Видеть выезды | ✅ | ✅ | — | — | ✅ (свои) | ✅ (свои) | ✅ | ✅ |
| Управление справочниками | ✅ | — | — | — | — | — | — | — |
| Audit log | ✅ | — | — | — | — | — | — | — |

---

## Жизненный цикл пользователя

```
Создание (admin/opiekun)
    ↓
Email с login + сгенерированным паролем (sendAccountCreatedEmail)
    ↓
Первый вход → 2FA код по email → user-объект в JS-памяти
    ↓
[активная работа]
    ↓
Деактивация (Aktywny='Nie') → email уведомление → блокировка логина
    ↓
[опционально] Реактивация → Aktywny='Tak' → email
    ↓
[опционально] Hard delete → удаление строки + всех связанных авто (для перевозчика)
```
