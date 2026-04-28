# 09. Стратегия миграции и контекст для рефакторинга

> Этот документ — точка входа для возобновления работы с любого устройства. Прочитав его, можно сразу понимать **зачем**, **куда идём** и **где сейчас находимся**.

## Главная цель

Текущий рефакторинг GAS-кода (разбиение `Code.gs` 7482 строк и `index.html` 10584 строк на модули по плану из [07-modularization-plan.md](07-modularization-plan.md)) — это **подготовительный этап перед полным переписыванием на современный стек**:

- **Backend:** PostgreSQL + NestJS
- **Frontend:** Next.js
- **Текущая GAS-система** должна продолжать работать без изменений на всё время миграции.

## Что это меняет в подходе

### Менее важно (не тратим усилия)
- GAS-специфичные оптимизации: LockService, CacheService, batch writes (если работает — не трогаем).
- Идиоматичность GAS-кода — наоборот, пишем так, чтобы перенос на TS/Nest был очевидным.
- Тонкости deployment через clasp — только чтобы текущая система не падала.
- Безопасность пароля, XSS-санитизация, rate limiting (Этап 7 из плана 07) — будут реализованы заново на Nest, нет смысла делать в GAS.
- Глубокий рефакторинг JS на `App.*` namespaces / IIFE — бессмысленно, через несколько месяцев всё будет React.

### Более важно
- **Чёткое разделение по слоям**: repository / service / controller (api) — это 1:1 ляжет на Nest-модули.
- **DTO-подобные объекты**: то, что сейчас возвращает `_parseCarrierRow`, `buildClaimObj` и т.д. — это будущие entity/DTO.
- **Один файл = одна сущность / одна ответственность**: чтобы при переписывании один разработчик мог взять `carriers_repo.gs` и сделать `CarriersRepository` в Nest, не вникая во весь проект.
- **Группировка фронтенда по экранам/ролям** — ляжет на Next App Router (`app/carrier/page.tsx`, `app/employee/page.tsx` и т.д.).

## Маппинг: GAS-модули → целевая архитектура

| Сейчас (GAS) | Будущее (Nest/Next) |
|---|---|
| `30_repositories/carriers_repo.gs` | `carriers/carriers.repository.ts` (TypeORM/Prisma) |
| `30_repositories/*` `_parseXxxRow` функции | `entities/*.entity.ts` + `dto/*.dto.ts` |
| `40_services/*_workflow.gs` | `*/services/*.service.ts` (`@Injectable()`) |
| `40_services/km_calc.gs` | отдельный domain-сервис |
| `50_api/api_*.gs` | `*/controllers/*.controller.ts` (`@Controller`) |
| `60_email/*.gs` | `mail/mail.module.ts` |
| `70_integrations/ext_*.gs` | `integrations/*/` HTTP-клиенты |
| `20_auth/*.gs` | `auth/auth.module.ts` (Passport + JWT/2FA) |
| `10_sheets/ensure_*.gs` | TypeORM/Prisma миграции (одноразово) |
| `99_diagnostics.gs` | health-чеки + админ-эндпоинты |
| `index.html` (login) | `app/login/page.tsx` |
| `screen_carrier.html` | `app/carrier/page.tsx` + компоненты |
| `screen_employee_*` | `app/employee/(dashboard\|claims\|carriers\|...)` |
| `partials/modal_*.html` | компоненты `components/Modal*.tsx` |
| ролёвые `_require*` хелперы | NestJS guards (`@UseGuards(RoleGuard)`) |
| inline `<script>` global JS | TanStack Query + хуки + Zustand/Redux |

## Принципы решений

1. **"Оставить работающим" = функциональная идентичность с текущим Code.gs**, не побитовая эквивалентность. Если функция работает так же — этого достаточно.
2. **Дубликаты функций в `Code.gs` vs `src/backend/` на промежуточных этапах — нормально**. В финале переключаемся атомарно (Code.gs → удалить, modular → push).
3. **Скрытые зависимости от утилит** (например, `claims_repo.buildClaimObj` использует `safeStr/safeFmtDate` пока живущие в Code.gs) — выносить вместе с зависимыми модулями, не до того.
4. **Если возникает сомнение** "оптимизировать GAS или просто перенести?" — **просто перенести**. Оптимизация будет на Nest.
5. **Не вводить feature flags, backwards-compat шимы, gradual migration в GAS** — после переключения старый Code.gs можно удалить полностью.

## Этапы и их статус

Из плана [07-modularization-plan.md](07-modularization-plan.md):

