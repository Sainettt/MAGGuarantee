# 23. Runbook: выкат в прод с нуля

> Пошаговая инструкция для развёртывания MAGGuarantee на новом сервере.
> Проверена репетицией на OVH-стенде 2026-07-28/29. Отличия прода от репетиции
> отмечены значком 🆕.
>
> Концептуальные объяснения — [18-launch-and-deployment.md](18-launch-and-deployment.md).
> Здесь только последовательность действий.

## Что нужно иметь до старта

| Что | Зачем | Статус |
|---|---|---|
| VPS (4 vCPU / 8 GB / Ubuntu 24.04) | сам сервер | 🆕 нет |
| Vhost `mymag.magtrans.eu` на корпоративном nginx | HTTPS, ссылки в письмах | 🆕 нет |
| Google Cloud проект **фирмы** | отправка почты через Gmail API | 🆕 нет |
| Личный ящик руководителя в Workspace | его OAuth-токеном отправляются письма | ✅ есть |
| Google Group `no-reply@magtrans.eu` | адрес в `From`, односторонний канал | 🆕 нет |
| Google-аккаунт для бэкапов | offsite-копии через rclone | ✅ аккаунт есть, rclone владелец проекта уже настраивал; на новом прод-сервере повторить §6.1 |
| Реальные ставки/лимиты MAGTRANS | сид заливает заглушки 540 / 0.5 / 270 | ⚠️ уточнить |

Порядок важен: **GCP и домен заводятся первыми**, потому что consent screen и
DNS-распространение занимают время, а без них сервер поднимать бессмысленно.

---

## Фаза 1. Внешние сервисы (до сервера)

### 1.1 Публикация домена (через корпоративный nginx)

Прод-сервер стоит **внутри сети MAGTRANS**, а не в интернете. Публичный `:443`
занят корпоративным nginx, который уже отдаёт `magtrans.eu`, `eod`, `logikladen`
как имённые vhost'ы. Пробросить `:443` на наш сервер нельзя — он один. Поэтому
`mymag.magtrans.eu` заводится **ещё одним vhost'ом на том же nginx**, а нам он
проксирует трафик внутрь:

```
браузер ──HTTPS──> nginx MAGTRANS ──HTTP──> наш сервер (Caddy) ──> api / web
```

Плюс схемы: снаружи обычный `:443` без порта в адресе, сертификат выпускает и
продлевает nginx — на нашей стороне ACME не нужен вообще.

Что запросить у сетевого администратора (Jakub Klepacz):

1. Vhost `mymag.magtrans.eu` → внутренний IP прод-сервера, порт **80** (HTTP).
   TLS терминирует nginx; шифровать внутренний участок повторно незачем.
2. **На каком внешнем порту** будет доступен vhost. Если не `443`, порт придётся
   вписать в три URL-переменные (§4) — и сделать это **до** сборки web-образа.
3. IP, **с которого** nginx приходит к нам, — для `trusted_proxies` (§3.3) и
   файрвола (§2.2).
4. Обязательные директивы в vhost'е, без них приложение поедет:

```nginx
client_max_body_size 25M;                       # сканы и фото; дефолт 1M мало
proxy_set_header Host              $host;
proxy_set_header X-Forwarded-For   $remote_addr; # НЕ $proxy_add_x_forwarded_for
proxy_set_header X-Forwarded-Proto https;
proxy_read_timeout 120s;                         # экспорт отчётов
```

> `X-Forwarded-For $remote_addr` — не придирка. `$proxy_add_x_forwarded_for`
> **дописывает** к заголовку, присланному клиентом, то есть кто угодно может
> подставить себе чужой IP в наш audit-log и обойти rate-limit. Перезапись
> закрывает это и делает `TRUST_PROXY_HOPS=2` корректным (§4).

DNS-запись `mymag.magtrans.eu` заводит MAGTRANS в своей зоне, на публичный IP
компании. Отдельная A-запись на наш сервер не нужна и не должна существовать.

> Раздельные `app.` + `api.` поддомены в этой схеме тоже возможны, но это два
> vhost'а вместо одного и CORS вместо single-origin. Не усложняем: web и api
> живут на одном origin, Caddy разводит их по пути (`/api/*` → api, остальное →
> web). Так уже работает на стенде, куки проверены именно в этой конфигурации.

### 1.2 Google Cloud проект фирмы

1. Создать проект в аккаунте MAGTRANS (не в личном).
2. Включить **Gmail API**.
3. OAuth consent screen: тип **Internal**, scope
   `https://www.googleapis.com/auth/gmail.send`, статус → **Publish**.
   ⚠️ В статусе Testing refresh token умирает через 7 дней, и через неделю
   после запуска никто не сможет войти.
4. Создать OAuth client ID типа **Web application**, redirect URI
   `http://localhost:53682/oauth2callback`. Записать client_id и client_secret.
5. Определить ящик-отправитель — это **личный ящик руководителя**. Отдельный
   технический пользователь Workspace не заводится.
