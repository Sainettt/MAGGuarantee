# 26. Pre-prod на staging-сервере

> **Статус 2026-09-15.** Прод-сервер MAGTRANS ещё долго не будет доступен
> (внешние блокеры — docs/17). Согласовано с руководителем: OVH-сервер staging
> работает как **боевой (pre-prod)** с настоящими данными, а когда прод-сервер
> будет готов — база и вложения переносятся туда (Фаза 11).
>
> Этот документ — **последовательность действий**. Журнал того, что реально
> сделано, и что из этого нужно повторить на prod — [27-preprod-parity-ledger.md](27-preprod-parity-ledger.md).
> Журнал ведёт агент `preprod-parity-agent`: выдаёт шаг, спрашивает
> подтверждение, записывает только подтверждённое.
>
> Выкат прода с нуля — [23-prod-deployment-runbook.md](23-prod-deployment-runbook.md).
> Здесь на него ссылки, а не копия.

## Как этим пользоваться

- У каждого шага ID (`PP-xx` — подготовка pre-prod, `C-xx` — перенос). Он же —
  строка в журнале docs/27.
- Команды выполняешь **сам**. Агент ничего не запускает на серверах.
- Действие, которого нет в этом документе (правка на сервере, в GitHub, в
  Google), — тоже через агента, строкой `X-xx` в журнале. Иначе при переносе
  его забудут повторить.
- **Секреты не пишутся** ни сюда, ни в журнал, ни в чат: только «задан, лежит
  в 1Password → <запись>». Команды инвентаризации ниже подобраны так, чтобы их
  вывод можно было вставлять агенту целиком.

Метки: 🖥 staging-сервер · 🏢 prod-сервер · 🐙 GitHub · 🌐 внешний сервис
(Google, DNS, Chat) · 💻 своя машина.

---

## 0. Что одинаково, а что различается

Главная таблица. Всё, что в колонке «Паритет» помечено `=`, на prod должно
оказаться **тем же самым**. Всё, что `≠`, различается **намеренно**, и prod
делается по docs/23.

| Аспект | pre-prod (staging) | prod | Паритет |
|---|---|---|---|
| Код | `main`, выкат через Actions → `staging` | тот же SHA на момент переноса | = |
| Compose-файл | `infra/docker-compose.prod.yml` (после PP-11) | `infra/docker-compose.prod.yml` | = |
| Край и TLS | Caddy сам, Let's Encrypt, `infra/caddy/Caddyfile` | nginx MAGTRANS снимает TLS, наш Caddy на `Caddyfile.prod` по HTTP | ≠ |
| Домен | `<домен-preprod>` — по логу 2026-09-15 `mymag.sainet.pl`, подтвердить в PP-01 | `mymag.magtrans.eu` | ≠ |
| `TRUST_PROXY_HOPS` | `1` (только Caddy) | `2` (nginx + Caddy) | ≠ |
| `UPSTREAM_PROXY_CIDRS`, `DOCKER-USER` | не нужны — Caddy и есть край | обязательны (docs/23 §2.2, §3.3) | ≠ |
| ufw | 22, 80, 443 для всех | 22 + 80 только от nginx | ≠ |
| `POSTGRES_PASSWORD`, `JWT_*` | свои, свежие (PP-06) | свои, свежие | ≠ |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | свежие (PP-06) | **те же, что на pre-prod** | = (D-04) |
| Gmail: GCP-проект, OAuth-клиент, refresh token, `GMAIL_FROM` | по D-03 | тот же | = (если D-03 = проект фирмы) |
| Google SSO: OAuth-клиент | один клиент, origin pre-prod | тот же клиент, origin prod | = клиент, ≠ origins |
| MAGSpace | инстанс на этом сервере | инстанс на prod-сервере | ⚠️ те же `Employee.id` (D-05) |
| Chat webhooks (wyjazdy, ops) | боевые | те же | = |
| rclone-папка бэкапов | `gdrive:magguarantee-backups-preprod` | `gdrive:magguarantee-backups-prod` | ≠ |
| GitHub Environment / метка раннера | `staging` | `prod` | ≠ |
| `ALLOW_PAST_DEPARTURE` (оба ключа) | `false` | `false` | = |

