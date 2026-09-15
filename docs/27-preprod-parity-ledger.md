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
| D-01 | Compose-файл pre-prod | рекомендовано: `docker-compose.prod.yml` | ❓ | | |
| D-02 | Данные: чистый старт / сохранить часть UAT | рекомендовано: чистый старт | ❓ | | |
| D-03 | Почта: GCP фирмы / личный проект / SMTP-релей | рекомендовано: GCP фирмы | ❓ | | |
| D-04 | S3-ключи MinIO на prod | рекомендовано: те же, что pre-prod | ❓ | | |
| D-05 | Как prod-MAGSpace получит те же `Employee.id` | рекомендовано: перенос MAGSpace тем же окном | ❓ | | |
| D-06 | Судьба `<домен-preprod>` после переноса | рекомендовано: 302 → prod, потом 301 или освободить | ❓ | | |
| D-07 | Подтверждение выкатов на pre-prod | рекомендовано: Required reviewers на `staging` | ❓ | | |

---

## 2. Факты о серверах

Заполняется выводом команд пользователя (PP-01, PP-02; для prod — перед C-00).

| ID | Параметр | pre-prod (staging) | prod | Источник, дата |
|---|---|---|---|---|
| F-01 | Хост | ❓ в репо — OVH `vps-29a0acba.vps.ovh.net` | внутренний IP `172.22.104.110`, сеть MAGTRANS | prod — переписка 2026-09-15 |
| F-02 | Домен | ❓ по логу api — `mymag.sainet.pl` | `mymag.magtrans.eu` | лог api 2026-09-15 |
| F-03 | Запущенный compose-файл | ❓ | ❓ | |
| F-04 | SHA последнего `status=ok` | ❓ | ❓ | |
| F-05 | `git status` на сервере чистый | ❓ | ❓ | |
| F-06 | `/opt/caddy/Caddyfile` = репо | ❓ | ❓ (`Caddyfile.prod`) | |
| F-07 | Версия Caddy ≥ 2.8 | ❓ | ❓ | |
| F-08 | RAM / CPU / диск | ❓ | ❓ | |
| F-09 | Пути данных | ❓ | ❓ | |
| F-10 | ufw | ❓ | ❓ (цель: 22 + 80 от nginx) | |
| F-11 | Сети `proxy-net`, `magtrans-internal` | ❓ | ❓ | |
| F-12 | MAGSpace на хосте, чьи данные | ❓ reconcile видит roster 101 (лог 2026-09-15) | ❓ | лог api 2026-09-15 |
| F-13 | Self-hosted runner, метка | ❓ | ❓ | |
| F-14 | Таймер бэкапа / rclone remote | ❓ | ❓ | |
| F-15 | Объём данных (users / carriers / claims) | ❓ | — | |
| F-16 | Внутренний IP nginx MAGTRANS | не нужно (Caddy — край) | ❓ запрошен у админов | |
| F-17 | GCP-проект клиентов почты и SSO | ❓ | ❓ | |
| F-18 | Environment vars в GitHub | ❓ | ❓ | |

---

## 3. Журнал шагов pre-prod

