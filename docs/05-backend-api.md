# 05. Backend API (Code.gs)

Карта функций по группам с указанием строк.

## 1. Инициализация и листы (`Code.gs:99–800`)

| Функция | Строка | Назначение |
|---------|--------|-----------|
| `doGet(e)` | 100 | Точка входа HTTP |
| `ensureUsersSheet` | 129 | Создаёт ADMIN/PRACOWNIK/OPIEKUN/UZYTKOWNICY |
| `ensureUsersColumnsExtended` | 231 | Добавляет колонки L–V в UZYTKOWNICY |
| `ensureAutaSheet` | 205 | AUTA с 36 колонками |
| `ensureAutaColumnsExtended` | 257 | Группами расширяет AUTA |
| `ensureKierowcySheet` / `ensureKierowcyColumnsExtended` | 346 / 363 | KIEROWCY |
| `ensureNaczepySheet` / `ensureNaczepyColumnsExtended` | 393 / 416 | NACZEPY |
| `ensureNaczepyTypySheet` | 458 | NACZEPY_TYPY |
| `ensureAuditLogSheet` | 489 | AUDIT_LOG |
| `ensurePlanisciSheet` | 570 | PLANISCI |
| `ensureDyspozytorSheet` | 598 | DYSPOZYTOR |
| `ensureEksportSheet` | 613 | EKSPORT |
| `ensureDelegacjeSheet` | 639 | DELEGACJE |
| `ensureWeryfikatorSheet` | 660 | WERYFIKATOR |
| `ensureOpiekunowieSheet` | 700 | OPIEKUNOWIE (legacy) |
| `ensureLimitySheet` | 788 | LIMITY KM |
| `ensureChatSheet` | 7247 | CHAT |

## 2. Авторизация (`Code.gs:947–1240`)

| Функция | Строка | Назначение |
|---------|--------|-----------|
| `findUserInSheet` | 947 | Поиск login+password в одном листе |
| `maskEmail` | 993 | `ma***@magtrans.eu` |
| `sendLoginCode` | 1003 | 6-значный код в Cache + email |
| `verifyLoginCode` | 1064 | Проверка кода, блокировка после 5 неудач |
| `resendLoginCode` | 1131 | Повторная отправка |
| `authenticateUser` | 1167 | **Legacy** двухшаговый login+password |
| `validateCaller` | 1183 | Главный auth-checker, обходит все листы |
| `requireAdmin` | 1212 | shortcut |
| `requireEmployee` | 1219 | shortcut |
| `requireCarrierOwner` | 1226 | проверка владения wnioskiem |

## 3. Управление перевозчиками (admin) (`Code.gs:1212–1603`)

| Функция | Строка |
|---------|--------|
| `getCarriersList` | 1316 |
| `addCarrier` | 1356 |
| `updateCarrier` | 1439 |
| `toggleCarrierActive` | 1511 |
| `deleteCarrierHard` | 1541 |
| `resetCarrierPassword` | 1579 |
| `_generateRandomPassword` | 1243 |
| `_isValidLogin` | 1259 |
| `_isValidEmail` | 1253 |
| `_isValidVehicleNr` | 1265 |
| `_parseCarrierRow` | 1290 |
| `_carrierExtFromData` | 1273 |

## 4. Управление автомобилями (`Code.gs:548–1940`)

| Функция | Строка |
|---------|--------|
| `getActiveVehiclesForLogin` | 548 |
| `getVehiclesForCarrier` (admin) | 1606 |
| `addVehicle` | 1635 |
| `toggleVehicleActive` | 1672 |
| `removeVehicle` | 1712 |
| `getAllVehiclesForAdmin` | 1800 |
| `updateVehicleDetails` | 1822 |
| `getVehicleDetails` | 1920 |
| `_parseAutoRow` | 1744 |

## 5. Управление водителями (`Code.gs:1943–4507`)

