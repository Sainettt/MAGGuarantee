# 18. Launch и deployment

> Так как `Code.gs` + `index.html` никогда не были в проде и содержат фейковые данные, **миграция данных не нужна**. Новое приложение запускается с пустой БД + seed + первый admin. Этот документ описывает что нужно для перехода в prod.

## Цель

Превратить готовое приложение из Фазы 9 (см. [17-migration-roadmap.md](17-migration-roadmap.md)) в работающий prod-сервис, готовый принимать первых реальных пользователей.

## Чек-лист prod-окружения

### Инфраструктура

Архитектурное решение: **один VPS, всё на нём** (api + web + Postgres + Redis + nginx). Нагрузка в пике — 15–20 одновременных пользователей; managed-сервисы и Vercel избыточны и упираются в ToS Hobby-плана. Single point of failure принят бизнесом осознанно: короткий даунтайм при ребуте/сбое допустим.

- [ ] **VPS** (рекомендую Hetzner CX32 — 4 vCPU / 8 GB RAM / 80 GB NVMe / ~€7/мес, или эквивалент).
  - Ubuntu 24.04 LTS или Debian 12.
  - Базовая защита: `ufw` (открыты только 22, 80, 443), ssh только по ключу, root login отключён, `fail2ban`.
  - `unattended-upgrades` для security-патчей.
  - `chronyd` (NTP) — критично для JWT и audit-логов.
- [ ] **Postgres 16** на том же VPS (apt-пакет или официальный PGDG-репозиторий).
  - Слушает только `localhost` (не выставлять наружу).
  - Тюнинг под 8 GB RAM: `shared_buffers=2GB`, `effective_cache_size=4GB`, `work_mem=16MB`, `maintenance_work_mem=512MB`.
  - 10 GB SSD на старте, мониторить рост через `df`.
