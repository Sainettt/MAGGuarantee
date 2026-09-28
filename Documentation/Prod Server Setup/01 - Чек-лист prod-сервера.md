---
tags: [magguarantee, prod, ops, checklist]
updated: 2026-09-28
sources: docs/23, docs/27, infra/README.md
---

# Чек-лист prod-сервера

Назад: [[00 - Обзор]] · Дальше: [[02 - Перенос и эксплуатация]]

Порядок фаз важен: **GCP и домен заводятся первыми** — consent screen и
согласование vhost'а занимают время. Команды — `docs/23` (номер фазы указан
в заголовке раздела).

## 1. До сервера: внешние сервисы (docs/23 Фаза 1)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 1 | Vhost `mymag.magtrans.eu` на nginx MAGTRANS → `172.22.104.110:80` | 🌐 админ MAGTRANS | Обязательные директивы: `client_max_body_size 25M`, `X-Forwarded-For $remote_addr` (не `$proxy_add_…`), `X-Forwarded-Proto https`, `proxy_read_timeout 120s`. Спросить внешний порт и **подсеть** nginx, не один IP | ❓ IP nginx неизвестен (F-16) |
| 2 | GCP: Gmail API, consent screen **Internal + Publish**, OAuth-клиент почты | 🌐 | В статусе Testing refresh token умирает через 7 дней | ⚠️ клиент `871b726a` в личном проекте — долг (Q-15) |
| 3 | Refresh token ящика руководителя | 💻 `npm run gmail:token` | Токен выписывается тем же клиентом, что в `.env`, иначе `unauthorized_client` (X-08) | ✅ |
| 4 | Группа `no-reply@magtrans.eu` + send-as | 🌐 Workspace | В группе только владелец токена, доставка «Без писем». Проверка: `From` в письме = группа | ❓ |
| 5 | SSO-клиент (отдельный, без secret) | 🌐 GCP | JS origin `https://mymag.magtrans.eu` | ❓ Q-16 |
| 6 | Chat webhooks: «wyjazdy» + **отдельный ops-space** | 🌐 Chat | Без ops-space алерты (бэкап, письма, кроны) никому не приходят | ⬜ ops-space нет |

## 2. Базовая подготовка ОС (docs/23 Фаза 2)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 7 | Пользователь `deploy`, SSH только по ключу | 🏢 | `PermitRootLogin prohibit-password`, `PasswordAuthentication no`, `systemctl restart ssh` | ⬜ |
| 8 | `apt install ufw fail2ban chrony rclone unattended-upgrades` | 🏢 | chrony обязателен: при неверном времени ломаются JWT и audit | ⬜ |
| 9 | Swap 2–4 GB | 🏢 | В runbook пункта нет, но `docker-compose.prod.yml` требует swap: Next.js собирается на сервере. На staging swap = 0 | ⬜ |
| 10 | ufw: 22, и 80 только от nginx | 🏢 | Пока IP nginx неизвестен — `ufw allow 80`, сузить после первого запроса | ⬜ |
| 11 | **`DOCKER-USER`** в `/etc/ufw/after.rules` | 🏢 | ufw не фильтрует порты, опубликованные Docker'ом. Только CIDR подсети (при одном IP и его смене сайт ляжет), `--ctdir ORIGINAL`. Готовый блок — `infra/README.md` §«Docker и ufw» | ⬜ |
| 12 | Docker (`get.docker.com`) + `deploy` в группе `docker` | 🏢 | Без группы раннер не соберёт образы | ❓ |
| 13 | Каталоги `/opt/{caddy,magguarantee/{data,backups}}`, владелец deploy | 🏢 | | ❓ |
| 14 | `docker network create proxy-net` и `magtrans-internal` | 🏢 | Без второй деплой падает `network magtrans-internal … could not be found` | ❓ |

## 3. Код и Caddy (docs/23 Фаза 3)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 15 | Свой deploy key (read-only) + `git clone` → `/opt/magguarantee/src` | 🏢🐙 | Отдельный ключ, не тот, что у staging | ⬜ проверить |
| 16 | Исходящий доступ за корпоративным фильтром | 🏢 | 443: `github.com`, `api.github.com`, `*.actions.githubusercontent.com`, `codeload.github.com`, `objects.githubusercontent.com`. 22: `github.com`, либо `ssh.github.com:443` через `~/.ssh/config` | ❓ 443 работает (раннер Idle) |
| 17 | Caddy: `Caddyfile.prod` целиком **или** фрагмент + `import`, если Caddy общий с MAGSpace (Q-13) | 🏢 | Адрес сайта `http://`, ACME выключен (вернуть `https://` нельзя — Caddy перестанет отвечать); Caddy ≥ 2.8; `/health`, `/ready` → api | ⬜ |
| 18 | `UPSTREAM_PROXY_CIDRS=<подсеть nginx>` в `/opt/caddy/.env` → `docker compose up -d` | 🏢 | `caddy reload` env не перечитывает. `0.0.0.0/0` не ставить никогда | ⬜ |

