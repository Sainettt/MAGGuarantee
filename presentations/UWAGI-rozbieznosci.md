# Расхождения, найденные при подготовке презентаций

Ниже то, что всплыло при чтении кода. В презентации эти места либо обойдены нейтральной формулировкой, либо не упомянуты. **Пункты не перепроверялись в браузере**, кроме отмеченных ✔.

## Вероятные баги

1. **Часовой пояс в диалогах «Oznacz w trasie / Oznacz zjechał» (weryfikator).** `lib/format/datetimeLocal.ts` `datetimeLocalToApiIso` дописывает `:00Z` к локальному времени. Сервер сравнивает результат с `Date.now()`. Из-за этого время за последние 1–2 часа, включая значение по умолчанию «сейчас», может отклоняться с ошибкой «…nie mogą być w przyszłości». Стоит проверить на staging.
2. **Битые ссылки в письмах.** CTA в «Nowy wniosek», в письме о решении и в письме Максиму ведут на `/employee/claims/{nrZgl}`. Такого маршрута нет, работает только `/employee/claims?nrZgl=`.
3. **«Zgłoś wyjazd» на Porozumienie (carrier)** передаёт `?vehicleId=`, но страница нового выезда этот параметр не читает, и тягач не предвыбирается.
4. **Комментарий перевозчика перезаписывается** комментарием верификатора при reject/accept (`claims.service.ts` ~3346).

## UI / тексты

5. `roles.pracownik` показывает «Pracownik», а по docs/03 и docs/19 должно быть «Opiekun wniosków».
6. Плейсхолдер поиска в списке заявок обещает поиск по NIP, но API ищет по nr zgłoszenia, номеру авто и номеру zlecenia.
7. Колонка «Zmiana» в списке заявок показывает `createdAt`, а не время последнего изменения.
8. В «Ostatnia aktywność» на дашборде выводятся сырые ключи действий (`updateClaim`, `claim.verify`…).
9. Раздел «Historia» и блок Maksima в окне заявки видны только в режиме редактирования, поэтому у решённых заявок их не видно.
10. Сообщения на английском или технические:
    - `plannedReturnAt must be on or after departureAt`;
    - ошибки regex для login / Tax ID / VAT;
    - подсказка «≥10 chars…» у временного пароля перевозчика;
    - `fuelCardNumber musi mieć…`, `beltsCount musi być ≥3`, `Wymagane min. 2 z 3 dostępów: gb / it / fr`.
11. Сообщения без польских диакритик: «Wniosek mozna zlozyc dopiero…», «Nastepny wniosek… mozna zlozyc od…» (`claim-submission-rules.ts`).
12. Поле «Hasło tymczasowe» в форме перевозчика помечено звёздочкой, хотя оно необязательное.
13. В диалоге подтверждения передачи ciągnika написано «Gotowy», а везде в UI этот статус называется «Załadowany».
14. Текст отказа `CLAIM_LIMITS_REFRESH_BLOCKED` советует «zwróć wniosek do weryfikacji», но такого действия нет.

## Права и доступ

15. У opiekun нет экрана заявок в веб-интерфейсе. API отдаёт `GET /claims` в его scope, а docs/03 пишет «видит wnioski read-only».
16. info-car и GPS указаны в docs/03 для opiekun, эндпоинты есть, но веб их не использует, а поля VIN нет. VIES всегда вызывается с префиксом `PL`.
17. У pracownik страницы `/employee/opieka`, `/alerts`, `/carriers` и т.п. открываются по прямому URL (оболочка страницы + 403 от API), хотя в меню их нет.
18. Выпадающий список в SSO-маппинге позволяет выбрать pracownik / weryfikator / eksport, хотя по политике эти роли выдаются только вручную.
19. «Lider DAF», «Lider opiekunów wniosków», «Lider eksportu», «Lider dyspozytorów» меняют только подпись роли, реальные права даёт только lider планистов.
20. Перевозчик не может приложить файлы к заявке: `attachmentIds` есть в схеме, но поля в форме нет, а эндпоинты доступны только admin/pracownik.
21. Чекбокс «Aktywny» при реактивации перевозчика не шлёт письмо «Konto reaktywowane». Письмо отправляет только эндпоинт `/reactivate`, а UI его не вызывает.

