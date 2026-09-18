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
| D-03 | Почта: GCP фирмы / личный проект / SMTP-релей | Gmail API, OAuth-клиент в GCP-проекте фирмы, refresh token ящика руководителя, `From` = группа `no-reply@` (send-as). Значения — из prod-`.env` (Q-06). Работа send-as проверяется в PP-15 | ✅ | 2026-09-18 | «Да, всё в GCP-проекте фирмы» |
| D-04 | S3-ключи MinIO на prod | те же на обоих; источник — **prod-`.env`** (Q-06), pre-prod берёт их оттуда. Prod-MinIO, возможно, уже инициализирован ими — проверить (Q-09) | ✅ | 2026-09-18 | «Да, все три» (D-01/02/04) |
| D-05 | Как prod-MAGSpace получит те же `Employee.id` | рекомендовано: перенос MAGSpace тем же окном | ❓ | | |
| D-06 | Судьба `<домен-preprod>` после переноса | рекомендовано: 302 → prod, потом 301 или освободить | ❓ | | |
| D-07 | Подтверждение выкатов на pre-prod | рекомендовано: Required reviewers на `staging` | ❓ | | |

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
| PP-14 | Пробный выкат через Actions | ⬜ | | | повторить: Run workflow → `prod` | ⬜ |
| PP-15 | Почта: код, `From`, ссылка | ⬜ | | | повторить: логин на prod | ⬜ |
| PP-16 | SSO origins | ⬜ | | | иначе: добавить `https://mymag.magtrans.eu` | ⬜ |
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
| `MAIL_PROVIDER`, `GMAIL_OAUTH_*` | копия из prod-`.env` (D-03: GCP фирмы) | уже в prod-`.env` | = | ⬜ | ⬜ |
| `GMAIL_FROM`, `MAIL_FROM`, `MAIL_LOGO_URL` | шаблон | шаблон | = | ⬜ | ⬜ |
| `MAKSIM_EMAIL` | боевой | боевой | = | ⬜ | ⬜ |
| `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` | боевой space, копия из prod-`.env` | тот же | = | ⬜ | ⬜ |
| `OPS_ALERT_WEBHOOK_URL` | ops-space, копия из prod-`.env` | тот же | = | ⬜ | ⬜ |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | дефолт | дефолт | = | ⬜ | ⬜ |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | копия из prod-`.env` (D-04, Q-06) | **источник**: prod-`.env`; prod-MinIO должен быть инициализирован именно ими (Q-09) | = | ⬜ | ⬜ |
| `GPS_*` | mock | mock | = | ⬜ | ⬜ |
| `ALLOW_PAST_DEPARTURE`, `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` | `false` | `false` | = | ⬜ | ⬜ |
| Кроны (`*_ENABLED` и др.) | не заданы (дефолты) | не заданы | = | ⬜ | ⬜ |
| `GOOGLE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | SSO-клиент, копия из prod-`.env` | тот же клиент | = | ⬜ | ⬜ |
| `SSO_ALLOWED_HD` | `magtrans.eu` | `magtrans.eu` | = | ⬜ | ⬜ |
| `MAGSPACE_API_URL` | `http://magspace-api:3001` | то же | = | ⬜ | ⬜ |
| `MAGSPACE_INTERNAL_TOKEN` | токен MAGSpace этого сервера | токен prod-MAGSpace | ≠ | ⬜ | ⬜ |
| `DIRECTORY_RECONCILE_MODE` | `report` до PP-18 (чьи данные в MAGSpace), затем `enforce` — отличие от docs/26 | `report` первые дни → `enforce` | ≠ временно | ⬜ | ⬜ |

---

## 5. GitHub и внешние сервисы