**Почему S3-ключи общие.** MinIO вшивает `S3_ACCESS_KEY` / `S3_SECRET_KEY` в
каталог данных при первом запуске. Вложения переносятся каталогом (Фаза 11),
поэтому prod обязан стартовать с теми же ключами, иначе api не авторизуется в
MinIO. Принцип «ничего не копировать со стенда» (`.env.prod.example`) не
нарушается: ключи рождаются в PP-06 уже как **прод-секреты**, UAT-ключи
выбрасываются вместе с UAT-данными.

---

## Фаза 0. Инвентаризация (ничего не меняем)

### PP-01 🖥 Состояние staging-сервера

Всё ниже — только чтение, от `deploy`. Вывод вставлять агенту: секретов в нём
нет.

Код и последний выкат. `git status` должен быть пустым — любая строка там
значит правку прямо на сервере, которой нет в git:

```bash
cd /opt/magguarantee/src && git rev-parse --short HEAD && git status --short && grep 'status=ok' /opt/magguarantee/deploy-history.log | tail -n 3
```

Какие контейнеры и каким compose-файлом подняты:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' && docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' magguarantee-api
```

Несекретные ключи `.env`:

```bash
cd /opt/magguarantee/src && grep -E '^(WEB_URL|APP_URL|NEXT_PUBLIC_API_URL|TRUST_PROXY_HOPS|MAIL_PROVIDER|GMAIL_FROM|MAKSIM_EMAIL|ALLOW_PAST_DEPARTURE|NEXT_PUBLIC_ALLOW_PAST_DEPARTURE|DIRECTORY_RECONCILE_MODE|POSTGRES_DATA|REDIS_DATA|MINIO_DATA)=' infra/.env
```

Какие ключи заданы, а какие пустые — **без значений**:

```bash
cd /opt/magguarantee/src && awk -F= '/^[A-Z_]+=/{v=substr($0,index($0,"=")+1); print $1"="(length(v)?"<set>":"<empty>")}' infra/.env
```

Каких ключей не хватает относительно прод-шаблона (`<` — есть в шаблоне, нет в
`.env`):

```bash
cd /opt/magguarantee/src && diff <(grep -oE '^[A-Z_]+=' infra/.env.prod.example | sort) <(grep -oE '^[A-Z_]+=' infra/.env | sort)
```

Caddy: совпадает ли серверный конфиг с репозиторием, и версия (нужна ≥ 2.8):

```bash
diff /opt/caddy/Caddyfile /opt/magguarantee/src/infra/caddy/Caddyfile; diff /opt/caddy/docker-compose.yml /opt/magguarantee/src/infra/caddy/docker-compose.yml; docker exec caddy caddy version
```

Ресурсы — прод-компоуз настраивает Postgres под 4 ГБ RAM:

```bash
free -h && nproc && df -h /opt
```

Таймеры, раннер, rclone, файрвол:

```bash
systemctl list-timers 'magguarantee-*' --no-pager; systemctl list-units 'actions.runner.*' --no-pager; rclone listremotes; sudo ufw status
```

Сети и MAGSpace:

```bash
docker network ls --format '{{.Name}}' | grep -E 'proxy-net|magtrans-internal'; docker ps --format '{{.Names}}' | grep -i magspace
```

Сколько сейчас данных:

```bash
docker exec magguarantee-postgres psql -U magguarantee magguarantee -Atc "SELECT 'users: ' || count(*) FROM users UNION ALL SELECT 'carriers: ' || count(*) FROM carriers UNION ALL SELECT 'delegations: ' || count(*) FROM delegations UNION ALL SELECT 'claims: ' || count(*) FROM claims"
```

### PP-02 🐙🌐 GitHub и внешние сервисы

Посмотреть руками и сообщить агенту:

- 🐙 Settings → Environments → `staging`: значения `COMPOSE_FILE`, `SITE_URL`,
  `DEPLOY_PATH`, `DEPLOY_HISTORY`; есть ли Required reviewers.
- 🐙 Settings → Actions → Runners: раннеры, их метки и статус.
- 🐙 Settings → Deploy keys: какие ключи и для какого сервера.
- 🌐 Google Cloud: в **каком проекте** (личный или фирмы) живут OAuth-клиент
  почты и OAuth-клиент SSO; какие Authorized JavaScript origins у SSO-клиента;
  статус consent screen (должен быть Published/Internal).
- 🌐 DNS `<домен-preprod>`: куда указывает.
- 🌐 Google Chat: есть ли space «wyjazdy» с webhook'ом и отдельный ops-space.

---

## Фаза 1. Решения

### PP-03 Зафиксировать решения

Агент проводит по списку и записывает ответ в журнал (раздел «Решения»). Пока
решение не принято, зависящие от него шаги не выдаются.

| ID | Вопрос | Рекомендация |
|---|---|---|
| D-01 | Каким compose-файлом живёт pre-prod | `docker-compose.prod.yml`: нет mailhog, web без секретов, api/web без портов на хосте |
| D-02 | Данные: чистый старт или сохранить часть UAT | Чистый старт. Удалять wnioski и выезды приложение не умеет, а смесь тестовых и боевых записей переедет на prod |
| D-03 | Почта: чем отправлять | Gmail API через GCP-проект **фирмы** (docs/23 §1.2–1.4) — тогда на prod то же самое. Временно личный проект или SMTP-релей — допустимо, но на prod это станет отдельной работой и строкой долга |
| D-04 | S3-ключи MinIO на prod | Те же, что на pre-prod (§0) |
| D-05 | Как prod-MAGSpace получит те же `Employee.id` | Переносить MAGSpace тем же окном, что и MAGGuarantee. Иначе привязки `magspaceEmployeeId` не совпадут, и сверка справочника начнёт отключать людей |
| D-06 | Что с `<домен-preprod>` после переноса | Временный редирект (302) на `mymag.magtrans.eu`, после Фазы 12 — постоянный или освободить |
| D-07 | Кто подтверждает выкаты на pre-prod | Required reviewers на Environment `staging` (если тариф GitHub позволяет — для приватного репо зависит от плана) |

---

## Фаза 2. Страховка

### PP-04 🖥 Финальный бэкап UAT-состояния

Если таймер бэкапа уже установлен (PP-01):

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 25 --no-pager
```

