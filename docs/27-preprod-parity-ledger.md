# 27. Журнал паритета pre-prod ↔ prod

> **Живой документ.** Что реально сделано на pre-prod (staging-сервер) и что из
> этого обязано повториться на prod. Последовательность шагов —
> [26-preprod-on-staging.md](26-preprod-on-staging.md).
>
> Ведёт `preprod-parity-agent`. Статус ✅ ставится **только** после явного
> подтверждения пользователя, с цитатой и датой.
>
> ⛔ **Секретов здесь нет и не будет:** пароли, токены, webhook-URL, ключи,
> `DATABASE_URL`, содержимое `rclone.conf` — только «`<set>`, 1Password →
> <запись>».

## Легенда

| Статус | Значение |
|---|---|
| ⬜ | не сделано |
| ⏳ | в процессе / ждёт доказательства |
| ✅ | сделано и подтверждено пользователем |
| ❓ | неизвестно / не подтверждено |
| ⚠️ | сделано иначе, чем в docs/26 (суть — в «Подтверждении») |
| ➖ | не требуется (причина — в колонке «Как на prod») |

Колонка **«Как на prod»** обязательна для каждой строки и начинается с одного из:
`повторить` · `иначе: …` · `не нужно: <почему>`.

---

## 1. Решения

| ID | Вопрос | Решение | Статус | Дата | Подтверждение |
|---|---|---|---|---|---|
| D-01 | Compose-файл pre-prod | `infra/docker-compose.prod.yml` | ✅ | 2026-09-18 | «Да, все три» (D-01/02/04) |
| D-02 | Данные: чистый старт / сохранить часть UAT | чистый старт: UAT → бэкап PP-04 + `data.uat-*` (PP-09) | ✅ | 2026-09-18 | «Да, все три» (D-01/02/04) |
| D-03 | Почта: GCP фирмы / личный проект / SMTP-релей | Gmail API, OAuth-клиент в GCP-проекте фирмы, refresh token ящика руководителя, `From` = группа `no-reply@` (send-as). Значения — из prod-`.env` (Q-06). Работа send-as проверяется в PP-15 | ⚠️ | 2026-09-18 | «Да, всё в GCP-проекте фирмы» → уточнено (Q-15): «Мой старый клиент + токен шефа» — почтовый OAuth-клиент `871b726a` в GCP-проекте **на аккаунте пользователя** (не фирмы), токен ящика руководителя, одна тройка на обоих серверах. Риск/долг: почта зависит от личного аккаунта — перенести клиент в проект фирмы и перевыпустить токен до ухода/смены аккаунта |
| D-04 | S3-ключи MinIO на prod | те же на обоих; источник — **prod-`.env`** (Q-06), pre-prod берёт их оттуда. Prod-MinIO, возможно, уже инициализирован ими — проверить (Q-09) | ✅ | 2026-09-18 | «Да, все три» (D-01/02/04) |
| D-05 | Как prod-MAGSpace получит те же `Employee.id` | рекомендовано: перенос MAGSpace тем же окном | ❓ | | |
| D-06 | Судьба `<домен-preprod>` после переноса | рекомендовано: 302 → prod, потом 301 или освободить | ❓ | | |
| D-07 | Подтверждение выкатов на pre-prod | без Required reviewers на `staging` — выкат без подтверждения (на prod reviewers включить — docs/23 §7.2) | ✅ | 2026-09-18 | «Нет, выкатывать без подтверждения» |
| D-08 | BugBot (X-10…X-13): один проект в BugBot для pre-prod и prod или два | **Решение пользователя** (отличается от рекомендации «prod-ключ под своим `kid`»): на prod переносится **та же пара ключей и тот же `kid`**, с pre-prod они убираются. Один проект — следует из переноса тех же ключей (отдельно не сформулировано). **Последствия:** (1) отклонение от docs/16/17 «staging и prod — разные пары, приватный ключ не покидает сервер» → Doc gaps; (2) приватный ключ придётся перенести на prod-сервер — канал не чат (Q-19); (3) пока ключ лежит на обоих серверах, BugBot не отличит токены pre-prod от prod — класть его в prod-`.env` только в окне переноса, убрать с pre-prod в C-11 (все три `BUGBOT_*` разом — частично заданная тройка роняет api); (4) `handoffUrl` всё равно переключать на prod-домен — Q-18; (5) если staging-сервер потом вернётся как настоящий staging — ему новая пара, новый `kid` и, вероятно, отдельный проект BugBot | ✅ | 2026-10-02 | «я просто перенесу те же ключи. Сейчас staging работает фулл как прод, так что я просто перенесу ключи, а с staging их уберу» |
| D-09 | X-15: хранить ли дамп перед `DROP monthly_limits` дольше штатной ротации (локально 7 дней, offsite 30) | нет — отдельной долгой копии не делать; точка отката релиза живёт 30 дней offsite (`gdrive:magguarantee-backups`, F-14). Отдельного prod-сервера нет (Q-21, 2026-10-30) — копия одна, на staging-сервере, он же prod. После этого откат «Limity tygodniowe» из дампа невозможен | ✅ | 2026-10-30 | «Нет, 30 дней offsite хватит» |

---

## 2. Факты о серверах

Заполняется выводом команд пользователя (PP-01, PP-02; для prod — перед C-00).