6. **Для Google SSO сотрудников (docs/24)** — ещё один OAuth client ID, тоже
   типа **Web application**, в том же проекте. Это отдельный клиент, не тот, что
   в п. 4: у почтового клиента redirect URI на localhost, а этому нужны
   **Authorized JavaScript origins** и никаких redirect URI вообще (браузерный
   GIS-flow не обменивает authorization code, поэтому **client secret не нужен**
   и в `.env` не кладётся).

   Origins — каждый хост, с которого отдаётся приложение:
   ```
   https://mymag.magtrans.eu
   http://localhost:3000          # локальная разработка
   ```
   Записать client_id → в `.env` он идёт СРАЗУ В ДВА ключа:
   `GOOGLE_OAUTH_CLIENT_ID` (api сверяет с ним `aud`) и
   `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (запекается в бандл на сборке).

   Consent screen тот же — **Internal**; это и ограничивает вход доменом
   организации, но `hd` всё равно проверяется на бэкенде (`SSO_ALLOWED_HD`).

   Пропустить этот пункт можно: пустые ключи = кнопки Google на `/login` нет,
   вход по паролю + 2FA работает как раньше.

### 1.3 Refresh token для почты

Выполняется **на своей машине**, в `magguarantee-app/apps/api`:

```bash
npm run gmail:token
```

Предварительно выставить в окружении `GMAIL_OAUTH_CLIENT_ID` и
`GMAIL_OAUTH_CLIENT_SECRET` (в PowerShell — `$env:GMAIL_OAUTH_CLIENT_ID="..."`).

Логиниться **ящиком-отправителем**. Полученный refresh token сохранить — он
пойдёт в `.env`.

### 1.4 Google Group `no-reply@magtrans.eu`

Адрес в `From`. Канал односторонний: перевозчики и сотрудники получают письма,
но отвечать на них некому и незачем — все действия в системе. Подробности и
обоснование — [16 §Односторонний канал](16-jobs-and-integrations.md#односторонний-канал--no-reply-google-group).

1. Создать группу `no-reply@magtrans.eu`.
2. Владельцу ящика-отправителя **вступить в группу** (роль Owner). Это
   обязательно: без членства он не получит код подтверждения send-as.
3. Настройки группы: «Кто может публиковать» → **только владельцы и менеджеры**;
   история переписки (архив) → **включена**; модерация сообщений → **выключена**.
4. Gmail ящика-отправителя → Настройки → Аккаунты → «Отправлять письма как» →
   добавить `no-reply@magtrans.eu` → код подтверждения придёт **на группу**
   (прочитать в архиве группы) → подтвердить.
5. После подтверждения выставить владельцу в группе доставку **«Без писем»** —
   членство сохраняется, инбокс остаётся чистым.
6. Проверка: `GMAIL_FROM=no-reply@magtrans.eu`, отправить тестовое письмо и
   убедиться, что в полученном письме `From` — адрес группы, а **не** личный
   адрес руководителя. Если Gmail подменил `From` — send-as не подтверждён,
   вернуться к шагу 4.

> Больше в группе быть никого не должно. Сотрудники получают уведомления на свой
> личный `User.email`, а группа существует только как адрес отправителя плюс
> read-only архив wniosków/решений.

---

## Фаза 2. Подготовка сервера

Всё ниже — на новом VPS, под root или через sudo.

### 2.1 Пользователь deploy

```bash
adduser --disabled-password --gecos "" deploy
```

```bash
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
```

### 2.2 Базовый софт и защита

```bash
apt update && apt upgrade -y && apt install -y ufw fail2ban chrony rclone unattended-upgrades
```

```bash
ufw allow 22 && ufw allow from <IP_NGINX> to any port 80 && ufw --force enable
```

🆕 Сервер внутри корпоративной сети, поэтому `:80` открывается **только для
nginx'а**, а не для всех — иначе к приложению можно ходить напрямую в обход
vhost'а, и тогда `X-Forwarded-For` подставляет сам клиент. Публичный `:443`
здесь не слушается вообще: TLS терминирует nginx (§1.1).

Пока IP не известен, поставить `ufw allow 80` и сузить сразу после первого
успешного запроса — адрес виден в access-логе Caddy (`docker compose logs caddy`,
поле `remote_ip`) или в `tcpdump` (§3.3).

⚠️ **ufw не фильтрует порты, опубликованные Docker'ом.** Caddy публикует `80:80`
через Docker, и такой трафик идёт через цепочку `FORWARD` в обход правил ufw в
`INPUT`. Правило выше само по себе **не закрывает** `:80` от остальной сети.
Ограничение источника делается в цепочке `DOCKER-USER` через
`/etc/ufw/after.rules` — готовый блок и проверка в
[`infra/README.md` §«Docker и ufw»](../infra/README.md). Без него любой хост
корпоративной сети ходит на приложение мимо nginx.

`chrony` обязателен — на кривом времени ломаются JWT и audit-лог.

Отключить вход root'ом по паролю: в `/etc/ssh/sshd_config` выставить
`PermitRootLogin prohibit-password` и `PasswordAuthentication no`, затем
`systemctl restart ssh`.

### 2.3 Docker

```bash
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy
```

### 2.4 Каталоги и общая сеть

```bash
mkdir -p /opt/{caddy,magguarantee/{data,backups}} && chown -R deploy:deploy /opt/magguarantee /opt/caddy
```

```bash
docker network create proxy-net
docker network create magtrans-internal
```

`proxy-net` — общая сеть, через которую Caddy видит контейнеры приложения.

`magtrans-internal` — общая сеть **с MAGSpace**, по ней `magguarantee-api`
читает справочник сотрудников на `http://magspace-api:3001/internal/v1`
(docs/24). Специально НЕ `proxy-net`: та существует для Caddy, а маршруты
`/internal/*` наружу не публикуются. MAGSpace входит в неё из своего
compose-оверлея; CI её не создаёт, поэтому если забыть — деплой упадёт с
`network magtrans-internal declared as external, but could not be found`.