## Устаревшая документация

22. docs/03:
    - активные выезды описаны как {zgloszony, w_trasie}, в коде ещё и gotowy;
    - статистика «Moja opieka» описана по `lastDroveAt`, в коде корзины 14 / 28 / 29 дней;
    - на дашборде описаны виджеты, которых нет.
23. docs/21 подразумевает SLA для рекламаций, но код никогда не возвращает рекламацию в NA_WERYFIKACJI.
24. Списки выездов (weryfikator / eksport / carrier) и заявок перевозчика загружают максимум 50 записей и не имеют пагинации.

## Окружение во время съёмки

25. ✔ В локальном dev кнопка Google на странице логина не отображается (не задан client id), поэтому на скриншотах её нет. В слайдах она описана текстом.

## Найдено по ходу починки (2026-10-22)

26. **`daysSinceReturn` на день меньше при позднем съезде.** `packages/shared/src/domain/vehicle-status.ts` считает `lastReturnAt` датой на UTC-полночь, а `actualReturnAt` теперь настенное варшавское время с меткой `Z`. При переводе в варшавский календарный день смещение прибавляется второй раз: съезд, отмеченный в 22:00–23:59 летом (23:00–23:59 зимой), засчитывается следующим днём. Корзины «Moja opieka» (stojace / nieaktywne / doUsuniecia) и крон «do usunięcia» получают простой на день короче. Watchdog по porozumieniu считает иначе (`atMidnight` по зоне процесса): в UTC-контейнере верно, на варшавской dev-машине тот же сдвиг. *(Починено 2026-10-27, см. таблицу решений.)*

27. **`sideNumber` (внутренний бортовой номер машины) уходит перевозчику в ответах API.** В UI перевозчика он нигде не показывается, но `GET /fleet/my`, `GET /guarantee-*/me` (compliance, episodes) и `GET /vehicles/:id` отдают поле как есть. В обзоре документов (`/carriers/:id/documents/overview`) с 2026-10-27 поле обнуляется для `przewoznik`; остальные эндпоинты не трогались. Решить: правило «не показывать» или «не отдавать» (тогда scrub ещё в трёх сервисах).