| Что | pre-prod | prod | Паритет | pre-prod | prod |
|---|---|---|---|---|---|
| Environment + `COMPOSE_FILE` | `staging` → `infra/docker-compose.prod.yml` | `prod` → `infra/docker-compose.prod.yml` | = файл | ⬜ | ⬜ |
| `SITE_URL` | `https://<домен-preprod>` | `http://mymag.magtrans.eu` | ≠ | ⬜ | ⬜ |
| Required reviewers | по D-07 | включить | = | ⬜ | ⬜ |
| Self-hosted runner | метка `staging` (`magg-staging`) | метка `prod` (`magg-prod`) | ≠ | ✅ PP-02 2026-09-18, скриншот | ✅ PP-02 2026-09-18, скриншот (Idle) |
| Deploy key | свой | свой | ≠ | ✅ 2026-09-18: `git pull` работает (CI #224); отдельные deploy keys, со слов, не заводились | ⬜ проверить в инвентаризации prod |
| DNS / vhost | A-запись на OVH | vhost на nginx MAGTRANS | ≠ | ⏳ `mymag.sainet.pl` работает; `mymag.magtrans.com.pl` резолвится в IP пула OVH (вероятно, парковка), домен ещё регистрируется (X-04) | ⬜ |
| TLS | Let's Encrypt в Caddy | nginx MAGTRANS | ≠ | ❓ | ⬜ |
| Gmail: GCP-проект, OAuth-клиент, refresh token | по D-03 | тот же | = | ❓ | ⬜ |
| Google Group `no-reply@` + send-as | по D-03 | та же | = | ❓ | ⬜ |
| SSO-клиент: JS origins | `https://mymag.sainet.pl` + `https://mymag.magtrans.com.pl` (X-04); consent screen Internal | `https://mymag.magtrans.eu` | ≠ | ✅ 2026-09-18: «Internal, оба домена уже добавлены» | ⬜ |
| Chat space «wyjazdy» webhook | боевой | тот же | = | ❓ | ⬜ |
| Chat ops-space webhook | заведён? | тот же | = | ❓ | ⬜ |
| rclone remote + папка | `gdrive:magguarantee-backups-preprod` (remote `gdrive:` есть, текущая папка — ❓) | `gdrive:magguarantee-backups-prod` | ≠ | ❓ | ⬜ |
| Uptime-монитор | `<домен-preprod>/health` | `mymag.magtrans.eu/health` | ≠ | ⬜ | ⬜ |
| 1Password: `.env`, S3-ключи, пароль админа, deploy key | pre-prod записи | prod записи | ≠ (S3 =) | ⬜ | ⬜ |
| Запрос админам MAGTRANS: A-запись, vhost, IP nginx | — | текст для руководителя подготовлен 2026-09-15 | — | — | ❓ отправлен? |

---

## 6. Перенос (Фаза 11–12)

| ID | Шаг | Статус | Дата | Подтверждение / доказательство |
|---|---|---|---|---|
| C-00 | Гейт переноса | ⬜ | | |
| C-01 | Предупредить пользователей | ⬜ | | |
| C-02 | Остановить запись, очередь пуста, снимок счётчиков | ⬜ | | |
| C-03 | Финальный бэкап + sha256 | ⬜ | | |
| C-04 | Перенос файлов, суммы совпали | ⬜ | | |
| C-05 | Вложения на prod | ⬜ | | |
| C-06 | База на prod | ⬜ | | |
| C-07 | Стек prod целиком | ⬜ | | |
| C-08 | Сверка счётчиков и файлов MinIO | ⬜ | | |
| C-09 | Приёмка на prod | ⬜ | | |
| C-10 | Редирект 302 со старого адреса | ⬜ | | |
| C-11 | Погасить pre-prod, таймер выключен | ⬜ | | |
| C-12 | Монитор, reconcile → enforce | ⬜ | | |
| C-13 | Зачистка pre-prod (≥ 2 недели) | ⬜ | | |

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
| X-03 | решено 2026-09-18, не выполнено | 🖥 `/opt/caddy/Caddyfile` | Убрать маршрут `/tg/*` → `bilets-tracker:8080` из сайта `mymag.sainet.pl`. Реализуется тем, что репо-фрагмент `infra/caddy/sites/magguarantee.caddy` (Q-12) не содержит `/tg/*`; серверный блок заменяется `import` в PP-12 — отдельной правки нет. Процедура — Doc gaps (docs/26 PP-12) | ✅ 2026-09-18 PP-12: блок `mymag.sainet.pl` заменён на `import`, во фрагменте `/tg/*` нет (решение: «Можно убрать уже сейчас») | не нужно: в `Caddyfile.prod` этого маршрута нет и не будет | ➖ |

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
| Q-13 | На prod: тот же подход (фрагмент + `import`, если prod-Caddy общий с MAGSpace) или `Caddyfile.prod` целиком, как в docs/23 §2.2? | ✅ 2026-09-18: «Да» — по факту инвентаризации prod: Caddy общий с MAGSpace → prod-фрагмент в репо + `import` + volume `sites`; Caddy только наш → `Caddyfile.prod` целиком (docs/23 §2.2). Какой случай — определит PP-01 на 🏢 |

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