- [ ] **Redis 7** на том же VPS, тоже только `localhost`. `maxmemory=512mb`, `maxmemory-policy=allkeys-lru`.
- [ ] **nginx** как reverse-proxy: `app.magtrans.eu` → `127.0.0.1:3000` (Next.js standalone), `api.magtrans.eu` → `127.0.0.1:4000` (NestJS).
  - HTTP/2, gzip, разумные тайм-ауты (60s).
  - HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- [ ] **SSL/TLS** через **Caddy** (рекомендую — авто-получение и авто-обновление Let's Encrypt) **или** nginx + certbot с systemd-таймером `certbot.timer`. Без авто-обновления сертификат умрёт через 90 дней.
- [ ] **systemd-юниты** для процессов: `magguarantee-api.service`, `magguarantee-web.service`. Обе с `Restart=always`, `WantedBy=multi-user.target` (поднимаются после ребута).
- [ ] **S3-совместимое хранилище** для screenshots — отдельно от VPS (offsite, чтобы не потерять при сбое диска):
  - Cloudflare R2 (без egress fee) или Hetzner Object Storage.
  - Bucket: `magguarantee-screenshots-prod`.
  - Versioning включён, retention 5 лет.
- [ ] **Домены и DNS**:
  - `app.magtrans.eu` → IP VPS (A-запись).
  - `api.magtrans.eu` → IP VPS (A-запись).
  - DNS-провайдер на выбор (Cloudflare бесплатно).

### Google Cloud (для Gmail API)

- [ ] Создан Google Cloud Project.
- [ ] Включён Gmail API.
- [ ] Создан service-account с domain-wide delegation.
- [ ] В Workspace Admin → Security → API controls → Manage Domain Wide Delegation:
  - Client ID service-account-а добавлен с scope `https://www.googleapis.com/auth/gmail.send`.
- [ ] Технический email `wnioski@magtrans.eu` создан и доступен service-account-у.
- [ ] (Опц.) Google OAuth credentials для SSO внутренних сотрудников.

### Секреты

- [ ] Все ENV переменные из `apps/api/.env.example` заполнены в prod-deploy.
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — сгенерированы по 32+ байта рандома (`openssl rand -base64 48`), **разные**.
- [ ] `GMAIL_PRIVATE_KEY` — escape `\n` правильно.
- [ ] `S3_ACCESS_KEY`/`S3_SECRET_KEY` — с правами на конкретный bucket, не root.
- [ ] `DATABASE_URL` с `sslmode=require`.

### Мониторинг

- [ ] **Uptime Kuma** на том же VPS (Docker-контейнер), хостится на `status.magtrans.eu` или поддомене (basic-auth или IP-allowlist).
  - Мониторит `https://api.magtrans.eu/health`, `/ready`, `https://app.magtrans.eu/`.
  - Алерты: email + (опц.) Telegram/Discord webhook.
- [ ] **Логи** через Pino → stdout → `journalctl -u magguarantee-api` / `journalctl -u magguarantee-web`.
  - `journalctl --vacuum-time=30d` или `SystemMaxUse=2G` в `/etc/systemd/journald.conf` — не забить диск.
  - `logrotate` для nginx access/error логов.
- [ ] **Метрики хоста** — `htop`/`netdata` (опц., Netdata одной командой ставится и даёт дашборд).
- [ ] **Простые ручные алерты** через Uptime Kuma:
  - api `/health` не отвечает 2 мин → email.
  - api `/ready` (DB+Redis ping) не отвечает 1 мин → email.
  - frontend не отвечает 2 мин → email.
- [ ] **Disk-space мониторинг** — Uptime Kuma «Push»-monitor + cron на VPS, шлющий heartbeat если `df` < 80%.

### Безопасность

- [ ] Helmet enabled, CSP настроен.
- [ ] CORS только для `app.magtrans.eu`.
- [ ] Rate-limit на `/auth/login`, `/auth/verify-code`, `/auth/resend-code` (см. [13-api-design.md](13-api-design.md)).
- [ ] HTTPS-only (HSTS).
- [ ] HttpOnly + Secure + SameSite=Strict для всех cookies.
- [ ] Pino redaction для чувствительных полей (см. [16-jobs-and-integrations.md](16-jobs-and-integrations.md#логирование)).
- [ ] Pen-test или security checklist OWASP Top 10 пройден.

## CI/CD

Pipeline один на оба приложения: build на runner-е GitHub Actions, потом ssh на VPS, выкладка нового релиза в `/opt/magguarantee/releases/<git-sha>/`, переключение симлинка `current` и `systemctl restart`. Атомарный свич, легко откатывается.

### Структура релизов на VPS

```
/opt/magguarantee/
├── api/
│   ├── current → ../releases/<git-sha>/   (симлинк)
│   └── shared/                              (uploads, .env link)
├── web/
│   ├── current → ../releases/<git-sha>/
│   └── shared/
└── releases/
    ├── 2026-04-29-abc123/
    ├── 2026-04-29-def456/
    └── 2026-04-29-ghi789/                   (хранить минимум 3 последних)
```

systemd-юниты ссылаются на `/opt/magguarantee/api/current` и `/opt/magguarantee/web/current`. ENV хранится в `/etc/magguarantee/api.env` и `/etc/magguarantee/web.env` (`chmod 0600`, `chown root:magguarantee`), эти файлы НЕ в репозитории.

### `.github/workflows/deploy.yml`

```yaml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: magguarantee-app/package-lock.json
      - run: npm ci
        working-directory: magguarantee-app
      - run: npm run db:generate && npm run db:migrate:deploy
        working-directory: magguarantee-app
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
      - run: npm run lint && npm run typecheck && npm test
        working-directory: magguarantee-app
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
      - run: npm run build -w api && npm run build -w web
        working-directory: magguarantee-app

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: magguarantee-app/package-lock.json
      - run: npm ci
        working-directory: magguarantee-app
      - run: npm run build -w api && npm run build -w web
        working-directory: magguarantee-app
        env:
          NEXT_OUTPUT: standalone   # next.config.js: output: 'standalone'

      # Упаковка релиза
      - name: Pack release
        run: |
          SHA=$(git rev-parse --short HEAD)
          mkdir -p release/api release/web
          cp -r magguarantee-app/apps/api/dist release/api/
          cp -r magguarantee-app/apps/api/node_modules release/api/
          cp -r magguarantee-app/apps/web/.next/standalone/* release/web/
          cp -r magguarantee-app/apps/web/.next/static release/web/.next/static
          cp -r magguarantee-app/apps/web/public release/web/
          tar czf release-$SHA.tar.gz -C release .
          echo "SHA=$SHA" >> $GITHUB_ENV

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DEPLOY_SSH_KEY }}

      - name: Upload release
        run: |
          scp -o StrictHostKeyChecking=accept-new release-$SHA.tar.gz \
            deploy@${{ secrets.DEPLOY_HOST }}:/tmp/

      - name: Activate release
        run: |
          ssh deploy@${{ secrets.DEPLOY_HOST }} bash -s <<EOF
            set -euo pipefail
            SHA=$SHA
            REL=/opt/magguarantee/releases/\$(date +%Y-%m-%d)-\$SHA
            mkdir -p \$REL/api \$REL/web
            tar xzf /tmp/release-\$SHA.tar.gz -C \$REL
            # миграции — ДО переключения симлинка
            cd \$REL/api && DATABASE_URL=\$(cat /etc/magguarantee/api.env | grep ^DATABASE_URL | cut -d= -f2-) \
              node node_modules/.bin/prisma migrate deploy
            ln -sfn \$REL/api /opt/magguarantee/api/current
            ln -sfn \$REL/web /opt/magguarantee/web/current
            sudo systemctl restart magguarantee-api magguarantee-web
            # держим только 5 последних релизов
            ls -1dt /opt/magguarantee/releases/* | tail -n +6 | xargs -r rm -rf
          EOF

      - name: Smoke test
        run: |
          sleep 5
          curl -fsS https://api.magtrans.eu/health
          curl -fsS https://api.magtrans.eu/ready
          curl -fsS https://app.magtrans.eu/ > /dev/null
```

### Секреты GitHub Actions

- `DEPLOY_SSH_KEY` — приватный ключ deploy-юзера на VPS (без passphrase).
- `DEPLOY_HOST` — IP или DNS VPS.

Deploy-юзер на VPS — отдельный, не root. В `/etc/sudoers.d/magguarantee`:
```
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart magguarantee-api, /bin/systemctl restart magguarantee-web
```

### Пример systemd-юнита

`/etc/systemd/system/magguarantee-api.service`:

```ini
[Unit]
Description=MAGGuarantee API (NestJS)
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=magguarantee
WorkingDirectory=/opt/magguarantee/api/current
EnvironmentFile=/etc/magguarantee/api.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
# защита
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/magguarantee/api/shared

[Install]
WantedBy=multi-user.target
```

Аналогично `magguarantee-web.service` — порт 3000, `ExecStart=/usr/bin/node server.js` (Next.js standalone).

## Миграции БД

Управляются Prisma. Стратегия:

```bash
# Локально (dev):
npm run migrate:dev -w database -- --name <descriptive>

# В CI/CD (prod-деплой):
npm run migrate:deploy -w database
```

`migrate:deploy` запускается **до** переключения симлинка `current` и рестарта systemd-юнита (см. секцию CI/CD выше — миграция выполняется в шаге «Activate release» до `systemctl restart`).

⚠️ Никогда не использовать `prisma db push` в prod — только `migrate deploy`.

## Seed для prod

После применения миграций — `npm run db:seed`. Создаёт:

1. **14 типов прицепов** (`Firanka`, `Plandeka`, …) — это бизнес-справочник, не "тестовые данные".
2. **Лимиты км/ставки** — заполнить актуальными значениями MagTrans на текущий и следующий год (получить от бизнеса).
3. **App config**:
   - `stawka_eur_default = 0.5`
   - `km_dziennie_default = 540`
   - `auth_threshold_low = 1000`
   - `auth_threshold_high = 5000`
   - `min_days_to_submit = 10`
   - `login_code_ttl = 600`
   - `login_max_attempts = 5`
4. **Один admin-пользователь** — credentials передаются IT-админу безопасным каналом (1Password share / encrypted email).

```ts
// packages/database/prisma/seed.ts
import { PrismaClient } from '../src/generated';
import bcrypt from 'bcrypt';

async function main() {
  const prisma = new PrismaClient();

  // trailer types
  for (const name of ['Firanka','Plandeka','Chłodnia','Wywrotka','Mega','Jumbo','Frigo','Niska','Burtowa','Kontener','Cysterna','HDS','Walking Floor']) {
    await prisma.trailerType.upsert({ where: { name }, create: { name }, update: {} });
  }

  // first admin (creds в env, НЕ в коде)
  if (process.env.SEED_ADMIN_LOGIN && process.env.SEED_ADMIN_PASSWORD) {
    await prisma.user.upsert({
      where: { login: process.env.SEED_ADMIN_LOGIN },
      create: {
        login: process.env.SEED_ADMIN_LOGIN,
        email: process.env.SEED_ADMIN_EMAIL!,
        passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12),
        role: 'admin',
        name: 'Administrator',
      },
      update: {},
    });
  }

  // app_config
  const cfg: [string, string][] = [
    ['stawka_eur_default', '0.5'],
    ['km_dziennie_default', '540'],
    ['auth_threshold_low', '1000'],
    ['auth_threshold_high', '5000'],
    ['min_days_to_submit', '10'],
    ['login_code_ttl', '600'],
    ['login_max_attempts', '5'],
  ];
  for (const [key, value] of cfg) {
    await prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  // monthly_limits — пример на 2026
  for (let m = 1; m <= 12; m++) {
    await prisma.monthlyLimit.upsert({
      where: { year_month: { year: 2026, month: m } },
      create: { year: 2026, month: m, kmPerDay: 540, ratePerKm: 0.5 },
      update: {},
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
```

## Onboarding первых пользователей

Так как мигрировать нечего, после launch:

1. **Admin вводит сотрудников MagTrans** через UI:
   - Pracownik, opiekun, planista, dyspozytor, eksport, weryfikator.
   - Каждый получает приветственный email с login + temp password (см. `account-created` template).
   - При первом логине меняют пароль (опц.).
2. **Opiekun или admin вводит перевозчиков** (przewoznik):
   - Через UI создаёт `users.role=przewoznik` + `Carrier` profile.
   - Каждый получает приветственный email.
3. **Перевозчики или сотрудники добавляют автомобили / водителей / прицепы** через UI.
4. **Перевозчики начинают подавать wnioski** через UI.

Никаких скриптов, никаких CSV-импортов. Если нужно массово добавить, например, 50 перевозчиков сразу — можно подготовить простой одноразовый seed (`prisma/seed-initial-carriers.ts`), но это уже за пределами стандартного launch.

## Что делать с legacy `Code.gs` + `index.html`

Так как они никогда не были в проде, их можно:

**Вариант A (рекомендую):** оставить в репозитории как «исторический референс» в папке `legacy/`:

```bash
mkdir legacy
git mv Code.gs legacy/Code.gs
git mv index.html legacy/index.html
git mv src legacy/src     # бывшая попытка модуляризации
git mv docs/01..09 docs/legacy/      # старые docs остаются в подпапке
```

Зачем: документация (`docs/01-08-...`) ссылается на конкретные строки `Code.gs:5183` — если что-то непонятно или забылся бизнес-flow, можно вернуться и посмотреть.

**Вариант B:** удалить полностью после launch. Все знания зафиксированы в `docs/01-08`, которые остаются.

**Решение принимать после Фазы 4** (когда все основные flow перенесены и протестированы).

## Smoke-тесты после deploy

Запускать после каждого prod-деплоя:

```bash
# health
curl https://api.magtrans.eu/health
# → 200 OK

# ready
curl https://api.magtrans.eu/ready
# → 200 OK + checks

# login flow
curl -X POST https://api.magtrans.eu/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"..."}'
# → 200 + {sessionToken, maskedEmail}

# 2FA email пришёл (Mailhog в staging, реальный mailbox в prod)
```

Лучше — Playwright e2e, запускаемый раз в час против prod:

```ts
// apps/web/tests/smoke.spec.ts
test('login flow works in prod', async ({ page }) => {
  await page.goto('https://app.magtrans.eu/login');
  await page.fill('[name=login]', SMOKE_USER);
  await page.fill('[name=password]', SMOKE_PWD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/login\/verify/);
});
```

Этот test использует выделенный smoke-account, который не делает mutating действий.

## Rollback

Если деплой сломал prod:

1. **Код (api и web):** ssh на VPS, переключить симлинк `current` на предыдущий релиз и перезапустить.
   ```bash
   ssh deploy@vps
   ls -1dt /opt/magguarantee/releases/*    # выбрать предыдущий
   ln -sfn /opt/magguarantee/releases/<prev>/api /opt/magguarantee/api/current
   ln -sfn /opt/magguarantee/releases/<prev>/web /opt/magguarantee/web/current
   sudo systemctl restart magguarantee-api magguarantee-web
   curl -fsS https://api.magtrans.eu/health
   ```
   Полезно положить это в `/usr/local/bin/magguarantee-rollback` — короткий bash-скрипт, принимающий целевой sha.
2. **БД-миграции:** **никогда не откатывать через `prisma migrate reset`** в prod. Если миграция испортила схему — пишем новую миграцию, которая отменяет (forward-only). Помнить: rollback кода без отката миграции допустим только если новая миграция backward-compatible (чему стоит следовать всегда: добавляем колонки nullable, удаляем — отдельным релизом после).

## Backup-стратегия

Single-VPS — один диск. Без offsite-бэкапов потеря диска = потеря всего. Это критично, не пропускать.

| Что | Частота | Retention | Где |
|---|---|---|---|
| Postgres `pg_dump` | ежедневно | 7 дней | offsite S3 (R2 / Hetzner Object Storage) |
| Postgres `pg_dump` | еженедельно | 4 недели | offsite S3 |
| Postgres `pg_dump` | ежемесячно | 12 месяцев | offsite S3 |
| VPS-снимок (Hetzner snapshot или volume snapshot) | ежедневно | 7 дней | у хостера |
| S3 (screenshots) | versioning | 5 лет | сам S3 (offsite by design) |
| Application code | unlimited | через git | GitHub |
| Secrets (`/etc/magguarantee/*.env`) | при изменении | offline (1Password / зашифрованный архив) | вне VPS |

### Скрипт бэкапа Postgres

`/usr/local/bin/magguarantee-pgbackup`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y-%m-%d-%H%M)
DUMP=/var/backups/magguarantee/pg-$TS.sql.gz
mkdir -p /var/backups/magguarantee
sudo -u postgres pg_dump magguarantee | gzip > $DUMP
# offsite (rclone настроен на S3)
rclone copy $DUMP r2:magguarantee-backups/postgres/
# локальная ротация — держим 7 дней
find /var/backups/magguarantee -name 'pg-*.sql.gz' -mtime +7 -delete
```

Запуск через systemd-таймер (надёжнее cron — есть отчёты, retry):

```ini
# /etc/systemd/system/magguarantee-pgbackup.timer
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```

### Тест восстановления — обязательно

Бэкапы шрёдингера: пока не восстановил, ты не знаешь, рабочие они или нет. Минимум **раз в квартал**:

1. Скачать последний дамп.
2. Восстановить в локальный или staging Postgres (`gunzip -c pg-XXX.sql.gz | psql magguarantee_test`).
3. Прогнать smoke-проверки (`SELECT count(*) FROM users; SELECT count(*) FROM claims;`).

## Disaster recovery

### Сценарий 1: VPS лёг (хостер upadl, диск умер, OS не грузится)

1. Создать новый VPS той же спецификации у того же или другого хостера.
2. `apt install` всех зависимостей (пакетный список держать в `infra/setup.sh` в репозитории — bootstrap-скрипт).
3. Восстановить Postgres из последнего offsite-дампа.
4. Восстановить `/etc/magguarantee/*.env` из offline-секретов.
5. Передеплоить из main (просто `git push` или ручной запуск GitHub Actions workflow).
6. Поменять DNS A-запись на новый IP (Cloudflare TTL=300 → 5 мин на распространение).

RTO: 1–2 часа (если bootstrap-скрипт готов и оттестирован).
RPO: 24 часа (или меньше, если уменьшить интервал бэкапа до 6/12 часов).

### Сценарий 2: только Postgres сломался

1. `systemctl stop magguarantee-api` (приложение не должно писать в битую БД).
2. Восстановить дамп в новую БД, переименовать.
3. `systemctl start magguarantee-api`.

### Чтобы DR работал

- **Bootstrap-скрипт** (`infra/setup.sh` или Ansible playbook) должен быть актуален — каждый раз когда меняем что-то на VPS вручную, обновляем скрипт.
- **Тест DR** — раз в полгода поднять VPS с нуля по скрипту, восстановить дамп, убедиться что всё работает.

## Чек-лист перед прод-launch (D-Day)

### За неделю
- [ ] Все 9 фаз из [17-migration-roadmap.md](17-migration-roadmap.md) завершены.
- [ ] UAT с реальным admin + 2-3 будущими пользователями (carrier, opiekun) пройден на staging.
- [ ] Все km-calc fixtures зелёные.
- [ ] Uptime Kuma пингует endpoints, тестовый алерт пришёл на email.
- [ ] Бэкап-стратегия работает (тестово восстановили dump в staging).

### За день
- [ ] Деплой на prod (без публичной видимости — closed beta).
- [ ] Seed admin + начальные limits/configs.
- [ ] DNS настроен (готов к переключению или уже указывает).
- [ ] Smoke-тесты против prod зелёные.
- [ ] Communication plan: кто кому что пишет в день launch.

### D-Day
- [ ] Final smoke test.
- [ ] DNS публично активен (или приглашены первые пользователи).
- [ ] Мониторинг включён, на дежурстве.
- [ ] Onboarding-документ для перевозчиков отправлен.

### Через неделю
- [ ] Retro: что пошло хорошо, что плохо.
- [ ] Список багов, найденных в prod → backlog.
- [ ] Решение по `legacy/` папке (Вариант A или B).