## 4. `infra/.env` (docs/23 Фаза 4)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 19 | Файл из `.env.prod.example`, `chmod 0600` | 🏢 | Со слов prod-`.env` уже есть (Q-08) — сверить набор ключей с шаблоном | ❓ |
| 20 | Свои секреты: Postgres **только hex** (в `POSTGRES_PASSWORD` и в `DATABASE_URL`), два разных JWT | 🏢 | base64 ломает `DATABASE_URL` (P1013) | ❓ |
| 21 | URL-ы = `https://mymag.magtrans.eu`, `TRUST_PROXY_HOPS=2`, оба `ALLOW_PAST_DEPARTURE=false`, боевой `MAKSIM_EMAIL`, абсолютные `*_DATA` | 🏢 | Относительный путь → данные уедут в `src/` и мимо бэкапа | ⬜ |
| 22 | `S3_ACCESS_KEY` / `S3_SECRET_KEY` = как на pre-prod (D-04) | 🏢 | Иначе api не авторизуется в перенесённом MinIO | ❓ со слов, перепроверить |
| 23 | `GMAIL_OAUTH_*` → пара `871b726a` (X-08) | 🏢 | Сейчас в prod-`.env` другой клиент → коды 2FA не уйдут | ⬜ |
| 24 | `GOOGLE_OAUTH_CLIENT_ID` = `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | 🏢 | Второй — build-time: после правки нужен `build web`, рестарт не поможет | ⬜ |
| 25 | `MAGSPACE_INTERNAL_TOKEN` (из `/opt/magspace/.env`), `DIRECTORY_RECONCILE_MODE=report` на старте | 🏢 | `enforce` — через несколько дней без сюрпризов | ⬜ |
| 26 | `OPS_ALERT_WEBHOOK_URL` | 🏢 | Тот же URL, что в `alert.conf` | ❓ |
| 27 | Пре-флайт `docker compose -f infra/docker-compose.prod.yml config --quiet` | 🏢 | Ловит незаполненные обязательные ключи | ⬜ |

## 5. Первый выкат (docs/23 Фаза 5)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 28 | build → `migrate deploy` → `seed.prod.ts` с `SEED_ADMIN_PASSWORD` (один раз) → `up -d` | 🏢 | Порядок важен: миграции вшиваются в образ при сборке. Пароль админа — мимо чата, сразу в 1Password | ⬜ |

## 6. Бэкапы (docs/23 Фаза 6)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 29 | `rclone config` от `deploy` (auth `n`, `rclone authorize` на своей машине) | 🏢💻 | Юнит читает `~deploy/.config/rclone/rclone.conf` | ⬜ |
| 30 | `/opt/magguarantee/backup.conf` (0600): `MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups-prod` | 🏢 | Папка **своя**, не общая с pre-prod. Хранение 7 дней локально / 30 offsite | ⬜ |
| 31 | `/opt/magguarantee/alert.conf` (0600): ops-webhook | 🏢 | Группа `systemd-journal` должна существовать | ⬜ |
| 32 | Юниты → `/etc/systemd/system`, `enable --now magguarantee-backup.timer` | 🏢 | Запуск ежедневно в 03:30 по времени сервера | ⬜ |
| 33 | Ручной прогон бэкапа | 🏢 | Ждём `postgres dump ok` / `minio archive ok` / `offsite upload ok` | ⬜ |
| 34 | `magguarantee-restore-test` | 🏢 | Бэкап, который не восстанавливали, бэкапом не считается | ⬜ |
| 35 | Тест алерта: `systemctl start magguarantee-alert@magguarantee-backup.service.service` | 🏢 | Сообщение пришло в Chat | ⬜ |

## 7. CI/CD и GitHub runner (docs/23 Фаза 7)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 36 | Self-hosted runner: `config.sh --labels prod --unattended --replace`, `svc.sh install deploy` | 🏢🐙 | Метка = имя Environment; без аргумента `deploy` раннер работает от root. Не отвечать на вопросы `config.sh` вручную | ✅ `magg-prod` Idle |
| 37 | Environment `prod`: `COMPOSE_FILE`, `SITE_URL`, `DEPLOY_HISTORY` | 🐙 | `deploy-history.log` доступен `deploy` на запись | ⚠️ задан только `COMPOSE_FILE` (дефолт `SITE_URL` подходит) |
| 38 | **Required reviewers** на `prod` | 🐙 | Право пушить в `main` = право выполнить что угодно на prod | ⬜ Q-02 (тариф) |
| 39 | Удалить старые secrets `DEPLOY_HOST` / `DEPLOY_SSH_KEY` | 🐙 | Остались от ssh-схемы, больше не используются | ⬜ X-06 |
| 40 | Пробный Run workflow → `prod` | 🐙🏢 | В `deploy-history.log` строка `status=ok`. «Waiting for a runner» = не совпала метка | ⬜ |

## 8. Мониторинг (docs/23 «Мониторинг»)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 41 | Внешний монитор (UptimeRobot / Better Stack) на `https://mymag.magtrans.eu/health` | 🌐 | **Не следовать редиректам**, ждать 200 + JSON. Ставить первым — монитор на том же сервере не сообщит о смерти сервера | ⬜ |
| 42 | Uptime Kuma на `127.0.0.1:3001` (панель через SSH-туннель) | 🏢 | Мониторы `/health`, `/ready`, `/` + Push heartbeat 36 ч → `MAGG_HEARTBEAT_URL` в `backup.conf` | ⬜ |

## 9. Приёмка и передача (docs/23 Фазы 8–9)

| # | Шаг | Где | Важно | prod |
|---|---|---|---|---|
| 43 | Чек-лист docs/23 Фаза 8 | 🏢 | `/health` 200 без 307; `client_ip` в логе Caddy = ваш IP; с другой машины сети `:80` по таймауту; 5 контейнеров, mailhog нет, у api/web нет портов; письмо с `From` = no-reply и ссылкой на prod; вложение в `data/minio`; выезд задним числом → 422; блок Google SSO | ⬜ |
| 44 | 1Password: `.env`, `rclone.conf`, приватный deploy key, пароль админа | 💻 | Без `.env` дамп не восстановить — пароль базы вшит в данные Postgres | ⬜ |

> [!note] Ставки и лимиты
> Сид кладёт заглушки (540 км/день, 0.5 EUR/км, 270 км/суббота). На prod
> отдельно их не заводят — реальные значения приедут с дампом pre-prod.