Если нет — запустить скрипт напрямую (без offsite, только на диск):

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-backup
```

В журнал — имена двух файлов `pg-<ts>.sql.gz` и `minio-<ts>.tar.gz` из вывода.
Без этой строки агент не выдаст шаги PP-08 и PP-09.

### PP-05 Выписать то, что надо будет завести заново

Сид (PP-11) положит только справочники по умолчанию: 10 ключей AppConfig,
6 типов прицепов, 24 строки лимитов-заглушек (540 км/день, 0.5 EUR/км,
270 км/суббота), маппинг stanowisk и одного админа. Всё, что настраивалось на
staging руками и нужно в бою, выписать **сейчас**: команды (Teams), реальные
ставки и лимиты, изменённый маппинг stanowisk в `/employee/sso`, типы
прицепов, аккаунты сотрудников с ролями, выданными вручную.

---

## Фаза 3. Новый `.env`

### PP-06 🖥 Собрать `infra/.env.new` из прод-шаблона

Собирается из **`.env.prod.example`**, а не правкой старого `.env`: у
staging-шаблона нет части ключей (`TRUST_PROXY_HOPS`, `GMAIL_*`, SSO), и
легко что-то упустить.

```bash
cd /opt/magguarantee/src && cp infra/.env infra/.env.uat-$(date +%F) && cp infra/.env.prod.example infra/.env.new && chmod 0600 infra/.env.new infra/.env.uat-*
```

Секреты — новые (команды из docs/23 Фаза 4):

```bash
openssl rand -hex 32      # POSTGRES_PASSWORD — и внутрь DATABASE_URL
```

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
```

```bash
openssl rand -base64 48   # JWT_REFRESH_SECRET — второй запуск, другое значение
```

```bash
openssl rand -hex 24      # S3_SECRET_KEY — станет и прод-ключом (D-04)
```

Значения, которые на pre-prod **отличаются** от прод-шаблона:

| Ключ | pre-prod | Комментарий |
|---|---|---|
| `WEB_URL`, `APP_URL`, `NEXT_PUBLIC_API_URL` | `https://<домен-preprod>` | как видит браузер |
| `TRUST_PROXY_HOPS` | **`1`** | в шаблоне `2` — на pre-prod это позволило бы подделывать IP |
| `MAGSPACE_INTERNAL_TOKEN` | токен MAGSpace **этого** сервера | из `/opt/magspace/.env` |
| `MAIL_PROVIDER`, `GMAIL_*` | по D-03 | |