Обе создаются один раз на сервер.

Дальше всё выполняется **от пользователя `deploy`**, не от root.

---

## Фаза 3. Код на сервере

### 3.1 Deploy key

На сервере под `deploy`:

```bash
ssh-keygen -t ed25519 -C "magguarantee-prod-deploy" -f ~/.ssh/id_ed25519 -N ""
```

```bash
cat ~/.ssh/id_ed25519.pub
```

Публичную часть добавить в GitHub → репозиторий → Settings → Deploy keys →
Add deploy key (**без** write access). Это отдельный ключ, не тот, что у
staging.

### 3.2 Клонирование

```bash
git clone git@github.com:Sainettt/MAGGuarantee.git /opt/magguarantee/src
```

### 3.3 Caddy

```bash
cp -r /opt/magguarantee/src/infra/caddy/* /opt/caddy/ && cp /opt/magguarantee/src/infra/caddy/.env.example /opt/caddy/.env
```

`*` не копирует dotfile'ы, поэтому `.env` — отдельной командой.

🆕 Прод берёт **не** `Caddyfile` (это конфиг стенда — публичный, со своим
Let's Encrypt), а `Caddyfile.prod`, рассчитанный на работу за корпоративным
nginx:

```bash
cp /opt/caddy/Caddyfile.prod /opt/caddy/Caddyfile
```

```bash
cd /opt/caddy && docker compose up -d
```

Что важно понимать про этот конфиг:

- **Автоматического HTTPS нет и быть не может.** Let's Encrypt валидирует домен
  только через публичные `:80` / `:443`, а оба держит nginx — до нас проверка не
  дойдёт никогда. Сертификат для `mymag.magtrans.eu` выпускает и продлевает
  MAGTRANS. Адрес сайта в конфиге поэтому `http://` — это выключает
  автоматический TLS целиком. Менять обратно на `https://` нельзя: Caddy уйдёт
  выпускать сертификат, не сможет и перестанет отвечать.
- **`trusted_proxies` обязателен.** По умолчанию Caddy перезаписывает входящий
  `X-Forwarded-For` своим значением, затирая настоящий IP клиента, который
  проставил nginx. В `Caddyfile.prod` он уже включён и берёт адрес из переменной
  `UPSTREAM_PROXY_CIDRS` в `/opt/caddy/.env`. Дефолт `127.0.0.1/32` не доверяет
  никому — безопасно, но все пользователи будут с IP nginx'а. `0.0.0.0/0` не
  ставить никогда: это возвращает подделку IP любым клиентом.
- **Hop-математика.** nginx дописывает клиента в `X-Forwarded-For`, доверенный
  Caddy дописывает nginx → api видит `…, <клиент>, <nginx>` от Caddy. Поэтому в
  `infra/.env` `TRUST_PROXY_HOPS=2` (на стенде, где Caddy — край, `1`). nginx
  обязан отправлять `X-Forwarded-For` (§1.1).
- **`/health` и `/ready` уходят в api**, а не в web (до 2026-09-14 они попадали
  в web и редиректили на `/login` — внешний монитор был «зелёным» при мёртвом
  api).
- **Access-лог** — JSON в stdout контейнера (`docker compose logs caddy`), поле
  `client_ip` — реальный клиент. Query string и Referer вырезаются, пробы
  `/health` / `/ready` не логируются. Нужен Caddy ≥ 2.8.

🆕 Узнать этот адрес: спросить у сетевого администратора либо снять с провода на
самом сервере —

```bash
sudo tcpdump -n -i any 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0'
```

и один раз открыть `https://mymag.magtrans.eu`. Source IP пакета SYN — искомое
значение. Дальше вписать его в `/opt/caddy/.env` как
`UPSTREAM_PROXY_CIDRS=<IP_NGINX>/32`, закрыть `:80` для остальных (§2.2,
`DOCKER-USER`) и пересоздать контейнер — переменные окружения `caddy reload` не
перечитывает:

```bash
cd /opt/caddy && docker compose up -d
```

Проверка: открыть сайт со своей машины — в последней строке
`docker compose logs caddy` поле `client_ip` должно быть **вашим** адресом.

⚠️ **IP nginx'а может смениться** (на 2026-09-14 он не известен и не
зафиксирован). Поэтому у сетевого администратора просить **подсеть**, из которой
ходят reverse-proxy MAGTRANS, и вписывать CIDR (`10.x.y.0/24`), а не один адрес.
Последствия смены адреса без правки конфига разные:

