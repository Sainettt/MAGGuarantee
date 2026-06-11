# 16. Jobs, email, внешние интеграции

> Всё, что в GAS было через Triggers, MailApp, UrlFetchApp.

> **Статус BullMQ (Phase 9, частично live):** BullMQ поднят **рано** и работает
> **in-process** (воркеры крутятся внутри API Nest-процесса, без отдельного
> worker-контейнера). Подключены **только две очереди**:
> - `email-send` — асинхронная отправка email. Сейчас через неё идёт **только
>   2FA login-code** (`MailService.enqueue2faCode`); все остальные mail-вызовы
>   пока синхронны (помечены `// Phase 9: migrate to email-send queue`) и
>   мигрируют в полном Phase 9.
> - `chat-notify-wyjazd` — нотификация в Google Chat при регистрации выезда
>   (см. [Google Chat notifications](#google-chat-notifications)).
>
> Connection: общий `REDIS_URL` (выделенное BullMQ-подключение с
> `maxRetriesPerRequest: null` — блокирующие команды BullMQ этого требуют; нельзя
> переиспользовать `RedisService.client`). Остальные очереди/процессоры из таблицы
> ниже — TODO полного Phase 9.

## Background jobs (cron) — BullMQ

### Что переносим

| GAS-trigger | GAS функция | Частота | Куда |
|---|---|---|---|
| Daily reminders | `sendDailyReminders` (`Code.gs:6987`) | ежедневно 08:00 | BullMQ scheduled job |
| Weekly report | `sendWeeklyReport` (`Code.gs:7056`) | пн 09:00 | BullMQ scheduled job |
| onEdit | `onEditTrigger` (`Code.gs:6977`) | реал-тайм при правке Sheet | **Не нужен** (нет Sheets) |
| onOpen | `onOpen` (`Code.gs:6950`) | при открытии Sheet | **Не нужен** |
| Refresh-token cleanup | — (новое) | ежедневно | BullMQ scheduled job |

> Внутренний per-claim чат не реализуем (см. [17-migration-roadmap.md#что-мы-не-делаем](17-migration-roadmap.md)) — `_cleanupOldChatMessages` из `Code.gs` пропускаем. **Это НЕ про** исходящую Google Chat нотификацию о выездах — та новая фича, см. [Google Chat notifications](#google-chat-notifications).

### Структура BullMQ

```
apps/api/src/modules/jobs/
├── jobs.module.ts
├── queues.ts                      # имена очередей
├── processors/
│   ├── daily-reminders.processor.ts
│   ├── weekly-report.processor.ts
│   ├── refresh-token-cleanup.processor.ts
│   └── email-send.processor.ts    # async отправка email
└── schedulers/
    └── bootstrap.ts               # repeatable jobs через app start
```

### Bootstrap (повторяющиеся jobs создаются на старте)

```ts
// jobs/schedulers/bootstrap.ts
import { OnApplicationBootstrap } from '@nestjs/common';

@Injectable()
export class JobsScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('daily-reminders') private daily: Queue,
    @InjectQueue('weekly-report') private weekly: Queue,
    @InjectQueue('token-cleanup') private tokens: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.daily.add('run', {}, {
      repeat: { pattern: '0 8 * * *', tz: 'Europe/Warsaw' },
      jobId: 'daily-reminders-cron',
    });
    await this.weekly.add('run', {}, {
      repeat: { pattern: '0 9 * * 1', tz: 'Europe/Warsaw' },
      jobId: 'weekly-report-cron',
    });
    await this.tokens.add('run', {}, {
      repeat: { pattern: '0 4 * * *', tz: 'Europe/Warsaw' },
      jobId: 'token-cleanup-cron',
    });
  }
}
```

`jobId` гарантирует, что job не дублируется при рестарте сервиса.

### Пример processor

```ts
// processors/daily-reminders.processor.ts
@Processor('daily-reminders')
export class DailyRemindersProcessor extends WorkerHost {
  constructor(
    private claims: ClaimsService,
    private mail: MailService,
    private logger: Logger,
  ) { super(); }

  async process(job: Job): Promise<void> {
    this.logger.log({ msg: 'Daily reminders job start' });
    const stale = await this.claims.findStaleNaWeryfikacji({ olderThanDays: 3 });
    for (const claim of stale) {
      await this.mail.sendThreaded({
        to: claim.carrier.user.email,
        subject: `Przypomnienie: wniosek ${claim.nrZgl} oczekuje na weryfikację`,
        threadKey: `wniosek-${claim.nrZgl}`,
        template: 'daily-reminder',
        data: { claim },
      });
    }
    this.logger.log({ msg: 'Daily reminders done', count: stale.length });
  }
}
```

### Email очередь

> **Текущее состояние (Phase 9, частично):** очередь `email-send` уже поднята
> (in-process worker `EmailSendProcessor`), но через неё идёт **только 2FA
> login-code** (`MailService.enqueue2faCode` → процессор зовёт прежний
> синхронный `send2faCode`, который сам пишет строку в `MailJobsRegistry`, так
> что `GET /diagnostics/mails` не затронут). Остальные шаблоны ниже пока
> синхронны и мигрируют в полном Phase 9.

В целевом состоянии все исходящие email идут через очередь, не sync. Преимущество:
- Если Gmail rate-limit (250/день free, выше для workspace) — retry.
- Если отправка медленная — не блокируем HTTP-ответ пользователю.
- Видим в bull-board UI кто что отправляет, ошибки, retry.

```ts
// в любом сервисе:
await this.emailQueue.add('send', {
  to,
  subject,
  template: 'carrier-decision',
  data: { ... },
  threadKey,
}, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 * 24 * 7 },
  removeOnFail: false,
});
```

## Email через Gmail API

### Почему Gmail API, а не SMTP

Текущая система использует `MailApp.sendEmail` / `GmailApp` с фишкой: **threading через subject** — все письма по одному `nrZgl` склеиваются в один Gmail-тред (см. `_sendThreadedEmail` `Code.gs:5788`).

В новом стеке:
- **Gmail API** даёт прямой контроль над `In-Reply-To` / `References` headers, что и есть RFC-стандарт thread.
- Service-account отправляет от имени `wnioski@magtrans.eu` (через Domain-Wide Delegation).
- Можно использовать Nodemailer + Gmail API transport, либо `googleapis` SDK напрямую.

### Setup

1. В Google Workspace Admin: создать service-account.
2. Включить «Domain-Wide Delegation».
3. В Workspace admin → Security → API controls → Manage Domain Wide Delegation: добавить service-account client ID + scope `https://www.googleapis.com/auth/gmail.send`.
4. В app: `JWT.fromJSON({client_email, private_key})` + `subject = wnioski@magtrans.eu`.

```ts
// modules/mail/mail.service.ts
import { google } from 'googleapis';

@Injectable()
export class MailService {
  private gmail = google.gmail('v1');
  private auth: GoogleAuth;

  constructor(private config: ConfigService) {
    this.auth = new google.auth.JWT({
      email: config.get('GMAIL_CLIENT_EMAIL'),
      key: config.get('GMAIL_PRIVATE_KEY'),
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: config.get('GMAIL_FROM'),  // 'wnioski@magtrans.eu'
    });
  }

  async sendThreaded(params: {
    to: string | string[];
    cc?: string[];
    subject: string;
    html: string;
    threadKey: string;             // 'wniosek-GWA/001/05/26'
    inReplyToMessageId?: string;
  }) {
    // 1. Lookup Message-ID последнего письма с этим threadKey (хранится в БД).
    // 2. Если есть — добавить In-Reply-To + References.
    // 3. Отправить.
    const raw = this.buildMime({
      from: this.config.get('GMAIL_FROM'),
      ...params,
    });
    const res = await this.gmail.users.messages.send({
      auth: this.auth,
      userId: 'me',
      requestBody: { raw, threadId: await this.lookupThreadId(params.threadKey) },
    });
    await this.recordMessage(params.threadKey, res.data.id);
    return res.data;
  }
}
```

### MIME сборка

```ts
private buildMime(p: { from; to; cc?; subject; html; inReplyToMessageId?: string }) {
  const lines = [
    `From: ${p.from}`,
    `To: ${arr(p.to).join(', ')}`,
    p.cc?.length ? `Cc: ${arr(p.cc).join(', ')}` : '',
    `Subject: ${this.sanitizeHeader(p.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    p.inReplyToMessageId ? `In-Reply-To: <${p.inReplyToMessageId}>` : '',
    p.inReplyToMessageId ? `References: <${p.inReplyToMessageId}>` : '',
    '',
    p.html,
  ].filter(Boolean).join('\r\n');
  return Buffer.from(lines).toString('base64url');
}

private sanitizeHeader(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').slice(0, 200);
}
```

### Хранение thread-id

Простая таблица `email_threads`:

```prisma
model EmailThread {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  threadKey   String   @unique     // 'wniosek-GWA/001/05/26'
  gmailThreadId String?              // Gmail thread id
  lastMessageId String?              // Last Message-ID (для In-Reply-To)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("email_threads")
}
```

При первой отправке: `gmailThreadId` пустой, после ответа Gmail API — записываем. Дальше `threadId` идёт в `gmail.users.messages.send`.

### Шаблоны

Текущие шаблоны (`buildCarrierEmail`, `sendInternalDecisionEmail` и т.д.) переносим как **React Email** компоненты (`@react-email/components`):

```tsx
// modules/mail/templates/carrier-decision.tsx
import { Html, Head, Body, Container, Section, Heading, Text } from '@react-email/components';

export function CarrierDecisionEmail({ claim, decision, color }) {
  return (
    <Html lang="pl">
      <Head />
      <Body style={{ fontFamily: 'DM Sans, sans-serif', backgroundColor: '#f5f5f5' }}>
        <Container style={{ maxWidth: 600, backgroundColor: '#fff', borderRadius: 12, padding: 0 }}>
          <Section style={{ backgroundColor: color, color: '#fff', padding: '24px', borderRadius: '12px 12px 0 0' }}>
            <Heading>Wniosek {claim.nrZgl} — {decision}</Heading>
          </Section>
          <Section style={{ padding: 24 }}>
            <Text>Pojazd: <strong>{claim.vehicle.plateNumber}</strong></Text>
            <Text>Okres: {fmt(claim.dateStart)} – {fmt(claim.dateEnd)}</Text>
            <Text>Kwota: <strong>{fmtEur(claim.amountApproved)}</strong></Text>
            {claim.comment && <Text>Komentarz: {claim.comment}</Text>}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

Рендеринг в HTML в `MailService`:

```ts
import { render } from '@react-email/render';
const html = await render(<CarrierDecisionEmail claim={claim} decision="ZAAKCEPTOWANO" color="#22c55e" />);
```

### Email-шаблоны (полный список)

| Шаблон | GAS-аналог | Когда |
|---|---|---|
| `account-created.tsx` | `sendAccountCreatedEmail` | Создание user-а |
| `password-reset.tsx` | `sendPasswordResetEmail` | Reset |
| `account-deactivated.tsx` | `sendAccountDeactivatedEmail` | Deactivate |
| `account-reactivated.tsx` | `sendAccountReactivatedEmail` | Reactivate |
| `login-code.tsx` | (новое, шаблон 2FA) | Каждый login |
| `carrier-decision.tsx` | `buildCarrierEmail` | После verify wniosku |
| `internal-decision.tsx` | `sendInternalDecisionEmail` | После verify wniosku → planiści, opiekun, lider, wnioski@ |
| `carrier-submitted.tsx` | `submitNewClaim` notif | После submit перевозчиком |
| `daily-reminder.tsx` | `sendDailyReminders` | Ежедневно для зависших |
| `weekly-report.tsx` | `sendWeeklyReport` | Понедельник |
| `authorization-request.tsx` | `sendAuthorizationRequest` | Когда нужна авторизация суммы |

## Файловое хранилище — S3

`uploadAuthScreenshot` сейчас пишет файл в Google Drive через `DriveApp`. В новом стеке — S3-совместимое (Cloudflare R2 / AWS S3 / MinIO).

```ts
// modules/storage/storage.service.ts
@Injectable()
export class StorageService {
  private s3: S3Client;

  constructor(private cfg: ConfigService) {
    this.s3 = new S3Client({
      region: cfg.get('S3_REGION'),
      endpoint: cfg.get('S3_ENDPOINT'),
      credentials: {
        accessKeyId: cfg.get('S3_ACCESS_KEY'),
        secretAccessKey: cfg.get('S3_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  async uploadScreenshot(claim: Claim, file: Express.Multer.File): Promise<string> {
    const key = `auth-screenshots/${claim.nrZgl.replace(/\//g, '_')}/${Date.now()}-${file.originalname}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.cfg.get('S3_BUCKET'),
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
    }));
    return `s3://${this.cfg.get('S3_BUCKET')}/${key}`;
  }

  async getSignedUrl(key: string, ttlSec = 600): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({
      Bucket: this.cfg.get('S3_BUCKET'),
      Key: key,
    }), { expiresIn: ttlSec });
  }
}
```

URL screenshot-а в БД хранится как `s3://bucket/key` — всегда генерируем pre-signed URL для просмотра.

## Внешние REST-интеграции

### VIES (проверка VAT)

```ts
// modules/integrations/vies/vies.service.ts
@Injectable()
export class ViesService {
  private readonly base = 'https://ec.europa.eu/taxation_customs/vies/rest-api';

  async lookup(country: string, vat: string): Promise<ViesResult> {
    return await this.fetchWithRetry(`${this.base}/ms/${country}/vat/${vat}`);
  }

  private async fetchWithRetry(url: string, attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) return await res.json();
        if (res.status >= 500 && i < attempts - 1) {
          await sleep(1000 * 2 ** i);
          continue;
        }
        throw new HttpException('VIES error', res.status);
      } catch (e) {
        if (i < attempts - 1) { await sleep(1000 * 2 ** i); continue; }
        throw e;
      }
    }
  }
}
```

Кешируем positive ответы в Redis на 24ч (key: `vies:{country}:{vat}`) — VAT-статусы редко меняются.

### Biała Lista MF

Два эндпоинта, оба маунтятся в `modules/integrations/white-list/`.

#### `GET /api/v1/integrations/whitelist?nip=&account=` — `checkAccount`

```ts
// modules/integrations/white-list/white-list.service.ts
async checkAccount(nip: string, account: string): Promise<WhiteListResult> {
  const url = `https://wl-api.mf.gov.pl/api/check/nip/${nip}/bank-account/${account}?date=${today()}`;
  return await this.fetchWithRetry(url);
}
```

Кешируем на 1 час (key: `whitelist:{NIP}:{ACCOUNT}`) — вайт-листы могут обновляться. Дата в ключе не нужна: TTL=1ч не пересекает границы суток.

#### `GET /api/v1/integrations/whitelist/search?nip=` — `searchByNip`

Auto-fill данных польской компании по NIP для формы создания/редактирования карьера. UI вызывает этот эндпоинт после ввода NIP и предзаполняет название, адрес и список банковских счетов из реестра MF — карьеру остаётся только подтвердить или скорректировать поля.

```ts
async searchByNip(nip: string): Promise<WhiteListSearchResult> {
  const url = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${today()}`;
  // upstream 404 → { found: false }, не error
  return await this.fetchSearchWithRetry(url);
}
```

Маппинг:

- `result.subject` populated → `{ found: true, name, address, accountNumbers, statusVat, requestId, requestDateTime }`.
  - `address` = `subject.residenceAddress ?? subject.workingAddress`.
  - `accountNumbers` — массив строк как есть (EUR vs PLN не различаем, фронт разберётся).
  - `statusVat` — `'Czynny' | 'Niezarejestrowany' | 'Zwolniony'` или `null`.
- `result.subject === null` (NIP неизвестен MF) → `{ found: false, ... }`, **не кешируем** — статус может появиться завтра.
- HTTP 404 от MF (NIP вне реестра — типично для **не-польских** карьеров) → `{ found: false, ... }`. Это **валидный ответ**, не ошибка: UI просто разворачивает форму на ручной ввод. Реализуется в сервисе через try/catch вокруг `fetchJsonWithRetry` — общий helper кидает `HttpException` на любой 4xx, а здесь именно 404 ловим и превращаем в sentinel `null`.
- 5xx / network → 3 ретрая по экспоненте → `HttpException 503` каллеру (тот же helper, что и в `checkAccount`).

Кеш-ключ: `whitelist-search:{NIP}`, TTL = 1ч (как у `checkAccount`, по той же причине). Кешируем только `found: true`.

`requestId` / `requestDateTime` — MF audit handles, отдаём как метаданные. Если в будущем понадобится доказательная база (карьер оспаривает данные с которыми мы согласовали заявку), можно завести отдельную таблицу аудита для этих идентификаторов — сейчас за рамки MVP это выносим.

### info-car.pl

URL builder, не запрос API:

```ts
// modules/integrations/inspection/inspection.service.ts
buildLink(vin: string): string {
  return `https://info-car.pl/inspections?vin=${encodeURIComponent(vin)}`;
}
```

### GPS tracker (статус: ожидает доступа к API)

> **Status:** API access ещё не предоставлен MAGTRANS. Модуль создаётся в Phase 2 как **скелетон с mock-провайдером** — не блокирует разработку остальных частей. Реальные вызовы добавляются как только credentials/endpoint становятся доступны.

#### Что это и зачем

У авто перевозчиков MAGTRANS установлены GPS-трекеры, подключённые к стороннему сервису мониторинга автопарка. Сейчас, чтобы посмотреть положение авто, сотрудники открывают веб-портал этого сервиса. Цель новой интеграции — забирать данные через API и показывать их **в нашем UI** (в первую очередь на `/fleet/*` экранах для opiekun / planista / dyspozytor / weryfikator), без перехода во внешний сервис.

Это **пятая внешняя интеграция** (после VIES, Biała Lista, info-car и Gmail API).

#### Что нужно получить от MAGTRANS перед finalize

- Имя сервиса/вендор (Wialon / GPSWOX / Webdispatcher / Frotcom / Verizon Connect / иное).
- Базовый URL API.
- Тип аутентификации и credentials (API key / OAuth2 client credentials / Basic auth / session token).
- Документация эндпоинтов — минимум:
  - получить текущую позицию авто по identifier,
  - получить trips/history по диапазону дат (опц., для Phase 11+).
- **Маппинг** наших `Vehicle.plateNumber` (или `Vehicle.gpsMobilePhone`, или `Vehicle.sideNumber`) → их internal vehicle id. Решить — храним ли отдельное поле `Vehicle.gpsExternalId`, или ходим по plateNumber.
- Rate-limit и SLA внешнего API (нужно для подбора частоты polling-а).

#### Архитектурный паттерн: polling + Redis cache

GPS-данные высокочастотные (позиция каждые 30-60с во многих сервисах), но в нашем UI обновлять чаще раза в минуту нет смысла. Поэтому:

1. **Cron** (BullMQ repeatable job) каждые **60-120 секунд** тянет позиции авто, у которых `Vehicle.gps = true` и `Vehicle.active = true`.
2. **Кэш в Redis** — ключ `gps:position:<vehicleId>`, TTL 5 минут. Это и горячий кэш для UI, и буфер на случай падения внешнего сервиса.
3. **API endpoint** `/api/v1/integrations/gps/...` читает **только из кэша**, не дёргает внешний сервис на каждый запрос пользователя. Это защищает нас от rate-limit-а вендора и удерживает p99 в миллисекундах.
4. Если внешний API упал/таймаутит — отдаём данные из кэша + флаг `stale: true`, frontend показывает пометку «данные могут быть устаревшими, последнее обновление: NN мин назад».
5. Метрики polling-а (success rate, latency) логируются через Pino + опц. Prometheus.

Webhook-режим (если вендор поддерживает) — улучшение Phase 11+. Для MVP polling проще и надёжнее.

#### Структура модуля

```
apps/api/src/modules/integrations/gps/
├── gps.module.ts
├── gps.controller.ts          # /api/v1/integrations/gps/*
├── gps.service.ts             # фасад: read-from-cache + ownership filter
├── gps.types.ts               # GpsPosition, GpsTrip, GpsProvider interface
├── gps.scheduler.ts           # BullMQ repeatable job для polling-а
├── providers/
│   ├── gps-mock.provider.ts   # дефолт пока нет API access (детерминированные позиции от plateNumber)
│   └── gps-vendor.provider.ts # реальная реализация — заполняется когда будут credentials
└── gps.module-config.ts       # выбор провайдера по env: GPS_PROVIDER=mock|vendor
```

#### Контракт `GpsProvider` (внутренний абстрактный интерфейс)

```ts
// gps.types.ts
export type GpsPosition = {
  vehicleId: string;              // наш UUID
  plateNumber: string;            // для UI без дополнительного lookup
  lat: number;
  lng: number;
  speedKmh: number | null;
  headingDeg: number | null;      // 0-359, опц.
  recordedAt: string;             // ISO timestamp вендора
  fetchedAt: string;              // ISO когда мы это закешировали
  ignitionOn: boolean | null;
  odometerKm: number | null;      // если вендор отдаёт
  source: 'mock' | 'vendor';
};

export type GpsTrip = {
  vehicleId: string;
  startedAt: string;
  endedAt: string | null;
  startLat: number; startLng: number;
  endLat: number | null; endLng: number | null;
  distanceKm: number;
};

export interface GpsProvider {
  getCurrentPositions(plateNumbers: string[]): Promise<GpsPosition[]>;
  getTrips?(plateNumber: string, from: Date, to: Date): Promise<GpsTrip[]>;
}
```

#### Mock-provider (на время отсутствия API access)

Возвращает детерминированные позиции (хеш от `plateNumber` → координаты в окрестности Польши/EU + псевдо-случайное смещение от текущего времени), чтобы фронт можно было разрабатывать и QA-ить против стабильных «как-будто реальных» данных. Даёт UI команде разрабатывать `/fleet/*` экраны параллельно с переговорами по API.

#### Что показываем в UI

- **Список авто** (`/fleet/*` для всех ролей): иконка GPS-точки + relative timestamp (`2 мин назад`) рядом с plateNumber.
- **Деталь авто**: мини-карта с текущим положением (Leaflet + OpenStreetMap tiles — бесплатно, self-hostable, без vendor lock-in).
- **Сравнение пробега** в Claim verification (Phase 4+, после первой реальной интеграции): GPS-пробег за период vs `Claim.mileage` от перевозчика — потенциальная анти-фрод метрика. **Не для MVP** — рисуется как future feature.

#### Endpoints

См. также [13-api-design.md#external-integrations](13-api-design.md#external-integrations--apiv1integrations).

| Method + Path | Доступ | Что возвращает |
|---|---|---|
| `GET /integrations/gps/positions` | любая роль (фильтр по ownership на сервере) | Все актуальные позиции авто, доступных текущему user-у (carrier — свои; opiekun — карьеров; planista/dyspozytor — закреплённых; admin — все) |
| `GET /integrations/gps/positions/:vehicleId` | + ownership-check | Последняя позиция конкретного авто |
| `GET /integrations/gps/trips/:vehicleId?from=...&to=...` | (Phase 11+) | История перемещений |

Все три endpoint-а возвращают `{ position, stale: boolean, lastFetchedAt }` или `{ items, stale, lastFetchedAt }` соответственно. Если `Vehicle.gps = false` — отдаём 404.

#### Cron job

```ts
// gps.scheduler.ts
@Injectable()
export class GpsScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('gps-poll') private q: Queue) {}
  async onApplicationBootstrap() {
    await this.q.add('poll', {}, {
      repeat: { every: 90_000 },   // 90с
      jobId: 'gps-poll-cron',
    });
  }
}
```

`jobId` — статичный, чтобы при рестарте API не плодить дубликаты.

#### Конфигурация (env)

```
GPS_PROVIDER=mock                # mock | vendor (default: mock пока нет credentials)
GPS_VENDOR_BASE_URL=             # заполняется когда будут реквизиты
GPS_VENDOR_API_KEY=              # секрет
GPS_POLL_INTERVAL_SEC=90         # 60-120 разумно
GPS_CACHE_TTL_SEC=300            # 5 минут — больше TTL polling-а, чтобы graceful degrade
```

`.env.example` дополняется этими ключами в Phase 2. Без них модуль автоматически падает в `mock`-режим — никаких runtime-падений из-за пустых секретов.

#### TODO (после получения API access)

1. Заполнить `GpsVendorProvider` под реальный вендор (auth, маппинг полей, error handling).
2. Если у вендора **webhook** mode — добавить endpoint `POST /integrations/gps/webhook` с проверкой подписи + переключить с polling на push.
3. Добавить миграцию `Vehicle.gpsExternalId String?` если plateNumber не прокатывает как identifier.
4. Прописать Uptime Kuma / health-check на «GPS polling успешно отрабатывает за последние 5 минут».
5. Подкрутить TTL кэша / polling-интервал по факту нагрузки.
6. (Опционально) сохранять позиции в долгоиграющую таблицу `vehicle_gps_log` для history-фич.

## Google Chat notifications

> **Не путать с «no chat».** Правило «чат не реализуем» относится к ЛЕГАСИ
> per-claim internal chat внутри приложения (`_cleanupOldChatMessages` и т.п.).
> Здесь речь про **исходящую** нотификацию в внешний Google Chat space через
> incoming webhook — это новая интеграция, а не возврат внутреннего чата.

Когда перевозчик регистрирует выезд (`POST /delegations` → `DelegationsService.add`,
статус `zgloszony`), система постит **сообщение из ровно 4 строк** в постоянный
Google Chat space через incoming-webhook. Триггер — немедленно при создании
выезда, без approval-gate. Доставка — через очередь `chat-notify-wyjazd`
(in-process worker), POST уходит **off the request path** — нотификация **никогда
не ломает и не задерживает** `add()` (enqueue обёрнут в try/catch, warn-only).

### Контракт сообщения (4 строки, TZ Europe/Warsaw)

```
WYJAZD: <departureAt DD/MM/YYYY HH:MM> / <departureCountry> / <departurePostalCode>
ZJAZD: <plannedReturnAt DD/MM/YYYY> / <returnCountry> / <returnPostalCode>
ZESPÓŁ PROWADZĄCY: <planista> / <dyspozytor> / <weryfikator>
OPIEKUN: <opiekun>
```

- `departureAt` — с временем (`HH:MM`); `plannedReturnAt` — только дата.
- Источники команды:
  - planista = `Vehicle.planner.name`, dyspozytor = `Vehicle.dispatcher.name`
    (любое может быть `null` → имя просто **опускается** из строки `ZESPÓŁ`,
    без пустого слота и без `//`).
  - weryfikator = **единственный** активный `User` с ролью `weryfikator`
    (`findFirst … active: true, orderBy createdAt asc`) — НЕ per-vehicle.
    0 активных → опускается; >1 → берётся первый + `logger.warn`.
  - opiekun = `Carrier.opiekun.name` (опекун перевозчика выезда). `null` → `—`.
  - `ZESPÓŁ PROWADZĄCY:` склеивает присутствующие имена через ` / `.

### Конфигурация

- Webhook URL — env `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` (**optional**). Прецедент
  optional-секрета — GPS vendor keys.
- **URL не задан → процессор no-op silently** (job завершается успешно, пишется
  log-skip) — чтобы dev / test / Mailhog не падали. В `.env.example` значение
  пустое.

### Доставка и надёжность

- Очередь `chat-notify-wyjazd`, job name `wyjazd`.
- **Dedup:** стабильный `jobId: 'chat-wyjazd-' + delegationId` — повторный
  enqueue для того же выезда не плодит дубль.
- Retry: `attempts: 5`, `backoff: exponential, delay 2000`. Сам POST —
  10s timeout + 2-3 ретрая на 5xx/network (`postToChatWebhook`, POST-вариант
  GET-only `fetchJsonWithRetry`). На исчерпании ретраев процессор **бросает** —
  BullMQ применяет свою attempt/backoff-политику.

### Future (Tier-2)

@mentions конкретных людей (planista/dyspozytor/opiekun) в Chat-сообщении —
требует Google Chat user IDs (не email/name). Выносим за рамки текущей итерации;
сейчас постим plain-text имена.

## Секреты и конфиги

Все ключи (Gmail private key, S3 credentials, JWT secrets) — в `.env` для dev, в secrets-manager для prod (Railway env vars / AWS Secrets Manager / Doppler).

**НЕ коммитим** `.env` в git. `.env.example` — да.

## Locking

Текущий GAS использует `LockService` для:
- Генерация `nrZgl` (предотвращение коллизий).
- Добавление авто (уникальность `NrRej` в рамках перевозчика).

Замена в Postgres / Redis:

### Postgres advisory lock

```ts
async generateNrZgl(): Promise<string> {
  return await this.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY_NR_ZGL})`;
    const last = await tx.claim.findFirst({
      where: { nrZgl: { startsWith: prefix() } },
      orderBy: { nrZgl: 'desc' },
    });
    const next = increment(last?.nrZgl ?? `GWA/000/${currentMM()}/${currentRR()}`);
    return next;
  });
}
```

`pg_advisory_xact_lock` авто-отпускается при коммите/откате транзакции — нет утечек.

### Redis Redlock (если несколько replic API)

Для blocking операций между несколькими instance API — Redlock алгоритм через `redlock` пакет. Для генерации `nrZgl` достаточно advisory_lock (всё в БД).

## Migration ID generation

Текущий формат `GWA/NNN/MM/RR`:
- `GWA` — префикс gwarancja.
- `NNN` — последовательный номер с reset каждый месяц (?) или год (?).
- `MM` — месяц submit.
- `RR` — год (2 цифры).

**Решение в Postgres:** держим `claim_sequences` таблицу:

```prisma
model ClaimSequence {
  yearMonth  String  @id      // '26-05'
  lastNumber Int     @default(0)
}
```

И atomic increment:

```ts
async nextNrZgl(): Promise<string> {
  const ym = `${pad2(year())}-${pad2(month())}`;
  const updated = await this.prisma.claimSequence.upsert({
    where: { yearMonth: ym },
    update: { lastNumber: { increment: 1 } },
    create: { yearMonth: ym, lastNumber: 1 },
  });
  return `GWA/${pad3(updated.lastNumber)}/${pad2(month())}/${pad2(year())}`;
}
```

Atomic — без advisory lock. Точная семантика increment гарантирована Postgres.

## Логирование

- **Pino** (структурный JSON).
- В prod — отправка в Logtail / Better Stack / S3.
- PII redaction: заголовки `Authorization`, `cookie`, поля `password`, `code`.

```ts
// main.ts
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.code',
            '*.password',
            '*.passwordHash',
            '*.refreshToken',
          ],
          censor: '***',
        },
        autoLogging: { ignore: req => req.url === '/health' },
      },
    }),
  ],
})
export class AppModule {}
```

## Мониторинг

- **Health-чек**: `/health` (liveness), `/ready` (DB + Redis ping). Uptime Kuma на том же VPS пингует оба endpoint-а раз в минуту, шлёт алерты в email/Telegram при падении.
- **Логи**: Pino → stdout контейнера → Docker json-file driver. `docker logs -f magguarantee-api` для tail, ротация по `max-size`/`max-file` в `docker-compose.yml` (см. [18-launch-and-deployment.md](18-launch-and-deployment.md)) — иначе лог-файлы могут забить диск.
- **Ошибки**: ловятся через Pino-логи (level=error). Отдельного error-tracking SaaS не подключаем — для масштаба 15–20 одновременных пользователей хватает грепа по journal.
- **Metrics** (опц., если понадобится): Prometheus через `@willsoto/nestjs-prometheus` + локальная Grafana на том же VPS.

## Что НЕ делаем

- Внутренний per-claim чат — выпиливается полностью (см. [17-migration-roadmap.md#что-мы-не-делаем](17-migration-roadmap.md)). Это про легаси-чат внутри приложения, а **не** про исходящую Google Chat нотификацию о выездах ([Google Chat notifications](#google-chat-notifications)) — та реализована.
- Долгая сессия для интеграций (VIES, Biała Lista) — все запросы синхронны, в крайнем случае job очереди.
- Push-нотификации в браузер — пока не запрошено.
- Real-time updates через WebSockets — нет необходимости (нет чата, верификация — индивидуальная).