| # | Этап | Статус |
|---|---|---|
| 1 | Безопасные подготовительные работы (clasp, backup, COLS_*, ok/err хелпер) | ⏳ Частично — clasp не настроен; COLS_* / ok-err не введены |
| 2a | Извлечь utils (`fmt*`, `parse*`, `safe*`, `escHtml`, валидаторы) | ⏳ Не начато |
| 2b | Извлечь repositories (`*_repo.gs`) | ✅ **Готово (копирование)** — `src/backend/30_repositories/` |
| Доп. | Извлечь config / doGet / sheets / auth | ✅ **Готово (копирование)** — `src/backend/00_config.gs`, `01_doget.gs`, `10_sheets/`, `20_auth/` |
| 3 | Выделить services (бизнес-логика, рабочие процессы) | ⏳ Не начато |
| 4 | Дедупликация ролевых функций (`addCarrier` vs `addCarrierByOpiekun`) | ⏳ Не начато |
| 5 | Frontend partials (HTML + CSS, разбиение по экранам) | ⏳ Не начато |
| 6 | Frontend JS-модули (по экранам, без глубокого namespace-рефактора) | ⏳ Не начато |
| 7 | Безопасность (хеширование, XSS, rate limit) | ❌ **Пропускаем** — реализуется в Nest |
| 8 | Тесты и JSDoc | ⏳ Минимально, в Nest полноценно |

## Текущее состояние репозитория

### Что лежит в репозитории
```
.
├── Code.gs                 # 7482 строк, текущая работающая версия (НЕ ТРОГАТЬ до атомарного переключения)
├── index.html              # 10584 строк, текущий фронт
├── docs/                   # документация
│   └── 09-migration-strategy.md  # этот файл
└── src/                    # модульная структура (Этап 2b уровня)
    ├── backend/
    │   ├── 00_config.gs              CONFIG
    │   ├── 01_doget.gs               doGet/onOpen/setupTriggers/onEditTrigger
    │   ├── 10_sheets/                14 файлов: ensure*Sheet функции
    │   ├── 20_auth/                  4 файла: login_code, validate, password, validators
    │   └── 30_repositories/          12 файлов: parse/lookup на сущность
    └── frontend/                     пусто (готова к Этапу 5-6)
```

**Важно:** код в `src/backend/` сейчас — это **копия** соответствующих кусков `Code.gs`, а не вырезание. На GAS deploy при `clasp push` это даст redeclaration error. Переключение должно быть одним атомарным коммитом, когда мы готовы.

### Что было пропущено сознательно
- `_writeAuditLog` я положил в `30_repositories/audit_repo.gs`, потому что он формально работает с листом AUDIT_LOG. Технически он отправляет email — это смешение слоёв, но в Nest это корректно ляжет в audit-сервис, который инжектит mail-сервис.
- `findCarrierEmail` положена в `carriers_repo.gs`, хотя в исходнике она в email-секции — по сущности это lookup carrier по name, и так логичнее.
- `getNaczepyTypyList`, `getDyspozytorList`, `getPlannerList`, `getOpiekunList` — формально это публичные API-функции (вызываются из фронта через `google.script.run`), но это тонкие read-only обёртки без бизнес-логики и могут оставаться в repos. В Nest это будет `@Get('/dyspozytor/list')` контроллер, делегирующий в `DyspozytorRepository.findAll()`.

## Известные несоответствия / риски

1. **`HtmlService.createHtmlOutputFromFile('App')` в `doGet`**, а локальный файл — `index.html`. До первого `clasp pull/push` нужно проверить, как файл реально называется в GAS-проекте (вероятно `App.html`).

2. **Нет `.clasp.json` и `appsscript.json`** в репозитории — clasp не настроен. До первого деплоя модульной версии нужно:
   - `clasp login` + `clasp clone <scriptId>`
   - проверить настройку `rootDir` (нужно `.` или `src/backend`)
   - решить как clasp обрабатывает поддиректории (`10_sheets/ensure_users.gs` → имя файла в GAS UI)

3. **Сделать backup spreadsheet** перед любым опасным деплоем (Этап 1 из плана 07).

## Следующие шаги (приоритет)

1. **Services + utils (Этап 2a + 3)**: вынести `fmt*/parse*/safe*/escHtml`, `calcKmGwarantPerMonth`, `submitNewClaim`, `updateClaimFull`, `addDelegacja` и т.д. в `40_services/` и `90_utils/`.
2. **Frontend структурное разбиение (Этап 5)**: `index.html` → `partials/screen_*.html` + `css/*.html` + `js/*.html`, без переписывания JS на namespaces. Цель — каждый экран в своём файле, чтобы видеть структуру.
3. **Атомарное переключение**: удалить из `Code.gs` всё, что уже есть в `src/backend/`, проверить что всё ещё работает, закоммитить.
4. После этого можно начинать настоящую миграцию — поднимать Nest-проект и переносить модули.

## Полезные ссылки внутри проекта

- [01-overview.md](01-overview.md) — что делает система в целом
- [02-architecture.md](02-architecture.md) — текущая архитектура GAS
- [03-roles.md](03-roles.md) — роли пользователей (admin, opiekun, planista, dyspozytor, eksport, weryfikator, przewoznik)
- [04-data-model.md](04-data-model.md) — структура листов Google Sheet
- [05-backend-api.md](05-backend-api.md) — текущие публичные `google.script.run` эндпоинты
- [06-frontend.md](06-frontend.md) — структура фронта
- [07-modularization-plan.md](07-modularization-plan.md) — детальный план разбиения
- [08-issues-and-solutions.md](08-issues-and-solutions.md) — известные проблемы и пути решения