Остальное — как в шаблоне и в таблице §0: пути данных `/opt/magguarantee/data/*`,
`ALLOW_PAST_DEPARTURE=false` (оба), боевой `MAKSIM_EMAIL`, боевые Chat-webhooks,
`SSO_ALLOWED_HD=magtrans.eu`, `DIRECTORY_RECONCILE_MODE=enforce`, кроны не
задавать (дефолты).

Пре-флайт (ловит незаполненные обязательные ключи):

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.new config --quiet
```

### PP-07 💻 Секреты в 1Password

Весь `infra/.env.new` целиком — в 1Password, запись «MAGGuarantee pre-prod
.env». S3-ключи отдельно — «MAGGuarantee MinIO (pre-prod = prod)». Без `.env`
дамп не восстановить.

---

## Фаза 4. Переключение стека (простой ~15–20 минут)

### PP-08 🖥 Остановить UAT-стек

Compose-файл — тот, что показал PP-01 (`config_files`), а не тот, что
«должен быть»:

```bash
cd /opt/magguarantee/src && docker compose -f <compose-файл-из-PP-01> down
```

`down` удаляет контейнеры (вместе с mailhog) и внутреннюю сеть. Данные на
диске, Caddy и MAGSpace не трогаются.

### PP-09 🖥 Отложить старые каталоги данных

Переименование, не удаление — UAT-данные ещё пригодятся, если что-то пойдёт не
так. Путь проверить по `POSTGRES_DATA` из PP-01:

```bash
sudo mv /opt/magguarantee/data /opt/magguarantee/data.uat-$(date +%F) && sudo mkdir -p /opt/magguarantee/data && sudo chown deploy:deploy /opt/magguarantee/data
```

Новые Postgres и MinIO инициализируются с паролем и ключами из нового `.env` —
поэтому PP-10 строго **до** первого запуска.

### PP-10 🖥 Подложить новый `.env`

```bash
cd /opt/magguarantee/src && mv infra/.env.new infra/.env && chmod 0600 infra/.env
```

### PP-11 🖥 Сборка → миграции → сид → запуск

```bash
cd /opt/magguarantee/src && git pull origin main && git status --short
```

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml build
```

```bash
docker compose -f infra/docker-compose.prod.yml run --rm -T api node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma < /dev/null
```

```bash
docker compose -f infra/docker-compose.prod.yml run --rm -T -e SEED_ADMIN_PASSWORD='<надёжный-пароль>' api node_modules/.bin/tsx prisma/seed.prod.ts < /dev/null
```

```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

Ожидаемо: сид печатает 10 / 6 / 24 / маппинги / 1 админ; `docker ps` — нет
mailhog, у api и web нет портов. Пароль админа — в 1Password.

---

## Фаза 5. Caddy

### PP-12 🖥 Caddy: сайт MAGGuarantee из репозитория

Caddy на staging **общий** (ещё `magspace.sainet.pl`), поэтому серверный
`/opt/caddy/Caddyfile` целиком из репо не копируется (Q-12). Сайт MAGGuarantee
живёт в `infra/caddy/sites/magguarantee.caddy` и читается прямо из чекаута
через volume `sites`; серверный файл его только импортирует. Нужен чекаут
после PP-11 (там `git pull` приносит фрагмент).

Страховочная копия серверного файла:

```bash
cp /opt/caddy/Caddyfile /opt/caddy/Caddyfile.bak-$(date +%F)
```

В `/opt/caddy/Caddyfile` блок `mymag.sainet.pl { … }` **целиком** заменить
одной строкой (блок `magspace.sainet.pl` и глобальные опции не трогать).
Править `nano` — он пишет в тот же inode; `sed -i` не годится: файл смонтирован
в контейнер одиночным файлом, и контейнер продолжит видеть старую версию.

```
import /etc/caddy/sites/magguarantee.caddy
```

Проверить конфиг **до** пересоздания — одноразовым контейнером, чтобы ошибка
не уронила MAGSpace:

```bash
docker run --rm -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v /opt/magguarantee/src/infra/caddy/sites:/etc/caddy/sites:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Ожидаемо `Valid configuration`. Затем compose из репо (новый volume) и
пересоздание — секунды простоя, в том числе `magspace.sainet.pl`:

```bash
cp /opt/magguarantee/src/infra/caddy/docker-compose.yml /opt/caddy/docker-compose.yml && cd /opt/caddy && docker compose up -d
```

Проверка:

```bash
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' --max-redirs 0 https://mymag.sainet.pl/health
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://magspace.sainet.pl
```

Ожидаемо `200 application/json…` и MAGSpace отвечает как раньше. Откат:
`cp /opt/caddy/Caddyfile.bak-<дата> /opt/caddy/Caddyfile && docker restart caddy`.

Дальше: правка сайта — только в репо; после `git pull`, который меняет
фрагмент, — `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`
(CI этого не делает).

На prod этот шаг — другой: `Caddyfile.prod` целиком либо prod-фрагмент +
`import`, если Caddy там тоже общий (Q-13); плюс `UPSTREAM_PROXY_CIDRS`,
`DOCKER-USER` (docs/23 §2.2, §3.3).

---

## Фаза 6. GitHub

### PP-13 🐙 Environment `staging`

Settings → Environments → `staging` → Variables:

| Variable | Значение |
|---|---|
| `COMPOSE_FILE` | `infra/docker-compose.prod.yml` |
| `SITE_URL` | `https://<домен-preprod>` — задать явно (дефолт в `ci.yml` — `https://mymag.sainet.pl`; после переезда на `mymag.magtrans.com.pl` без переменной внешняя проверка `/health` упадёт) |
| `DEPLOY_PATH`, `DEPLOY_HISTORY` | дефолты, если PP-02 не показал иное |

Required reviewers — по D-07.

### PP-14 🐙 Пробный выкат

Actions → CI / CD → Run workflow → `staging`. Ожидаемо: зелёный job, в
`/opt/magguarantee/deploy-history.log` последняя строка `status=ok`
`compose=infra/docker-compose.prod.yml`.

```bash
tail -n 2 /opt/magguarantee/deploy-history.log
```

---

## Фаза 7. Внешние сервисы

### PP-15 🌐 Почта

Войти админом: код 2FA приходит, `From` — `GMAIL_FROM` (не личный адрес),
ссылка в письме ведёт на `<домен-preprod>`. Если `From` подменён — send-as не
подтверждён (docs/23 §1.4).

### PP-16 🌐 Google SSO

GCP → Credentials → SSO-клиент → Authorized JavaScript origins содержит
`https://<домен-preprod>`. На `/login` есть кнопка Google. Проверки — блок
«Google SSO» в docs/23 Фаза 8.

### PP-17 🌐 Chat webhooks

Зарегистрировать тестовый выезд от тестового перевозчика → сообщение в space
«wyjazdy». Ops-алерт проверяется в PP-20.

### PP-18 🖥 MAGSpace

```bash
docker run --rm --network magtrans-internal curlimages/curl -s http://magspace-api:3001/internal/v1/health
```

`/employee/diagnostics` → «Baza danych» → пилюля MAGSpace зелёная. Записать в
журнал, **чьи данные** в этом MAGSpace — боевые сотрудники или тестовые
(влияет на D-05).

---

## Фаза 8. Бэкапы и мониторинг

С этого момента на сервере живые данные, и бэкап — не формальность.

### PP-19 🖥 Юниты и конфиги

rclone, если PP-01 не показал remote `gdrive:` — docs/23 §6.1. Юниты и
конфиги — docs/23 §6.2–6.3, с одним отличием: папка **своя**,

```ini
MAGG_RCLONE_REMOTE=gdrive:magguarantee-backups-preprod
```

`alert.conf` — URL ops-webhook.

### PP-20 🖥 Прогон, восстановление, алерт

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 25 --no-pager
```

Ждём `postgres dump ok`, `minio archive ok`, `offsite upload ok`.

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-test
```

```bash
sudo systemctl start magguarantee-alert@magguarantee-backup.service.service
```

Сообщение пришло в ops-space.

### PP-21 🌐 Внешний uptime-монитор

UptimeRobot / Better Stack на `https://<домен-preprod>/health`, **без
следования редиректам**, ожидать 200 (docs/23 «Мониторинг»).

---

## Фаза 9. Приёмка pre-prod

### PP-22 Чек-лист

- [ ] `/health` и `/ready` через домен → `200 application/json`, без редиректа
- [ ] `docker ps`: postgres, redis, minio, api, web (+ caddy, magspace); **нет
      mailhog**; у api и web нет проброшенных портов