| Функция | Строка |
|---------|--------|
| `getDriversList` (admin) | 1989 |
| `getDriverDetails` | 2042 |
| `addDriver` | 2068 |
| `updateDriver` | 2134 |
| `toggleDriverActive` | 2178 |
| `removeDriver` | 2208 |
| `_generateDriverLogin` | 1954 |
| `_parseDriverRow` | 2022 |
| `getMyDrivers` | 4316 |
| `addMyDriver` | 4348 |
| `updateMyDriver` | 4395 |
| `toggleMyDriverActive` | 4439 |
| `removeMyDriver` | 4474 |

## 6. Управление прицепами (`Code.gs:2237–4687`)

| Функция | Строка |
|---------|--------|
| `getNaczepyList` | 2297 |
| `getNaczepaDetails` | 2318 |
| `addNaczepa` | 2344 |
| `updateNaczepa` | 2387 |
| `toggleNaczepaActive` | 2442 |
| `removeNaczepa` | 2472 |
| `getMyTrailers` | 4508 |
| `addMyTrailer` | 4539 |
| `updateMyTrailer` | 4579 |
| `toggleMyTrailerActive` | 4618 |
| `removeMyTrailer` | 4653 |
| `_isValidNaczepaNr` | 2240 |
| `_parseNaczepaRow` | 2247 |

## 7. Справочник типов прицепов (`Code.gs:2501–2590`)

| Функция | Строка |
|---------|--------|
| `getNaczepyTypyList` | 2505 |
| `addNaczepaTyp` | 2528 |
| `toggleNaczepaTypActive` | 2558 |

## 8. Внешние интеграции (`Code.gs:2592–2715`)

| Функция | Строка | API |
|---------|--------|-----|
| `viesLookup` | 2599 | VIES (EC) |
| `whiteListCheckAccount` | 2649 | Biała Lista MF (PL) |
| `inspectionCheckLink` | 2678 | info-car.pl URL helper |
| `getVehicleCertTypes` | 2685 | Возвращает enums |
| `getDyspozytorList` | 2698 | Список диспетчеров для dropdown |

## 9. Лимиты и расчёт km (`Code.gs:787–941`)

| Функция | Строка |
|---------|--------|
| `getLimityKm` | 813 |
| `getMonthLimit` | 850 |
| `getMonthRate` | 855 |
| **`calcKmGwarantPerMonth`** | 862 |

## 10. Заявления (wnioski) (`Code.gs:4795–6950`)

| Функция | Строка |
|---------|--------|
| `getClaimsForCarrier` | 4795 |
| `getAllClaims` | 4911 |
| `buildClaimObj` | 5099 |
| `updateClaimFull` | 5183 |
| `submitNewClaim` | 6118 |
| `submitReklamacja` | 6804 |
| `buildCarrierEmail` | 5735 |
| `sendInternalDecisionEmail` | 5645 |
| `_sendThreadedEmail` | 5788 |
| `findCarrierEmail` | 5768 |
| `uploadAuthScreenshot` | 5977 |
| `sendAuthorizationRequest` | 6010 |

## 11. Делегации (`Code.gs:3779–4185`)

| Функция | Строка |
|---------|--------|
| `addDelegacja` | 3849 |
| `getDelegacjeForCarrier` | 3955 |
| `getDelegacjeForEksport` | 3980 |
| `getDelegacjeForWeryfikator` | 4007 |
| `getDelegacjeForDyspozytor` | 4033 |
| `markDelegacjaInTransit` | 4071 |
| `markDelegacjaReturned` | 4100 |
| `cancelDelegacja` | 4150 |
| `_parseDelegacjaRow` | 3779 |
| `_generateDelegacjaId` | 3823 |

## 12. Панели по ролям

### Опекун (`Code.gs:2718–3569`)

