# 22. Email design system (транзакционные письма)

> **Статус:** AUTHORITATIVE с 2026-07-27. Единый шаблон для **всех** системных
> писем MAGGuarantee. Источник — макет заказчика «Правила дизайна писем» (Claude
> Design). Реализовано в `magguarantee-app/apps/api/src/modules/mail/templates/`.
>
> Это **отдельная** дизайн-система от веб-приложения ([14-design-system.md](14-design-system.md)):
> почтовые клиенты не поддерживают CSS-переменные, `dark:`-варианты, flex/grid и
> веб-шрифты, поэтому письма — это **table-based вёрстка на инлайн-стилях**.
> Красный акцент писем — `#E02020` (близкий, но **не равный** веб-бренду
> `#dc2626`; менять веб-токены не нужно).

## Принцип

**Один шаблон на все письма.** Меняется только содержимое блоков — шапка,
типографика, отступы, футер остаются теми же. Всё это живёт в двух общих файлах,
а каждый шаблон лишь наполняет слоты:

| Файл | Роль |
|---|---|
| `templates/_theme.ts` | Токены (цвета, шрифт, размеры) + style-объекты + карта бейджей |
| `templates/MailLayout.tsx` | Каркас + строительные блоки (`MailLayout`, `DataSection`, `FieldRow`, `AmountPanel`, `StatusBadge`, `CodePanel`, `Cta`, `Note`, `Block`, `Paragraph`) |

Рендер — `@react-email/render` в `mail.service.ts` (без изменений в pipeline).
Оболочку (`<Html>/<Head>/<Preview>/<Body>`) даёт react-email; всё внутри карточки —
**вручную написанные `<table role="presentation">`** для byte-faithful соответствия
макету.

## 1. Цвета

| Токен (`colors.*`) | HEX | Назначение |
|---|---|---|
| `brand` | `#E02020` | Акцент: кнопка, ссылка, одно критичное значение на письмо (напр. недобор км) |
| `brandDark` | `#B31616` | Ссылка в hover |
| `ink` | `#1C1B19` | Заголовки, значения полей |
| `text` | `#6E6B66` | Подписи полей, текст абзацев |
| `muted` | `#8A8783` | Надзаголовки (overline/eyebrow), футер |
| `canvas` | `#F2F1EF` | Фон полотна (за карточкой) |
| `surface` | `#FFFFFF` | Карточка |
| `panel` | `#F7F6F4` | Панель итоговой суммы |
| `footer` | `#FAFAF9` | Полоса футера |
| `border` | `#E3E1DD` | Линии-разделители и рамка карточки |

Красный — **только для одного акцента на письмо**: кнопка, критичное значение,
overline темы. Никаких градиентов и цветных «шапок» на всю ширину.

## 2. Типографика

- Шрифт — `Arial, Helvetica, sans-serif` (`fontFamily`). Веб-шрифтов нет.
- **Overline** (надзаголовок секции): 11px, uppercase, letter-spacing 1.4, `muted`
  (или `brand` для темы письма).
- **H1** (номер документа / заголовок): 26px bold, line-height 32 (на моб. 22px).
- **Подпись поля**: 14px `text`. **Значение**: 14px **bold** `ink`.
- **Сумма** (главное число): 32px bold (на моб. 28px). **Абзац**: 13–14px, LH 19–22.
- **Футер**: 12px `muted`. Ниже 12px не опускаться.

## 3. Сетка и отступы

- Ширина письма **600px**, фон полотна `canvas`, карточка белая с рамкой 1px,
  radius 4.
- Горизонтальные поля карточки — **32px** (на моб. 20px через класс `.px`).
  Единая левая линия для всего текста.
- Шаг вертикали кратен 4/8. Между строками полей 8px, между секциями —
  разделитель `border` + 18px до надзаголовка следующей секции.
- Двухколоночные строки «подпись → значение», левая колонка **180px**.

Адаптивность — только через `@media (max-width:620px)` в `<Head>` (`headStyleBlock`),
работает по классам `.container` / `.px` / `.h1` / `.amount`. Всё остальное фиксировано
инлайн.

## 4. Блоки шаблона

1. **Шапка** (`Header`) — логотип слева (170px) / имя системы «MAGGuarantee»
   справа / нижняя линия. Логотип: `<img>` при заданном `MAIL_LOGO_URL`, иначе
   текстовый вордмарк «MAGTRANS» красным (self-contained, без удалённых ресурсов).
