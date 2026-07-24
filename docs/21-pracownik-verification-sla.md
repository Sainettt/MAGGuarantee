# 21. Pracownik — Claim verification SLA «attention» (имплементационная спека)

> Net-new фича (нет легаси-аналога в `Code.gs`). Решения заказчика зафиксированы 2026-06-10.
> Цель: claim (wniosek) должен быть верифицирован за **7 польских рабочих дней** после входа в `NA_WERYFIKACJI`. За 3 рабочих дня до дедлайна (и после него) — привлекать внимание pracownik.

## 1. Правило и якорь

- **SLA:** 7 **польских рабочих дней** (Пн–Пт минус польские дни ustawowo wolne), считая **от дня входа в `NA_WERYFIKACJI`, сам день входа исключён**, отсчёт вперёд. Все вычисления в таймзоне **Europe/Warsaw**, по датам (без времени суток).
- **Якорь:** `Claim.statusChangedAt` — он re-stamped на КАЖДОМ переходе статуса, в т.ч. при возврате в верификацию через REKLAMACJA, поэтому **часы корректно перезапускаются** на повторной верификации. `statusChangedAt` nullable → **fallback `createdAt`** для редких legacy/edge-строк.
- **Кого считаем:** только claim'ы в статусе `NA_WERYFIKACJI` (пока «на часах»). После решения (`ZAAKCEPTOWANO`/`ODRZUCONO`/`OCZEKUJE_NA_AUTORYZACJE`) часы останавливаются.

## 2. Бакеты (взаимоисключающие, overdue побеждает)

```
workingDaysLeft = workingDaysBetween(today, deadline)   // знаковое
deadline        = addPolishWorkingDays(anchorDate, 7)
```
| Бакет | Условие | Подсветка |
|---|---|---|
| `overdue` | `workingDaysLeft < 0` | красный (самое срочное) |
| `dueSoon` | `0 ≤ workingDaysLeft ≤ 3` | янтарный — «zbliża się termin» |
| `onTrack` | `workingDaysLeft > 3` | не подсвечиваем |

## 3. Shared util (api-agent) — `packages/shared/src/domain/polish-calendar.ts`

⚠️ **НЕ переиспользовать `getEUBanDays`** из `eu-calendar.ts` — это дни запрета движения по ЕС (вкл. DE/NL праздники, напр. Wielki Piątek), **не** польский рабочий календарь. `calcEaster` переиспользовать можно (это чистый helper).

Экспорты: `polishHolidays(year)`, `addPolishWorkingDays(date, n)`, `workingDaysBetween(a, b)`, и helper дедлайна/бакета (отдаёт `workingDaysLeft` + бакет по `anchorDate` и `now`).

**Польские дни ustawowo wolne:** фиксированные — Nowy Rok 01-01, Trzech Króli 01-06, Święto Pracy 05-01, Konstytucji 3 Maja 05-03, Wniebowzięcie NMP 08-15, Wszystkich Świętych 11-01, Niepodległości 11-11, Boże Narodzenie 12-25 и 12-26; подвижные (через `calcEaster`) — Wielkanoc (Пн +1), Boże Ciało (+60). **Польша НЕ празднует Wielki Piątek (Good Friday).** Sat/Sun — нерабочие.

**Тесты:** ≥30 фикстур (по культуре репо, как у `calcKmGwarantPerMonth`): дедлайны через каждый праздник, переход через Новый год + Trzech Króli, подвижные (Wielkanoc/Boże Ciało), якоря рядом с выходными, ровно-на-дедлайне (0 дней), overdue.

## 4. Дашборд pracownik (derived — без миграции)

- `GET /diagnostics/dashboard` (`@Roles('admin','pracownik')`), `DiagnosticsService.getDashboard()`.
- **Заменяет** текущую кривую секцию `urgent` (она брала `updatedAt < now − 3 КАЛЕНДАРНЫХ дня` — неверный якорь и не рабочие дни).
- Репозиторий тянет `NA_WERYFIKACJI` claim'ы + `statusChangedAt` (индекс `@@index([status, statusChangedAt])` уже есть; fallback `createdAt`); сервис бакетит через util из §3.
- `DashboardDto` (в `@magguarantee/shared`): отдать `overdue[]` и `dueSoon[]`, в каждой строке — `nrZgl`, carrier, plate, `workingDaysLeft`, дип-линк. Согласовать форму DTO с web-agent.

## 5. Дневной дайджест-email (api-agent) — первый scheduled-job

- **Инструмент:** `@nestjs/schedule` `@Cron('0 7 * * *', { timeZone: 'Europe/Warsaw' })` — лёгкий, BullMQ под одну дневную задачу НЕ поднимаем.
- **Логика:** раз в день сканирует `NA_WERYFIKACJI`, бакетит util'ой; если есть `dueSoon`+`overdue` → шлёт **ОДНО** письмо со списком. **Stateless** — никакого флага «уже уведомили», никакой записи в БД.
- **Пусто → письма нет** (без «all clear»).
- **Получатели:** все активные пользователи с ролью `pracownik` (общая очередь, назначения claim'а нет). v1 — **только pracownik** (не admin). `Promise.allSettled` по адресам; per-send `record()` в mail-registry.
- **Шаблон:** новый `mail/templates/verification-digest.tsx` + метод `MailService.sendVerificationDigest`, по образцу `maksim-confirmation-request.tsx` (бренд `#dc2626`, plain-text fallback).
- **Caveat (в комментарий кода, TODO, не делать сейчас):** один инстанс API — ок; при горизонтальном масштабировании `@Cron` выстрелит на каждом инстансе → нужен Redis-lock (`RedisService` уже есть).

## 6. Что НЕ делаем
- ❌ Никаких миграций / новых колонок (derived + stateless дайджест; `statusChangedAt` уже есть).
- ❌ In-app «колокольчик» / notification-центр (email-only по решению заказчика; отдельная фича потом).
- ❌ Хранимый флаг «уже уведомили» (дайджест stateless).
- ❌ BullMQ / очереди (для одной дневной задачи — `@nestjs/schedule`).
- ❌ `getEUBanDays` как источник праздников (только структурный образец).

## 7. Маршрут
`orchestrator` → db-agent (verify no-op) ‖ uiux-agent (severity-токены overdue/dueSoon в DS) ‖ api-agent (util+фикстуры → dashboard-бакеты → cron+digest) → web-agent (виджет дашборда). Проверка: фикстур-тесты util, api-тесты бакетов/крона, typecheck по воркспейсам.

## 8. Ссылки
- Дашборд/диагностика: `apps/api/src/modules/diagnostics/`, `apps/web/app/(employee)/employee/dashboard/`
- Email: `apps/api/src/modules/mail/` (`mail.service.ts`, `templates/verification-digest.tsx`)
- Календарь: `packages/shared/src/domain/eu-calendar.ts` (`calcEaster` reuse), `km-calc.ts` (образец фикстур)
- Jobs/email конвенции: [`16-jobs-and-integrations.md`](16-jobs-and-integrations.md)