| ID | Параметр | pre-prod (staging) | prod | Источник, дата |
|---|---|---|---|---|
| F-01 | Хост | `vps-29a0acba` (OVH) | внутренний IP `172.22.104.110`, сеть MAGTRANS | pre-prod — PP-01 2026-09-18; prod — переписка 2026-09-15 |
| F-02 | Домен | `mymag.sainet.pl` (`WEB_URL`/`APP_URL`/`NEXT_PUBLIC_API_URL` и блок сайта в `/opt/caddy/Caddyfile`) | `mymag.magtrans.eu` | PP-01 2026-09-18 |
| F-03 | Запущенный compose-файл | `infra/docker-compose.prod.yml`: web, api, postgres, redis, minio; mailhog нет (было: `docker-compose.staging.yml`) | ❓ | PP-11 2026-09-18 |
| F-04 | SHA последнего `status=ok` | строк `status=ok` нет (grep пуст, Q-11); HEAD чекаута `1a03312` | ❓ | PP-01 2026-09-18 |
| F-05 | `git status` на сервере чистый | почти: только `?? infra/.env.uat-2026-09-18` (бэкап PP-06); `cat` удалён (X-02); HEAD `e3612ce` | ❓ | PP-11 2026-09-18 |
| F-06 | `/opt/caddy/Caddyfile` = репо | **после PP-12**: сайт MAGGuarantee = `import /etc/caddy/sites/magguarantee.caddy` (фрагмент из чекаута), `/opt/caddy/docker-compose.yml` = репо; `validate` OK. **До PP-12** было: общий файл нескольких приложений — сайт `mymag.sainet.pl` (в репо `vps-29a0acba.vps.ovh.net`), в нём маршрут `/tg/*` → `bilets-tracker:8080`, отдельный сайт `magspace.sainet.pl`; **нет** блока health-probe `/health`,`/ready` → api. `/opt/caddy/docker-compose.yml` ≠ репо: нет `UPSTREAM_PROXY_CIDRS`, нет `compress` у логов (X-01) | ❓ (`Caddyfile.prod`) | PP-01 2026-09-18 |
| F-07 | Версия Caddy ≥ 2.8 | да, `v2.11.4` | ❓ | PP-01 2026-09-18 |
| F-08 | RAM / CPU / диск | 7.6 GiB RAM, swap 0, 4 CPU, `/` 72G (свободно 46G) | ❓ | PP-01 2026-09-18 |
| F-09 | Пути данных | `/opt/magguarantee/data/{postgres,redis,minio}` | ❓ | PP-01 2026-09-18 |
| F-10 | ufw | active: 22, 80, 443/tcp от всех (v4+v6) | ❓ (цель: 22 + 80 от nginx) | PP-01 2026-09-18 |
| F-11 | Сети `proxy-net`, `magtrans-internal` | обе есть | ❓ | PP-01 2026-09-18 |
| F-12 | MAGSpace на хосте, чьи данные | `magspace-web`, `magspace-api` (healthy), `magspace-postgres` запущены; reconcile видит roster 101 (лог 2026-09-15); чьи данные — ❓ (PP-18) | ❓ | PP-01 2026-09-18 |
| F-13 | Self-hosted runner, метка | `magg-staging` (self-hosted, Linux, X64, `staging`), Idle (+ `Sainettt-MAGSpace.magspace-staging`) | `magg-prod` (self-hosted, Linux, X64, `prod`), Idle | PP-01, PP-02 (скриншот Runners) 2026-09-18 |
| F-14 | Таймер бэкапа / rclone remote | `magguarantee-backup.timer` есть, ночные прогоны 2026-09-17 03:42 и 2026-09-18 03:38 успешны; offsite-папка сейчас `gdrive:magguarantee-backups` (не `-preprod` — сменить в PP-19) | ❓ | PP-01, PP-04 2026-09-18 |
| F-15 | Объём данных (users / carriers / claims) | users 11, carriers 1, delegations 6, claims 3 | — | PP-01 2026-09-18 |
| F-16 | Внутренний IP nginx MAGTRANS | не нужно (Caddy — край) | ❓ запрошен у админов | |
| F-17 | GCP-проект клиентов почты и SSO | ❓ | ❓ | |
| F-18 | Environment vars в GitHub | `staging`: 1 variable (со слов — `COMPOSE_FILE` → staging-compose), 0 secrets, `SITE_URL` не задан (CI #224 проверял дефолт `vps-29a0acba.vps.ovh.net`); reviewers не видно | `prod`: 1 variable (со слов — `COMPOSE_FILE` → prod-compose), 2 старых secrets (X-06) | PP-02 (скриншоты, CI #224) 2026-09-18 |

---

## 3. Журнал шагов pre-prod

| ID | Шаг (docs/26) | pre-prod | Дата | Подтверждение / доказательство | Как на prod | prod |
|---|---|---|---|---|---|---|
| PP-01 | Инвентаризация сервера | ✅ | 2026-09-18 | Вывод всех 10 блоков получен, F-01…F-15 заполнены. Отличия зафиксированы: `?? cat` (X-02, удалён), `status=ok` нет (Q-11), стек остановлен намеренно (Q-10), Caddyfile ≠ репо (X-01) | повторить: те же команды на prod перед C-00 → F-* | ⬜ |
| PP-02 | Инвентаризация GitHub и внешних сервисов | ✅ | 2026-09-18 | Закрыт: deploy keys — «их вроде не должно быть», `git pull` на сервере работает (CI #224 прошёл pull/build/up); DNS `mymag.magtrans.com.pl` — «уже что то резолвит показывает ip из пула ovh … домен еще регестрируется» → ведётся в X-04. Ранее: | «у меня для staging и для прода уже стоят раннеры … Последний cicd падает из за caddy. GCP все окей уже дописал, google chat пока юзаю тест чат» + скриншоты: F-13, F-18, CI #224 (deploy ❌ на внешней `/health`, Q-11). GCP: «Internal, оба домена уже добавлены». Не получено: deploy keys, DNS | повторить: Environment `prod`, раннер `prod` | ⬜ |
| PP-03 | Решения D-01…D-07 | ⏳ | 2026-09-18 | D-01…D-04 приняты (см. раздел 1); D-05…D-07 открыты | не нужно: решения общие для обоих серверов | ➖ |
| PP-04 | Финальный бэкап UAT | ✅ | 2026-09-18 | Ручной прогон 13:46: `pg-2026-09-18-1346.sql.gz` (46170 B), `minio-2026-09-18-1346.tar.gz` (7892868 B), `offsite upload ok` → `gdrive:magguarantee-backups`, `backup complete`. Локально хранится 7 дней, offsite — 30 | не нужно: на prod нет UAT-данных | ➖ |
| PP-05 | Выписать справочники для ручного переноса | ✅ | 2026-09-18 | «Нет, всё тестовое — выписывать нечего» | не нужно: справочники переедут с дампом | ➖ |
| PP-06 | `infra/.env.new` из прод-шаблона | ⚠️ | 2026-09-18 | «окей .env.new сделан, консоль ничего не показала» (пре-флайт `config --quiet` пустой). Отклонение по Q-06: общие ключи (S3, `GMAIL_OAUTH_*`, SSO-клиент, webhooks) берутся из prod-`.env`, а не генерируются | иначе: prod-`.env` уже есть на сервере — сверить с docs/23 Фаза 4 и §4 ниже, общие ключи не менять | ⬜ |
| PP-07 | Секреты в 1Password | ⏳ отложено | 2026-09-18 | «Пока пропустить». Копии `.env` вне сервера нет — долг: общие ключи есть в prod-`.env`, уникальные для pre-prod (JWT, пароль Postgres) при потере сервера генерируются заново; до живых данных (PP-23) — закрыть | повторить: свои секреты prod; S3-ключи те же (D-04) | ⬜ |
| PP-08 | Остановить UAT-стек | ✅ | 2026-09-18 | `docker compose -f infra/docker-compose.staging.yml down` → `down 8/8`: web, mailhog, api, postgres, redis, minio-init, minio Removed, `Network infra_internal Removed` (стек был поднят после ре-рана CI #224) | не нужно: на prod стек поднимается с нуля | ➖ |
| PP-09 | Отложить каталоги данных | ✅ | 2026-09-18 | `ls`: `data` (deploy:deploy, пустой, 14:46) + `data.uat-2026-09-18` | не нужно: на prod каталоги новые | ➖ |
| PP-10 | Подложить новый `.env` | ✅ | 2026-09-18 | `ls`: `.env` `-rw-------` deploy (17657 B), `.env.uat-2026-09-18` (0600), `.env.new` нет | иначе: docs/23 Фаза 4 | ⬜ |
| PP-11 | Сборка → миграции → сид → запуск | ✅ | 2026-09-18 | HEAD `e3612ce`; `git status`: только `?? infra/.env.uat-2026-09-18` (бэкап из PP-06, не в `.gitignore` — Doc gaps). Ранее «вроде все готов»: `56 migrations … All migrations have been successfully applied`; сид 10 / 6 / 24 / 6 маппингов / 1 админ (смена пароля при первом входе); `docker ps`: web, api (healthy), postgres, redis, minio (healthy), mailhog нет, у api/web портов на хосте нет (postgres и minio — только `127.0.0.1`). Нет: вывода `git pull`/`git status` (SHA `e3612ce` не подтверждён), пароль админа в менеджер паролей (PP-07 отложен). Инцидент — X-07 | иначе: docs/23 Фаза 5 (сид можно — C-06 заменит базу) | ⬜ |
| PP-12 | Caddyfile сервер = репо, `/health` через домен | ✅ | 2026-09-18 | `caddy validate` → `Valid configuration` (warn: не отформатирован, строка 14); compose из репо → `Container caddy Started`; `https://mymag.sainet.pl/health` → `200 application/json; charset=utf-8`; `https://magspace.sainet.pl` → `307` (редирект на логин, «до» не замерялся). Бэкап `Caddyfile.bak-*` выводом не показан. Схема (Q-12): критерий — «фрагмент `infra/caddy/sites/magguarantee.caddy` = репо, серверный Caddyfile его импортирует», а не весь файл; включает X-03. Предусловие: репо-правка (фрагмент + volume в `infra/caddy/docker-compose.yml`) в `main` до PP-11 — выполнено, `e3612ce` (2026-09-18) | иначе: `Caddyfile.prod` целиком либо prod-фрагмент + `import` — по Q-13; в обоих случаях `UPSTREAM_PROXY_CIDRS` + `DOCKER-USER` (docs/23 §2.2, §3.3) | ⬜ |
| PP-13 | Environment `staging`: `COMPOSE_FILE`, `SITE_URL`, reviewers | ⬜ | | | иначе: Environment `prod` (docs/23 §7.2) | ⬜ |
| PP-14 | Пробный выкат через Actions | ⚠️ | 2026-10-02 | Выкат сделан **до PP-13** (Q-17): «Actions → Run workflow → staging». Номер рана и строка `target=… compose=…` не присланы; по F-18 `COMPOSE_FILE` Environment `staging` → staging-compose, т.е. стек мог быть поднят `docker-compose.staging.yml` (+ mailhog, web с полным `.env`) вместо `prod.yml` (D-01) — проверяется read-only выводом. Повторить после PP-13 и push compose-правки (X-13) | повторить: Run workflow → `prod` | ⬜ |
| PP-15 | Почта: код, `From`, ссылка | ⚠️ провален | 2026-09-18 | «код не приходит»: лог api — `email-send` 2fa-code 5/5 попыток, `unauthorized_client` → X-08 | повторить: логин на prod | ⬜ |
| PP-16 | SSO origins | ⚠️ провален | 2026-09-18 | «вот такая ошибка вылетает людям»: Google `Błąd 400: origin_mismatch` на `/login` → X-09 | иначе: добавить `https://mymag.magtrans.eu` | ⬜ |
| PP-17 | Chat webhook wyjazdy | ⬜ | | | повторить: те же URL в prod-`.env`, тест | ⬜ |
| PP-18 | MAGSpace доступен, чьи данные | ⬜ | | | иначе: MAGSpace на prod с теми же `Employee.id` (D-05) | ⬜ |
| PP-19 | Бэкап-юниты, `backup.conf`, `alert.conf` | ⬜ | | | иначе: папка `gdrive:magguarantee-backups-prod` (docs/23 §6) | ⬜ |
| PP-20 | Прогон бэкапа, restore-test, тест алерта | ⬜ | | | повторить | ⬜ |
| PP-21 | Внешний uptime-монитор | ⬜ | | | иначе: переключить на prod-домен в C-12 | ⬜ |
| PP-22 | Приёмка pre-prod | ⬜ | | | иначе: docs/23 Фаза 8 | ⬜ |
| PP-23 | Боевые данные через UI | ⬜ | | | не нужно: переезжают с дампом | ➖ |

---

## 4. `.env` — паритет ключей

Значения не пишутся. «pre-prod» и «prod» — описание значения.

| Ключ | pre-prod | prod | Паритет | pre-prod задан | prod задан |
|---|---|---|---|---|---|
| `POSTGRES_DATA`, `REDIS_DATA`, `MINIO_DATA` | `/opt/magguarantee/data/*` | `/opt/magguarantee/data/*` | = | ⬜ | ⬜ |
| `POSTGRES_PASSWORD` + `DATABASE_URL` | свежий hex | свой свежий hex | ≠ | ⬜ | ⬜ |
| `NODE_ENV`, `PORT`, `LOG_LEVEL`, `REDIS_URL`, `API_URL` | дефолт шаблона | дефолт шаблона | = | ⬜ | ⬜ |
| `TRUST_PROXY_HOPS` | `1` | `2` | ≠ | ⬜ | ⬜ |
| `WEB_URL`, `APP_URL`, `NEXT_PUBLIC_API_URL` | `https://<домен-preprod>` | `https://mymag.magtrans.eu` | ≠ | ⬜ | ⬜ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | свежие | свои свежие | ≠ | ⬜ | ⬜ |
| `JWT_*_TTL`, `BCRYPT_ROUNDS` | дефолт | дефолт | = | ⬜ | ⬜ |
| `MAIL_PROVIDER`, `GMAIL_OAUTH_*` | клиент `871b726a` (проект на аккаунте пользователя) + токен руководителя (Q-15) | **заменить** клиент/secret в prod-`.env` на `871b726a` (X-08) | = | ⏳ фикс X-08 | ⬜ |
| `GMAIL_FROM`, `MAIL_FROM`, `MAIL_LOGO_URL` | шаблон | шаблон | = | ⬜ | ⬜ |
| `MAKSIM_EMAIL` | боевой | боевой | = | ⬜ | ⬜ |
| `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` | боевой space, копия из prod-`.env` | тот же | = | ⬜ | ⬜ |
| `OPS_ALERT_WEBHOOK_URL` | ops-space, копия из prod-`.env` | тот же | = | ❌ пуст (лог api «OPS_ALERT_WEBHOOK_URL unset», 2026-09-18) | ❓ есть ли в prod-`.env` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | дефолт | дефолт | = | ⬜ | ⬜ |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | копия из prod-`.env` (D-04, Q-06) | **источник**: prod-`.env`; prod-MinIO должен быть инициализирован именно ими (Q-09) | = | ⬜ | ⬜ |
| `GPS_*` | mock | mock | = | ⬜ | ⬜ |
| `ALLOW_PAST_DEPARTURE`, `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` | `false` | `false` | = | ⬜ | ⬜ |
| Кроны (`*_ENABLED` и др.) | не заданы (дефолты) | не заданы | = | ⬜ | ⬜ |
| `GOOGLE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | SSO-клиент **staging-GCP-проекта** (оба ключа одинаковые, web пересобрать) — X-09 | по Q-16 | ❓ | ⏳ X-09 | ⬜ |
| `SSO_ALLOWED_HD` | `magtrans.eu` | `magtrans.eu` | = | ⬜ | ⬜ |
| `MAGSPACE_API_URL` | `http://magspace-api:3001` | то же | = | ⬜ | ⬜ |
| `MAGSPACE_INTERNAL_TOKEN` | токен MAGSpace этого сервера | токен prod-MAGSpace | ≠ | ⬜ | ⬜ |
| `DIRECTORY_RECONCILE_MODE` | `report` до PP-18 (чьи данные в MAGSpace), затем `enforce` — отличие от docs/26 | `report` первые дни → `enforce` | ≠ временно | ⬜ | ⬜ |
| `BUGBOT_URL` | origin BugBot (X-11), значение не прислано | тот же | = | ✅ со слов 2026-10-02: «все 5 переменных в infra/.env» | ⬜ |
| `BUGBOT_PROJECT_SLUG` | slug проекта (значение не прислано; шаблон — `magguarantee`) | тот же (D-08) | = | ✅ со слов 2026-10-02 | ⬜ |
| `BUGBOT_HANDOFF_KID`, `BUGBOT_HANDOFF_PRIVATE_KEY` | пара X-10 (`kid` не прислан); ключ — `<set>`, 1Password → запись не заведена (PP-07 отложен) | **та же пара и тот же `kid`** (D-08); перенос — по Q-19, в окне переноса | = | ✅ со слов 2026-10-02; что api стартовал — ❓ (X-11) | ⬜ |
| `NEXT_PUBLIC_BUGBOT_ENABLED` | `true` (build-time → пересборка web) | `true` | = | ✅ со слов 2026-10-02; в бандл не попал (X-13) | ⬜ |

---

## 5. GitHub и внешние сервисы

| Что | pre-prod | prod | Паритет | pre-prod | prod |
|---|---|---|---|---|---|
| Environment + `COMPOSE_FILE` | `staging` → `infra/docker-compose.prod.yml` | `prod` → `infra/docker-compose.prod.yml` | = файл | ⬜ | ⬜ |
| `SITE_URL` | `https://<домен-preprod>` | `http://mymag.magtrans.eu` | ≠ | ⬜ | ⬜ |
| Required reviewers | нет (D-07) | включить | ≠ | ➖ D-07 2026-09-18 | ⬜ |
| Self-hosted runner | метка `staging` (`magg-staging`) | метка `prod` (`magg-prod`) | ≠ | ✅ PP-02 2026-09-18, скриншот | ✅ PP-02 2026-09-18, скриншот (Idle) |
| Deploy key | свой | свой | ≠ | ✅ 2026-09-18: `git pull` работает (CI #224); отдельные deploy keys, со слов, не заводились | ⬜ проверить в инвентаризации prod |
| DNS / vhost | A-запись на OVH | vhost на nginx MAGTRANS | ≠ | ⏳ `mymag.sainet.pl` работает; `mymag.magtrans.com.pl` резолвится в IP пула OVH (вероятно, парковка), домен ещё регистрируется (X-04) | ⬜ |
| TLS | Let's Encrypt в Caddy | nginx MAGTRANS | ≠ | ❓ | ⬜ |
| Gmail: GCP-проект, OAuth-клиент, refresh token | по D-03 | тот же | = | ❓ | ⬜ |
| Google Group `no-reply@` + send-as | по D-03 | та же | = | ❓ | ⬜ |
| SSO-клиент: JS origins | `https://mymag.sainet.pl` + `https://mymag.magtrans.com.pl` (X-04); consent screen Internal | `https://mymag.magtrans.eu` | ≠ | ❌ 2026-09-18: ответ «Internal, оба домена уже добавлены» для текущего клиента (`GOOGLE_OAUTH_CLIENT_ID` из prod-`.env`) **не подтвердился** — `Błąd 400: origin_mismatch` (X-09); вероятно, origins добавлены в старый UAT-клиент | ⬜ |
| Chat space «wyjazdy» webhook | боевой | тот же | = | ❓ | ⬜ |
| Chat ops-space webhook | заведён? | тот же | = | ❓ | ⬜ |
| rclone remote + папка | `gdrive:magguarantee-backups-preprod` (remote `gdrive:` есть, текущая папка — ❓) | `gdrive:magguarantee-backups-prod` | ≠ | ❓ | ⬜ |
| Uptime-монитор | `<домен-preprod>/health` | `mymag.magtrans.eu/health` | ≠ | ⬜ | ⬜ |
| 1Password: `.env`, S3-ключи, пароль админа, deploy key | pre-prod записи | prod записи | ≠ (S3 =) | ⬜ | ⬜ |
| Запрос админам MAGTRANS: A-запись, vhost, IP nginx | — | текст для руководителя подготовлен 2026-09-15 | — | — | ❓ отправлен? |
| BugBot: проект + Access (публичный PEM + `kid`, `issuer` = slug, `reporterRoles`, `adminRoles: ["admin"]`, `handoffUrl`) | ключ X-10, `handoffUrl` `https://mymag.sainet.pl/` (сменится по X-04) | тот же проект и тот же ключ/`kid` (D-08); `handoffUrl` → `https://mymag.magtrans.eu/` в окне переноса (Q-18) | = проект и ключ; ≠ `handoffUrl` | ✅ со слов 2026-10-02: «Да: публичный PEM + тот же kid, роли и handoffUrl заданы» (значения не присланы; работу покажет X-13) | ⬜ |

---

## 6. Перенос (Фаза 11–12)

> **2026-10-30, Q-21 (исправлено тем же днём):** **переноса не было.** Первый ответ
> «Перенос по docs/26 (C-xx), Komodo-стек prod» дан по путанице и отменён ответами
> пользователя: «мой staging просто стал продом, из за того что серва нормального я не
> получил с фулл конфигурацией. Я просто дропнул базу staging и сделал ее заново для
> прода» и «staging и есть продовским серваком». Отдельного prod-сервера в работе нет:
> staging-сервер (`vps-29a0acba`, стек Komodo `magguarantee-staging`) с 2026-10-29
> обслуживает боевых пользователей (пересоздание базы — X-20). C-00…C-12 возвращены
> в ⬜: ни один шаг переноса не выполнялся. Будет ли перенос на сервер MAGTRANS
> (F-01 prod) позже — Q-22; до ответа строки остаются ⬜.

| ID | Шаг | Статус | Дата | Подтверждение / доказательство |
|---|---|---|---|---|
| C-00 | Гейт переноса | ⬜ | | Переноса не было (Q-21, 2026-10-30); гейт не оценивался. Запись «⚠️ 2026-10-29 (со слов)» от 2026-10-30 отменена — основана на ответе, данном по путанице. Нужен ли перенос вообще — Q-22 |
| C-01 | Предупредить пользователей | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-02 | Остановить запись, очередь пуста, снимок счётчиков | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-03 | Финальный бэкап + sha256 | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-04 | Перенос файлов, суммы совпали | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-05 | Вложения на prod | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-06 | База на prod | ⬜ | | не выполнялся — переноса не было (2026-10-30). Пересоздание базы на **staging**-сервере 2026-10-29 — это X-20, не C-06 |
| C-07 | Стек prod целиком | ⬜ | | не выполнялся — переноса не было (2026-10-30); prod-стека Komodo нет, работает `magguarantee-staging` (X-14) |
| C-08 | Сверка счётчиков и файлов MinIO | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-09 | Приёмка на prod | ⬜ | | не выполнялся — переноса не было (2026-10-30) |
| C-10 | Редирект 302 со старого адреса | ⬜ | | не выполнялся — переноса не было (2026-10-30); D-06 не решён |
| C-11 | Погасить pre-prod, таймер выключен | ⬜ | | не выполнялся — и **не выполнять**: staging-сервер обслуживает боевых пользователей, его бэкап-таймер — боевой бэкап (2026-10-30) |
| C-12 | Монитор, reconcile → enforce | ⬜ | | не выполнялся — переноса не было (2026-10-30). Монитор и `DIRECTORY_RECONCILE_MODE` боевого сервера — PP-21 и §4 |
| C-13 | Зачистка pre-prod (≥ 2 недели) | ⬜ | | не применимо, пока staging-сервер — prod; только после переноса (Q-22) |

---

## 7. Внеплановые действия

Всё, чего нет в docs/26: правки на серверах, в GitHub, в Google, в DNS.

| ID | Дата | Где | Что сделано | Подтверждение | Как на prod | prod |
|---|---|---|---|---|---|---|
| X-01 | обнаружено 2026-09-18 (PP-01) | 🖥 `/opt/caddy` | Серверный Caddy правили мимо git: `Caddyfile` — общий для нескольких приложений (сайт `mymag.sainet.pl` + маршрут `/tg/*` → `bilets-tracker:8080` внутри него, сайт `magspace.sainet.pl`), нет health-probe-блока из репо; `docker-compose.yml` без `UPSTREAM_PROXY_CIDRS`. Копировать репо-файл поверх нельзя — снесёт MAGSpace и bilets-tracker. Как привести к репо — Q-12 | ✅ 2026-09-18 устранено в PP-12 (import фрагмента, compose = репо, `/health` 200). Ранее: факт из вывода PP-01; `/tg/*` → решено убрать (X-03); решение Q-12 (2026-09-18): фрагмент в репо + `import` на сервере, приводится к репо в PP-12 (volume `sites` → пересоздание контейнера caddy, секунды простоя и для `magspace.sainet.pl`) | иначе: prod — если Caddy общий с MAGSpace, prod-фрагмент + `import` + volume `sites`; если только наш — `Caddyfile.prod` целиком (docs/23 §2.2). Решение Q-13 ✅, случай — по инвентаризации prod | ⬜ |
| X-02 | обнаружено 2026-09-18 (PP-01) | 🖥 `/opt/magguarantee/src` | Неотслеживаемый файл `cat` в чекауте (вероятно, ошибочный `>` при выводе). Содержимое неизвестно, может содержать `.env` → если так, считать секреты засвеченными в файле на диске, не в чате. Удаление — после ✅ PP-04 (правило destructive gate) | ⚠️ 2026-09-18: «cat файл удалил это мусор». Удалён до PP-04 (в обход destructive gate), вывод проверки не прислан; секретов в чате не было. `git status` после удаления выводом не подтверждён — проверить первой командой PP-11 | не нужно: артефакт staging-чекаута; на prod `git status` проверяется в инвентаризации (PP-01 на 🏢) | ➖ |
| X-04 | заявлено 2026-09-18, не выполнено | 🌐 DNS · 🖥 `.env`, Caddy · 🐙 `SITE_URL` · 🌐 SSO | Домен pre-prod меняется с `mymag.sainet.pl` на `mymag.magtrans.com.pl` (домен `magtrans.com.pl` регистрируется, A-записи ещё нет). Затронет: `WEB_URL`/`APP_URL`/`NEXT_PUBLIC_API_URL` (последний — build-time → пересборка web), CORS (= `WEB_URL`), фрагмент `infra/caddy/sites/magguarantee.caddy`, `SITE_URL` Environment `staging`, SSO JS origins, uptime-монитор, D-06, C-10. Если A-запись есть до PP-06 — строить сразу на новом домене. Первые перевозчики (PP-23) — только на финальном домене (Q-14) | ⬜ со слов: «сейчас регестрируется домен magtrans.com.pl, будет a-dns mymag.magtrans.com.pl вместо моего личного mymag.sainet.pl» | не нужно: prod-домен `mymag.magtrans.eu` не меняется; но D-06/C-10 — редирект с обоих pre-prod-доменов | ➖ |
| X-05 | 2026-09-18 | 🌐 Google Chat · 🖥 `.env` | Pre-prod шлёт уведомления о выездах в **тестовый** Chat-space; пользователь сам переключит на рабочий | ⬜ со слов: «google chat пока юзаю тест чат, потом свичну сам на рабочий» | иначе: на prod сразу рабочий space в prod-`.env`; переключение на pre-prod — строкой в §4 | ⬜ |
| X-06 | 2026-09-18 | 🐙 Environment `prod` | 2 старых secrets в Environment `prod` (со слов — «старые еще когда не было ранера»); кандидаты на удаление, без решения ничего не делать | ❓ решение не принято | иначе: это и есть prod — решить удалить/оставить на PP-13 для prod | ⬜ |
| X-07 | 2026-09-18 | 💬 чат · 🖥 bash history | Пароль сид-админа (`SEED_ADMIN_PASSWORD`, PP-11) засвечен в чате вместе со строкой команды; сайт уже публично отвечает (старый блок Caddy проксирует на новые контейнеры). Нужно: войти админом и сменить пароль (сид форсит смену), удалить строку из bash history на сервере | ➖ утечки не было, 2026-09-18: «я просто подставил фейк пароль, он там другой» — в чате был подставной пароль, настоящий в чат не попадал | не нужно: на prod свой сид-пароль (docs/23 Фаза 5); передавать его мимо чата | ➖ |
| X-08 | 2026-09-18 | 🖥 `.env` · 🌐 GCP | Gmail API отвечает `unauthorized_client` (2FA-код не уходит). Вероятно, `GMAIL_OAUTH_REFRESH_TOKEN` выписан не тем OAuth-клиентом, что `GMAIL_OAUTH_CLIENT_ID`/`_SECRET` из prod-`.env` (или в `CLIENT_ID` попал SSO-клиент). Диагностика 2026-09-18 (sha256-префиксы, без значений): в `.env` `GMAIL_OAUTH_CLIENT_ID`/`_SECRET` новые (`2376f4b8`/`9a9a2c64`, из prod-`.env`), а `GMAIL_OAUTH_REFRESH_TOKEN` = как в UAT (`98a1bf1f`). Уточнение пользователя: «я вчера взял его токен, и вставил его в env» — это **токен руководителя**, уже стоявший в UAT. Тест refresh-grant: клиент из `.env` (`2376f4b8`) + токен → `unauthorized_client`; клиент из `.env.uat` (`871b726a`, GCP-проект на аккаунте пользователя) + токен → `scope gmail.send`. Итог: токен руководителя выписан клиентом `871b726a`. Фикс pre-prod (выдан главным агентом): `GMAIL_OAUTH_CLIENT_ID`/`_SECRET` из `.env.uat` в `.env`, тест, `up -d api`, повторить вход. Выбор пары для обоих серверов — Q-15 | ⏳ ждёт фикса | иначе: в prod-`.env` заменить `GMAIL_OAUTH_CLIENT_ID`/`_SECRET` на пару `871b726a` (как pre-prod, Q-15), токен руководителя тот же; тест refresh-grant + тестовое письмо до C-00 | ⬜ |
| X-09 | 2026-09-18 | 🌐 GCP · 🖥 `.env` | Google SSO: `Błąd 400: origin_mismatch` для сотрудников на `mymag.sainet.pl`. В `.env` SSO-клиент из prod-`.env` (sha-префикс `88ce6f60`), в UAT был другой (`bf7104be`); origins, по-видимому, добавлены в старый. Фикс (предложен главным агентом): в GCP у клиента с ID из `.env` добавить origins `https://mymag.sainet.pl` и `https://mymag.magtrans.com.pl` (без пересборки). Альтернатива — вернуть старый клиент: `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` build-time → пересборка web. Обновление 2026-09-18, пользователь: «у меня есть 2 gcp проекта, один под прод второй под стейджинг … я поменял 2 енвы на те же что были под стейджинг, теперь вот опять не заработал только уже логин». ⚠️ `GOOGLE_OAUTH_CLIENT_ID` уже заменён на SSO-клиент staging-проекта, но web собран в PP-11 с prod-клиентом (`NEXT_PUBLIC_*` вшит) → рассинхрон. Фикс (выдан главным агентом): оба ключа = SSO-клиент staging-проекта, `build web`, `up -d api web`. Итог: pre-prod целиком на staging-GCP-проекте (Gmail + SSO) | ⏳ ждёт результата | иначе: SSO-клиент для prod — Q-16; в нём origin `https://mymag.magtrans.eu`; `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` = `GOOGLE_OAUTH_CLIENT_ID` до сборки web; проверить вход Google до C-00 | ⬜ |
| X-10 | 2026-10-02 | 🖥 staging-сервер | BugBot handoff: пара ключей EC P-256 (docs/16 «BugBot handoff» → «Генерация ключей»), свой `kid` | ✅ 2026-10-02: «Пару сгенерил на сервере». Не присланы: `kid` (не секрет, желательно для журнала), где лежат `bugbot-handoff.key`/`.pub` — открыто: не в чекауте ли `/opt/magguarantee/src` (они не в `.gitignore`; покажет `git status`), и они же — источник переноса по D-08. Что пара и `kid` совпадают с BugBot — докажет X-13 | иначе (D-08): на prod переносится **эта же** пара с тем же `kid` — новую не генерировать; канал — Q-19 (не чат); после C-11 файлы ключа и строки `BUGBOT_*` на pre-prod удалить. Отклонение от docs/16 — Doc gaps | ⬜ |
| X-11 | 2026-10-02 | 🖥 `infra/.env` | `BUGBOT_URL`, `BUGBOT_PROJECT_SLUG`, `BUGBOT_HANDOFF_KID`, `BUGBOT_HANDOFF_PRIVATE_KEY` (`<set>`, 1Password → не заведено), `NEXT_PUBLIC_BUGBOT_ENABLED=true` | ⏳ 2026-10-02: «все 5 переменных в infra/.env» — заданы со слов, значения не присланы (для закрытия не обязательны). Не подтверждено: что api после этого стартовал и handoff не 404 — докажет X-13 | иначе (D-08): в prod-`.env` те же 5 значений, включая тот же `BUGBOT_HANDOFF_KID` + ключ, — в окне переноса, канал Q-19; пересборка web на prod; на pre-prod убрать в C-11; запись в 1Password | ⬜ |
| X-12 | 2026-10-02 | 🌐 кабинет BugBot | Projects → Access: публичный PEM + тот же `kid`, `issuer` = slug, `reporterRoles`, `adminRoles: ["admin"]`, `handoffUrl` = `https://mymag.sainet.pl/` (контракт §1.9 п.1, п.3) | ✅ 2026-10-02 со слов: «Да: публичный PEM + тот же kid, роли и handoffUrl заданы». Slug, роли, `handoffUrl` не присланы — для закрытия не обязательны, работу покажет X-13 (кнопка bug у не-админа, idea у админа) | иначе (D-08): тот же проект и тот же ключ — ничего не добавлять и не удалять; в окне переноса только `handoffUrl` → `https://mymag.magtrans.eu/` (Q-18); при смене домена pre-prod (X-04) — `handoffUrl` → `https://mymag.magtrans.com.pl/` | ⬜ |
| X-13 | 2026-10-02 | 🖥 · 💻 git | Выкат фичи: пересборка web (build-arg `NEXT_PUBLIC_BUGBOT_ENABLED`) + перезапуск api; проверка §1.9 п.5 контракта: кнопка открывает форму BugBot под этим пользователем, тот же URL повторно → `replayed` | ⚠️ 2026-10-02 провал: «на pre-prod (staging) после деплоя ничего нет». Причина (главный агент, по git, сервер не проверялся): в `161f519` нет `infra/docker-compose.{staging,prod}.yml` с build-arg → флаг не дошёл до сборки web. Предусловие повтора: коммит + push compose, env-примеров, docs (главный агент) — ⬜ (на 2026-10-02 в `main` по-прежнему `161f519`, коммит ждёт согласия пользователя). Q-17 ✅: деплоили «Actions → Run workflow → staging», до PP-13 → см. PP-14 ⚠️. Порядок повтора: read-only проверка (какой compose поднят, последняя строка `deploy-history.log`) → PP-13 (`COMPOSE_FILE` → `prod.yml`) → push → PP-14 → проверка контракта | повторить: после выката на prod — та же проверка (кнопка, `replayed`) до C-00 | ⬜ |
| X-14 | 2026-10-13 | 🖥 OVH · 🐙 GitHub · Komodo | **Pre-prod переведён с self-hosted раннера на Komodo + reusable workflow `Sainettt/infra`** (план и журнал: Obsidian → `Documentation/Migration to Komodo`). В репо: `infra/docker-compose.prod.yml` — `build:` → `image: ghcr.io/sainettt/magguarantee-{api,web}:${IMAGE_TAG}`, `name: magguarantee`; миграции в CMD образа `api` (`prisma migrate deploy && exec node`), отдельного шага нет; `ci.yml` — только проверки + `workflow_call`, deploy-джоб с раннером удалён; новый `deploy.yml` → шаблоны (`web` собирается под окружение: `NEXT_PUBLIC_API_URL`, `_ALLOW_PAST_DEPARTURE`, `_GOOGLE_OAUTH_CLIENT_ID`, `_BUGBOT_ENABLED` — **переменные** GitHub Environment `staging`, тег `<sha>-staging`); healthcheck `web` → `127.0.0.1` (в свежем `node:20-alpine` `localhost` → `::1`, первый прогон упал на `--wait`); `minio`/`mc` → зеркало в нашем GHCR той же версии (MinIO удалил образы с Docker Hub в 2026-09, Quay без логина не отдаёт). На сервере: стек Komodo `magguarantee-staging` — Run Directory `infra`, File Paths `docker-compose.prod.yml`, Project Name `infra` (= прежнее имя compose-проекта), Environment = `infra/.env` + `IMAGE_TAG=staging`; все контейнеры пересозданы на образах из GHCR, данные на `/opt/magguarantee/data/*` не тронуты. Чекаут `/opt/magguarantee/src` **оставлен**: из него работают бэкап, алерт и фрагмент Caddy. Заменяет PP-13 (переменные `COMPOSE_FILE`/`DEPLOY_PATH`/`SITE_URL` больше не читаются) и PP-14 (пробный выкат — новым workflow). `deploy-history.log` не пишется: история в Komodo → Updates и в Actions | ⚠️ 2026-10-13 (иначе, чем в docs/26): «запушил, задеплоил все четко» — второй прогон Deploy зелёный, стек healthy. Не присланы: `/health`, `/ready` через Caddy. Осталось: Project Name → `magguarantee` (down/up делает Komodo), выключить раннер `magg-staging` | иначе: на prod — Periphery на сервере фирмы (исходящее в tailnet, входящих портов нет), стек `magguarantee-prod` (Project Name — по `docker compose ls` на prod), Environment `prod` в GitHub с prod-значениями `NEXT_PUBLIC_*`, `IMAGE_TAG=prod` в Environment стека, option `prod` в `deploy.yml`; раннер `magg-prod` не нужен; docs/23 переписать под Komodo. Замена MinIO — Q-20 | ⬜ 2026-10-30 (Q-21 исправлен): prod-стека нет — «staging и есть продовским серваком»; боевых пользователей обслуживает `magguarantee-staging`. Запись «❓ Komodo-стек prod» отменена (ответ по путанице). Prod-половина — только если будет перенос на сервер MAGTRANS (Q-22) |
| X-03 | решено 2026-09-18, не выполнено | 🖥 `/opt/caddy/Caddyfile` | Убрать маршрут `/tg/*` → `bilets-tracker:8080` из сайта `mymag.sainet.pl`. Реализуется тем, что репо-фрагмент `infra/caddy/sites/magguarantee.caddy` (Q-12) не содержит `/tg/*`; серверный блок заменяется `import` в PP-12 — отдельной правки нет. Процедура — Doc gaps (docs/26 PP-12) | ✅ 2026-09-18 PP-12: блок `mymag.sainet.pl` заменён на `import`, во фрагменте `/tg/*` нет (решение: «Можно убрать уже сейчас») | не нужно: в `Caddyfile.prod` этого маршрута нет и не будет | ➖ |
| X-20 | 2026-10-29 (со слов, записано 2026-10-30) | 🖥 staging-сервер · Postgres | Staging-сервер переведён в боевую эксплуатацию **мимо журнала**: база staging удалена и создана заново «для прода» (аналог PP-08…PP-11 без бэкап-гейта и без вывода). Причина — полноценного prod-сервера нет. Неизвестно: был ли бэкап перед удалением (последний подтверждённый — PP-04 2026-09-18; данные после него, по журналу, тестовые — PP-23 ⬜), чем удаляли (`DROP DATABASE` / каталог `data/postgres` / Komodo), применены ли все миграции, был ли сид и сменён ли пароль сид-админа, по какому домену работают пользователи (F-02), работает ли после этого бэкап-таймер (покажет X-15). F-15 (объём данных) устарел | ⚠️ 2026-10-30: «мой staging просто стал продом, из за того что серва нормального я не получил с фулл конфигурацией. Я просто дропнул базу staging и сделал ее заново для прода»; «staging и есть продовским серваком». Вывода нет | не нужно: staging-сервер и есть prod (ответ 2026-10-30); при будущем переносе на сервер MAGTRANS (Q-22) база уезжает дампом по C-xx | ➖ |

### 7.1 Релиз «Limity tygodniowe» (план 2026-10-30)

Лимиты км — с месяцев на недели ISO (docs/17 «Доработка (2026-10-29)», docs/12 §«LIMITY KM → WeeklyLimit», «Перенос `monthly_limits` → `weekly_limits`»). Ветка `claude/limits-monthly-to-weekly-54e32d`, этап 5 закоммичен (`2106af1`); в `main` **не слита и не запушена** — факт из git 2026-10-30 (главный агент): `origin/main` = `43e64d7` (коммитов релиза нет), локальный `main` = `90b6293` (один посторонний незапушенный коммит из другой сессии). Решение пользователя 2026-10-30: «Слить и запушить вместе с 90b6293» — главный агент сливает и пушит, SHA сообщит отдельным `record` (X-17 (б)). Команды X-15…X-18 — docs/26 «Режим эксплуатации» → «Релиз «Limity tygodniowe» (журнал: X-15…X-19)» (внесены в `2106af1`, в `main` попадут со слиянием). **Окружение одно** (Q-21, 2026-10-30): staging-сервер — он же prod, на нём боевые пользователи; выкат — Actions → Deploy → Run workflow → `staging`. Прежнее «на prod тот же порядок — «Да»» отменено: отдельного prod нет. В CMD образа `api` при выкате идут две миграции по порядку: `20261029120000_weekly_limits` (создаёт `weekly_limits`, раскладывает `monthly_limits` по неделям, идемпотентно) → `20261030120000_drop_monthly_limits` (`DROP TABLE monthly_limits` — **необратимо**). Следствия: (1) откат образа на прежний SHA без восстановления базы не работает — старый api читает `monthly_limits`; откат релиза = только docs/23 «Откат → 3. Откат данных» из дампа X-15 (destructive gate); (2) первая проверочная SQL читает `monthly_limits`, поэтому её «ожидаемая» половина снимается **до** выката (X-16), а `weekly_rows` — после (X-18); (3) на prod — до первых wniosków (~2026-11-12). Порядок на каждом окружении строгий: X-15 → X-16 → X-17 → X-18 → X-19; X-17 не выдаётся без ✅ X-15 (имена артефактов) и ✅ X-16 (число).

| ID | Дата | Где | Что сделано | Подтверждение | Как на prod | prod |
|---|---|---|---|---|---|---|
| X-15 | план 2026-10-30 | 🖥 staging | Шаг 1/5. Ручной бэкап **непосредственно перед** X-17, тем же способом, что PP-04 (`magguarantee-backup.service`) + имена и sha256 артефактов (команда docs/26 C-03). Доказательство: `postgres dump ok`, `minio archive ok`, `offsite upload ok`, `backup complete`, имена `pg-<ts>.sql.gz` / `minio-<ts>.tar.gz`, суммы. Хранение: локально 7 дней, offsite 30 (скрипт ротирует); отдельной долгой копии не нужно — D-09 ✅. Команды: docs/26 «Релиз «Limity tygodniowe»» п.1 = PP-20 (первая команда) + C-03 (вторая) | ⬜ 2026-10-30: пользователь написал «делаю бэкап X-15», но вывода нет, а выкат (X-17) не готов — ветка не в `main`. Если бэкап уже запущен, вывод прислать для журнала, но для релиза он **не засчитывается**: бэкап повторяется непосредственно перед X-17 (иначе всё, что записано в базу между ними, при откате из дампа потеряется). Выдан повторно 2026-10-30 вместе с X-16 — выполнять только после push (X-17 (б)) и сразу перед Run workflow. Это бэкап боевого сервера (X-20): если прогон не зелёный — релиз не начинать | не нужно: staging-сервер и есть prod (ответ 2026-10-30, Q-21) — его бэкап и есть боевой; прежнее «повторить» отменено. При будущем переносе (Q-22) — C-03 | ➖ |
| X-16 | план 2026-10-30 | 🖥 staging | Шаг 2/5 (read-only), сразу после X-15, до X-17: список строк `monthly_limits` (год, месяц, km/dzień, stawka, km/sobota — для сверки календаря в X-19) и `expected_rows` — «ожидаемая» половина первой проверочной SQL (число недель ISO, чей четверг в месяце со строкой `monthly_limits`). Полный первый запрос неисполним ни до выката (`weekly_limits` ещё нет), ни после (`monthly_limits` уже удалена). Команды: docs/26 «Релиз «Limity tygodniowe»» п.2 (две команды `docker exec magguarantee-postgres psql …`), внесены в `2106af1`; docs/12 разводит снимок до выката и счёт после. Контейнер `magguarantee-postgres` — `container_name` в `infra/docker-compose.prod.yml` | ⬜ выдан 2026-10-30 вместе с X-15 | не нужно: staging-сервер и есть prod (ответ 2026-10-30, Q-21); прежнее «повторить» отменено | ➖ |
| X-17 | план 2026-10-30 | 🐙 Actions · Komodo | Шаг 3/5. Выкат на staging: Actions → Deploy → Run workflow → `staging` (`deploy.yml`; push в `main` сам ничего не выкатывает) → тег `:staging` → Komodo `magguarantee-staging`; миграции — в CMD api. Предусловия: (а) этап 5 закоммичен — ✅ `2106af1` (факт из git, 2026-10-30); (б) ветка слита в `main` и запушена — ⏳ 2026-10-30: решение пользователя «Слить и запушить вместе с 90b6293»; главный агент сливает и пушит. Выполнено, когда `origin/main` содержит `2106af1` и главный агент сообщит запушенный SHA. `90b6293` (посторонний коммит другой сессии) уезжает в этот же выкат; (в) X-15 ✅ и X-16 ✅ — оба ⬜. Выкат идёт сразу на боевых пользователей (Q-21) — откат только из дампа X-15. Доказательство: номер рана + SHA, обе миграции в `_prisma_migrations` с `finished_at` (X-18), `/health` 200 | ⬜ | не нужно: staging-сервер и есть prod (ответ 2026-10-30, Q-21); прежнее «иначе: тот же SHA в `:prod`» отменено. При будущем переносе (Q-22): на новом сервере образ не старше этого SHA — база приедет без `monthly_limits`, старый api на ней не работает | ➖ |
| X-18 | план 2026-10-30 | 🖥 staging | Шаг 4/5 (read-only), сразу после X-17 и **до любых правок лимитов** админом: (а) обе миграции применены; (б) `weekly_rows` = `expected_rows` из X-16; (в) `monthly_limits` больше нет; (г) запрос «`kmPerSaturday > 0` на 2-й/4-й субботе месяца» → 0 строк. (г) осмыслен только до первой правки недель (после неё суббота на любой неделе законна). Команды: docs/26 «Релиз «Limity tygodniowe»» п.4 (три команды), внесены в `2106af1` | ⬜ | не нужно: staging-сервер и есть prod (ответ 2026-10-30, Q-21); прежнее «повторить» отменено | ➖ |
| X-19 | план 2026-10-30 | 🌐 UI staging | Шаг 5/5. Admin открывает `/employee/limits`: календарь «12 месяцев × недели»; по списку из X-16: km/dzień и stawka недели = месяц её **четверга**; km/sobota > 0 только у недель, чья суббота — 1-я/3-я/5-я в своём месяце (значение месяца субботы), у 2-й/4-й — `0`; у месяцев без строки / с `NULL` — пусто (fallback). Скриншот или «совпало» + 2–3 сверенные недели | ⬜ | не нужно: staging-сервер и есть prod (ответ 2026-10-30, Q-21); прежнее «повторить» отменено | ➖ |

---

## 8. Открытые вопросы

| ID | Вопрос | Статус |
|---|---|---|
| Q-01 | Домен staging: в репо (`Caddyfile`, дефолт `SITE_URL` в `ci.yml`) — `vps-29a0acba.vps.ovh.net`, по логу api — `mymag.sainet.pl`. Какой реальный и что правили на сервере мимо git | ✅ 2026-09-18 (PP-01): реальный `mymag.sainet.pl` (F-02); правки мимо git — X-01 |
| Q-02 | Доступны ли Required reviewers на тарифе GitHub для приватного репо | ❓ |
| Q-03 | Как попасть на prod-сервер по SSH, чтобы положить файлы в C-04 | ❓ |
| Q-04 | Когда и как переносится MAGSpace (D-05) | ❓ |
| Q-05 | Откуда «ключи с прода» | ✅ 2026-09-18: prod-`.env` на prod-сервере — «prod сервер есть, там и приложение есть, просто порты не прокинуты на него, он не рабочий, а env там есть» |
| Q-06 | Какие ключи брать из prod-`.env` | ✅ 2026-09-18, «Только общие по дизайну (рекомендую)»: S3, `GMAIL_OAUTH_*`, SSO-клиент, webhooks — из prod-`.env`; `POSTGRES_PASSWORD`/`DATABASE_URL`, `JWT_*` — новые; `WEB_URL`/`APP_URL`/`NEXT_PUBLIC_API_URL`, `TRUST_PROXY_HOPS=1`, `MAGSPACE_INTERNAL_TOKEN` — свои для pre-prod. Отражено в PP-06 и §4 |
| Q-07 | «Группа под alias», «токен от шефа» | ✅ 2026-09-18: «Да, всё в GCP-проекте фирмы» → D-03. Что send-as реально работает, покажет только PP-15 |
| Q-08 | Со слов пользователя (2026-09-18), на prod-сервере уже развёрнуто приложение и есть `.env`, порты не проброшены; «деплой на прод с другими ключами, все что нужно было автогенерить … на проде отличается от staging». Выводом не подтверждено: F-03…F-18 (prod) и prod-колонки §4/§5 остаются ❓/⬜ до инвентаризации prod (PP-01 на 🏢). Кто и по какой процедуре его ставил (docs/23? с какого SHA? есть ли данные/сид?) | ❓ |
| Q-09 | D-04: запускался ли MinIO на prod с текущими `S3_*` из prod-`.env`, и не менялись ли ключи после первого запуска | ✅ 2026-09-18: «деплой на прод с другими ключами … ключи не менялись ни на staging ни на проде» → prod-MinIO инициализирован текущими prod-`S3_*`; pre-prod берёт их же (D-04). Со слов, выводом не проверено — перепроверить при инвентаризации prod |
| Q-10 | Почему на staging из стека MAGGuarantee работает только postgres (api/web/redis/minio/mailhog не в `docker ps`), это остановлено намеренно? Для PP-04 не мешает: скрипт бэкапа требует только работающий postgres и каталог MinIO | ✅ 2026-09-18: «Да, останавливал сам». PP-08 всё равно выполняется (`down` уберёт остановленные контейнеры и сеть) |
| Q-11 | В `deploy-history.log` нет ни одной строки `status=ok` (или файла нет) — выкаты через Actions на staging не проходили? Влияет на PP-14 и F-04 | ✅ 2026-09-18: «Последний cicd падает из за caddy»; CI #224 (f3d982d) deploy ❌ — `https://vps-29a0acba.vps.ovh.net/health` → `000`, TLS alert: `SITE_URL` не задан (дефолт), и в серверном Caddyfile нет health-probe. Чинится PP-12 + PP-13. Побочно: деплой-джоб до проверки поднимает стек staging-компоузом → после ре-рана UAT-стек, вероятно, снова запущен на f3d982d (выводом не подтверждено) |
| Q-12 | Общий `/opt/caddy/Caddyfile` (X-01): как совместить с правилом «серверный конфиг = репо»? Предложение (для docs/26 PP-12): в репо только блок сайта MAGGuarantee, серверный файл его импортирует; блоки `magspace.sainet.pl` и `/tg/*` живут в своих репо/файлах. Также: `/tg/*` → `bilets-tracker` висит **на домене MAGGuarantee** — что это и нужно ли на prod | ✅ 2026-09-18. `/tg/*`: «Можно убрать уже сейчас» → X-03. Структура: «Фрагмент в репо + import на сервере (рекомендую)» — в репо `infra/caddy/sites/magguarantee.caddy` (сайт `mymag.sainet.pl`, health-probe, без `/tg/*`), в caddy-compose volume каталога `sites` в контейнер, серверный `/opt/caddy/Caddyfile` делает `import` вместо своего блока; MAGSpace — своим фрагментом. Репо-правка должна попасть в `main` **до PP-11**. Как на prod — Q-13 |
| Q-14 | X-04: пускать первых перевозчиков (PP-23) только на `mymag.magtrans.com.pl`, чтобы ссылки в письмах и адрес для перевозчиков не менялись? D-06 теперь про два старых домена (`mymag.sainet.pl`, `mymag.magtrans.com.pl`) | ✅ 2026-09-18: «Да, только на новом домене» → PP-23 не выдаётся, пока X-04 не выполнен (новый домен в `.env`, Caddy, `SITE_URL`, SSO, `/health` 200); подготовка до PP-14 — на `mymag.sainet.pl`, если A-записи ещё нет. D-06 — открыт |
| Q-15 | X-08 / D-03: какая тройка Gmail на обоих серверах? (A) клиент `871b726a` (GCP-проект на аккаунте пользователя) + его secret + токен руководителя — работает сейчас, но почта зависит от личного проекта; (B) руководитель перевыпускает токен через клиент `2376f4b8` (`npm run gmail:token`, docs/23 §1.3), новая тройка — на оба сервера | ✅ 2026-09-18: «Мой старый клиент + токен шефа» → (A). Долг: клиент в личном проекте (D-03) |
| Q-16 | GCP на prod (со слов 2026-09-18: два проекта — «prod» и «staging»; pre-prod теперь целиком на staging-проекте). SSO на prod — клиент prod-проекта (свой, origin `mymag.magtrans.eu`) или тот же staging-клиент? Gmail — Q-15 выбрал (A) «старый клиент + токен шефа» на обоих; подтвердить или перевыпустить токен через prod-проект. Решение — до C-00 | ❓ |
| Q-17 | Как сделан деплой 2026-10-02 (X-13): Actions → Run workflow → `staging` или вручную на сервере, каким compose-файлом? По F-18 `COMPOSE_FILE` Environment `staging` → staging-compose (со слов), PP-13 не выполнен → выкат через Actions поднял бы `docker-compose.staging.yml` (+ mailhog) вместо `prod.yml` (F-03, D-01) и записал бы строку в `deploy-history.log` (F-04) | ✅ 2026-10-02: «Actions → Run workflow → staging». Номер рана и строка `target=… compose=…` не присланы — какой compose реально поднят, проверяет read-only вывод (PP-14 ⚠️) |
| Q-18 | D-08 / X-12: на prod в кабинете BugBot в окне переноса переключить `handoffUrl` → `https://mymag.magtrans.eu/` (ключ и `kid` не трогать)? Пользователь в D-08 про `handoffUrl` не сказал | ❓ |
| Q-19 | D-08: как приватный ключ BugBot попадёт на prod-сервер — запись в 1Password (заодно закрывает часть PP-07) или копирование строк `.env` между серверами в окне переноса? Не через чат | ❓ |
| Q-20 | X-14: MinIO удалил community-образы с Docker Hub (2026-09), Quay без логина не отдаёт, community-ветка не поддерживается с 2025-10. Сейчас оба сервера будут тянуть `ghcr.io/sainettt/minio:RELEASE.2025-09-07T16-13-09Z` и `ghcr.io/sainettt/mc:2026-10-13` — зеркало из кэша OVH, обновлений не будет. Чем заменить до прода: сборка Chainguard (`cgr.dev/chainguard/minio`, другой uid → `chown` данных), Garage, или внешний S3 (R2/Hetzner — compose это предусматривает: `S3_*` + убрать `minio`/`minio-init`)? Данные MinIO при любом варианте мигрируют вместе с бэкапом | ❓ |
| Q-13 | На prod: тот же подход (фрагмент + `import`, если prod-Caddy общий с MAGSpace) или `Caddyfile.prod` целиком, как в docs/23 §2.2? | ✅ 2026-09-18: «Да» — по факту инвентаризации prod: Caddy общий с MAGSpace → prod-фрагмент в репо + `import` + volume `sites`; Caddy только наш → `Caddyfile.prod` целиком (docs/23 §2.2). Какой случай — определит PP-01 на 🏢 |
| Q-21 | «Prod запущен 2026-10-29» (со слов главного агента) — в журнале этого нет: C-00…C-13 ⬜, X-14 prod ⬜, PP-19/PP-20 prod ⬜, F-03…F-18 prod ❓; в `deploy.yml` окружения `prod` нет (`options: [staging]`). Нужно до prod-половины X-15…X-19: как поднят prod (перенос по docs/26 C-xx или чистый старт; Komodo-стек `magguarantee-prod`?), как выкатывать в `:prod`, есть ли на prod `magguarantee-backup.service`/таймер и offsite-папка, имя контейнера Postgres (`magguarantee-postgres`?), роль staging-сервера сейчас (pre-prod с живыми данными или снова тест-стенд). Пропущенные C-xx/PP-xx prod заносятся по ответу, задним числом — только с подтверждением | ✅ 2026-10-30. Отдельного prod нет: «я запутался, о чем речь, мой staging просто стал продом, из за того что серва нормального я не получил с фулл конфигурацией. Я просто дропнул базу staging и сделал ее заново для прода»; на вопрос о бэкапе prod — «staging и есть продовским серваком»; о выкате в `:prod` — «та кже ничего не понял». Первый ответ («Перенос по docs/26 (C-xx), Komodo-стек prod») дан по путанице и **отменён**: §6 возвращён в ⬜, X-14 prod ⬜, X-20 заведён. Итог по пунктам: (1) выкат — только `staging`, `:prod` не нужен; (2) бэкап боевого сервера = `magguarantee-backup.service` staging-сервера, offsite `gdrive:magguarantee-backups` (F-14); (3) staging — боевой; (4) `magguarantee-postgres`. Остаток — Q-22 |
| Q-22 | Перенос на сервер MAGTRANS (F-01 prod, `172.22.104.110`, «серва нормального я не получил с фулл конфигурацией») ещё планируется, или staging-сервер остаётся prod насовсем? От ответа зависят: C-00…C-13 (⬜ или ➖), prod-колонки §3/§4/§5 и X-01…X-14 (долг или ➖), D-05, D-06, Q-16, Q-18, Q-19, а также что на staging-сервере становится обязательным для боевого режима (PP-07, PP-19…PP-21, домен X-04) | ❓ задан 2026-10-30 |

---

## 9. История журнала

| Дата | Что |
|---|---|
| 2026-09-15 | Журнал создан, шаги по docs/26 заведены, всё в ⬜ / ❓ |
| 2026-09-18 | `next`: пользователь предлагает взять секреты «с прода» вместо свежих (отклонение от PP-06) — заведены Q-05…Q-07, решения D-01…D-04 запрошены, статусы шагов не менялись |
| 2026-09-18 | `record`: D-01…D-04 ✅; Q-05…Q-07 закрыты; PP-03 ⏳; PP-06 и §4 — план ⚠️ (общие ключи из prod-`.env`); заведены Q-08 (prod-сервер с приложением — со слов пользователя), Q-09 (инициализация prod-MinIO) |
| 2026-09-18 | `record` PP-01: вывод получен → F-01…F-15 (pre-prod); PP-01 ⏳ (X-02); Q-01, Q-09 закрыты; заведены X-01 (общий Caddyfile), X-02 (файл `cat`), Q-10…Q-12 |
| 2026-09-18 | `record`: Q-10 закрыт (стек остановлен намеренно); X-02 — ждём вывод read-only проверки; `/tg/*` решено убрать → X-03 (вместе с правкой Caddy в PP-12); Q-12 частично |
| 2026-09-18 | `record`: Q-12 ✅ (фрагмент в репо + `import`); PP-12, X-01, X-03 — план обновлён; заведён Q-13 (схема Caddy на prod); предусловие «репо-правка Caddy в `main` до PP-11» |
| 2026-09-18 | `record`: Q-13 ✅ («Да»: схема Caddy на prod — по инвентаризации prod); X-01 «Как на prod» уточнён |
| 2026-09-18 | `record`: X-02 ⚠️ (файл `cat` удалён пользователем до PP-04, «мусор»); PP-01 ✅ |
| 2026-09-18 | `adhoc`: X-04 (смена домена pre-prod на `mymag.magtrans.com.pl`, не выполнено), Q-14 |
| 2026-09-18 | `record`: Q-14 ✅ — PP-23 только после X-04 |
| 2026-09-18 | `record` PP-02: ⏳ (нет deploy keys, GCP-деталей, DNS); F-13, F-18 из скриншотов; раздел 5 runner ✅/✅; Q-11 ✅ (CI падает на `/health`); X-05 (тестовый Chat), X-06 (старые secrets `prod`) |
| 2026-09-18 | `record`: SSO origins pre-prod ✅ (оба домена, consent Internal); PP-02 ⏳ — остались deploy keys, DNS |
| 2026-09-18 | `record`: PP-04 ✅ (pg/minio-2026-09-18-1346); PP-02 ✅; F-14, раздел 5 (deploy key, DNS) обновлены |
| 2026-09-18 | `record`: PP-05 ✅ (выписывать нечего); выдан PP-06; §4 `DIRECTORY_RECONCILE_MODE` — `report` до PP-18 |
| 2026-09-18 | `record`: PP-06 ⚠️ (сделан, пре-флайт пустой; общие ключи из prod-`.env` по Q-06); выдан PP-07 |
| 2026-09-18 | `record`: PP-07 ⏳ отложено («Пока пропустить»); репо-правка Caddy в `main` — `e3612ce` (коммит главного агента) → предусловие PP-11/PP-12 выполнено; выдан PP-08 |
| 2026-09-18 | `record`: PP-08 ✅ (down 8/8); выдан PP-09 |
| 2026-09-18 | `record`: PP-09 ✅ (`data.uat-2026-09-18`); выдан PP-10 |
| 2026-09-18 | `record`: PP-10 ✅; выдан PP-11 |
| 2026-09-18 | `record`: PP-11 ⏳ (нет SHA/`git status`); X-07 (пароль сид-админа засвечен); выдан PP-12 |
| 2026-09-18 | `record`: X-07 ➖ — в чате был подставной пароль, утечки не было |
| 2026-09-18 | `record`: PP-11 ✅ (`e3612ce`); PP-12 ✅ (`/health` 200); X-01, X-03 ✅; F-03, F-05, F-06 обновлены; выданы PP-13, PP-14 |
| 2026-09-18 | `record`: D-07 ✅ (без reviewers на `staging`); `.gitignore` для `.env.uat-*`/`.env.new` — коммит главного агента `7bafa2d`, `git status` на сервере проверить после PP-14 |
| 2026-09-18 | `adhoc`: PP-15 ⚠️ провален (`unauthorized_client`) → X-08; §4 `OPS_ALERT_WEBHOOK_URL` пуст на pre-prod |
| 2026-09-18 | `record` X-08: диагноз — refresh token UAT (личный) при клиенте из prod-`.env`; ждёт фикса |
| 2026-09-18 | `record` X-08: уточнено — токен руководителя выписан клиентом `871b726a` (проект на аккаунте пользователя); D-03 → ⚠️; Q-15 (пара A/B) |
| 2026-09-18 | `record`: Q-15 ✅ (A — клиент `871b726a` + токен руководителя на обоих серверах); D-03 уточнён, долг «личный GCP-проект»; X-08 prod — заменить клиент в prod-`.env` |
| 2026-09-18 | `adhoc`: X-09 (SSO `origin_mismatch`); PP-16 ⚠️; §5 SSO origins pre-prod ✅ → ❌ (прошлый ответ относился к другому клиенту) |
| 2026-09-18 | `record` X-09: два GCP-проекта (prod/staging); pre-prod переводится на staging-проект целиком, нужна пересборка web (`NEXT_PUBLIC_*`); Q-16 (GCP на prod) |
| 2026-10-02 | `adhoc`: BugBot handoff — X-10 (ключи), X-11 (`.env`), X-12 (кабинет BugBot) ❓, X-13 (выкат) ⚠️ кнопок нет; D-08 (один/два проекта BugBot), Q-17 (как деплоили); строки в §4 и §5 |
| 2026-10-02 | `record` BugBot: D-08 ✅ решение пользователя — та же пара и `kid` переносятся на prod, с pre-prod убираются (отклонение от docs/16); X-10 ✅, X-12 ✅ (со слов, без значений), X-11 ⏳ (старт api не подтверждён); Q-17 ✅ (Actions → `staging` до PP-13) → PP-14 ⚠️; §4/§5 BugBot обновлены; заведены Q-18 (`handoffUrl` на prod), Q-19 (канал переноса ключа) |
| 2026-10-13 | `adhoc` (запись из Komodo-сессии, не parity-agent): X-14 — pre-prod переведён на Komodo + шаблоны `Sainettt/infra`, раннер больше не используется; PP-13/PP-14 заменены X-14; `minio`/`mc` зазеркалены в GHCR (MinIO ушёл с Docker Hub) → Q-20 (замена MinIO до прода); healthcheck `web` → `127.0.0.1` |
| 2026-10-30 | `adhoc`: план релиза «Limity tygodniowe» — §7.1 X-15…X-19 (бэкап → снимок `monthly_limits` → выкат → SQL-проверки → календарь), все ⬜ на обоих окружениях; заведён Q-21 (prod запущен 2026-10-29 мимо журнала, механизма выката `prod` в `deploy.yml` нет) |
| 2026-10-30 | `record` «Limity tygodniowe»: D-09 ✅ (дамп — штатные 30 дней offsite); «Как на prod» X-15…X-19 подтверждён («Да»); Q-21 ⏳ частично («Перенос по docs/26 (C-xx), Komodo-стек prod») → C-00 ⚠️, C-01…C-12 ❓, X-14 prod ❓; X-16/X-18 — команды теперь в docs/26 (`2106af1`), Doc gap закрыт; X-17 предусловие (а) ✅ `2106af1`, (б) ❌ — ответ «всё в main» не совпал с git (`origin/main` = `43e64d7`); X-15 ⬜ (бэкап — только непосредственно перед X-17). Ни одна X-строка не закрыта |
| 2026-10-30 | `record` (исправление Q-21): отдельного prod нет — «мой staging просто стал продом … дропнул базу staging и сделал ее заново для прода», «staging и есть продовским серваком»; прежний ответ «Перенос по docs/26 (C-xx)» отменён → §6 C-00…C-13 ⬜ (переноса не было), X-14 prod ⬜, Q-21 ✅; заведены X-20 ⚠️ (пересоздание базы staging 2026-10-29 мимо журнала) и Q-22 (будет ли перенос на сервер MAGTRANS); X-15…X-19 prod → ➖ «не нужно: staging-сервер и есть prod»; X-17 (б) ⏳ — решение «Слить и запушить вместе с 90b6293», ждём SHA; D-09 уточнён (одна копия); выданы X-15 + X-16. Ни одна X-строка не закрыта |