- [ ] `docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' magguarantee-postgres magguarantee-minio` → `/opt/magguarantee/data/*`
- [ ] Логин админом, смена пароля при первом входе, код 2FA по почте
- [ ] Выезд задним числом **отклоняется** (422)
- [ ] Загрузка вложения появляется в `/opt/magguarantee/data/minio/magguarantee`
- [ ] `docker logs caddy --tail 5` → `client_ip` = **твой** IP; в логе api при
      логине тоже твой IP (проверка `TRUST_PROXY_HOPS=1`)
- [ ] `tail -n 1 /opt/magguarantee/deploy-history.log` → `status=ok`
- [ ] PP-20 зелёный, файлы есть в `gdrive:magguarantee-backups-preprod`
- [ ] Google SSO — блок из docs/23 Фаза 8
- [ ] `docker compose -f infra/docker-compose.prod.yml logs api | head -50` — ошибок на старте нет

---

## Фаза 10. Боевые данные

### PP-23 Завести данные через UI

- Реальные ставки и лимиты вместо заглушек сида.
- То, что выписано в PP-05: команды, маппинг stanowisk, сотрудники.
- Перевозчики, машины, водители — по мере подключения.

На prod этого не повторяют: всё переезжает с дампом.

---

## Режим эксплуатации (пока живёт pre-prod)

1. **Любое действие вне git** — на сервере, в GitHub UI, в Google, в DNS —
   идёт через `preprod-parity-agent` и получает строку в журнале с решением по
   prod: `повторить` / `иначе: …` / `не нужно: <почему>`.
2. **Серверные конфиги не правятся руками в обход репозитория.** Caddyfile,
   compose, systemd-юниты правятся коммитом. Если иначе нельзя — строка `X-xx`
   с сутью правки.
3. **`git status` на сервере всегда пустой.** Никаких хотфиксов в чекауте.
4. **Перед каждым выкатом с миграцией — ручной бэкап** (PP-20, первая команда).
   CI бэкап не делает, а откатить миграцию нельзя (docs/23 «Откат»).
5. **Изменение ключа `.env`** — строка в таблице `.env` журнала: ключ, что
   поменялось (описанием, не значением), какое значение будет на prod.
6. **Раз в неделю** — агент в режиме `status`: список долга перед prod.
7. **Новые фичи проверяются локально.** Отдельного тестового стенда больше нет.

### Релиз «Limity tygodniowe» (журнал: X-15…X-19)

Две миграции в одном выкате: `20261029120000_weekly_limits` раскладывает
`monthly_limits` по неделям ISO, `20261030120000_drop_monthly_limits` удаляет
`monthly_limits` — **необратимо**, откат только восстановлением дампа (docs/23
«Откат → 3. Откат данных»). Строгий порядок, на prod — тот же.

1. **X-15 🖥 Бэкап** — первая команда PP-20 и проверка файлов из C-03.
2. **X-16 🖥 Снимок до выката** (только чтение) — сохранить вывод обеих команд:
   ```bash
   docker exec magguarantee-postgres psql -U magguarantee magguarantee -c 'SELECT "year", "month", "kmPerDay", "ratePerKm", "kmPerSaturday" FROM "monthly_limits" ORDER BY 1, 2'
   ```
   ```bash
   docker exec magguarantee-postgres psql -U magguarantee magguarantee -Atc 'SELECT count(*) AS expected_rows FROM "monthly_limits" AS ml CROSS JOIN LATERAL generate_series(0, 30) AS i WHERE ml."month" BETWEEN 1 AND 12 AND EXTRACT(MONTH FROM make_date(ml."year", ml."month", 1) + i) = ml."month" AND EXTRACT(ISODOW FROM make_date(ml."year", ml."month", 1) + i) = 4'
   ```
3. **X-17 🐙 Выкат** — Actions → Deploy → Run workflow → `staging`.
4. **X-18 🖥 Проверки сразу после выката**, до любых правок лимитов:
   ```bash
   docker exec magguarantee-postgres psql -U magguarantee magguarantee -c "SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261029120000_weekly_limits', '20261030120000_drop_monthly_limits')"
   ```
   ```bash
   docker exec magguarantee-postgres psql -U magguarantee magguarantee -Atc "SELECT 'weekly_rows: ' || count(*) FROM weekly_limits UNION ALL SELECT 'monthly_limits: ' || coalesce(to_regclass('public.monthly_limits')::text, 'dropped')"
   ```
   ```bash
   docker exec -i magguarantee-postgres psql -U magguarantee magguarantee <<'SQL'
   SELECT "isoYear", "isoWeek", "kmPerSaturday" FROM "weekly_limits"
    WHERE "kmPerSaturday" > 0
      AND (EXTRACT(DAY FROM to_date(format('%s-%s-6', "isoYear", "isoWeek"), 'IYYY-IW-ID'))::int - 1) / 7 % 2 = 1;
   SQL
   ```
   Ожидаемо: обе миграции с `finished_at`; `weekly_rows` = `expected_rows` из X-16;
   `monthly_limits: dropped`; последний запрос — `(0 rows)` (суббота стоит только
   у недель, чья суббота была 1-й / 3-й / 5-й в своём месяце).