| Функция | Строка |
|---------|--------|
| `_requireOpiekun` | 2727 |
| `getOpiekunFleet` | 2733 |
| `_opiekunOwnsCarrier` | 2901 |
| `addCarrierByOpiekun` | 2919 |
| `updateCarrierByOpiekun` | 3008 |
| `toggleCarrierActiveByOpiekun` | 3105 |
| `deleteCarrierByOpiekunHard` | 3138 |
| `resetCarrierPasswordByOpiekun` | 3439 |
| `addVehicleByOpiekun` / `updateVehicleDetailsByOpiekun` / `toggleVehicleActiveByOpiekun` / `removeVehicleByOpiekun` / `getVehicleDetailsByOpiekun` | 3181–3439 |
| `addNaczepaByOpiekun` / `updateNaczepaByOpiekun` / `removeNaczepaByOpiekun` | 3467–3519 |
| `addDriverByOpiekun` / `updateDriverByOpiekun` / `removeDriverByOpiekun` | 3519–3569 |

### Планиста / Диспетчер / Эксп. / Веры. (`Code.gs:3577–4232`)

| Функция | Строка |
|---------|--------|
| `_requirePlanista` | 3577 |
| `getPlanistaFleet` | 3583 |
| `_requireDyspozytor` | 3670 |
| `getDyspozytorFleet` | 3676 |
| `_requireEksport` | 4190 |
| `getEksportData` | 4196 |
| `_requireWeryfikator` | 4212 |
| `getWeryfikatorData` | 4218 |

### Перевозчик (`Code.gs:4232–4687`)

| Функция | Строка |
|---------|--------|
| `_requireCarrier` | 4238 |
| `getMyFleet` | 4247 |
| `getMyVehicles` | 4293 |
| (`getMyDrivers`, `getMyTrailers` — см. выше) |

## 13. Email (`Code.gs:4686–7070`)

| Функция | Строка | Шаблон |
|---------|--------|--------|
| `sendAccountCreatedEmail` | 4687 | новый аккаунт |
| `sendPasswordResetEmail` | 4714 | сброс пароля |
| `sendAccountDeactivatedEmail` | 4739 | деактивация |
| `sendAccountReactivatedEmail` | 4763 | реактивация |
| `sendInternalDecisionEmail` | 5645 | внутр. решение |
| `buildCarrierEmail` | 5735 | HTML carrier |
| `_sendThreadedEmail` | 5788 | универсальный sender |
| `sendDailyReminders` | 6987 | trigger |
| `sendWeeklyReport` | 7056 | trigger |

## 14. Утилиты (`Code.gs:5054–6010`)

`safeStr`, `safeVal`, `safeFmtDate/Time/DT`, `fmtTime`, `fmtDate`, `fmtDateTime`, `fmtEUR`, `escHtml`, `parseDatePL`, `parseTimeGS`, `fmtDateKey`, `calcEasterGS`, `getEUBanDaysGS`, `getAuthThreshold`, `_writeAuditLog`.

## 15. Чат (`Code.gs:7241–7482`)

`ensureChatSheet`, `sendChatMessage`, `getChatMessages`, `getChatUnreadCounts`, `_findClaimByNr`, `_canAccessChat`, `_cleanupOldChatMessages`, `_maybeSendChatEmail`.

## 16. Диагностика (`Code.gs:6409–7220`)

`diagnostykaMaili`, `ponowWyslijEmail`, `DIAGNOSTYKA_WNIOSKÓW`, `getDashboardStats`, `debugClaimsSheet`, `debugBuildRow`, `getRawClaims`, `testEmail`, `testInternalEmail`.

## 17. Триггеры и меню

| Функция | Строка |
|---------|--------|
| `onOpen` | 6950 |
| `setupTriggers` | 6963 |
| `onEditTrigger` | 6977 |

## Контракты ответов (текущее состояние — непоследовательно)

⚠️ В коде встречаются 3 разных формата:
- `{ error: 'msg' }`
- `{ success: false, error: 'msg' }`
- `{ ok: false, error: 'msg' }`

И 3 формата успеха:
- `{ ok: true, ... }`
- `{ success: true, ... }`
- сразу payload

См. [08-issues-and-solutions.md](08-issues-and-solutions.md#11-непоследовательный-формат-ответов).
