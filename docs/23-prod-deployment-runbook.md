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
| Домен + доступ к DNS | HTTPS, ссылки в письмах | 🆕 нет |
| Google Cloud проект **фирмы** | отправка почты через Gmail API | 🆕 нет |
| Ящик `wnioski@magtrans.eu` в Workspace | от его имени уходят письма | 🆕 нет |
| Google-аккаунт для бэкапов | offsite-копии через rclone | ✅ есть |
| Реальные ставки/лимиты MAGTRANS | сид заливает заглушки 540 / 0.5 / 270 | ⚠️ уточнить |

Порядок важен: **GCP и домен заводятся первыми**, потому что consent screen и
DNS-распространение занимают время, а без них сервер поднимать бессмысленно.

---

## Фаза 1. Внешние сервисы (до сервера)

### 1.1 Домен и DNS

Одна A-запись на IP будущего VPS:

```
app.magtrans.eu   →  <IP прод-VPS>
```

Одного домена достаточно: web и api живут на одном origin, Caddy разводит их по
пути (`/api/*` → api, остальное → web). Так уже работает на стенде, куки и CORS
проверены в этой конфигурации.

TTL поставить `300` на время запуска, потом поднять до `3600`.

> Если очень хочется `app.` + `api.` раздельными поддоменами — так тоже можно
> (общий родительский домен, куки остаются same-site), но эта схема ни разу не
> прогонялась. Тогда обязательно проверить руками логин **и** обновление токена
> до того, как пускать людей.

### 1.2 Google Cloud проект фирмы

1. Создать проект в аккаунте MAGTRANS (не в личном).
2. Включить **Gmail API**.
3. OAuth consent screen: тип **Internal**, scope
   `https://www.googleapis.com/auth/gmail.send`, статус → **Publish**.
   ⚠️ В статусе Testing refresh token умирает через 7 дней, и через неделю
   после запуска никто не сможет войти.
4. Создать OAuth client ID типа **Web application**, redirect URI
   `http://localhost:53682/oauth2callback`. Записать client_id и client_secret.
5. Создать/получить доступ к ящику `wnioski@magtrans.eu`.

### 1.3 Refresh token для почты

Выполняется **на своей машине**, в `magguarantee-app/apps/api`:

```bash
npm run gmail:token
```

Предварительно выставить в окружении `GMAIL_OAUTH_CLIENT_ID` и
`GMAIL_OAUTH_CLIENT_SECRET` (в PowerShell — `$env:GMAIL_OAUTH_CLIENT_ID="..."`).

Логиниться **ящиком-отправителем**. Полученный refresh token сохранить — он
пойдёт в `.env`.

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
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

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
```

`proxy-net` — общая сеть, через которую Caddy видит контейнеры приложения.
Создаётся один раз на сервер.

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
cp -r /opt/magguarantee/src/infra/caddy/* /opt/caddy/
```

🆕 В `/opt/caddy/Caddyfile` заменить хост стенда на боевой домен и подставить
свой email для Let's Encrypt:

```caddy
{
    email admin@magtrans.eu
}

app.magtrans.eu {
    @api path /api/*
    handle @api {
        reverse_proxy magguarantee-api:3001
    }
    handle {
        reverse_proxy magguarantee-web:3000
    }
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
```

```bash
cd /opt/caddy && docker compose up -d
```

Сертификат выпускается сам за 10–30 секунд, но только если A-запись уже
резолвится на этот IP. Проверить: `docker compose logs -f caddy`.

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
| `WEB_URL`, `APP_URL`, `NEXT_PUBLIC_API_URL` | `https://app.magtrans.eu` |
| `API_URL` | `http://magguarantee-api:3001` — **не менять**, это адрес внутри Docker |
| `MAIL_PROVIDER` | `gmail` |
| `GMAIL_OAUTH_*`, `GMAIL_FROM` | из Фазы 1.3 |
| `MAKSIM_EMAIL` | 🆕 **боевой адрес директора** |
| `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` | 🆕 incoming-webhook боевого Chat-space «wyjazdy». Берётся в самом space: **Apps & integrations → Webhooks → Add webhooks** (нужен Google Workspace). Пусто ⇒ уведомлений о выездах внутри компании не будет (api при этом стартует нормально) |
| `ALLOW_PAST_DEPARTURE`, `NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` | оба `false` |
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
printf 'MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups-prod\nMAGG_KEEP_DAYS=7\nMAGG_REMOTE_KEEP_DAYS=30\n' | sudo tee /opt/magguarantee/backup.conf
```

### 6.3 Таймер

```bash
sudo cp /opt/magguarantee/src/infra/systemd/magguarantee-backup.* /etc/systemd/system/
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

---

## Фаза 7. CI/CD

### 7.1 Ключ для GitHub Actions

На своей машине:

```bash
ssh-keygen -t ed25519 -C "github-actions-prod" -f ~/.ssh/magg_deploy_prod -N ""
```

```bash
ssh-copy-id -i ~/.ssh/magg_deploy_prod.pub deploy@app.magtrans.eu
```

### 7.2 Environment в GitHub

Settings → Environments → изменить существующий `prod`:

| Тип | Имя | Значение |
|---|---|---|
| Secret | `DEPLOY_HOST` | боевой хост |
| Secret | `DEPLOY_SSH_KEY` | содержимое `~/.ssh/magg_deploy_prod` целиком |
| Variable | `COMPOSE_FILE` | `infra/docker-compose.prod.yml` |

Старый OVH-стенд, если остаётся жить, переезжает в environment `staging` со
своим ключом и `infra/docker-compose.staging.yml`.

Опционально: на `prod` включить **required reviewers** — тогда выкат ждёт
подтверждения в интерфейсе GitHub.

### 7.3 Проверка

Actions → CI / CD → Run workflow → `prod`. Первый шаг напечатает выбранное
окружение и compose-файл; при неверных переменных упадёт, не трогая сервер.

---

## Фаза 8. Приёмка

Идти сверху вниз, каждый пункт руками:

- [ ] `https://app.magtrans.eu/health` → 200, `/ready` → 200
- [ ] Сертификат валиден, HTTP редиректит на HTTPS
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
`https://app.magtrans.eu/health`, уведомления на почту. Пять минут, закрывает
главный риск.

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
    networks:
      - proxy-net
networks:
  proxy-net:
    external: true
```

Блок в `/opt/caddy/Caddyfile` (плюс A-запись `status.magtrans.eu`):

```caddy
status.magtrans.eu {
    reverse_proxy uptime-kuma:3001
}
```

```bash
cd /opt/uptime-kuma && docker compose up -d
```

Открыть в браузере, создать админа, добавить мониторы:

| Тип | Цель | Что ловит |
|---|---|---|
| HTTP | `https://app.magtrans.eu/health` | api жив |
| HTTP | `https://app.magtrans.eu/ready` | база и Redis доступны |
| HTTP | `https://app.magtrans.eu/` | web отдаёт страницы |
| Push | heartbeat, интервал 36 часов | **бэкап перестал ходить** |

Push-монитор работает наоборот: Kuma ждёт, что к нему постучатся. Его URL идёт
в `backup.conf`:

```bash
echo 'MAGG_HEARTBEAT_URL=https://status.magtrans.eu/api/push/xxxxx' | sudo tee -a /opt/magguarantee/backup.conf
```

Скрипт дёргает его только при полном успехе. Не пришёл стук за 36 часов —
приходит тревога. Это единственный способ узнать, что бэкапы тихо перестали
делаться: сами по себе они об этом не сообщат.

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