- `UPSTREAM_PROXY_CIDRS` устарел → сайт **работает**, но у всех пользователей
  снова IP nginx'а: общий rate-limit, неверный IP в audit. Заметно по
  `client_ip` в логе Caddy и по пачке 429.
- правило `DOCKER-USER` с одним IP устарело → **сайт недоступен** (DROP всего
  трафика от нового адреса). Поэтому в `DOCKER-USER` — только CIDR подсети, а
  если подсеть неизвестна, правило пока не ставить и компенсировать тем, что
  сервер во внутренней сети за NAT.

> До того как `UPSTREAM_PROXY_CIDRS` задан, приложение работает, но в audit-логе,
> security-WARN'ах auth и rate-limiter'е у всех запросов будет IP nginx'а. Не
> блокирует запуск — блокирует сдачу: общий rate-limit на всех пользователей
> (5 логинов в минуту на всю фирму, 60 refresh в минуту — выкидывание на
> `/login` при нагрузке).

---

## Фаза 4. Переменные окружения

```bash
cd /opt/magguarantee/src && cp infra/.env.prod.example infra/.env && chmod 0600 infra/.env
```

Заполнить. Секреты генерировать **новые**, ничего не копировать со стенда.

### Пароль Postgres — только hex

```bash
openssl rand -hex 32
```

⚠️ Не `base64`. Символы `/`, `+`, `@` ломают разбор `DATABASE_URL`, и Prisma
падает с `P1013: invalid port number`. Одно и то же значение вставить в
**оба** места: `POSTGRES_PASSWORD` и внутрь `DATABASE_URL` вместо
`REPLACE_WITH_POSTGRES_PASSWORD`.

### Остальные секреты

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
```

```bash
openssl rand -base64 48   # JWT_REFRESH_SECRET — выполнить второй раз, значение другое
```

```bash
openssl rand -hex 24      # S3_SECRET_KEY
```

### Что проверить перед запуском

| Ключ | Значение |
|---|---|
| `WEB_URL`, `APP_URL`, `NEXT_PUBLIC_API_URL` | `https://mymag.magtrans.eu` — адрес, как его видит **браузер** (vhost на nginx). Если MAGTRANS опубликует не на `443`, порт входит сюда: `https://mymag.magtrans.eu:8443` |
| `TRUST_PROXY_HOPS` | `2` — nginx + Caddy. На стенде `1`. Разбор последствий ошибки — §1.1 и `config/env.schema.ts` |
| `API_URL` | `http://magguarantee-api:3001` — **не менять**, это адрес внутри Docker |
| `MAIL_PROVIDER` | `gmail` |
| `GMAIL_OAUTH_*`, `GMAIL_FROM` | из Фазы 1.3 |
| `MAKSIM_EMAIL` | 🆕 **боевой адрес директора** |
| `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` | 🆕 incoming-webhook боевого Chat-space «wyjazdy». Берётся в самом space: **Apps & integrations → Webhooks → Add webhooks** (нужен Google Workspace). Пусто ⇒ уведомлений о выездах внутри компании не будет (api при этом стартует нормально) |
| `ALLOW_PAST_DEPARTURE`, `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` | оба `false` |
| `GOOGLE_OAUTH_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | 🆕 **одинаковое значение** — client_id из Фазы 1.2 п. 6. Пусто ⇒ Google-вход выключен, пароль + 2FA работают. Второй ключ — build-arg: после его изменения нужен `docker compose build web`, рестарт не поможет |
| `MAGSPACE_INTERNAL_TOKEN` | 🆕 тот же токен, что в `/opt/magspace/.env`. ≥32 символов, `openssl rand -base64 48`. Пусто ⇒ справочник выключен: reconcile не планируется, Google-вход отвечает 503 |
| `MAGSPACE_API_URL` | 🆕 `http://magspace-api:3001` — **не менять**, адрес внутри сети `magtrans-internal` |
| `DIRECTORY_RECONCILE_MODE` | 🆕 `enforce`. На первые дни можно поставить `report` — тогда крон только шлёт админам «что бы я сделал», никого не отключая |
| `POSTGRES_DATA`, `REDIS_DATA`, `MINIO_DATA` | абсолютные пути `/opt/magguarantee/data/*` |

⚠️ Про пути: guard в compose ловит отсутствие ключа, но относительный путь
пропустит — данные молча уедут внутрь `src/` и не попадут в бэкап.

Пре-флайт, ловит незаполненные обязательные ключи до сборки:

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml config --quiet
```

---

## Фаза 5. Первый выкат

Порядок принципиален: **сборка → миграции → сид → запуск**. Dockerfile вшивает
миграции в образ на этапе сборки, поэтому `migrate deploy` на старом образе
молча отрапортует «нечего применять».

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml build
```

