# 16. Jobs, email, внешние интеграции

> Всё, что в GAS было через Triggers, MailApp, UrlFetchApp.

## Background jobs (cron) — BullMQ

### Что переносим

| GAS-trigger | GAS функция | Частота | Куда |
|---|---|---|---|
| Daily reminders | `sendDailyReminders` (`Code.gs:6987`) | ежедневно 08:00 | BullMQ scheduled job |
| Weekly report | `sendWeeklyReport` (`Code.gs:7056`) | пн 09:00 | BullMQ scheduled job |
| onEdit | `onEditTrigger` (`Code.gs:6977`) | реал-тайм при правке Sheet | **Не нужен** (нет Sheets) |
| onOpen | `onOpen` (`Code.gs:6950`) | при открытии Sheet | **Не нужен** |
| Refresh-token cleanup | — (новое) | ежедневно | BullMQ scheduled job |

> Чат не реализуем (см. [17-migration-roadmap.md#что-мы-не-делаем](17-migration-roadmap.md)) — `_cleanupOldChatMessages` из `Code.gs` пропускаем.

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

Все исходящие email идут через очередь, не sync. Преимущество:
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

```ts
// modules/integrations/white-list/white-list.service.ts
async checkAccount(nip: string, account: string): Promise<WhiteListResult> {
  const url = `https://wl-api.mf.gov.pl/api/check/nip/${nip}/bank-account/${account}?date=${today()}`;
  return await this.fetchWithRetry(url);
}
```

Кешируем на 1 час — вайт-листы могут обновляться.

### info-car.pl

URL builder, не запрос API:

```ts
// modules/integrations/inspection/inspection.service.ts
buildLink(vin: string): string {
  return `https://info-car.pl/inspections?vin=${encodeURIComponent(vin)}`;
}
```

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
- **Логи**: Pino → stdout → systemd journal. `journalctl -u magtrans-api -f` для tail, `logrotate` чтобы journal не съел диск.
- **Ошибки**: ловятся через Pino-логи (level=error). Отдельного error-tracking SaaS не подключаем — для масштаба 15–20 одновременных пользователей хватает грепа по journal.
- **Metrics** (опц., если понадобится): Prometheus через `@willsoto/nestjs-prometheus` + локальная Grafana на том же VPS.

## Что НЕ делаем

- Чат — выпиливается полностью (см. [17-migration-roadmap.md#что-мы-не-делаем](17-migration-roadmap.md)).
- Долгая сессия для интеграций (VIES, Biała Lista) — все запросы синхронны, в крайнем случае job очереди.
- Push-нотификации в браузер — пока не запрошено.
- Real-time updates через WebSockets — нет необходимости (нет чата, верификация — индивидуальная).