5. **X-19 💻 Календарь** — admin открывает `/employee/limits` и сверяет значения
   со снимком X-16.

---

## Фаза 11. Перенос на prod

### C-00 Гейт — без него перенос не начинается

- [ ] 🏢 docs/23 Фазы 1–9 выполнены на prod. Сид и приёмку на prod делать
      **можно**: восстановление ниже заменит базу целиком, а каталог MinIO
      подменяется
- [ ] В журнале нет строк с prod-статусом ⬜ (кроме самих C-шагов)
- [ ] Одинаковый SHA: последняя `status=ok` в `deploy-history.log` на обоих
      серверах
- [ ] 🏢 `S3_ACCESS_KEY` / `S3_SECRET_KEY` в prod-`.env` = pre-prod (D-04)
- [ ] 🏢 MAGSpace на prod с теми же `Employee.id` (D-05)
- [ ] 🏢 `DIRECTORY_RECONCILE_MODE=report` на первые дни после переноса
- [ ] 🌐 SSO-клиент: origin `https://mymag.magtrans.eu` добавлен
- [ ] 💻 Известно, как добраться до prod по SSH, чтобы положить файлы (C-04)
- [ ] **Репетиция**: C-02…C-09 прогнаны на prod заранее со свежим бэкапом
      pre-prod, после чего prod сброшен обратно
- [ ] Окно выбрано вне кронов: не 03:30 (бэкап, чистка токенов) и не
      07:00–07:20 (дайджест SLA, watchdog, алерт удаления машин)

### C-01 Предупредить пользователей

Сотрудникам и перевозчикам: время простоя и новый адрес `https://mymag.magtrans.eu`.

### C-02 🖥 Остановить запись на pre-prod

Сначала web — новых действий больше не будет:

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml stop web
```

Дождаться, пока очередь писем опустеет (все три числа — `0`):

```bash
docker exec magguarantee-redis redis-cli llen bull:email-send:wait; docker exec magguarantee-redis redis-cli llen bull:email-send:active; docker exec magguarantee-redis redis-cli zcard bull:email-send:delayed
```

Если в `delayed` висят ретраи с долгим backoff — решить: подождать или
смириться (это уведомления, не данные). Redis не переносится.

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml stop api
```

Снимок счётчиков — для сверки в C-08:

```bash
docker exec magguarantee-postgres psql -U magguarantee magguarantee -Atc "SELECT 'миграций: ' || count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL UNION ALL SELECT 'users: ' || count(*) FROM users UNION ALL SELECT 'carriers: ' || count(*) FROM carriers UNION ALL SELECT 'vehicles: ' || count(*) FROM vehicles UNION ALL SELECT 'delegations: ' || count(*) FROM delegations UNION ALL SELECT 'claims: ' || count(*) FROM claims"
```

```bash
sudo find /opt/magguarantee/data/minio -type f | wc -l
```

### C-03 🖥 Финальный бэкап

```bash
sudo systemctl start magguarantee-backup.service && journalctl -u magguarantee-backup.service -n 25 --no-pager
```

```bash
cd /opt/magguarantee/backups && ls -la pg-*.sql.gz minio-*.tar.gz | tail -n 2 && sha256sum $(ls -1t pg-*.sql.gz | head -1) $(ls -1t minio-*.tar.gz | head -1)
```

В журнал — имена файлов и контрольные суммы.

### C-04 💻 Перенести файлы

Серверы друг друга, скорее всего, не видят — через свою машину:

```bash
scp deploy@<preprod-host>:/opt/magguarantee/backups/pg-<ts>.sql.gz deploy@<preprod-host>:/opt/magguarantee/backups/minio-<ts>.tar.gz .
```