```bash
docker compose -f infra/docker-compose.prod.yml run --rm -T api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma < /dev/null
```

```bash
docker compose -f infra/docker-compose.prod.yml run --rm -T -e SEED_ADMIN_PASSWORD='<надёжный-пароль>' api node_modules/.bin/tsx prisma/seed.prod.ts < /dev/null
```

Сид напечатает счётчики: 10 ключей AppConfig, 6 типов прицепов, 24 строки
лимитов, 1 админ. Это **одноразовый** шаг — при следующих деплоях не повторять.

`SEED_ADMIN_PASSWORD` обязателен (с 2026-09-14 захардкоженного запасного пароля
нет): без него сид останавливается до записи в БД. Нужен и при повторном
запуске, хотя существующего админа сид не трогает.

```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

---

## Фаза 6. Бэкапы

### 6.1 rclone

```bash
rclone config
```

Ответы: `n` → имя `gdrive` → тип `drive` → client_id/secret пустые → scope `1`
→ service_account_file пусто → advanced `n` → **auth `n`**.

Он напечатает `rclone authorize "drive" "..."` — выполнить **на своей машине**,
залогиниться, скопировать строку между `--->` и `<---End paste`, вставить
обратно. Дальше `n` (Shared Drive), `y`, `q`.

```bash
rclone lsd gdrive:
```

### 6.2 Конфиг бэкапа

🆕 Папка отдельная от стенда, иначе архивы двух серверов смешаются:

```bash
sudo cp /opt/magguarantee/src/infra/scripts/backup.conf.example /opt/magguarantee/backup.conf && sudo chmod 0600 /opt/magguarantee/backup.conf
```

В файле раскомментировать и заполнить `MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups-prod`.
Срок хранения — дефолты скрипта: **7 дней локально, 30 дней offsite** (единственный
источник — `infra/scripts/magguarantee-backup`; GFS-ярусы из docs/18 не
реализованы). Без `MAGG_RCLONE_REMOTE` копии лежат на том же диске, что и база.

### 6.2a Алерты о падениях

Юнит бэкапа при ошибке запускает `magguarantee-alert@.service` (`OnFailure=`),
который шлёт в Google Chat имя хоста, юнит и последние 20 строк журнала.

```bash
sudo cp /opt/magguarantee/src/infra/scripts/alert.conf.example /opt/magguarantee/alert.conf && sudo chmod 0600 /opt/magguarantee/alert.conf
```

Вписать `OPS_ALERT_WEBHOOK_URL` — incoming webhook отдельного ops-спейса в
Google Chat. Пустой URL = алерт только пишет warning в журнал.

🆕 На 2026-09-14 отдельного ops-спейса **нет** — URL оставлен пустым и в
`alert.conf`, и в `infra/.env`. Все алерты (провал бэкапа, окончательно
недоставленные письма, падения кронов, Redis) тогда видны **только** в
`journalctl` и `docker compose logs api` — сами по себе никого не разбудят.
Завести спейс и webhook — пять минут; после этого вписать URL в оба файла,
`docker compose up -d api` и проверить тестовым алертом ниже. Юнит работает
от `deploy` с группой `systemd-journal` — она должна существовать на хосте.
Тот же URL указывается в `infra/.env` для api (провалы писем и chat-уведомлений
после всех ретраев).

### 6.3 Таймер

```bash
sudo cp /opt/magguarantee/src/infra/systemd/magguarantee-* /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now magguarantee-backup.timer
```

### 6.4 Проверка — обязательная

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 25 --no-pager
```