| ID | Шаг (docs/26) | pre-prod | Дата | Подтверждение / доказательство | Как на prod | prod |
|---|---|---|---|---|---|---|
| PP-01 | Инвентаризация сервера | ⬜ | | | повторить: те же команды на prod перед C-00 → F-* | ⬜ |
| PP-02 | Инвентаризация GitHub и внешних сервисов | ⬜ | | | повторить: Environment `prod`, раннер `prod` | ⬜ |
| PP-03 | Решения D-01…D-07 | ⬜ | | | не нужно: решения общие для обоих серверов | ➖ |
| PP-04 | Финальный бэкап UAT | ⬜ | | | не нужно: на prod нет UAT-данных | ➖ |
| PP-05 | Выписать справочники для ручного переноса | ⬜ | | | не нужно: справочники переедут с дампом | ➖ |
| PP-06 | `infra/.env.new` из прод-шаблона | ⬜ | | | иначе: docs/23 Фаза 4, значения по §4 ниже | ⬜ |
| PP-07 | Секреты в 1Password | ⬜ | | | повторить: свои секреты prod; S3-ключи те же (D-04) | ⬜ |
| PP-08 | Остановить UAT-стек | ⬜ | | | не нужно: на prod стек поднимается с нуля | ➖ |
| PP-09 | Отложить каталоги данных | ⬜ | | | не нужно: на prod каталоги новые | ➖ |
| PP-10 | Подложить новый `.env` | ⬜ | | | иначе: docs/23 Фаза 4 | ⬜ |
| PP-11 | Сборка → миграции → сид → запуск | ⬜ | | | иначе: docs/23 Фаза 5 (сид можно — C-06 заменит базу) | ⬜ |
| PP-12 | Caddyfile сервер = репо, `/health` через домен | ⬜ | | | иначе: `Caddyfile.prod` + `UPSTREAM_PROXY_CIDRS` + `DOCKER-USER` (docs/23 §2.2, §3.3) | ⬜ |
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
| `MAIL_PROVIDER`, `GMAIL_OAUTH_*` | по D-03 | те же | = | ⬜ | ⬜ |
| `GMAIL_FROM`, `MAIL_FROM`, `MAIL_LOGO_URL` | шаблон | шаблон | = | ⬜ | ⬜ |
| `MAKSIM_EMAIL` | боевой | боевой | = | ⬜ | ⬜ |
| `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` | боевой space | тот же | = | ⬜ | ⬜ |
| `OPS_ALERT_WEBHOOK_URL` | ops-space | тот же | = | ⬜ | ⬜ |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | дефолт | дефолт | = | ⬜ | ⬜ |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | свежие (PP-06) | **те же** (D-04) | = | ⬜ | ⬜ |
| `GPS_*` | mock | mock | = | ⬜ | ⬜ |
| `ALLOW_PAST_DEPARTURE`, `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` | `false` | `false` | = | ⬜ | ⬜ |
| Кроны (`*_ENABLED` и др.) | не заданы (дефолты) | не заданы | = | ⬜ | ⬜ |
| `GOOGLE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | SSO-клиент | тот же клиент | = | ⬜ | ⬜ |
| `SSO_ALLOWED_HD` | `magtrans.eu` | `magtrans.eu` | = | ⬜ | ⬜ |
| `MAGSPACE_API_URL` | `http://magspace-api:3001` | то же | = | ⬜ | ⬜ |
| `MAGSPACE_INTERNAL_TOKEN` | токен MAGSpace этого сервера | токен prod-MAGSpace | ≠ | ⬜ | ⬜ |
| `DIRECTORY_RECONCILE_MODE` | `enforce` | `report` первые дни → `enforce` | ≠ временно | ⬜ | ⬜ |

---

## 5. GitHub и внешние сервисы

| Что | pre-prod | prod | Паритет | pre-prod | prod |
|---|---|---|---|---|---|
| Environment + `COMPOSE_FILE` | `staging` → `infra/docker-compose.prod.yml` | `prod` → `infra/docker-compose.prod.yml` | = файл | ⬜ | ⬜ |
| `SITE_URL` | `https://<домен-preprod>` | `http://mymag.magtrans.eu` | ≠ | ⬜ | ⬜ |
| Required reviewers | по D-07 | включить | = | ⬜ | ⬜ |
| Self-hosted runner | метка `staging` | метка `prod` | ≠ | ❓ | ⬜ |
| Deploy key | свой | свой | ≠ | ❓ | ⬜ |
| DNS / vhost | A-запись на OVH | vhost на nginx MAGTRANS | ≠ | ❓ | ⬜ |
| TLS | Let's Encrypt в Caddy | nginx MAGTRANS | ≠ | ❓ | ⬜ |
| Gmail: GCP-проект, OAuth-клиент, refresh token | по D-03 | тот же | = | ❓ | ⬜ |
| Google Group `no-reply@` + send-as | по D-03 | та же | = | ❓ | ⬜ |
| SSO-клиент: JS origins | `https://<домен-preprod>` | `https://mymag.magtrans.eu` | ≠ | ❓ | ⬜ |
| Chat space «wyjazdy» webhook | боевой | тот же | = | ❓ | ⬜ |
| Chat ops-space webhook | заведён? | тот же | = | ❓ | ⬜ |
| rclone remote + папка | `gdrive:magguarantee-backups-preprod` | `gdrive:magguarantee-backups-prod` | ≠ | ❓ | ⬜ |
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
| — | | | | | | |

---

## 8. Открытые вопросы

| ID | Вопрос | Статус |
|---|---|---|
| Q-01 | Домен staging: в репо (`Caddyfile`, дефолт `SITE_URL` в `ci.yml`) — `vps-29a0acba.vps.ovh.net`, по логу api — `mymag.sainet.pl`. Какой реальный и что правили на сервере мимо git | ❓ |
| Q-02 | Доступны ли Required reviewers на тарифе GitHub для приватного репо | ❓ |
| Q-03 | Как попасть на prod-сервер по SSH, чтобы положить файлы в C-04 | ❓ |
| Q-04 | Когда и как переносится MAGSpace (D-05) | ❓ |

---

## 9. История журнала

| Дата | Что |
|---|---|
| 2026-09-15 | Журнал создан, шаги по docs/26 заведены, всё в ⬜ / ❓ |