2. **Тема** (`TitleBlock`) — красный overline → номер документа (H1) → статус-бейдж.
3. **Секции данных** (`DataSection` + `FieldRow`) — надзаголовок + строки
   «подпись/значение», сверху линия.
4. **Итог** (`AmountPanel`) — серая панель `panel` с ключевой суммой.
5. **Код/учётка** (`CodePanel`) — центрированная моно-панель (2FA-код, reset-код,
   временный пароль). Варианты `ink` / `brand` / `light`.
6. **Действие** (`Cta`) — одна красная кнопка (`<td bgcolor>` + `display:block`
   ссылка, **не картинка**) + одна строка пояснения (`Note`).
7. **Футер** (`Footer`) — компания/адрес, «wygenerowana automatycznie» и **политика
   ответа**. По умолчанию — «Nie odpowiadaj na tę wiadomość — skrzynka nie jest
   obsługiwana»: `From` = no-reply Google Group, входящее она не принимает
   ([16 §Односторонний канал](16-jobs-and-integrations.md#односторонний-канал--no-reply-google-group)).
   Проп `replyExpected` переключает строку на «Odpowiedz na tę wiadomość…» —
   его выставляет **только** `maksim-confirmation-request`, единственное письмо
   с заголовком `Reply-To`. Правило: **есть `Reply-To` ⇒ ответа ждут**. Ту же
   строку добавляет к plain-text-версии `MailService._send` (одна точка на все
   шаблоны).

## 5. Статусы (бейджи)

Четыре стиля, ключ — `Tone` из `_theme.ts` (`badgeStyles`):

| Tone | Пример | bg | border | fg |
|---|---|---|---|---|
| `warning` | Oczekuje na weryfikację | `#FDF0E4` | `#F2D9BF` | `#8A5A16` |
| `success` | Zatwierdzony / Aktywne | `#E9F3EC` | `#CBE2D3` | `#2A6B42` |
| `danger` | Odrzucony / Dezaktywowane | `#FCEBEB` | `#F3CFCF` | `#B31616` |
| `neutral` | Wersja robocza / период | `#F1F1EF` | `#E0DEDA` | `#6E6B66` |

Семантика домена сохранена: решение по wniosek'у (`success` = ZAAKCEPTOWANO,
`danger` = ODRZUCONO) теперь выражается **бейджем**, а не тонированной шапкой.

## 6. Технические правила

- Вёрстка только на `<table role="presentation">`, все стили — **инлайн**. Без
  flex, grid, JS.
- Прехедер — компонент `<Preview>` (react-email рендерит скрытую строку первой в body).
- Кнопка — `<td bgcolor>` со ссылкой `display:block`, **не картинка**.
- Логотип — PNG с прозрачным фоном, ширина 170px, обязателен `alt="MAGTRANS"`.
  Без удалённых ресурсов по умолчанию → вордмарк-фолбэк.
- **Никаких дублей стилей в шаблонах** — только общий слой (`_theme` + `MailLayout`).
  Раньше 3 шаблона (`maksim-confirmation-request`, `password-reset`,
  `verification-digest`) инлайнили свои копии — это выпилено.

### Логотип (`MAIL_LOGO_URL`)

`Header` рендерит `<img src={MAIL_LOGO_URL} width=170 alt="MAGTRANS">`, когда env
задан; иначе — текстовый вордмарк «MAGTRANS» красным. Дев/Mailhog/тесты остаются
полностью self-contained (без удалённого фетча). Рекомендуемое prod-значение:
`https://www.magtrans.eu/img/logo.png`. Шаблон читает `process.env.MAIL_LOGO_URL`
напрямую (чисто презентационная константа); в `env.schema.ts` ключ опционален и
валидируется как URL.

## 7. Матрица адаптации (какой шаблон что показывает)

| Шаблон | Overline | Статус-бейдж | Amount/Code | CTA |
|---|---|---|---|---|
| `carrier-submitted` | Nowy wniosek o gwarancję | `warning` Oczekuje na weryfikację | AmountPanel (kwota) | Otwórz wniosek (только staff) |
| `carrier-decision` | Decyzja w sprawie wniosku | tone решения (`success`/`danger`) | AmountPanel (kwota, если accept) + текст MAGTRANS (`decisionComment`, если есть) под «Uzasadnienie decyzji» (ZAAKCEPTOWANO) / «Powód odrzucenia» (ODRZUCONO). Заметку перевозчика (`comment`) **не** показывает | Otwórz wniosek |
| `internal-decision` | Decyzja w sprawie wniosku | tone решения | AmountPanel + тот же блок решения («Uzasadnienie decyzji» / «Powód odrzucenia») + отдельный блок «Komentarz przewoźnika» (`comment`), если перевозчик оставил заметку | Otwórz w MAGGuarantee (`/employee/claims?nrZgl=…`) |
| `maksim-confirmation-request` | Potwierdzenie autoryzacji | `warning` Oczekuje na autoryzację | AmountPanel (dopłata, red) | Otwórz w MAGGuarantee + `replyExpected` (единственный) |
| `reklamacja-internal-submitted` | Reklamacja | `warning` Reklamacja do rozpatrzenia | AmountPanel (kwota reklamacji, red) | Otwórz w MAGGuarantee |
| `reklamacja-carrier-submitted` | Reklamacja | `warning` Reklamacja w toku | AmountPanel (kwota reklamacji, red) | Otwórz wniosek |
| `reklamacja-carrier-decision` | Decyzja w sprawie reklamacji | по `reklamacjaResolution`: `success` Reklamacja uznana / `danger` Reklamacja odrzucona | AmountPanel (kwota do wypłaty — **только** при `UZNANA`) | Otwórz wniosek |
| `verification-digest` | Dzienny przegląd | `warning` (счётчик) | — (списки; с 2026-10-22 строки рекламаций (`REKLAMACJA`) несут серый inline-пилл «Reklamacja» — `InlineBadge` в `MailLayout.tsx`, `neutral`, не `warning`, чтобы не сливаться с янтарным «zbliża się termin») | Otwórz panel weryfikacji |
| ~~`daily-reminder`~~ | — | — | — | ❌ удалён 2026-07-30 (дублировал `verification-digest`) |
| `guarantee-reminder-carrier` | Przypomnienie | `warning` Zbliża się termin | — (таблица) | Zgłoś wyjazd |
| `guarantee-opiekun-digest` | Gwarancje | — | — (группы) | — |
| `vehicle-removal-admin` | Flota | `danger` (счётчик) | — (список) | — |
| `delegation-announced` | Wyjazd | — | — | — (только перевозчику — подтверждение zgłoszenia; внутренние узнают о выезде из Google Chat) |
| `delegation-ready` | Wyjazd | `success` **Załadowany** | CodePanel `light` (nr zlecenia ze spedu) | — |
| `weekly-report` | Raport | `neutral` (период) | — (строки) | Otwórz panel |
| `account-created` | Twoje konto | — | CodePanel `light` (пароль) | Zaloguj się |
| `account-deactivated` | Twoje konto | `danger` Dezaktywowane | — | — |
| `account-reactivated` | Twoje konto | `success` Aktywne | — | Zaloguj się |
| `login-code` (2FA) | Logowanie | — | CodePanel `ink` | — |
| `password-reset` | Bezpieczeństwo | — | CodePanel `brand` | — |

**Правило:** письма аутентификации/учётки (`login-code`, `password-reset`,
`account-*`) **без номера документа** — H1 несёт обычный заголовок, бейдж
опционален.

## 8. Известные упрощения / follow-up

- **Локализация чисел и дат.** Макет требует неразрывный пробел в разрядах,
  десятичную запятую и даты `dd.MM.yyyy`. Сейчас значения приходят из
  `mail.service.ts`/`claims.service.ts` как есть (точка-разделитель, ISO-даты).
  Формат — забота слоя данных, не шаблона; **рекомендуемый follow-up** — вынести
  форматирование в общий helper и применить к html + plain-text одновременно.
- **Тема письма (subject).** Макет предлагает шаблон `MAGGuarantee · Nowy
  wniosek GWA/006/07/26`. Текущие subject'ы уже несут ключ (nrZgl) и **не
  менялись** в этом слайсе, чтобы не трогать наблюдаемое поведение / threading.
  Опциональный follow-up — единый префикс `MAGGuarantee · …`.
- **Ссылка на настройки уведомлений** в футере из макета опущена — маршрута ещё
  нет; добавить, когда появится страница настроек.
- **Plain-text fallback** decision-писем (`buildDecisionText` в
  `templates/_decision-copy.tsx`, 2026-10-22) несёт те же заголовки блоков, что
  и html («Uzasadnienie decyzji» / «Powód odrzucenia» / «Komentarz
  przewoźnika»). Блоки свободного текста — общий `LabelledTextBlock` (eyebrow +
  абзац `pre-line`) на существующих токенах, новых токенов нет.
- **Plain-text fallback** остальных писем в `mail.service.ts` не менялся (структура писем и так
  отличается от html) — только html-скин.
```