Ждём `postgres dump ok`, `minio archive ok`, `offsite upload ok`.

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-test
```

Бэкап, который ни разу не восстанавливали, бэкапом не является.

Проверка алерта (в Chat должно прийти сообщение):

```bash
sudo systemctl start magguarantee-alert@magguarantee-backup.service.service
```

---

## Фаза 7. CI/CD

Деплой выполняет **self-hosted раннер, стоящий на самом сервере**. Он держит
исходящее HTTPS-соединение с GitHub и забирает задачи из очереди — входящих
портов не нужно вообще. Схема выбрана 2026-08-10, когда выяснилось, что боевая
машина стоит за корпоративным NAT и проброс 22 наружу невозможен. Прежний
вариант (облачный раннер + `ssh deploy@$HOST`) удалён из `ci.yml`.

### 7.1 Раннер на сервере

GitHub → репозиторий → **Settings → Actions → Runners → New self-hosted runner
→ Linux / x64**. Страница выдаст команды скачивания с актуальной версией и
одноразовый registration-токен (живёт час).

Скачивание и распаковку выполнить **от `deploy`** дословно со страницы, а вот
`config.sh` запустить со своими флагами, не интерактивно:

```bash
./config.sh --url https://github.com/Sainettt/MAGGuarantee --token <ТОКЕН_ИЗ_UI> --name magg-prod --labels prod --unattended --replace
```

⚠️ Не отвечать на вопросы вручную. Первым `config.sh` спрашивает **runner
group**, а не имя раннера; группы — фича organization/enterprise, у
репозиторного раннера доступна только `Default`, и любой другой ответ валит
регистрацию с «Could not find any self-hosted runner group».

`--labels` обязан совпадать с именем GitHub Environment (`prod` / `staging`) —
по нему workflow находит нужную машину.

```bash
sudo ./svc.sh install deploy
```

```bash
sudo ./svc.sh start && sudo ./svc.sh status
```

Аргумент `deploy` — от кого работать. Без него раннер поедет от root, и всё
содержимое workflow тоже. `deploy` при этом обязан быть в группе `docker`
(сделано в 2.3), иначе сборка образов не пройдёт.

Юнит создаётся с `enable`, после ребута поднимается сам. Проверка:

```bash
systemctl is-active actions.runner.Sainettt-MAGGuarantee.magg-prod
```

Готово, когда в Settings → Actions → Runners раннер в статусе **Idle**.

### 7.2 Environment в GitHub

Settings → Environments → изменить существующий `prod`:

| Тип | Имя | Значение |
|---|---|---|
| Variable | `COMPOSE_FILE` | `infra/docker-compose.prod.yml` |
| Variable | `DEPLOY_PATH` | `/opt/magguarantee/src` (можно не задавать — это дефолт) |
| Variable | `SITE_URL` | метка сайта из Caddyfile, по ней CI проверяет `/health` и `/ready` через Caddy; дефолт `http://mymag.magtrans.eu` |
| Variable | `DEPLOY_HISTORY` | дефолт `/opt/magguarantee/deploy-history.log` |

Каждый выкат дописывает строку `started` / `ok` / `failed` с SHA, предыдущим SHA,
номером run'а и автором в `deploy-history.log`; `magguarantee-rollback` пишет туда
же. Файл должен быть доступен на запись пользователю `deploy`, иначе выкат
остановится ещё до `git pull`. После `up -d` CI проверяет `/health` и `/ready`
**через Caddy** (200 + JSON, без следования редиректам, до 120 с).

Секреты `DEPLOY_HOST` и `DEPLOY_SSH_KEY` больше не используются — если остались
от ssh-схемы, удалить.

Deploy key репозитория (Фаза 3.1) **остаётся** — им ходит `git pull` внутри
выката.

Старый OVH-стенд, если остаётся жить, получает свой раннер с меткой `staging` и
environment `staging` с `infra/docker-compose.staging.yml`.

Настоятельно: на `prod` включить **required reviewers**. Self-hosted раннер
выполняет содержимое workflow от `deploy`, а `deploy` в группе `docker` — то
есть право пушить в `main` равно праву выполнить что угодно на боевом сервере.
Апрув на выкат — единственный барьер в этой цепочке.

### 7.3 Требования к исходящему трафику

Единственное, что нужно раннеру от сети — **исходящий** доступ. За корпоративным
фильтром проверить заранее:

- по 443: `github.com`, `api.github.com`, `*.actions.githubusercontent.com`,
  `codeload.github.com`, `objects.githubusercontent.com`
- по 22: `github.com` — для `git pull`

```bash
ssh -T git@github.com
```

Если исходящий 22 режут, GitHub держит SSH на 443 — лечится одной строкой у
`deploy`:

```bash
printf 'Host github.com\n  Hostname ssh.github.com\n  Port 443\n' >> /home/deploy/.ssh/config
```

### 7.4 Проверка

Actions → CI / CD → Run workflow → `prod`. Первый шаг напечатает выбранное
окружение, compose-файл и путь; при неверных переменных упадёт, не трогая
сервер.

Job висит в очереди с *Waiting for a runner* — не совпала метка раннера с именем
environment.

### 7.5 Снос раннера

Порядок обратный, просто удалить каталог недостаточно — в репе останется висеть
мёртвый offline-раннер:

```bash
sudo ./svc.sh stop && sudo ./svc.sh uninstall
```

```bash
./config.sh remove --token <новый токен со страницы Runners>
```

---

## Фаза 8. Приёмка

Идти сверху вниз, каждый пункт руками:

- [ ] `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' --max-redirs 0 https://mymag.magtrans.eu/health` → `200 application/json…`, то же для `/ready`. Редирект 307 = запрос ушёл в web, а не в api
- [ ] Сертификат валиден (выпущен nginx'ом MAGTRANS), HTTP редиректит на HTTPS
- [ ] В `/opt/caddy/.env` задан `UPSTREAM_PROXY_CIDRS` с реальным IP nginx'а, контейнер пересоздан
- [ ] В логе api при логине с чужой машины виден **её** IP, а не адрес nginx'а —
      проверка, что `TRUST_PROXY_HOPS` и `trusted_proxies` сошлись
- [ ] `sudo iptables -S DOCKER-USER` — DROP для `:80` от всех, кроме nginx; с другой машины сети `curl -m 5 http://<IP_сервера>/health` падает по таймауту
- [ ] `sudo systemctl start magguarantee-alert@magguarantee-backup.service.service` — сообщение пришло в Chat
- [ ] `tail -3 /opt/magguarantee/deploy-history.log` — последний выкат `ok` с правильным SHA
- [ ] `docker ps` — пять контейнеров, mailhog отсутствует, у api и web нет проброшенных портов
- [ ] Монтирования ведут в `/opt/magguarantee/data/*`:
      `docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' magguarantee-postgres magguarantee-minio`
- [ ] В базе один пользователь: `docker compose -f infra/docker-compose.prod.yml exec -T postgres psql -U magguarantee magguarantee -c 'SELECT login, role FROM users;'`
- [ ] **Логин админом проходит**, код приходит на почту — это проверка Gmail API
- [ ] Смена пароля при первом входе срабатывает
- [ ] Ссылка в письме ведёт на боевой домен, а не на localhost
- [ ] Загрузка вложения появляется в `/opt/magguarantee/data/minio/magguarantee`
- [ ] Выезд задним числом **отклоняется** (422) — на стенде этот запрет был выключен
- [ ] `docker compose logs api | head -50` — ошибок на старте нет

**Google SSO** (пропустить целиком, если ключи оставлены пустыми):

- [ ] Справочник виден из сети:
      `docker run --rm --network magtrans-internal curlimages/curl -s -H "Authorization: Bearer $TOKEN" http://magspace-api:3001/internal/v1/health`
      → `{"ok":true}`
- [ ] `/employee/diagnostics` → вкладка «Baza danych»: пилюля MAGSpace зелёная
- [ ] `/employee/sso` под админом: видны **17 stanowisk**, из них 6 сопоставлены
      (`DYSPOZYTOR*`, `PLANISTA*`, `DAF`) — это то, что положил сид
- [ ] Кнопка «Zaloguj przez Google» есть на `/login`. **Если её нет** — образ веба
      собран без `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`; нужен `build web`, не рестарт
- [ ] Вход сотрудником с сопоставленным stanowiskiem проходит и ведёт на лендинг
      его роли; в `/employee/users` строка помечена «MAGSpace», `role`/`active`
      заблокированы
- [ ] Вход **личным** `@gmail.com` → «Zaloguj się kontem @magtrans.eu»
- [ ] Вход админом через Google проходит по **локальной** роли (в логах нет
      обращения к MAGSpace) — это break-glass путь
- [ ] Сотрудник с `CONTROLLING` / `HANDEL_*` получает «stanowisko bez dostępu»,
      админам приходит письмо с его именем, строка видна в «Ostatnie odrzucone
      logowania». Повторная попытка в течение суток письмо не дублирует
- [ ] Через `DIRECTORY_RECONCILE_INTERVAL_MIN` в логах появляется
      `directory reconcile finished`, а на `/employee/sso` — время синхронизации

---

## Фаза 9. Передача

- [ ] `.env` скопирован в 1Password. **Без него дамп не восстановить** — пароль
      от базы вшит в данные Postgres.
- [ ] `rclone.conf` и приватный deploy-ключ — туда же.
- [ ] Ставки и лимиты в БД заменены на реальные цифры MAGTRANS (сид заливает
      заглушки 540 км/день, 0.5 EUR/км, 270 км/суббота, годы 2026–2027).
      Правится админом через UI, миграция не нужна.
- [ ] Пароль первого админа передан по защищённому каналу.
- [ ] Админ завёл сотрудников и перевозчиков через UI. Скриптов-импортёров нет.

---

## Мониторинг

### Внешний — ставить первым

Мониторинг на том же сервере, что и приложение, не сообщит о смерти этого
сервера: умрут оба. Поэтому сначала внешний сервис — UptimeRobot или Better
Stack, бесплатные тарифы, карта не нужна. Один монитор на
`https://mymag.magtrans.eu/health`, уведомления на почту. Пять минут, закрывает
главный риск.

⚠️ Монитор настроить **не следовать редиректам** и ждать именно 200 (в идеале —
кусок JSON-ответа). Если `/health` когда-нибудь снова уйдёт в web, тот ответит
307 на `/login`, а монитор со следованием редиректов получит 200 от страницы
логина и будет «зелёным» при мёртвом api.

> Внешний монитор видит цепочку целиком — nginx и наш сервер. Это плюс: падение
> корпоративного nginx для пользователя неотличимо от падения приложения, и
> знать о нём тоже надо. Минус — по алерту не понять, чья половина легла;
> смотреть в `docker ps` на нашем сервере.

### Uptime Kuma — детали и heartbeat

Отдельный стек `/opt/uptime-kuma/docker-compose.yml`:

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    ports:
      - '127.0.0.1:3001:3001'
```

🆕 Публичного `status.magtrans.eu` не делаем: это потребовало бы ещё одного
vhost'а на корпоративном nginx ради внутренней панели. Kuma публикуется **только
на loopback** хоста: к ней стучится heartbeat бэкапа (он работает на хосте, не в
container-сети), а панель открывается через SSH-туннель:
`ssh -L 3001:127.0.0.1:3001 deploy@<сервер>`.

> Прежний вариант с блоком `:8080` в Caddyfile не работает: Caddy-compose
> публикует только 80/443, и `http://localhost:8080` с хоста недоступен.

> Если панель всё-таки нужна снаружи — попросить у MAGTRANS второй vhost по той
> же схеме, что и основной (§1.1). Тогда Kuma закрыть логином, она умеет.

```bash
cd /opt/uptime-kuma && docker compose up -d
```

Открыть в браузере, создать админа, добавить мониторы:

| Тип | Цель | Что ловит |
|---|---|---|
| HTTP | `https://mymag.magtrans.eu/health` | api жив |
| HTTP | `https://mymag.magtrans.eu/ready` | база и Redis доступны |
| HTTP | `https://mymag.magtrans.eu/` | web отдаёт страницы |
| Push | heartbeat, интервал 36 часов | **бэкап перестал ходить** |

Push-монитор работает наоборот: Kuma ждёт, что к нему постучатся. Его URL идёт
в `backup.conf`:

```bash
echo 'MAGG_HEARTBEAT_URL=http://127.0.0.1:3001/api/push/xxxxx' | sudo tee -a /opt/magguarantee/backup.conf
```

Скрипт дёргает его только при полном успехе. Не пришёл стук за 36 часов —
приходит тревога. Heartbeat и `OnFailure`-алерт (§6.2a) дополняют друг друга:
алерт ловит «запустился и упал», heartbeat — «таймер вообще перестал
запускаться».

Уведомления настраиваются в Kuma (Settings → Notifications) — email, Telegram,
Discord.

---

## Откат

Три разных случая, не путать.

### 1. Откат кода

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-rollback <git-sha>
```

Показывает, какие коммиты откатываются, спрашивает подтверждение, переключает
чекаут, пересобирает, перезапускает, проверяет `/health`. Занимает 5–10 минут —
столько идёт сборка. Вернуться на актуальный код: `git checkout main && git pull`.

Историю посмотреть: `cd /opt/magguarantee/src && git log --oneline -20`.

### 2. Откат миграции — не делается

Только вперёд. У `prisma migrate deploy` нет команды «отменить». Испортила
миграция схему — пишется новая, которая чинит.

Отсюда правило при разработке:

- новые колонки добавляем **nullable**
- удаляем колонку **отдельным релизом**, после того как код, который её читал,
  уже не работает

Пока оно соблюдается, откат кода на версию назад безопасен. Если же миграция
удалила колонку, а откат вернул код, который её выбирает, — Prisma упадёт на
первом запросе, и откат не поможет.

### 3. Откат данных

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-db
```

Без аргумента берёт свежий дамп, можно передать конкретный файл.

**Почему нельзя просто залить дамп поверх.** Дамп сделан обычным `pg_dump` без
`--clean`: внутри только `CREATE` и `COPY`, ни одного `DROP`. Залитый в базу, где
таблицы уже есть, он споткнётся на первом `CREATE TABLE`, а то, что успеет
пролезть, смешается со старыми строками. Восстанавливать нужно в пустую базу.

Скрипт делает это так: останавливает api и web, отключает оставшиеся сессии,
**переименовывает** текущую базу в `magguarantee_broken_<дата>`, создаёт пустую,
заливает дамп с `ON_ERROR_STOP=1`, печатает счётчики строк и поднимает
приложение. Старая база не удаляется — восстановление обычно делают в панике, и
возможность посмотреть, что было до, стоит занятого места. Команда для удаления
печатается в конце.

Если заливка упадёт на середине, скрипт напечатает две команды для возврата к
старой базе.

**Вложения откатываются вместе с базой.** Архив MinIO — отдельный файл, и брать
надо архив того же вечера, что и дамп. Иначе получишь рассинхрон: строки
ссылаются на файлы, которых ещё нет, или наоборот.

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml stop api web minio
```

```bash
sudo mv /opt/magguarantee/data/minio /opt/magguarantee/data/minio.broken-$(date +%F)
```

```bash
sudo mkdir -p /opt/magguarantee/data/minio && sudo tar xzf /opt/magguarantee/backups/minio-<ts>.tar.gz -C /opt/magguarantee/data/minio
```

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml up -d
```

Здесь `sudo` нужен: каталог принадлежит root, потому что MinIO в контейнере
работает от root. Старый каталог тоже переименовывается, а не удаляется.

---

## Известные хвосты

Не блокируют запуск, но стоит закрыть:

- **Откат медленный.** Сборка идёт на сервере, поэтому откат — это 5–10 минут
  пересборки. Переход на ghcr превратит его в подмену тега и секунды.
- **Админ в сиде захардкожен** (`seed.prod.ts`) — email и дефолтный пароль в
  коде. Для передачи системы заказчику лучше вынести в env.
- **Полный tar MinIO каждый раз.** Пока вложений мало — неважно; при росте до
  гигабайтов перейти на `rclone sync` каталога вместо архива.