28. **Письмо Максиму: `odjazdPlan` на день раньше для ночных выездов.** `claims.service.ts` берёт `toISOString().slice(0,10)` от `departureAt`, а это НАСТОЯЩИЙ UTC-момент (docs/19 #16): выезд, заявленный на 00:00–00:59 CET / 00:00–01:59 CEST, печатается предыдущим днём. Зеркальная ошибка к #26 (там настенное время читали как UTC, здесь UTC читают как настенное). Найдено 2026-10-27 при починке #26, починено 2026-10-28: `businessDateIso(departureAt)`; остальные три даты письма (`actualDepartureAt`, `actualReturnAt` — настенные, `plannedReturnAt` — date-only) резались верно и не менялись.

29. **Нижняя граница даты załadunku у перевозчика на день раньше для ночных выездов.** `claims.service.ts` `_delegationFacts` берёт `declaredDepartureDay = startOfUtcDay(departureAt)`, а `departureAt` — настоящий UTC-момент (docs/19 #16): для выезда, заявленного на 00:00–00:59 CET / 00:00–01:59 CEST, пол сдвигается на предыдущий день — перевозчик может указать `dateStart` на день раньше заявленного выезда, а 422 `CLAIM_DATE_BEFORE_DEPARTURE` и `minDateStart` печатают вчерашнюю дату. Та же ошибка, что #28; `delegations.service.ts` для того же понятия уже использует `startOfBusinessDayUtc`. `actualReturnDay` (из настенного `actualReturnAt`) считается верно. Найдено 2026-10-28 при починке #28, починено в тот же день: `startOfBusinessDayUtc(deleg.departureAt)`; `actualReturnDay` не менялся. Форма нового wniosku (`carrier/claims/new/page.tsx`) считала тот же пол срезом `departureAt` для `min` поля даты, подсказки и клиентской проверки — переведена на `businessDateIso`, иначе форма пропускала бы день, который API отвергает.

30. **Схема `SubmitDelegationSchema` допускает плановый возврат на день раньше ночного выезда.** `packages/shared/src/schemas/delegations.ts` сравнивает `plannedReturnAt` с `departureAt.slice(0, 10)`, а форма перевозчика шлёт `departureAt` настоящим UTC-моментом (`datetime-local` → `toISOString()`): для выезда 00:00–00:59 CET / 00:00–01:59 CEST срез даёт предыдущий день, и `plannedReturnAt` накануне выезда проходит валидацию. Ошибка мягкая — лишний день допуска, никого не блокирует. Там же устаревшие JSDoc (`MarkInTransitSchema` и код 422 для раннего `actualDepartureAt`) говорят про `startOfUtcDay(departureAt)`, тогда как `delegations.service.ts` давно считает `startOfBusinessDayUtc`. Той же природы, но только показ, без блокировок: `RouteCard` (`planDurationDays` на день больше), `MarkReturnedDialog` (окно подсказки «dni bez km» начинается днём раньше), `DelegationKmCalendar` / `lib/format/delegationCalendar.ts` (лишний ведущий день в ленте, когда нет `actualDepartureAt`; тест `delegationCalendar.test.ts` сейчас закрепляет срез). `MarkInTransitDialog` считает верно (переводит в локальное время браузера). Правка — `businessDateIso(new Date(departureAt))` в схеме и четырёх местах web + фикстуры + два комментария; найдено 2026-10-28 при починке #29, не чинилось.

## Решения и статус (2026-10-22)

Порядок работы: сначала эти пункты, потом баги 1–4, потом трек B (docs/25).

| # | Решение | Статус |
|---|---|---|
| 1 | Проверка «не в будущем» сравнивала настенное варшавское время с настоящим UTC. Теперь сравнение с `businessWallClockUtc()` (shared); заодно нижняя граница выезда считается по варшавскому дню (`startOfBusinessDayUtc`), а не по UTC-дню | ✅ код + тесты (4 кейса «−30 мин» падали до фикса); docs/13, 19 (квирк #16), 20 |
| 2 | Три письма ведут на `/employee/claims/{nrZgl}`, страницы такой нет; правильный вид `?nrZgl=`. Редирект со старого адреса не делаем (писем ещё не рассылали) | ✅ один хелпер `employeeClaimDeeplink` для всех внутренних писем, тесты на форму ссылки |
| 3 | `?vehicleId=` с Porozumienia не читается страницей нового выезда | ✅ предвыбор после загрузки флота и восстановления черновика; чужой id игнорируется |
| 4 | Одно поле `comment`: обоснование решения weryfikatora затирает uwagi перевозчика. Решение: отдельное поле `Claim.decisionComment`, в UI видно, кто что написал | ✅ миграция `20261022120000_claim_decision_comment` (для отказов текст перенесён из `comment`, акцепты не трогались), API пишет решение только в `decisionComment`, письма с блоками «Uzasadnienie decyzji» / «Powód odrzucenia» (внутреннее ещё «Komentarz przewoźnika»), модалка и страница перевозчика показывают два подписанных блока; docs/04, 12, 13, 14, 17, 22 |
| 5 | UI-лейбл остаётся «Pracownik» (EN «Employee»); «Opiekun wniosków» в UI не возвращаем. Лейбл лидера — «Lider pracowników» / «Employees lead». Презентации (`03-Opiekun-wnioskow.pdf`, README) не перебирались | ✅ docs/03, 13, 14, 17, 19, 28 выровнены; `roles.lider.pracownik` переименован в pl/en.json |
| 15 | Opiekun не видит wnioski ни в каком виде. Письма по wnioskam («Nowy wniosek», решение) opiekunowi **остаются** | ✅ API: opiekun убран из `GET /claims` и `GET /claims/:nrZgl`, ветки scope удалены, тесты; web: `/employee/claims` закрыт на edge; docs/03, 13, 14, 20, 24, 25 |
| 16 | **info-car удалён** (эндпоинт, модуль, shared-схема), в доках пометка «удалён решением 2026-10-22». **GPS оставляем как есть**: источник данных для weryfikatora не решён (SpedTrans или GPS-портал), эндпоинты не трогаем. **VIES**: выбор страны не нужен, остаётся `PL` | ✅ код + docs/01, 03, 10, 11, 13, 16, 17, 18, 24, 25 |
| 18 | **Оставить как есть.** Маппинг stanowisko → роль не используется для CONTROLLING / HANDEL_*: людям оттуда роли (weryfikator, pracownik, eksport) выдаются поимённо через «Nadaj dostęp», и это работает | ✅ без изменений |
| 19 | **Флаг на будущее под новые функции.** У dyspozytora, DAF, pracownika и eksportu лидерство ничего не даёт и пока не планируется; меняется только подпись и чип «Lider» | ✅ docs/03 §Лидеры переформулирован, docs/28 §8 №4 закрыт |
| 22 | Код истина | ✅ docs/03: статусы доски eksporta, корзины «Moja opieka», виджеты дашборда; стейл-комментарии в коде delegations поправлены |
| 17 | Закрыть страницы employee-shell на сервере, не только в меню | ✅ (2026-10-27) 10 страниц (`/employee/opieka`, `/opieka/carriers/[login]`, `/opieka/porozumienia`, `/opieka/delegations`, `/alerts`, `/moje-pojazdy`, `/carriers`, `/vehicles`, `/drivers`, `/trailers`) гейтятся `requirePermission(…, { onDenied: 'forbidden' })` с правом своей записи в `nav.config.ts`; edge — `PATH_PERMISSIONS` для каждого пункта меню (pracownik редиректится на landing ещё на edge); tripwire `lib/auth/pageGates.test.ts` + golden-тест «edge ≡ nav по ролям»; CTA `/employee/forbidden` → `/employee`. docs/14, 15, 25 |
| 23 | **Рекламациям такой же 7-дневный счётчик** (польские рабочие дни) от подачи рекламации: те же бакеты `overdue` / `dueSoon` на дашборде и в дайджесте 07:00, строка помечена «Reklamacja». Бейджа в списке wniosków и в модалке нет (как и не было) | ✅ shared `SLA_CLOCK_STATUSES`, обе выборки, дайджест-письмо, дашборд (чип), тесты; docs/03, 14, 16, 21, 22 |
| 26 | `daysSinceReturn` на день меньше при позднем съезде: `actualReturnAt` — настенное варшавское время с меткой `Z`, а расчёт приводил его к варшавскому дню как настоящий момент | ✅ (2026-10-27) shared: `startOfWallClockDayUtc` (пара к `startOfBusinessDayUtc`), `computeVehicleLifecycleStatus` редуцирует `lastReturnAt` по сырой дате, `createdAt` по-прежнему по варшавской, `anchorAt` отдаёт уже день (подпись «od …» в письме admin'у верна и для машин, созданных ночью); фикстуры 23:30 CET / 22:30 CEST / граница 28→29. Web: `actualDepartureAt`, `actualReturnAt`, `lastDroveAt` показываются через `formatWallClock*` (`timeZone: 'UTC'`), иначе варшавский браузер печатал 23:30 как следующий день. Watchdog не трогали (в UTC-контейнере верно). docs/04, 13, 19 |
| 28 | Письмо Максиму: `odjazdPlan` на день раньше для выездов, заявленных на 00:00–00:59 CET / 00:00–01:59 CEST — `departureAt` настоящий UTC-момент, а дату брали срезом ISO | ✅ (2026-10-28) `claims.service.ts`: `businessDateIso(departureAt)` вместо среза; остальные три даты письма (настенные `actual*`, date-only `plannedReturnAt`) резались верно, не трогались; фикстура в `claims.service.verify.spec.ts`. docs/19 |
| 29 | Нижняя граница даты załadunku (`CLAIM_DATE_BEFORE_DEPARTURE`, `minDateStart`) на день раньше для выездов, заявленных на 00:00–00:59 CET / 00:00–01:59 CEST — `_delegationFacts` брал UTC-день настоящего момента `departureAt` | ✅ (2026-10-28) `claims.service.ts`: `startOfBusinessDayUtc(departureAt)` как в `delegations.service.ts`; `actualReturnDay` (настенный `actualReturnAt`, date-only `plannedReturnAt`) по-прежнему по сырому UTC-дню; фикстуры CET / CEST в `claims.service.submit.spec.ts`. Web: `carrier/claims/new/page.tsx` — `min` поля, подсказка и клиентская проверка через `businessDateIso` (та же редукция, что в API; без теста — страница вне vitest-охвата). docs/19 |