```bash
scp pg-<ts>.sql.gz minio-<ts>.tar.gz deploy@<prod-host>:/opt/magguarantee/backups/
```

🏢 Суммы должны совпасть с C-03:

```bash
cd /opt/magguarantee/backups && sha256sum pg-<ts>.sql.gz minio-<ts>.tar.gz
```

### C-05 🏢 Вложения

Процедура docs/23 «Откат данных», без финального `up`:

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml stop api web minio
```

```bash
sudo mv /opt/magguarantee/data/minio /opt/magguarantee/data/minio.before-cutover-$(date +%F)
```

```bash
sudo mkdir -p /opt/magguarantee/data/minio && sudo tar xzf /opt/magguarantee/backups/minio-<ts>.tar.gz -C /opt/magguarantee/data/minio
```

### C-06 🏢 База

```bash
/opt/magguarantee/src/infra/scripts/magguarantee-restore-db /opt/magguarantee/backups/pg-<ts>.sql.gz
```

Скрипт спросит имя базы, переименует текущую, зальёт дамп, напечатает
счётчики и поднимет api и web (MinIO поднимется как зависимость).

### C-07 🏢 Стек целиком

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml up -d && docker compose -f infra/docker-compose.prod.yml ps
```

SHA одинаковый (гейт C-00), поэтому миграции применять нечего. Если prod
почему-то новее — выкат через Actions → `prod` (он сам выполнит `migrate deploy`).

### C-08 🏢 Сверка

- Счётчики из C-06 = снимок C-02.
- Число файлов MinIO = C-02:

```bash
sudo find /opt/magguarantee/data/minio -type f | wc -l
```

### C-09 🏢 Приёмка на prod

- [ ] Логин сотрудником и перевозчиком (сессии новые — это нормально)
- [ ] Открыть wniosek **с вложением** — файл скачивается
- [ ] Письмо приходит, ссылка ведёт на `mymag.magtrans.eu`
- [ ] В `/employee/audit` видны старые записи
- [ ] `client_ip` в логе Caddy — реальный клиент, не nginx
- [ ] Google-вход сотрудника проходит, в письме-отчёте reconcile (`report`)
      никого не собираются отключать

**Если C-09 провален** — откат: 🖥 на pre-prod `docker compose -f infra/docker-compose.prod.yml up -d`, пользователям — старый адрес. Данные pre-prod не
тронуты, потеряно только то, что успели сделать на prod за окно.

### C-10 🖥 Редирект со старого адреса

В `/opt/caddy/Caddyfile` заменить блок сайта на **временный** редирект —
постоянный браузеры кэшируют, и откат станет невозможен:

```
<домен-preprod> {
    redir https://mymag.magtrans.eu{uri} temporary
}
```

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### C-11 🖥 Погасить pre-prod, данные сохранить

```bash
cd /opt/magguarantee/src && docker compose -f infra/docker-compose.prod.yml down
```

```bash
sudo systemctl disable --now magguarantee-backup.timer
```

Иначе кроны pre-prod (watchdog, алерты) продолжат слать письма настоящим
перевозчикам параллельно с prod.

### C-12 Переключить окружение

- 🌐 Uptime-монитор → `https://mymag.magtrans.eu/health`.
- 🏢 Через несколько дней без сюрпризов в отчётах reconcile —
  `DIRECTORY_RECONCILE_MODE=enforce`, `docker compose … up -d api`.
- 🐙 Environment `staging`: пока не трогать (Фаза 12).

---

## Фаза 12. После переноса

### C-13 Зачистка pre-prod (не раньше чем через 2 недели)

Условия: две недели зелёных бэкапов на prod и успешный `restore-test` на prod.

- Удалить с pre-prod-сервера каталоги с боевыми данными
  (`/opt/magguarantee/data`, `data.uat-*`, `backups`) — **делаешь сам**, это
  необратимо.
- Удалить папку `gdrive:magguarantee-backups-preprod` — в ней персональные
  данные перевозчиков, хранить её вечно нельзя.
- Если сервер снова нужен как тестовый стенд: новый `.env` из
  `.env.staging.example` (mailhog, `ALLOW_PAST_DEPARTURE=true`, новые
  секреты), `COMPOSE_FILE` → `infra/docker-compose.staging.yml`.
- 🌐 Убрать origin `<домен-preprod>` из SSO-клиента.
- Редирект C-10 → `permanent` или освободить домен (D-06).
