# 14. Design system

> Дизайн нового приложения = дизайн текущего GAS-проекта. Ничего не «переделываем красивее» — переносим то, что есть, чтобы пользователи не заметили смену стека. Источник истины для текущего дизайна — [index.html:8–503](../index.html#L8) (секция `<style>`).

## Где лежит CSS в legacy

| Строки `index.html` | Что |
|---|---|
| 1–7 | `<head>`, импорт Google Fonts (DM Sans, weights 400–800) |
| **8–22** | CSS-переменные light-темы (`:root`) |
| **23–62** | CSS-переменные dark-темы (`body.dark`) |
| **63–187** | Dark-mode overrides для inline-стилей и компонентов (150+ строк хаков) |
| **189–270** | Чат (выпиливается), копирование, флот-кнопки, темы переключения |
| **272–276** | Theme toggle |
| **278–285** | Reset + body |
| **286–320** | Login screen |
| **322–345** | App header + tabs |
| **347–357** | KPI cards |
| **359–372** | Card + table + filters |
| **374–379** | Status chips |
| **381–409** | Modal |
| **411–417** | Form (carrier) |
| **419–426** | Timeline / claim cards |
| **428–438** | Loading + empty + success banner |
| **440–465** | Rating sliders + radio-cards |
| **467–502** | Dashboard layout + responsive |

## Брендовая палитра

Главный цвет — **MAGTRANS RED** `#dc2626`. До недавнего времени в коде был «blue» — это переменная `--blue` сейчас содержит red (см. [index.html:11](../index.html#L11)).

### Surface-token policy (`bg-input` is the soft-chrome surface)

**Locked decision (Phase 4.4 audit).** Earlier prose в этом документе ссылается на `bg-bg-soft` для filter-bars, audit-row expanded state и JSON-diff `<pre>`-блоков. Такого токена в `globals.css` нет и не будет — его роль полностью покрывается `bg-input`.

| | Token | Light | Dark | Purpose |
|---|---|---|---|---|
| Page background | `bg-bg` | `#f5f5f5` | `#121212` | Body / page shell. |
| Card surface | `bg-card` | `#ffffff` | `#1f1f1f` | Tables, modals, sidebar, cards. |
| **Soft chrome / inputs** | **`bg-input`** | `#fafafa` | `#262626` | Form fields, filter-bars, hover-emphasis on toggle buttons, JSON-diff blocks, audit-row expanded panel, disabled/read-only inputs, FileUpload dropzone, MultiSelect trigger, code-box (empty). |
| Brand-tinted hover | `bg-brand-50` (light) / `bg-brand/10` (dark) | `#fef2f2` | `rgba(220,38,38,.10)` | Row hover, active nav-item. |

Rule of thumb: если ты пишешь «нужен едва-серый фон, чуть темнее карточки, чтобы поле/панель выделялась» — это `bg-input`. Если нужно подчеркнуть бренд (hover на интерактивных строках/линках) — `bg-brand-50` + dark variant. Никаких новых neutral-уровней между `bg-bg` и `bg-card`.

Все исторические упоминания `bg-bg-soft` ниже по тексту следует читать как `bg-input`; точечные правки прошли в Phase 4.4 audit.

### Цветовые токены (light)

```css
/* Извлечено из :root, index.html:9-22 */
--magtrans-red: #dc2626;
--magtrans-red-light: #ef4444;
--magtrans-red-dark: #991b1b;
--blue: #dc2626;        /* alias к magtrans-red — для обратной совместимости */
--blue-d: #b91c1c;
--blue-bg: #fef2f2;

--green: #22c55e;
--green-d: #16a34a;
--green-bg: #f0fdf4;

--red: #ef4444;
--red-bg: #fef2f2;

--orange: #f97316;
--orange-bg: #fff7ed;

--yellow: #eab308;
--yellow-bg: #fefce8;

--purple: #8b5cf6;

/* нейтрали */
--navy: #1a1a1a;        /* текст основной */
--navy-l: #2d2d2d;
--navy-m: #404040;
--g100: #f5f5f5;
--g200: #e5e5e5;
--g300: #d4d4d4;
--g400: #a3a3a3;
--g500: #737373;
--g600: #525252;
--g900: #171717;
--white: #fff;

/* семантика поверхности */
--card-bg: #fff;
--body-bg: #f5f5f5;
--table-hover: #fef2f2;
--input-bg: #fafafa;
--border: #e5e5e5;
--text: #171717;
--text-sub: #737373;

/* радиусы и тени */
--r: 12px;
--shadow: 0 4px 24px rgba(220, 38, 38, .08);
```

### Цветовые токены (dark, body.dark)

```css
--navy: #0a0a0a;
--blue: #ef4444;
--blue-bg: rgba(220, 38, 38, .15);

--g100: #262626;
--g200: #404040;
--g300: #525252;
--g400: #a3a3a3;
--g500: #d4d4d4;
--g600: #e5e5e5;
--g900: #fafafa;

--card-bg: #1f1f1f;
--body-bg: #121212;
--table-hover: rgba(220, 38, 38, .1);
--input-bg: #262626;
--border: #404040;
--text: #f5f5f5;
--text-sub: #a3a3a3;

--shadow: 0 4px 24px rgba(0, 0, 0, .4);
```

## Типографика

- **Шрифт:** DM Sans (Google Fonts). Fallback: `-apple-system, sans-serif`.
- **Веса:** 400, 500, 600, 700, 800. 800 для крупных заголовков.
- **Mono:** `'DM Mono', monospace` для финансов / номеров. Подгрузить как опцию.

| Стиль | Размер | Вес | Где |
|---|---|---|---|
| Display (logo) | 22px / 28px | 800 | Login заголовок |
| H2 (header) | 17px | 700 | App-header |
| H3 (section) | 15–17px | 700 | Card-header, modal-header |
| Body | 13–15px | 400–500 | Тело |
| Label | 12px | 700 uppercase, letter-spacing .5px | Form-group label |
| Caption | 11px | 700 uppercase | KPI label |
| Mono | 12px | regular | Финансы, IBAN |

## Скругления и тени

- **Radius:** 8px (small buttons, code-box), 10px (form inputs), 12px (cards, modals), 14px (KPI), 16px (login-card, modal внутренний), 20px (chip pill).
- **Shadows:**
  - `--shadow`: hover карт, `0 4px 24px rgba(220,38,38,.08)`.
  - Login-card: `0 8px 32px rgba(0,0,0,.08)`.
  - Modal: `0 24px 64px rgba(0,0,0,.2)`.
  - Toast: `0 8px 24px rgba(0,0,0,.2)`.

## Tailwind конфигурация

`apps/web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // brand
        brand: {
          DEFAULT: '#dc2626',
          light: '#ef4444',
          dark: '#991b1b',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // semantic
        success: { DEFAULT: '#22c55e', dark: '#16a34a', bg: '#f0fdf4' },
        danger:  { DEFAULT: '#ef4444', dark: '#dc2626', bg: '#fef2f2' },
        warning: { DEFAULT: '#f97316', dark: '#c2410c', bg: '#fff7ed' },
        info:    { DEFAULT: '#eab308', dark: '#a16207', bg: '#fefce8' },
        // surfaces (refs to CSS vars — поддержка обеих тем)
        bg:           'rgb(var(--bg) / <alpha-value>)',
        card:         'rgb(var(--card) / <alpha-value>)',
        input:        'rgb(var(--input) / <alpha-value>)',
        border:       'rgb(var(--border) / <alpha-value>)',
        text:         'rgb(var(--text) / <alpha-value>)',
        'text-sub':   'rgb(var(--text-sub) / <alpha-value>)',
        navy:         'rgb(var(--navy) / <alpha-value>)',
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '12px',
        lg: '14px',
        xl: '16px',
      },
      boxShadow: {
        card:   '0 4px 24px rgba(220,38,38,.08)',
        login:  '0 8px 32px rgba(0,0,0,.08)',
        modal:  '0 24px 64px rgba(0,0,0,.2)',
        toast:  '0 8px 24px rgba(0,0,0,.2)',
      },
      fontFamily: {
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        modalIn: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        modalPop: { from: { opacity: '0', transform: 'scale(.85)' }, to: { opacity: '1', transform: 'scale(1)' } },
        slideIn: { from: { opacity: '0', transform: 'translateX(-10px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        blinkRed: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.3' } },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'modal-in':    'modalIn .2s ease',
        'modal-pop':   'modalPop .18s ease',
        'slide-in':    'slideIn .2s ease',
        'blink-red':   'blinkRed 1s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
};

export default config;
```

`apps/web/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* light */
    --bg: 245 245 245;
    --card: 255 255 255;
    --input: 250 250 250;
    --border: 229 229 229;
    --text: 23 23 23;
    --text-sub: 115 115 115;
    --navy: 26 26 26;
  }

  [data-theme="dark"] {
    --bg: 18 18 18;
    --card: 31 31 31;
    --input: 38 38 38;
    --border: 64 64 64;
    --text: 245 245 245;
    --text-sub: 163 163 163;
    --navy: 10 10 10;
  }

  body {
    @apply bg-bg text-text font-sans antialiased min-h-screen;
  }
}
```

> Важное правило: dark mode реализуется через CSS-переменные на корне, **без 150 строк хаков на `[style*="..."]`**, как было в legacy. Inline `style=` отсутствует — все стили через Tailwind utility classes, потому проблема перебивания не существует.

## Каталог компонентов (shadcn + custom)

### Базовые (shadcn install)

```bash
npm exec -w web -- shadcn@latest add button input label dialog \
  dropdown-menu select tabs table toast tooltip badge \
  card popover separator skeleton sheet form
```

| Component | Замена | Замечания |
|---|---|---|
| `<Button>` | `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm` (`index.html:300-316`) | Варианты: `default` (brand-red), `outline`, `ghost`, `success`, `danger`, `warning` |
| `<Input>` | `.form-group input`, `.new-claim-form input` | + InputWithLabel composition |
| `<Dialog>` | `.modal-overlay` + `.modal` (`index.html:381-409`) | Все 18+ модалов из `index.html` → этот компонент |
| `<Select>` | `.filters select`, кастомные dropdown-ы (`#pojazdDropdown`) | Radix-based, доступный |
| `<Tabs>` | `.tabs` + `.tab` (`index.html:341-345`) | Стилизуем под brand-red active |
| `<Table>` | `<table>` (`index.html:367-372`) | Используется внутри `DataTable` |
| `<Badge>` / `<Chip>` | `.chip-green/red/yellow/orange` (`index.html:374-379`) | Семантические варианты |
| `<Toast>` (sonner) | `showAlert`, `#appAlertOverlay`, `#copyToast` | Универсальная замена |

### Custom (наши)

| Компонент | Замена | Где использовать |
|---|---|---|
| `<KpiCard>` | `.kpi`, `.kpi-blue/green/red/orange/purple` | Dashboard карточки |
| `<StatusChip>` | `.chip-*` + логика по `ClaimStatus` | Таблицы, карточки |
| `<ClaimCard>` | `.claim-card` (`index.html:419-426`) | Carrier timeline |
| `<DataTable>` | таблицы с фильтрами/сортировкой | Все списки (`getAllClaims`, `getCarriersList`, …) |
| `<EmptyState>` | `.empty` (`index.html:432`) | Когда список пуст |
| `<Spinner>` / `<Loading>` | `.spinner`, `.loading-center` | Заменяет `<div class="loading-center">` |
| `<SuccessBanner>` | `.success-banner` | После submit |
| `<RatingSlider>` | `.rating-slider`, `.tap-rating`, `.tap-btn` | В оценках |
| `<RadioCardGroup>` | `.radio-card` (`index.html:454-459`) | Decision-выбор в верификации |
| `<CodeBox>` | `.code-box` (`index.html:387-390`) | 6-значный 2FA-код |
| `<CopyableValue>` | `.copyable` + `#copyToast` | NIP, IBAN — клик чтобы скопировать |
| `<DashboardSidebar>` | `#dashSidebar` + `.ds-item` (`index.html:467-486`) | Левый sidebar в dashboard |
| `<ThemeToggle>` | `.theme-toggle` (`index.html:272-276`) | В app-header |
| `<ReklamacjaResolutionChip>` | — (нет в legacy: статус больше не несёт исход рекламации) | Wynik reklamacji `UZNANA`/`ODRZUCONA`/pending — carrier detail, `<ClaimCard>`, employee `<ClaimsTable>`, `ClaimModal`. Тонкая обёртка над `<Badge>`, см. «Reklamacja — carrier claim-detail outcome block» + §6.5.15 |
| `<ReklamacjaOutcome>` | — | Карточка исхода рекламации на carrier claim detail (`ReklamacjaOutcome.tsx`) |
| `<UserPermissionsBlock>` | — (нет в legacy) | Композиция в `UserSheet`: «Dodatkowe» / «Odebrane» / «Uprawnienia efektywne» (docs/25 B6, 2026-10-27). См. «`UserSheet` — блок «Uprawnienia indywidualne»» |
| `<CarrierDocumentsTab>` | — | Каталог документов фирмы + обзор флота (§5R); с 2026-10-27 общий для opiekun и перевозчика с `carrier_documents.read` (`components/documents/`). См. «Carrier «Dokumenty» tab» |

## Скриншоты компонент-критичных мест

> **TODO для разработчика:** перед началом миграции UI сделать скриншоты текущего GAS-приложения для всех 8 экранов и 18+ модалов. Сохранить в `docs/screenshots/<screen-name>.png`. Это будет визуальный референс для pixel-perfect переноса.

Минимальный набор:
- `login.png`, `login-2fa.png`
- `carrier-claims.png`, `carrier-new-claim.png`, `carrier-fleet.png`, `carrier-delegations.png`
- `employee-dashboard.png`, `employee-claims-list.png`, `employee-status-modal.png` (главный модал верификации)
- `employee-carriers.png`, `employee-vehicles.png`, `employee-vehicle-details.png`
- `opieka-stats.png`, `opieka-carriers.png`
- `planista-fleet.png`, `dyspozytor-fleet.png`, `weryfikator-delegations.png`
- `dark-mode-comparison.png`

## Брендинг

- Логотип: `https://www.magtrans.eu/img/logo.png` (скачать в `apps/web/public/logo.png`).
- Favicon: создать ico/svg на основе логотипа.
- Заголовок страницы: «MAGGuarantee» (как в текущем `<title>`).
- В footer / about — ссылка на `https://www.magtrans.eu`.
- **Email — отдельная дизайн-система:** транзакционные письма НЕ используют
  веб-токены. Своя палитра (красный `#E02020`), table-based вёрстка на инлайн-стилях,
  логотип-в-шапке через env `MAIL_LOGO_URL` (иначе текстовый вордмарк). Полная
  спецификация — [22-email-design.md](22-email-design.md).

## Иконки

В legacy используются эмодзи прямо в тексте:
- 📋 Wnioski, ➕ Nowy, 🚛 Flota, 🗺️ Wyjazdy, ✅ Zaakceptowano, ❌ Odrzucono, ⏳ Weryfikacja, ⚠️ Reklamacja, 🔄 Odśwież, 🌙 Ciemny, 🏢 Panel, 🔍 Szukaj, 📅 (date picker), ⎘ (copy).

**Решение:**
- В заголовках разделов и важных кнопках — эмодзи оставляем (быстрое опознание, узнаваемость).
- Для UI-элементов (search, calendar, copy) — переходим на **Lucide React** (`Search`, `Calendar`, `Copy`, `Check`, `X`, `Moon`, `Sun`, `Building2`, `Truck`).
- Status: эмодзи + текст в `<StatusChip>` (`<CheckCircle2 size={12} /> Zaakceptowano`).

Это компромисс: пользователи привыкли к эмодзи (это часть UX), но для иконок-управлений (поиск, копирование) аккуратные SVG-иконки выглядят профессиональнее.

## Адаптивность

Текущие breakpoint-ы (`index.html:487-501`):
- `(max-width: 900px)` — планшет: dashboard sidebar складывается в горизонтальные табы.
- `(max-width: 640px)` — моб.: login-card сужается, KPI 2 колонки, таблица меньшим шрифтом.

В Tailwind: используем стандартные `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`. Конкретно:
- `lg:grid-cols-...` для KPI row.
- `md:hidden` / `md:block` для sidebar/topbar в dashboard.
- Mobile-first писать стили без префикса, добавлять через `md:`.

## Анимации

| Анимация | Где | Tailwind |
|---|---|---|
| `modalIn` (translateY 10→0) | модалы | `animate-modal-in` |
| `modalPop` (scale .85→1) | toast/alert | `animate-modal-pop` |
| `slideIn` (translateX -10→0) | dashboard panels | `animate-slide-in` |
| `blinkRed` | срочные таймеры | `animate-blink-red` |
| `spin` (loading) | spinner | `animate-spin` (нативный) |

## Что НЕ переносим из legacy CSS

| Не переносим | Почему |
|---|---|
| 1 375 inline `style=` | Их нет в новом коде (Tailwind utilities) |
| 300+ inline `onclick=` | React event handlers |
| 150 строк dark-mode `body.dark [style*=]` хаков | Не нужны — стили через Tailwind |
| `body.dark` правила-переопределения для каждого компонента | Используем CSS-переменные + `dark:` |
| `!important` повсюду | Не используем (специфичность через Tailwind) |
| Кастомные scrollbar (если были) | shadcn/Radix имеют встроенные |

## Чек-лист для каждого экрана

При переписывании экрана из `index.html` в Next.js:

- [ ] Сделан скриншот текущего экрана (light + dark).
- [ ] Идентифицированы все компоненты на экране (KPI, table, modal, …).
- [ ] Tailwind-классы приближаются к текущему виду; цвета берутся из brand-палитры.
- [ ] Dark mode работает без хаков (только через `dark:` варианты, если нужны корректировки).
- [ ] Адаптивность сохранена: проверить на 360px, 768px, 1280px.
- [ ] Анимации не отличаются (модалки появляются с тем же easing).
- [ ] Эмодзи в названиях табов и заголовков — на месте.
- [ ] Логотип в header — `MAGTRANS` SVG/PNG.
- [ ] Шрифт DM Sans подгружен (через `next/font` для no-FOUT).

## Phase 1: login & verify components

> Спецификация для первого слайса (auth: login + 2FA email-code). Источник legacy: `index.html:286-331` (login screen), `index.html:387-390` (code-box), `index.html:507-559` (HTML структура двухшаговой формы), скриншоты `docs/screenshots/login.png` и `docs/screenshots/login-2fa.png`.
>
> Все токены ниже композируются из уже определённой палитры (`brand-*`, `card`, `border`, `input`, `text`, `text-sub`) и шкал (`rounded-*`, `shadow-*`). Новые primitives не вводятся.

### Решения, отличающиеся от legacy

| Что в legacy | Решение в новом UI | Причина |
|---|---|---|
| Two radial-gradient ornaments на `#loginScreen` (`::before` 600×600, `::after` 400×400) | **Сохраняем** — ornaments узнаваемая часть бренда, дёшевы (CSS, не картинки), хорошо смотрятся на широких экранах. Реализация — два абсолютно-позиционированных `<div>` или `::before/::after` через arbitrary Tailwind. | Брендовая идентичность; subtle, не «джимиковые». |
| Background `linear-gradient(135deg,#fafafa,#f5f5f5)` | Заменяем на `bg-bg` (CSS-var, работает в обоих темах). В dark = `#121212`. | Унификация с остальным app, чтобы не было особого правила «в логине свой фон». |
| `🚛` emoji-icon в круге (56×56, brand-red фон) | **Сохраняем** — это визуальный «чип» страницы, узнаваемо. | Часть voice (см. секцию «Иконки»). |
| `MAGTRANS` PNG-логотип в левом-верхнем углу (`.login-brand`, top:24px left:32px, height:52px) | **Сохраняем**, но используем Next `<Image>` из `/public/logo.png`. На моб. (≤640px): top:16px left:16px height:40px. | Брендовая фиксация. |
| Auto-advance + paste-to-fill для code-box | **Уточняем** ниже — в legacy реализовано в JS, нужно перенести поведение. | UX expectation. |
| Inline-style email-info banner (`#fef2f2 / #fecaca / #991b1b`) | Выносим в `<EmailHintBanner>`-композицию через Tailwind utilities — без inline `style=`. | Anti-pattern из legacy. |

### Login-page wrapper (`<LoginScreen>`)

Структура полно-экранного контейнера для `/login` и `/verify`:

```
<div class="relative min-h-screen flex items-center justify-center bg-bg overflow-hidden">
  {/* Brand logo top-left */}
  <a href="https://www.magtrans.eu" class="absolute top-6 left-8 z-20 sm:top-4 sm:left-4">
    <img src="/logo.png" class="h-13 sm:h-10 drop-shadow-sm" />
  </a>

  {/* Decorative radial ornaments — pointer-events-none, aria-hidden */}
  <div aria-hidden class="pointer-events-none absolute -top-52 -right-24 w-[600px] h-[600px]
                          rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.08),transparent_70%)]
                          dark:bg-[radial-gradient(circle,rgba(220,38,38,0.12),transparent_70%)]" />
  <div aria-hidden class="pointer-events-none absolute -bottom-36 -left-24 w-[400px] h-[400px]
                          rounded-full bg-[radial-gradient(circle,rgba(220,38,38,0.05),transparent_70%)]
                          dark:bg-[radial-gradient(circle,rgba(220,38,38,0.08),transparent_70%)]" />

  {/* Card */}
  <LoginCard>{children}</LoginCard>

  {/* Theme toggle bottom-right (опц.) */}
</div>
```

### `<LoginCard>` (custom)

Используется только на `/login` и `/verify`. Не путать с `<Card>` (общий surface).

| Свойство | Значение | Tailwind |
|---|---|---|
| Background | `card` (light: `#fff`, dark: `#1f1f1f`) | `bg-card` |
| Width | full, max 420px | `w-full max-w-[420px]` |
| Padding | 48px top/bottom, 40px left/right | `px-10 py-12` |
| Radius | 16px | `rounded-xl` |
| Shadow | `0 8px 32px rgba(0,0,0,.08)` (light); dark — `0 8px 32px rgba(0,0,0,.45)` | `shadow-login dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]` |
| **Top stripe** | **4px solid MAGTRANS RED — обязательно** | `border-t-4 border-brand` |
| Position context | `relative z-10` (поверх ornaments) | `relative z-10` |
| Mobile (≤640px) | `px-6 py-10`, `max-w-[92vw]` | `sm:px-6 sm:py-10 max-sm:max-w-[92vw]` |

> **Brand-критично:** `border-t-4 border-brand` — это единственный визуальный «брендовый» элемент карты. Не убирать, не менять цвет, не уменьшать толщину.

### Login-card header (`<LoginCardHeader>`)

```
<div class="text-center mb-8">
  <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand text-white
              text-[28px] leading-none mb-3 shadow-[0_4px_12px_rgba(220,38,38,0.2)]">
    🚛
  </div>
  <h1 class="text-[22px] font-extrabold tracking-[-0.5px] text-text">MAGGuarantee</h1>
  <p class="text-[13px] text-text-sub mt-1">{subtitle}</p>
</div>
```

`subtitle` меняется по шагу:
- Step 1 (credentials): «Zaloguj się, aby kontynuować».
- Step 2 (verify): «Weryfikacja dwuetapowa».

### `<CodeBox>` — 6-digit 2FA input (custom)

**Самый отличительный компонент Phase 1.** Это не одно поле — это композиция из 6 отдельных `<input maxLength={1} inputMode="numeric">` с auto-advance и paste-to-fill, обернутая в `<CodeBoxGroup>`.

#### Один `<input class="code-box">`:

| Свойство | Light | Dark | Tailwind |
|---|---|---|---|
| Size | 44×56 px | same | `w-11 h-14` |
| Text-align / font | center, 22px, 800 weight, `text-text` | same | `text-center text-[22px] font-extrabold text-text` |
| Caret | hidden (визуальный фокус — рамка/scale) | same | `caret-transparent` |
| Background (empty) | `#f5f5f5` (g100) | `#262626` (input) | `bg-input` |
| Background (filled) | `#fff` (card) | `#1f1f1f` (card) | `data-[filled=true]:bg-card` |
| Background (focus) | `#fff` | `#1f1f1f` | `focus:bg-card` |
| Border (empty) | 2px solid `#e5e5e5` (border) | 2px solid `#404040` (border) | `border-2 border-border` |
| Border (filled) | 2px solid `#171717` (text) | 2px solid `#f5f5f5` (text) | `data-[filled=true]:border-text` |
| Border (focus) | 2px solid `brand` | 2px solid `brand` (`#dc2626` — same в обеих темах) | `focus:border-brand` |
| Focus ring | `0 0 0 3px rgba(220,38,38,.15)` | `0 0 0 3px rgba(220,38,38,.25)` | `focus:ring-[3px] focus:ring-brand/15 dark:focus:ring-brand/25` |
| Focus scale | scale(1.08) | same | `focus:scale-[1.08]` |
| Radius | 12px | same | `rounded-[12px]` |
| Transition | `border-color, background, transform` 150ms | same | `transition-all duration-150` |
| Placeholder | `«—»`, цвет `#cbd5e1`, weight 400, 18px | dark: `#525252` | `placeholder:text-slate-300 dark:placeholder:text-neutral-600 placeholder:font-normal placeholder:text-[18px]` |

#### Состояния `<CodeBox>` (через `data-*` или класс):

| State | Триггер | Визуал |
|---|---|---|
| `empty` | пусто, нет фокуса | `bg-input border-border` |
| `focused` | пользователь печатает | `bg-card border-brand ring-3 ring-brand/15 scale-[1.08]` |
| `filled` | в input есть цифра | `bg-card border-text` (тёмная рамка-«галочка», что слот занят) |
| `error` | API вернул «неверный код» | `bg-danger-bg border-danger animate-[shake_.3s]` (на всю группу, не на каждый бокс) |
| `locked` | API вернул 423 (5 неверных попыток) | `bg-danger-bg/40 border-danger/40 text-danger/60 cursor-not-allowed` + атрибут `disabled` |

> Анимация shake — добавить keyframes в Tailwind config: `shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } }`. Добавить в `animation`: `'shake': 'shake .3s ease-in-out'`.

#### `<CodeBoxGroup>` — обёртка для 6 боксов:

```
<div role="group" aria-label="6-cyfrowy kod weryfikacyjny"
     class="flex gap-2.5 justify-center">
  {[0,1,2,3,4,5].map(i => <CodeBox ref={refs[i]} index={i} />)}
</div>
```

Поведение (UX-spec для web-agent):

1. **Auto-advance:** при вводе цифры в бокс `i` фокус переходит на `i+1`. Если `i=5`, поле остаётся на `5` (можно перейти к кнопке «Weryfikuj» через Tab или Enter).
2. **Backspace:** в пустом боксе backspace удаляет цифру в `i-1` и фокусирует `i-1`. В заполненном — очищает текущий, остаётся в нём.
3. **Arrow keys:** `←` / `→` навигация между боксами без удаления.
4. **Paste:** если пользователь вставляет «123456» в любой бокс — раскидать по 6 боксам, фокус на последнем. Если вставляет 4 цифры — заполнить с текущего бокса.
5. **Только цифры:** `inputMode="numeric"` + `pattern="[0-9]"` + JS-фильтр.
6. **Auto-submit:** когда заполнен 6-й бокс — автоматически запустить `verifyCode()` (без нажатия «Weryfikuj»). Если пользователь предпочитает ручной submit — кнопка остаётся.
7. **Locked (423):** все 6 боксов получают `disabled`, focus переходит на `<LoginError>` для screen-reader.

### `<EmailHintBanner>` (Step 2)

Информационный banner с email-маской и сроком жизни кода.

| Свойство | Значение | Tailwind |
|---|---|---|
| Background | `#fef2f2` (brand-50) light / `rgba(220,38,38,.15)` dark | `bg-brand-50 dark:bg-brand/15` |
| Border | 1px `#fecaca` (brand-200) light / `rgba(220,38,38,.3)` dark | `border border-brand-200 dark:border-brand/30` |
| Padding | 14px 16px | `px-4 py-3.5` |
| Radius | 10px | `rounded-[10px]` |
| Margin-bottom | 24px | `mb-6` |
| Text-color (primary) | `#991b1b` (brand-800) light / `#fecaca` (brand-200) dark | `text-brand-800 dark:text-brand-200` |
| Text-color (secondary, «Kod ważny 10 minut») | `#64748b` light / `text-sub` dark | `text-slate-500 dark:text-text-sub` |
| Font-size | 13px primary, 12px secondary | `text-[13px]` / `text-xs` |
| Icon | `<Mail size={16} />` (Lucide), inline | gap-2 flex |
| Email | bold, маска `da***@magtrans.eu` (генерится на сервере) | `<b>` |

### `<LoginError>` — error/locked message

Под формой (или под `<CodeBoxGroup>`). По legacy: `.login-error` — `color: var(--red); font-size: 13px; text-align: center; margin-top: 12px; font-weight: 600; min-height: 20px`.

| State | Visual | Текст (пример, локализация в i18n) |
|---|---|---|
| Idle (нет ошибки) | `min-h-5` reserved space, пусто | — |
| Wrong credentials (Step 1, 401) | red text, `<X />` icon | «Nieprawidłowy login lub hasło» |
| Wrong code (Step 2, 401) | red text, `<X />` icon, group-shake animation | «Nieprawidłowy kod (próba 2/5)» |
| Locked (423) | red **block**: `bg-danger-bg`, `border border-danger/40`, `rounded-[10px]`, `px-4 py-3`, иконка `<Lock />`, **font-weight 700** | «Konto zablokowane na 5 minut. Spróbuj ponownie po 14:23.» |
| Network error | `<WifiOff />` icon, `text-warning` | «Brak połączenia. Spróbuj ponownie.» |

ARIA: `<div role="alert" aria-live="polite">` для idle/wrong; `role="alert" aria-live="assertive"` для locked.

### `<ResendLink>` + `<BackButton>` (Step 2)

Под кнопкой «Weryfikuj»:

```
<div class="text-center mt-3 flex items-center justify-center gap-4">
  <button class="text-[13px] text-brand underline hover:text-brand-dark
                 disabled:text-text-sub disabled:no-underline disabled:cursor-not-allowed">
    Wyślij kod ponownie {countdown && `(${countdown}s)`}
  </button>
  <button class="text-[13px] text-text-sub hover:text-text inline-flex items-center gap-1">
    <ArrowLeft size={14} /> Wróć
  </button>
</div>
```

Поведение: «Wyślij ponownie» disabled на 60 секунд после каждого resend (чтобы не спамить SMTP). Countdown показываем inline.

### Toggle темы на login-странице

Уже есть `<ThemeToggle>` (см. component inventory). Размещение на login: абсолютно `bottom-6 right-6`, чтобы не конкурировал с логотипом и ornaments. Иконка `<Moon />` / `<Sun />` (Lucide), кнопка `ghost`-вариант.

### Чек-лист для Phase 1 web-agent

- [ ] `<LoginScreen>` — wrapper с background и ornaments (light + dark проверены).
- [ ] `<LoginCard>` — 4px brand top-border присутствует. **Если убрали — это регрессия бренда.**
- [ ] `<LoginCardHeader>` с эмодзи 🚛 в красном круге.
- [ ] Step 1: `<Input>` (shadcn) для login + password, `<Button variant="default" size="lg" className="w-full">` для «Dalej →».
- [ ] Step 2: `<EmailHintBanner>`, `<CodeBoxGroup>` (6 × `<CodeBox>`), `<Button>` «Weryfikuj», `<ResendLink>` + `<BackButton>`.
- [ ] `<CodeBox>` поведение: auto-advance, backspace, paste-to-fill, arrow nav, auto-submit на 6-й цифре.
- [ ] States: empty / focused / filled / error / locked — все визуально различаются и проверены в обеих темах.
- [ ] `<LoginError>` с 4 вариантами (idle / wrong / locked / network). `aria-live` корректный.
- [ ] Focus-trap внутри карточки на step 2 (Tab по 6 боксам → «Weryfikuj» → resend → back → 1-й бокс).
- [ ] Контраст: «Wyślij kod ponownie» (brand на card) — 4.6:1 light, 4.5:1 dark — passes AA.
- [ ] Mobile (≤640px): card сужается до `92vw`, padding `px-6 py-10`, логотип `top-4 left-4 h-10`.
- [ ] Нет inline `style=`, нет `onclick=`, нет `body.dark` хаков.

## Связь с остальным

- Tailwind config = `apps/web/tailwind.config.ts`.
- CSS-переменные = `apps/web/app/globals.css`.
- shadcn компоненты = `apps/web/components/ui/`.
- Custom компоненты = `apps/web/components/...`.
- Иконки = `lucide-react` (npm).

---

## Phase 2 web — admin CRUD (DataTable + Sheet + Form)

> Phase 2 фронт намеренно минималистичен: admin-только UI для CRUD по сущностям `carriers`, `vehicles`, `drivers`, `trailers`, `trailer-types`. UAT-grade, без полировки. Полированный UI carrier/employee панелей — Phase 3-4.

Phase 2 переиспользует уже зафиксированные токены (brand, surface, border, text, radius `12px`, shadow `card`) и shadcn-примитивы из каталога выше — `<Button>`, `<Input>`, `<Select>`, `<Label>`, `<Sheet>`, `<Form>`, `<Table>`, `<Toast>`. Ниже — короткие правила использования, чтобы web-agent не додумывал.

### DataTable (TanStack Table под `<Table>` shadcn)

| Свойство | Значение | Tailwind |
|---|---|---|
| Высота строки | 48px (compact) | `h-12` |
| Padding ячейки | 12px по горизонтали, 8px по вертикали | `px-3 py-2` |
| Header background | `bg` token (отличается от card) | `bg-bg` |
| Header типографика | 12px, 700 uppercase, letter-spacing .5px | `text-xs font-bold uppercase tracking-wider text-text-sub` |
| Row hover | `--table-hover` (red-tinted) | `hover:bg-brand-50 dark:hover:bg-brand/10` |
| Row border-bottom | 1px `--border` | `border-b border-border` |
| Sort indicator | Lucide `<ChevronUp/>` `<ChevronDown/>` `<ChevronsUpDown/>` 14px рядом с label | `inline-flex items-center gap-1` |
| Sticky header | да, при scroll внутри Card | `sticky top-0 z-10` |
| Selected row | `bg-brand-50` + левая полоса 2px brand | `bg-brand-50 border-l-2 border-brand` |
| Empty state | `<EmptyState>` (см. каталог), centered, padding 48px | `py-12 text-center` |

**Когда показывать skeleton vs spinner:** initial load → 5 строк `<Skeleton className="h-12">`; pagination/refresh → keep prev rows + top-bar progress.

### Sheet (side-drawer для редактирования)

shadcn `<Sheet side="right">` — стандарт для edit-форм Phase 2.

| Свойство | Значение |
|---|---|
| Ширина (desktop) | `w-[480px]` для коротких форм, `w-[640px]` для широких (vehicle с 36 полями) |
| Ширина (mobile) | `w-full` |
| Padding container | `p-6` (24px) |
| `<SheetHeader>` | title H3 (`text-lg font-bold`) + опц. description (`text-sm text-text-sub`) + close-X справа |
| `<SheetFooter>` | sticky внизу, `border-t border-border bg-card`, padding `p-4`, justify-end, gap-2: `<Button variant="ghost">Anuluj</Button>` `<Button>Zapisz</Button>` |
| Body | scroll-y, `flex-1 overflow-y-auto py-4` |
| Анимация | стандартная Radix slide (right→left), keep |

Не используем `<Dialog>` для edit-форм Phase 2 — слишком модально для CRUD-таблиц. `<Dialog>` остаётся для подтверждений (delete) и compact actions.

> ⚠️ **Единственное намеренное исключение из правила «edit-формы = `<Sheet>`»: поверхность верификации wniosku** (`<ClaimVerificationModal>`). Phase 7.1 (§6.5) переопределяет её на центральную `<Dialog>` с `mode: 'view' | 'edit'`. Причина — у неё особый workflow: read-only просмотр и редактирование это **одна и та же поверхность** с парными строками «заявлено / проверено», а не CRUD-форма по отдельной сущности; центральная модалка убирает «прыжок» между read-only Dialog и edit Sheet. Это исключение **не распространяется** на остальные edit-формы — Driver/Vehicle/Trailer/User/Limity остаются `<Sheet side="right">`. См. §6.5.

### Form patterns (RHF + Zod)

shadcn `<Form>` поверх `react-hook-form` + zod-resolver. Один RHF-field = один `<FormField>`.

| Элемент | Правило |
|---|---|
| Label placement | сверху, всегда видим (не floating) |
| Label типографика | `text-sm font-medium` (не uppercase в формах — отличается от таблиц) |
| Required marker | `*` после label, `text-danger`, `aria-required="true"` |
| Field gap (вертикальный) | `space-y-1.5` внутри `<FormItem>`, `space-y-4` между полями |
| Input height | 40px, `h-10` (Phase 2 — стандарт shadcn) |
| Error message | `<FormMessage>` ниже input, `text-sm text-danger`, появляется после blur или submit |
| Description / hint | `<FormDescription>` ниже label, `text-xs text-text-sub` |
| Disabled state | `opacity-50 cursor-not-allowed`, padding/border остаются |
| Read-only display | not as disabled input — see § "Read-only / computed field pattern" |
| Two-column rows | wrap the cells in `<FormGrid>` (subgrid alignment). See § "Grid-form field alignment". |
| Section divider | `<Separator />` + section title `text-xs font-bold uppercase tracking-wider text-text-sub` |
| **Grid-cell input baseline** | wrap the cells in `<FormGrid cols={2}>` (or `{4}`). `<FormItem>`/`<FormField>` stay top-aligned natural stacks. See § "Grid-form field alignment". |

#### Grid-form field alignment (canonical — subgrid, opt-in via `<FormGrid>`)

**Problem.** Inside a CSS-grid row (`grid-cols-2` / `grid-cols-4`), the grid stretches every cell to the tallest cell's height. With a plain top-aligned `space-y-1.5` stack, a cell whose (PL) label wraps to 2 lines (`Długość wewn. (m)`, `Numer dokumentu tożsamości`) pushes its own input down while a 1-line-label sibling (`Ładowność (t)`, `E-mail`) keeps its input at the top → inputs lose their shared baseline.

> #### ⛔ Anti-pattern — DO NOT bottom-pin via `flex-1` on the label
>
> A previous fix made `<FormItem>` = `flex h-full flex-col space-y-1.5` and gave `<FormLabel>` `flex-1`, bottom-pinning everything after the label to the cell bottom. **This is wrong and must not be reintroduced.** It only aligns cells shaped exactly `[label][input]`. The moment a cell has content *below* its input — helper text, a hint, a live readout, a `<FormDescription>` — bottom-pinning drops that content to the cell floor and lifts the input *above* it, while a plain `[label][input]` sibling pins its input to the very bottom. Result: the two inputs sit at different Y. This broke ClaimVerificationModal's «Korekta godzin» cell (which renders a `<HoursReadout>` under its `<Input>`) against its «Przebieg» sibling. **Never use cell-height-absorbing `flex-1`/`h-full` to align grid inputs.**

**Canonical fix — CSS subgrid (`<FormGrid>` wrapper, opt-in):**

The grid container declares **named row bands** and each child cell (`<FormField>`/`<FormItem>`) opts into the parent's rows via `grid-rows-subgrid`. Band 1 holds every cell's **label** (so all labels share a row → bottom-aligned to the tallest label), band 2 holds every cell's **input** (so all inputs share a row → top-aligned baseline). Helper / readout / error live in band 2 *with* the input and grow **downward** out of the band without ever moving the input up.

- `<FormItem>` reverts to a **plain top-aligned stack**: `flex flex-col gap-1.5`. No `h-full`, no `flex-1` anywhere. This guarantees requirement 3 — standalone `<FormField>`/`<FormItem>` (single-column forms, the DriverSheet/VehicleSheet ADR `<FileUpload>` blocks) render with tight label→input spacing exactly as before.
- `<FormGrid cols={2|3|4}>` is the **only** place that turns on alignment. It renders:
  `grid <cols-class> gap-x-4 gap-y-4 [grid-template-rows:auto_auto] *:[&>[data-form-cell]]:row-span-2` — and each `<FormField>`/`<FormItem>` it contains adds `grid grid-rows-subgrid row-span-2` so its label lands in band 1 and its input+below-content in band 2.
- **Subgrid row-gap caveat:** with `grid-rows-subgrid`, the gap between a cell's label and its input equals the container's `gap-y` (the inter-row gap), NOT `<FormItem>`'s internal `gap-1.5`. To keep the label↔input gap tight (6px) while rows stay comfortably spaced, `<FormGrid>` sets `gap-y-1.5` for the **band gap** and adds explicit bottom margin on the input band via `[&_[data-form-cell]]:[row-gap:0.375rem]`; the visual inter-**row** separation is provided by the cell content height + a `pb-*` is **not** needed because each logical form row is its own 2-band group. Concretely `<FormGrid>` = `grid <cols> gap-x-4 gap-y-4` and each cell = `grid grid-rows-subgrid [grid-template-rows:subgrid] row-span-2 gap-y-1.5`. The `gap-y-4` is the row-to-row gap; the per-cell `gap-y-1.5` is the label→input gap. (Tailwind v4 supports `grid-rows-subgrid`; `@import "tailwindcss"` is in `globals.css`.)

**How each requirement is met:**
1. Wrapped vs single-line labels align — both labels occupy band 1, both inputs occupy band 2. ✔
2. A cell with below-input content (HoursReadout, FormDescription) keeps its input in band 2; the extra content extends below without lifting the input. ✔
3. Single-column / standalone fields are NOT inside a `<FormGrid>`, so `<FormItem>` is a plain tight stack — no gap inflation. ✔
4. No `h-full`/`flex-1` anywhere → no cross-cell height coupling → no new grid regressions. ✔

**Grid containers that MUST adopt `<FormGrid>`** (these are the multi-column grids; replace the raw `<div className="grid grid-cols-… gap-…">` wrapper around `<FormField>` cells):
- `TrailerSheet.tsx` — identification grid (`grid-cols-1 md:grid-cols-2`) and dimensions grid (`grid-cols-2 md:grid-cols-4`). The equipment checkbox-card grid is NOT a `<FormField>` grid — leave it.
- `DriverSheet.tsx` — the people grid (`grid-cols-1 md:grid-cols-2`). The ADR `<FileUpload>` `<FormItem>` is standalone — leave it.
- `VehicleSheet.tsx` — identification grid, people grid, rates grid (`grid-cols-2 md:grid-cols-4`). The equipment/permissions checkbox-card grids are NOT `<FormField>` grids — leave them.
- `ClaimVerificationModal.tsx` — the corrections grid (`grid-cols-2`, ~line 520, the «Przebieg»/«Korekta godzin»/dates block — this is the regression site) and the ZAAKCEPTOWANO grid (`grid-cols-2`, ~line 600). `col-span-2` cells (amountApproved, comment) keep `col-span-2` and still work as full-width subgrid cells.

**Single-column responsive note:** at `< md`, `grid-cols-1 md:grid-cols-2` collapses to one column. `<FormGrid>` must apply subgrid row-spanning **only when ≥2 columns are live**, otherwise a 1-col stack would force every label into one shared band needlessly. Implement `<FormGrid>` so the subgrid cell-spanning classes are gated to the same breakpoint as the columns (e.g. `md:[&>[data-form-cell]]:row-span-2`). At 1 column the cells fall back to plain top-aligned stacks (correct — nothing to align across).

#### Read-only / computed field pattern (auto-filled, non-editable) — incl. the "Locked / computed field" pattern

Two distinct cases — do not conflate them:

**(a) Pure display value (never editable, not a form input)** — use a `<dl>`/static row, not a disabled `<input>`. Pattern already in use: ClaimVerificationModal's `Stat` rows and the Authorization tab's `pendingMaximumLabel` block (`text-[11px] uppercase tracking-wider text-text-sub` label + `text-sm font-semibold tabular-nums` value).

**(b) Computed-but-required form value** — the field is part of the submitted payload and is still RHF-registered, but the user must NOT type into it; it auto-updates from a live calculation. This is **`amountApproved` (Kwota zatwierdzona)** in the ZAAKCEPTOWANO variant: it is driven by the live `/preview` doplata whenever «Korekta godzin» / mileage / dates change, and the verifier may not override it by hand.

Treatment for (b) — the **locked / computed field** pattern, a read-only styled input (NOT `disabled`) carrying a deliberate "lock" affordance so it reads as *intentionally* locked rather than broken/greyed:

- Keep it a real `<Input>` (so the value stays visible, copyable, RHF-registered, and submitted), but make it non-editable: `readOnly` + `tabIndex={-1}` + `aria-readonly="true"`. Do **not** use `disabled` — disabled inputs look broken/greyed and are dropped from some form serialisations; `readOnly` keeps it intentional and submitted.
- **Wrapper:** the `<Input>` sits in a `relative` `<div>` so a lock icon can be absolutely positioned inside the field's right edge. The `<FormDescription>` helper stays a **sibling below** the wrapper (not inside it) so grid alignment / band-pair behaviour is unchanged.
- **Muted surface, more than a normal input.** A locked field reads *more* greyed than its editable siblings so the eye skips it:
  - Surface: **`bg-input/40`** (vs `bg-input` for editable siblings — noticeably more recessed).
  - Value text: **`text-text-sub`** (muted, not full `text-text`) — but kept `font-semibold tabular-nums` so the EUR number stays crisp and aligned.
  - No focus emphasis: `focus:ring-0 focus:border-border` (it can still receive programmatic focus but never lights up).
  - Right padding **`pr-9`** to clear the lock icon.
- **Lock affordance (two parts):**
  - In-field icon: lucide **`<Lock />`**, `pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70`, `aria-hidden`. Muted, never intercepts clicks.
  - Helper icon: the same `<Lock />` at `size-3` prefixed inside the `<FormDescription>` (`flex items-center gap-1`) so the "wyliczana automatycznie" line visually reinforces the lock.
- **Hover hint:** `cursor-not-allowed` on the input (clearly "you can't type here" on mouse-over) **plus** a native `title` attribute giving a textual reason. The project has **no `<Tooltip>` component** in `components/ui/`, so a native `title` is the correct lightweight choice — do not add a Tooltip dependency for this. i18n key `employee.claims.modal.edit.amountApprovedLocked` → PL "Pole zablokowane — wyliczane automatycznie z podglądu" / EN "Locked field — calculated automatically from the preview".
- **Helper text:** `<FormDescription>` reading **"wyliczana automatycznie"** (PL) / **"calculated automatically"** (EN). i18n key `employee.claims.modal.edit.amountApprovedAuto`.
- The `required` asterisk stays (it is still a required field of the payload) — but because it's always auto-populated it will never actually be empty.
- It does NOT need to be inside a `<FormGrid>` band-pair conflict — it's a `col-span-2` full-width cell with a helper below; the helper grows downward harmlessly (no sibling in its grid row).

**Canonical class string (copy verbatim for future locked/computed fields):**

```tsx
<div className="relative">
  <Input
    readOnly tabIndex={-1} aria-readonly="true"
    title={t('…Locked')}
    className="bg-input/40 pr-9 font-semibold tabular-nums text-text-sub cursor-not-allowed focus:border-border focus:ring-0"
    {...register(name, { setValueAs })}
  />
  <Lock aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70" />
</div>
<FormDescription className="flex items-center gap-1">
  <Lock aria-hidden className="size-3 shrink-0" />
  {t('…Auto')}
</FormDescription>
```

This is the canonical pattern for any future "system computes it, user confirms it" numeric field (e.g. a recomputed payout, a derived rate). The RHF wiring (`register` + `setValueAs` + the auto-populate `useEffect`) is **independent of this presentation** — never alter it when restyling a locked field.

### Field validation badge (inline VIES / Biała Lista feedback)

VIES и Biała Lista lookups триггерятся on-blur. UI должен дать мгновенный visual signal, не модал.

**Состояния:**

| State | Иконка (Lucide, 14px) | Цвет | Текст |
|---|---|---|---|
| `idle` | — | — | (не рендерим) |
| `loading` | `<Loader2 className="animate-spin" />` | `text-text-sub` | "Sprawdzam…" |
| `valid` | `<CheckCircle2 />` | `text-success` | "Zweryfikowano" + (опц. имя контрагента) |
| `invalid` | `<XCircle />` | `text-danger` | "Nie znaleziono" / "Numer nieaktywny" |
| `error` | `<AlertTriangle />` | `text-warning` | "Usługa niedostępna — spróbuj później" |

**Композиция:** маленький inline badge **внутри** `<FormDescription>` слота (под input), `inline-flex items-center gap-1.5 text-sm`. Не блокирует submit — пользователь может сохранить даже при `invalid` (бизнес-решение: внешние сервисы падают, форма не должна намертво стопориться). Обычное `<FormMessage>` от Zod рендерится отдельно.

**Компонент:** `<FieldValidationBadge state="valid" message="..." />` — добавить в каталог custom-компонентов.

### Role-gated navigation

Employee nav (top tabs или left sidebar — решит web-agent в Phase 4) — содержание зависит от роли:

- `admin` — видит **все** вкладки: Dashboard, Wnioski, Carriers, Vehicles, Drivers, Trailers, Trailer types.
- `pracownik` (UI «Pracownik») — видит **только** Dashboard + Wnioski. Никаких CRUD-вкладок для справочных сущностей. Это соответствует legacy (`index.html:4682-4690`: tabs `Carriers/Vehicles/Drivers/Trailers` рендерятся `if isAdminRole`).
- `opiekun` — вкладка «Moja opieka» (свой scope CRUD) и разделы своего scope по `nav.config.ts`; Wnioski **не видит** ни в каком виде (решение 2026-10-22).
- `planista`, `dyspozytor`, `eksport`, `weryfikator` — собственные панели, не Employee panel.

Pattern:
- Список ссылок строится из конфига `nav.config.ts`, каждая запись — `{ href, label, icon, permission: Permission | Permission[] (any-of), roles?: Role[] }` (с трека B B4, 2026-10-23; до этого `roles: Role[]`). `roles` — редкий scope-квалификатор (сегодня только `opieka-delegations` → opiekun, `delegations` → admin).
- Фильтрация в layout server-component: `filterNav(effectivePermissionsOf(user), user.role)` — права из `/auth/me.permissions` (fallback `permissionsFor(role, lider)` при расхождении версий api/web), плюс ограничение на роли employee-shell (планиста с `vehicles.read` вкладку не получает — панель это роль). Золотой тест `lib/nav.config.test.ts` фиксирует набор вкладок по ролям.
- Никакого client-side hide через CSS. Что роль не видит — не рендерится.
- Активное состояние ссылки — `bg-brand-50 text-brand` light / `bg-brand/15 text-brand-light` dark.

### Phase 2 confirmation

Phase 2 web (admin DataTable + Sheet edit forms + RHF/Zod валидация + inline VIES/Biała Lista feedback) **не вводит новых color/radius/shadow токенов**. Всё собирается из существующей brand-палитры, semantic colors (`success`/`warning`/`danger`/`text-sub`) и shadcn-примитивов перечисленных выше. Единственный новый custom-компонент — `<FieldValidationBadge>`. Уровень полировки — UAT, не production.

---

## Phase 4 — Employee panel (polished UI)

> Pracownik (UI «Pracownik») + admin. Полированный уровень, прод-ready. Все компоненты собираются из примитивов Phase 2 — **новых color/radius/shadow токенов не вводим**. Reference: `docs/screenshots/employee-*.png`, `docs/screenshots/modal-status-p1/p2.png`.

### Status mapping (`ClaimStatus → semantic color`)

Источник — legacy `CONFIG.KOLORY` (Code.gs:90-96). Legacy цвета — pure-HSL (#00FF00 и т.п.) для подкраски ячеек Google Sheets — **не используем в UI как есть**. Маппинг на DS semantic tokens:

| `ClaimStatus` | Legacy hex | DS token (bg / text) | Badge label (PL) |
|---|---|---|---|
| `ZAAKCEPTOWANO` | `#00FF00` | `bg-success/15 text-success border-success/30` | "Zaakceptowano" |
| `NA_WERYFIKACJI` | `#FFFF00` | `bg-warning/15 text-warning border-warning/30` | "Na weryfikacji" |
| `ODRZUCONO` | `#FF0000` | `bg-danger/15 text-danger border-danger/30` | "Odrzucono" |
| `REKLAMACJA` | `#FFA500` | `bg-warning/20 text-warning border-warning/40` (тон темнее чем weryfikacja) | "Reklamacja" |
| `OCZEKUJE_NA_AUTORYZACJE` | `#E0E0FF` | `bg-brand/10 text-brand border-brand/30` | "Oczekuje na autoryzację" |
| `ROBOCZY` (draft) | — | `bg-g100 text-text-sub border-border` | "Roboczy" |

Зафиксировать в `packages/shared/src/claim-status.ts` как const-map, импортировать в `<StatusBadge>`.

### `<StatusBadge claim>` (a.k.a. `<ClaimStatusBadge>`)

**Anatomy:** `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap`. Опц. dot-prefix `<span className="h-1.5 w-1.5 rounded-full bg-current" />` для дополнительного visual cue в плотных таблицах.

**Tokens:** только из status-map выше; нет hover-состояния (badge — статичный indicator, не button).

**Состояния:** один static state per status; в таблице `disabled`-вид не нужен.

**Использование:** column `status` в `<ClaimsTable>`, header `<ClaimVerificationModal>`, dashboard «Recent activity» list, «Required notes» list.

### `<KpiCard>` (dashboard top-row)

Reference: `employee-dashboard-required-notes.png` (верхние tile-ы). Текущая реализация в `magguarantee-app/apps/web/components/dashboard/KpiCard.tsx`.

**Anatomy:**
- Wrapper: `<Card className="p-4 flex flex-col gap-1">`.
- Label row: занимает **всю ширину карточки** (full-width, не делит строку со status-dot / icon — те абсолютно позиционированы в правом-верхнем углу). Label располагается **под** top-right reserved zone — `pr-8` чтобы первая строка не залезала под dot/icon (status-dot `h-2 w-2` at `right-4 top-4` + опц. icon `size={18}` at `right-10 top-4` = ~28px reserved).
- Label tokens: `text-xs font-bold tracking-normal text-text-sub` + **`line-clamp-2 min-h-[2rem] leading-4`** (≈ 2 строки × 16px line-height). **`uppercase` сохраняется** — это визуальный signature KPI-tile, отличает label от value. `tracking-wider` дропается — выигрыш ~6-8% ширины на длинных PL/EN строках.
- Value: `text-3xl font-bold text-text` (number или `1.2k €`). Остаётся визуальным якорем — крупнее label в 3×.
- Delta-badge (опц.): inline `<Badge variant="outline">` с `<ArrowUp/Down />` icon, `text-success` / `text-danger` в зависимости от знака.
- Icon-slot (опц.): `<Icon className="h-5 w-5 text-text-sub" />` в правом-верхнем углу, абсолютно (`right-10 top-4`).
- Status-dot (всегда): `h-2 w-2 rounded-full` at `right-4 top-4`.

**Label overflow policy:**
- Single-line label (≤ ~16 chars uppercase в ~170px usable): рендерится в одну строку, `min-h-[2rem]` резервирует место второй строки → визуальное выравнивание value между всеми карточками в строке остаётся одинаковым (cards-row equal-height).
- Длинный label (`OCZEKUJE NA AUTORYZACJĘ` / `WAITING FOR AUTHORIZATION`): wrap в 2 строки через `line-clamp-2`. `leading-4` (16px) держит общую высоту label-блока ≤ 32px = `min-h-[2rem]`.
- Truncate (`...`) на 3-й строке через `line-clamp-2` — если когда-то появится ещё более длинный label, он не сломает высоту строки grid-а.

**Tokens:** `bg-card`, `border-border`, `rounded-lg`, `shadow-sm` (унаследовано от `<Card>`). **No new tokens introduced** (Phase 4.4 policy).

**Состояния:** `loading` → `<Skeleton className="h-8 w-24" />` на месте value, label остаётся; `empty` → value = `—` (em-dash) серым.

**Layout:** строка `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4` сверху dashboard. На xl (5-col) usable label-width ≈ 170-190px после `p-4` + `pr-8` reserved zone — этого достаточно для двухстрочного wrap всех текущих PL/EN строк.

**Rationale:** combo подходов **A + B** из брифа — drop `tracking-wider` даёт «дешёвый» ~6-8% выигрыш, multi-line wrap с `min-h-[2rem]` гарантирует равную высоту cards-row и допускает любые i18n строки без рефакторинга. `uppercase` сохраняем как signature; sentence-case (option C) был бы более «модерн», но это spec-change уровня всего DS (badge-headers, tab-labels) — out of scope единого KPI-фикса. Label-rename (option D) отклонён — `Oczekuje na autoryzację` точнее, чем `Do autoryzacji` (последнее звучит как call-to-action, а не статус).

### `<DashboardSidebar>` (right-side панель)

Reference: `employee-dashboard-monthy-trend.png`, `-top-carriers.png`, `-status-dsitribution.png`, `-complaits.png`, `-biggest-payouts.png`, `-planner-payments.png`, `-recent-activity.png`, `-required-notes.png` — каждая секция = отдельный card.

**Структура:** вертикальный stack секций (`space-y-4`) в `aside.w-full lg:w-[380px] lg:shrink-0`. Каждая секция = `<Card>` с фиксированным заголовком + варьируемым контентом.

| Секция | Контент-тип | Сортировка |
|---|---|---|
| Urgent / Required notes | list `<StatusBadge>` + claim-ref + actor | top by mtime |
| Recent activity | feed `<AuditRow compact>` | desc by `when` |
| Monthly trend | mini bar/line chart (recharts) | last 12 mo |
| Top carriers | ranked list (top 5, value = sum doplata) | desc |
| Reklamacje | list claim-cards с `REKLAMACJA` статусом | top by age |
| Top payouts | top 5 doplata по claims | desc |

**Common section header:** `<CardHeader className="pb-2">` → `<CardTitle className="text-sm font-bold uppercase tracking-wider text-text-sub">`. Body: `<CardContent className="pt-2">`. Footer-link «Zobacz wszystkie →» опц., если есть детальная страница.

**Loading:** каждая секция независимо — `<Skeleton>` 3-5 строк. Не блокируем всю sidebar одним spinner-ом.

**Responsive:** на `< lg` секции схлопываются в один column **под** main-контентом, не в drawer.

### `<ClaimsTable>` (главная таблица employee)

Reference: `employee-claims-list.png`. Переиспользует `<DataTable>` (Phase 2).

**Колонки (порядок):**

| Колонка | Тип | Доп. |
|---|---|---|
| `nrZgl` | mono `tabular-nums` | sortable, link → modal |
| Перевозчик | text + NIP мелким `text-xs text-text-sub` второй строкой | sortable, filter |
| Auto | plate `font-semibold` + marka мелким | filter by plate |
| Period | `MM/YYYY` | filter (year+month dropdown) |
| Km gwar. / Km real. | `tabular-nums` две числа, real в `text-text-sub` если < gwar | — |
| Doplata | `tabular-nums font-semibold` + `€` suffix; красный текст если > 0 | sortable |
| Status | `<StatusBadge>` **+ (2026-07-31) `<ReklamacjaResolutionChip>` как вторичный чип второй строкой, когда `reklamacjaSubmitted`** | filter (multi-select по enum) |
| Aktor (last edit) | initials avatar `h-6 w-6` + tooltip с pełnym именем | — |
| Data zmiany | relative (`2 godz. temu`) + tooltip с ISO | sortable, default desc |
| Akcje | row-hover-only kebab `<MoreHorizontal />` | — |

> **Reklamacja в списке (2026-07-31).** Статус больше **не** несёт исход рекламации (после решения wniosek возвращается в `statusBeforeReklamacja`), поэтому единственный способ увидеть исход в списке — вторичный `<ReklamacjaResolutionChip>` в ячейке статуса: `flex flex-col items-start gap-1` (бейдж статуса сверху, чип рекламации под ним, `text-[11px]`). Никогда не подменяй им `<StatusBadge>` и не добавляй «(reklamacja)» к подписи статуса. Спека: §6.5.15 C.

**Row interaction:** click anywhere on row → opens `<ClaimVerificationModal>` (не правый kebab — full-row click для productivity). Kebab — только для destructive (delete draft) / secondary actions (duplicate, export PDF).

**Filter bar (sticky над таблицей):** search input (по nrZgl, NIP, plate) + status multiselect + period range + carrier select. Layout — `flex flex-wrap gap-2 p-3 border-b border-border bg-input` (см. § Surface-token policy выше).

### `<ClaimVerificationModal>` (Phase 4 — Sheet; ⚠️ ПЕРЕОПРЕДЕЛЕНО Phase 7.1 → центральная `<Dialog>`, см. §6.5)

> 🔁 **SUPERSEDED.** Этот раздел (Phase 4) описывал верификацию как `<Sheet side="right" w-[720px]>` с двумя раздельными поверхностями (read-only `ClaimDetailModal` Dialog + edit `ClaimVerificationModal` Sheet). **Phase 7.1 (§6.5) переопределяет поверхность на ОДНУ центральную `<Dialog>` с состоянием `mode: 'view' | 'edit'`** — клик по строке открывает `view`, кнопка «Edycja» разворачивает inline-поля без пере-монтирования. Ширина, раскладка сверху-вниз (факты → dopłata → decyzja), парные строки «заявлено/проверено», treatment приглушённых значений, и судьба табов Historia/Autoryzacja — всё в §6.5. Текст ниже сохранён как исторический контекст по содержимому полей/табов; **контейнер и раскладку читать из §6.5, не отсюда.**

Reference: `modal-status-p1.png` + `modal-status-p2.png`.

> Note (Phase 4, исторический; контейнер superseded — см. §6.5): 720px Sheet считался достаточным для двух-column form (KM / EUR в одной строке), но `Historia`-таб с large origData diff может ощущаться тесно — допустимо, scroll-y решает. Если в Phase 5 dyspozytor/weryfikator получит ещё более широкий diff-view, можно поднять до `w-[840px]` локально для конкретного экрана, **но единый компонент остаётся 720**.

**Header (`<SheetHeader>`):** title = `Wniosek {nrZgl}` (`text-lg font-bold`) + line ниже — carrier name `text-sm text-text-sub` + plate. `<StatusBadge>` в правом-верхнем углу рядом с close-X.

**Tabs (под header, `<Tabs>` shadcn):**

| Таб | Условие | Контент |
|---|---|---|
| `Edit` | всегда | форма верификации: KM gwar/real (read-only), stawka €/km (input), doplata (calculated, read-only). **Live recalc badge** справа от doplata — `<Badge variant="outline" className="animate-pulse">Przeliczam…</Badge>` во время debounce, потом `<Badge variant="outline" className="text-success">Aktualne</Badge>`. Под формой — `notatka` textarea. |
| `Historia` | `claim.origData != null` (т.е. была reklamacja или re-submit) | side-by-side diff: «Pierwotnie» / «Aktualnie», два столбца, изменённые поля подсвечены `bg-warning/10`. Read-only. |

> ⚠️ **Ручной таб «Autoryzacja» удалён (этап 5.1).** Ручного флоу авторизации (кнопка «Wymaga autoryzacji», поле `kwotaMaksima`, ручной перевод в `OCZEKUJE_NA_AUTORYZACJE`) больше нет. Осталась ТОЛЬКО секондари-панель «Historia». Авторизация теперь полностью автоматическая (Maksim-gate) и живёт в **основном** потоке модалки через `MaksimGateBlock` — см. §6.5.7. Секондари-табов больше нет: одиночная «Historia» рендерится как обычная секция (без `<Tabs>`-хрома).

Tabs typography (для секондари-«Historia», если когда-либо будет соседний таб): `text-sm font-medium`, active — `border-b-2 border-brand text-brand`, остальные — `text-text-sub hover:text-text`.

**Footer (`<SheetFooter>`, sticky):**
- Slot слева: destructive ghost `<Button variant="ghost" className="text-danger">Odrzuć</Button>` (только если статус != ODRZUCONO/ZAAKCEPTOWANO).
- Slot справа: `<Button variant="ghost">Anuluj</Button>` + primary `<Button>Zaakceptuj</Button>` (label меняется по выбранной decyzja: «Zaakceptuj» / «Odrzuć» / «Zapisz»).

**Состояния:** `loading` (открыт модал, fetch claim) — skeleton header + tabs grey; `saving` — primary-button spinner, форма disabled; `error` — `<Alert variant="destructive">` сверху body, форма остаётся редактируемой.

### `<AuditRow>` (строка таблицы audit + dashboard «Recent activity»)

Audit-log хранится в Postgres (legacy `ensureAuditLogSheet` → Prisma `AuditLog`). Полная страница — `<DataTable>` Phase 2; одна строка = компонент ниже. Также используется в dashboard `Recent activity` секции в compact-варианте.

**Anatomy (full row):**
- Avatar/initials: `<Avatar className="h-7 w-7">` с initials `actor.name`. Цвет фона — детерминированный hash от user.id (но в пределах brand-палитры: brand-50, brand-100, g100, g200 — без радужных tailwind-цветов).
- Action verb + target: `<span className="text-sm">` — «zaakceptował wniosek **#1234**» (target жирным).
- Relative time: `text-xs text-text-sub` справа, tooltip с ISO timestamp.
- Expand chevron: `<ChevronDown />`, на click — раскрытие JSON-diff под строкой (`<pre className="text-xs bg-input p-3 rounded-md overflow-x-auto">`).

**Compact variant (`<AuditRow variant="compact">`):** без expand, без avatar — только initials inline + verb + target + relative time. Высота `h-9`. Используется в dashboard sidebar.

**Tokens:** `bg-card` row, hover — `--table-hover` (red-tinted, Phase 2). Expanded — `bg-input`.

### `<LimitsRow>` (admin → limity, inline-edit)

> ⚠️ **EXTENDED by §16 (2026-09-20) — «Wyłączenie gwarancji».** Строка получила **два чекбокса** (вкл/выкл дневной и субботней гарантии), **четвёртое состояние ячейки** (`unsaved`) и **трёх-статусный визуальный контракт строки** (не сконфигурирован / выключен / активен). Раздел ниже остаётся базовой анатомией; всё, что касается включения-выключения, три состояния, массового применения и отображения выключенного месяца у перевозчика — читать в **§16, он авторитетный**.

Таблица KM-гарантий per (**год × месяц**) на `/employee/limits`: селектор года в шапке + 12 строк (по одной на месяц) с gap-fill на фронте — месяцы без строки в БД рендерятся пустыми, первое сохранение делает upsert. **Нет** измерения carrier/vehicle — лимит глобальный на месяц.

Reference: legacy `ensureLimitySheet` (в легаси модель была per `carrier × vehicle × period`; в новом приложении упрощена до `год × месяц`).

**Anatomy:** строка таблицы с **тремя** редактируемыми ячейками (`<EditableCell>`, `h-9 w-24 tabular-nums`, PL-запятая как десятичный разделитель):
- **Km/dzień** (`kmPerDay`, `step=0.01`) — ячейка содержит чекбокс включения (§16.2),
- **Km/sobota** (`kmPerSaturday`, `step=0.01`) — помесячный опт-ин субботней гарантии: `> 0` ⇒ ВКЛ для месяца, пусто/0 ⇒ ВЫКЛ (см. [01-overview.md](01-overview.md)); ячейка содержит свой чекбокс,
- **rate** (`ratePerKm`, «Stawka € / km», `step=0.0001`) — чекбокса нет, ставка не выключается (§16.1).

Порядок колонок: `Miesiąc | Km/dzień | Km/sobota | rate | Zaktualizowano`. Каждая ячейка — save-on-blur (`PUT /limits/:yearMonth`, partial body — шлётся только изменённое поле); при невалидном вводе значение откатывается к последнему валидному. **Пустой ввод больше не «no-op»** — см. §16.3.

**Состояния cell:**
- `idle` — обычный input.
- `saving` — спиннер 12px справа от input, input disabled.
- `success` (кратко после save) — **зелёная рамка инпута** `border-success focus:border-success`, fade-out.
- `error` — `border-danger`, value reverted, toast.
- `unsaved` (§16.3, NEW) — чекбокс включён, значение ещё не введено: `border-warning bg-warning/5` + под-строка «Nie zapisano — obowiązuje 0 km».

**Прочие колонки** — read-only: `Zaktualizowano` (updatedAt). Месяцы года без данных показывают пустые ячейки-инпуты — отдельной «add-row» кнопки нет, сетка всегда 12 строк.

### `<UsersTable>` (admin → users CRUD)

Reference: legacy `ensureUsersSheet`. Стандартный `<DataTable>` Phase 2, без особенностей.

**Колонки:** email, имя, **role badge** (см. ниже), активен (boolean → `<Badge>`), 2FA enabled (icon `<ShieldCheck />` / `<ShieldOff />`), createdAt, последний логин (relative + tooltip), akcje.

**Role badge:** `<Badge variant="outline">` per role:

| Role | Badge color |
|---|---|
| `admin` | `border-brand text-brand` |
| `pracownik` | `border-border text-text-sub` |
| `opiekun` | `border-success/40 text-success` |
| `planista` | `border-warning/40 text-warning` |
| `dyspozytor` | `border-warning/40 text-warning` |
| `eksport` | `border-brand/40 text-brand` |
| `weryfikator` | `border-danger/40 text-danger` |
| `przewoznik` | `border-g300 text-text-sub` |

**Row akcje (kebab):** Edit (open `<Sheet>` form) / Reset password (confirm `<Dialog>` → backend генерит temp-token, email) / Deactivate (toggle `active=false`, soft, не delete) / Reactivate.

**Create user:** `<Button>Dodaj użytkownika</Button>` в header → `<Sheet w-[480px]>` с формой (email, имя, role select, опц. assignedCarriers для opiekun).

### `UserSheet` — блок «Uprawnienia indywidualne» (docs/25 B6, NEW 2026-10-27 — AUTHORITATIVE)

> **Changelog.**
> - 2026-10-27 — первая версия (трек B, этап B6; решение 2026-10-27 «точечные права пользователю»). Затронуты: `UserSheet` (новый блок + режим строки перевозчика), опционально `UsersListView` (маркер исключений). Токенов 0, новых типов компонентов 0 — блок собирается из `Checkbox`, `Badge`, `Button`, `FormMessage`, `LockNotice` и рецепта notice-строки.

> **Scope.** Как выглядит и называется редактирование `extraPermissions` / `deniedPermissions`. Поведение и правила — [docs/25 §3 B6](25-permissions-layer-plan.md): `effective = (permissionsFor(role, lider) ∪ extra) − denied`, отзыв побеждает добавление; `GRANTABLE_EXTRA[role]` — что можно добавить; `DEPENDENT_PERMISSIONS` — зависимости; смена роли сбрасывает неподходящие записи с audit-строкой. Если текст ниже расходится с docs/25 по **поведению** — прав docs/25; по **виду, копирайту, размещению** — прав этот раздел.

#### A.1 Где стоит блок

Последняя секция `<SheetBody>` в **режиме правки** (на создании не рендерится: новый пользователь стартует ровно с правами роли, исключения настраиваются после создания). Порядок тела формы не меняется до блока: login → imię → e-mail → rola → «Lider» → «Przełożony (lider)» → aktywny → zarządzanie → rola przyznana ręcznie → **«Uprawnienia indywidualne»**.

- Отделение — паттерн Section divider из §Form patterns: `mt-2 border-t border-border pt-4`, заголовок секции `<h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">` `users.permissions.title`.
- Под заголовком — `text-xs text-text-sub` `users.permissions.description`. Для `managedBy = magspace` вторым абзацем — `users.permissions.magspaceHint` (блок **редактируем** и на MAGSpace-учётке: reconcile его не трогает).
- **Пустое состояние** (в форме нет ни одного extra и ни одного denied) — под описанием строка `text-xs text-text-sub` `users.permissions.empty`; группы и превью рендерятся как обычно (пусто — нормальное состояние, не CTA).
- Своего loading-состояния у блока нет: данные — из уже загруженного `UserDtoFull`, справочники (`GRANTABLE_EXTRA`, `DEPENDENT_PERMISSIONS`, `permissionsFor`) — статичный shared-код.
- Ширина `Sheet` не меняется (`default`, 480px). Список прав — одна колонка: PL-метки длинные, две колонки на 480px переносили бы каждую строку.

#### A.2 Анатомия (сверху вниз)

```
UPRAWNIENIA INDYWIDUALNE
Wyjątki od roli dla tego konta. Rola nadal decyduje o panelu i zakresie danych.

[ⓘ Po zapisaniu zostaną usunięte — nie pasują do nowej roli:]   ← только при смене роли/лидера (A.6)
[   ~~Podgląd stawek ciągnika~~ · odebrane                    ]

Dodatkowe                                                       ← только если GRANTABLE_EXTRA[role] не пуст
Uprawnienia ponad rolę Przewoźnik.
[ ] Podgląd dokumentów firmy i floty
[x] Dodawanie dokumentów firmy

Odebrane · Nic nie odebrano          [Pokaż uprawnienia roli (13) ▾]   ← не для admin
  WNIOSKI
  [ ] Podgląd wniosków
  [ ] Składanie wniosków
  FLOTA
  …

Uprawnienia efektywne · 14 uprawnień
(chip)(chip)(+ chip)…

Zmiana działa od następnej akcji użytkownika i trafia do audytu.
```

| Часть | Правило | Классы |
|---|---|---|
| Подзаголовок группы («Dodatkowe», «Odebrane», «Uprawnienia efektywne») | `<h4>` | `text-sm font-semibold text-text` |
| Подсказка группы | под подзаголовком | `text-xs text-text-sub` |
| Строка-чекбокс | один `<label>` оборачивает `Checkbox` + метку (как флаг «Lider» в этом же файле); строка ≥ 36px, на мобильных ≥ 44px | `flex items-start gap-2 py-1.5 text-sm text-text max-sm:min-h-11` ; `Checkbox` `mt-0.5 shrink-0` |
| Метка права | `t(\`permissions.labels.${id}\`)` — **никогда** не id | — |
| Суффикс лидерского права в «Odebrane» | право пришло из `LIDER_PERMISSIONS`, а не из роли | `ml-1 text-xs text-text-sub` `permissions.liderSuffix` |
| Подзаголовок домена внутри «Odebrane» | группировка по домену (A.5), выводятся только непустые домены | `pt-2 text-[11px] font-bold uppercase tracking-wider text-text-sub` |
| Между группами | — | `space-y-4` |

Группы — `<fieldset>` с `<legend>` = подзаголовок (скринридер читает «Dodatkowe, группа»), описание связано `aria-describedby`.

#### A.3 «Dodatkowe» — права сверх роли

- Источник чекбоксов: `GRANTABLE_EXTRA[effectiveRole]` (порядок — каталожный, как в `PERMISSIONS`). Права, которые роль уже имеет, не выводятся (их нечего добавлять).
- **Группа скрыта целиком**, если список пуст (сегодня — у всех ролей, кроме `przewoznik`). Не «пустая группа с пояснением», а отсутствие (§Role-gated navigation: «что роль не видит — не рендерится»).
- `effectiveRole` = сохранённая колонка `role` (в форме — select роли; у `managedBy = magspace` он заблокирован на сохранённом значении), **не** `roleOverride`. *(Исправлено 2026-10-27: было «`roleOverride || role` для `managedBy = magspace`, как у «Przełożony (lider)» (W16)». Права в рантайме считает `effectivePermissionsFor` по `role`, и `PATCH /users/:id` проверяет списки по `role`; отложенный `roleOverride` становится ролью только при следующей синхронизации входа, и тогда же обрезаются списки. Поэтому смена `roleOverride` в правке ничего не сбрасывает (A.7 срабатывает от `role` / `lider`), а при `roleOverride`, отличном от `role`, блок показывает одну строку `text-xs text-text-sub` `users.permissions.roleOverridePendingHint` — PL «Po następnym logowaniu rola zmieni się na {role} — uprawnienia niepasujące do niej zostaną usunięte.» / EN «After the next sign-in the role becomes {role} — rights that do not fit it will be removed.», `{role}` = `tRoles(roleOverride)`.)*
- **Зависимости (`DEPENDENT_PERMISSIONS`), автоматически в обе стороны:**
  - отметил право, которому нужна база (`carrier_documents.add` → `.read`) — база отмечается сама;
  - снял базу, на которую опирается отмеченное право, — зависимое снимается само.
  - Оба автодействия объявляются одной строкой под группой: `text-xs text-text-sub`, `aria-live="polite"`, ключи `users.permissions.extra.autoAdded` / `autoRemoved`; строка гаснет при следующем изменении группы. Без тостов и без `disabled`-чекбоксов (§6.5.13: `disabled` — только для кнопок и транзитных состояний).
  - Почему автоматически, а у «Odebrane» — подсказкой: выданное право без базы всегда мёртвое (вкладка без данных), спрашивать нечего. Отзыв базового права, наоборот, бывает намеренным (docs/25: «UI предупреждает и предлагает»).

#### A.4 «Odebrane» — права роли, которые у этого человека отняты

- Источник чекбоксов: `permissionsFor(effectiveRole, lider)` — каждое право роли (+ лидерские, с суффиксом «(lider)»). Отмеченный = отозван.
- **Не выводится для `admin`** (api отказывает в отзыве у admin). Вместе с пустым «Dodatkowe» это значит: у admin блок не рендерится вовсе — кроме notice из A.7, если в этой правке роль сменилась на admin и есть что сбросить.
- **Раскрытие.** Отзыв — редкая операция, а список длинный (opiekun — 20 прав, przewoznik — 13). Поэтому группа свёрнута, пока ничего не отозвано, и развёрнута при открытии формы, если `deniedPermissions` не пуст. Строка-заголовок: `<h4>` «Odebrane» + `text-xs text-text-sub` сводка `users.permissions.denied.summary` + справа `<Button variant="ghost" size="sm" aria-expanded aria-controls>` `denied.toggleShow` / `denied.toggleHide` с `ChevronDown` (`rotate-180` в раскрытом). Без нового примитива: кнопка + условный рендер списка.
- **Подсказка о зависимых.** Отмечено право, от которого зависят другие ещё **действующие** права (из роли или из «Dodatkowe»): под этой строкой (`pl-6`, выровнено по тексту метки) —

  `flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-warning-dark dark:text-warning` + `<AlertTriangle size={14} aria-hidden/>` `denied.dependentsHint` («Bez tego uprawnienia nie zadziała: {list}.») + `<Button variant="outline" size="sm">` `denied.dependentsApply` «Odbierz również».

  Клик отмечает все перечисленные: зависимые права роли — в «Odebrane», зависимые extra — снимаются в «Dodatkowe». Подсказка исчезает, когда зависимых не осталось или отзыв базы снят. Сохранять **можно и без** применения — api не падает, просто отвечает 403 (docs/25). Тон — warning, а не danger: это предупреждение о бессмысленной конфигурации, не ошибка. Цвет `text-warning-dark` на `bg-card` — тот же, что у `liderIdStaleHint` (§17.7), AA ✔.
- Отмеченные строки **не** зачёркиваются: зачёркивание в этом блоке означает только «будет сброшено при сохранении» (A.6). Смешивать нельзя.

#### A.5 Группировка по домену (для «Odebrane» и порядка чипов)

Домен выводится из префикса id; порядок доменов = порядок секций каталога `PERMISSIONS`. Карта живёт в web (`lib/auth/permissionGroups.ts`), тест проверяет, что у каждого id из `PERMISSIONS` есть домен и PL/EN-метка.

| Домен (`permissions.groups.*`) | Префиксы | PL | EN |
|---|---|---|---|
| `claims` | `claims.`, `dashboard.` | Wnioski | Claims |
| `carriers` | `carriers.`, `carrier_documents.` | Przewoźnicy | Carriers |
| `fleet` | `vehicles.`, `drivers.`, `trailers.`, `fleet.`, `gps.` | Flota | Fleet |
| `delegations` | `delegations.`, `km.` | Wyjazdy i przebieg | Trips and mileage |
| `panels` | `panel.` | Panele | Panels |
| `integrations` | `lookups.`, `integrations.`, `bugbot.` | Słowniki i integracje | Lookups and integrations |
| `administration` | `users.`, `sso.`, `teams.`, `trailer_types.`, `limits.`, `audit.`, `diagnostics.` | Administracja | Administration |

#### A.6 «Uprawnienia efektywne» — живое превью

- Read-only, считается на клиенте из **текущих значений формы**: `(permissionsFor(effectiveRole, lider) ∪ extra) − denied`, после применения сбросов из A.7.
- Заголовок `<h4>` + `text-xs text-text-sub` счётчик `effective.count` (`aria-live="polite"` — только на счётчике, не на списке чипов: 20 чипов, зачитанные при каждом клике, — шум). Подсказка `effective.hint`.
- Чипы — `flex flex-wrap gap-1.5`, порядок по A.5:
  - право роли / лидера — `<Badge variant="muted">`;
  - право из «Dodatkowe» — `<Badge variant="success">` с `<Plus size={12} aria-hidden/>` слева и `sr-only` `effective.extraAria`. Цвет — не единственный носитель: есть глиф «+» и скрытый текст.
  - отозванные в превью **не** выводятся (их видно в «Odebrane»).
- Пусто (всё отозвано) — вместо чипов `text-xs text-text-sub` `effective.none`.

#### A.7 Смена роли / флага лидера в той же правке

Когда в этой же правке меняется `role`, `roleOverride` (MAGSpace) или `lider`, часть сохранённых записей может перестать подходить: extra вне `GRANTABLE_EXTRA[newRole]` (или уже входящие в новую роль), denied вне `permissionsFor(newRole, newLider)`.

- Над группами — notice-строка (рецепт `<LockNotice>`, но иконка `Info`, т.к. это не блокировка): `flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 text-xs text-text-sub` + `<Info size={14} className="mt-0.5 shrink-0" aria-hidden/>`, текст `drop.title`, ниже список `<ul>`: каждая запись — `<del className="text-text-sub">{метка}</del>` + ` · ` + тег `drop.extraTag` / `drop.deniedTag`.
- Сами сбрасываемые записи из чекбокс-списков **уходят** (их чекбоксов в новой роли нет) — notice единственное место, где они видны.
- Вернул роль обратно — notice исчезает, записи снова на месте (состояние вычисляемое, а не «стёртое»).
- Отправка: в PATCH уходят списки **уже без** сбрасываемых записей (иначе 422 `USER_PERMISSION_NOT_GRANTABLE`). Поля `extraPermissions` / `deniedPermissions` шлются, только если итоговый список отличается от сохранённого (как `lider` / `liderId`).

#### A.8 Строка перевозчика (`role = przewoznik`)

Сегодня форма приводит `przewoznik` к `pracownik` (`UserSheet.tsx`, `form.reset`) и при сохранении отправила бы чужую роль. С B6 строку перевозчика открывают именно ради этого блока, поэтому:

- **Rola, Lider, Przełożony, Zarządzanie, Rola przyznana ręcznie** — блокировка уровня блока (§6.5.13, tier B): вместо полей — статичный `<dl>` из двух строк (`Rola` → «Przewoźnik», `Zarządzanie` → «Lokalne»; рецепт label/value §(a) Read-only), над ним одна `<LockNotice>` с `users.fields.carrierLocked`. Ни одного `disabled`-select, ни одного замка на поле.
- В PATCH для перевозчика **никогда** не уходят `role`, `lider`, `liderId`, `managedBy`, `roleOverride`.
- `login` / `imię` / `e-mail` / `aktywny` — без изменений относительно сегодняшнего поведения формы.
- Блок «Uprawnienia indywidualne» — главное редактируемое содержимое: «Dodatkowe» = `carrier_documents.read`, `carrier_documents.add`; «Odebrane» = 13 прав роли (свёрнуто).
- `SheetDescription` = login (как сейчас).

#### A.9 Ошибки сохранения

Обе 422 — **внутри формы, не тостом** (как `USER_LIDER_ID_INVALID`, §17.7): `<FormMessage>` под соответствующей группой, `aria-invalid` на `<fieldset>`, фокус на `<legend>` группы (для «Odebrane» группа разворачивается). Если api вернул список id в `details`, метки подставляются в `{list}`; иначе `{list}` опускается (ключ без хвоста — `…Generic`).

| Код | Где | Ключ | PL | EN |
|---|---|---|---|---|
| 422 `USER_PERMISSION_NOT_GRANTABLE` | под «Dodatkowe» | `users.permissions.errors.notGrantable` | Tych uprawnień nie można nadać roli {role}: {list}. Odśwież formularz i spróbuj ponownie. | These permissions can't be granted to the {role} role: {list}. Reload the form and try again. |
| — без `details` | | `users.permissions.errors.notGrantableGeneric` | Część uprawnień nie może być nadana roli {role}. Odśwież formularz i spróbuj ponownie. | Some permissions can't be granted to the {role} role. Reload the form and try again. |
| 422 `USER_PERMISSION_NOT_REVOCABLE` | под «Odebrane» | `users.permissions.errors.notRevocable` | Tych uprawnień nie można odebrać roli {role}: {list}. | These permissions can't be removed from the {role} role: {list}. |
| — без `details` | | `users.permissions.errors.notRevocableGeneric` | Części uprawnień nie można odebrać roli {role}. | Some permissions can't be removed from the {role} role. |
| 400 (неизвестный id) / 5xx | тост | существующий `formatApiError` | — | — |

Успех — существующий тост `common.saved`.

#### A.10 Audit

- В блоке — последней строкой `text-xs text-text-sub` `users.permissions.auditNote` (сразу после превью). Права пересчитываются на каждом запросе (docs/15), поэтому «od następnej akcji», а не «po ponownym zalogowaniu».
- Журнал `/employee/audit`: `user.permissionsChanged` (before/after) и строки сброса при смене роли рендерятся существующим `<AuditRow>` с JSON-diff — UI-правок не требуется.

#### A.11 Маркер в списке (опционально, не блокирует)

`UsersListView`, колонка роли: при наличии исключений — вторым элементом `<Badge variant="muted" className="tabular-nums">` «+{extra} −{denied}» (нулевую часть не показывать: «+1», «−2», «+1 −2»), `title` + `aria-label` = `users.permissions.listMarkerAria`. Помогает admin найти «каким перевозчикам открыты документы».

#### A.12 Метки прав — `permissions.labels.*` (конвенция)

Ключ повторяет id права **вложенными объектами** по точкам (next-intl читает точку как вложенность): `vehicles.rates.read` → `"permissions": { "labels": { "vehicles": { "rates": { "read": "…" } } } }`, вызов `t(\`labels.${id}\`)` в namespace `permissions`. Конфликтов листа и ветки в каталоге нет (проверено на 45 id).

| Правило | PL | EN |
|---|---|---|
| Форма | название действия (rzeczownik odczasownikowy) + объект в dopełniaczu | глагол в базовой форме + объект |
| Регистр, пунктуация | только первая буква заглавная, без точки | sentence case, без точки |
| Длина | ≤ 45 знаков | ≤ 45 chars |
| Словарь | слова интерфейса: ciągnik, naczepa, kierowca, wniosek, wyjazd, przewoźnik, opiekun, przebieg. Никогда id, «endpoint», «scope», англицизмы | UI words: vehicle, trailer, driver, claim, trip, carrier, mileage |
| `.read` | Podgląd … | View … |
| `.write` | Edycja … | Edit … |
| `.add` | Dodawanie … | Upload / Add … |
| `.delete` / `.hard_delete` | Usuwanie … / Trwałe usuwanie … | Delete … / Permanently delete … |
| `.manage` | Zarządzanie … | Manage … |
| `.verify` / `.submit` | Weryfikacja … / Składanie … | Verify … / Submit … |
| `panel.<rola>` | Panel {rola w dopełniaczu} | {Role} panel |
| Уточнение | одна скобка в конце, если без неё метки двух прав совпадут | same |

Готовые метки (остальные 33 web-agent заполняет по конвенции):

| Id | PL | EN |
|---|---|---|
| `carrier_documents.read` | Podgląd dokumentów firmy i floty | View company and fleet documents |
| `carrier_documents.add` | Dodawanie dokumentów firmy | Upload company documents |
| `carrier_documents.delete` | Usuwanie dokumentów firmy | Delete company documents |
| `claims.read` | Podgląd wniosków | View claims |
| `claims.verify` | Weryfikacja wniosków | Verify claims |
| `claims.verify_pending_authorization` | Weryfikacja wniosków czekających na autoryzację | Verify claims awaiting authorisation |
| `dashboard.read` | Podgląd pulpitu | View dashboard |
| `vehicles.rates.read` | Podgląd stawek ciągnika | View vehicle rates |
| `vehicles.fuel_card.read` | Podgląd karty paliwowej | View fuel card |
| `fleet.write` | Edycja floty (ciągniki, kierowcy, naczepy) | Edit fleet (vehicles, drivers, trailers) |
| `km.verify` | Weryfikacja przebiegu dziennego | Verify daily mileage |
| `panel.opiekun` | Panel opiekuna | Carrier-success manager panel |

#### A.13 i18n-контракт (PL default + EN)

| Ключ | PL | EN |
|---|---|---|
| `users.permissions.title` | Uprawnienia indywidualne | Individual permissions |
| `users.permissions.description` | Wyjątki od roli dla tego konta. Rola nadal decyduje o panelu i zakresie danych. | Exceptions to the role for this account. The role still decides the panel and the data scope. |
| `users.permissions.magspaceHint` | Synchronizacja z MAGSpace nie zmienia tych ustawień. Jeśli zmieni rolę konta, niepasujące wyjątki zostaną usunięte. | MAGSpace sync doesn't change these settings. If it changes the account's role, exceptions that no longer fit are removed. |
| `users.permissions.empty` | Brak wyjątków — konto ma dokładnie uprawnienia roli {role}. | No exceptions — the account has exactly the {role} role's permissions. |
| `users.permissions.extra.title` | Dodatkowe | Added |
| `users.permissions.extra.hint` | Uprawnienia ponad rolę {role}. | Permissions on top of the {role} role. |
| `users.permissions.extra.autoAdded` | Zaznaczono również: {list} — jest wymagane. | Also ticked: {list} — it's required. |
| `users.permissions.extra.autoRemoved` | Odznaczono również: {list} — bez odznaczonego uprawnienia nie działa. | Also cleared: {list} — it doesn't work without the cleared permission. |
| `users.permissions.denied.title` | Odebrane | Removed |
| `users.permissions.denied.hint` | Zaznacz uprawnienia roli, których ten użytkownik ma nie mieć. | Tick the role permissions this user should not have. |
| `users.permissions.denied.summary` | {count, plural, =0 {Nic nie odebrano} one {Odebrano # uprawnienie} few {Odebrano # uprawnienia} many {Odebrano # uprawnień} other {Odebrano # uprawnienia}} | {count, plural, =0 {Nothing removed} one {# permission removed} other {# permissions removed}} |
| `users.permissions.denied.toggleShow` | Pokaż uprawnienia roli ({count}) | Show role permissions ({count}) |
| `users.permissions.denied.toggleHide` | Ukryj uprawnienia roli | Hide role permissions |
| `users.permissions.denied.dependentsHint` | Bez tego uprawnienia nie zadziała: {list}. | Without it, these won't work: {list}. |
| `users.permissions.denied.dependentsApply` | Odbierz również | Remove these too |
| `users.permissions.effective.title` | Uprawnienia efektywne | Effective permissions |
| `users.permissions.effective.hint` | Tak będzie po zapisaniu: rola + dodatkowe − odebrane. | After saving: role + added − removed. |
| `users.permissions.effective.count` | {count, plural, one {# uprawnienie} few {# uprawnienia} many {# uprawnień} other {# uprawnienia}} | {count, plural, one {# permission} other {# permissions}} |
| `users.permissions.effective.extraAria` | dodatkowe | added |
| `users.permissions.effective.none` | Brak uprawnień — użytkownik zobaczy pusty panel. | No permissions — the user will see an empty panel. |
| `users.permissions.drop.title` | Po zapisaniu zostaną usunięte — nie pasują do nowej roli: | Will be removed on save — they don't fit the new role: |
| `users.permissions.drop.extraTag` | dodatkowe | added |
| `users.permissions.drop.deniedTag` | odebrane | removed |
| `users.permissions.auditNote` | Zmiana działa od następnej akcji użytkownika i trafia do audytu. | Takes effect from the user's next action and is recorded in the audit log. |
| `users.permissions.listMarkerAria` | Uprawnienia indywidualne: dodatkowe {extra}, odebrane {denied} | Individual permissions: {extra} added, {denied} removed |
| `users.permissions.errors.*` | см. A.9 | see A.9 |
| `users.fields.carrierLocked` | Zablokowane — konto przewoźnika ma stałą rolę i jest zarządzane lokalnie. | Locked — a carrier account has a fixed role and is managed locally. |
| `permissions.liderSuffix` | (lider) | (lead) |
| `permissions.groups.*` | см. A.5 | see A.5 |
| `permissions.labels.*` | см. A.12 | see A.12 |

`{role}` — `tRoles(effectiveRole)`; `{list}` — метки через «, » (`Intl.ListFormat` с `type: 'conjunction'` даёт «i» / "and" перед последней — допустимо).

#### A.14 a11y

- `<fieldset>` + `<legend>` на «Dodatkowe» и «Odebrane»; описание группы через `aria-describedby`.
- Раскрытие «Odebrane» — `aria-expanded` + `aria-controls` на кнопке; фокус при раскрытии не переносится.
- Автодействия (A.3) и счётчик превью — `aria-live="polite"`; подсказка о зависимых — **не** live (появляется прямо под чекбоксом, который пользователь только что отметил; связать `aria-describedby` с этим чекбоксом).
- Кнопка «Odbierz również» ≥ 44px на мобильных (`max-sm:min-h-11`).
- Контрасты: `text-text-sub` на `bg-input` (notice A.7) 4.6:1 / 6.4:1 ✔; `success`-badge — существующий AA-рецепт `Badge`.

#### A.15 Файлы для web-agent

| Файл | Что |
|---|---|
| `app/(employee)/employee/(admin)/users/UserSheet.tsx` | монтирует блок в режиме правки; режим строки перевозчика (A.8: убрать приведение `przewoznik → pracownik`, статичный `<dl>` + `LockNotice`, не слать role/lider/liderId/managedBy/roleOverride); 422 из A.9 в `form.setError` по группам; поля формы `extraPermissions` / `deniedPermissions`, PATCH только при изменении |
| `app/(employee)/employee/(admin)/users/UserPermissionsBlock.tsx` (новый, композиция) | группы A.3/A.4, превью A.6, notice A.7, аудит-строка A.10 |
| `lib/users/permissionOverrides.ts` (новый, чистые функции + тесты) | `effectivePreview`, `droppedOnRoleChange`, `applyExtraDependencies` (обе стороны), `dependentsOf` — по `GRANTABLE_EXTRA` / `DEPENDENT_PERMISSIONS` / `permissionsFor` из shared |
| `lib/auth/permissionGroups.ts` (новый) | карта A.5 + тест полноты (каждый id → домен + PL/EN-метка) |
| `lib/auth/permissions.ts` | реэкспорт `GRANTABLE_EXTRA`, `DEPENDENT_PERMISSIONS` с subpath `@magguarantee/shared/permissions` |
| `app/(employee)/employee/(admin)/users/UsersListView.tsx` | опционально — маркер A.11 |
| `messages/pl.json`, `messages/en.json` | ключи A.5, A.9, A.12, A.13 |

### Role-guarded navigation (реализация)

Зафиксировано в Phase 2 spec (раздел «Role-gated navigation»), Phase 4 — реализация:

- `lib/nav.config.ts` — single source of truth, hardcoded array. **Не runtime-flag, не feature-toggle.**
- `pracownik` видит: `Dashboard`, `Wnioski`. **Точка.**
- `admin` видит: `Dashboard`, `Wnioski`, `Carriers`, `Vehicles`, `Drivers`, `Trailers`, `Trailer types`, `Limity`, `Users`, `Audit log`.
- Фильтрация — в server-component layout, не на клиенте.
- Active link styling — как в Phase 2 (`bg-brand-50 text-brand` light / `bg-brand/15 text-brand-light` dark).

### Phase 4 acceptance checklist (для web-agent)

- [ ] `packages/shared/src/claim-status.ts` экспортирует `CLAIM_STATUS_TOKENS` map и `CLAIM_STATUS_LABELS_PL`.
- [ ] `<StatusBadge claim={claim} />` рендерит корректный variant из map; covered storybook + unit-snapshot.
- [ ] `<KpiCard>` принимает `{ label, value, delta?, icon? }`; имеет `loading` / `empty` варианты.
- [ ] Dashboard layout = top KPI row (4 col) + main + `<DashboardSidebar>` (right, 380px, stack секций); каждая секция fetch-ит данные независимо (TanStack Query).
- [ ] `<ClaimsTable>` использует `<DataTable>` Phase 2; колонки в порядке таблицы выше; full-row click → modal.
- [ ] ⚠️ **SUPERSEDED Phase 7.1 (§6.5):** `<ClaimVerificationModal>` теперь = центральная `<Dialog max-w-4xl>` с `mode: 'view' | 'edit'`, **не** `<Sheet>`. Сохраняются: live recalc badge debounce 300ms; live dopłata пересчёт при правке фактов; авторизация автоматическая через `MaksimGateBlock` в основном потоке (ручного таба «Autoryzacja» нет — этап 5.1). Раскладку (факты → dopłata → decyzja), парные строки, секондари-«Historia» и Maksim-gate читать из §6.5.
- [ ] `<AuditRow>` имеет `default` и `compact` варианты; deterministic avatar-color hash; expand → JSON-diff `<pre>`.
- [ ] `<LimitsRow>` — три inline-ячейки (`kmPerDay` / `kmPerSaturday` / `ratePerKm`), save-on-blur, optimistic update, rollback + toast on error. ⚠️ **Дополнено §16** (два чекбокса, состояние `unsaved`, три состояния строки).
- [ ] `<UsersTable>` — role-badge color map; kebab actions; deactivate ≠ delete.
- [ ] `lib/nav.config.ts` — pracownik видит ровно `[Dashboard, Wnioski]`, не больше.
- [ ] **Ноль новых color/radius/shadow tokens** в Tailwind config относительно Phase 2.
- [ ] Все компоненты работают в dark mode без override-хаков.
- [ ] Контраст WCAG AA на всех `<StatusBadge>` вариантах (особенно warning на light).

---

## GPS status indicator (forward-fix для Phase 4-5)

> **Не рендерится в Phase 2.** Спецификация залочена сейчас, чтобы Phase 4 (vehicle-detail header) и Phase 5 (`/fleet/*` таблицы) не передизайнили этот элемент. API-контракт — `packages/shared` (Phase 2). Backend-контекст: [16-jobs-and-integrations.md § GPS tracker](16-jobs-and-integrations.md) (статус: ожидает доступа к API; mock-провайдер в Phase 2).

### Где появляется

- **Phase 5+:** правый-самый столбец каждой строки в `/fleet/*` таблицах (opiekun, planista, dyspozytor, weryfikator) — компактный inline вариант.
- **Phase 4+:** маленький badge в header экрана vehicle-detail, рядом с plate number — тот же компонент, тот же layout.

### Состояния (3 цвета + один skip)

| State | Условие | Token (light) | Token (dark) | Текст (PL) |
|---|---|---|---|---|
| `fresh` | `lastFetchedAt` ≤ pollInterval × 1.5 | `bg-success` (`#22c55e`) | `bg-success` | "X min temu" / "X godz. temu" |
| `stale` | `lastFetchedAt` старше fresh-окна, но ≤ fallback-окна (позиция всё ещё показывается) | `bg-warning` (`#f97316`) | `bg-warning` | "stale Xh" / "stale Xd" |
| `unknown` | `Vehicle.gps = true`, но `lastFetchedAt` никогда не приходил | `bg-g400` (`#a3a3a3`) → use `text-text-sub`/`bg-text-sub` | dark equivalent | "brak sygnału" |
| `n/a` | `Vehicle.gps = false` | — | — | **компонент не рендерится вообще** |

### Композиция

```
[●]  3 min temu          ← fresh (green dot)
[●]  stale 2h            ← stale (amber dot)
[●]  brak sygnału        ← unknown (muted dot)
```

| Элемент | Tailwind |
|---|---|
| Wrapper | `inline-flex items-center gap-2` |
| Dot | `h-2 w-2 rounded-full bg-{state-color} shrink-0` (8×8 px) |
| Text | `text-sm text-text-sub` (одинаковый muted цвет для всех 3 состояний — цветной только dot) |
| Tooltip trigger area | весь wrapper (`<TooltipTrigger asChild>`) |

Принципиально: **цвет несёт только dot**, текст всегда muted. Это снижает визуальный шум в плотных таблицах с десятками строк.

### Tooltip (hover/focus)

shadcn `<Tooltip>`. Содержимое:

```
Ostatni fix: 2026-05-03T12:34:56Z
Źródło: mock        (или название vendor-а после finalize)
```

- Полный ISO `lastFetchedAt`.
- Имя провайдера из API response (`provider` field). На Phase 2 — всегда `mock`.
- Для `unknown`: tooltip = "Brak danych GPS dla tego pojazdu".

### Component API

```tsx
<GpsStatus position={position} />
```

- `position: GpsPosition | null` — shape locked в `packages/shared` (Phase 2).
- Внутри определяет state из `position.stale` + `position.lastFetchedAt`.
- Если родитель знает что `vehicle.gps === false` — он сам решает не рендерить `<GpsStatus>`. Компонент **не** содержит fallback "пусто" — это контракт с вызывающим.

### Не делать

- Не добавлять icon внутри dot (избыточно при 8px).
- Не делать pulsating animation для `fresh` — distraction в таблицах. Если позже понадобится "live" feel, использовать существующий `animate-blink-red` token (или новый `blink-green`), но не по умолчанию.
- Не показывать relative time без tooltip с абсолютным — operators хотят видеть точное время фикса.
- Не использовать `chip` стиль (с background) для `fresh` — слишком тяжёлый в плотной таблице. Background-вариант оставлен только для vehicle-detail header при необходимости (web-agent решает в Phase 4).

### Добавлено в каталог custom-компонентов

| Компонент | Где использовать |
|---|---|
| `<GpsStatus position={...} />` | `/fleet/*` таблицы (Phase 5+), vehicle-detail header (Phase 4+) |
| `<FieldValidationBadge state="…" />` | Inline VIES / Biała Lista feedback в формах carrier/vehicle (Phase 2+) |

---

## Phase 3 — carrier panel design contract

> Polished UI for the carrier role: `/carrier/claims`, `/carrier/claims/new`, `/carrier/fleet/{cars,drivers,trailers}`, `/carrier/delegations`. Reference screenshots: `docs/screenshots/carrier-*.png`. Legacy CSS: [`index.html:411-426`](../index.html#L411). All tokens reuse the existing palette — no new colors.

### Carrier shell (header + tab nav)

Header is the standard `<AppHeader>` (logo + role badge "Przewoźnik" + `<LanguageToggle>` + `<ThemeToggle>` + logout). Below it — a sticky tab bar.

| Element | Tailwind |
|---|---|
| Tab bar wrapper | `sticky top-[64px] z-20 bg-card border-b border-border` |
| Tab list | `container mx-auto flex gap-1 px-4 overflow-x-auto` |
| Tab item (default) | `px-4 py-3 text-sm font-semibold text-text-sub whitespace-nowrap border-b-2 border-transparent hover:text-text` |
| Tab item (active) | `text-brand border-brand` (no fill — only red underline + red text) |
| Tab item (with badge count) | append `<span class="ml-2 rounded-full bg-brand/10 dark:bg-brand/20 text-brand text-xs px-2 py-0.5">N</span>` |

**Top-level tabs:** `Wnioski` / `Nowy` / `Flota` / `Wyjazdy`. Emoji prefix kept per voice rules (📋 ➕ 🚛 🗺️). *(2026-10-27: current full set is `Wnioski` / `Nowy` / `Flota` / `Wyjazdy` / `Porozumienie` / `Przebieg`, plus the per-user `Dokumenty` as the last tab — see «Carrier «Dokumenty» tab» below.)*

**Flota — unified panel.** See the «Carrier fleet panel (unified, planista-style)» section below. (Historical: the Flota area was three route-based sub-tabs `Auta` / `Kierowcy` / `Naczepy` rendered as a `<FleetSubTabs>` route-tablist over three sparse `/carrier/fleet/{vehicles,drivers,trailers}` pages — **superseded 2026-06-26** by one full-width page with in-page `<Tabs>` + a KPI strip. The carrier fleet stays strictly READ-ONLY.)

### Carrier «Dokumenty» tab — `/carrier/dokumenty` (docs/25 B6, NEW 2026-10-27 — AUTHORITATIVE)

> **Changelog.**
> - 2026-10-27 — первая версия: первый реальный случай B6 (docs/25 §3 B6, решение 2026-10-23). Затронуты: `CarrierTabs` (условная вкладка), новая страница, `CarrierDocumentsTab` (переезд в `components/documents/` + гейты по правам), 5 новых ключей. Токенов 0, новых типов компонентов 0 — всё из §5R (Opiekun «Dokumenty»).

> **Scope.** Перевозчик, которому admin точечно выдал `carrier_documents.read` (и, возможно, `.add`), видит документы своей фирмы **так же, как opiekun** на вкладке «Dokumenty» (§5R): каталог типов документов фирмы + обзор документов флота. Может **только загружать** новые файлы фирмы — не удалять, не заменять, не править даты. Вид opiekun **не меняется ни на пиксель**.

#### B.1 Видимость и гейты

| Что | Условие (по **эффективным** правам `/auth/me`, `effectivePermissionsOf(user)`) |
|---|---|
| Вкладка в `CarrierTabs` | `panel.carrier` **и** `carrier_documents.read`. `panel.carrier` отсекает admin в carrier-shell (у admin есть `carrier_documents.read` по роли, но нет своей фирмы) |
| Страница `/carrier/dokumenty` | то же условие на сервере (`requirePermission` дважды или all-of); нет права → `redirect('/carrier/claims')` — политика проекта «redirect, а не экран 403» (`requireRoleAccess`) |
| Edge | **Не** добавлять `/carrier/dokumenty` в `PATH_PERMISSIONS`: edge не знает overrides (docs/25 R3) и отбил бы каждого, кому право выдано. Префикс `/carrier` уже открыт роли `przewoznik`; точная проверка — на странице |
| Загрузка (футер Sheet типа фирмы) | `carrier_documents.add` |
| Удаление (колонка «Usuń» + confirm) | `carrier_documents.delete` — перевозчику не выдаётся никогда, поэтому у него кнопки нет |
| Указатель «Zarządzaj w oknie …» у типов флота | `fleet.write`; без него — строка B.4 |

Все три гейта внутри компонента — **по правам, не по роли и не по «аудитории»**. У opiekun и admin есть `.add`, `.delete`, `fleet.write` → рендер идентичен сегодняшнему (регрессионный тест на это обязателен).

Право отозвали посреди сессии: вкладка пропадает при следующем обновлении `/auth/me`; открытая страница получает 403 на запросах и показывает существующий `<ErrorState>` (`queryErrorProps`) — отдельного состояния не нужно.

#### B.2 Позиция вкладки

**Последней**, после «Przebieg»: `Wnioski / Nowy / Flota / Wyjazdy / Porozumienie / Przebieg / Dokumenty`, эмодзи **📁**, `labelKey: 'documents'` (`carrier.tabs.documents`).

Почему в конце, а не рядом с «Flota»: вкладка есть не у всех перевозчиков. Условная вкладка в середине сдвигала бы «Wyjazdy» / «Porozumienie» / «Przebieg» у одних перевозчиков и не у других — инструкции поддержки («trzecia zakładka…») и мышечная память разъехались бы. В конце она ничего не сдвигает. Документы — справочный раздел, к нему ходят реже всего.

Без бейджа-счётчика. Клик по активной вкладке = рефреш (§14) — работает автоматически через общий `useActiveNavRefresh`.

#### B.3 Страница

Контейнер — как у carrier fleet panel (каталог карточек в 3 колонки на `xl` выигрывает от ширины): `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8 space-y-6`.

```
Dokumenty                                                     ← h1
Dokumenty Twojej firmy i floty. Do dokumentów firmy możesz    ← подзаголовок (subtitleAdd | subtitleRead)
dodawać nowe pliki.

DOKUMENTY FIRMOWE
[Ubezpieczenie/OCP  2 pliki  ›] [Licencja  Brak plików ›] [KREPTD …] 
[Inne …]
DOKUMENTY CIĄGNIKÓW
[Umowa GPS …] [Porozumienie …] [Ubezpieczenie kabotażowe DE …]
ADR CIĄGNIKÓW
[ADR card — plates + classes, display only]
DOKUMENTY NACZEP
[Certyfikat XL …]
DOKUMENTY KIEROWCÓW
[Świadectwo ADR kierowcy …]
```

- `h1` — `text-2xl font-extrabold tracking-tight text-text` `carrier.documents.title`.
- Подзаголовок — `mt-1 text-sm text-text-sub`: `carrier.documents.subtitleAdd` при `.add`, иначе `carrier.documents.subtitleRead`.
- Ниже — `<CarrierDocumentsTab carrierId={…} />` без обёрток: группы, карточки `<DocumentTypeCard>`, ADR-карточка, `<DocumentTypeSheet>`, skeleton и error-state — ровно §5R.1–§5R.5. Шапки-карточки фирмы (как на странице opiekun) нет: перевозчик знает, чья это фирма.

#### B.4 Отличия от вида opiekun (только они)

| Место | opiekun / admin | Перевозчик с `.read` + `.add` | Перевозчик только с `.read` |
|---|---|---|---|
| Sheet типа фирмы — таблица файлов | Pobierz + Usuń | **только Pobierz** (колонка «Akcje» остаётся — в ней одна кнопка) | только Pobierz |
| Sheet типа фирмы — футер | подсказка `sheet.uploadHint` + `FileUpload compact` + «Prześlij» | подсказка **`sheet.uploadHintAddOnly`** + тот же `FileUpload` + «Prześlij» | вместо загрузки — строка `text-xs text-text-sub` **`sheet.companyByOpiekun`** (как указатель у типов флота) |
| Sheet типа флота — футер | `sheet.manageInVehicle/Trailer/Driver` | **`sheet.fleetByOpiekun`** (одна строка на все три типа) | то же |
| Confirm удаления | есть | не монтируется | не монтируется |

Формулировка «только загрузка» — одна, в подсказке над `FileUpload` (`uploadHintAddOnly`): «можно добавить, нельзя удалить или заменить, при ошибке — к опекуну». Отдельного confirm перед загрузкой **нет**: файл виден в `FileUpload` до нажатия «Prześlij», подсказка стоит рядом с кнопкой; лишний диалог на каждую загрузку — трение без пользы (opiekun может удалить ошибочный файл). Дат для правки на этой поверхности нет и у opiekun (колонка «Data przesłania» — read-only метка загрузки), поэтому про даты в UI не пишем ничего — нечего запрещать.

#### B.5 Обзор флота у перевозчика

- Всё read-only, как у opiekun: типы «Umowa GPS», «Porozumienie», «Ubezpieczenie kabotażowe DE», «Certyfikat XL», «Świadectwo ADR kierowcy» → Sheet со списком файлов и кнопкой «Pobierz»; ADR-карточка — без кликов.
- Скачивание — существующими маршрутами вложений машины / прицепа / водителя (`downloadVehicleAttachment` / `downloadTrailerAttachment` / `downloadDriverAttachment`), которые перевозчик уже проходит по роли (`vehicles.read` / `trailers.read` / `drivers.read` + владение). Если какое-то из этих прав у перевозчика отозвано (`deniedPermissions`), скачивание падает на существующий тост `downloadError` — отдельной обработки не нужно.
- В колонке сущности — **номер рег. (`registration`) / ФИО**, никогда `NR BOCZNY` (правило 2026-07-07: внутреннее обозначение MAGTRANS на поверхностях перевозчика не показывается). Overview DTO боковой номер и не несёт — проверить, что так и останется.

#### B.6 Пустые состояния

Как §5R.5: пустых экранов нет — карточки всегда на месте с нейтральной строкой «Brak plików»; Sheet пустого типа — существующий `<EmptyState>` (`empty.title` / `empty.message`), у перевозчика с `.add` под ним футер загрузки. ADR без машин — «Brak ciągników ADR». Ничего не окрашивается в warning (правило §5R: «no warnings anywhere»).

#### B.7 Мобильная раскладка

- Вкладки: существующий горизонтальный скролл `CarrierTabs`; на 360px «Dokumenty» за краем — так же, как сегодня «Przebieg». Если web-agent добавит `scrollIntoView({ inline: 'nearest' })` активной вкладке при монтировании — для всех вкладок сразу, не только для этой.
- Карточки — 1 колонка (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`, §5R.6). Sheet — во всю ширину (`w-full`, как сейчас). Футер загрузки — `flex-col items-stretch` ниже `sm` (уже так), «Prześlij» во всю ширину.
- Кнопка «Pobierz» в строке таблицы ниже `lg` — только иконка (уже так) → добавить `max-sm:min-h-11 max-sm:min-w-11` ради цели касания 44px. Это меняет только рендер ниже `sm` и одинаково для всех ролей; на `sm+` вид opiekun не меняется.

#### B.8 i18n (PL default + EN)

| Ключ | PL | EN |
|---|---|---|
| `carrier.tabs.documents` | Dokumenty | Documents |
| `carrier.documents.title` | Dokumenty | Documents |
| `carrier.documents.subtitleAdd` | Dokumenty Twojej firmy i floty. Do dokumentów firmy możesz dodawać nowe pliki. | Your company and fleet documents. You can add new files to company documents. |
| `carrier.documents.subtitleRead` | Dokumenty Twojej firmy i floty — tylko do podglądu. | Your company and fleet documents — view only. |
| `opieka.documents.sheet.uploadHintAddOnly` | Możesz dodać nowy plik. Dodanego pliku nie można usunąć ani zastąpić — w razie pomyłki skontaktuj się ze swoim opiekunem. | You can add a new file. Added files can't be deleted or replaced — if you make a mistake, contact your manager. |
| `opieka.documents.sheet.companyByOpiekun` | Dokumenty firmy dodaje Twój opiekun. | Your manager adds company documents. |
| `opieka.documents.sheet.fleetByOpiekun` | Dokumenty floty uzupełnia Twój opiekun. | Your manager keeps fleet documents up to date. |

Остальное — существующий namespace `opieka.documents.*` (§5R.7) без изменений: компонент один, словарь один.

#### B.9 Файлы для web-agent

| Файл | Что |
|---|---|
| `app/(employee)/employee/opieka/carriers/[login]/CarrierDocumentsTab.tsx` → **`components/documents/CarrierDocumentsTab.tsx`** | переезд (компонент теперь общий для двух route-групп; импорт из `app/(employee)/…` в `app/(carrier)/…` — запах). Гейты B.1 по `effectivePermissionsOf(user)`: футер загрузки ⇔ `.add`, кнопка/confirm удаления ⇔ `.delete`, указатель флота ⇔ `fleet.write`; ключи B.8 |
| `app/(employee)/employee/opieka/carriers/[login]/page.tsx` | только новый путь импорта |
| `app/(carrier)/carrier/dokumenty/page.tsx` (новый) | серверный гейт B.1 + клиентская часть B.3 |
| `components/carrier/CarrierTabs.tsx` | вкладка B.2, фильтр по правам (B.1); `labelKey` union + `'documents'` |
| `messages/pl.json`, `messages/en.json` | ключи B.8 |
| тесты | (1) opiekun/admin — рендер `CarrierDocumentsTab` без изменений (есть «Usuń», футер загрузки, «Zarządzaj w oknie …»); (2) перевозчик с `.read`+`.add` — нет «Usuń», есть загрузка с `uploadHintAddOnly`, `fleetByOpiekun`; (3) только `.read` — нет загрузки, `companyByOpiekun`; (4) `CarrierTabs` — вкладка только при `panel.carrier` ∧ `.read`, последней |

Зависимость, не дизайн: перевозчику нужен `carrierId` своей фирмы для `useCarrierDocumentsOverview(carrierId)` и upload/download-маршрутов `/carriers/:id/…`; сегодня `UserDto` его не несёт. Источник (поле в `/auth/me` или иной) — решение api-agent/web-agent; на вид не влияет.

### Carrier fleet panel (unified, planista-style) — `/carrier/fleet`

> **2026-06-26 — decision.** The three cramped carrier fleet sub-routes (`/carrier/fleet/vehicles`, `/drivers`, `/trailers`) — each a sparse 3–4-column read-only `<DataTable>` behind the route-based `<FleetSubTabs>` — collapse into **ONE full-width page** that mirrors the **planista panel (§6.3.1 / §6.3.2)** as its visual reference. The old sub-routes **redirect** to the unified page; the route-based `<FleetSubTabs>` is **retired** in favour of in-page `<Tabs>`. The panel stays **strictly read-only** (carriers never edit their own fleet here).

**Visual reference = the planista panel (§6.3).** Do not re-derive layout — reuse the §6.3.1 canonical role-panel composition (full-width 4.4 container strip `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`, page heading, then KPI strip, then in-page `<Tabs>` over read-only `<DataTable>`s). The only carrier-specific deltas are the KPI buckets (5 tiles, below) and the enriched «Auta» columns.

> ⚠️ **The JEŻDŻĄ / STOJĄ >7 DNI tiles below are SUPERSEDED by §6.3.6** (delegation-driven, 5-state ramp). The carrier fleet KPI strip now uses the same 5 status tiles as §6.3.6 (AUTA / AKTYWNE / STOJĄCE / DŁUGO STOJĄCE / DO USUNIĘCIA), still 100% client-computed from the full `VehicleDto` payload the carrier already holds (each vehicle now carries a computed `status`). Drivers/trailers move to the info-banner sub-line per §6.3.6. The table below is historical reference.

**KPI strip — 5 tiles, client-computed.** Same `<KpiCard>` strip pattern and the same bucket→tone vocabulary as the planista/dyspozytor strip (§6.3.3 / §6.4 — KpiCard 4.3 tones). The carrier already holds its **full** `VehicleDto` / `DriverDto` / `TrailerDto` payload from `/fleet/my`, so **all five values are computed CLIENT-SIDE** — **no API change, no new endpoint**. Responsive grid `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6`.

| Tile | Tile label (PL) | Source (client-computed) | `tone` |
|---|---|---|---|
| Total vehicles | AUTA | `vehicles.length` | `neutral` |
| Driving | JEŻDŻĄ | vehicles not idle >7d | `green` |
| Idle >7d | STOJĄ >7 DNI | vehicles whose `lastDroveAt` is > 7 days ago | `orange` |
| Drivers | KIEROWCY | `drivers.length` | `blue` |
| Trailers | NACZEPY | `trailers.length` | `neutral` |

- **«stojące > 7 dni» rule = same as planista.** A vehicle counts as idle when `now − lastDroveAt > 7 days`; a vehicle with **no `lastDroveAt` is assumed to be driving** (not idle) — identical to the planista/dyspozytor idle rule (§6.3.3). JEŻDŻĄ = total − idle.
- Tones follow §6.3.3: totals (AUTA, NACZEPY) are `neutral` (inert counts), JEŻDŻĄ `green`, STOJĄ >7 DNI `orange`, KIEROWCY `blue`. **Never `tone="purple"`** (no purple token — §6.3.3 deviation). The optional warning-toned «idle >7 dni» sub-list (§6.3.3) MAY be reused here verbatim if desired (inert chips, conditional on count > 0) — same tokens, no new ones.

**In-page tabs.** `Auta` / `Kierowcy` / `Naczepy`, rendered with the shadcn `<Tabs>` primitive exactly as §6.3.1 (mandatory `aria-label` on `<TabsList>`, brand-red `data-state=active`), **replacing** the retired route-based `<FleetSubTabs>`. Each tab = one read-only `<DataTable>` with its own `<EmptyState>`.

**«Auta» columns — enriched (carrier holds the full `VehicleDto`).** Wider than the planista subset because the carrier owns the full DTO:

| Column id | Header (PL) | Cell |
|---|---|---|
| `plate` | NR REJ. | `font-mono font-semibold` plate |
| `type` | TYP | vehicle type or `—` |
| `euro` | EURO | `<Badge variant="muted">` EURO class or `—` |
| `adr` | ADR | `<Badge variant="warning">` ADR class when present, else `—` (ADR = cargo permit flag — quirk #3) |
| `gb` | GB | country-access permit → `<Check className="text-success"/>` / `—` (GB/IT/FR are country-access permits, NOT language codes — quirk #3) |
| `it` | IT | country-access permit → check / `—` |
| `fr` | FR | country-access permit → check / `—` |
| `lastDroveAt` | OSTATNI PRZEJAZD | `lastDroveAt` date or `—`, `tabular-nums` |
| `active` | STATUS | `active ? <Badge variant="success">Aktywne</Badge> : <Badge variant="muted">Nieaktywne</Badge>` |

> **2026-07-07 — `NR BOCZNY` column removed (carrier surface).** `sideNumber` is the **internal MAGTRANS
> designation** and must **never** appear on a carrier-facing surface. The «Auta» table therefore **drops the
> `side` / NR BOCZNY column** entirely (it remains on the planista/dyspozytor/opiekun fleet tables, which are
> MAGTRANS-internal). Same rule governs the guarantee status rows (§12.3.2) and the shared episode history (§12.7,
> `showSideNumber` default `false`), and the vehicle detail modal opened from this panel (§6.15 carrier-self hide).

**Kierowcy / Naczepy columns are unchanged** — keep the existing carrier driver/trailer column sets (same shape as the planista subset, §6.3.2).

**Vehicle detail modal.** A row click in «Auta» opens the **full `<VehicleDetailModal>` (§6.15)** with **`hideCarrier`** (carrier-self hide — the carrier need not be told who the carrier is; «Przewoźnik» row omitted + no carrier-name subtitle fallback, per the §6.15 carrier-self-hide rule). Read-only context (no `onEdit` ⇒ «Zamknij»-only footer, §6.6). Driver/trailer rows keep their existing read-only detail behaviour.

### `<StatusBadge>` — extends existing `<Badge>`

Existing `<Badge>` (`apps/web/components/ui/Badge.tsx`) is **sufficient**. Add a thin wrapper `<StatusBadge status={...}>` that maps enum → variant + label:

| `ClaimStatus` value | Badge variant | Visible label (PL) | Icon (Lucide, 12px) |
|---|---|---|---|
| `NA_WERYFIKACJI` | `info` | "Weryfikacja" | `<Clock />` |
| `ZAAKCEPTOWANO` | `success` | "Zaakceptowano" | `<CheckCircle2 />` |
| `ODRZUCONO` | `danger` | "Odrzucono" | `<XCircle />` |
| `REKLAMACJA` | `warning` | "Reklamacja" | `<AlertTriangle />` |
| `OCZEKUJE_NA_AUTORYZACJE` | `info` | "Czeka na autoryzację" | `<Clock />` |

| `DelegationStatus` value | Badge variant | Label (PL) | Icon (Lucide, 12px, optional) |
|---|---|---|---|
| `zgloszony` | `info` | "Zgłoszony" | `<FileText />` |
| `gotowy` | `warning` | "Gotowy" | `<PackageCheck />` |
| `w_trasie` | `success` | "W trasie" | `<Truck />` |
| `zjechal` | `muted` | "Zjechał" | `<ParkingSquare />` |
| `anulowany` | `danger` | "Anulowany" | `<XCircle />` |

> ⚠️ **`gotowy` (5th status) added — REWORK 2026-06-20 #4 (see §7.10).** Full tone rationale for the 5-status lifecycle is locked in **§7.10.1**; the row above is the canonical const-map. `gotowy = warning` (amber) sits between `zgloszony` (info) and `w_trasie` (success) — " load found, zlecenie made, awaiting departure" — a transient holding state that reads as "needs the next operator step", consistent with `warning` carrying "attention/transient" elsewhere (it is NOT an error). Do not invent a new variant for it.

**Vehicle operational status (delegation-driven, 5 states)** — a sibling wrapper `<VehicleStatusBadge>` maps the five `VehicleStatusKey` values to `<Badge>` compositions. **Full authoritative spec (labels PL+EN, tones, tooltips, icons, collision-resolution, KPI tone map) is §6.3.6.** Quick reference:

| `VehicleStatusKey` | Tone | Badge classes | Icon (12px) | Label PL |
|---|---|---|---|---|
| `aktywna` | success | `bg-success/15 text-success border-success/30` | `<Truck />` | "Aktywna" |
| `stojaca` | neutral (slate) | `bg-input text-text-sub border-border` | `<CircleParking />` | "Stojąca" |
| `nieaktywna` | warning | `bg-warning/15 text-warning border-warning/30` | `<PauseCircle />` | "Długo stojąca" |
| `do_usuniecia` | danger | `bg-danger/15 text-danger border-danger/30` | `<Trash2 />` | "Do usunięcia" |
| `wylaczona` | muted / off | `bg-transparent text-text-sub border-dashed border-border` | `<PowerOff />` | "Wyłączona" |

`stojaca` (solid slate) and `wylaczona` (dashed hollow) are the two grey states — differentiated by fill + border-style + icon, never hue alone (§6.3.6).

No new variants — `Badge` covers all. `<StatusBadge>` lives in `components/carrier/StatusBadge.tsx` and is also reused in employee panel later; `<VehicleStatusBadge>` is its sibling.

### `<ClaimCard>` — list item on `/carrier/claims`

Replaces legacy `.claim-card` (`index.html:419-426`). Layout (mobile-first single column, desktop wider):

```
┌────────────────────────────────────────────────────────────────┐
│  WNI/2026/0042         [StatusBadge]            2 145,00 EUR   │
│  01.04.2026 → 30.04.2026                                       │
│  ─────────────────────────────────────────────────────────────  │
│  Pojazd: WA12345  ·  Kierowca: J. Kowalski                     │
│  [! Reklamacja zgłoszona]  (only when reklamacjaSubmitted)      │
└────────────────────────────────────────────────────────────────┘
```

| Slot | Tailwind |
|---|---|
| Card root | `bg-card rounded-lg border border-border p-5 mb-3 transition-shadow hover:shadow-card cursor-pointer` |
| Top row | `flex items-start justify-between gap-3 mb-1` |
| `nrZgl` | `text-[15px] font-extrabold text-text font-mono` |
| `paymentEur` | `text-xl font-extrabold text-text tabular-nums whitespace-nowrap` (mono digits) |
| Date range | `text-sm text-text-sub mb-3` with `<ArrowRight size={12} />` between dates |
| Divider | `border-t border-border my-3` |
| Meta row | `grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-text-sub` with `<span class="font-semibold text-text">value</span>` for values |
| Reklamacja indicator (conditional) | `mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning px-2 py-1 text-xs font-bold` + `<AlertTriangle size={12} />` |

> **UPDATE 2026-07-31.** The indicator slot is now driven by `reklamacjaResolution`, not by `reklamacjaSubmitted` alone: pending (`NULL`) keeps the recipe above **verbatim** («Reklamacja zgłoszona»), while a decided reklamacja renders `<ReklamacjaResolutionChip>` in the same slot (`success` «Reklamacja uznana» / `danger` «Reklamacja odrzucona»). Same position, same size, same 12px icon — only the tone and the word change. Otherwise a claim decided weeks ago would keep advertising a complaint that is already closed. Full spec: «Reklamacja — carrier claim-detail outcome block».

Click → navigate to claim detail (`/carrier/claims/[id]`). Empty list → `<EmptyState>` with `<FileText />` icon and CTA "Złóż wniosek" linking to `/carrier/claims/new`.

### `<BreakdownTable>` — preview table on new-claim form

> ⚠️ **EXTENDED by §16.5 (2026-09-20).** Месяц с выключенной гарантией (`kmPerDay === 0 && kmPerSaturday === 0`) рендерится по отдельному контракту: бейдж «Gwarancja wyłączona», приглушённая строка, `—` вместо ставки-призрака; смешанный период получает `<GuaranteeGapNotice>` **над** таблицей; период целиком без гарантии заменяет таблицу на `<EmptyState>`. **§16.5 авторитетен** для всего, что касается нулевых месяцев. **2026-09-24:** смешанный период считается по tablicy km — новый текст ноты (§16.5.3), staff-колонки «Km wg weryfikatora» / «Wpisane dni» (§16.5.5).

Compact read-only table fed by server preview response. Columns:

| Column | Header (PL) | Header (EN) | Format | Tailwind |
|---|---|---|---|---|
| `yearMonth` | "Miesiąc" | "Month" | `2026-04` | `text-left font-mono` |
| `workingDays` | "Dni rob." | "Work days" | integer | `text-right tabular-nums` |
| `kmPerDay` | "Km/dz." | "Km/day" | integer | `text-right tabular-nums` |
| `ratePerKm` | "€/km" | "€/km" | 4 decimals | `text-right tabular-nums` |
| `kmInMonth` | "Km/mc" | "Km/mo" | integer with thousand-sep | `text-right tabular-nums font-semibold` |

Headers were **abbreviated in Phase 3.1** (`Km/dzień`→`Km/dz.`, `Stawka €/km`→`€/km`, `Km w mc`→`Km/mc`, total `…(km gwarantowane)`→`…(km gwarant.)`) so the 5-column table never wraps headers even when squeezed into the narrow employee claim modal. i18n keys unchanged: `carrier.breakdown.*` in `messages/pl.json` + `en.json`.

> **Семантика колонок сместилась (субботняя гарантия).** `workingDays` — **теперь только будни** (пн–пт); `kmInMonth` — **гранд-тотал** = `round(workingDays × kmPerDay) + kmFromSaturdays`. Полное число дней месяца = `workingDays + saturdaysCounted`.

**Субботняя суб-строка (odd-Saturday guarantee).** Под строкой месяца, у которого `saturdaysCounted > 0`, рендерится дополнительная строка **«SOBOTY {n} × {km} = {total} km»** (i18n `carrier.breakdown.saturdays` = «Soboty» + `saturdaysDetail` = `{count} × {perSaturday} = {total} km`) — в **обеих** раскладках (5-колоночная таблица И stacked-cards). При `saturdaysCounted = 0` строка **не** показывается: месяц без субботней гарантии выглядит байт-в-байт как раньше. Подсказка `carrier.breakdown.excludedDaysHint` переформулирована — «Niedziele są zawsze wyłączone; soboty — o ile nie są objęte gwarancją sobotnią. …» (воскресенья исключены всегда; субботы — если не покрыты субботней гарантией). Зачётная суббота, попавшая на EU-ban/праздник, уходит в список excluded-дней (не оплачивается, не считается днём).

> ⚠️ **УДАЛЕНО (§0‴, 2026-07-08):** граничный хинт про время на форме претензии (под бывшими полями Godzina od / Godzina do, включая субботний вариант) — **убран**: форма `/carrier/claims/new` больше не содержит полей ввода времени (часы деривируются из выезда и показываются read-only «Godziny (z wyjazdu)»). Подсказка `excludedDaysHint` в таблице разбивки (выше) — это **другое**, остаётся.

#### Responsive behavior (canonical — CONTAINER queries, not viewport breakpoints)

`<BreakdownTable>` is reused at **two very different widths**: the wide carrier new-claim preview panel, and the narrow employee `<ClaimDetailModal>` breakdown section. It must be non-breaking in both. Pattern: **render both layouts, toggle by the component's OWN width via a container query.**

> **Why container queries, not `sm:` (corrects the earlier viewport-breakpoint spec).** `sm:hidden` / `hidden sm:block` are **viewport** breakpoints. The breakdown's host width has nothing to do with the viewport — it lives inside a modal section column. On any desktop viewport (`≥sm`) the viewport-toggle always picked the **table** variant, which then overflowed the narrow host column; the card variant only ever appeared on phone-width viewports. The fix is to toggle on the **container** width. The project is **Tailwind CSS v4** (`tailwindcss@^4`, `@tailwindcss/postcss@^4`, no `tailwind.config` — CSS-based config) which has **container queries in core — no plugin**. The root carries `@container`; the card/table toggle uses the arbitrary container variants `@max-[34rem]:…` / `@min-[34rem]:…`.

**Threshold: `34rem` (544px).** Below `34rem` the host is too narrow for the 5-column table to stay readable even at `text-xs`/`px-2` (the abbreviated headers + 4-decimal rate + thousand-separated km total need ~30–34rem). So: container **`< 34rem` → stacked cards**, container **`≥ 34rem` → 5-column table**. The narrow `<ClaimDetailModal>` breakdown section (now full-width — see §6.20) is wide enough on `lg+` to land in the table layout; on small modals / phones it falls to cards.

| Container width | Layout | Tailwind |
|---|---|---|
| **`< 34rem`** (cramped modal column, phone) | **Stacked card per month.** Each month = `rounded-md border border-border p-3`; the 4 metrics in a `grid grid-cols-2 gap-x-4 gap-y-2` label/value `<dl>` (`dt` = `text-text-sub`, `dd` = `tabular-nums`, `Km/mc` value `font-semibold`). Footer total = a single `bg-bg` row below the list. **No horizontal scroll, ever.** | root `@container`; card wrapper `@max-[34rem]:block @min-[34rem]:hidden p-3` |
| **`≥ 34rem`** (wide preview, roomy modal) | **5-column `<table>`**, tightened: `text-xs`, cells `px-2 py-2 h-10`, headers `whitespace-nowrap` (never wrap), `tracking-wide`. Footer `colSpan={4}` + value cell, unchanged structure. | table wrapper `@max-[34rem]:hidden @min-[34rem]:block overflow-x-auto` |

- **Root** is the `@container` context: `@container bg-card rounded-lg border border-border overflow-hidden`.
- Both views share `<ExcludedDays>` (the holiday/EU-ban disclosure) and `<MonthToggle>` (chevron + `yearMonth` + count) so behavior is identical across widths — the only difference is the metric layout (`<td>` cells vs. `<dl>` rows). Excluded-days expand/collapse + footer-total semantics are unchanged.
- Card view re-uses the same abbreviated header strings as `dt` labels — no new i18n keys needed.
- **Do not** reintroduce `sm:hidden`/`hidden sm:block` here — that is the bug this spec fixes.

Empty / loading state — see `<LivePreviewPanel>`. The card view renders the same `t('empty')` message centered when `rows.length === 0`.

### `<LivePreviewPanel>` — wraps BreakdownTable + stat cards

Right-hand panel on `/carrier/claims/new` (or below form on mobile). Layout:

```
┌─ Stat cards (2x2 grid) ─────────────────────┐
│  Km rzeczywiste │ Km gwarantowane          │
│  Różnica km     │ Wypłata (EUR)            │
└─────────────────────────────────────────────┘
┌─ BreakdownTable ────────────────────────────┐
│  ...                                        │
└─────────────────────────────────────────────┘
```

| Element | Tailwind |
|---|---|
| Wrapper | `flex flex-col gap-4` |
| Stat grid | `grid grid-cols-2 gap-3` |
| Stat card root | `bg-card rounded-lg border border-border p-4` |
| Stat label | `text-xs font-bold uppercase tracking-wider text-text-sub` |
| Stat value | `mt-1 text-2xl font-extrabold text-text tabular-nums` |
| Highlight: `paymentEur` stat | left-border accent — add `border-l-4 border-brand pl-3` |
| Highlight: negative `kmDifference` (when kmActual > kmGuaranteed → no payout) | value `text-text-sub` instead of `text-text` |

**Loading state (debounce ≥400ms before firing):**
- Stat values render as `<Skeleton className="h-7 w-24" />` (install `skeleton` shadcn primitive — see additions list).
- BreakdownTable rows render 3 skeleton rows of `h-10`.
- Subtle spinner top-right of panel: `<Loader2 className="animate-spin text-text-sub" size={14} />` + label "Aktualizuję podgląd…".

**Error state:** if server returns 4xx/5xx, render `<EmptyState>` inside the panel with `<AlertTriangle />` and message "Nie udało się obliczyć podglądu — sprawdź dane wejściowe."

**Empty state (form not yet filled enough):** muted text "Wypełnij okres i pojazd, aby zobaczyć podgląd." centered in panel, no skeleton.

> **Server is the single source of truth.** Client never recomputes km/EUR locally. UI shows **exactly** what `POST /claims/preview` returned. Form submit uses the same calc on server.

### Reklamacja sheet

> ⚠️ **REWORK 2026-07-31 — AUTHORITATIVE.** The old one-line trigger — ~~«Triggered from claim detail page when status is `ODRZUCONO` and within 48h of decision»~~ — was **stale and incomplete**: it omitted `ZAAKCEPTOWANO` (an accepted-but-underpaid claim is the *main* reklamacja case), the one-per-claim rule, and the amount ceiling. The eligibility table below is the single source of truth. **The form itself (2 fields) and the 48h `<CountdownBanner>` are unchanged** — only the trigger conditions, the ceiling's field binding, and a third dead-end state are added.

Sheet: shadcn `<Sheet side="right">`, `w-[480px]` (Phase 2 standard), opened from the «Zgłoś reklamację» CTA on the carrier claim detail page (§B header, bottom-right).

#### Eligibility — `canSubmitReklamacja` (ALL four conditions must hold)

| # | Condition | Field(s) | Rationale |
|---|---|---|---|
| 1 | Claim is **decided** — `status ∈ {ZAAKCEPTOWANO, ODRZUCONO}` | `claim.status` | Nothing to complain about before a decision exists. `NA_WERYFIKACJI` / `OCZEKUJE_NA_AUTORYZACJE` / `REKLAMACJA` are all non-eligible. |
| 2 | **No reklamacja yet** — `reklamacjaSubmitted === false` | `claim.reklamacjaSubmitted` | **One reklamacja per claim, ever.** There is no second round, and no re-open after a decided reklamacja. |
| 3 | **There is a delta** — `maxAmount > 0` | `origPaymentEur`, `amountApproved` | A reklamacja is a request for the *unpaid remainder*. If nothing is unpaid, there is nothing to ask for (see dead-end state ③). |
| 4 | **Within 48h** — `now < statusChangedAt + 48h` | `claim.statusChangedAt` | Existing rule, unchanged. Server clock is authoritative. |

**`maxAmount` (the ceiling) — «wnioskowana minus wypłacona»:**

```
maxAmount = origPaymentEur − (status === 'ZAAKCEPTOWANO' ? (amountApproved ?? 0) : 0)
```

- `origPaymentEur` = **kwota wnioskowana** — the immutable submit-time dopłata snapshot (§12-database-schema). Never use the live `paymentEur` (the verifier may have moved it).
- `amountApproved` = **kwota wypłacona**. Subtracted **only** for `ZAAKCEPTOWANO`; for `ODRZUCONO` nothing was paid, so `maxAmount === origPaymentEur` and the carrier may claim the whole requested amount.
- Client renders the number; **server recomputes and re-validates it** on submit (`422` on breach). Never trust a client-side ceiling.

#### Form fields (unchanged)

| Field | Type | Validation |
|---|---|---|
| `tresc` | `<Textarea>` rows=6, label "Treść reklamacji" | required, 20–2000 chars |
| `kwotaReklamacji` | `<Input type="number" step="0.01">`, label "Kwota reklamacji (EUR)", suffix "€" | required, > 0, ≤ `maxAmount` (rendered as `<FormDescription>`: «Maksymalnie: 1 234,56 €») |

**Ceiling helper copy (PL, `carrier.reklamacja.maxHint`)** — one line under the amount field, `text-xs text-text-sub`, always visible while the sheet is open:

> «Maksymalnie: **{max} €** — kwota wnioskowana ({requested} €) minus wypłacona ({paid} €).»

For `ODRZUCONO` the parenthetical collapses to a single clause (`carrier.reklamacja.maxHintRejected`): «Maksymalnie: **{max} €** — cała kwota wnioskowana (wniosek został odrzucony, nic nie wypłacono).» Two keys, no branching inside one interpolated string.

**48-hour countdown indicator** — sticky banner at top of the sheet body (`<CountdownBanner>`, unchanged):

| Element | Tailwind |
|---|---|
| Wrapper | `flex items-center gap-2 rounded-md bg-warning-bg dark:bg-warning/15 px-3 py-2 mb-4` |
| Icon | `<Clock size={16} class="text-warning-dark dark:text-warning" />` |
| Text | `text-sm text-warning-dark dark:text-warning` — "Pozostało: **23h 14min**" (bold the duration) |
| Tick | re-render every 60s (no second-by-second — burns cycles, not informative) |
| When < 1h remaining | swap wrapper to `bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger` and apply `animate-blink-red` to the icon only |

Footer: standard `<SheetFooter>` — `<Button variant="ghost">Anuluj</Button>` + `<Button>Wyślij reklamację</Button>`. Submit is server-validated (server re-checks the 48h window, the one-per-claim flag **and** the ceiling — never trust client clock or client arithmetic).

#### The three dead-end states (why no reklamacja is possible)

All three follow the **§6.5.13 hard rule: an impossible action is *removed*, not disabled.** The CTA is not rendered; the *reason* is carried by a quiet line on the detail page — never by a greyed button, never by a toast after a click.

| # | State | Predicate | Detail-page treatment | Sheet treatment (if reached by deep-link / stale tab) |
|---|---|---|---|---|
| ① | **Termin upłynął** | decided + `!reklamacjaSubmitted` + `maxAmount > 0` + past 48h | Muted line where the CTA sat: `text-xs text-text-sub` + `<Clock size={12} />` — «Termin reklamacji upłynął (48 godzin od decyzji).» | `<EmptyState>` «Termin reklamacji upłynął» + form omitted (existing spec, retained) |
| ② | **Już zgłoszona** | `reklamacjaSubmitted === true` | No CTA. The reklamacja itself is shown by the outcome block (next section) — pending / UZNANA / ODRZUCONA. No extra explanatory line: the block *is* the explanation. | `<EmptyState>` «Reklamacja do tego wniosku została już złożona.» |
| ③ | **Brak różnicy** (NEW) | decided + `!reklamacjaSubmitted` + `maxAmount <= 0` | Muted line where the CTA sat, `text-xs text-text-sub` + `<Info size={12} />` — see copy below. | `<EmptyState>` «Brak kwoty do reklamacji» + form omitted |

**State ③ copy (PL, `carrier.reklamacja.noDelta`)** — the visible one-liner on the detail page:

> «Reklamacja nie jest możliwa — wypłacona kwota pokrywa całą kwotę wnioskowaną.»

`title` (native, one extra clause, `carrier.reklamacja.noDeltaTitle`): «Reklamacja dotyczy niewypłaconej różnicy; w tym wniosku różnicy nie ma (wnioskowano {requested} €, wypłacono {paid} €).»

- `maxAmount <= 0` covers **both** `= 0` (paid exactly what was requested) and `< 0` (paid *more* than requested, e.g. after a verifier correction upward). **One state, one copy** — do not invent a separate "overpaid" message; the carrier's question is only «why can't I file?», and «wypłacona kwota pokrywa całą wnioskowaną» answers it truthfully in both cases.
- Placement: the same `mt-6 flex items-center justify-end` slot the CTA occupies, so the header's bottom edge does not reflow between eligible / non-eligible claims.
- Tone is **neutral** (`text-text-sub`), never `warning`/`danger`: nothing went wrong — the carrier was paid in full. Same posture as `<LockNotice>` (§6.5.13): "a state is not an error".
- **Degenerate sub-case — nothing was ever requested** (`origPaymentEur` is `0` or `null`, e.g. the guarantee was met): then `maxAmount <= 0` for a *rejected* claim too, where «wypłacona kwota pokrywa wnioskowaną» would read absurdly. Use a second key `carrier.reklamacja.noDeltaZero`: «Reklamacja nie jest możliwa — wniosek nie zawierał kwoty do wypłaty.» Same slot, same neutral tone, same removed-CTA rule. Two keys total for state ③ — pick by `origPaymentEur > 0`.

### Reklamacja — carrier claim-detail outcome block (NEW 2026-07-31 — AUTHORITATIVE)

> **The problem this solves.** After the rework, a decided reklamacja **no longer lives in the claim status**: the claim returns to `statusBeforeReklamacja` (i.e. back to `ZAAKCEPTOWANO` / `ODRZUCONO`), so `<StatusBadge>` looks exactly as it did before the reklamacja was ever filed. The outcome is carried **only** by data (`reklamacjaResolution ∈ {UZNANA, ODRZUCONA}`, `NULL` = pending). Therefore the UI **must** communicate the outcome through a dedicated block + chip, and **must not** try to read it out of the status badge.

**Component:** `<ReklamacjaOutcome>` — `apps/web/components/carrier/ReklamacjaOutcome.tsx`. Rendered **only when `claim.reklamacjaSubmitted === true`**, as a standalone card **below** the «Szczegóły» `<dl>` card and **above** the (optional) Historia/diff section. Own card so it never competes with the header hero and never gets lost among 8 `<dl>` rows.

| Slot | Tailwind |
|---|---|
| Card root | `bg-card rounded-lg border border-border p-5 mb-6` — the standard content card (same as «Szczegóły»); **the tone lives in the inner state banner, not in the card fill** (a fully tinted card at this size shouts louder than the money hero). |
| Section title row | `flex items-center justify-between gap-3 mb-4` → title «Reklamacja» `text-sm font-bold text-text` + `<ReklamacjaResolutionChip>` on the right |
| State banner (one, tone by resolution) | `flex items-start gap-2 rounded-md px-3 py-2 text-sm` + tone classes from the table below |
| Value grid | `<dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">` — same row primitive as «Szczegóły» (`dt` = `text-xs uppercase tracking-wider text-text-sub`, `dd` = `text-text`, money `tabular-nums font-semibold`) |
| Long text rows (`reklamacjaText`, `reklamacjaResponse`) | `sm:col-span-2`, value `whitespace-pre-wrap` |

#### The three states

| `reklamacjaResolution` | Chip | Banner tone | Banner copy (PL) | Icon |
|---|---|---|---|---|
| `NULL` (pending) | `<Badge variant="warning">Reklamacja w toku</Badge>` | `bg-warning-bg text-warning-dark dark:bg-warning/15 dark:text-warning` | «Reklamacja została zgłoszona i czeka na rozpatrzenie.» | `<AlertTriangle size={16} />` |
| `UZNANA` | `<Badge variant="success">Reklamacja uznana</Badge>` | `bg-success-bg text-success-dark dark:bg-success/15 dark:text-success` | «Reklamacja uznana — kwota **{kwota} €** zostanie wypłacona.» | `<CheckCircle2 size={16} />` |
| `ODRZUCONA` | `<Badge variant="danger">Reklamacja odrzucona</Badge>` | `bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger` | «Reklamacja odrzucona.» (the *reason* is a `<dl>` row, not the banner — a 500-char reason inside a tinted banner is unreadable) | `<XCircle size={16} />` |

- The **pending** state reuses the existing warning-indicator recipe verbatim (§`<ClaimCard>` reklamacja indicator, line ~1186) — same tokens, same `<AlertTriangle>`, so «reklamacja w toku» reads identically on the list card and on the detail page. Do not fork it.
- `<ReklamacjaResolutionChip>` is a **thin `<Badge>` wrapper**, not a new primitive: `resolution → {variant, label, icon}` map, exactly like `<StatusBadge>`. Lives in `apps/web/components/claims/ReklamacjaResolutionChip.tsx` and is imported by **both** panels (same cross-panel precedent as `<StatusBadge>`, which lives in `components/carrier/`). **0 new tokens.**
- **Never render the chip as if it were a claim status** — it sits inside the reklamacja block (and, on the employee `<ClaimsTable>`, as a secondary chip *under* the status cell), never in the `<StatusBadge>` slot. Two chips in one slot would read as two statuses.

#### `<dl>` rows inside the block (final order)

| # | Row | Label PL | Source | Condition |
|---|---|---|---|---|
| 1 | Kwota reklamacji | «Kwota reklamacji» | `reklamacjaAmount` | always |
| 2 | Data zgłoszenia reklamacji | «Data zgłoszenia» | `reklamacjaSubmittedAt` | always (fallback: omit if null) |
| 3 | Treść | «Treść reklamacji» | `reklamacjaText` | always, `sm:col-span-2` |
| 4 | Nr zlecenia (reklamacji) | «Nr zlecenia» | `reklamacjaOrderNumber` | only when `UZNANA` **and** non-empty |
| 5 | Data rozpatrzenia | «Data rozpatrzenia» | `reklamacjaDecidedAt` | only when `reklamacjaResolution != null` |
| 6 | Odpowiedź / powód | «Odpowiedź MAGTRANS» | `reklamacjaResponse` | only when non-empty, `sm:col-span-2` |

- Dates render **date-only** via the page's `formatDate` helper — consistent with every other date on this screen (§B.1 "Date-only, not datetime").
- **Row 4 may legitimately be absent even for `UZNANA`** — the staff-side «Nr zlecenia» prefill can start empty (a rejected claim has no `orderNumber`), and the field is only *required at decision time*, so a historical/edge record may carry `NULL`. Omit the row; never render `—`.
- **`reklamacjaText` / `reklamacjaResponse` are REMOVED from the «Szczegóły» `<dl>`** (former rows 7–8, §B.1). They now live here, once. Two copies of the same paragraph on one page is the exact duplication this block exists to end.

#### «Wypłacono łącznie» — the total after an uznana reklamacja

Total paid = `(amountApproved ?? 0) + (reklamacjaAmount ?? 0)`, and **either part may be 0/null** (a rejected claim with an uznana reklamacja pays *only* `reklamacjaAmount`). Two surfaces, one number:

**1. Header hero — a third state (locked).** §B's hero has two states (approved / calc). Add a third, in the **same typographic slot** (`text-4xl md:text-5xl font-extrabold tabular-nums leading-none`) so there is zero layout shift:

| Hero state | Condition | Value | Colour | Label (PL) |
|---|---|---|---|---|
| **Wypłacono łącznie** | `reklamacjaResolution === 'UZNANA'` | `(amountApproved ?? 0) + reklamacjaAmount` | `text-brand` | «wypłacono łącznie» |
| Kwota zatwierdzona | `amountApproved != null` (no uznana reklamacja) | `amountApproved` | `text-brand` | «kwota zatwierdzona» (existing) |
| Kalkulacja | otherwise | `paymentEur` | `text-text-sub` | «kalkulacja» (existing) |

Under the hero label, when the total state is active, one extra muted breakdown line (`text-xs text-text-sub tabular-nums`, key `carrier.claims.detail.totalBreakdown`):

> «w tym decyzja: {approved} € · reklamacja: {reklamacja} €»

Rationale: the hero's job (§B) is «the money MAGTRANS owes you». After an uznana reklamacja, `amountApproved` alone is **wrong** as that number — and for a rejected-claim-with-uznana-reklamacja it is `null`, which would drop the hero into the muted «kalkulacja» state and tell the carrier they were paid nothing. The brand-red scarcity rule is respected: still exactly one brand-red number per screen.

**2. «Szczegóły» `<dl>` — one new row**, inserted **immediately after** row 3 «Kwota zatwierdzona» (i.e. it becomes row 3b, ahead of `Nr zlecenia`), rendered **only** when `reklamacjaResolution === 'UZNANA'`:

| Label PL | Label EN | Value | `dd` classes |
|---|---|---|---|
| «Wypłacono łącznie» | "Total paid" | `(amountApproved ?? 0) + reklamacjaAmount` | `font-semibold tabular-nums text-text` |

It sits **after** its two addends so the money rows read as an arithmetic sum top-to-bottom (`Kwota zatwierdzona` → `Wypłacono łącznie`), with the reklamacja addend restated in the outcome block below. Do **not** put the total first; a sum before its parts reads as a contradiction. Do **not** tint it green — the tone is already carried by the outcome block's chip and banner.

#### Catalogue additions (carrier side)

| Component | Kind | File |
|---|---|---|
| `<ReklamacjaOutcome>` | new composition (`Card` + `Badge` + `<dl>` rows) | `apps/web/components/carrier/ReklamacjaOutcome.tsx` |
| `<ReklamacjaResolutionChip>` | thin `<Badge>` wrapper (shared carrier + employee) | `apps/web/components/claims/ReklamacjaResolutionChip.tsx` |

**Tokens: 0 new.** Composes `bg-card`, `border-border`, `bg-success-bg`/`text-success-dark`, `bg-danger-bg`/`text-danger-dark`, `bg-warning-bg`/`text-warning-dark` (+ their `dark:` `/15` variants), `text-brand`, `text-text`, `text-text-sub`. No `globals.css` / Tailwind-config change (Phase 4.4 policy).

**DTO fields this section depends on** (additive, **api/db-agent owned — not a design decision**): `reklamacjaResolution`, `reklamacjaOrderNumber`, `reklamacjaSubmittedAt`, `reklamacjaDecidedAt`, plus `origPaymentEur` (already on the wire) for the ceiling. The web layer must treat every one of them as nullable.

### Notes for web-agent

- The carrier fleet is **one unified full-width page** (`/carrier/fleet`) with a 5-tile KPI strip + in-page `<Tabs>` (Auta/Kierowcy/Naczepy), mirroring the planista panel (§6.3) — see «Carrier fleet panel (unified, planista-style)» above. The old `/carrier/fleet/{vehicles,drivers,trailers}` sub-routes redirect to it; the route-based `<FleetSubTabs>` is retired. Each tab uses the existing `<DataTable>` — no new table primitive. Stays strictly read-only.
- `/carrier/delegations` uses `<DataTable>` + `<StatusBadge>` for the status column. "Add auto" modal uses `<Dialog>` (not `<Sheet>`) — it's a compact single-step form (see `carrier-delegations-add-auto-modal.png`).
- New-claim form layout: 2-column grid (`grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6`) — left = RHF form, right = `<LivePreviewPanel>`. Mobile collapses to single column with preview below form.
- Description textarea on new-claim form is the only difference between `carrier-new-claim-preview.png` and `carrier-new-claim-preview-with-description.png` — gate with a `<details>` / collapsible "Dodaj komentarz" toggle to reduce visual noise by default.

## Phase 3 — components web-agent must add

| Component | File path |
|---|---|
| `<StatusBadge>` | `apps/web/components/carrier/StatusBadge.tsx` (also imported by employee panel later) |
| `<ClaimCard>` | `apps/web/components/carrier/ClaimCard.tsx` |
| `<BreakdownTable>` | `apps/web/components/carrier/BreakdownTable.tsx` |
| `<LivePreviewPanel>` | `apps/web/components/carrier/LivePreviewPanel.tsx` |
| `<ReklamacjaSheet>` | `apps/web/components/carrier/ReklamacjaSheet.tsx` |
| `<CarrierTabBar>` | `apps/web/components/carrier/CarrierTabBar.tsx` |
| ~~`<FleetSubTabs>`~~ | ~~`apps/web/components/carrier/FleetSubTabs.tsx`~~ — **retired 2026-06-26**; carrier fleet now uses in-page shadcn `<Tabs>` on the unified `/carrier/fleet` page (see «Carrier fleet panel (unified, planista-style)»). |
| `<CountdownBanner>` (used inside ReklamacjaSheet) | `apps/web/components/carrier/CountdownBanner.tsx` |

**shadcn primitives to install** (run from repo root, scoped to web workspace):

```bash
npm exec -w web -- shadcn@latest add skeleton tooltip
```

`skeleton` — required for `<LivePreviewPanel>` loading state (not yet present in `apps/web/components/ui/`).
`tooltip` — required for `<GpsStatus>` (Phase 4-5) and useful for value hints on `<BreakdownTable>` numeric cells.

All other primitives (`Button`, `Input`, `Textarea`, `Select`, `Sheet`, `Dialog`, `Badge`, `DataTable`, `EmptyState`, `Label`) already exist in `apps/web/components/ui/`.

---

## Phase 3.1 — claim detail polish (hours readout, header layout, excluded-days list)

> Three targeted UI polishes applied to the carrier claim detail page and the employee verification modal. No new colors, no new components, no new dependencies — only token additions, layout rules and copy decisions. References:
>
> - Carrier detail header: [`magguarantee-app/apps/web/app/(carrier)/carrier/claims/[nrZgl]/page.tsx`](../magguarantee-app/apps/web/app/(carrier)/carrier/claims/%5BnrZgl%5D/page.tsx) lines 112–172.
> - Verification modal read-only block + ZAAKCEPTOWANO panel + `hoursAdjusted` input: [`magguarantee-app/apps/web/components/claims/ClaimVerificationModal.tsx`](../magguarantee-app/apps/web/components/claims/ClaimVerificationModal.tsx) lines 484–502, 525–553, 580–636.
> - Excluded-days dropdown: [`magguarantee-app/apps/web/components/carrier/BreakdownTable.tsx`](../magguarantee-app/apps/web/components/carrier/BreakdownTable.tsx) lines 120–142.
> - Engine: [`magguarantee-app/packages/shared/src/domain/km-calc.ts`](../magguarantee-app/packages/shared/src/domain/km-calc.ts) — `rawTotalDays` already computed internally (~L370), needs to be surfaced.

### A. Hours readout pattern (`HoursReadout`)

**Purpose.** Carriers and verifiers must see both the **raw** total hours of the claim period and the **counted** (adjusted) hours after exclusions/overrides. Currently only the adjusted number is visible, which hides the magnitude of the exclusion correction and makes verifier review opaque.

#### Data contract (cross-package change)

- Engine (`packages/shared/src/domain/km-calc.ts`) already computes `rawTotalDays` internally. Surface it:
  - Add `rawTotalDays: number` to the engine result type (`KmCalcResult`).
  - Add `rawTotalDays: z.number()` to `KmCalcBreakdownSchema` (shared zod schema).
  - API serializer must include `rawTotalDays` in `breakdown` payload returned by both `/claims/preview` and `/claims/{id}`.
- Web reads `claim.breakdown.rawTotalDays` and `claim.breakdown.totalDays` (the adjusted one). Both are **days, fractional, 2dp**. Web multiplies by 24 to derive hours and formats via the shared `formatDaysPl`-style helper (PL comma decimal, 2dp). No client-side recompute of business logic — purely a presentation transform `hours = days * 24`.
- **Fallback rule:** when `claim.breakdown === null` (legacy/imported claims without engine output, or pre-calc state) — render `—` (em-dash) in place of the readout. Do not crash, do not show `NaN h`, do not synthesize a fake number.

#### Copy (PL primary, EN secondary — i18n keys)

| Key | PL | EN |
|---|---|---|
| `hoursReadout.label` | "Czas" | "Time" |
| `hoursReadout.raw` | "surowe" | "raw" |
| `hoursReadout.counted` | "zaliczone" | "counted" |
| `hoursReadout.unit` | "h" | "h" |
| `hoursReadout.hint.identical` | "Bez wyłączeń" | "No exclusions" |
| `hoursReadout.hint.adjusted` | "Po wyłączeniach i korektach" | "After exclusions and overrides" |
| `hoursReadout.hint.override` | "Po ręcznej korekcie weryfikatora" | "After manual verifier override" |
| `hoursReadout.missing` | "—" | "—" |

**Visible string template:** `Czas: 240,00 h surowych / 215,50 h zaliczonych`.

When `rawTotalDays === totalDays` (no exclusions, no override) collapse to a single number: `Czas: 240,00 h` and hide the slash. This avoids visual noise on small clean claims (one-month, no holidays/exclusions).

#### Visual treatment

Single horizontal line with two values separated by ` / `, label prefix, optional hint underneath.

```
Czas: 240,00 h surowych / 215,50 h zaliczonych
      └─ muted ──┘       └─ emphasised ──┘
Po wyłączeniach i korektach
└─ caption, text-xs text-text-sub ─────┘
```

| Slot | Tailwind |
|---|---|
| Wrapper | `flex flex-col gap-0.5` (vertical: line + optional hint) |
| Inline row | `text-sm text-text inline-flex items-baseline gap-1.5 flex-wrap` |
| Label "Czas:" | `text-text-sub font-medium` |
| Raw value | `tabular-nums text-text-sub` (muted because it is the baseline, not the result) |
| Separator `/` | `text-text-sub mx-0.5` |
| Counted value | `tabular-nums font-semibold text-text` (the operative number) |
| Unit "h" | inline with each value, same color as that value |
| Hint | `text-xs text-text-sub` |
| Missing breakdown | render `Czas: —` only, no hint, no second value |

**Live-update behaviour next to `hoursAdjusted` input (modal):**

When the verifier edits `hoursAdjusted`, the **counted** number must update live (controlled by RHF watch on `hoursAdjusted`). The **raw** number stays constant (it is the period baseline, not a user input). Hint switches to `hoursReadout.hint.override` while the value diverges from the engine's auto-computed counted total. Debounce is **not** required — this is a pure local arithmetic transform, no server roundtrip.

> **Correction (2026-06-25, web-agent).** In the unified verifier modal (§6.5) the live (edit-mode) `HoursReadout` is now sourced from the **live `/preview` breakdown** (`previewQ.data.breakdown`), the SAME numbers that drive the DOPŁATA — **not** from a local `hoursAdjusted`-only transform. Consequence: when the verifier edits **GODZ. ZJAZDU / GODZ. PRZYJAZDU** the first/last partial days change, so BOTH `surowych` (`rawTotalDays`) and `zaliczonych` (`totalDays`) move (in lockstep with the dopłata), and they still differ by exactly the `hoursAdjusted` korekta. The previous "raw stays constant / pure local transform" wording above describes the read-only carrier-detail call-site (§ B / placement 1–2), which keeps reading the persisted `claim.breakdown`. Fallback to the persisted breakdown is used only before the first preview response (never `—`/NaN); `placeholderData` retains the last good preview across debounced recalcs to avoid number flicker.

#### Placement (locked)

1. **Carrier claim detail (`[nrZgl]/page.tsx`)** — inside the new header right column, below the period dates (see § B for placement). Read-only display, no live behaviour.
2. **Verification modal read-only context block** (`ClaimVerificationModal.tsx` lines 484–502) — render `HoursReadout` as a full-width row **below** the 2×2 Stat grid (not inside the grid — it deserves its own row because it carries two values). Read-only.
3. **Verification modal — under `hoursAdjusted` input** (lines 525–553) — render the same `HoursReadout` with `live={true}` directly under the input, replacing the current `text-warning` hint when override is active. The existing `origHoursAdjusted` warning hint is **absorbed** into `HoursReadout.hint.override` — do not stack two hints.

> **Single source of presentation** — same component, three call-sites, same copy. Do not fork the rendering between detail page and modal.

### B. Claim detail header redesign

**Goal.** Make the financial outcome the dominant focal point. Currently `nrZgl` is the first thing seen, the four amounts (mileage, km guaranteed, payment) are equal-weight in a 4-column grid, and `amountApproved` (the real outcome after verification) is buried in the lower `<dl>` block. After redesign: the **approved EUR amount** is the largest element on the screen; the calculation (`paymentEur`) is a fallback shown muted when no approval exists yet.

#### Header layout (ASCII)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   2 145,00 €                                  WNI/2026/0042  [StatusBadge] │
│   kwota zatwierdzona                          Wniosek: 2 145,00 €          │
│                                               01.04.2026 → 30.04.2026      │
│                                               Czas: 240,00 h / 215,50 h    │
│                                                                            │
│ ──────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│   Pojazd: WA12345    Przebieg: 12 340 km    Km gwarantowane: 11 800 km     │
│                                                                            │
│                                              [! Zgłoś reklamację]          │
└────────────────────────────────────────────────────────────────────────────┘
```

When `amountApproved === null` (status `NA_WERYFIKACJI`, `OCZEKUJE_NA_AUTORYZACJE`, etc.):

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   2 145,00 €                                  WNI/2026/0042  [StatusBadge] │
│   kalkulacja                                  Wniosek: 2 145,00 €          │
│   └─ muted, weight 600 ─┘                     01.04.2026 → 30.04.2026      │
│                                               Czas: 240,00 h / 215,50 h    │
│ ──────────────────────────────────────────────────────────────────────────  │
│   Pojazd: WA12345    Przebieg: 12 340 km    Km gwarantowane: 11 800 km     │
└────────────────────────────────────────────────────────────────────────────┘
```

When `reklamacjaResolution === 'UZNANA'` (third hero state, added 2026-07-31 — see «Reklamacja — carrier claim-detail outcome block»):

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   2 545,00 €                                  WNI/2026/0042  [StatusBadge] │
│   wypłacono łącznie                           Wniosek: 2 545,00 €          │
│   w tym decyzja: 2 145,00 € · reklamacja: 400,00 €                         │
│                                               01.04.2026 → 30.04.2026      │
│ ──────────────────────────────────────────────────────────────────────────  │
│   Pojazd: WA12345    Przebieg: 12 340 km    Km gwarantowane: 11 800 km     │
└────────────────────────────────────────────────────────────────────────────┘
```

Note that `[StatusBadge]` still reads «Zaakceptowano» / «Odrzucono» here — the claim status returned to `statusBeforeReklamacja`. The reklamacja outcome is **never** inferred from the badge; it is the `<ReklamacjaOutcome>` block + `<ReklamacjaResolutionChip>` further down the page.

The number itself stays the same physical size in all three states; **only the label and color change** to communicate "this is provisional". This avoids layout shift when the verifier flips the claim to `ZAAKCEPTOWANO` — the value just snaps from muted to emphasised.

#### Layout primitives

| Slot | Tailwind | Notes |
|---|---|---|
| Card root | unchanged (`bg-card rounded-lg border border-border p-6 mb-6`) | Same surface as today. |
| Top row | `grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start` | Money left, meta right. On mobile, money stacks above meta. |
| **Money block (left)** | `flex flex-col gap-0.5` | |
| Money value (approved) | `text-4xl md:text-5xl font-extrabold tabular-nums text-brand leading-none` | Brand red for the approved figure. Single visual hierarchy peak. |
| Money value (calc fallback) | `text-4xl md:text-5xl font-extrabold tabular-nums text-text-sub leading-none` | Muted neutral when not yet approved. |
| Money label (approved) | `text-xs font-bold uppercase tracking-wider text-text-sub mt-1` | "kwota zatwierdzona" |
| Money label (calc) | `text-xs font-bold uppercase tracking-wider text-text-sub mt-1` | "kalkulacja" — same typographic slot, different word. |
| **Meta block (right)** | `flex flex-col gap-1.5 md:items-end md:text-right` | |
| `nrZgl` row | `inline-flex items-center gap-2` with `StatusBadge` | `text-[15px] font-extrabold text-text font-mono` for the nrZgl. Status badge sits inline on the right of it. |
| `kwotaWnioskowana` line | `text-sm text-text-sub tabular-nums` with bold value: `Wniosek: <b class="font-semibold text-text">2 145,00 €</b>` | Always visible — even when `amountApproved` matches `paymentEur`, the requested amount is part of the audit trail. |
| Date range | `text-sm text-text-sub` with `<ArrowRight size={12} />` between dates | Same style as `<ClaimCard>` for visual continuity. |
| `HoursReadout` | see § A | Compact, single line. |
| Divider | `border-t border-border my-4` | Separates money/meta block from the vehicle factual row. |
| **Vehicle row (bottom)** | `flex flex-wrap items-center gap-x-6 gap-y-2 text-sm` | Each item: `<span class="text-text-sub">Pojazd:</span> <b class="font-semibold text-text font-mono">WA12345</b>`. |
| Reklamacja CTA **slot** | `mt-6 flex items-center justify-end` | The slot holds **either** the «Zgłoś reklamację» `<Button>` (all four eligibility conditions met) **or** one of the muted dead-end lines (`text-xs text-text-sub` + 12px icon), **or** nothing (`reklamacjaSubmitted` — the outcome block carries it). Same slot ⇒ no reflow of the card's bottom edge across states. Full predicate table: «Reklamacja sheet» → *Eligibility* + *The three dead-end states*. |

> **Locked behavior.** `<StatusBadge>` and the back-link (`← Wróć do listy`) keep their existing handlers, props, and visibility rules; only their **layout placement** changes per the diagram above. The reklamacja CTA's **visibility rule is superseded 2026-07-31** — it is now the 4-condition `canSubmitReklamacja` predicate (decided ∧ `!reklamacjaSubmitted` ∧ `maxAmount > 0` ∧ within 48h); its placement is unchanged. A non-eligible claim renders **no disabled button** (§6.5.13 hard rule).

> **Submission-date placement (decided — superseded 2026-06-16).** ~~`Data zgłoszenia` lives in the right meta-block.~~ **Reversed by user.** Both lifecycle dates — `Data zgłoszenia` (`claim.createdAt`) **and** the new `Data decyzji` (`claim.statusChangedAt`) — now live in the **lower «Szczegóły» `<dl>`**, not in the header meta-block. The header meta-block carries only the *period* temporal cluster (period range + `HoursReadout`); `nrZgl`, `Wniosek`, `StatusBadge`. See **§ B.1 «Szczegóły» date rows** below for the full spec (labels, keys, order, conditional rule). No API/DB change — both fields are already on the wire.

#### B.1 «Szczegóły» date rows (decided 2026-06-16)

The lower «Szczegóły» card is the `<dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">` block in `[nrZgl]/page.tsx` (heading `tDetail('details')`). It holds the claim's business-fact + lifecycle record. Two date rows are added/relocated here.

**Rows (final order, top → bottom):**

| # | Row | Label key | PL | EN | Render condition | dd value |
|---|---|---|---|---|---|---|
| 1 | **Data zgłoszenia** | `carrier.claims.detail.submittedAt` (reused) | `Data zgłoszenia` | `Submitted` | **always** (`createdAt` never null) | `formatDate(claim.createdAt)` — date-only, pl-PL `dd.MM.yyyy` |
| 2 | **Data decyzji** | `carrier.claims.detail.decidedAt` (**new**) | `Data decyzji` | `Decision date` | **only** when `status ∈ {ZAAKCEPTOWANO, ODRZUCONO}` **and** `statusChangedAt != null` | `formatDate(claim.statusChangedAt)` — date-only, same helper |
| 3 | Kwota zatwierdzona | `amountApproved` (existing) | — | — | always (current behavior) | unchanged |
| 3b | **Wypłacono łącznie** (**new 2026-07-31**) | `carrier.claims.detail.totalPaid` (**new**) | `Wypłacono łącznie` | `Total paid` | **only** when `reklamacjaResolution === 'UZNANA'` | `(amountApproved ?? 0) + reklamacjaAmount`, `font-semibold tabular-nums` — see «Reklamacja — carrier claim-detail outcome block» |
| 4 | Nr zlecenia | `orderNumber` (existing) | — | — | only if `claim.orderNumber` | unchanged |
| 5 | Data zlecenia | `orderDate` (existing) | — | — | only if `claim.orderDate` | unchanged |
| 6 | **Twój komentarz** (renamed 2026-10-22, UWAGI #4) | `carrier.claims.detail.comment` | `Twój komentarz` | `Your note` | only if `claim.comment` is non-blank (`sm:col-span-2`) | the carrier's own submit note, plain `text-text whitespace-pre-wrap` |
| 6b | **Uzasadnienie MAGTRANS / Powód odrzucenia** (**new 2026-10-22**, UWAGI #4) | `carrier.claims.detail.decisionCommentAccepted` / `…decisionCommentRejected` | `Uzasadnienie MAGTRANS` / `Powód odrzucenia` | `MAGTRANS rationale` / `Rejection reason` | only if `claim.decisionComment` is non-blank **and** the verdict is `ZAAKCEPTOWANO` / `ODRZUCONO` (`statusBeforeReklamacja` while in REKLAMACJA) (`sm:col-span-2`) | MAGTRANS's text on the muted quoted surface `mt-1 rounded-md bg-input/40 p-3 whitespace-pre-wrap` — visibly not the carrier's own row |
| ~~7~~ | ~~reklamacja text~~ | ~~`reklamacjaText`~~ | — | — | **REMOVED 2026-07-31** | moved into `<ReklamacjaOutcome>` |
| ~~8~~ | ~~reklamacja response~~ | ~~`reklamacjaResponse`~~ | — | — | **REMOVED 2026-07-31** | moved into `<ReklamacjaOutcome>` |

**Ordering rationale.** Both lifecycle dates go **first** in the `<dl>`, ahead of the money/order business facts. Reading order becomes a clean chronological-then-financial narrative: *"submitted on X → decided on Y → here is the approved amount, order ref, comment, reklamacja"*. The two dates are the same data class and read best adjacent (`Data zgłoszenia` immediately above `Data decyzji`); placing `Data decyzji` right under `Data zgłoszenia` lets the carrier compute turnaround at a glance. Both rows are single-column items (`<div>` inside the 2-col grid) — on `sm+` they sit side-by-side in the first grid row, which reinforces the "submitted ↔ decided" pairing; on mobile they stack.

**Conditional-show rule for `Data decyzji` (locked).** Render the row **only** for *decided* statuses:

- **Decided set = `{ZAAKCEPTOWANO, ODRZUCONO}`** — the **first** of the four `canSubmitReklamacja` conditions, not the whole predicate. **Corrected 2026-07-31:** `canSubmitReklamacja` is *decided-status* **∧** `!reklamacjaSubmitted` **∧** `maxAmount > 0` **∧** *within 48h of `statusChangedAt`* (full table in «Reklamacja sheet» → *Eligibility*; `maxAmount = origPaymentEur − (ZAAKCEPTOWANO ? amountApproved ?? 0 : 0)`). The earlier wording — which described the decided-set as being «exactly the set the page uses for `canSubmitReklamacja`» — was wrong: the two share only their first term.
  - **`Data decyzji`'s own predicate stays the narrow one**: `status ∈ {ZAAKCEPTOWANO, ODRZUCONO}` **∧** `statusChangedAt != null`. It deliberately does **not** inherit the reklamacja window / flag / ceiling terms — a decision date is a fact about the decision, not about the right to complain. Do **not** refactor the two into one shared boolean; that coupling is exactly what produced the stale claim above.
- **`REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` are NOT statuses** — they are *synthetic wire-only* `targetStatus` literals on `PATCH /claims/:nrZgl` (`docs/13-api-design.md`), absent from the `ClaimStatus` enum. **After a reklamacja decision the claim returns to `statusBeforeReklamacja`** (i.e. back to the very `ZAAKCEPTOWANO` / `ODRZUCONO` it held before) — for **both** outcomes. So `Data decyzji` keeps rendering with no extra branching.
  - ⚠️ **Consequence for the UI (locked):** the claim status therefore carries **no information about the reklamacja outcome**. The outcome is `reklamacjaResolution ∈ {UZNANA, ODRZUCONA}` (`NULL` = pending), surfaced exclusively by `<ReklamacjaOutcome>` + `<ReklamacjaResolutionChip>`. Never infer it from `<StatusBadge>`, and never infer it from `amountApproved` being null/non-null.
  - Whether `statusChangedAt` is bumped by the reklamacja decision is **backend-owned and irrelevant here**: the reklamacja's own dates are `reklamacjaSubmittedAt` / `reklamacjaDecidedAt`, rendered inside the outcome block. `Data decyzji` binds to `statusChangedAt` and needs no reklamacja awareness.
- `REKLAMACJA` (the in-progress re-opened state), `NA_WERYFIKACJI`, `OCZEKUJE_NA_AUTORYZACJE` are **non-decided** → row is **omitted entirely** (no `—` placeholder), consistent with the existing conditional rows (`orderNumber` / `orderDate` / `comment` render only when present).

**Neutral label decision (`Data decyzji`).** Single neutral label for both outcomes — **not** split `Data akceptacji` / `Data odrzucenia`. Rationale: the outcome (accept vs reject) is already unambiguously communicated by `<StatusBadge>` in the header and by `amountApproved` in the `<dl>`; a separate outcome-coded date label would be redundant and would force two i18n keys + a branch for zero information gain. A neutral "when was this decided" reads cleanly regardless of outcome and stays correct after a reklamacja flips the result.

**Date-only, not datetime.** `statusChangedAt` is an ISO datetime on the wire, but rendered **date-only** via the page's `formatDate` helper — matches `Data zgłoszenia`, `orderDate`, and the period range (every date on this screen is date-only; the decision *time* is not operationally meaningful to the carrier). No API/DB change — `statusChangedAt` is already read by the page for the reklamacja window.

#### Color decision: brand-red for approved amount

This is an opinionated use of MAGTRANS RED. Rationale:

- Approved EUR is the **only** number on the screen that represents a binding financial commitment by MAGTRANS. Brand-red here ties the brand visually to "the money MAGTRANS owes you".
- Brand-red is otherwise reserved for: active tab indicator, primary CTA, focus rings, status badges. Adding it to a single hero metric per-screen is consistent with that scarcity rule.
- Provisional (`kalkulacja`) explicitly does **not** get brand-red — it gets `text-text-sub`. This trains the user to read color: red = locked, muted = pending. The semantic stays after they learn it once.

We do **not** introduce a dedicated `--text-money` token — `text-brand` (existing) covers the approved state, `text-text-sub` (existing) covers the calc state. Adding a single-use token would be over-design.

The only **new utility-recipe** introduced is a typography convention, recorded as additions to the typography table below:

| Style | Size | Weight | Where |
|---|---|---|---|
| Money hero | 36px desktop / 30px mobile (`text-4xl md:text-5xl`) | 800 | Claim detail header, single occurrence per screen. |
| Money hero label | 12px uppercase, letter-spacing .5px | 700 | Directly below money hero. |

These slot into the existing typography scale — no Tailwind config change.

#### Should the verification modal read-only block (lines 484–502) use the same header layout?

**Decision: no — keep them visually distinct.** Rationale:

- The carrier detail header is a **landing surface** — the user arrives to "know the outcome". One dominant number maximises that.
- The verifier modal context block is a **reference sidebar to a form** — the verifier is actively reading 4 baseline numbers (km gwar / km real / amount requested / doplata) while filling the form. A 2×2 Stat grid optimises **scan parity** between similar-rank numbers; a single hero would force the verifier to look elsewhere for the other three.
- However: **add `HoursReadout` as a new full-width row beneath the 2×2 grid** (see § A placement 2). This is the only carry-over from § B into the modal.

The two surfaces remain consistent in **components** (`StatusBadge`, `HoursReadout`, `formatEur`) but diverge in **layout** because their cognitive task differs.

### C. Excluded-days dropdown — list density

**Current state.** `<ul>` with `grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1` — at desktop width every list ≥2 entries renders as two columns. User feedback: hard to scan when entries are short and column boundaries arbitrary; visual asymmetry when entry count is odd.

**Decision: Variant B — adaptive single-column up to 4, two-column from 5 upward, at desktop only.**

- `count ≤ 4` → always `grid-cols-1` (one entry per row, even at desktop).
- `count ≥ 5` → keep `grid-cols-1 md:grid-cols-2` (current behavior).
- Mobile (`< md`) → always `grid-cols-1` (already the case, unchanged).

**Tailwind expression:** the component should branch on `excluded.length` (cheap, already in scope of the row component) and render either `grid grid-cols-1 gap-x-6 gap-y-1` or `grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1`. No new utilities.

**Rationale (UX).**

- 1–4 entries is the common case (one or two public holidays per month, occasional driver illness). For that count, vertical scan is faster than two-column scan and the eye doesn't need to track which column the next date belongs to.
- ≥5 entries usually means a heavily excluded period (December holidays, longer leave) where two columns prevent the panel from doubling the row height of the parent breakdown table. Density wins over scan-speed at that point.
- The threshold `4` is chosen so the typical "Christmas + New Year" month (Dec 24, 25, 26, 31, Jan 1 → can hit 4 entries in one month easily) still gets the easy-to-scan single column, but 5+ entries (entire holiday week) collapse.

The per-row layout (date left, label right, baseline-aligned, `border-b border-border/40` separator) is **unchanged** — it works for both column counts.

### D. Palette — money accent

**No new palette tokens.** Reuses existing `brand` (approved-amount) and `text-sub` (calculation fallback) from the brand palette defined at the top of this document.

Confirmation of brand-color use rules (recap, not a change):

- `text-brand` for **approved** EUR on claim detail header.
- `text-text-sub` for **provisional / calculation** EUR on the same slot.
- Status badges already encode status — color on amount is independent of and complementary to badge color.
- Do **not** use `text-success` for approved (would conflict with `ZAAKCEPTOWANO` badge and break the "brand-red = money commitment" mental model).
- Do **not** use `text-danger` for any money value (red text in financial UIs reads as loss/negative — wrong signal for a positive payout).

### Components / shared changes summary

| Change | Where | Phase 3.1 owner |
|---|---|---|
| Surface `rawTotalDays` in `KmCalcResult` + `KmCalcBreakdownSchema` | `packages/shared/src/domain/km-calc.ts`, `packages/shared/src/schemas/...` | api-agent + shared |
| Include `rawTotalDays` in API claim/preview serialization | `apps/api/src/claims/...` | api-agent |
| `<HoursReadout breakdown live? />` (new custom component) | `apps/web/components/claims/HoursReadout.tsx` (shared between carrier and employee, hence not under `/carrier/`) | web-agent |
| Carrier detail header refactor | `apps/web/app/(carrier)/carrier/claims/[nrZgl]/page.tsx` lines 112–172 | web-agent |
| Verifier modal: add `HoursReadout` row to read-only block; replace inline `origHoursAdjusted` hint with `<HoursReadout live>` under input | `apps/web/components/claims/ClaimVerificationModal.tsx` lines 484–502 and 525–553 | web-agent |
| `<BreakdownTable>` excluded-days list — adaptive column count | `apps/web/components/carrier/BreakdownTable.tsx` lines 120–142 | web-agent |
| i18n keys (`hoursReadout.*`, header copy `kwotaZatwierdzona` / `kalkulacja` / `Wniosek`) | `apps/web/messages/pl.json`, `en.json` | web-agent |
| i18n key `carrier.claims.detail.submittedAt` (PL «Data zgłoszenia» / EN "Submitted") — now used for the **«Szczegóły» `<dl>` row** (relocated out of the header meta-block, see § B.1) | `apps/web/messages/pl.json`, `en.json` | web-agent |
| i18n key `carrier.claims.detail.decidedAt` (**new** — PL «Data decyzji» / EN "Decision date") for the «Szczegóły» `<dl>` decision-date row | `apps/web/messages/pl.json`, `en.json` | web-agent |
| Relocate `Data zgłoszenia` from header meta-block → «Szczegóły» `<dl>`; add conditional `Data decyzji` row in the same `<dl>` (see § B.1 for order + show rule) | `apps/web/app/(carrier)/carrier/claims/[nrZgl]/page.tsx` | web-agent |

### Tokens added or changed

- **None.** This polish reuses `brand`, `text`, `text-sub`, `border`, `card`, existing `font-extrabold`, `tabular-nums`, `text-4xl`/`text-5xl` from the existing scale. The only additions are conceptual typography slots ("Money hero", "Money hero label") documented in the typography table above — they map to existing Tailwind utilities.

### Risks for web-agent

1. **Hours = days × 24 must happen in one helper** — write `formatHoursPl(days: number): string` next to the existing `formatDaysPl` in `packages/shared`, do not inline `(days * 24).toFixed(2).replace('.', ',')` in three call-sites.
2. **Engine change must land before web change** — `rawTotalDays` must be in the API response (deployed) before the web refactor renders it. Otherwise `<HoursReadout breakdown={...} />` will see `undefined` and the fallback path (`—`) must hold without typeerror. Test the fallback explicitly.
3. **Live update under `hoursAdjusted` is local-only** — do not trigger `/claims/preview` on every keystroke. The live number is `hoursAdjusted * 1` (input already in hours, if the input is in hours) or `hoursAdjusted` rendered raw. Confirm the input unit before wiring — currently the field is labelled `hoursAdjusted` but the engine works in `days`. If input is hours, the displayed `counted` value is just the input itself formatted; if input is days, multiply by 24. **Read the form schema before wiring.**
4. **Layout shift on status flip** — when verifier flips `NA_WERYFIKACJI → ZAAKCEPTOWANO`, the money value stays the same size — only color and label change. Verify with React DevTools that no parent re-layout fires (the slot is the same DOM node, only className changes).
5. **Mobile header stacking** — on `< md` the meta block drops under the money block. The `StatusBadge` must stay close to `nrZgl` (not jump to the top). Test on 360px width.
6. **Excluded-days threshold of 4** — confirm by counting entries in any real month with engine output before shipping. If 5 is too aggressive (typical month has exactly 5 excluded days at Christmas), bump threshold up to 6. This is a one-line change and a candidate for user feedback after first prod use.
7. **Brand-red on hero number — accessibility.** Verify `text-brand` (`#dc2626`) on `bg-card` (`#fff`) light → 5.94:1 contrast, passes AA for large text (3:1). On dark `bg-card` (`#1f1f1f`), `text-brand` is `#ef4444` per dark tokens → 4.51:1, passes AA for normal AND large text. Both safe. Do **not** swap to `brand-light` (`#ef4444`) on light mode — fails contrast for normal-sized labels.

## Phase 3.2 — carrier-onboarding wizard components

> Three new components used by the guided 4-step "create carrier" flow (Carrier -> Vehicle -> Trailer -> Driver) hosted in the existing right-side `<Sheet side="right" w-[640px]>`. Owned by admin and opiekun. Backend exposes `OnboardingStatus` on `Carrier` (`PENDING_VEHICLE | PENDING_TRAILER | PENDING_DRIVER | COMPLETE`). No new palette colors, no new shadcn primitives, no emoji. All tokens used here already exist in this document.
>
> Cross-references:
> - Sheet shell rules: see "Phase 2 web - admin CRUD" -> "Sheet (side-drawer for editing)" above.
> - Badge variants: see "Phase 4 - Employee panel" -> `<StatusBadge>` for the existing `ClaimStatus` badge pattern. The new `<OnboardingStatusBadge>` follows the same shape/size rules but uses a distinct semantic axis (onboarding completion, not claim status).
> - Carriers table: standard `<DataTable>` row (Phase 2 standard), 56px row height, badge sits inline in a dedicated "Onboarding" column or inline next to the carrier name (decision in section 3 below).

### 1. `<WizardStepper>`

**Purpose.** Tell the operator: where am I in the 4-step flow, what is done, what was skipped, what is left. Lives inside `<SheetHeader>` above the form body. Width budget: 640px Sheet minus close-X and 24px horizontal padding -> ~580px usable. Must coexist with `<SheetHeader>` title `Dodaj przewoznika - krok N z 4` directly above it.

**Design choice — numbered circles + short labels (not segmented bar).**

Rationale:
- Four steps is few enough that distinct nodes read faster than a divided bar (Miller's chunk limit applies; 4 chunks are perceptually atomic).
- A segmented bar collapses "skipped" and "completed" into the same filled state unless we encode two fill styles, which makes the bar harder to read than 4 differentiated nodes.
- Numbered circles map 1:1 to the SheetHeader's "krok N z 4" subtitle — the operator's eye lands on the active number twice and locks orientation immediately.
- Lucide icons (`Check`, `Minus`) inside circles encode state without color-only signalling (a11y).

**Visual spec.**

```
  (1)----(2)----(3)----(4)
 Przew.  Maszyna Przyc.  Kierowca
 done    active  skipped future
 brand   brand   dashed  muted
```

| Slot | Tailwind | Tokens used |
|---|---|---|
| Wrapper | `flex items-center gap-0 w-full px-1 pt-1 pb-3` | - |
| Step (item) | `flex flex-col items-center gap-1 flex-1 min-w-0` | - |
| Connector (between items) | `h-px flex-1 -mx-1 self-start mt-3` | uses `bg-border` (future/skipped) or `bg-brand` (between two completed steps) |
| Circle base | `inline-flex items-center justify-center size-7 rounded-full border text-xs font-bold tabular-nums shrink-0` | `size-7` = 28px, hits 28px target which is sub-44 but the circle is not the tap target — the whole step row is (see a11y below) |
| Label | `text-[11px] font-semibold uppercase tracking-wider text-center truncate max-w-[7ch] mt-0.5` | `text-text-sub` default, `text-text` on active |

**State table.**

| State | Circle bg | Circle border | Circle text/icon | Label color | Notes |
|---|---|---|---|---|---|
| `completed` | `bg-brand` | `border-brand` | `text-white` content = `<Check size={14} />` | `text-text` | Solid brand fill — done is done. |
| `active` | `bg-card` | `border-brand border-2` | `text-brand` content = step number `1..4` | `text-text font-bold` | Hollow ring, number visible. Only one step is `active` at a time. |
| `skipped` | `bg-card` | `border-border border-dashed` | `text-text-sub` content = `<Minus size={14} />` | `text-text-sub italic` | Dashed border is the differentiator from `completed`. Italic label adds a second non-color cue. |
| `future` | `bg-card` | `border-border` | `text-text-sub` content = step number | `text-text-sub` | Neutral, no decoration. |
| `error` (optional) | `bg-card` | `border-danger border-2` | `text-danger` content = step number | `text-danger font-bold` | Reserved for "save failed on this step, user is back to edit it". Not used in v1 of the wizard but documented so web-agent does not invent a fresh visual later. |

Connector between step `i` and step `i+1`:
- both completed -> `bg-brand`
- otherwise -> `bg-border`

**Accessibility.**

- Root element: `<ol aria-label="Postep dodawania przewoznika" role="list">`. Each step: `<li>` with `aria-current="step"` on the active one.
- Each circle carries `aria-label` describing the full state, e.g. `aria-label="Krok 1: Przewoznik - ukonczone"`, `"Krok 3: Przyczepa - pominiete"`. Labels are visual; aria-label is the authoritative SR text.
- Icons inside circles are `aria-hidden="true"` — meaning is carried by the aria-label.
- The stepper is **not interactive in v1**. Steps cannot be clicked to navigate backward (backend creates entities sequentially; going back would orphan IDs). The whole `<ol>` is `role="list"` only, no buttons. Document this so web-agent does not wire onClick handlers.
- Focus is not trapped inside the stepper — the Sheet's existing focus trap covers the dialog as a whole; stepper is purely informational.

**Placement.** Inside `<SheetHeader>`, below the title row, above the divider that separates header from `<SheetBody>`. Header layout becomes:

```
[Dodaj przewoznika - krok 2 z 4]            [X]
 (1)----(2)----(3)----(4)
Przew.  Maszyna Przyc.  Kierowca
--------------------------------------------------
<SheetBody> form for the active step
```

Labels (PL, EN secondary - i18n keys):
- `wizard.step.carrier` = "Przewoznik" / "Carrier"
- `wizard.step.vehicle` = "Maszyna" / "Vehicle"
- `wizard.step.trailer` = "Przyczepa" / "Trailer"
- `wizard.step.driver` = "Kierowca" / "Driver"
- `wizard.header.title` = "Dodaj przewoznika - krok {n} z 4"

**Responsive.** Sheet is fixed 640px on `sm:` and up, and 100vw on mobile. On mobile (`< sm`) labels shrink to `text-[10px]` and use `max-w-[6ch]` truncation. Below 360px the labels can wrap to 2 lines — circles stay aligned.

---

### 2. `<TemporaryPasswordBanner>`

**Purpose.** From the moment step 1 finishes (carrier user is created server-side and a temporary password is returned in the response) until the wizard exits, the operator must have continuous, unmissable access to that password. They have to dictate or copy-paste it to the carrier; it cannot be retrieved later (backend stores only a hash).

**Dismissibility decision: NOT dismissible.** Confirmed. Rationale below.

- Dismissing-and-forgetting is the failure mode this banner exists to prevent. A close button would advertise the very option we want to disable.
- The banner disappears automatically when the Sheet closes (wizard exit). That is the only correct dismiss path — the operator either copies the password or accepts that the carrier will need a password reset.
- An always-visible banner costs ~64px of vertical space inside a 640px Sheet — acceptable given the form bodies are short (carrier=8 fields, vehicle=14, trailer=12, driver=6).

**Tone.** This is **important, not alarming**. The carrier was created successfully — that is a positive event. The banner is a follow-up action prompt, not an error. Therefore: use `warning` semantic (orange) for the surface, not `danger` (red). Brand-red is reserved for primary actions, focus rings, and the approved-amount hero; a sticky orange band reads as "attention required" without triggering the "something is broken" reflex.

**Visual spec.**

```
+------------------------------------------------------------------+
| [KeyRound] Haslo tymczasowe                                       |
|                                                                   |
| Przekaz to haslo przewoznikowi - nie zobaczysz go ponownie.       |
|                                                                   |
| +-------------------------------+   [Eye]Pokaz  [Copy]Kopiuj      |
| |  ************                 |                                 |
| +-------------------------------+                                 |
+------------------------------------------------------------------+
```

| Slot | Tailwind | Tokens used |
|---|---|---|
| Wrapper | `sticky top-0 z-10 -mx-6 px-6 py-3 border-b border-warning/40 bg-warning-bg` | `bg-warning-bg` = `#fff7ed` light / dark variant via CSS vars. Sticky inside the scrollable `<SheetBody>`. |
| Icon | `<KeyRound size={16} className="text-warning-dark shrink-0" />` | `text-warning-dark` = `#c2410c`, AA contrast on `bg-warning-bg`. |
| Title row | `flex items-center gap-2 text-sm font-bold text-warning-dark` | "Haslo tymczasowe" |
| Body copy | `mt-1 text-xs text-text` | One sentence, no emphasis colors. |
| Value box | `mt-2 inline-flex items-center gap-2 rounded-sm border border-warning/40 bg-card px-3 py-1.5` | `rounded-sm` = 8px. Bg is `bg-card` (white/dark surface) so the password reads on a calm background, while the banner around it is orange-tinted. |
| Value text | `font-mono text-sm tabular-nums select-all` | `select-all` so a triple-click in the value box selects exactly the password. |
| Reveal toggle | `inline-flex items-center gap-1 text-xs font-semibold text-warning-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand rounded-sm` | Uses existing focus-ring recipe. Icon: `<Eye size={14} />` / `<EyeOff size={14} />`. |
| Copy button | same recipe as reveal | Icon: `<Copy size={14} />` -> on success swaps to `<Check size={14} />` for 1500ms and label "Skopiowano". |

**Masked state default.** Value box shows `************` (12 asterisks, regardless of actual length — do not leak length). Reveal toggle switches to plaintext. Reveal state is **local component state, not persisted** — closing and reopening the Sheet (not possible in v1, but for defence) resets to masked.

**Copy behaviour.** Copy always copies the **real** password to clipboard regardless of whether the visible state is masked or revealed. This is intentional: the operator's most common path is "click Copy, paste into chat" without ever revealing on screen (shoulder-surfing protection in open-plan office).

**State table.**

| Element | Default | Hover | Focus-visible | Active/clicked | Disabled |
|---|---|---|---|---|---|
| Reveal toggle | `text-warning-dark` | underline | `outline-2 outline-brand outline-offset-2` | label switches to "Ukryj" | n/a |
| Copy button | `text-warning-dark` | underline | same focus ring | swaps to `<Check />` + "Skopiowano" for 1500ms, then reverts | greyed out only when password is `undefined` (defensive) |
| Value box | masked | - | - | `select-all` selects on triple-click | - |

**Accessibility.**

- Banner root: `<section role="region" aria-label="Haslo tymczasowe - akcja wymagana">`. **Not** `role="alert"` — that would steal focus and announce on mount; this is informational sticky content, not an interruption.
- Reveal toggle: `<button type="button" aria-pressed={revealed} aria-label={revealed ? "Ukryj haslo tymczasowe" : "Pokaz haslo tymczasowe"}>`. The icon is `aria-hidden`. Visible label text ("Pokaz" / "Ukryj") is for sighted users; aria-label is the longer SR string.
- Copy button: `<button type="button" aria-label="Skopiuj haslo tymczasowe do schowka">`. After success, also push a visible+SR live-region toast via the existing `<Toast>` (sonner) with `"Haslo skopiowane do schowka"` — banner UI changes are too localized for SR users to notice otherwise.
- Value box when masked: `aria-label="Haslo tymczasowe, ukryte. Kliknij Pokaz aby wyswietlic."` so SR users do not read out twelve asterisks.
- Value box when revealed: the real value is in the DOM and readable. Acceptable — SR users have the same need to verify the password as sighted users.
- The banner does not steal keyboard focus from the form below it. Sticky positioning preserves natural tab order: form fields tab in order, the banner buttons are reachable via Shift-Tab from the first field.

**Copy (PL primary, EN secondary).**

| Key | PL | EN |
|---|---|---|
| `tempPwd.title` | "Haslo tymczasowe" | "Temporary password" |
| `tempPwd.body` | "Przekaz to haslo przewoznikowi - nie zobaczysz go ponownie." | "Share this password with the carrier - you will not see it again." |
| `tempPwd.reveal` | "Pokaz" | "Show" |
| `tempPwd.hide` | "Ukryj" | "Hide" |
| `tempPwd.copy` | "Kopiuj" | "Copy" |
| `tempPwd.copied` | "Skopiowano" | "Copied" |
| `tempPwd.toast` | "Haslo skopiowane do schowka" | "Password copied to clipboard" |

**Placement.** Top of `<SheetBody>`, **inside** the scroll container so it sticks (`sticky top-0`) while the form scrolls beneath it. Becomes visible only after step 1 successfully creates the carrier (mounted conditionally). Stays mounted across steps 2, 3, 4 until Sheet closes.

---

### 3. `<OnboardingStatusBadge>`

**Purpose.** Inline indicator on each carrier row in the carriers DataTable, telling admin and opiekun that this carrier was created but its onboarding chain has not finished — and which step is pending. Drives a follow-up action (resume wizard from the pending step).

**`COMPLETE` rendering decision: render NOTHING for `COMPLETE`.** Confirmed.

- 95%+ of rows are expected to be `COMPLETE` after normal operation. Showing a green "OK" badge on every row is column-clutter for no informational gain.
- Pending rows are the exception that needs visual flagging — absence-of-badge becomes the implicit "all good" signal, which scales with the table.
- The `COMPLETE` enum value is still emitted by the API; the badge component simply returns `null` for it. Caller does not need to branch.

**Visual spec — three pending variants share shape, differ by label + icon.**

| Variant | Bg | Text | Border | Icon (Lucide) | PL Label | EN Label |
|---|---|---|---|---|---|---|
| `PENDING_VEHICLE` | `bg-warning-bg` | `text-warning-dark` | `border-warning/30` | `<Truck size={11} />` | "Brak maszyny" | "No vehicle" |
| `PENDING_TRAILER` | `bg-warning-bg` | `text-warning-dark` | `border-warning/30` | `<Container size={11} />` | "Brak przyczepy" | "No trailer" |
| `PENDING_DRIVER` | `bg-warning-bg` | `text-warning-dark` | `border-warning/30` | `<UserRound size={11} />` | "Brak kierowcy" | "No driver" |
| `COMPLETE` | - | - | - | - | (renders `null`) | - |

All three pending states use the **same** `warning` (orange) surface deliberately — they encode the same fact ("onboarding not finished, action required") and only the missing-entity word differs. Using three different colors would falsely suggest different severity. Icon + word do the disambiguation.

**Tailwind class recipe (shared by all three pending variants).**

```
inline-flex items-center gap-1 rounded-full border
px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide
bg-warning-bg text-warning-dark border-warning/30
whitespace-nowrap
```

| Property | Value | Rationale |
|---|---|---|
| Shape | `rounded-full` (pill, ~20px radius via `border-radius` token) | Matches existing `<StatusChip>` shape (see top "Skruglenia" — 20px chip pill). |
| Height | ~22px (font-11 + py-0.5 = 4px + line-height) | Fits in 56px DataTable row (Phase 2 standard) without forcing row growth. |
| Icon size | 11px | Half a line-height; visually balanced with 11px label. `aria-hidden="true"`. |
| `whitespace-nowrap` | yes | Prevents wrap-to-two-lines in dense tables when column is narrow. |
| Max-width | none | The longest PL label ("Brak przyczepy", 14 chars) fits in ~110px; on narrow columns the parent cell handles overflow via the standard DataTable cell `truncate`. |

**Design-system extension introduced.** A new semantic badge variant `onboarding-pending` is recorded here. It is **not** a new color token — it is a documented usage of `warning-bg` + `warning-dark` + `warning/30` border at chip-pill scale. Add to the badge variants list:

| Badge variant (in `<Badge>` shadcn config) | Light | Dark | Where used |
|---|---|---|---|
| `onboarding-pending` (new) | bg `#fff7ed`, text `#c2410c`, border `rgba(249,115,22,.3)` | bg `rgba(249,115,22,.15)`, text `#fb923c`, border `rgba(249,115,22,.3)` | Carriers table row, `<OnboardingStatusBadge>` only |

This is a **single-class variant**, not a new color. It reuses the existing `warning` palette already defined in the Tailwind config at the top of this file. Web-agent should add it to the `<Badge>` `variants` cva config alongside `success`, `danger`, `warning`, `outline`.

**State table.** The badge is **non-interactive** in v1 (it is a label, not a button). However the **row** containing it gets a "Dokoncz" (Resume) kebab action — that is the actionable surface, not the badge itself.

| State | Style | Notes |
|---|---|---|
| default | as recipe above | - |
| hover (on parent row) | inherited from `<DataTable>` row hover (`bg-table-hover`) | Badge does not change on row hover. |
| focus-visible | not applicable | Badge is not focusable (no `tabIndex`). |
| disabled | not applicable | - |

**Accessibility.**

- Render as `<span role="status" aria-label="Onboarding niezakonczony: brak {entity}">`. Example: `aria-label="Onboarding niezakonczony: brak maszyny"`.
- Icon is `aria-hidden="true"`; the word ("Brak maszyny") is in the DOM and read by SR.
- `role="status"` (not `alert`) — SR announces only when the row is first navigated to, not on table re-render.
- Contrast: `text-warning-dark` (`#c2410c`) on `bg-warning-bg` (`#fff7ed`) = 6.3:1, passes AA for normal text. Dark theme: `#fb923c` on `rgba(249,115,22,.15)` over `#1f1f1f` -> ~5.8:1 effective, passes AA. Both safe.

**Placement (locked).**

- Inserted into the carriers DataTable as a dedicated column **`Onboarding`**, positioned immediately after the carrier `nazwa` column. Width: `w-[160px]`, cell content: `<OnboardingStatusBadge status={row.onboardingStatus} />` (renders `null` when `COMPLETE`, so the column reads as blank for healthy rows).
- The column header is `Onboarding` with no icon. Sortable: yes — sort key is the enum order `PENDING_VEHICLE < PENDING_TRAILER < PENDING_DRIVER < COMPLETE`, which incidentally surfaces the most-urgent (earliest-stuck) carriers at the top of ascending sort. Document this as the default sort hint on the column.
- Row kebab gains a `Dokoncz onboarding` item when `status !== 'COMPLETE'`, which reopens the wizard `<Sheet>` jumped to the pending step (state seeded from the carrier's existing data + the temporary password is **no longer available** — see § 2; the kebab action does not re-generate a password, it just resumes vehicle/trailer/driver creation).

**Copy (PL primary, EN secondary - i18n keys).**

| Key | PL | EN |
|---|---|---|
| `onboardingStatus.PENDING_VEHICLE` | "Brak maszyny" | "No vehicle" |
| `onboardingStatus.PENDING_TRAILER` | "Brak przyczepy" | "No trailer" |
| `onboardingStatus.PENDING_DRIVER` | "Brak kierowcy" | "No driver" |
| `onboardingStatus.COMPLETE` | (unused — no badge) | (unused) |
| `onboardingStatus.column` | "Onboarding" | "Onboarding" |
| `onboardingStatus.resumeAction` | "Dokoncz onboarding" | "Finish onboarding" |
| `onboardingStatus.ariaPrefix` | "Onboarding niezakonczony: " | "Onboarding incomplete: " |

---

### Design-system extensions introduced by Phase 3.2

| Extension | Type | Where |
|---|---|---|
| `onboarding-pending` badge variant | New cva variant inside existing `<Badge>` component | Adds to existing `success`/`danger`/`warning`/`outline` variants — reuses already-defined `warning` palette. **No new colors.** |
| Typography slot "Stepper label" (11px, 600, uppercase, tracking-wider, max-w-[7ch] truncate) | Documented typography recipe | Used only inside `<WizardStepper>`. Maps to existing Tailwind utilities. |
| Sticky banner pattern (`sticky top-0 z-10 -mx-6 px-6 py-3` inside Sheet body) | Documented layout recipe | Used by `<TemporaryPasswordBanner>`; reusable if any future Sheet needs the same "important context across multi-step flows". |

No new colors, no new shadcn primitives, no new Tailwind config keys, no emoji.

### Components / shared changes summary (Phase 3.2)

| Change | Where | Owner |
|---|---|---|
| `<WizardStepper steps current completedSet skippedSet />` (new custom) | `apps/web/components/carrier-onboarding/WizardStepper.tsx` | web-agent |
| `<TemporaryPasswordBanner password />` (new custom) | `apps/web/components/carrier-onboarding/TemporaryPasswordBanner.tsx` | web-agent |
| `<OnboardingStatusBadge status />` (new custom) | `apps/web/components/carriers/OnboardingStatusBadge.tsx` | web-agent |
| Add `onboarding-pending` variant to `<Badge>` cva | `apps/web/components/ui/badge.tsx` | web-agent |
| Carriers DataTable: add `Onboarding` column + kebab action `Dokoncz onboarding` | `apps/web/app/(admin)/carriers/columns.tsx` (or equivalent path) | web-agent |
| i18n keys (`wizard.*`, `tempPwd.*`, `onboardingStatus.*`) | `apps/web/messages/pl.json`, `en.json` | web-agent |
| `OnboardingStatus` enum on `Carrier` (`PENDING_VEHICLE | PENDING_TRAILER | PENDING_DRIVER | COMPLETE`) | `packages/database/prisma/schema.prisma`, `packages/shared/src/types/...` | db-agent + api-agent |
| API returns `tempPassword` exactly once in step-1 `POST /carriers` response and never again | `apps/api/src/carriers/...` | api-agent |

### Risks for web-agent

1. **Temporary password leakage.** The plaintext password must never be logged, never be stored in TanStack Query cache beyond the wizard's lifetime, never appear in URL or analytics. Hold it in component-local React state inside the wizard root; on Sheet close the state unmounts and the value is GC'd. Do not put it in a Zustand/Context store with a longer life than the Sheet.
2. **Sheet width vs stepper fit.** At 640px Sheet width, four labels at `text-[11px]` and `max-w-[7ch]` truncate fit comfortably. If localised EN labels grow (e.g. "Vehicle" -> "Pojazd silnikowy" if PL ever changes), re-test truncation. The truncation is by design — full label is in the `aria-label` and a tooltip on hover would be optional polish (not required v1).
3. **Skipped vs future visual difference.** The dashed border on `skipped` is subtle. In dark mode `border-border` is `#404040` — verify the dash is still visible. If not, bump skipped steps to `border-text-sub border-dashed` in dark mode. This is a one-line `dark:` variant.
4. **Sort order on the new `Onboarding` column.** Web-agent must implement the enum sort hint (`PENDING_VEHICLE` first, `COMPLETE` last). Naive alphabetical sort on enum values would put `COMPLETE` first — that breaks the "show me what is broken at the top" UX.
5. **Badge `null` for COMPLETE — empty cell accessibility.** The empty cell must not become a black hole for SR users navigating the table. Recommend rendering a hidden `<span className="sr-only">Onboarding zakonczony</span>` instead of `null` when status is `COMPLETE`, so the column always has a per-row announcement. This is a 1-line change to `<OnboardingStatusBadge>`.
6. **Resume-from-kebab does NOT re-show the temporary password.** When the operator clicks "Dokoncz onboarding" on a row, the wizard opens at the pending step with the carrier pre-loaded — but `<TemporaryPasswordBanner>` is **not** mounted (the password no longer exists in cleartext anywhere). If the operator wanted to convey the password and forgot, the only path forward is the existing "Reset password" admin action on the user, which generates a fresh temp credential. This UX trade-off is intentional: it makes the "share the password during step 1" prompt feel as final as it actually is.
7. **Banner `bg-warning-bg` on `bg-card` Sheet — verify contrast of the inner password box.** Inner box is `bg-card` (white in light, `#1f1f1f` in dark) surrounded by `bg-warning-bg` (`#fff7ed` / dark `rgba(249,115,22,.15)`). Adjacent surfaces — verify the `border-warning/30` on the inner box is visible against both. If invisible in dark, bump to `border-warning/50` in dark variant.

> **Superseded by Phase 3.4 (below) for the password banner.** § 2 above is kept for historical reference; web-agent should implement the rewritten `<TemporaryPasswordRow>` spec in § Phase 3.4 instead. The `<WizardStepper>` and `<OnboardingStatusBadge>` specs in § Phase 3.2 remain authoritative.

---

## Phase 3.4 — admin information density (page width, carriers table, password row)

> Three corrections to the Phase 2/3.2 specs after the carriers admin page hit real-world content. Driven by user feedback: the working area is too narrow on wide monitors, the carriers table truncates badly, and the temporary-password banner is heavier than it needs to be. No new colors, no new fonts. Reuses existing brand / semantic / surface tokens.
>
> Cross-references:
> - Page wrapper recipe (Phase 2 default): `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8` — § Phase 2.
> - DataTable cell padding / row height (Phase 2 standard): `h-12`, `px-3 py-2` — § Phase 2 DataTable.
> - Sheet body padding: `px-6 py-4` — `<SheetBody>` in `components/ui/Sheet.tsx`.
> - `<EmployeeShell>` outer wrapper also caps at `max-w-7xl` (see `components/layout/EmployeeShell.tsx`); this section updates BOTH the shell and the per-page wrappers in lockstep.

### A. Page-width strategy for admin / employee surfaces

**Problem.** Every employee/admin page wraps in `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8` (1280px content cap). On a 1920px monitor that leaves ~320px of empty gutter on each side while a 7-column carriers table is squeezed into 1216px of usable inner width. The legacy GAS UI (see `docs/screenshots/employee-carriers.png`) does not cap — the table fills the viewport. The new app loses density without gaining readability.

**Decision — three width tiers, picked per page, not flat-global.** A blanket `max-w-screen-2xl` change would make narrow forms (e.g. `forbidden`, `delegations/new`) absurdly wide. Width is a property of *content*, not of the layout.

| Tier | Wrapper recipe | Use for |
|---|---|---|
| **`narrow`** (form-centred, ~720px) | `mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8` | Single-column forms outside a Sheet: `delegations/new`, `forbidden`, login-style standalone pages. Already used by `(carrier)/delegations/new` — keep. |
| **`detail`** (read-heavy, ~960px) | `mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8` | Claim-detail pages, single-record read views. Already used by `(carrier)/claims/[nrZgl]` — keep. |
| **`wide`** (table / dashboard, fluid up to ~1600px) | `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8` | **NEW DEFAULT for all admin list pages and dashboards.** Replaces `max-w-7xl` on: `(employee)/employee/(admin)/carriers`, `…/vehicles`, `…/drivers`, `…/trailers`, `…/trailer-types`, `(employee)/employee/claims`, `(employee)/employee` (dashboard root), and the unified `(carrier)/carrier/fleet` page (planista-style, §Phase 3 carrier fleet panel — was three `/fleet/*` list pages before 2026-06-26). |

> `max-w-screen-2xl` resolves to **1536px** in Tailwind's default config. Combined with `xl:px-12` (48px each side) that lands content at ~1440px on a 1920px screen — meaningful gain over `max-w-7xl` (1280px) without forcing tables edge-to-edge on ultra-wide monitors. We deliberately stop at `2xl` rather than going fully fluid: on a 27″ 4K screen (2560px+) a 2200px-wide table becomes uncomfortably scan-heavy.

**Side-padding scale.** Standardise on the same responsive pattern across all three tiers, with the `wide` tier bumping further at `xl`:

```
narrow / detail :  px-4 sm:px-6 lg:px-8                    (16 / 24 / 32 px)
wide            :  px-4 sm:px-6 lg:px-10 xl:px-12          (16 / 24 / 40 / 48 px)
```

The `lg:px-10` / `xl:px-12` bump on `wide` matters because the table is now ~1500px wide; the eye benefits from a slightly larger gutter so the first/last columns don't graze the viewport edge on a 1366px screen.

**Outer shell change.** `<EmployeeShell>` currently has `<div className="flex flex-1 mx-auto w-full max-w-7xl">` (line 57). Change to `max-w-screen-2xl`. This is the enclosing constraint — without it, per-page `max-w-screen-2xl` is silently clamped to 1280px by the shell. The sidebar inside the shell keeps its own fixed width; only the content area grows.

**`<Header>` is exempt.** The top app-bar at `components/layout/Header.tsx` keeps `max-w-7xl` so brand-logo + role-badge + actions remain optically centred above the content. A 1500px-wide header with 3 small items on the left and 3 on the right would feel sparse. Header content is decoration; page content is data — different rules.

**Forms inside a `wide` page stay narrow.** When a `wide` admin list page opens an inline form (not in a Sheet), wrap the form in a `max-w-3xl` (or `max-w-2xl` for short forms) inner container. **Tables expand; forms do not.** Readability research is consistent: form field rows over ~720px hurt completion. The Sheet drawer (480 / 640 / 720px) already enforces this for edit flows; the rule extends to any inline form.

**Tailwind config note.** No new keys needed. `max-w-screen-2xl` and `xl:px-12` are stock Tailwind utilities. No change to `tailwind.config.ts`.

**Migration impact for web-agent.**

| File | Change |
|---|---|
| `apps/web/components/layout/EmployeeShell.tsx` line 57 | `max-w-7xl` → `max-w-screen-2xl` |
| `apps/web/app/(employee)/employee/(admin)/carriers/page.tsx` line 179 | `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8` → `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8` |
| `…/vehicles/page.tsx` line 115 | same swap |
| `…/drivers/page.tsx` line 107 | same swap |
| `…/trailers/page.tsx` line 113 | same swap |
| `…/trailer-types/page.tsx` line 97 | same swap |
| `apps/web/app/(employee)/employee/claims/ClaimsListView.tsx` line 90 | same swap |
| `apps/web/components/layout/RoleShell.tsx` line 29 | same swap (dashboard/welcome) |
| `apps/web/components/layout/WelcomePanel.tsx` line 17 | same swap |
| `apps/web/app/(carrier)/carrier/claims/new/page.tsx` line 344 | same swap (live-preview panel wants the room) |
| `apps/web/app/(carrier)/carrier/fleet/vehicles/page.tsx` line 65, `…/trailers/page.tsx` line 75, `…/drivers/page.tsx` line 104, `…/delegations/page.tsx` line 118 | same swap |
| **Do NOT change** | `Header.tsx` (line 30), `CarrierTabs.tsx` (line 59), `CarrierShell.tsx` (line 28 — keep `max-w-7xl` for now; carrier panel has fewer columns and the tabs above already use 7xl, mismatched widths would look broken), `(carrier)/carrier/claims/page.tsx` line 47 (`max-w-5xl` — detail-list, intentionally narrower), `(carrier)/carrier/claims/[nrZgl]/page.tsx` (`max-w-5xl` — detail tier), `(carrier)/carrier/delegations/new/page.tsx` (`max-w-3xl` — form tier), `forbidden/page.tsx` (`max-w-2xl` — narrow message). |

**Deviation flag.** I did not blindly globally raise the cap. The user said "working area too narrow overall"; I'm proposing **per-tier rules** because narrow forms benefit from the existing cap and ultra-wide tables stop benefiting past ~1500px. If the user disagrees and wants flat full-width tables, the only change is to swap `max-w-screen-2xl` for `max-w-none` in the `wide` recipe — everything else stands.

---

### B. Carriers DataTable — column-width strategy

**Problem.** The carriers table at `apps/web/app/(employee)/employee/(admin)/carriers/page.tsx` has 7 columns: Login (mono, ~12ch), Name + missing-onboarding chips (variable, can have 3 chips), Company (variable, very long PL business names), NIP (always 10 chars), Opiekun (person name, ~20ch), Active (badge, ~6ch), Actions (1 or 2 buttons). With no per-column width control, every column gets `1 / 7` of the available width by default, which means Company is squeezed and NIP gets gutter it can't use.

**Decision — explicit per-column width hints, table-fixed-but-not-quite via min/max widths on `<th>`.**

Add a new optional column property to `DataTableColumn<T>`:

```ts
interface DataTableColumn<T> {
  // existing...
  /**
   * Column sizing intent. Drives Tailwind width utility on the <th>/<td>.
   * - 'tight'  — content has a short fixed length (NIP, login, dates, badges). Width ≈ content + padding, will not stretch.
   * - 'auto'   — let the browser size it from content (default for ad-hoc tables).
   * - 'flex'   — column absorbs remaining width. Truncates overflow with ellipsis.
   * - number   — explicit width hint in px (rare; use only for pixel-locked columns like a 60px row-action column).
   */
  width?: 'tight' | 'auto' | 'flex' | number;
  /**
   * Truncation behaviour for text cells. Default: no truncation, content wraps.
   * - 'ellipsis' — single line, `truncate` + tooltip on hover (uses native `title` attr or `<Tooltip>` if cell wraps it explicitly).
   * - 'clamp-2' — two-line max via `line-clamp-2` (used when wrapping is acceptable but unlimited wrapping isn't).
   */
  truncate?: 'ellipsis' | 'clamp-2';
}
```

Map to Tailwind on the `<th>` and `<td>`:

| `width` value | th/td classes |
|---|---|
| `'tight'` | `w-px whitespace-nowrap` (lets content dictate; `w-px` is the table-layout trick — browser collapses to content min). |
| `'auto'` | no extra class (default browser behavior). |
| `'flex'` | `w-auto` + parent table uses `table-fixed` only if at least one `flex` column declares it; otherwise plain `table-auto`. **In practice: implement `flex` as a min-width hint + `truncate`** — `min-w-0 max-w-[...] truncate` per cell. See implementation note below. |
| `number` (e.g. `120`) | inline `style={{ width: 120 }}` + `whitespace-nowrap`. |

**Implementation note for `flex` columns.** True `table-fixed` + percentage widths is brittle when row counts change. Simpler approach: keep `table-auto`, but on `flex` columns add `min-w-0` to the `<td>` (lets it shrink below content width) and apply `truncate` to the cell content wrapper inside the cell renderer. The cell renderer owns the truncation; the DataTable just hands it `min-w-0`. This is consistent with how `ClaimsTable.tsx` line 60 already uses `truncate max-w-[14ch]` ad-hoc.

**Carriers table column spec (concrete).**

| # | Column | `width` | `truncate` | Min width | Notes |
|---|---|---|---|---|---|
| 1 | Login | `'tight'` | — | — | Mono, max ~16ch. `whitespace-nowrap`. |
| 2 | Name + missing-onboarding chips | `'flex'` | — | `min-w-[200px]` | See chip-placement rule below — chips wrap **under** the name when row width is constrained. |
| 3 | Company | `'flex'` | `'clamp-2'` | `min-w-[220px]` | Polish business names like "GOOGLE POLAND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" → wrap to 2 lines, then ellipsis. Full name on hover via `title` attribute. |
| 4 | NIP | `'tight'` | — | — | 10 digits, mono recommended (`font-mono tabular-nums`). |
| 5 | Opiekun | `'tight'` | `'ellipsis'` | `max-w-[18ch]` | Person name, rarely > 25ch. Ellipsis acceptable; full name on hover. |
| 6 | Active | `'tight'` | — | — | Badge, ~6ch + padding. |
| 7 | Actions | `'tight'` | — | — | Right-aligned. See action-button rules below. |

**Carrier name + onboarding-missing chips layout.**

The current implementation (`page.tsx` lines 106–111) renders name + `<OnboardingMissingBadge>` in a single `flex items-center gap-2` row. With up to 3 chips (`vehicle`, `trailer`, `driver` ≈ 14ch each = ~50ch of chip content), this guarantees overflow into the Company column or forces awkward wrapping.

**Decision.** Stack chips **below** the name, not beside it:

```
<div className="flex flex-col gap-1 min-w-0">
  <span className="font-semibold truncate">{row.name ?? '—'}</span>
  <OnboardingMissingBadge onboarding={row.onboarding} />
</div>
```

`<OnboardingMissingBadge>` already renders `flex flex-wrap gap-1` (line 58) — chips will wrap onto a 2nd line within the column if needed. Row height grows from 48px (`h-12`) to ~64px **only** when chips are present (i.e. only on incomplete-onboarding rows, ~5% of expected rows post-launch).

Alternative considered and **rejected**: a dedicated `Onboarding` column (which Phase 3.2 § 3 specs above). Rejected because the Phase 3.2 spec predates the multi-chip change and assumed one chip per row. With 1–3 chips and ~14ch each, a dedicated column would either need to be `min-w-[300px]` (wasting space on 95% of rows that show nothing) or wrap awkwardly. Stacking under the name keeps the chip visually attached to the carrier it describes and lets the column squeeze when needed.

**Company truncation: two lines + tooltip.**

```tsx
cell: (row) => (
  <span
    className="line-clamp-2 break-words"
    title={row.company ?? undefined}
  >
    {row.company ?? '—'}
  </span>
)
```

- `line-clamp-2` caps at 2 lines (Tailwind plugin already loaded via `tailwindcss-animate` — confirm `@tailwindcss/line-clamp` is included; if not, web-agent adds it; this is a one-line `package.json` change, no new vendor).
- `title` attribute provides the full company name on hover via the browser's native tooltip — no need to wire `<Tooltip>` for every cell. Native tooltips are accessible-by-default (SR announces the title attribute) and keyboard-reachable when the row is focusable. If product later wants a styled tooltip, swap to `<Tooltip>` site-wide.

**Action button strategy.**

Current implementation renders two text-labelled buttons: "Dokończ onboarding" (long, only when needed) + "Edytuj" (always). Combined width can exceed 240px on Polish localisation.

**Decision — responsive icon-vs-label, never both styles in the same row.**

| Breakpoint | Render |
|---|---|
| `lg` and up (≥1024px) | Both buttons as **icon + text** (current behavior). |
| Below `lg` | Both buttons as **icon-only**, with text moved to `aria-label` (already present) and `<Tooltip>` (new wrapper). The Resume button (`<PlayCircle />`) and the Edit button (`<Pencil />`) become 36×36px icon squares. |

Tailwind recipe for the responsive button:

```tsx
<Button variant="outline" size="sm" className="gap-1.5">
  <PlayCircle size={14} aria-hidden="true" />
  <span className="hidden lg:inline">{tWizard('onboardingStatus.resumeAction')}</span>
</Button>
```

This is a single component rendering both states — no breakpoint-conditional JSX, no layout shift on resize. The `<span className="hidden lg:inline">` toggles purely in CSS.

Touch-target note: in icon-only mode the button is 36×36px (current `size="sm"` is `h-9`). Below AA's 44×44 minimum on mobile, but this admin surface is desktop-only — operators do not use phones for CRUD. Acceptable. If the table is ever opened on a tablet, the `lg` breakpoint covers it (iPad landscape is 1024px → text labels show).

**Action column width.** With both buttons icon-only: ~84px (36 + 8 gap + 36 + 4 padding). With both showing text labels at `lg`: variable, allow `'tight'` + `whitespace-nowrap`.

**Hover-to-show-edit anti-pattern flag.** Do NOT hide actions until row hover (a tempting density trick). It hurts discoverability and is invisible to keyboard users without ARIA gymnastics. Actions stay visible at all times.

**Migration impact for web-agent.**

| Change | File |
|---|---|
| Extend `DataTableColumn` interface with `width` and `truncate` props | `apps/web/components/ui/DataTable.tsx` |
| Apply `min-w-0` / `whitespace-nowrap` / `w-px` per `width` value on both `<th>` and `<td>` | same file |
| Carriers columns array — add `width` + `truncate` per the spec table above | `apps/web/app/(employee)/employee/(admin)/carriers/page.tsx` lines 96–176 |
| Carrier name cell: split name and chips into vertical stack | same file lines 106–111 |
| Company cell: `line-clamp-2 break-words` + `title` attr | same file lines 114–117 |
| Action buttons: wrap label text in `<span className="hidden lg:inline">` | same file lines 144–171 |
| Confirm `@tailwindcss/line-clamp` plugin is enabled (Tailwind 3.3+ ships `line-clamp` in core; verify) | `apps/web/tailwind.config.ts` |

**Deviation flag.** The user asked about a tooltip on hover for company name; I'm proposing **native `title` attribute** instead of `<Tooltip>` because per-row tooltip wiring is heavy for a list view and `title` is universally accessible. If product wants a designed tooltip later (e.g. for branded visuals), the swap is a single component change.

---

### C. `<TemporaryPasswordRow>` — replacement for `<TemporaryPasswordBanner>`

> **Renames and replaces** `<TemporaryPasswordBanner>` (Phase 3.2 § 2). The old name encoded "banner = something interrupting"; the new name encodes "one row inside the header". The component file moves are listed at the end of this section.

**Problem with the current banner (assessment, ordered most → least likely).**

1. **Tone is wrong.** Warning-orange surface (`bg-warning-bg` + `border-warning/40`) reads as "something needs attention because it broke". The actual event is the opposite: the carrier was created successfully and here is the credential to deliver. Operators see orange and pause to interpret; the surface should be neutral or quietly positive.
2. **Too tall.** Three vertical zones (title row with icon, body paragraph, password box + 2 buttons) eat ~120px inside an already-tall Sheet (top header + 4-step stepper above). At 480px Sheet width the password box wraps onto its own line, pushing height further.
3. **Mask-by-default is friction without payoff.** The operator is on a private admin screen behind 2FA, not on a public terminal. The shoulder-surfing scenario is real but rare; the everyday path is "click Copy, paste into chat with carrier". Forcing a Show click before the password is visible delays the most common action.
4. **Sticky-inside-SheetBody double-anchors.** The Sheet already has a fixed `<SheetHeader>` (with title + `<WizardStepper>`) that does not scroll. A second sticky element 2px below it produces a visually glued double-bar that looks like a single header that has bled into the body.
5. **Copy feedback could be sharper.** The current implementation flashes a checkmark + "Skopiowano" for 1500ms AND fires a toast. The toast is redundant if the inline flash is clear; the inline flash is too brief if the toast doesn't fire. Pick one.

**New design — one row, lives in the SheetHeader, neutral surface, no mask.**

```
+------------------------------------------------------------------+
| Dodaj przewoznika - krok 2 z 4                                [X]|
| (1)----(2)----(3)----(4)                                         |
| Przew.  Maszyna Przyc.  Kierowca                                 |
|                                                                  |
| [Key] Haslo tymczasowe   k7gP-x9mQ-rA2v   [Copy] Kopiuj          |
+------------------------------------------------------------------+
```

The password row sits **inside `<SheetHeader>`**, below the stepper, separated from the stepper by a thin divider. It is part of the non-scrolling header; nothing about it is "sticky" because it never scrolls. When the Sheet closes, the row unmounts with it (same lifetime as today).

**Visual spec — single-row layout.**

| Slot | Tailwind | Tokens |
|---|---|---|
| Row wrapper | `flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2.5 border-t border-border bg-info-soft` | New token alias `bg-info-soft` (see below). `flex-wrap` so on narrow Sheet widths the password chip drops to a 2nd line below the label. |
| Leading icon + label | `inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-sub` content: `<KeyRound size={14} aria-hidden="true" />` + `t('tempPwd.title')` | The label uses the standard "table header" typography from `Phase 2 DataTable` — visually it reads as a column header, not as an alert. |
| Password chip | `inline-flex items-center rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-sm tabular-nums select-all` | `select-all` so triple-click selects exactly the password. **No mask.** The chip is the password, visible. |
| Copy button | `inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-semibold text-text hover:bg-input focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand` content: `<Copy size={14} aria-hidden="true" />` + `t('tempPwd.copy')` → on success swap to `<Check size={14} className="text-success" aria-hidden="true" />` + `t('tempPwd.copied')` for 1500ms. | The success-state checkmark is `text-success` — the only piece of color in the row. Brief, signal-grade. |

**No reveal/mask toggle.** Removed. The password is plaintext from mount. Rationale in the problem-assessment above. If the user (or audit) later requires opt-in masking, add a small `<EyeOff />` icon-button that does the inverse: starts revealed, optionally hides. The default flips. v1 keeps it simple.

**New color alias `bg-info-soft`.**

Calm, neutral-positive surface that says "informational, success-adjacent, not warning, not brand-red". Maps to existing palette — no new color:

```ts
// tailwind.config.ts — extend `colors`:
info: {
  DEFAULT: '#eab308',   // existing
  dark:    '#a16207',   // existing
  bg:      '#fefce8',   // existing yellow-tinged; KEEP for the verifier ZAAKCEPTOWANO-like cases
  soft:    '#f0f9ff',   // NEW — sky-50, very light blue. Pairs with text-text (not text-info-dark).
},
```

**Why sky-50 (`#f0f9ff`) and not green-50 (`#f0fdf4`).**

- Green (`success-bg`) is reserved for "verified / approved" semantics — re-using it here would dilute the "verifier accepted the claim" signal that drives the `<StatusBadge>` and approved-amount color rules in Phase 3.1.
- Yellow (`info-bg = #fefce8`) is already in use for `info` semantic and tints too warm — visually next-door to warning-orange and would re-introduce the "alarm" reflex this redesign is trying to remove.
- Sky-50 is the only soft tint in the typical Tailwind palette that reads "informational" without overlapping any existing semantic axis. It also contrasts cleanly with the `bg-card` of the password chip nested inside it (white card on pale-blue band reads as a callout, not as a warning).
- Dark mode: `dark:bg-sky-950/40` (`#082f49` at 40% alpha over `#1f1f1f`) — visually a slate-blue tint, low-contrast band. Verify in dark mode and bump to 60% alpha if invisible.

This is the only new alias introduced. It is documented as a Tailwind config addition under the existing `info` color group, not a new color group.

**Contrast verification.**

- `text-text-sub` (`#737373`) on `bg-info-soft` (`#f0f9ff`) → ~5.1:1 light. Passes AA for normal text.
- `text-text` (`#171717`) on `bg-info-soft` → 18:1+. Trivially passes.
- Dark: `text-text-sub` (`#a3a3a3`) on dark sky tint over `#1f1f1f` → ~5.5:1. Passes AA.
- Password chip border `border-border` (`#e5e5e5`) on `bg-info-soft` (`#f0f9ff`) → 1.18:1. **Below the 3:1 UI-contrast requirement for borders that carry meaning.** The chip is identifiable by its `bg-card` (white) fill against the soft-blue band, so border-as-meaning is redundant; the border is decorative. Acceptable. If a stricter audit later flags it, swap border to `border-slate-300` (`#cbd5e1`) — 1.96:1 on sky-50, still below 3:1, so accept the fact that the chip relies on fill contrast not border contrast. Note this in the component's a11y comment.

**Layout: where the row lives, exactly.**

Update `<SheetHeader>` to accept children freely (already does) and structure the wizard's header as:

```tsx
<SheetHeader className="pb-0">
  {/* title row */}
  <div className="flex items-start justify-between gap-3 pr-6">
    <SheetTitle>{title}</SheetTitle>
    {/* close-X is rendered by <SheetContent>, not here */}
  </div>
  <SheetDescription>{stepCounter}</SheetDescription>

  {/* stepper, full width of header */}
  <div className="mt-3">
    <WizardStepper steps={steps} current={current} ... />
  </div>

  {/* password row — only mounted after step 1 success, until Sheet close */}
  {tempPassword && (
    <TemporaryPasswordRow
      password={tempPassword}
      className="-mx-6 mt-3"  /* bleed to header edges; mt-3 separates from stepper */
    />
  )}
</SheetHeader>
```

The `-mx-6` bleed makes the row span the full header width (the `<SheetHeader>` itself has `px-6`). The `border-t border-border` on the row produces a single, intentional divider between the stepper and the row. No `sticky`, no `z-10`, no `-mx-6 px-6` re-padding inside the row (it sets its own `px-6`).

**The row stays mounted across steps 2, 3, 4** — same lifetime contract as the old banner. It unmounts on Sheet close. The temp password is held in wizard root component state; see Phase 3.2 § 2 risk #1, still authoritative.

**State table.**

| Element | Default | Hover | Focus-visible | Active/clicked | Disabled |
|---|---|---|---|---|---|
| Password chip | plaintext, `select-all` | — | — | triple-click selects all 12 chars | n/a |
| Copy button | `<Copy /> Kopiuj` | `bg-input` | `outline-2 outline-brand outline-offset-2` | swaps to `<Check className="text-success" /> Skopiowano` for 1500ms, then reverts | greyed at `opacity-50` only if password is `undefined` (defensive) |

**Toast removal.** Drop the `toast.success(t('tempPwd.toast'))` call. The inline checkmark + label swap is the primary feedback; the toast was redundant and could fire after the operator's eye had already moved to the next field. Keep the `toast.error(...)` on clipboard write failure — that case the operator needs explicit notice that nothing happened.

**Accessibility.**

- Region: `<section role="group" aria-label={t('tempPwd.regionLabel')}>` — **change from `role="region"` to `role="group"`** because the row is no longer a top-level sectioning landmark; it is a labelled group of inline controls inside the header. Reduces SR landmark noise.
- Password chip: `<span aria-label="Haslo tymczasowe: k7gP-x9mQ-rA2v">` — the SR reads the value once; sighted users read it visually. Do **not** wrap the value in `<code>` for SR semantics; the `aria-label` carries the role context.
- Copy button: `<button type="button" aria-label="Skopiuj haslo tymczasowe do schowka" aria-live="polite">` — `aria-live="polite"` so the "Skopiowano" label-swap is announced. (The button's accessible name updates after click; SR will read the new accessible name.)
- Focus order: stepper steps (non-interactive `<li>`s, skipped) → copy button → first form field. The password chip is `tabIndex` not set (cannot be focused); operators interact via click-to-select or the Copy button. If keyboard-only selection is required (rare), add `tabIndex={0}` + a `Cmd/Ctrl+C` keyboard handler — defer to v2.

**Copy (i18n) — adjust existing keys.**

Keys stay in the `tempPwd.*` namespace for backward compatibility with the Phase 3.2 spec.

| Key | PL | EN | Change |
|---|---|---|---|
| `tempPwd.title` | "Hasło tymczasowe" | "Temporary password" | unchanged |
| `tempPwd.regionLabel` | "Hasło tymczasowe do przekazania przewoźnikowi" | "Temporary password to share with carrier" | clarified |
| `tempPwd.copy` | "Kopiuj" | "Copy" | unchanged |
| `tempPwd.copied` | "Skopiowano" | "Copied" | unchanged |
| `tempPwd.copyAria` | "Skopiuj hasło tymczasowe do schowka" | "Copy temporary password to clipboard" | unchanged |
| `tempPwd.body` | (removed — body paragraph dropped) | (removed) | DELETE — the new row no longer has a body paragraph; the label + visible password are self-explanatory. |
| `tempPwd.reveal` / `tempPwd.hide` / `tempPwd.revealAria` / `tempPwd.hideAria` / `tempPwd.maskedAria` | — | — | DELETE — no mask, no reveal toggle. |
| `tempPwd.toast` | — | — | DELETE — toast on success dropped. |

**Component rename and file moves.**

| Old | New |
|---|---|
| `apps/web/components/carrier-onboarding/TemporaryPasswordBanner.tsx` | `apps/web/components/carrier-onboarding/TemporaryPasswordRow.tsx` |
| `<TemporaryPasswordBanner password={...} />` | `<TemporaryPasswordRow password={...} className?={...} />` |

Add an exported `className` prop for the wrapper so callers (only the wizard root) can apply `-mx-6 mt-3` bleed without that being baked into the component.

**Migration impact for web-agent.**

| Change | File |
|---|---|
| Rename file + component | `components/carrier-onboarding/TemporaryPasswordBanner.tsx` → `TemporaryPasswordRow.tsx` |
| Rewrite render: single row, no mask, no reveal toggle, no body paragraph, no `sticky`, no `role="region"` | same file |
| Move call site from `<SheetBody>` top into `<SheetHeader>` below `<WizardStepper>`, with `-mx-6 mt-3` bleed | `components/carrier-onboarding/CarrierOnboardingWizard.tsx` (and any step-shell that mounts the wizard chrome) |
| Drop `toast.success` on copy; keep `toast.error` on clipboard failure | new `TemporaryPasswordRow.tsx` |
| Add `info.soft: '#f0f9ff'` to Tailwind config under `info` color group | `apps/web/tailwind.config.ts` |
| Add CSS-var fallback for dark mode if `bg-info-soft` needs adjustment | `apps/web/app/globals.css` (only if the static `#f0f9ff` doesn't read well on dark `#1f1f1f`; verify and decide) |
| Remove i18n keys: `tempPwd.body`, `tempPwd.reveal`, `tempPwd.hide`, `tempPwd.revealAria`, `tempPwd.hideAria`, `tempPwd.maskedAria`, `tempPwd.toast` | `apps/web/messages/pl.json`, `en.json` |
| Update i18n: `tempPwd.regionLabel` copy clarified | same files |
| Update Phase 3.2 § 2 reference in this doc to point to Phase 3.4 § C as the authoritative spec | (already done above with the "Superseded" callout) |

**Risks for web-agent.**

1. **Sheet header height growth.** Adding the row to `<SheetHeader>` makes the header taller (~40px taller) for the duration of steps 2–4. The `<SheetBody>` is `flex-1 overflow-y-auto` so it absorbs the loss. Verify on a 768px-tall viewport that the form area still scrolls without the footer overlapping content.
2. **Reveal toggle removal is opinionated.** If a security audit comes back asking for shoulder-surfing protection, the path forward is documented in the "No reveal/mask toggle" paragraph above. Do not pre-emptively re-add the toggle.
3. **Clipboard API in dev (Caddy + http localhost).** `navigator.clipboard.writeText` requires a secure context (https or localhost). The dev setup uses `localhost` so it works. On staging behind self-signed certs, verify; otherwise the Copy button silently fails and the operator has no fallback. The `toast.error` on catch is the explicit fallback signal — keep it.
4. **`info.soft` token discoverability.** Web-agent will be tempted to use `bg-info-soft` elsewhere now that it exists. **Reserve it for this single use case** (and any future "calm informational" header band). Document this in the Tailwind config comment next to the value: `// info.soft — reserved for temp-password row and future header info bands. Do not use as general informational surface — use bg-bg for that.`
5. **Stepper + row vertical rhythm.** Stepper labels end at `pb-3` (Phase 3.2 § 1 spec); the new row starts with `border-t border-border` and its own `py-2.5`. The gap between stepper baseline and row top should be ~12–14px after `mt-3` (12px) is added at the call site. If it reads too tight or too loose in implementation, adjust the wizard root's `mt-*` rather than the row's internal padding — keep the row spec stable for any future reuse.

---

## Phase 5 — Vehicle modal: `<FileUpload>` primitive + «Kraje» multi-select section

> Scope: the vehicle (pojazd) create/edit Sheet (`apps/web/app/(employee)/employee/(admin)/vehicles/VehicleSheet.tsx`) gains (a) **umowa-screenshot file uploads** rendered conditionally under checkboxes inside the FLAGI / KABOTAŻ section cards, and (b) a new **«Kraje»** section with a destination-countries multi-select placed after «Pozwolenia».
>
> **No new color / radius / shadow / font tokens are introduced.** Both pieces compose strictly from the existing brand palette, semantic colors (`success` / `warning` / `danger` / `info` / `text-sub`), the radius scale (`rounded-sm 8px` / `rounded 12px` / `rounded-lg 14px`), `shadow-card`, and existing shadcn primitives. Two new custom components enter the catalog: `<FileUpload>` and `<MultiSelect>`.
>
> Reference screenshots: `docs/screenshots/modal-vehicle-details-p1/p2/p3.png` (section-card layout, tinted backgrounds, checkbox grids), `docs/screenshots/modal-add-vehicle.png` (Sheet header/footer chrome).

### Context — the vehicle Sheet section-card pattern (already established)

The vehicle modal organises ~36 fields into **section cards**: a rounded container with a tinted surface, a section header (emoji + uppercase label), and a body of field rows. The legacy tints observed in the screenshots are `CERTYFIKATY` red, `KABOTAŻ` cyan, `FLAGI` green, `STAWKI` yellow, `IDENTYFIKACJA` neutral-grey. In the new system these section cards are formalised as:

| Slot | Tailwind | Token |
|---|---|---|
| Section card wrapper | `rounded-lg border border-border p-4 space-y-3` | `rounded-lg` (14px), `border` |
| Section tint (optional, light accent) | `bg-card` default; tinted variants use semantic `*-bg` at low prominence — but **do not over-tint**: prefer plain `bg-card` + a coloured header for the new sections | semantic `*-bg` |
| Section header | `flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-sub` | "table header" typography from Phase 2 |
| Field gap inside card | `space-y-3` between rows; `space-y-1.5` inside a `<FormItem>` | — |

`<FileUpload>` and the «Kraje» `<MultiSelect>` are designed to **drop into one of these section cards** without breaking the rhythm.

---

### 1. `<FileUpload>` — reusable multi-file upload primitive

A controlled primitive that lives inside a `<FormField>` and binds to an array-of-files value. In the vehicle modal it is rendered **conditionally**, revealed when its governing checkbox is ticked (under the GPS checkbox in FLAGI, and under each kabotaż checkbox in KABOTAŻ). The component itself knows nothing about checkboxes — the parent form mounts/unmounts it.

#### 1.1 Anatomy

```
+-----------------------------------------------------------+   <- dropzone (collapsed = empty state)
|   [Upload icon]                                           |
|   Przeciągnij pliki tutaj lub kliknij, aby wybrać         |
|   JPG, PNG, WebP, PDF · maks. 10 MB                       |
+-----------------------------------------------------------+

+-----------------------------------------------------------+   <- file row (one per file, uploaded or in-progress)
| [thumb] porozumienie-2024.pdf     1.4 MB           [X]     |
| [====================------]  68%                         |   <- progress bar (only while uploading)
+-----------------------------------------------------------+
| [thumb] skan-front.jpg            220 KB           [X]     |
+-----------------------------------------------------------+
| [!]    za-duzy-plik.png  — Plik przekracza 10 MB   [X]     |   <- error row
+-----------------------------------------------------------+
```

The component is a vertical stack: **dropzone on top**, then a **file list** below it. When at least one file exists, the dropzone shrinks to its compact state but stays visible (multi-file: the user keeps adding).

#### 1.2 Dropzone

| State | Tailwind | Tokens |
|---|---|---|
| Idle | `flex flex-col items-center justify-center gap-1 rounded border border-dashed border-border bg-input px-4 py-5 text-center cursor-pointer transition-colors` | `rounded` (12px), `border` dashed, `bg-input` |
| Hover | `hover:border-brand-200 hover:bg-brand-50/50` | `brand-200`, `brand-50` |
| Drag-over (file dragged on top) | `border-brand bg-brand-50` + `border-solid` | `brand` (600), `brand-50` |
| Focus-visible (keyboard) | `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand` | `brand` |
| Disabled | `opacity-50 cursor-not-allowed` (no hover/drag reaction) | — |
| Compact (when ≥1 file present) | same as idle but `py-3`, single-line label, no helper line | — |

**Dropzone contents (idle):**
- Lucide `<UploadCloud size={20} className="text-text-sub" aria-hidden="true" />`.
- Primary line: `text-sm text-text` — `t('fileUpload.prompt')` ("Przeciągnij pliki tutaj lub kliknij, aby wybrać"). The word "kliknij" is not a separate link — the **whole dropzone** is the click target (a `<button type="button">` wrapping a visually-hidden `<input type="file" multiple>`).
- Helper line: `text-xs text-text-sub` — `t('fileUpload.constraints')` ("JPG, PNG, WebP, PDF · maks. 10 MB").

The dropzone is a real `<button>` so it is keyboard-focusable and Enter/Space opens the native file picker. Drag-and-drop is layered on with `onDragOver` / `onDragLeave` / `onDrop` handlers on the same element.

#### 1.3 File row

One row per file. Height is content-driven (~`py-2`), rows separated by `divide-y divide-border` inside a `rounded border border-border` list container, or each row as `rounded border border-border` with `space-y-1.5` between — web-agent picks; the list-with-dividers reads cleaner inside an already-bordered section card.

| Slot | Tailwind | Notes |
|---|---|---|
| Row wrapper | `flex items-center gap-3 px-3 py-2` | — |
| Thumbnail (image) | `h-10 w-10 shrink-0 rounded-sm border border-border object-cover bg-input` | `rounded-sm` (8px). For images: `<img>` of an object-URL or server thumbnail. |
| Thumbnail (PDF / non-image) | `h-10 w-10 shrink-0 rounded-sm border border-border bg-input flex items-center justify-center` containing Lucide `<FileText size={18} className="text-text-sub" />` | PDF gets the generic file icon — no render. |
| Filename | `flex-1 min-w-0 truncate text-sm font-medium text-text` | `truncate` so long names don't break layout; full name in `title` attr. |
| File size | `shrink-0 text-xs text-text-sub tabular-nums` | formatted "1.4 MB" / "220 KB". |
| Remove button | `shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-sm text-text-sub hover:bg-danger-bg hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand` containing Lucide `<X size={16} />` | 32×32 hit area; see touch-target note in acceptance checklist. |

#### 1.4 Upload progress

Shown **only while a freshly-added file is uploading**. A second line inside the file row, below filename:

| Slot | Tailwind | Tokens |
|---|---|---|
| Track | `mt-1 h-1 w-full overflow-hidden rounded-full bg-input` | `bg-input` |
| Fill | `h-full rounded-full bg-brand transition-[width] duration-200` | `bg-brand` (600) |
| Percent label | `text-xs text-text-sub tabular-nums` next to/after track, optional | — |

While uploading, the **remove button stays enabled** (it cancels the in-flight upload and removes the row). The thumbnail slot shows a Lucide `<Loader2 size={18} className="animate-spin text-text-sub" />` instead of the image/PDF icon until the upload resolves.

#### 1.5 Error states

Three error categories, all rendered **inline on the offending file row** (not as a toast — toasts disappear; the user must see which file failed):

| Error | Trigger | Visual |
|---|---|---|
| File too large | client-side size check `> 10 MB` | row gets `border-danger/40 bg-danger-bg`; thumbnail slot → `<AlertTriangle size={18} className="text-danger" />`; size text replaced by `text-xs text-danger` message `t('fileUpload.errTooLarge')`. The file is **not uploaded**; row exists only so the user sees the rejection and dismisses it via `[X]`. |
| Wrong type | client-side MIME/extension check (not in JPG/PNG/WebP/PDF) | same treatment, message `t('fileUpload.errWrongType')`. |
| Upload failed | server/network error on a valid file | same treatment, message `t('fileUpload.errUploadFailed')`, **plus** a `t('fileUpload.retry')` text-button (`text-xs font-semibold text-brand hover:underline`) to re-attempt. Retry re-uses the same row. |

A field-level summary (e.g. "2 z 3 plików nie zostało przesłanych") is **not** rendered — the per-row errors are sufficient and the section card stays compact. The form's own `<FormMessage>` (Zod) handles "this field is required" separately, below the whole component.

#### 1.6 Edit mode — already-uploaded files

When the Sheet opens in edit mode the field is pre-populated with files already on the server. These render as **normal file rows** (§1.3) with these differences:

- No progress bar (already at 100%).
- Thumbnail uses the server-provided thumbnail/URL.
- Remove button is present and works — clicking it marks the file for deletion. **Deletion is deferred to form submit**, consistent with the Sheet's "nothing persists until Zapisz" contract. A removed-but-not-yet-saved server file should visually leave the list immediately (optimistic); if the user hits Anuluj nothing is deleted server-side.
- A newly-added file in edit mode behaves exactly as in create mode (uploads, shows progress).

The component does not visually distinguish "existing server file" from "newly added file" once both are settled — by design, the list is one uniform set of "files attached to this field".

#### 1.7 Empty / disabled / read-only

- **Empty (no files):** just the idle dropzone, nothing below it.
- **Disabled:** dropzone disabled per §1.2; existing file rows render but remove buttons are disabled (`opacity-50`).
- **Read-only display** (if a non-admin ever views the vehicle): render the file list with **no dropzone and no remove buttons** — filename + size + thumbnail only, each filename a link that opens the file. Follows the Phase 2 rule "read-only is not a disabled input".

#### 1.8 Placement inside the section card

`<FileUpload>` sits inside a `<FormItem>` directly under its governing checkbox. The reveal is the parent's job; when revealed, animate with the existing `animate-slide-in` (translateX/opacity) — or a simple height/opacity fade — so it doesn't pop. Indent it slightly under the checkbox label for visual grouping: wrapper `mt-2 ml-6` (aligns with the checkbox's label text, past the 16px box + gap). The `<FormItem>` keeps `space-y-1.5` so a `<FormLabel>` ("Zrzut ekranu umowy") and `<FormMessage>` sit correctly around it.

#### 1.9 Component API (for catalogue — design intent, not an implementation contract)

`<FileUpload>` is a controlled component:

| Prop | Purpose |
|---|---|
| `value` | array of file descriptors — mix of `{ id, name, size, url, thumbnailUrl }` (server) and in-flight client files. |
| `onChange` | emits the new array on add/remove. |
| `accept` | MIME / extension allow-list — defaults to JPG/PNG/WebP/PDF. |
| `maxSizeMb` | per-file cap — defaults to 10. |
| `multiple` | defaults `true`. |
| `disabled` / `readOnly` | per §1.7. |
| `onUpload` | async fn the form supplies that does the actual transfer and resolves to `{ id, url, thumbnailUrl }`; the component owns progress/error UI around it. |

The component owns: dropzone, drag state, client-side validation, progress UI, error UI, remove. It does **not** own: where files go (the `onUpload` callback) or the checkbox that reveals it.

#### 1.10 Accessibility

- The dropzone is a `<button type="button">` with `aria-label={t('fileUpload.dropzoneAria')}` wrapping a visually-hidden `<input type="file" multiple accept="...">`. Click / Enter / Space all open the picker.
- Drag-and-drop is an enhancement, never the only path — the click/keyboard path is always available.
- Each file row: the remove `<button>` has `aria-label={t('fileUpload.removeAria', { name })}` so a screen reader announces *which* file is removed.
- Progress: the track is `<div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="...">`.
- Errors: the inline error message row is associated to the file via `aria-describedby`; on a failed upload, move focus to the retry button so keyboard users land on the recovery action.
- Drag-over state must not rely on colour alone — the dashed border switching to **solid** is the non-colour cue.

#### 1.11 Acceptance checklist — `<FileUpload>`

- [ ] Dropzone: click opens native picker; Enter and Space also open it (it's a real `<button>`).
- [ ] Drag a file over the dropzone → border turns solid + `border-brand` + `bg-brand-50`; drag-leave reverts.
- [ ] Drop one or multiple files → all added; `multiple` honoured.
- [ ] Image files show a thumbnail (`h-10 w-10 rounded-sm object-cover`); PDFs show the `<FileText>` icon.
- [ ] Filename truncates with ellipsis on overflow; full name available via `title`.
- [ ] File size renders human-readable ("1.4 MB" / "220 KB"), `tabular-nums`.
- [ ] File > 10 MB → rejected client-side, `bg-danger-bg` row, `errTooLarge` message, not uploaded.
- [ ] Wrong type (e.g. `.docx`) → rejected client-side, `errWrongType` message.
- [ ] Valid file → progress bar fills `bg-brand` 0→100%, `<Loader2>` spins in thumbnail slot until resolved.
- [ ] Upload failure → `bg-danger-bg` row + `errUploadFailed` + Retry text-button; Retry re-attempts in the same row.
- [ ] Remove button (32×32) deletes a row; while uploading it cancels the in-flight upload.
- [ ] Edit mode: server files pre-populate as normal rows; removing one defers actual deletion to form submit; Anuluj discards the removal.
- [ ] Read-only mode: no dropzone, no remove buttons, filenames are links.
- [ ] Disabled: dropzone inert, remove buttons disabled, `opacity-50`.
- [ ] Dark mode: dropzone (`bg-input` = `#262626`), dashed border, thumbnails, progress track all legible — no hacks, only token vars / `dark:` if a tweak is needed.
- [ ] Contrast: helper line `text-text-sub` on `bg-input` ≥ 4.5:1 in both themes; drag-over signalled by border-style change, not colour alone.
- [ ] Touch: remove button 32×32 visually — wrap in `p-1` or expand hit area to ≥44×44 via padding so it meets the touch-target rule on tablet.
- [ ] Component is compact enough to sit inside a section card without forcing the Sheet wider than `w-[640px]`.
- [ ] No new design tokens introduced — every class resolves to an existing token.

---

### 2. «Kraje» section + `<MultiSelect>` reusable pattern

#### 2.1 Section placement

A new section card **«Kraje»**, inserted in `VehicleSheet.tsx` **immediately after the «Pozwolenia» section**. It is a standard section card (per "Context" table above):

```
+-----------------------------------------------------------+
|  [globe]  KRAJE                                           |   <- section header
|                                                           |
|  KRAJE DOCELOWE                                           |   <- FormLabel
|  +-----------------------------------------------------+  |
|  | [Polska x] [Niemcy x] [Francja x]      [search...] v |  |   <- MultiSelect trigger w/ chips
|  +-----------------------------------------------------+  |
|  Wybierz kraje, do których pojazd realizuje przewozy.     |   <- FormDescription
+-----------------------------------------------------------+
```

- Section header: `[globe]` = Lucide `<Globe size={14} />`, label `t('vehicle.section.countries')` ("KRAJE"), typography `text-xs font-bold uppercase tracking-wider text-text-sub`.
- The section contains exactly **one** `<FormField>` bound to `destinationCountries` (array of country codes).
- `<FormLabel>` "Kraje docelowe", `<FormDescription>` one helper line, `<FormMessage>` for the Zod error.

#### 2.2 Country list

A **plain flat alphabetical list** — EU-27 + United Kingdom + Norway + Switzerland = **30 countries**. **No "preferred" / pinned / highlighted subset, no grouping.** The list is sorted alphabetically by the **localised** country name (so the order differs between PL and EN locales — sort at render time, not a hard-coded order). Values are stored as stable ISO-3166-1 alpha-2 codes; only the label is localised. The list is a static constant in the web app (not fetched).

#### 2.3 `<MultiSelect>` — new reusable pattern

No multi-select primitive exists yet. Define **`<MultiSelect>`** as a reusable custom component, built on shadcn `<Popover>` + `<Command>` (cmdk) — the same stack shadcn's own combobox example uses — so it inherits accessible listbox semantics, type-to-filter, and keyboard nav for free. It enters the custom catalogue and is **not vehicle-specific**: any future "pick many from a list" field uses it.

**Closed state — the trigger.**

| Slot | Tailwind | Tokens |
|---|---|---|
| Trigger wrapper | `flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-input px-2 py-1.5 text-sm cursor-pointer transition-colors` | `rounded-[10px]` — the **form-input radius** noted in the radius scale (10px for inputs), `bg-input`, `border` |
| Hover | `hover:border-brand-200` | `brand-200` |
| Focus-within / open | `border-brand outline outline-2 outline-offset-2 outline-brand` (mirror `<Input>` focus) | `brand` |
| Disabled | `opacity-50 cursor-not-allowed` | — |
| Placeholder (no selection) | `text-text-sub` — `t('multiSelect.placeholder')` ("Wybierz kraje…") | `text-sub` |
| Trailing chevron | Lucide `<ChevronDown size={16} className="ml-auto shrink-0 text-text-sub" />` | rotates 180° when open (`transition-transform`) |

The trigger **grows vertically** as chips wrap (`flex-wrap` + `min-h-10`). It is a `<button type="button">` (not a div) for native focusability.

**Selected values — chips inside the trigger.**

Each picked country is a removable chip rendered inline in the trigger:

| Slot | Tailwind | Tokens |
|---|---|---|
| Chip | `inline-flex items-center gap-1 rounded-sm border border-border bg-card pl-2 pr-1 py-0.5 text-xs font-medium text-text` | `rounded-sm` (8px), `bg-card` (white chip on `bg-input` trigger reads as a token), `border` |
| Chip label | country name, `whitespace-nowrap` | — |
| Chip remove | `inline-flex h-4 w-4 items-center justify-center rounded-full text-text-sub hover:bg-danger-bg hover:text-danger` with Lucide `<X size={12} />` | clicking it removes that one country; `stopPropagation` so it doesn't open the popover. `aria-label={t('multiSelect.removeAria',{name})}` |

Chips are **not** semantic-coloured (no green/red) — countries carry no status, so they use the neutral `bg-card`/`border` chip, distinct from the status `<StatusChip>`. This keeps the colour vocabulary clean: coloured chips = status, neutral chips = selected tokens.

Optional, if the list of selected countries gets long and wraps to 3+ lines: collapse to "`[Polska x] [Niemcy x] +5`" where `+5` is a non-removable count chip; clicking anywhere on the trigger opens the popover where all are visible/removable. Web-agent may defer this — 30 countries is a bounded set and full wrap is acceptable inside a `w-[640px]` Sheet.

**Open state — the popover panel.**

| Slot | Tailwind | Tokens |
|---|---|---|
| Popover content | `w-[--radix-popover-trigger-width] rounded border border-border bg-card shadow-card p-0` | width matched to trigger; `rounded` (12px), `shadow-card` |
| Search input row | shadcn `<CommandInput>` — `<Search size={14}>` + input, `border-b border-border`, placeholder `t('multiSelect.searchPlaceholder')` ("Szukaj kraju…") | filters the list as you type |
| List | `<CommandList>` `max-h-64 overflow-y-auto p-1` | caps height; scrolls for 30 items |
| Option row | `<CommandItem>` — `flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer` | `rounded-sm` |
| Option — checkbox indicator | a 16×16 `rounded-sm border border-border` box; when selected → `bg-brand border-brand` with a white Lucide `<Check size={12} />`. (Reuse the visual of the existing `<Checkbox>` primitive — do not invent a new tick.) | `brand` |
| Option hover / keyboard-active | `bg-brand-50 dark:bg-brand/10` (matches DataTable row hover) | `brand-50` |
| Option selected (whole row) | the row stays in place; selection is shown by the checkbox indicator only — **the option does not leave the list** so the user can toggle it off from the same place | — |
| Empty filter result | `<CommandEmpty>` — `py-6 text-center text-sm text-text-sub`, `t('multiSelect.noResults')` ("Nie znaleziono kraju") | — |

**Interaction model:**

- **Picking:** click an option (or Enter on the keyboard-active row) → toggles it. The popover **stays open** after a pick — multi-select means the user usually picks several; closing each time is hostile. The popover closes on outside-click, Esc, or chevron click.
- **Displaying selected:** as removable chips in the trigger (above) **and** as ticked rows in the open list — two synced views.
- **Removing:** three ways, all equivalent — (1) `x` on a chip, (2) un-tick the option in the open list, (3) Backspace in the popover search field when it's empty removes the last-added chip (combobox convention; nice-to-have, may defer).
- No "Select all" / "Clear all" controls for v1 — 30 items, bounded; revisit only if a field with hundreds of options appears.

#### 2.4 Accessibility — `<MultiSelect>`

- Built on `<Command>` (cmdk) → the list is a proper `role="listbox"`, options `role="option"` with `aria-selected`, arrow-key navigation and type-ahead come for free.
- Trigger: `<button type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={listId}>`.
- Each chip's remove button has a per-country `aria-label` so removal is announced with the country name.
- The selected-count is conveyed to SR users: trigger has `aria-label` or an associated visually-hidden live region — e.g. "Kraje docelowe, wybrano 3" — so a SR user knows the state without scanning chips.
- Focus: opening the popover moves focus into `<CommandInput>`; Esc returns focus to the trigger.
- Selection state in the list is **not** colour-only — the `<Check>` glyph inside the indicator box is the non-colour cue.
- Contrast: option hover `bg-brand-50` (`#fef2f2`) vs text `text-text` — fine; chip text `text-text` on `bg-card` — fine; the brand-filled checked indicator `bg-brand` (`#dc2626`) with white `<Check>` ≥ 4.5:1.

#### 2.5 `<MultiSelect>` component API (catalogue intent)

| Prop | Purpose |
|---|---|
| `options` | `{ value, label }[]` — caller supplies, already localised; component sorts by `label` if `sort` not disabled. |
| `value` | `string[]` of selected `value`s. |
| `onChange` | emits new array on toggle/remove. |
| `placeholder` / `searchPlaceholder` / `emptyText` | i18n strings. |
| `disabled` | per §2.3. |
| `maxVisibleChips` | optional — enables the "+N" collapse described above; omit/undefined = wrap freely. |

It is generic — `<MultiSelect>` knows nothing about countries. The «Kraje» field is just `<MultiSelect options={countryOptions} … />`.

#### 2.6 Acceptance checklist — «Kraje» section + `<MultiSelect>`

- [ ] «Kraje» section card renders directly after «Pozwolenia», using the standard section-card layout + `<Globe>` header.
- [ ] Country list = EU-27 + UK + Norway + Switzerland (30), flat, alphabetical by localised name, no preferred subset, no grouping.
- [ ] Closed trigger shows placeholder when empty (`text-text-sub`) and removable chips when populated.
- [ ] Trigger grows vertically as chips wrap; `min-h-10` matches single-line input height.
- [ ] Opening shows a popover the width of the trigger with a search field, scrollable list (`max-h-64`), and per-option checkbox indicators.
- [ ] Typing in the search filters the list; no matches → `<CommandEmpty>` message.
- [ ] Clicking an option toggles it; **popover stays open** after a pick.
- [ ] Selected options show a brand-filled `<Check>` indicator in the list AND a chip in the trigger — two views stay in sync.
- [ ] Removing works via chip `x`, via un-ticking in the list, and (nice-to-have) via Backspace on empty search.
- [ ] Esc / outside-click / chevron closes the popover; focus returns to the trigger.
- [ ] Keyboard: arrow keys move the active option, Enter toggles, type-ahead jumps — inherited from `<Command>`.
- [ ] SR announces selected count and announces each country name on chip removal.
- [ ] Dark mode: trigger `bg-input`, chips `bg-card`, popover `bg-card` + `shadow-card`, hover `bg-brand/10` — all via tokens, no hacks.
- [ ] Selection cue is the `<Check>` glyph, not colour alone.
- [ ] `<MultiSelect>` is generic (no country logic baked in) and reusable for any future multi-pick field.
- [ ] No new design tokens introduced.

---

### Phase 5 — catalogue & config updates

**Custom component catalogue — add two entries:**

| Component | Replaces / new | Where used |
|---|---|---|
| `<FileUpload>` | new — no legacy equivalent | Vehicle Sheet (umowa screenshots under GPS / kabotaż checkboxes); reusable for any future file field. |
| `<MultiSelect>` | new — no legacy equivalent (legacy `#pojazdDropdown` was single-select) | Vehicle Sheet «Kraje» section; reusable for any multi-pick field. |

**shadcn primitives to install (if not already present):** `command` (cmdk-based) — required by `<MultiSelect>`. `popover` and `checkbox` are already in the Phase 2 install list.

```bash
npm exec -w web -- shadcn@latest add command
```

**Tokens:** none added. Both components compose entirely from the existing palette, radius scale (`8 / 10 / 12 / 14px`), `shadow-card`, and semantic colours. This is deliberate — Phase 5 is additive components, not a token change.

**Anti-patterns to avoid (carry-over rules):**

- No inline `style=` — dropzone tints, progress fill width, chip layout all via Tailwind utilities / `data-*` variants.
- No `[style*=]` dark-mode hacks — dark mode via existing CSS-var tokens + `dark:` only where a tweak is genuinely needed.
- Errors surface **inline on the file row**, not via disappearing toasts (toasts only for clipboard-style fire-and-forget feedback).
- `<MultiSelect>` must be built on `<Command>` for real listbox a11y — do not hand-roll a `<div>` list with `onClick`.
- Drag-over and selection states must have a non-colour cue (border-style change; `<Check>` glyph).

#### Migration impact for web-agent (Phase 5)

| Change | File |
|---|---|
| New primitive `<FileUpload>` | `apps/web/components/ui/file-upload.tsx` (or `components/ui/` per the existing primitives convention) |
| New primitive `<MultiSelect>` | `apps/web/components/ui/multi-select.tsx` |
| Install shadcn `command` | `apps/web/components/ui/command.tsx` |
| Mount `<FileUpload>` conditionally under GPS checkbox (FLAGI) and kabotaż checkboxes (KABOTAŻ) | `apps/web/app/(employee)/employee/(admin)/vehicles/VehicleSheet.tsx` |
| Add «Kraje» section with `<MultiSelect>` bound to `destinationCountries`, after «Pozwolenia» | same `VehicleSheet.tsx` |
| Static country-list constant (ISO codes + i18n label keys) | a constants file in `apps/web` |
| i18n keys: `fileUpload.*` (prompt, constraints, errTooLarge, errWrongType, errUploadFailed, retry, dropzoneAria, removeAria), `multiSelect.*` (placeholder, searchPlaceholder, noResults, removeAria), `vehicle.section.countries`, country names | `apps/web/messages/pl.json`, `en.json` |
| 0 changes to `tailwind.config.ts` / `globals.css` — no new tokens | — |

---

## Phase 6 — `<EntityDetailModal>` — read-only entity detail surface

> Scope: clicking an entity row in the admin panels (carriers first; vehicles, trailers, drivers later) opens a **centered, read-only detail modal** instead of the edit drawer. In an **editable context** (admin / opiekun) the modal carries a primary **«Edytuj»** action; clicking it **closes the detail modal and opens the existing edit `<Sheet>`** (`CarrierSheet` etc.) exactly as today. The «Edytuj» action is **optional** — in a **read-only context** (e.g. a carrier viewing their own fleet entities, which they have no rights to edit) the consumer omits the edit handler and the footer renders **only «Zamknij»** (see §6.6 / §6.9). The edit form is unchanged — the detail modal is the only new surface.
>
> **No new color / radius / shadow / font tokens.** The component composes strictly from the existing brand palette, semantic colors, the radius scale (`8 / 12 / 14 / 16px`), `shadow-modal`, and `animate-modal-in`. It builds on the existing hand-rolled `components/ui/Dialog.tsx` primitive.
>
> Reference screenshots: `docs/screenshots/modal-vehicle-details-p1/p2/p3.png` — use **only for which fields exist**, NOT as a visual template (the legacy "details" modal is actually an editable form; the new modal is a true read-only view, designed fresh).

### 6.0 `<Dialog>` vs `<Sheet>` — the read-only / edit split (reconciliation, locked)

Earlier phases lock edit-forms to `<Sheet side="right">` and explicitly say "no `<Dialog>` for edit-forms" (§ Phase 2 *Sheet*) and lock `<ClaimVerificationModal>` as a `<Sheet>`. **`<EntityDetailModal>` does not violate those rules.** The rule is about **edit surfaces**, and the distinction is now formalised:

| Surface kind | Container | Rationale |
|---|---|---|
| **Edit / create form** (inputs, validation, submit) | `<Sheet side="right">` | A long mutable form; a side-drawer lets the user keep table context, supports tall scrolling forms, and matches the established admin CRUD pattern. |
| **Read-only entity detail** (display only, no inputs) | centered `<Dialog>`-family (`<EntityDetailModal>`) | A focused, glanceable snapshot. Centered modal commands attention, reads like a "card", and is the conventional shape for "view details". No data is being mutated, so the "don't lose table context" argument for a drawer does not apply. |
| **Confirmation** (delete, deactivate) | centered `<Dialog>` | Already established. |

**Locked principle:** *centered `<Dialog>` is the correct, intentional container for read-only entity detail; `<Sheet>` remains the container for edit forms.* The two are complementary, not contradictory. The handoff is one-directional: detail modal → «Edytuj» → close modal, open edit Sheet. They are never open at the same time.

> ⚠️ **One deliberate exception to row 1 (edit-form = `<Sheet>`): the wniosek-verification surface** (`<ClaimVerificationModal>`, `pracownik`/`weryfikator`). Phase 7.1 (§6.5) puts BOTH its read-only view AND its edit mode in **one centered `<Dialog>`** with a `mode: 'view' | 'edit'` state, instead of the view-Dialog → edit-Sheet handoff above. Why this one screen and no other: verification is not CRUD-on-an-entity — it's a **side-by-side reconciliation** (carrier-declared value vs verifier-checked value, per fact), and the «Edycja» action must morph the *same* layout in place rather than re-mount into a different container, which is the whole point (no jarring jump). The §6.0 split still governs every other surface: Carrier/Vehicle/Trailer/Driver/User/Limity detail = `<Dialog>`, their edit = `<Sheet>`. **Do not generalise the §6.5 exception to any other edit form.**

### 6.1 Component identity

| | |
|---|---|
| Name | `<EntityDetailModal>` |
| Location | `apps/web/components/ui/EntityDetailModal.tsx` (a `ui/` primitive — it is entity-agnostic) |
| Built on | `components/ui/Dialog.tsx` (`Dialog` / `DialogContent` / etc.) — portal, focus-trap, Escape, body-scroll-lock already provided |
| Nature | **Generic, entity-agnostic, reusable.** It knows nothing about "carrier". Callers pass a title, optional badges, an ordered list of sections, each section an ordered list of label/value rows, and a footer action set. |
| First consumer | `CarrierDetailModal` — a thin entity-specific wrapper that maps a `CarrierDto` into the generic props. Vehicles / trailers / drivers add their own thin wrappers later; the generic shell is **not** re-implemented. |

### 6.2 Geometry & sizing

| Property | Value | Tailwind / token | Notes |
|---|---|---|---|
| Container | centered `<DialogContent>` | (from primitive) | Reuses the primitive's `bg-card border border-border rounded-xl shadow-modal animate-modal-in`. |
| Max-width | **`max-w-5xl`** (1024px) | override the primitive's default `max-w-md` via the `className` prop | **Revised 2026-05-28** (user feedback: «форма read-only маленькая, её бы сделать побольше»). The previous `max-w-2xl` (672px) cramped the densest consumer — `VehicleDetailModal` carries **6 + 1 sections, up to 9 rows each** plus attachments. 1024px gives the body room for a **two-column section grid** on ≥`lg`, with ~480px per column (after `gap-4` + `px-6`), which fits IBANs, multi-line addresses, long carrier names, and attachment file names without truncation. Wider than `5xl` (e.g. `6xl`/1152px) starts to read as a page rather than a focused modal; `5xl` is the upper bound that still feels glanceable. |
| Width (mobile / narrow desktop) | `w-[calc(100%-2rem)]` then capped by `max-w-5xl` | (from primitive, override max-width) | 16px gutter each side on phones; on viewports between `sm` and `lg` the modal scales fluidly up to 1024px. |
| Max-height | **`max-h-[85vh]`** | `max-h-[85vh]` | Caps the modal so it never exceeds the viewport; the **body** scrolls, not the page. Unchanged. |
| Internal layout | **3-zone flex column**: header (fixed) · body (`flex-1 overflow-y-auto`) · footer (fixed) | `flex flex-col` on the content; header + footer `shrink-0`, body `min-h-0 flex-1 overflow-y-auto` | Only the body scrolls. Header and footer stay pinned — they never scroll away. |
| Padding | header `px-6 pt-6 pb-4 lg:px-8 lg:pt-7`; body `px-6 py-5 lg:px-8 lg:py-6`; footer `px-6 py-4 lg:px-8` | — | The primitive's blanket `p-6` is **overridden**. The widened modal earns a slightly more generous horizontal padding on `lg+` (`px-8` = 32px) so content does not hug the edge of the much-wider surface. |
| Radius | `rounded-xl` (16px) | (from primitive) | No change. |
| Shadow | `shadow-modal` | (from primitive) | No change. |
| Entrance animation | `animate-modal-in` (200ms, opacity + 10px translateY) | (from primitive) | No change. Exit is instant unmount (matches current Dialog behaviour). |
| Overlay | `bg-black/40 backdrop-blur-sm` | (from primitive) | No change. |
| z-index | `z-40` overlay / `z-50` panel | (from primitive) | Edit Sheet opens **after** this modal closes — no stacking concern. |

### 6.3 Header

A fixed (`shrink-0`) zone, **not** scrollable.

```
┌──────────────────────────────────────────────────────────┐
│  Nazwa przewoźnika                              [✕]       │   <- title (H3, 17px/700)
│  carrier-login-123                                        │   <- subtitle: mono login, text-sub
│  ┌─────────┐ ┌────────────┐                               │
│  │ Aktywny │ │ Onboarding │ ...                           │   <- badge row
│  └─────────┘ └────────────┘                               │
└──────────────────────────────────────────────────────────┘
            border-b border-border under the header zone
```

| Element | Spec |
|---|---|
| Title | Entity display name. Carrier: `name` (falls back to `login` if name is null). Typography: `text-[17px] font-bold leading-tight text-text` (the "H3 / modal-header" slot). Maps to `<DialogTitle>` so it wires `aria-labelledby`. |
| Subtitle | One muted identifier line under the title. The generic shell renders it in **neutral** type (`text-sm text-text-sub`) — the entity wrapper opts into `font-mono` (by passing a `<span className="font-mono">`) only when the subtitle is a code: e.g. carrier `login`, driver licence number. Proportional subtitles (vehicle brand+model, trailer type) stay neutral. Maps to `<DialogDescription>` → `aria-describedby`. Omit the line entirely if there is no meaningful secondary id. |
| Badge row | Below the subtitle, `flex flex-wrap items-center gap-1.5 mt-2`. Holds the **status badge(s)**: (1) active/inactive — existing `<Badge variant="success">Aktywny</Badge>` / `<Badge variant="muted">Nieaktywny</Badge>`; (2) onboarding — reuse `<OnboardingMissingBadge>` / `<OnboardingStatusBadge>` already in the catalog (renders the per-step pending chips, or nothing when complete). Badges are passed in by the entity wrapper as a `ReactNode`; the generic shell just renders the slot. |
| Close affordance | The `✕` button is already provided by `<DialogContent>` (top-right, `h-7 w-7`, Lucide `<X size={16}>`, `focus-visible` ring). **Keep it.** No second close control in the header. |
| Divider | `border-b border-border` separates header from the scroll body, so on scroll the header reads as a pinned bar. |

### 6.4 Body — section grouping

The body is the only scrollable zone (`flex-1 overflow-y-auto`). Content is an ordered list of **sections** laid out in a **responsive grid**:

| Breakpoint | Section layout |
|---|---|
| `< lg` (≤1023px) | **Single column** — sections stack vertically (`grid grid-cols-1 gap-4`). Same as the legacy behaviour, just with the new looser horizontal padding. |
| `≥ lg` (≥1024px) | **Two-column masonry-ish grid** — `grid grid-cols-1 lg:grid-cols-2 gap-4`. Sections fall into columns in declaration order; section heights vary (carrier «Pozwolenia» has 1 row, vehicle «Permissions» has 9), so the two columns will be visually uneven — this is expected and acceptable. **Do not** attempt CSS columns / `column-fit` (breaks focus order, breaks anchor scroll). The simple grid is a11y-safe and the visual rhythm is fine: each card is a self-contained surface, so unequal column heights read as a tiled board, not as a broken layout. |

The body wrapper is `<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">` — no `space-y-*` (the grid provides spacing in both axes).

**Wide sections (full-width override).** Three section kinds opt out of the two-column grid and span the **full row**: (a) **Attachments** (vehicle) — its rows are tall buttons that need horizontal room; (b) any section whose row count is **≥8** when the entity has only one such section (vehicle «Pozwolenia»); (c) **«Notatki» / long-text** sections that hold a single multi-line value. The wrapper opts a section in by setting `section.span = 'full'` (new optional field on `EntityDetailSection`); the shell applies `lg:col-span-2` to those cards. The default is `span: 'half'`.

**Section anatomy** — softened from the original bordered-card rhythm to read calmer at the widened width:

```
┌─ DANE KONTA I KONTAKT ───────────────────────────────────┐
│  Login            carrier-login-123                       │
│  E-mail           biuro@example.eu                        │
│  Nazwa            Przykładowy Przewoźnik                  │
│  Telefon          +48 600 000 000                         │
└───────────────────────────────────────────────────────────┘
```

| Slot | Spec |
|---|---|
| Section header | `flex items-center gap-2 pb-3 mb-3 border-b border-border/60` + an optional **Lucide icon** (`size={15}`, `text-text-sub`, `aria-hidden`) + label `text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub`. Slightly larger tracking + a hairline under the title cleanly separates "what is this section" from "what's the data" without needing a heavy card border. |
| Section icons | Carrier: Account/contact → `<User>` · Company → `<Building2>` · Finance → `<Banknote>` · Permits → `<FileBadge>` · Assignment → `<UserCog>`. Vehicle / driver / trailer per §6.15–§6.17. Icons are decorative; passing an icon is optional in the generic API. |
| Section container | `rounded-xl border border-border/60 bg-card p-5`. Border softened to `border-border/60` (was `border-border`) so cards read as light surfaces, not boxed forms; radius lifted to `rounded-xl` (was `rounded-lg`) to **match the modal's own radius** and feel like an intentional nested surface. Padding bumped to `p-5` (was `p-4`) — the modal is now wider, so internal padding scales up proportionally. **Do not tint** section backgrounds — calm neutrality wins over the colour-coded edit-form tints. **Do not add shadows** — the section card is on top of `bg-card` already; an extra shadow would compete with `shadow-modal`. |
| Empty section | If every value in a section is null/empty, the entity wrapper may omit the whole section. The generic shell renders exactly the sections it is given. |

### 6.5 Label/value row — the core read-only primitive

This is the heart of the pattern. **A value is text, not a disabled input.** Read-only is *not* a greyed-out form field — no input border, no input background, no `disabled` styling. Render as a description list (`<dl>` / `<dt>` / `<dd>`) for semantics and a11y.

**Layout — two-column row (default, ≥ `sm`):**

```
<dt>  Label (left)   <dd>  Value (right)
```

| Property | Spec |
|---|---|
| Row container | `<div>` per pair, inside a `<dl>`. Grid: `grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]`. The label column widens to **~176px on `lg+`** because the section card is now wider and a 144px label hugged the divider; 176px gives breathing room without dwarfing the value. Below `sm` rows stack (single column). |
| Row vertical rhythm | `py-2` per row (was `py-1.5` — the widened modal earns a touch more vertical breathing room); rows within a section separated by a hairline `divide-y divide-border/60`. Standardised: **always** use `divide-y`, no per-section opt-out — consistency reads better at the new width than mixed rhythms. |
| Label (`<dt>`) | `text-sm font-medium text-text-sub`. Sentence case, not uppercase. Left-aligned, top-aligned (`self-start`) so it lines up with the first line of a multi-line value. |
| Value (`<dd>`) | `text-sm text-text`. `font-medium` for emphasis is allowed but default is `400`. Left-aligned. Wraps freely (`break-words`); never truncates in the detail modal. |
| Mono values | Codes render **monospace** (`font-mono`): `login`, `nip`, `vatId`, `accountEur` (IBAN), `accountPln`. Money/number values that benefit from alignment use `tabular-nums`. |
| Money values | `insuranceValue` → format as EUR with grouping, suffix `€` or locale currency via `Intl.NumberFormat`. `paymentTerms` → number + unit, e.g. "30 dni". |
| Date values | `insuranceExpiry`, `licenseExpiry`, `createdAt`, `updatedAt` → format with the app's standard date formatter (`Intl.DateTimeFormat`, locale-aware via next-intl). Date-only fields show date; timestamps (`createdAt`/`updatedAt`) show date + time. **No raw ISO strings.** |
| Empty / null value | Render an em-dash **`—`** in `text-text-sub` (not the regular `text-text`), so "no data" reads as visibly secondary. Never render an empty `<dd>`, never `null`, never `"undefined"`. |
| Long-text / address | `companyAddress` may be multi-line — value cell wraps naturally; no textarea, no scroll box. |
| Boolean values | If a boolean is shown as a row value (rare — `active` is a header badge, not a row) render as a small inline `<Badge>` or a localized "Tak / Nie", never a checkbox. |
| Copy affordance (optional, additive) | Mono code values (IBAN, NIP) **may** reuse the existing `<CopyableValue>` pattern (click-to-copy + toast). This is optional polish; if added it must not change row height or layout. Not required for v1. |

**Single-column collapse:** below `sm` (≤640px) the two-column grid collapses to stacked — label on its own line above the value (`grid-cols-1`, label gets `text-xs`, value `text-sm`). See § 6.7.

### 6.6 Footer

A fixed (`shrink-0`) zone with a top divider — never scrolls.

```
  Editable context (admin / opiekun — onEdit supplied):
            border-t border-border above the footer zone
┌──────────────────────────────────────────────────────────┐
│  Utworzono 2024-01-12 · Zaktualizowano 2024-03-04        │
│                                  [ Zamknij ]  [ Edytuj ] │
└──────────────────────────────────────────────────────────┘

  Read-only context (carrier viewing own fleet — onEdit omitted):
            border-t border-border above the footer zone
┌──────────────────────────────────────────────────────────┐
│  Utworzono 2024-01-12 · Zaktualizowano 2024-03-04        │
│                                              [ Zamknij ] │
└──────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Layout | `flex items-center justify-between gap-3`. Left slot: **meta line**. Right slot: action button(s). |
| Meta line (left) | `text-xs text-text-sub` — `createdAt` / `updatedAt` rendered with the date formatter (date + time). Format: `Utworzono {date} · Zaktualizowano {date}`. On narrow viewports this line drops below the buttons (see § 6.7) or is hidden if space-constrained — the same data also appears in the body Meta area, so the footer copy is a convenience, not the only home for it. **Decision:** put `createdAt`/`updatedAt` **in the footer meta line** as the canonical placement; do not also add a Meta section card in the body. The onboarding flags live in the header badges. This keeps the body purely the 5 domain sections. The meta line renders in **both** contexts (editable and read-only) — it is independent of the edit action. |
| Secondary action | `<Button variant="ghost">Zamknij</Button>` — closes the modal (`onOpenChange(false)`). Equivalent to the `✕` and Escape. **Always rendered** in both contexts. |
| Primary action (**optional**) | `<Button variant="default">` (brand-red) with a leading Lucide `<Pencil size={14}>` icon, label **«Edytuj»**. On click: **close the detail modal, then open the edit `<Sheet>`** for this entity. The generic component exposes this as an `onEdit` callback prop — the page wires `onEdit` to "set edit target + open sheet" after the modal closes. **This action is conditional:** it renders **only when the consumer supplies an edit handler** (`onEdit`). When `onEdit` is omitted — the **read-only context**, e.g. a carrier viewing their own fleet entity, which they have no rights to edit — the «Edytuj» button is **not rendered at all** and the footer shows **only «Zamknij»** alongside the meta line. No «Edytuj», no replacement action: the read-only footer is intentionally minimal. *Rationale:* carriers have no edit rights over fleet entities (vehicles / drivers / trailers), so the modal is a pure read surface for them; the page-level «Kontakt z opiekunem» link on the carrier fleet pages is their channel for requesting changes — there is no contact affordance inside the modal. |
| Sticky? | The footer is **fixed within the modal** (it is a flex `shrink-0` zone, always visible) — it does not need `position: sticky` because the body, not the modal, scrolls. Functionally always-visible. |
| Touch targets | Buttons keep `size="sm"` height ≥ the 36–40px button standard; the primary «Edytuj» (when present) must be ≥44px tall on touch viewports — web-agent: ensure `min-h-[44px]` on mobile or use the default (non-`sm`) Button size below `sm`. The same touch-target floor applies to «Zamknij» when it is the sole footer button. |

### 6.7 Responsive behavior

| Breakpoint | Behavior |
|---|---|
| `≥ lg` (≥1024px) | **Body sections in a two-column grid** (§6.4): `grid-cols-2 gap-4`. Label column inside each row widens to ~176px (§6.5). Modal `max-w-5xl` (1024px). Padding `px-8` (header/body/footer). Footer meta + buttons on one row. |
| `sm`–`lg` (640–1023px) | **Body sections single-column** — the modal is below the two-column threshold, so all section cards stack full-width. Label/value rows are still two-column inside each section (label ~144px, §6.5). Modal scales fluidly up to `max-w-5xl`, capped by `w-[calc(100%-2rem)]` on narrower widths. Padding `px-6`. |
| `< sm` (≤640px) | **Everything single-column.** Label/value rows **stack** (`grid-cols-1`): label line (`text-xs font-medium text-text-sub`) above value (`text-sm`). Section cards keep `p-5`. Footer: buttons full-row, meta line wraps to its own line **above** the buttons (`flex-col-reverse`), or is hidden if cramped. Modal width `w-[calc(100%-2rem)]`, `max-h-[85vh]` still caps height; body scroll is the norm. |
| Very short viewport | `max-h-[85vh]` + body `overflow-y-auto` already handles it — header/footer stay pinned, body scrolls. No special case. |

### 6.8 States

| State | Treatment |
|---|---|
| `loading` (modal open, entity still fetching) | If the row data is already in the table query (carriers list returns full `CarrierDto`), there is **no fetch** — open instantly with data. If a detail endpoint is later introduced, show a skeleton: 2–3 section cards each with 3 `<Skeleton className="h-4">` rows; header shows skeleton title bar. |
| `error` | If a detail fetch fails: `<Alert variant="destructive">` inside the body, footer keeps only «Zamknij» (no «Edytuj» on an entity that failed to load). Not needed for v1 (no detail fetch). |
| Empty values | Per-row `—` (§6.5). The modal is never "empty" as a whole — an entity always has a login + name. |

### 6.9 Generic API (catalogue intent — design contract, not an implementation signature)

The component is entity-agnostic. Shape the props so any entity maps cleanly:

| Prop | Meaning |
|---|---|
| `open` / `onOpenChange` | Standard controlled-dialog pair. |
| `title` | Entity display name (string). |
| `subtitle` | Optional secondary id line (rendered mono if it's a code). |
| `badges` | `ReactNode` — the header badge row (status + onboarding). Entity wrapper builds it. |
| `sections` | Ordered array. Each section: `{ title, icon?, rows, span? }`. `span` is `'half'` (default) or `'full'`; `'full'` makes the section card span both columns on `lg+` (§6.4 — used for attachments, ≥8-row permission grids, and single-multi-line-value sections). Each row: `{ label, value, fullWidth? }` where `value` is `ReactNode` (string, `—`, mono span, badge…). `fullWidth: true` (§6.20) drops the label gutter so `value` spans the entire section width — for embedded tables/charts; pair it with the section's `span: 'full'`. The wrapper is responsible for formatting (dates, money, mono, em-dash for null). |
| `meta` | Optional `ReactNode` for the footer-left meta line (created/updated). |
| `onEdit` *(optional)* | Callback for the primary «Edytuj» action. The component closes itself, then invokes `onEdit`. **Optional:** when supplied (admin / opiekun context) the «Edytuj» button renders; when **omitted** (read-only context — e.g. a carrier viewing their own fleet, which they cannot edit) the component renders the **read-only footer**: meta line + «Zamknij» only, no «Edytuj». The presence of the edit button is driven solely by whether `onEdit` is passed. |

`CarrierDetailModal` is the thin wrapper: takes a `CarrierDto`, maps it into the 5 sections below, builds the badge row, builds the meta line, and forwards `onEdit` to the page (which opens `CarrierSheet`).

### 6.10 Carrier field mapping — the 5 sections

The carrier detail modal mirrors the **same 5 sections the edit form uses** (`CarrierSheet` `FormSection` titles), so view and edit feel like the same object.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Dane konta i kontakt** (`sections.account`) | `<User>` | Login → `login` (mono) · E-mail → `email` · Nazwa → `name` · Osoba kontaktowa → `contactPerson` · Telefon → `phone` · E-mail do zleceń → `ordersEmail` |
| **Dane firmy** (`sections.company`) | `<Building2>` | NIP → `nip` (mono) · VAT UE → `vatId` (mono) · Firma → `company` · Adres → `companyAddress` |
| **Finanse** (`sections.finance`) | `<Banknote>` | Konto EUR (IBAN) → `accountEur` (mono) · Konto PLN → `accountPln` (mono) · Termin płatności → `paymentTerms` ("{n} dni") · Wartość ubezpieczenia → `insuranceValue` (EUR fmt) · Ważność ubezpieczenia → `insuranceExpiry` (date) · Ważność licencji → `licenseExpiry` (date) |
| **Pozwolenia** (`sections.permits`) | `<FileBadge>` | Liczba pojazdów → `numberOfVehicle` |
| **Przypisanie** (`sections.assignment`) | `<UserCog>` | Opiekun → `opiekun.name ?? opiekun.login` |

- **Status** (`active`) → header badge, not a row.
- **Onboarding flags** (`hasVehicle` / `hasTrailer` / `hasDriver` / `isComplete`) → header badge row, via the existing `<OnboardingMissingBadge>`.
- **`createdAt` / `updatedAt`** → footer meta line.
- **Section `span` (lg+ grid, §6.4):** all 5 carrier sections are `'half'` (default). Carrier «Pozwolenia» has only 1 row but pairs naturally with «Przypisanie» on the second column — no full-row override needed.
- i18n: reuse the existing `carriers.fields.*` and `carriers.sections.*` keys — **no new field-label keys needed**. New keys: `entityDetail.edit` ("Edytuj"), `entityDetail.close` ("Zamknij"), `entityDetail.createdAt`, `entityDetail.updatedAt` (or reuse `common.*` if present).

### 6.11 Wiring on the carriers page (web-agent)

Currently `carriers/page.tsx` does `onRowClick={openEdit}` — row click opens `CarrierSheet` directly. The new flow inserts the detail modal between:

1. `onRowClick={openDetail}` → opens `<CarrierDetailModal>` with the clicked `CarrierDto`.
2. Detail modal «Edytuj» → `onEdit`: the modal closes itself, then the page does `setTarget(row); setSheetOpen(true)` — the **existing** `CarrierSheet` edit drawer opens, unchanged.
3. The row-level «Edytuj» kebab/button in the actions column — **decision for web-agent:** it may either keep opening the edit Sheet directly (power-user shortcut) or also route through the detail modal. Recommended: the explicit «Edytuj» action-column button opens edit directly; a plain **row click** opens the read-only detail modal. This gives both a "glance" and a "jump straight to edit" path.
4. The two surfaces are never open simultaneously — modal closes before Sheet opens.

### 6.20 Full-width (full-bleed) row pattern — `EntityDetailRow.fullWidth`

A **reusable** `EntityDetailModal` capability for rows that must use the **entire section width**, with **no label gutter** — embedded tables, charts, or wide blocks (e.g. `<BreakdownTable>`) that would be crushed if confined to the `1fr` value column after the `lg:` 11rem label gutter.

> **Problem it fixes.** A normal row is a 2-col grid `lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]` (label | value). Even with an empty (sr-only) label, the **value still sits in the `1fr` column after the 11rem gutter** → on a `lg` modal the value gets ~270px, which squeezes any embedded table. A `<div>` wrapper with `sm:col-span-2` inside the `<dd>` does **nothing**, because `<dd>` is already the value grid cell — the wrapper is not itself a grid item. (This was the dead `-mx-2 sm:col-span-2` hack — **removed**.)

**API.** `EntityDetailRow` gains an optional `fullWidth?: boolean`.

**Behavior when `fullWidth: true`:**
- The row is **not** the 2-col grid. It renders as a single full-width block: `<div className="py-2">` containing `<dt className="sr-only">{label}</dt>` + `<dd className="break-words text-sm text-text">{value}</dd>`.
- The `<dt>` is kept in the DOM for a11y (`sr-only`) but occupies **no layout track**, so the `<dd>` value uses **100%** of the section width.
- `label` **should be** a screen-reader-only caption (it never renders visibly).
- Vertical rhythm (`py-2`) and `divide-y` separators are unchanged, so a `fullWidth` row sits cleanly among normal rows.

**Pairing with `span: 'full'`.** A full-width row only delivers the full *modal* width if its **section** also spans both modal columns. So a full-bleed embedded table needs **both**: the section `span: 'full'` (spans the 2-col modal grid on `lg+`, §6.4) **and** the row `fullWidth: true` (drops the in-section label gutter). Set both together.

**Canonical use — `<ClaimDetailModal>` breakdown section:**

```ts
sections.push({
  title: t('sections.breakdown'),
  icon: Calculator,
  span: 'full',                 // (a) span both modal columns
  rows: [{
    label: t('sections.breakdown'), // sr-only caption
    value: <BreakdownTable breakdown={claim.breakdown} />,
    fullWidth: true,            // (b) no label gutter → table gets full width
  }],
});
```

The `<BreakdownTable>` then container-queries itself (§ BreakdownTable Responsive behavior) into the 5-col table on `lg`-wide modals and into stacked cards on narrow/phone widths. **This is the canonical pattern for any embedded table/chart row** in an `EntityDetailModal` (future: GPS log table, payout history chart, etc.).

### 6.12 Anti-patterns to avoid

- **No disabled inputs.** A read-only value is a `<dd>` text node, never `<input disabled>` / `<input readOnly>`. No input borders, no input backgrounds in the body.
- **No new tokens.** Colours, radius, shadow, fonts all come from the existing scale. If something "needs" a new token, it doesn't — re-check the palette.
- **No `<Dialog>` for the edit form.** The edit form stays `<Sheet>`. Only the read-only detail is a `<Dialog>`.
- **No inline `style=`**, no `[style*=]` dark-mode hacks — dark mode is automatic via the CSS-var surface tokens.
- **No raw nulls / ISO strings** in the UI — always `—` for empty, always a formatted date.
- **Do not re-implement the generic shell per entity.** Vehicles/trailers/drivers get a thin `*DetailModal` wrapper only.
- **Do not stack** the detail modal and the edit Sheet — close one before opening the other.

### 6.13 Design-system extensions introduced by Phase 6

| Extension | Type |
|---|---|
| `<EntityDetailModal>` (generic) | New custom `ui/` primitive — composes `Dialog.tsx`. |
| `CarrierDetailModal` | New entity wrapper (`components/carriers/`). |
| Label/value `<dl>` read-only row recipe | Documented layout recipe (§6.5) — reusable for any future read-only detail surface. |
| `<Dialog>` (read-only) vs `<Sheet>` (edit) split | Documented, locked principle (§6.0). |

**No new colors, no new radius/shadow/font tokens, no new shadcn primitives, no new `tailwind.config.ts` / `globals.css` keys.**

### 6.14 Components / shared changes summary (Phase 6)

| Change | Where | Owner |
|---|---|---|
| `<EntityDetailModal>` (new generic primitive) | `apps/web/components/ui/EntityDetailModal.tsx` | web-agent |
| `CarrierDetailModal` (new entity wrapper) | `apps/web/components/carriers/CarrierDetailModal.tsx` | web-agent |
| Row click → detail modal; «Edytuj» → existing `CarrierSheet` | `apps/web/app/(employee)/employee/(admin)/carriers/page.tsx` | web-agent |
| i18n keys `entityDetail.*` (edit, close, createdAt, updatedAt) | `apps/web/messages/pl.json`, `en.json` | web-agent |
| 0 changes to `tailwind.config.ts` / `globals.css` | — | — |

### 6.15 Vehicle field mapping — the 6 (+1) sections

`VehicleDetailModal` mirrors the **six `VehicleSheet` `FormSection`s** in order, plus an optional seventh «Załączniki» section rendered only when the vehicle has attachments. Title = `plateNumber`; subtitle = `brand + model` (falls back to carrier name). Status (`active`) → header badge; no onboarding chips.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Identyfikacja** (`sections.identification`) | `<Truck>` | Numer rejestracyjny → `plateNumber` (mono) · Numer boczny → `sideNumber` · Marka → `brand` · Model → `model` · Rok → `year` (num) · Typ → `type` (raw enum MEGA/STD/COIL) · Norma EURO → `euro` (raw enum V/VI) · Certyfikat L → `certificateL` (bool) · Następny przegląd → `nextInspectionDate` (date) |
| **Przypisanie / Ludzie** (`sections.people`) | `<UserCog>` | Przewoźnik → `carrier.name ?? carrier.login` *(hidden for the przewoźnik viewer — see below)* · **Opiekun → `opiekun.name ?? opiekun.login`** *(the carrier's caretaker; resolved via `vehicle.carrier.opiekun`, surfaced on `VehicleDto.opiekun`)* · Planista → `planner.name ?? planner.login` · Zespół prowadzący → `dispatchTeam` via `<TeamMembers>` (§7.9.6; replaces the legacy single «Dyspozytor» field — `Vehicle.dispatchTeam`, not a single user) |
| **Wyposażenie** (`sections.equipment`) | `<Package>` | GPS → `gps` (bool) · Numer GPS → `gpsMobilePhone` · Karta paliwowa → `fuelCard` (bool) · Porozumienie → `agreement` (bool) |
| **Stawki** (`sections.rates`) | `<Banknote>` | Stawka DE → `rateDe` (EUR fmt) · Stawka UE → `rateUe` (EUR fmt) · Stawka eksport → `rateExport` (EUR fmt) · Stawka import → `rateImport` (EUR fmt) |
| **Pozwolenia** (`sections.permissions`) | `<ShieldCheck>` | Klasy ADR → `adrClasses` (list) · Odpady → `wasteAllowed` (bool) · Kraje odpadowe → `wasteCountries` (list) · Kabotaż DE → `cabotageDe` (bool) · Kabotaż FR → `cabotageFr` (bool) · GB → `gb` (bool) · IT → `it` (bool) · FR → `fr` (bool) |
| **Kraje** (`sections.countries`) | `<Globe2>` | Kraje docelowe → `destinationCountries` (list) · Ostatni przejazd → `lastDroveAt` (date) · Notatki → `notes` |
| **Załączniki** (`sections.attachments`) — *only if `attachments.length > 0`* | `<FileText>` | one row per attachment: `category` → `fileName` (plain text, no download in v1) |

- **2026-09-28 (§17.6.3):** eighth section **«Historia planistów»** (`<History>`, `span:'full'`, last) — hidden for the przewoźnik viewer; the «Planista» row gets a `pending` badge; the current planista gets a «Przekaż ciągnik» footer action via the additive `extraActions` slot.
- New i18n field keys (`vehicles.fields.*`): `adrClasses`, `wasteCountries`, `gb`, `it`, `fr`, `lastDroveAt`. New section key: `vehicles.sections.attachments`.
- `type` / `euro` render as raw enum codes — matches the `VehicleSheet` `<Select>` options and the list-table cell (no human-label keys exist).
- **Section `span` (lg+ grid, §6.4):** `'full'` for **Pozwolenia** (9 rows — too tall to pair) and **Załączniki** (attachment rows need horizontal room for the file-name button). All others (`identification`, `people`, `equipment`, `rates`, `other`) are `'half'`.

> **2026-06-26 — canonical vehicle modal: viewers, «Opiekun» row, carrier-self hide.** This `<VehicleDetailModal>` is the **full** vehicle modal shown to **admin / opiekun / przewoźnik / planista** (planista joined this group on 2026-06-26, §6.4.2 — incl. «Stawki»). Two viewer-scoped rules:
> - **«Opiekun» row (all viewers).** The «Przypisanie / Ludzie» section now carries an **Opiekun** row — the carrier's caretaker `User`, resolved via `vehicle.carrier.opiekun` and surfaced on `VehicleDto.opiekun` (`name ?? login`). It sits alongside Przewoźnik / Planista / Zespół prowadzący. Omitted (em-dash, §6.5) when the carrier has no opiekun.
> **2026-07-17 — «Stawki» reused on the delegation modal (server-scrubbed).** This vehicle «Stawki» section (icon `<Banknote>`, `vehicles.sections.rates` + `vehicles.fields.rate*`) is now **also reused as a block in the delegation detail modal** (§6.4.1 «Stawki» block), resolved live off the delegation's vehicle. Same dyspozytor exclusion as here, but on the delegation endpoint it is **server-scrubbed** (the four rate fields nulled on the wire for `dyspozytor`), i.e. **stronger** than the §6.4.2 UI-only exclusion that leaves the values on `VehicleDto`. Carrier sees its own vehicle's rates in both places (consistent rule).

> - **Carrier-self hide (przewoźnik viewer only).** When the viewer is the **przewoźnik** looking at their own vehicle, the modal **omits the «Przewoźnik» row**, **drops the carrier-name subtitle fallback** (a carrier need not be told who the carrier is), and — **added 2026-07-07** — **omits the «Numer boczny» row** in «Identyfikacja» (the internal MAGTRANS `sideNumber` designation is our info and must never surface to a carrier; same rule as §12.3.2 status rows, §12.7 episode history `showSideNumber=false`, and the CarrierFleetPanel «Auta» table). The subtitle still shows `brand + model` when present; it just never falls back to the carrier name for this viewer. The przewoźnik still sees **Opiekun + Planista + Zespół prowadzący**.

### 6.16 Driver field mapping — 3 logical sections

`DriverSheet` has a **flat layout** (no `FormSection`s), so there is no Sheet order to mirror 1:1. `DriverDetailModal` groups the fields into three clean logical sections instead. Title = `firstName + lastName`; subtitle = `idDocumentNumber` (mono, falls back to `loginSlug`). Status (`active`) → header badge.

> 2026-05-28: `driverLicenseNumber` was renamed to `passportNumber` (semantics flipped — the column now stores the driver's passport number, not their licence number). 2026-06-01: `passportNumber` was renamed again to `idDocumentNumber` (the field now stores any identity-document number, not strictly a passport); the user-facing label became "Numer dokumentu tożsamości" / "Identity document number". The `sections.license` block label is kept as-is because `licenseExpiry` still belongs to a driver's licence; only the number row is repurposed.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Dane osobowe i kontakt** (`sections.personal`) | `<User>` | Imię → `firstName` · Nazwisko → `lastName` · Telefon → `phone` · Telefon (drugi) → `phone2` · E-mail → `email` |
| **Prawo jazdy i finanse** (`sections.license`) | `<CreditCard>` | Numer dokumentu tożsamości → `idDocumentNumber` (mono) · Ważność prawa jazdy → `licenseExpiry` (date) · Numer konta → `bankAccount` (mono) |
| **Przypisanie** (`sections.assignment`) | `<UserCog>` | Przewoźnik → `carrier.name ?? carrier.login` · Notatki → `notes` |

- New i18n section keys: `drivers.sections.personal`, `drivers.sections.license`, `drivers.sections.assignment` (PL + EN). All field keys reuse existing `drivers.fields.*`.
- **Section `span` (lg+ grid, §6.4):** all 3 sections are `'half'`. With only three sections the second column will have one card and the first column two — acceptable (§6.4).

### 6.17 Trailer field mapping — the 3 sections

`TrailerDetailModal` mirrors the **three `TrailerSheet` `FormSection`s** in order. Title = `plateNumber`; subtitle = `trailerType.shortCode ?? trailerType.name`. Status (`active`) → header badge.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Identyfikacja** (`sections.identification`) | `<Container>` | Przewoźnik → `carrier.name ?? carrier.login` · Numer rejestracyjny → `plateNumber` · Typ naczepy → `trailerType` (`[shortCode] name`) · Marka → `brand` · Model → `model` · Rok → `year` (num) · Następny przegląd → `nextInspectionDate` (date) |
| **Wymiary** (`sections.dimensions`) | `<Ruler>` | Długość wewn. (m) → `innerLength` · Szerokość wewn. (m) → `innerWidth` · Wysokość wewn. (m) → `innerHeight` · Ładowność (t) → `capacity` |
| **Wyposażenie** (`sections.equipment`) | `<Package>` | Pasy → `belts` (bool) · Maty → `mats` (bool) · Zawieszenie pneum. → `airSuspension` (bool) · Załadunek tył → `loadFromBack` (bool) · Załadunek bok → `loadFromSide` (bool) · Załadunek góra → `loadFromTop` (bool) · Dach przesuwany → `slidingRoof` (bool) · Dach Edscha → `edschaSlidingRoof` (bool) · Wyposażenie → `equipment` · Notatki → `notes` |

- Dimension/capacity units are baked into the field labels themselves (`innerLength` → "Długość wewn. (m)", `capacity` → "Ładowność (t)") — exactly as `TrailerSheet` renders them — so the values are bare numbers. No new i18n keys needed.
- **Section `span` (lg+ grid, §6.4):** `'full'` for **Wyposażenie** (10 rows including free-text «Notatki») — too tall to pair cleanly. `'half'` for **Identyfikacja** and **Wymiary**, which pair on the same row of the lg-grid.

### 6.18 Phase 6 replication — components / shared changes summary

| Change | Where | Owner |
|---|---|---|
| `entity-detail-values.tsx` (shared value-formatter helpers: `emptyValue`/`textValue`/`monoValue`/`dateValue`/`boolValue`/`listValue`) | `apps/web/components/ui/entity-detail-values.tsx` | web-agent |
| `CarrierDetailModal` refactored to import the shared helpers | `apps/web/components/carriers/CarrierDetailModal.tsx` | web-agent |
| `VehicleDetailModal` / `DriverDetailModal` / `TrailerDetailModal` (new entity wrappers) | `apps/web/components/{vehicles,drivers,trailers}/` | web-agent |
| Row click → detail modal; «Edytuj» → existing Sheet | `apps/web/app/(employee)/employee/(admin)/{vehicles,drivers,trailers}/page.tsx` | web-agent |
| i18n: `vehicles.fields.{adrClasses,wasteCountries,gb,it,fr,lastDroveAt}`, `vehicles.sections.attachments`, `drivers.sections.{personal,license,assignment}` | `apps/web/messages/pl.json`, `en.json` | web-agent |
| 0 changes to `EntityDetailModal.tsx`, `tailwind.config.ts`, `globals.css` | — | — |

### 6.19 Phase 6.1 — read-only modal "bigger + calmer" refresh (2026-05-28)

> User feedback: «форма read-only маленькая, её бы сделать побольше, может агент ещё сможет улучшить ui». The previous `max-w-2xl` (672px) cramped the densest consumer (`VehicleDetailModal`, 7 sections of up to 9 rows + attachments). This sub-phase widens the modal and softens the section visual rhythm, **without changing the consumer API** (`EntityDetailModalProps` is unchanged except for an optional `section.span` field that defaults to `'half'`; all existing wrappers keep working with no edits).

| Change | Where | Owner |
|---|---|---|
| `max-w-2xl` → `max-w-5xl` (1024px) | `EntityDetailModal.tsx` `<DialogContent>` className | web-agent |
| Body wrapper: `space-y-5` → `grid grid-cols-1 gap-4 lg:grid-cols-2` | `EntityDetailModal.tsx` body zone | web-agent |
| Body / header / footer padding: `lg:px-8` and `lg:py-6` (body) / `lg:pt-7` (header) | `EntityDetailModal.tsx` 3-zone wrappers | web-agent |
| Section card: `rounded-lg border border-border p-4` → `rounded-xl border border-border/60 p-5` | `EntityDetailModal.tsx` section `<section>` | web-agent |
| Section header: `mt-3` rows margin → header gets `pb-3 mb-3 border-b border-border/60`; icon `size={14}` → `size={15}`; label `text-xs font-bold tracking-wider` → `text-[11px] font-semibold tracking-[0.08em]` | `EntityDetailModal.tsx` section `<h3>` + body `<dl>` margin | web-agent |
| Row grid: `sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]` → add `lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]` (widen label column on `lg+`) | `EntityDetailModal.tsx` row `<div>` | web-agent |
| Row vertical rhythm: `py-1.5` → `py-2`; always `divide-y divide-border/60` (drop the per-section opt-out) | `EntityDetailModal.tsx` `<dl>` + row `<div>` | web-agent |
| New optional `EntityDetailSection.span?: 'half' \| 'full'`; shell applies `lg:col-span-2` when `'full'` | `EntityDetailModal.tsx` types + render | web-agent |
| Set `span: 'full'` on vehicle «Pozwolenia» and «Załączniki»; on trailer «Wyposażenie» | `VehicleDetailModal.tsx`, `TrailerDetailModal.tsx` | web-agent |
| 0 new tokens (radius `xl` already in scale; `border-border/60` is just an opacity util; no colour / shadow / font additions) | — | — |
| 0 changes to consumer prop contracts beyond the additive `span?` field | — | — |

### 6.20 Trailer equipment block — belts/mats + boolean toggles (2026-05-28)

> **Problem statement (user feedback).** `TrailerSheet` § `sections.equipment` currently splits its 5 items into two disconnected groups: `belts` and `mats` sit in their own vertical stack at the top of the section (each rendered as `checkbox + min-w-[160px] label + a w-32` count `<Input>` that pops in to the **right** when the checkbox is on), while `airSuspension` / `certXl` / `multilock` live below in a separate `grid grid-cols-2 md:grid-cols-3`. The count input feels disconnected from its label (horizontal jump, different visual rhythm than the rest of the section), and the belts/mats rows look like an orphan block visually separated from the three "plain" booleans. Direct quote: *«maty и pasy все так же странно»*.
>
> **Decision — Approach 1 (compact equipment cards).** All 5 equipment items become **uniform card-cells** in a single responsive grid. The checkbox + label live on the top row of each cell; for `belts` / `mats`, when the checkbox is on, the count `<Input>` reveals **inside the same cell border, below the label** (vertical, not horizontal). Cells without a count (`airSuspension`, `certXl`, `multilock`) stay single-row. The grid is `grid grid-cols-2 md:grid-cols-3 gap-3`. No new tokens, no new animations, no new palette colors — `animate-slide-in` is reused.
>
> **Why this approach over the alternatives.**
> - *Alt 2 (single grid, inline counts below label inside cell, but no border):* visually weaker — without a card border the count input still feels like a floating extra; doesn't communicate "this number belongs to this toggle".
> - *Alt 3 (drop the boolean, treat count > 0 as "on"):* changes form semantics (Zod refine assumes `belts: boolean` distinct from `beltsCount: number?`) and breaks parity with the read-only `TrailerDetailModal` which renders `boolWithCount(flag, count)` — "Tak (N szt.)" assumes the flag is the source of truth. Rejected.
> - *Approach 1 (chosen):* visual parity with the read-only modal (one row per item = one card per item), single grid for the whole section, no horizontal popping, mobile-safe (2 cols at 320px is comfortable with 12px gap).

#### Layout — final structure

```
State: all-off ─────────────────────────────────────────────────────
┌─────────────────────────── Wyposażenie ───────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ [ ] Pasy        │  │ [ ] Maty        │  │ [ ] Zaw. pneum. │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ [ ] Cert XL     │  │ [ ] Multilock   │                         │
│  └─────────────────┘  └─────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘

State: belts ON ────────────────────────────────────────────────────
┌─────────────────────────── Wyposażenie ───────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ [x] Pasy        │  │ [ ] Maty        │  │ [ ] Zaw. pneum. │    │
│  │ ┌─────────┐ szt.│  │                 │  │                 │    │
│  │ │   12    │     │  │                 │  │                 │    │
│  │ └─────────┘     │  │                 │  │                 │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ [ ] Cert XL     │  │ [ ] Multilock   │                         │
│  └─────────────────┘  └─────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘

State: belts ON + mats ON ──────────────────────────────────────────
┌─────────────────────────── Wyposażenie ───────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ [x] Pasy        │  │ [x] Maty        │  │ [ ] Zaw. pneum. │    │
│  │ ┌─────────┐ szt.│  │ ┌─────────┐ szt.│  │                 │    │
│  │ │   12    │     │  │ │    6    │     │  │                 │    │
│  │ └─────────┘     │  │ └─────────┘     │  │                 │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
│  ┌─────────────────┐  ┌─────────────────┐                         │
│  │ [ ] Cert XL     │  │ [ ] Multilock   │                         │
│  └─────────────────┘  └─────────────────┘                         │
└────────────────────────────────────────────────────────────────────┘
```

#### Tailwind classes — exact

| Element | Classes |
|---|---|
| **Grid wrapper** | `grid grid-cols-2 md:grid-cols-3 gap-3` |
| **Cell — base** (every cell, all 5 items) | `flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors` |
| **Cell — active state** (its checkbox is on; applies to all 5) | adds `border-brand/40 bg-brand/5` |
| **Cell — focus-within** (any focusable inside cell) | adds `focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/30` |
| **Top row** (checkbox + label, all cells) | `flex items-center gap-2 text-text` (label wraps the `<Checkbox>` like elsewhere in the file) |
| **Count row** (belts/mats only, rendered when flag is on) | `flex items-center gap-2 animate-slide-in` |
| **Count `<Input>`** | `h-9 w-20 text-sm tabular-nums` (`type="number" min={0} step={1} inputMode="numeric"`) |
| **Count "szt." suffix** | `text-xs text-text-sub` (uses existing `common.pcsShort` i18n key already used by `TrailerDetailModal`) |
| **Count error message** (when `errs.beltsCount` / `errs.matsCount` is set) | `text-xs text-danger` (rendered below the count row, not inside it) |

Notes:
- We **reuse** `animate-slide-in` (`--animate-slide-in: slideIn 0.2s ease`, defined in `globals.css:83`). Today it translates **horizontally** (`translateX(-10px) → 0`); for the in-cell reveal the same animation reads fine — the 10px horizontal slide is barely noticeable inside a narrow cell but still telegraphs "something just appeared". No new keyframe is required.
- The cell border uses existing `border-border` token; the "active" tint uses `border-brand/40 bg-brand/5` — the same opacity/brand pattern already used by `<WizardStepper>` active step and existing claim-card variants. No new palette entries.
- We do **not** need a `min-h-[88px]` reserve on belts/mats cells: each item is its own card and CSS-grid cells auto-size per row, so only the row containing the expanded cell grows. Plain-boolean cells in the same row stay vertically centered (`items-center` on the top row + `flex-col` on the cell). This is intentionally different from the legacy "row" model where one expansion stretched the entire row of fields.

#### Mobile behaviour (320px+)

- At base (`< md`, i.e. < 768px) the grid is **2 columns**. With the Sheet's standard `w-[640px]` body and `px-6` padding, each cell on tablet is ~280px wide; on a 320px phone (Sheet collapses to full-width minus padding ≈ 296px) each cell is ~140px — still comfortable for a checkbox + 6–14 char label (`Pasy`, `Maty`, `Cert XL`, `Multilock`, `Zaw. pneum.` — longest is 11 chars).
- The count `<Input>` (`w-20` = 80px) + "szt." suffix (~28px) + gap (8px) = 116px — fits comfortably inside a 140px cell with `px-3` (12px) padding each side (140 − 24 = 116). No horizontal scroll at 320px.
- The 5th item (last cell in a 2-col grid → odd-one-out) renders alone in the bottom row. Acceptable — same pattern as the existing `<VehicleSheet>` permissions grid. No `col-span` hack.

#### Anti-patterns to avoid (web-agent)

- Do **not** wrap the cells in `<Card>` (shadcn `<Card>` carries its own padding/shadow and is meant for page-level surfaces). Use a plain `<div>` with the classes above.
- Do **not** introduce `min-h-[88px]` on belts/mats cells "just in case" — CSS grid + `flex-col` already handles the height delta cleanly per row.
- Do **not** keep the `min-w-[160px]` label hack from the legacy layout — labels are inside cells now, the cell width is the container.
- Do **not** invent a new keyframe (`slideDown`, `expand`, etc.). `animate-slide-in` is fine; if the horizontal slide ever feels off in QA, that's a follow-up doc change, not a per-component override.

#### Schema / form contract — unchanged

- `belts: boolean`, `beltsCount: number?`, `mats: boolean`, `matsCount: number?`. Zod refine (`trailerCountsRefine`) still requires the count when its flag is `true`. Form `register` calls are identical to the current implementation — only the JSX wrapper structure changes.
- The block must render identically in **standalone** and **wizard** mode (`TrailerSheet` `mode` prop). No conditional layout based on `mode`.

#### Owner / scope

| Change | Where | Owner |
|---|---|---|
| Replace belts/mats stacked rows + 3-up grid with **single 5-cell equipment grid** | `apps/web/app/(employee)/employee/trailers/TrailerSheet.tsx`, the `FormSection title={t('sections.equipment')}` block (currently ~lines 438–520) | web-agent |
| 0 changes to `tailwind.config.ts`, `globals.css`, palette, i18n | — | — |
| 0 changes to `CreateTrailerSchema` / `trailerCountsRefine` | — | — |
| 0 changes to `TrailerDetailModal` (read-only renderer keeps its `boolWithCount` row pattern) | — | — |

---

## Phase 5.2 — «Moja Opieka» carrier list: card-grid redesign

> **Problem statement (user feedback).** The current `/employee/opieka` view renders carriers in an 8-column `<DataTable>`. At typical opiekun viewport widths (1280–1440px in a sidebar layout, or any tablet) the columns are cramped, the «firma» cell truncates aggressively, the four vehicle-bucket columns overflow into horizontal scroll, and the «Otwórz» action button is visually redundant with row click. Direct user quote: *«слишком оно все кучное и зажатое, полностью поля не видно, нужно в бок его передвигать, неудобно и не красиво»*.
>
> **Decision.** Replace the table with a **responsive card grid**. Carriers per opiekun are typically <30 (small N), so we do not need table affordances like column sort / sticky header / per-column filters. The four vehicle buckets compress naturally into a horizontal stat-row inside the card. Whole-card-click navigates to the drill-down, removing the redundant «Otwórz» button.
>
> Reuses existing tokens only — **no new palette colors, no new shadows, no new radii**. The component is `<OpiekunCarrierCard>`, new file `apps/web/components/opieka/OpiekunCarrierCard.tsx`. KPI strip above is untouched.

### 5.2.1 Layout — responsive grid

The KPI strip (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6`) stays exactly as it is today. The new carrier grid replaces the `<DataTable>` block.

| Breakpoint | Columns | Tailwind classes |
|---|---|---|
| `< sm` (≤ 639px, phone) | **1 col** | base: `grid grid-cols-1 gap-3` |
| `sm` (640–1023px, tablet / narrow desktop sidebar layout) | **2 col** | `sm:grid-cols-2 sm:gap-4` |
| `lg` (1024–1535px, standard desktop) | **2 col** | (inherit `sm:grid-cols-2`) |
| `xl` (≥ 1280px) | **3 col** | `xl:grid-cols-3` |
| `2xl` (≥ 1536px) | **3 col** | (inherit `xl:grid-cols-3`) |

Rationale for capping at 3 columns on 2xl: cards have a meaningful min-width (~320px) once the stat-row is rendered without truncation. Going to 4 cols on 2xl would shrink cards below the stat-row's natural width and force the bucket labels to wrap. Three columns at 1536px yields ~480px per card incl. gap — comfortable, breathable, no truncation.

Grid container:

```
<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
  {carriers.map(c => <OpiekunCarrierCard key={c.carrierId} carrier={c} />)}
</div>
```

No horizontal scroll at any viewport ≥ 320px because the card itself is fluid (`w-full`) and the inner stat-row uses `flex flex-wrap` (see §5.2.4).

### 5.2.2 `<OpiekunCarrierCard>` — anatomy

A single carrier card. **The whole card is a `<Link href="/employee/opieka/carriers/[login]">`** — no inner action button. Keyboard / a11y: native focus + ring via Tailwind, semantic `<Link>` from `next/link`.

```
┌────────────────────────────────────────────────────┐  ← bg-card, border, rounded-lg
│  Firma sp. z o.o.                    [ Aktywny ]   │  ← headline row
│  carrier-login-slug                                │  ← login (mono, text-sub)
│                                                    │
│  NIP  1234567890                                   │  ← meta row (mono)
│  ──────────────────────────────────────────────    │  ← divider (border-border)
│                                                    │
│   12      3      1      0                          │  ← stat-row (4 buckets)
│   Jezdz.  Stoj.  Nieakt. Potenc.                   │
└────────────────────────────────────────────────────┘
```

#### Container

| Property | Value | Tailwind |
|---|---|---|
| Surface | `card` | `bg-card` |
| Border | 1px `border` | `border border-border` |
| Radius | 12px (system default) | `rounded-lg` (= `14px` in our config) — keep parity with KPI tiles |
| Padding | 16px (mobile) / 20px (≥ sm) | `p-4 sm:p-5` |
| Shadow (idle) | none | — |
| Shadow (hover) | brand-tinted card shadow | `hover:shadow-card` |
| Hover border | brand at 40% | `hover:border-brand/40` |
| Hover bg (subtle) | brand-50 tint | `hover:bg-brand-50/30 dark:hover:bg-brand/5` |
| Transition | 150ms color/shadow/border | `transition-[background-color,border-color,box-shadow] duration-150` |
| Focus-visible | brand ring | `focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand/60` |
| Cursor | pointer (link) | (native via `<Link>`) |
| Layout | vertical stack | `flex flex-col gap-3` |
| Inactive carrier | dim (opacity) without losing readability | `data-[inactive=true]:opacity-70` |

> **Note on `rounded-lg`.** Our Tailwind config maps `rounded-lg` → `14px` and the KPI tiles use that. Keep it for visual rhythm with the strip above.

#### Headline row (firma + active badge)

```
<div class="flex items-start justify-between gap-3 min-w-0">
  <div class="flex flex-col gap-0.5 min-w-0 flex-1">
    <h3 class="font-semibold text-text text-[15px] leading-tight truncate"
        title={firma ?? nazwa ?? login}>
      {firma ?? nazwa ?? login}
    </h3>
    <span class="text-xs text-text-sub font-mono truncate">{login}</span>
  </div>
  <Badge variant={aktywny ? 'success' : 'muted'}>
    {aktywny ? tCommon('active') : tCommon('inactive')}
  </Badge>
</div>
```

- Title size `15px / font-semibold` — slightly larger than DataTable's body 13px because the card has more vertical room and the firma is the primary identifier.
- `truncate` keeps single-line; full firma on hover via `title` attribute.
- Badge sits top-right, never wraps below the title (uses `items-start` so a wrapping title doesn't push the badge down — `flex-1` on the text column absorbs all extra space first).

#### Meta row (NIP)

```
<div class="flex items-center gap-2 text-sm">
  <span class="text-xs font-bold uppercase tracking-wider text-text-sub">NIP</span>
  <span class="font-mono tabular-nums text-text">{nip}</span>
</div>
```

- NIP label styled as a caption (matches the design system's caption rule: `text-xs font-bold uppercase tracking-wider`).
- Value mono+tabular for digit alignment.
- We intentionally do **not** add `<CopyableValue>` here in v1 — the drill-down page can host that. Card click = navigation, copying conflicts with the gesture.

#### Divider

`<div class="border-t border-border" />` — full-width, separates identity from stats.

### 5.2.3 Vehicle bucket stat-row — color mapping

> ⚠️ **SUPERSEDED by §6.3.6 (2026-07-23).** The `jezdzace / stojace / nieaktywne / potencjalne` km-buckets below are replaced by the four delegation-driven idle-clock states (`aktywna / stojaca / nieaktywna / do_usuniecia`). See §6.3.6 → "opiekun card stat-row" for the new cell/label/tone table. Key change: `stojaca` is now **neutral** (`text-text-sub`), not amber. The table below is retained as historical reference only.

The 4 buckets reuse the **existing semantic palette**, mirroring the KPI tones already used in the strip above so the colour story is consistent vertically on the page.

| Bucket | Meaning | Tone | Token (text) | Reference KPI tile |
|---|---|---|---|---|
| `jezdzace` | Active and recently driving | **green** | `text-success` | `<KpiCard tone="green">` |
| `stojace` | Active but idle ≥ 7 days | **orange (warning)** | `text-warning` | `<KpiCard tone="orange">` |
| `nieaktywne` | `active=false` | **red (danger)** | `text-danger` | `<KpiCard tone="red">` |
| `potencjalne` | KREPTD headroom | **blue (info)** | `text-info` | `<KpiCard tone="blue">` |

> **Note on `nieaktywne` colour change.** The current table renders this column in `text-text-sub` (neutral grey). The redesign upgrades it to `text-danger` to match the KPI tile above (which is already `tone="red"`). This is intentional: it sharpens the four-way bucket distinction inside one small stat-row, and the user reads top-to-bottom (KPI strip → cards) so the colour story should be the same.

### 5.2.4 Stat-row layout

```
<dl class="grid grid-cols-4 gap-2">
  <StatCell value={vehicles.jezdzace}   label={t('table.jezdzace')}   tone="success" />
  <StatCell value={vehicles.stojace}    label={t('table.stojace')}    tone="warning" />
  <StatCell value={vehicles.nieaktywne} label={t('table.nieaktywne')} tone="danger"  />
  <StatCell value={vehicles.potencjalne} label={t('table.potencjalne')} tone="info"  />
</dl>
```

`<StatCell>` is an inline sub-component (not exported), one per bucket:

| Element | Tailwind |
|---|---|
| Wrapper | `flex flex-col items-start gap-0.5 min-w-0` |
| Value | `text-2xl font-extrabold tabular-nums leading-none text-{tone}` — i.e. `text-success` / `text-warning` / `text-danger` / `text-info` |
| Label | `text-[11px] font-medium uppercase tracking-wide text-text-sub truncate` |

Why `grid grid-cols-4` and not `flex flex-wrap`: with 4 equal cells the visual rhythm stays crisp at every width. The `min-w-0` + `truncate` on label means the abbreviated label («Jezdz.» / «Stoj.» / «Nieakt.» / «Potenc.») will truncate before causing horizontal scroll on the narrowest case (360px - 32px padding = 328px / 4 ≈ 82px per cell, comfortably enough for the 2-digit value + the truncated label).

> **i18n note for web-agent.** Add **short label variants** to the `opieka` translations namespace specifically for this card so that the table labels («Jeżdżące» / «Stojące» / «Nieaktywne» / «Potencjalne») can stay long-form in places that have room. Suggested keys: `opieka.card.jezdzace`, `opieka.card.stojace`, `opieka.card.nieaktywne`, `opieka.card.potencjalne` (PL: «Jeżdż.», «Stoj.», «Nieakt.», «Potenc.»; EN: «Driving», «Idle», «Inactive», «Potential»). EN is already short enough to use as-is.

### 5.2.5 ASCII mockup — desktop (xl, 3-col)

```
┌──────────────────────────────────┐ ┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ Trans-Logistyka sp. z o.o. [Akt] │ │ Pol-Cargo Express     [Aktywny] │ │ Maxi Transport sp.j.  [Nieakt.] │
│ trans-logistyka                  │ │ pol-cargo-exp                    │ │ maxi-trans-sp                    │
│                                  │ │                                  │ │                                  │
│ NIP  1234567890                  │ │ NIP  9876543210                  │ │ NIP  5555555555                  │
│ ──────────────────────────────── │ │ ──────────────────────────────── │ │ ──────────────────────────────── │
│  12      3      1      0         │ │  24      0      0      3         │ │   0      0      8      0         │
│  Jezdż.  Stoj.  Nieakt. Potenc.  │ │  Jezdż.  Stoj.  Nieakt. Potenc.  │ │  Jezdż.  Stoj.  Nieakt. Potenc.  │
└──────────────────────────────────┘ └──────────────────────────────────┘ └──────────────────────────────────┘
   ↑ green   orange  red    blue       ↑ green   orange  red    blue       ↑ green   orange  red    blue
```

### 5.2.6 ASCII mockup — mobile (1-col, ~360px)

```
┌────────────────────────────────────┐
│ Trans-Logistyka sp.    [Aktywny]   │
│ trans-logistyka                    │
│                                    │
│ NIP  1234567890                    │
│ ────────────────────────────────── │
│  12      3       1       0         │
│  Jezdż.  Stoj.   Nieakt. Potenc.   │
└────────────────────────────────────┘
┌────────────────────────────────────┐
│ Pol-Cargo Express      [Aktywny]   │
│ pol-cargo-exp                      │
│ ...                                │
└────────────────────────────────────┘
```

Each card is a tap target ≥ 44px tall (in practice ~140px) — easy on touch.

### 5.2.7 Empty state

When `carriers.length === 0` (admin sees zero carriers system-wide, or opiekun has no assigned carriers), render the existing `<EmptyState>` component directly **inside the grid container's place** (i.e. replacing the `<div class="grid ...">`, not inside it):

```
{isLoading ? <OpiekunCarrierCardSkeletonGrid /> :
 carriers.length === 0 ? (
   <EmptyState
     icon={HeartHandshake}
     title={t('emptyTitle')}
     message={t('emptyMessage')}
   />
 ) : (
   <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
     {carriers.map(...)}
   </div>
 )}
```

`<EmptyState>` is already centered + padded; no extra container needed. Same component used by the legacy DataTable empty slot, so no visual regression.

### 5.2.8 Loading state — skeleton grid

Replace the `<DataTable isLoading>` skeleton with a card-shaped skeleton (`<OpiekunCarrierCardSkeleton>`), rendered 6 times in the same grid layout so the page reserves space without layout jump:

```
<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
  {Array.from({ length: 6 }).map((_, i) => (
    <div key={i}
         class="bg-card border border-border rounded-lg p-4 sm:p-5 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1.5 flex-1 min-w-0">
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-3 w-1/2" />
        </div>
        <Skeleton class="h-5 w-16 rounded-full" />
      </div>
      <Skeleton class="h-4 w-32" />
      <div class="border-t border-border" />
      <div class="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, j) => (
          <div key={j} class="flex flex-col gap-1">
            <Skeleton class="h-7 w-8" />
            <Skeleton class="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
```

`<Skeleton>` is the existing component at `apps/web/components/ui/Skeleton.tsx` — reuse it, no new primitive.

### 5.2.9 Accessibility

- Each card is a single `<Link>` (`next/link`) → keyboard `Tab` lands on the whole card; `Enter` activates. No nested interactive elements (the badge is decorative text), so no nested-focus issue.
- `aria-label` on the link: `t('table.openDetailAria', { firma })` (reuse the existing key — already in the i18n bundle). Screen-readers announce the navigation target instead of attempting to read the entire visual contents.
- Focus ring: `focus-visible:ring-[3px] focus-visible:ring-brand/40` — matches the «Otwórz» button focus pattern that already exists, so behaviour is consistent with the rest of the app.
- Color is **not the only signal** for the four buckets — each value is paired with a text label below it (`Jezdż.` / `Stoj.` / `Nieakt.` / `Potenc.`). Colour-blind users still get the bucket identity from the label.
- Inactive carriers: `aria-disabled` is **not** set — the card stays clickable (drill-down still works for inactive carriers). `data-[inactive=true]:opacity-70` is the only signal, plus the `<Badge variant="muted">` in the headline.

### 5.2.10 What we drop from the legacy table

| Element | Why dropped |
|---|---|
| 8-column `<DataTable>` | Too cramped at < 1440px; horizontal scroll fails the user-feedback test. |
| Per-column sort headers | Small N (≤ 30 carriers per opiekun); sort is overkill. If sorting is ever needed, add a single `<Select>` above the grid («Sortuj wg: nazwa / liczba aut / status») — not currently in scope. |
| «Otwórz» action button (right-most column) | Redundant with whole-card click. Removed entirely. |
| Distinct row hover | Replaced with card-level hover (`hover:shadow-card hover:border-brand/40`). |

### 5.2.11 Files / changes for web-agent

| Change | Where | Notes |
|---|---|---|
| New `<OpiekunCarrierCard>` | `apps/web/components/opieka/OpiekunCarrierCard.tsx` | Pure presentational; props = `{ carrier: OpiekunCarrierStats }`. Wraps content in `<Link>` itself. |
| New `<OpiekunCarrierCardSkeleton>` | same file, named export | Used in loading grid. |
| Refactor page | `apps/web/app/(employee)/employee/opieka/page.tsx` | Delete `columns` definition + `<DataTable>` block; replace with the grid container + loading / empty branch from §5.2.7. KPI strip + page header stay byte-for-byte. |
| i18n short labels | `apps/web/messages/pl.json`, `en.json` | Add `opieka.card.{jezdzace,stojace,nieaktywne,potencjalne}` (see §5.2.4). |
| 0 changes to `tailwind.config.ts` / `globals.css` | — | All tokens used here (`bg-card`, `border-border`, `text-success/warning/danger/info`, `rounded-lg`, `shadow-card`, `bg-brand-50`, `ring-brand/40`) already exist. |
| 0 changes to API / DTO | — | Endpoint and `OpiekunCarrierStats` shape are reused as-is. |

### 5.2.12 Acceptance checklist

- [ ] At 320 / 360 / 640 / 1024 / 1280 / 1536 / 1920 px viewport widths: **no horizontal scrollbar**. Verified light + dark.
- [ ] The four bucket values use `text-success` / `text-warning` / `text-danger` / `text-info` — visually distinct in both themes.
- [ ] Card click navigates to `/employee/opieka/carriers/[login]` (encoded). Keyboard Enter on focused card has the same effect.
- [ ] No nested clickable elements inside the card link.
- [ ] Skeleton renders 6 placeholder cards in the same grid layout; no layout jump when data arrives.

## Phase 6.1 — Country-driven masked fields (generalized: postal + ID document + phone)

> **What this section formalises.** The delegation form already ships a *country → postal-code* live-mask + soft-warning interaction (`<MaskedPostalInput>` + `EU_POSTAL_CODES`). The Driver create/edit modal (`DriverSheet`) now needs the **same interaction shape** applied to two more fields — **`idDocumentNumber` (Numer dokumentu tożsamości)** and **`phone` / `phone2`** — driven by a single per-driver «Kraj / Country» selector.
>
> This section generalises the pattern into one named contract — **"country-driven masked field"** — so postal, ID-document and phone all share the same UX vocabulary and the same soft-warning visual treatment, while documenting the **three deliberate asymmetries** between the postal case and the driver case so nobody "fixes" them into inconsistency later.

### 6.1.1 The generalized pattern — "country-driven masked field"

A country-driven masked field is a text input whose **formatting hint and on-blur soft warning are parameterised by a sibling country selector**. It has exactly these moving parts:

1. **A country selector** (`<CountrySelect>`, EU-27 VIES enum) that emits an `EuVatCountryCode | ''`.
2. **A per-country ruleset** in `packages/shared/src/constants/` — a `Record<EuVatCountryCode, Rule>` kept *total* over the union (compile-time completeness guard, like `EU_POSTAL_CODES`).
3. **A masked / hinted input** that reads the rule for the currently-selected country and:
   - renders a placeholder derived from the rule's `example` (or a mask-derived `__-___` skeleton where a rigid mask exists),
   - shapes typing where a rigid character-mask is realistic (postal, *not* phone/ID — see §6.1.3),
   - on **blur**, if the value is non-empty and a country is set, evaluates the rule and toggles a **soft warning**.
4. **A clear-on-country-change** wiring in the parent form: when the country changes, the dependent field(s) are reset to `''` (the previous country's format almost never matches the new one).

**Soft-warning visual contract (identical across all three field kinds).** This is the load-bearing styling rule — it must be byte-identical to `<MaskedPostalInput>`:

| State | Hint element | Classes |
|---|---|---|
| Country set, value empty or being typed | expected-format hint | `text-xs text-text-sub` |
| Country set, value non-empty, fails rule on blur | invalid hint | `text-xs text-danger`, `role="alert"`, input gets `border-danger` + `aria-invalid` |
| No country selected | no hint row at all | — |

The hint copy is always *"expected: {example}"* in the neutral state and *"unexpected format — expected something like {example}"* in the danger state. **The example is the only concrete guidance** — we never enumerate every accepted document type in the hint.

### 6.1.2 The soft-warning-only contract (non-negotiable for ID + phone)

> **This is the single most important rule in this section. web-agent must not violate it.**

For **postal codes**, the per-country regex is *also* wired into the delegation Zod schema (cross-field validation), so a bad postal is a real submit-blocking error. **For ID document and phone, the rulesets are documentation/UX only — they are NEVER wired into any Zod schema.** The contract:

- The existing Zod fields stay exactly as they are: `phone` accepts any 1–32 char string, `idDocumentNumber` accepts any 1–64 char string. **Do not touch these schemas.**
- The country selector is **UI-only**: never added to `CreateDriverSchema` / `UpdateDriverDto`, never persisted, never submitted, never sent to the API. It lives in component state (RHF `useState` or a non-submitted RHF field that the submit handler strips — see §6.1.5).
- A mask mismatch on blur produces **only** the inline `text-danger` hint. It must **never**:
  - become an RHF error (`form.setError`),
  - set `aria-invalid` on the field in a way that participates in `formState.errors`,
  - block, gate, or even discourage submit,
  - show a validation toast.
- Submit is **never** hard-blocked by the country/mask. A driver from a non-EU country, a driver whose passport doesn't match the national-ID shape, a landline that's shorter than the mobile range — **all submit fine**. The warning is a *nudge*, not a gate.

> **Why so permissive.** Real EU identity documents come in several shapes per country (national ID vs passport vs residence permit vs older legacy formats), and phone numbers vary by mobile/landline/length. A strict regex *will* false-warn on legitimate data. The warning's job is to catch fat-finger typos (wrong length, wrong calling code), not to enforce a format. See §6.1.6 for the realism analysis.

### 6.1.3 The three asymmetries vs. the postal case

| # | Postal (delegations) | ID document + phone (DriverSheet) | Why different |
|---|---|---|---|
| **A. Schema wiring** | Regex **is** in the Zod schema → hard error on submit. | Ruleset is **never** in any Zod schema → soft hint only. | Postal is a required, format-stable field. ID/phone accept many legitimate shapes; a hard regex would reject real documents. |
| **B. No-country fallback** | Input is **disabled** until a country is picked (postal country is required). | Input stays an **enabled free-text input** when no country is selected. | Country here is **optional**; arbitrary strings (non-EU drivers, unusual formats) must always be enterable. Masking only *activates* once a country is chosen. |
| **C. Mask model** | Rigid character-mask (`9` digit / `A` letter / literal) — postal formats are short and fixed. | **Lenient model, no rigid character-mask.** Phone = `{ callingCode, minNationalLen, maxNationalLen, example }` → "~N digits / +CC" hint. ID = length-range `{ minLen, maxLen, example, regex? }` → realistic-ceiling hint. | National phone lengths vary (mobile vs landline); ID accepts multiple document types. A fixed `9`-mask would corrupt legitimate input by silently dropping characters. |

> **Do-not-"fix" markers.** All three asymmetries are *intentional*. A future contributor who "notices" that ID/phone aren't validated server-side, or that the input isn't disabled-without-country, or that there's no rigid mask, **must not** add Zod validation, disable the input, or impose a character-mask. The relevant source files carry inline `// SOFT-WARNING ONLY — see docs/14 §6.1.2` comments to anchor this.

### 6.1.4 `DriverSheet` modal layout decision

Current `DriverSheet` field block (inside `<FormGrid cols={2}>`): firstName/lastName · phone/phone2 · email/idDocumentNumber · licenseExpiry · then notes, ADR, active outside the grid.

**Decision — one full-width «Kraj / Country» selector, placed as a leading row immediately above the contact fields, reading as the control for everything below it.**

```
┌──────────────────────────────────────────────────────────────┐
│  Przewoźnik (carrier)                          [create only]  │  ← unchanged
│  ──────────────────────────────────────────────────────────  │
│  Imię (firstName)            │  Nazwisko (lastName)           │  ← grid row, unchanged
│  ──────────────────────────────────────────────────────────  │
│  Kraj / Country            ⌄  [ — wybierz (optional) — ]      │  ← NEW: full-width, col-span-2
│  Steruje formatem telefonu i numeru dokumentu (opcjonalnie)   │  ← FormDescription helper
│  ──────────────────────────────────────────────────────────  │
│  Telefon (phone)             │  Telefon 2 (phone2)            │  ← now country-driven
│   +48 · ~9 cyfr               │   +48 · ~9 cyfr               │  ← soft hint (text-sub)
│  ──────────────────────────────────────────────────────────  │
│  E-mail                      │  Numer dokumentu tożsamości    │  ← idDocumentNumber country-driven
│                              │   np. ABA123456                │  ← soft hint (text-sub)
│  ──────────────────────────────────────────────────────────  │
│  Termin ważności prawa jazdy (licenseExpiry)                 │  ← unchanged
└──────────────────────────────────────────────────────────────┘
```

Layout rules:
- The country select is a **full-width row**: render it as a `<FormField>` with `className="sm:col-span-2"` *inside* the existing `<FormGrid cols={2}>` (so it spans both columns), positioned **after lastName, before phone**. This makes the visual reading order "name → its country → its phone/document" and signals scope: everything below the selector is country-shaped.
- It carries a `<FormDescription>` one-liner: *"Steruje podpowiedzią formatu telefonu i numeru dokumentu (opcjonalne)."* / EN *"Drives the format hint for phone and ID document (optional)."* — so the operator understands the selector is a helper, not a saved field.
- The selector's placeholder reads as optional: *"— wybierz kraj (opcjonalnie) —"* — **not** the delegation-style required placeholder. There is no required asterisk on this field.
- **`phone`, `phone2` and `idDocumentNumber` are all driven by this one selector** (a driver has one home country; phone2 is still a phone, so consistency wins — both phones share the same calling-code rule).
- **Clear-on-change:** when the country changes, reset `phone`, `phone2`, and `idDocumentNumber` to `''` via `form.setValue(..., '', { shouldValidate: false, shouldDirty: true })`. Same rationale as the postal clear; `shouldValidate: false` keeps the soft model from ever touching RHF errors.
- **Edit mode:** the selector opens **empty** (country is not persisted, so we can't pre-fill it). The existing phone/idDocument values render as-is in their free-text fallback state (no mask, no hint) until/unless the operator picks a country. Picking a country then **clears** those fields (consistent with create) — document this as a known, acceptable trade-off in §6.1.5; the operator only picks a country when they intend to re-enter formatted values.

### 6.1.5 Spec for **web-agent** — wiring

**Component strategy — add two siblings, do not over-generalise `MaskedPostalInput`.** `MaskedPostalInput` is built around a rigid character-mask + a Zod-backed validator; the phone/ID cases are lenient and Zod-free. Forcing all three into one component would couple incompatible behaviours. Instead:

| Component | New file | Model | Notes |
|---|---|---|---|
| `<MaskedPostalInput>` | exists | rigid mask + regex | **unchanged**. |
| `<MaskedPhoneInput>` | `apps/web/components/forms/MaskedPhoneInput.tsx` | lenient digit-count + calling code | Free-text when `country=''`. On blur (country set, value non-empty) runs `isPlausiblePhone(country, value)` → soft hint only. No character-mask; light normalisation (strip non-digits for the length check, but keep the user's literal value in RHF). |
| `<MaskedDocumentInput>` | `apps/web/components/forms/MaskedDocumentInput.tsx` | lenient length-range (+ optional regex) | Free-text when `country=''`. On blur runs `isPlausibleIdDocument(country, value)` → soft hint only. No character-mask. |

Both new components mirror `<MaskedPostalInput>`'s **visual** structure exactly: a wrapper `div.space-y-1`, the `<Input>`, and a conditional `<p class="text-xs ...">` hint that is `text-text-sub` in the neutral state and `text-danger` + `role="alert"` in the unexpected-format state. **Difference from postal:** when `country=''` these inputs are **enabled free-text** (`disabled={false}`, normal `placeholder`, no hint row), NOT disabled.

Both expose the same prop surface as `MaskedPostalInput`: `{ value, onChange, country: EuVatCountryCode | '', placeholderOverride?, ...native }`, RHF-friendly via `<Controller>`.

Hard constraints for web-agent:
- **Never** call `form.setError` / surface these in `formState.errors`. The soft `blurInvalid` flag is **local component `useState`**, exactly like `MaskedPostalInput`'s `blurInvalid` — it never leaves the component.
- **Never** add the country selector value to the submit payload. Keep it in local `useState` (recommended: `const [homeCountry, setHomeCountry] = useState<EuVatCountryCode | ''>('')`), **not** an RHF field, so it can't accidentally be serialised by `useFormDraft` or the submit cleaner. If you prefer an RHF field for ergonomics, the submit handler's existing empty-string-stripping loop must explicitly `delete cleaned.homeCountry` (and it must not be in `CreateDriverSchema`, which is `.strict()` and would reject it anyway — that rejection is itself the guardrail).
- The country `<CountrySelect>` `onChange` must `form.setValue('phone', '', …)`, `form.setValue('phone2', '', …)`, `form.setValue('idDocumentNumber', '', …)` with `shouldValidate: false`.
- The three driven fields move from `form.register(...)` to `<Controller>` (needed to pass `country` + custom `onChange`), exactly like the delegation postal fields. Their `error={errs.X?.message}` wiring on the `<FormField>` stays — those still show *Zod* errors (e.g. required `idDocumentNumber` empty on submit), which is correct and separate from the soft mask hint.
- Add a `// SOFT-WARNING ONLY — never escalate to RHF/Zod, never block submit. See docs/14 §6.1.2` comment at the top of both new components and at the country `onChange` site in `DriverSheet`.
- i18n: add a `forms.phone` and `forms.document` namespace mirroring `forms.postal` (`placeholderNoCountry`, `expectedFormat`, `invalidFormat`). For phone, `expectedFormat` interpolates `{callingCode}` + `{digits}` (e.g. *"oczekiwano: +48 · ~9 cyfr"*); for document, `{example}`.

### 6.1.6 Spec for **api-agent** — the two rulesets (realism analysis + exact shapes)

Two new files next to `eu-postal-codes.ts`, both exported from `packages/shared/src/constants/index.ts`, both **total over `EuVatCountryCode`** with the same compile-time completeness guard pattern. **Neither is imported by any Zod schema — that asymmetry is intentional (see §6.1.2/§6.1.3-A). Add a file-header comment stating this explicitly so nobody wires them into validation.**

#### `eu-phone-rules.ts` — `EU_PHONE_RULES`

Phone **cannot** be a rigid character-mask: national significant numbers vary in length (mobile vs landline vs special), and several countries have variable-length numbering plans. The lenient model is a **calling code + a national-digit-count range**, surfaced as a *"~N digits / +CC"* soft hint.

```ts
export interface EuPhoneRule {
  /** E.164 country calling code WITHOUT the leading '+', e.g. '48' for PL. */
  callingCode: string;
  /** Min plausible national significant digits (excludes the calling code). */
  minNationalLen: number;
  /** Max plausible national significant digits (excludes the calling code). */
  maxNationalLen: number;
  /** A realistic example in the form the hint shows, incl. '+CC'. */
  example: string;
}

export const EU_PHONE_RULES: Record<EuVatCountryCode, EuPhoneRule> = {
  PL: { callingCode: '48', minNationalLen: 9, maxNationalLen: 9,  example: '+48 512 345 678' },
  DE: { callingCode: '49', minNationalLen: 6, maxNationalLen: 11, example: '+49 151 23456789' },
  // … the remaining 25 EU codes …
};
```

Realism notes for api-agent authoring the other 25:
- `minNationalLen`/`maxNationalLen` are **plausibility bounds**, deliberately wide enough to cover both mobile and landline so legitimate numbers don't warn. Err generous (e.g. DE's range 6–11 covers short landlines through long mobiles). The point is to catch "user typed 4 digits" or "user typed 20 digits", not to validate against the official numbering plan.
- The example should be a **mobile** number in international form, since that's the common case for a driver.

Validator helper signature (web-only consumer; lives in the same file for cohesion, exported):

```ts
/**
 * SOFT plausibility check — true unless the digit count is clearly outside the
 * national range. Strips '+', spaces, '(', ')', '-' and an optional leading
 * country calling code before counting. NEVER used by any Zod schema.
 * Returns true for unknown country codes (defensive — caller gates on country).
 */
export function isPlausiblePhone(country: string, raw: string): boolean;
```

Implementation guidance: normalise `raw` to digits; if it starts with the rule's `callingCode`, drop it; compare remaining length against `[minNationalLen, maxNationalLen]`. Empty string → `true` (no warning on empty; the component already gates on non-empty).

#### `eu-id-document-rules.ts` — `EU_ID_DOCUMENT_RULES`

A single strict regex would false-warn because most EU states issue several accepted document types (national ID, passport, residence card, sometimes multiple legacy national-ID formats). The model is a **length range with an optional *lenient* regex**, where the soft hint shows a realistic example and the warning fires only on a clearly-wrong length (or a clearly-wrong shape if a lenient regex is supplied).

```ts
export interface EuIdDocumentRule {
  /** Min plausible length across the country's accepted document types. */
  minLen: number;
  /** Max plausible length across the country's accepted document types. */
  maxLen: number;
  /** A realistic example (national ID is fine) shown in the soft hint. */
  example: string;
  /**
   * OPTIONAL lenient shape check. Must be permissive enough to pass national
   * ID *and* passport *and* residence permit. Omit it entirely when the
   * document types are too divergent to share one pattern — the length range
   * alone is the soft check then. Case-insensitive; UI does not force case.
   */
  regex?: RegExp;
}

export const EU_ID_DOCUMENT_RULES: Record<EuVatCountryCode, EuIdDocumentRule> = {
  // PL dowód osobisty: 3 letters + 6 digits ('ABA123456'). Passport: 2 letters +
  // 7 digits. The lenient regex admits both letter/digit mixes 8–10 chars long.
  PL: { minLen: 8, maxLen: 10, example: 'ABA123456', regex: /^[A-Z]{2,3}\d{6,7}$/i },
  // DE Personalausweis (since 2010): 9 alphanumerics, often starting with a
  // letter; passports differ. Keep it to a length range + a very loose
  // alphanumeric check so passports/residence cards don't false-warn.
  DE: { minLen: 9, maxLen: 10, example: 'L01X00T47', regex: /^[A-Z0-9]{9,10}$/i },
  // … the remaining 25 EU codes …
};
```

Realism notes for api-agent authoring the other 25:
- **Prefer a generous length range; supply `regex` only when a genuinely permissive shared shape exists.** When national ID and passport diverge too much (different lengths *and* different character classes), **omit `regex`** and let the length range be the only soft check. A missing `regex` is a feature, not an oversight.
- `minLen`/`maxLen` should bracket the *shortest accepted document* through the *longest accepted document* for that country, so a passport never warns when the example is a national ID.
- The `example` should be the most common document a driver carries (national ID), formatted exactly as the soft hint will display it.

Validator helper signature:

```ts
/**
 * SOFT plausibility check — true unless length is outside [minLen, maxLen] OR a
 * supplied lenient `regex` clearly fails. Trims surrounding whitespace; does NOT
 * force case. NEVER used by any Zod schema. Returns true for unknown country
 * codes and for empty input.
 */
export function isPlausibleIdDocument(country: string, raw: string): boolean;
```

#### Barrel + guards

- Add both to `packages/shared/src/constants/index.ts`.
- Each file ends with the same `const _COMPLETE: Record<(typeof EU_VAT_COUNTRY_CODES)[number], Rule> = THE_RECORD; void _COMPLETE;` guard as `eu-postal-codes.ts`, so adding a 28th EU code is a compile error until a rule is authored.
- **No Zod import, no schema edit, no DTO change, no migration.** If anything in `packages/shared/src/schemas/` or `apps/api/` would have to change, the change is wrong — stop and re-read §6.1.2.

### 6.1.7 Acceptance checklist

- [ ] `DriverSheet` shows a full-width «Kraj / Country» selector between lastName and phone, with an «(opcjonalne)» placeholder and a `<FormDescription>` explaining it drives the format hints.
- [ ] With **no country** selected, `phone`, `phone2`, `idDocumentNumber` are **plain enabled free-text inputs** (no mask, no hint row, no disabled state) and submit works with arbitrary strings.
- [ ] Selecting a country shows the neutral `text-text-sub` expected-format hint under each of the three fields; an implausible value on blur flips that one field's hint to `text-danger` + `role="alert"` + `border-danger`.
- [ ] The danger hint **never** appears in `form.formState.errors`, **never** blocks submit, **never** raises a validation toast. A value that "looks wrong" still saves.
- [ ] Changing the country clears `phone`, `phone2`, `idDocumentNumber` (with `shouldValidate: false`).
- [ ] The country value is **not** in the network request body on create or edit (verify in devtools), is **not** in `CreateDriverSchema`/`UpdateDriverDto`, and is **not** persisted.
- [ ] `EU_PHONE_RULES` and `EU_ID_DOCUMENT_RULES` are total over EU-27 (compile guard passes) and are imported by **zero** Zod schemas.
- [ ] Visual parity: the hint rows under phone/ID are pixel-identical in size/color/weight to the postal hint under `<MaskedPostalInput>` in both light and dark themes.
- [ ] Empty state replaces the grid (not rendered inside it).
- [ ] KPI strip above is unchanged.
- [ ] Inactive carrier: opacity dimmed; «Nieaktywny» muted badge; still clickable.
- [ ] AA contrast: bucket value digits on `bg-card` — verified for all four tones in both themes (success / warning / info ≥ 3:1 for large text 24px-extrabold; danger ≥ 4.5:1).

## Phase 6 — Planista / Dyspozytor read-only panels

> **Naming note.** There is an earlier `## Phase 6 — <EntityDetailModal>` section above (read-only *modal* surface). This section is the Phase 6 *sub-slice 6.3* work: the two **operational role panels** (planista, dyspozytor). Different artefact, same phase number — they are unrelated. Refer to this one as the "role-panel pattern".

**Reference screenshots:** `docs/screenshots/planista-fleet.png`, `docs/screenshots/dyspozytor-fleet.png`. (Ignore the violet "TRYB PODGLĄDU" GAS banner and the test data in both — see global ignore rules.) These two screens are the canonical read-only role panels: a tabbed fleet inspection surface, dyspozytor additionally fronted by a KPI stats strip.

**Establishing pattern (reuse, do not re-derive):** the opieka drill-down at `app/(employee)/employee/opieka/carriers/[login]/page.tsx` already implements the canonical read-only tabbed pattern — `<Tabs>` over per-entity `<DataTable>` instances with curated read-only column sets, each with an `<EmptyState>` empty slot, **zero** row mutations. Phase 6 panels are the same pattern, scoped to a *role panel* instead of a carrier drill-down. The opieka dashboard (`opieka/page.tsx`) is the canonical KPI-strip reference for the dyspozytor variant.

**Hard constraints (token policy + read-only):**
- **No new tokens.** Everything below composes existing tokens only (Phase 4.4 surface policy). `bg-input` is the single soft-chrome surface; `bg-bg-soft` is dead. The only surfaces used here are `bg-card` (tables, cards, KPI tiles via `<Card>`/`<KpiCard>`), `bg-input` (filter-bar / search row), `bg-bg` (DataTable header per the Phase 2 DataTable spec), and the semantic accent tokens `text-success` / `text-warning` / `text-danger` / `text-info` / `text-brand`.
- **Strictly read-only.** *(2026-09-28, §17.0 D4: the planista panel gains exactly one workflow action — filing / cancelling a vehicle-transfer request, in the vehicle detail modal footer and on the «Moje wnioski» tab. Vehicle data itself stays read-only; the rule below still holds for table rows.)* No action buttons, no kebab column, no inline edit, no status-change controls, no row-click-to-edit. Rows are inert (whole-row hover for affordance only, no `onClick` mutation). Delegation status changes are weryfikator territory (Phase 7) and must **not** appear here. A read-only info banner (below) states this explicitly to the user.

### 6.3.1 Canonical layout — a role-scoped read-only panel inside `RoleShell`

`RoleShell` (`components/layout/RoleShell.tsx`) renders only `<Header>` + `<main>` — **no sidebar** (unlike the employee shell). Sub-navigation therefore lives **in-page** as a `<Tabs>` bar, not in a rail.

Page container — match the width/padding strip standardized in Phase 4.4 and used by the opieka pages:

```
<section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
```

> Note: the opieka pages currently use `px-4 sm:px-6 lg:px-10 xl:px-12 py-8` **without** the `mx-auto max-w-screen-2xl` centering wrapper because they were authored before 4.4. For the new Phase 6 panels, **use the full 4.4 strip** (`mx-auto max-w-screen-2xl …`) — it is the standardized container and keeps the fleet tables from stretching edge-to-edge on ultra-wide monitors.

Vertical composition, top to bottom:

1. **Page heading** — same treatment as opieka: `<h1 className="text-2xl font-extrabold tracking-tight text-text">` + `<p className="text-sm text-text-sub">` subtitle, wrapped in `flex flex-col gap-1 mb-6`. Title = role panel name (PL «Panel planisty» / «Panel dyspozytora»), subtitle = one-line scope hint.
2. **Read-only info banner** (both panels) — a single non-dismissible info strip replacing the legacy red/blue "tylko do podglądu" bar. Compose, do **not** invent a banner token:
   `<div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-input px-4 py-3 text-sm text-text-sub">` with a leading Lucide `<Info size={16} className="text-info shrink-0" />`. Copy (PL): «Dane są tylko do podglądu — edytuje administrator.» (EN: «Data is read-only — managed by an administrator.»). The legacy banner also surfaces fleet counts inline; in the dyspozytor panel those counts move into the KPI strip, so keep the banner copy purely about read-only status.
3. **KPI strip** — **dyspozytor only** (see 6.3.3). Planista has no strip.
4. **`<Tabs>` sub-navigation + `<DataTable>` per tab** (see 6.3.2 / 6.3.3).

`<Tabs>` usage — identical to the opieka drill-down (locked): `<Tabs defaultValue=… className="w-full">` → `<TabsList aria-label={…} className="mb-4">` → one `<TabsTrigger>` per tab → one `<TabsContent>` per tab wrapping a `<DataTable>`. Active-tab treatment is the brand-red `data-state=active` style already configured on the shadcn `<Tabs>` primitive — no per-panel override. The `aria-label` on `<TabsList>` is mandatory (keyboard/SR users get the group name).

Each `<DataTable>` keeps its own `isLoading` (skeleton rows per the Phase 2 DataTable spec) and its own `empty={<EmptyState …/>}` slot. No filter bar is required for read-only panels, but if a search row is added it uses `bg-input` per the surface policy and is search-only (no mutating controls).

### 6.3.2 Planista variant — 3 tabs

Tabs (order, matching `planista-fleet.png`): **Auta** / **Kierowcy** / **Naczepy**. No KPI strip. Each tab = one read-only `<DataTable>`.

Columns are a sensible read-only subset of the existing `VehicleDto` / `DriverDto` / `TrailerDto` shapes. Reuse the opieka drill-down column definitions as the baseline and extend with the planista-relevant compliance columns visible in the legacy screen.

**Auta** (`VehicleDto`):

| Column id | Header (PL) | Cell |
|---|---|---|
| `plate` | NR REJ. | `font-mono font-semibold` plate |
| `side` | NR BOCZNY | `sideNumber ?? '—'` |
| `carrier` | PRZEWOŹNIK | carrier company/login (`row.carrier?.company ?? '—'`) |
| `certL` | CERT. L | `<Badge variant="muted">` with L-class (`L1`/`L3`) or `—` |
| `euro` | EURO | `<Badge variant="muted">` EURO class or `—` |
| `adr` | ADR | `<Badge variant="warning">` ADR class when present, else `—` |
| `gps` | GPS | boolean → `<Check className="text-success"/>` / `<X className="text-text-sub"/>` (icon, not coloured text alone — pair with `aria-label`) |
| `active` | STATUS | `active ? <Badge variant="success">Aktywne</Badge> : <Badge variant="muted">Nieaktywne</Badge>` |

> The legacy planista screen also shows a `K.PALIW` (fuel card) column; include it **only if** `VehicleDto` exposes the flag — otherwise drop it (do not fabricate a field). Treat it like `gps` (boolean check/cross icon) when present.

**Kierowcy** (`DriverDto`) — same subset as the opieka `DriversTable`:

| Column id | Header (PL) | Cell |
|---|---|---|
| `name` | KIEROWCA | `font-semibold` `firstName lastName` |
| `phone` | TELEFON | `phone ?? '—'` |
| `idDocument` | DOKUMENT | `idDocumentNumber ?? '—'` |
| `active` | STATUS | active/inactive badge as above |

**Naczepy** (`TrailerDto`) — same subset as the opieka `TrailersTable`:

| Column id | Header (PL) | Cell |
|---|---|---|
| `plate` | NR REJ. | `font-mono font-semibold` plate |
| `type` | TYP | `trailerType.shortCode` → `[CODE] name`, else `name ?? '—'` |
| `brand` | MARKA / MODEL | `[brand, model].filter(Boolean).join(' ') || '—'` |
| `active` | STATUS | active/inactive badge |

**Empty-state copy** (per tab, using existing `<EmptyState title message>`):
- Auta — title «Brak aut» / message «Do tego planisty nie przypisano żadnych aut.»
- Kierowcy — title «Brak kierowców» / message «Do tego planisty nie przypisano żadnych kierowców.»
- Naczepy — title «Brak naczep» / message «Do tego planisty nie przypisano żadnych naczep.»

(EN mirror: «No vehicles / drivers / trailers» + «No … assigned to this planner.») Add an optional Lucide icon to each `<EmptyState>` consistent with the tab (`Car` / `User` / `Truck`).

### 6.3.3 Dyspozytor variant — KPI strip + 4 tabs

**KPI strip** — sits between the info banner and the `<Tabs>`. Composed entirely of the existing `<KpiCard>` (`components/dashboard/KpiCard.tsx`); **no new card component**. Responsive grid mirrors the opieka strip:

```
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
```

(5 tiles → `lg:grid-cols-5`; 2-up on phones, 3-up on small tablets. If the API also returns a "naczepy total" you want as a 6th tile, switch to `lg:grid-cols-6` exactly like the opieka strip — keep the breakpoint family identical.)

> ⚠️ **The bucket table below is km/`lastDroveAt`-driven and is SUPERSEDED by §6.3.6** (delegation-driven, five states). Use §6.3.6 for the current KPI strip, tones, labels and icons. The table is kept only as the historical reference for what changed.

Bucket → tile tone mapping. This **reuses the 4.3 KpiCard tone vocabulary** and the 5.2.3 bucket→tone story so the colour reading is consistent with the opieka surfaces:

| Stats bucket | Tile label (PL) | `tone` | Accent token (resolved by KpiCard) | Lucide icon |
|---|---|---|---|---|
| `liczbaAut` (total vehicles) | AUTA | `neutral` | `bg-text-sub` / `text-text-sub` | `Truck` |
| `jezdzace` (driving) | JEŻDŻĄ | `green` | `bg-success` / `text-success` | `Car` |
| `stojace > 7 dni` (idle >7d) | STOJĄ >7 DNI | `orange` | `bg-warning` / `text-warning` | `PauseCircle` |
| `liczbaKierowcow` (drivers) | KIEROWCY | `blue` | `bg-info` / `text-info` | `User` |
| `liczbaNaczep` (trailers) | NACZEPY | `neutral` | `bg-text-sub` / `text-text-sub` | `Container` |
| `nieaktywne` (inactive, optional 6th) | NIEAKTYWNE | `red` | `bg-danger` / `text-danger` | `CircleSlash2` |

> **Documented deviation (no purple token).** `<KpiCard>` accepts `tone="purple"` but the DS palette has **no purple** — the primitive maps `purple` onto `bg-brand`/`text-brand` (see `KpiCard.tsx` `TONE_ACCENT`). For the dyspozytor strip we deliberately **do not use `tone="purple"`**: the two totals tiles (AUTA, NACZEPY) use `tone="neutral"` so they read as inert counts, leaving the brand-red accent unused on this strip and reserving the three semantic colours (green/orange/blue, + red for the optional inactive tile) for the operationally meaningful buckets. Rationale: a dispatcher scans for *problems* (idle, inactive) and *capacity* (driving) — colour should encode operational state, not totals. The opieka strip uses `tone="purple"`→brand for its "carriers" total tile; dyspozytor diverges to `neutral` because there is no single hero-count here and a brand-red total would compete with the warning/danger signals that matter. This is an intentional, scoped deviation — no token change.

**Tabs** (order, matching `dyspozytor-fleet.png`): **Auta** / **Delegacje** / **Kierowcy** / **Naczepy**. (Legacy labels the delegations tab «Wyjazdy»; standardize on **«Delegacje»** to match the domain term used elsewhere in the app — keep «Wyjazdy» only if i18n already ships it, otherwise add «Delegacje».)

- **Auta / Kierowcy / Naczepy** — identical column sets to the planista variant (6.3.2). Reuse the same sub-table components; do not duplicate column definitions. (The legacy dyspozytor "Moje auta" table also shows `NR BOCZNY`, `TYP`, `PLANISTA`, and a `STAWKI €/km` quad — these are optional enrichments; include `PLANISTA` and `TYP` if the DTO carries them, but keep the read-only quad-rate column out unless the dispatcher genuinely needs it, to avoid a cramped table.)
- **Delegacje** (read-only) — the dispatcher's delegation list. Columns (read-only subset; no status-change control — that is weryfikator/Phase 7):

| Column id | Header (PL) | Cell |
|---|---|---|
| `vehicle` | AUTO | `font-mono font-semibold` plate (+ `sideNumber` muted if present) |
| `driver` | KIEROWCA | `font-semibold` driver name or `—` |
| `route` | TRASA | origin → destination string, `truncate` |
| `period` | OKRES | start–end date range, `tabular-nums` |
| `status` | STATUS | read-only `<StatusBadge>` (static indicator, no dropdown). Map delegation status to the existing semantic badge variants — **no new variants** |

  Empty state — title «Brak delegacji» / message «Brak aktywnych delegacji do wyświetlenia.» (EN: «No delegations», «No active delegations to display.»), icon `Route` or `MapPin`.

**`stojące > 7 dni` highlight treatment.** The legacy screen renders an amber sub-list of vehicle chips under the KPI strip («Auta stojące dłużej niż 7 dni: [WND10UH — 14 dni] [XCV2342 — 12 dni]»). Reproduce as a **warning-toned sub-list**, composed from existing tokens (no new token), shown **only when the count > 0**, between the KPI strip and the `<Tabs>`:

```
<div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
  <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
    <AlertTriangle size={15} /> {t('idleTitle')}      {/* «Auta stojące dłużej niż 7 dni:» */}
  </p>
  <ul className="mt-2 flex flex-wrap gap-1.5">
    {idle.map(v => (
      <li key={v.id}>
        <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
          <span className="font-mono">{v.plate}</span>
          <span className="text-text-sub">· {v.days} {t('daysShort')}</span>
        </span>
      </li>
    ))}
  </ul>
</div>
```

Notes: `bg-warning/10` + `border-warning/40` are token-with-opacity, **not** new tokens. Each chip is `bg-card` (a white chip on the soft warning panel reads as a token, consistent with the §5 MultiSelect chip pattern). Chips are **inert** (read-only — no remove `<X>`, no click). The whole block is conditional on `idle.length > 0`; when zero, render nothing (the STOJĄ >7 DNI KPI tile already shows `0`). Colour is not the only signal — the leading `<AlertTriangle>` icon + the explicit "X dni" text carry the meaning for colour-blind users.

> ⚠️ **SUPERSEDED by §6.3.6 (2026-07-23 — DELEGATION-driven vehicle status).** The `jezdzace / stojace > 7 dni / nieaktywne` buckets in 6.3.3 above and the `stojące > 7 dni` amber sub-list are **km/`lastDroveAt`-driven** and are **removed**. The new operational status is computed from **delegations**, not mileage, and has **five** states. The KPI-strip tile set, tones, labels and StatusBadge mapping are all redefined in **§6.3.6** — read it as the authoritative replacement for the 6.3.3 bucket table. The idle sub-list pattern (warning-toned inert chips) MAY be reused verbatim, but keyed on the new `do_usuniecia` state (see §6.3.6).

### 6.3.6 Vehicle operational status — DELEGATION-driven (AUTHORITATIVE, 2026-07-23)

> **Supersedes** the km/`lastDroveAt` buckets everywhere: dyspozytor/planista KPI strip (§6.3.3), opiekun card stat-row (§5.2.3), carrier fleet KPI strip (§Carrier fleet panel), and the standalone `Aktywne / Nieaktywne` active-flag STATUS badge in every fleet `<DataTable>` (§6.3.2, §6.3.3, Carrier «Auta» table). **Kill the old vocabulary** (`jeżdżące`, `stojące > 7 dni`, and the `active=false → "Nieaktywne"` badge). One computed status field per live vehicle, five values, resolved at read time by the API.

#### The five status keys (fixed by the API — labels map to these keys 1:1; keys are never renamed)

| Key (API, immutable) | Meaning (read-time) | Idle clock |
|---|---|---|
| `aktywna` | Has a **non-terminal delegation** (`zgłoszony` / `gotowy` / `w_trasie`) — "in play". | — (working) |
| `stojaca` | **No** active delegation; **0–14** calendar days since it returned (`actualReturnAt` of last `zjechał`, else `createdAt`). Normal turnaround, no concern. | 0–14 d |
| `nieaktywna` | **15–28** calendar days since return. Idle long enough to watch. | 15–28 d |
| `do_usuniecia` | **≥ 29** calendar days since return. Removal-eligible; system e-mails all admins every 3 days to retire it. | ≥ 29 d |
| `wylaczona` | **Manually deactivated** (`Vehicle.active = false`). Admin/opiekun-set, **orthogonal** — excluded from the idle clock; overrides whatever the clock would say. | off the clock |

#### Labels — PL (default) + EN

Per-row **StatusBadge** uses the singular status-name (matches the feminine API keys 1:1); count **KPI tiles** use the neuter-plural collective (agrees with «auta»). Both are documented so i18n carries the two forms.

| Key | Badge PL (singular) | Badge EN | KPI tile PL (plural) | KPI tile EN | i18n key stem |
|---|---|---|---|---|---|
| `aktywna` | **Aktywna** | **Active** | AKTYWNE | Active | `vehicleStatus.aktywna` |
| `stojaca` | **Stojąca** | **Parked** | STOJĄCE | Parked | `vehicleStatus.stojaca` |
| `nieaktywna` | **Długo stojąca** | **Long idle** | DŁUGO STOJĄCE | Long idle | `vehicleStatus.nieaktywna` |
| `do_usuniecia` | **Do usunięcia** | **To remove** | DO USUNIĘCIA | To remove | `vehicleStatus.do_usuniecia` |
| `wylaczona` | **Wyłączona** | **Disabled** | WYŁĄCZONE | Disabled | `vehicleStatus.wylaczona` |

i18n key stem = `vehicleStatus.<key>.badge` (singular) + `vehicleStatus.<key>.tile` (plural) + `vehicleStatus.<key>.tooltip` (see below). Same stem for `messages/pl.json` + `en.json`.

**Naming-collision resolution (deliberate, non-negotiable):**
- **`stojaca` ≠ old `stojące`.** The old `stojące` was an *amber warning* ("idle > 7 days by mileage") — it is **removed**. The new `stojaca` (0–14 days since return) is **NEUTRAL / calm** and rendered in a **slate** tone, never amber. The amber-warning semantics of the old word migrate to the **visibly different** word **«Długo stojąca»** (`nieaktywna`), so any user who remembers "amber = idle too long" still finds that meaning — just under a new, clearly-escalated label — and the neutral «Stojąca» cannot be mistaken for a warning because it is grey, not amber.
- **`nieaktywna` label is NOT «Nieaktywna».** The old `active=false` state used the badge «Nieaktywne»; that word is **retired as a status label** to avoid resurrecting the "switched-off" meaning. The 15–28-day idle state is labelled **«Długo stojąca / Long idle»** (a clear escalation of «Stojąca»), and the manual off-switch (`active=false`) is now **«Wyłączona / Disabled»** (`wylaczona`). No visible label reuses a word with a changed meaning.
- **Severity ramp reads word-first, not colour-first:** «Aktywna» (working) → «Stojąca» (just parked) → «Długo stojąca» (parked too long) → «Do usunięcia» (retire it) → «Wyłączona» (switched off, off-ramp). The «Stojąca → Długo stojąca» pair encodes the escalation lexically; colour only reinforces it.

#### StatusBadge — tone / token / icon map (`<VehicleStatusBadge>`)

New thin wrapper `<VehicleStatusBadge status={VehicleStatusKey}>` — sibling of the existing claim/delegation `<StatusBadge>` (§`<StatusBadge>`), composing the **same** `<Badge>` primitive and the **same** anatomy: `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap`. **Zero new palette tokens** — every class below is an existing semantic token (or an existing token at reduced opacity), matching the claim status-map recipe (`bg-*/15 text-* border-*/30`).

| Key | Tone name | Badge classes (light+dark auto via semantic tokens) | Lucide icon (12px) | Meaning-without-colour cue |
|---|---|---|---|---|
| `aktywna` | success (green) | `bg-success/15 text-success border-success/30` | `<Truck />` | truck (on the road) + green |
| `stojaca` | **neutral (slate)** | `bg-input text-text-sub border-border` (solid soft chip) | `<CircleParking />` | parking icon (calmly parked) |
| `nieaktywna` | warning (amber) | `bg-warning/15 text-warning border-warning/30` | `<PauseCircle />` | pause icon (stalled) + amber |
| `do_usuniecia` | danger (red) | `bg-danger/15 text-danger border-danger/30` | `<Trash2 />` | trash icon (retire) + red |
| `wylaczona` | **muted / off** | `bg-transparent text-text-sub border-dashed border-border` (hollow, dashed) | `<PowerOff />` | power-off icon + **dashed hollow** border |

- **Two grey states, three differentiation channels.** `stojaca` (neutral) and `wylaczona` (muted) are both grey-family per the requested ramp, so they are separated on **three** channels that never rely on hue: (1) **fill** — `stojaca` is a *solid* `bg-input` chip, `wylaczona` is *transparent*; (2) **border** — `stojaca` is *solid* `border-border`, `wylaczona` is *dashed*; (3) **icon** — `CircleParking` vs `PowerOff`. The dashed hollow "switched-off" chip reads unmistakably as manual deactivation, distinct from the solid "parked-and-resting" chip.
- **Tooltip (all five)** — `vehicleStatus.<key>.tooltip`, carries the exact day window so the meaning is explicit for SR / colour-blind users, e.g. `stojaca` → «Wróciła ≤ 14 dni temu» / "Returned ≤ 14 days ago"; `nieaktywna` → «Stoi 15–28 dni» / "Idle 15–28 days"; `do_usuniecia` → «Stoi ≥ 29 dni — do wycofania» / "Idle ≥ 29 days — retire"; `aktywna` → «Ma aktywną delegację» / "Has an active delegation"; `wylaczona` → «Wyłączona ręcznie przez administratora» / "Manually disabled by an administrator". Each badge is `<span role="img" aria-label={tooltip}>` (icon + text + accessible name), so colour is never the sole carrier of meaning (DS a11y rule).
- **Placement:** replaces the `STATUS` column badge in every fleet `<DataTable>` (planista §6.3.2, dyspozytor §6.3.3, carrier «Auta», opiekun drill-down, admin vehicles), the km-board row status, and the vehicle detail modal header. The old `active ? "Aktywne" : "Nieaktywne"` badge is **deleted** — `active=false` now surfaces as `wylaczona`.

#### KPI-strip tile set + tone map (dyspozytor / planista / carrier / opiekun fleet panels)

Replaces the old strip (`liczbaAut / jeżdżące / stojące>7dni / kierowcy / naczepy`). The **hero strip is the five-state vehicle ramp**; drivers/trailers are inert resource counts and move to the read-only info-banner sub-line (as the legacy dyspozytor banner already does: «Obsługujesz 7 aut … 4 kierowców, 3 naczep»). Composed entirely of the existing `<KpiCard>` — **no new card component, no `tone="purple"`** (§6.3.3 deviation stands).

**Primary strip — 5 tiles** (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6`):

| Tile | Label PL | Label EN | Count source | `KpiCard tone` | Accent token | Lucide icon |
|---|---|---|---|---|---|---|
| Total (enabled) | AUTA | Vehicles | `aktywne + stojące + nieaktywne + doUsuniecia` | `neutral` | `text-text-sub` | `Truck` |
| Active | AKTYWNE | Active | `aktywna` count | `green` | `text-success` | `Truck` |
| Parked | STOJĄCE | Parked | `stojaca` count | `neutral` | `text-text-sub` | `CircleParking` |
| Long idle | DŁUGO STOJĄCE | Long idle | `nieaktywna` count | `orange` | `text-warning` | `PauseCircle` |
| To remove | DO USUNIĘCIA | To remove | `do_usuniecia` count | `red` | `text-danger` | `Trash2` |

- **The four idle-clock buckets partition the *enabled* fleet** (`active=true`): `aktywne + stojące + nieaktywne + doUsuniecia = AUTA (total)`. This clean sum is intentional — the strip reads as a whole split into parts. `wylaczona` vehicles are **excluded** from the clock and from these four counts.
- **Two neutral tiles by design.** `AUTA` (total) and `STOJĄCE` (calm) are both `neutral`; only the *problem* states pop — `DŁUGO STOJĄCE` amber, `DO USUNIĘCIA` red, `AKTYWNE` green (capacity). A dispatcher scans for problems and capacity, not for totals (same rationale as the §6.3.3 no-purple deviation).
- **`wylaczona` tile — optional 6th, muted.** For surfaces that manage the off-switch (admin / opiekun), append a 6th `neutral`-toned tile `WYŁĄCZONE / Disabled` (`wylaczona` count, icon `PowerOff`) and switch the grid to `lg:grid-cols-6` (same breakpoint family). On the dyspozytor/planista/carrier read-only strips it is **omitted** (they don't act on it); the count still appears in the banner sub-line if needed.
- **Drivers / trailers** (`KIEROWCY / NACZEPY`) — **not** in the hero strip. Render as an inert count line inside the read-only info banner: «… obsługujesz **{k}** kierowców · **{n}** naczep» (EN: "… **{k}** drivers · **{n}** trailers"). If a team insists on tiles, append them AFTER the 5 status tiles as `blue` (KIEROWCY, `text-info`, `User`) + `neutral` (NACZEPY, `text-text-sub`, `Container`) and use `lg:grid-cols-7` — but the recommended layout keeps the strip a focused 5-state ramp.

**`do_usuniecia` highlight sub-list** — reuse the §6.3.3 warning-toned inert-chip block verbatim, **re-keyed to `do_usuniecia`** (the removal-eligible set), between the strip and the `<Tabs>`, conditional on count > 0. Copy: «Auta do usunięcia (stoją ≥ 29 dni):» + chips `{plate} · {days} dni`. Use `border-danger/40 bg-danger/10` + leading `<Trash2 size={15} className="text-danger" />` (token-with-opacity, no new token) instead of the amber warning tone — this is the genuine "act now" set. (An optional secondary amber block for `nieaktywna` may reuse the original `border-warning/40 bg-warning/10` treatment if the panel wants a two-tier watchlist.)

#### opiekun card stat-row (§5.2.3) — new mapping

The opiekun `<OpiekunCarrierCard>` stat-row (§5.2.4) switches from the 4 km-buckets to the **4 idle-clock states** (drop `potencjalne`; `wylaczona` is not shown on the opiekun card — it is orthogonal and rare, surfaced only in the drill-down table badge):

| Cell | Key | Label PL (short) | Tone | Token |
|---|---|---|---|---|
| 1 | `aktywna` | Aktyw. | success | `text-success` |
| 2 | `stojaca` | Stoj. | **neutral** | `text-text-sub` |
| 3 | `nieaktywna` | Dł. stoj. | warning | `text-warning` |
| 4 | `do_usuniecia` | Do usun. | danger | `text-danger` |

Note the cell-2 tone change: `stojaca` is now **neutral `text-text-sub`** (calm), not amber — the amber slot moves to cell 3 (`nieaktywna`). This keeps the card's vertical colour story aligned with the KPI strip above it (§5.2.3 principle).

#### Migration summary for web + api agents

- **api-agent:** the fleet stats payload changes from `{ liczbaAut, jezdzace, stojace, nieaktywne }` to `{ total, aktywna, stojaca, nieaktywna, do_usuniecia, wylaczona }` (drivers/trailers counts stay). Per-vehicle DTO gains a computed `status: VehicleStatusKey`. Enum lives in `packages/shared` as `VEHICLE_STATUS = ['aktywna','stojaca','nieaktywna','do_usuniecia','wylaczona'] as const`.
- **web-agent:** add `<VehicleStatusBadge>` (map above) beside the existing `<StatusBadge>`; retire the `Aktywne/Nieaktywne` active-flag badge from all fleet tables; rewire the KPI strips (§6.3.3, carrier fleet, opiekun) and the opiekun stat-row to the tables above; add `vehicleStatus.*` i18n keys (badge + tile + tooltip, PL+EN). **Zero new palette tokens, zero `tailwind.config` / `globals.css` changes** (a thin `neutral` Badge treatment composes `bg-input`/`text-text-sub`/`border-border`; `wylaczona` composes `border-dashed`/`bg-transparent`).

### 6.3.4 Components / shared changes summary (Phase 6.3)

| Change | Where | Notes |
|---|---|---|
| New `<PlanistaPanel>` page | `apps/web/app/(planista)/…/page.tsx` (web-agent decides route) inside `RoleShell` | Heading + read-only banner + 3-tab `<Tabs>` over `<DataTable>`. |
| New `<DyspozytorPanel>` page | `apps/web/app/(dyspozytor)/…/page.tsx` inside `RoleShell` | Heading + read-only banner + `<KpiCard>` strip + idle sub-list + 4-tab `<Tabs>` (incl. Delegacje). |
| Reuse `<KpiCard>` | `components/dashboard/KpiCard.tsx` | No changes. `tone` from the 6.3.3 mapping; **never** `purple` here. |
| Reuse `<DataTable>` / `<EmptyState>` / `<Tabs>` / `<StatusBadge>` / `<Badge>` | existing | Read-only column sets per 6.3.2 / 6.3.3; mirror the opieka drill-down sub-tables. |
| New read-only sub-table components | colocated with the panel pages | `VehiclesTable` / `DriversTable` / `TrailersTable` / `DelegacjeTable` — same shape as the opieka drill-down sub-tables (no edit/delete columns). Consider lifting the opieka sub-tables into a shared `components/fleet/` module so planista + dyspozytor + opieka share one definition. |
| i18n | `messages/pl.json`, `en.json` | Panel titles/subtitles, read-only banner copy, tab labels (incl. «Delegacje»), idle sub-list copy (`idleTitle`, `daysShort`), per-tab empty-state titles/messages. |
| **0** changes to `tailwind.config.ts` / `globals.css` | — | All tokens used (`bg-card`, `bg-input`, `bg-bg`, `border-border`, `text-success/warning/danger/info/text-sub`, `bg-warning/10`, `border-warning/40`, brand active-tab) already exist. |

### 6.3.5 Acceptance checklist (planista + dyspozytor panels)

- [ ] **Read-only enforced.** No action buttons, no kebab column, no inline-edit cell, no status-change control anywhere in either panel; delegation rows render a **static** `<StatusBadge>` (no dropdown). Read-only info banner present and non-dismissible on both panels.
- [ ] **Empty states present.** Every tab's `<DataTable>` has an `<EmptyState>` empty slot with the role-appropriate copy (6.3.2 / 6.3.3); verified by viewing a tab with zero rows.
- [ ] **KPI strip (dyspozytor).** Five (or six) `<KpiCard>` tiles map each bucket to the 6.3.3 tone; **`tone="purple"` is not used**; totals tiles are `neutral`. Responsive grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (or `-6`) with **no horizontal scroll** at 320 / 360 / 640 / 1024 / 1280 / 1536 / 1920 px.
- [ ] **Idle (>7 dni) highlight.** Warning-toned sub-list renders only when count > 0, uses `bg-warning/10` + `border-warning/40` (token-with-opacity, no new token), chips are inert, and the meaning is carried by icon + "X dni" text — not colour alone.
- [ ] **Token policy respected.** Zero changes to `tailwind.config.ts` / `globals.css`; no `bg-bg-soft`; soft surfaces are `bg-input` only; semantic colour only from existing `text-/bg-` semantic tokens.
- [ ] **Tabs keyboard-accessible.** `<TabsList>` has an `aria-label`; arrow-key navigation between triggers works; active tab uses the brand-red `data-state=active` style; focus ring visible.
- [ ] **Dark-mode verified.** Both panels — banner (`bg-input`), KPI tiles (`bg-card`), DataTable header (`bg-bg`), idle sub-list (`bg-warning/10` + `bg-card` chips), badges, and tab bar — legible with no hacks (tokens / `dark:` variants only).
- [ ] **Container width.** Page uses the 4.4 strip `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`; tables do not stretch edge-to-edge on ultra-wide.

## Phase 6.4 — Read-only fleet detail modals + clickable rows (planista / dyspozytor)

> **Scope (improvement pass on the completed Phase 6.3 panels).** Three deliverables:
> 1. **Delegation detail modal redesign** — the "route-card" layout (§6.4.1).
> 2. **Read-only vehicle / driver / trailer detail modals** for the planista + dyspozytor fleet tabs, with the exact curated field set that defines the `/fleet/*` list-item API contract (§6.4.2).
> 3. **Clickable-row affordance** for the read-only fleet tables + the Wyjazdy/Delegacje table (§6.4.3).
>
> **No new tokens** (4.4 surface-token policy holds). Everything composes from `bg-card` / `bg-input` / `bg-bg`, the semantic accent tokens (`text-success/warning/danger/info/text-sub/brand`), the existing radius scale, `shadow-modal`, `shadow-card`, and the brand palette with opacity (`/10`, `/40`, `/60`). Read-only everywhere: the only footer action is «Zamknij».

### 6.4.1 Delegation detail modal — the "route-card" layout

**Recommendation (EntityDetailModal vs bespoke): keep `EntityDetailModal`, add ONE full-width custom body section.** Do **not** fork a bespoke `DelegationDetailModal` shell. Rationale:

- The generic shell already gives us, for free, everything the new design needs: the 3-zone flex column (pinned header / scroll body / pinned footer), the title + badge-row header, the read-only footer with the meta line + «Zamknij» only (no `onEdit` ⇒ no «Edytuj», §6.6), focus-trap, Escape, scroll-lock, `animate-modal-in`, `shadow-modal`.
- The §6.20 `fullWidth` row + §6.4 `span: 'full'` pattern is **exactly** the escape hatch for "embedded non-label/value block inside an `EntityDetailModal`" (its canonical use is the `<BreakdownTable>` in `ClaimDetailModal`). The route card is just another such block — a `<RouteCard>` rendered as the value of a single `fullWidth` row in a `span: 'full'` section. This is a documented, supported composition, **not** a workaround.
- Forking a bespoke centered `<Dialog>` would duplicate the header/footer/scroll/a11y plumbing and create a second surface that drifts from the locked §6.0 read-only-`Dialog` contract. Reject it.

So `DelegationDetailModal.tsx` stays a thin wrapper over `<EntityDetailModal>`; the only new artefact is a presentational **`<RouteCard>`** component (new entry in the catalogue, §6.4.4) and a small **`<DriverVehicleRow>`** strip (may live inline in the wrapper — not catalogue-worthy).

**Header change (required).** The header currently renders the driver name as the subtitle. **Remove it.** The new header carries **only**:
- **Title** = `vehicle.plateNumber` (kept `font-mono`, the existing treatment).
- **Badge row** = the `<StatusBadge status={delegation.status} />` (unchanged).
- **Subtitle** = **omitted** (`subtitle={undefined}`). The driver moves into the body (see «Driver + vehicle» strip). Per §6.3 the shell drops the subtitle line entirely when none is passed — no empty gutter.

**Body — blocks, top to bottom** *(updated 2026-07-17 — «Stawki» strip inserted between the RouteCard and the driver/vehicle strip; documented order: Trasa → Stawki → Pojazd i kierowca → Historia statusu → Notatki → km-calendar §7.7.9 → ZESPÓŁ PROWADZĄCY §7.9.7)***:**

```
┌─ body (single full-width column — see "span" note) ────────────────────────┐
│                                                                            │
│  ╭─ RouteCard (section A, span:'full', fullWidth row) ──────────────────╮  │
│  │                                                                      │  │
│  │   ( DE )  ───────  🚚  [ 4 dni · plan. ]  ───────►  ( PL )           │  │
│  │   Wyjazd                                              Powrót          │  │
│  │   zgł.  12.03, 08:00        (duration pill on       plan.  16.03.2025 │  │
│  │   fakt. 13.03  ◀actual      the connector)          fakt.  18.03.2025 │  │
│  │   kod: 40-001                                        kod: 00-950      │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ STAWKI («Stawki», span:'full', 4-up tile strip — new 2026-07-17) ───╮  │
│  │   STAWKA DE    STAWKA UE    STAWKA EKSPORT    STAWKA IMPORT           │  │
│  │   … €          … €          … €               … €   (— for null)      │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ Driver + vehicle strip (section B, span:'full', fullWidth row) ─────╮  │
│  │   (avatar) Jan Kowalski            │  NR REJ.  WGM 1234              │  │
│  │           +48 600 000 000          │  Naczepa  WGM 5678N            │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ HISTORIA STATUSU (section C, audit-chain — §6.4.1a) ────────────────╮  │
│  │   ● Zgłoszony przez        Jan (przewoźnik)      12.03.2025, 08:00    │  │
│  │   ● Zaakceptowany (eksport)       Anna (eksport)        12.03.2025, 14:20    │  │
│  │   ● Potwierdzony w trasie  Piotr (weryfikator)   13.03.2025, 06:05    │  │
│  │   ── utworzono … · zaktualizowano … (subtle footer) ──                │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ NOTATKI (section D, long-text, only if notes present) ──────────────╮  │
│  │   …  (fullWidth row, §6.20 long-text)                                 │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
└────────────────────────────────────────────────────────────────────────────┘
   Footer:  Utworzono {createdAt} · Zaktualizowano {updatedAt}   [ Zamknij ]
```

> **⚠️ Redesign 2026-07-07 (this section supersedes the flat «STATUS I AUDYT» `<dl>` below).** The old Block C mixed one operational date (`actualReturnAt`) with identity/audit stamps in one undifferentiated list, hid the newly-added `actualDepartureAt` entirely, and rendered the **eksport** `readyBy/At` stamp under a «Zweryfikowany» (verified) label while the **true** weryfikator `verifiedBy/At` stamp was never shown — overloading "verification". The concerns are now split cleanly into **(A) an operational timeline folded into the RouteCard** (reported-vs-actual on each end) and **(B) an honest audit chain** (§6.4.1a). See §6.4.1a for the full grouping, empty-state rules, corrected actor labels, and copy table. The tables headed «Block C — STATUS I AUDYT» below are the *old* layout and are retained only as change-history context — implement §6.4.1a.

**Section span decision.** All three sections are `span: 'full'` so the modal body is a single column (the route card and the driver/vehicle strip are inherently wide; pairing them into the lg 2-column grid would crush the route connector). This means the modal does **not** need the wide `max-w-5xl` of the dense vehicle modal — pass `className="max-w-[820px]"` on `<EntityDetailModal>` to override it, because a single-column route view reads better narrower than the wide variant (which exists for the 2-column field grids; this modal has no grid). ~820px (≈ +22% over the base 2xl/672px) gives the reported-vs-actual date pairs and the audit stepper room to breathe without becoming a dense grid width. This is a per-consumer className override of the geometry (§6.2 already establishes width is set via the `className` prop), **not** a token change.

**Block A — `<RouteCard>` (new component, §6.4.4).** A three-zone horizontal composition inside one `rounded-xl border border-border/60 bg-card p-5` card (matches the §6.4 section-card recipe — no tint, no extra shadow):

| Zone | Content | Spec |
|---|---|---|
| **Departure (left)** | Country "circle" + label «Wyjazd» + **reported / actual date pair** + postal | Circle: `inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-input text-sm font-bold text-text` showing the **ISO country code** (`departureCountry`, e.g. `DE`). Under it: `text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub` = «Wyjazd»; then the **reported-vs-actual date pair** (see §6.4.1a "reported-vs-actual pair" recipe): reported `departureAt` (date + time, since it is a datetime — `formatDateTime`) prefixed «zgł.», and — **only once present** — actual `actualDepartureAt` prefixed «fakt.» rendered **date-only** (`formatDateFull` — it is UTC-midnight date-only, see the ⚠️ helper note in §6.4.1a); then `text-xs text-text-sub` = «kod: {departurePostalCode}» mono. |
| **Connector (center)** | Arrow line + truck icon + duration pill | A horizontal connector: `flex-1` with a hairline rule (`h-px bg-border` or `border-t border-border`) running behind a centered cluster. Cluster = Lucide `<Truck size={18} className="text-text-sub" />` + the **duration pill**. End the line with a Lucide `<ChevronRight>` / arrowhead pointing at the return circle. On narrow widths the connector rotates to vertical (see responsive). |
| **Return (right)** | Country circle + label «Powrót» + **planned / actual date pair** + postal | Circle same recipe, code = `returnCountry`. Label «Powrót». The **planned-vs-actual date pair** (same recipe): planned `plannedReturnAt` (date-only — `@db.Date` — `formatDateFull`) prefixed «plan.»; and — **only once present** — actual `actualReturnAt` prefixed «fakt.» rendered **date-only** (`formatDateFull` — UTC-midnight date-only). Postal: `text-xs text-text-sub` = «kod: {returnPostalCode}» mono. |

> **Reported-vs-actual folded back into `<RouteCard>` (redesign 2026-07-07, supersedes the 2026-06-16 «faktyczny line removed» decision).** The actual dates are **back in `<RouteCard>`, on both ends**, next to their reported/planned counterparts — this is the "make the reported-vs-actual distinction visually obvious" requirement, and it keeps operational dates OUT of the audit chain (§6.4.1a). The 2026-06-16 removal was rejected because it (a) hid the new `actualDepartureAt` and (b) left `actualReturnAt` orphaned in the audit `<dl>` where it read as an audit stamp, not a trip fact. The old "permanent «faktyczny: —»" complaint is solved by the **per-line empty rule** (§6.4.1a): the «fakt.» sub-line is **omitted entirely when its value is `null`**, not rendered as an em-dash — so an in-flight trip simply shows «zgł.» + «plan.» with no dangling actual lines, and the actual lines *appear* as the lifecycle advances (`actualDepartureAt` on `w_trasie`, `actualReturnAt` on `zjechal`). The reported/planned lines are **always** shown. `actualReturnAt` and `actualDepartureAt` both remain on the wire (`DelegationDto` unchanged — DTO already carries both). New i18n keys `routeCard.reportedPrefix` / `routeCard.actualPrefix` replace the deleted `actualPrefix`; `plannedPrefix` stays (relabelled value «plan.»).

**Duration pill** — `inline-flex items-center gap-1 rounded-full border border-border bg-input px-2.5 py-0.5 text-xs font-medium text-text-sub` with the text «{n} dni · plan.». `n` = **whole-day count between `departureAt` and `plannedReturnAt`**, computed date-only: `differenceInCalendarDays(plannedReturnAt, departureAt.slice(0,10))` (drop the time portion of `departureAt`, exactly mirroring the zod cross-field validation at `delegations.ts:113`). Pluralize via the existing PL plural i18n (`1 dzień` / `2–4 dni` / `5+ dni`) — add `delegations.routeCard.durationDays` ICU plural; the `· plan.` suffix marks it as the *planned* span (so it never reads as actual elapsed time). Guard `n >= 0` (the zod schema already forbids `plannedReturnAt < departureAt`); if for any reason the pill would be negative, render «— · plan.».

> **2026-07-17 — «Stawki» block added to the delegation detail modal.** A rates strip joins `DelegationDetailModal` (§6.4.1 / §6.4.1a), positioned **between Block A «Trasa» (`<RouteCard>`) and the «Pojazd i kierowca» driver+vehicle strip (Block B)**. Documented block order becomes: Trasa → **Stawki** → Pojazd i kierowca → Historia statusu → Notatki → km-calendar (§7.7.9) → ZESPÓŁ PROWADZĄCY (§7.9.7). Per the doc's own insertion convention (cf. the km-calendar §7.7.9 and «ZESPÓŁ PROWADZĄCY» §7.9.7 inserts) the existing A/B/C/D block letters are **not** renumbered — «Stawki» is a positional `span:'full'` block referenced by name. It reuses the §6.15 vehicle «Stawki» presentation (icon + i18n) on the delegation surface with the **same dyspozytor exclusion, but server-scrubbed** (see the two-layer rule below and the §6.4.2 cross-reference).

**«Stawki» block (delegation vehicle rates — 2026-07-17).** The four vehicle guarantee rates, resolved **LIVE** off the delegation's vehicle — Stawka DE → `vehicle.rateDe`, Stawka UE → `vehicle.rateUe`, Stawka eksport → `vehicle.rateExport`, Stawka import → `vehicle.rateImport`:

| Aspect | Spec |
|---|---|
| **Section** | `span:'full'`, icon `<Banknote>` (identical to the §6.15 / §6.15 «Stawki» section), header reuses `vehicles.sections.rates` → «Stawki». |
| **Content** | The four rates above, EUR-formatted via `formatEur`; em-dash for `null` (§6.5); `tabular-nums`. |
| **Presentation** | A single `fullWidth` row (§6.20 escape hatch — the same mechanism the `<RouteCard>` and the km-calendar §7.7.9 use) holding a **4-up tile strip** — `grid grid-cols-2 gap-4 sm:grid-cols-4` (`gap-4` matches the sibling driver+vehicle strip in the same modal). Each tile = the §6.4.1 mini uppercase caption (`text-[11px] uppercase tracking-[0.08em] text-text-sub` — the same strip-label treatment as the route-card sub-labels) over the EUR value (`text-sm font-semibold text-text tabular-nums`). |
| **i18n** | Reuse `vehicles.sections.rates` (header) + `vehicles.fields.{rateDe,rateUe,rateExport,rateImport}` (captions). **No new keys.** |
| **Visibility** | Shown to **every** role that opens the delegation modal **except `dyspozytor`** — i.e. admin, planista (rates-visible since 2026-06-26, §6.4.2 / §6.15), przewoźnik (only ever reads own delegations ⇒ own vehicle's rates, consistent with the §6.15 carrier-sees-own-«Stawki» rule), eksport, weryfikator, opiekun. |
| **Dyspozytor — two-layer** | The **UI omits** the block for `dyspozytor` **and** the **API scrubs** `rateDe`/`rateUe`/`rateExport`/`rateImport` to `null` in the delegation payload (the delegation vehicle mini). This is deliberately **STRONGER** than the §6.4.2 UI-only exclusion precedent on `VehicleDto` (the known "getById is not scoped" IDOR gap): for the delegation endpoint **the wire matches visibility** — dyspozytor never receives the values. |
| **Empty-state** | Omit the block **entirely** when the delegation has **no resolvable vehicle** OR **all four rates are `null`** (per the §6.4 "empty section omitted" rule). Because the dyspozytor scrub nulls all four, this rule **auto-omits** the block for dyspozytor even if the UI role-gate ever failed — a third safety net. |

**Block B — Driver + vehicle strip.** A single `rounded-xl border border-border/60 bg-card p-5` card split into two halves on `sm+` (`grid grid-cols-1 sm:grid-cols-2 gap-4`), stacked on phones:

- **Driver half:** a small avatar circle (`inline-flex h-9 w-9 items-center justify-center rounded-full bg-input text-text-sub` with a Lucide `<User size={18} />` — **no** photo, no initials needed) + a two-line stack: name `text-sm font-semibold text-text` (`driver.firstName + lastName` ?? `driverNameSnapshot`, em-dash if both null) and phone `text-xs text-text-sub font-mono` (`driverPhoneSnapshot`, em-dash if null). This is where the driver name + phone live now (moved out of the header).
- **Vehicle half:** a compact label/value pair set — «NR REJ.» → `vehicle.plateNumber` (`font-mono font-semibold`); «Naczepa» → `trailer.plateNumber` rendered as the connected string «Naczepa {plate}» (`font-mono`, em-dash → «Naczepa —» if no trailer). Use the same `text-[11px] uppercase tracking-[0.08em] text-text-sub` mini-label treatment as the route-card sub-labels for visual consistency.

**Block C — «STATUS I AUDYT» section (OLD LAYOUT — superseded by §6.4.1a).** A normal `<EntityDetailSection>` (NOT custom) — reuses the standard label/value `<dl>` rows (§6.5), so all the system/audit fields keep their proven rendering:

| Row | Field | Formatter |
|---|---|---|
| Zgłoszone przez | `reportedBy?.name ?? reportedBy?.login` | `textValue` |
| Zgłoszono | `reportedAt` | `dateTimeValue` |
| Zweryfikowane przez | `verifiedBy?.name ?? verifiedBy?.login` | `textValue` |
| Zweryfikowano | `verifiedAt` | `dateTimeValue` |
| Notatki | `notes` | `textValue`, **`fullWidth: true`** (§6.20 — long free-text spans the section, no label gutter; the sr-only `<dt>` keeps the «Notatki» label for SR users, and a visible inline caption is acceptable) |

Section header: icon `<ClipboardCheck>` (or keep `<Info>`), label «STATUS I AUDYT». `span: 'full'`.

> ⚠️ The table above is the **old** Block C and is **superseded by §6.4.1a**. It is kept only for change-history. Implement §6.4.1a: the operational actuals fold into the RouteCard (Block A, above), the audit stamps become an honest chain (Block C), the eksport stamp gets its own honest label, the true `verifiedBy/At` weryfikator stamp is surfaced, and «Notatki» becomes its own Block D.

> **Block D — «ZESPÓŁ PROWADZĄCY» (Phase 11, §7.9.7).** A further `span:'full'` `fullWidth` block **below**
> «STATUS I AUDYT» (and below the §7.7.9 km-calendar if present), header «ZESPÓŁ PROWADZĄCY» (`<Users>`),
> rendering `<TeamMembers variant="list" size="md">` from the **current** `Vehicle.dispatchTeam` (live by
> `vehicleId`, **not** a delegation-time snapshot). Label mirrors the Google Chat trip-notification heading.
> Omitted when no vehicle; amber «Brak zespołu prowadzącego» when the vehicle has no team. Full spec: §7.9.7.

**All fields accounted for (no field dropped) — updated for the §6.4.1a redesign.** Mapping of the `DelegationDto` fields to the new layout:
- Header: `vehicle.plateNumber` (title), `status` (badge).
- Route card (Block A): `departureAt` (reported) + **`actualDepartureAt` (actual, NEW)**; `departureCountry`, `departurePostalCode`; `plannedReturnAt` (planned) + `actualReturnAt` (actual); `returnCountry`, `returnPostalCode` (+ the derived duration pill).
- «Stawki» block (2026-07-17): `vehicle.rateDe` / `vehicle.rateUe` / `vehicle.rateExport` / `vehicle.rateImport` (live off the delegation's vehicle; **dyspozytor-scrubbed to `null` server-side** — see the §6.4.1 «Stawki» block spec above).
- Driver/vehicle strip (Block B): `driver`/`driverNameSnapshot`, `driverPhoneSnapshot`, `vehicle.plateNumber` (echoed in body for the strip), `trailer.plateNumber`.
- Audit chain (Block C, §6.4.1a): `reportedBy`/`reportedAt`, `readyBy`/`readyAt`, `verifiedBy`/`verifiedAt`.
- Notatki (Block D): `notes`.
- Footer meta line: `createdAt`, `updatedAt` (unchanged, §6.6).

**Read-only.** No `onEdit` is passed ⇒ footer is meta line + «Zamknij» only (the existing behaviour — keep it). No edit/cancel control inside the modal.

### 6.4.1a Delegation lifecycle presentation — operational timeline + audit chain (redesign 2026-07-07)

> **Why this section exists.** The user's complaint: the lifecycle info in the delegation detail modal is muddled — an operational date (`actualReturnAt`) sat in the same flat `<dl>` as identity/audit stamps; the new `actualDepartureAt` (actual start-of-guarantee, counterpart to `actualReturnAt`) was not surfaced anywhere; and the modal rendered the **eksport** `readyBy/At` stamp under a «Zweryfikowany» label while the **real** weryfikator `verifiedBy/At` stamp was invisible — so "verification" was overloaded and dishonest. This section un-muddles all three cleanly. **Presentation-only, role-neutral** — all fields are already on `DelegationDto`; no schema/API change; no role gains or loses data visibility (this modal is shared read-only across carrier / planista / dyspozytor / eksport / weryfikator — the regrouping is identical for all five).

> **Exception — the «Stawki» block (2026-07-17) is role-scoped.** The route/audit regrouping described in this §6.4.1a stays role-neutral, but the separately-added «Stawki» rates block (inserted between Block A and Block B — full spec in §6.4.1) is **not** neutral: it is hidden from `dyspozytor` **and** its four rate fields are server-scrubbed to `null` on the delegation payload for that role (the delegation-endpoint "wire matches visibility" rule, stronger than the §6.4.2 UI-only `VehicleDto` exclusion). See §6.4.1 «Stawki» block + the §6.4.2 cross-reference.

**The clean split — two concerns, two homes:**

- **(A) Operational timeline → folds into `<RouteCard>` (Block A).** "Reported vs actual" on each end of the trip, next to each other, so the distinction is spatial: departure `departureAt` (reported) ↔ `actualDepartureAt` (actual start-of-guarantee); return `plannedReturnAt` (planned) ↔ `actualReturnAt` (actual). These are **trip facts**, not audit stamps — they belong on the route, paired with their reported/planned counterpart, NOT in a who-did-what list. See the updated Block A "reported-vs-actual pair" recipe (§6.4.1 Block A table).
- **(B) Audit / lifecycle chain → Block C, «HISTORIA STATUSU».** Who-did-what-when, in lifecycle order, as a vertical stepper. Only identity + timestamp lives here.

Splitting the operational actuals out of the audit list is the core of the un-muddling: after this, Block C contains **only** actor + timestamp, and the trip dates live on the route where the eye already looks for them.

#### Block A — reported-vs-actual date pair (recipe)

Each trip end shows a **two-line date stack** under its «Wyjazd» / «Powrót» mini-label:

```
 Wyjazd                         Powrót
 zgł.  12.03.2025, 08:00        plan.  16.03.2025
 fakt. 13.03.2025               fakt.  18.03.2025      ← only when actual present
 kod: 40-001                    kod: 00-950
```

- **Reported/planned line (always shown):** prefix chip «zgł.» (departure) / «plan.» (return) in the `MINI_LABEL` treatment (`text-[11px] uppercase tracking-[0.08em] text-text-sub`), then the value in `text-sm text-text tabular-nums`. Departure value = `formatDateTime(departureAt)` (has a real time). Return value = `formatDateFull(plannedReturnAt)` (date-only).
- **Actual line (shown ONLY when the value is non-null):** prefix chip «fakt.» (same mini-label, but tint it `text-success` to signal "confirmed/real"), then the value. Departure actual = `actualDepartureAt`; return actual = `actualReturnAt`. **Both render date-only with the date-only helper** — see the ⚠️ below.
- **Empty rule for actual lines:** when the actual is `null`, render **nothing** — no row, no em-dash. (`actualDepartureAt` is null until `w_trasie`; `actualReturnAt` is null until `zjechal`.) This is the fix for the old "permanent «faktyczny: —»" that read as broken. The reported/planned line is never omitted.

> **⚠️ Implementation note for web-agent — date-only helpers (phantom-time bug).** `actualDepartureAt` is stored **UTC-midnight date-only** (identical convention to `actualReturnAt` — see `delegations.ts` DTO doc-comment). It **MUST** be rendered with the **date-only** helper (`dateValue()` in `DelegationDetailModal.tsx` / `formatDateFull` in `RouteCard.tsx`), **NOT** `dateTimeValue()` / `formatDateTime`. Rendering it with the datetime helper shifts UTC-midnight into Europe/Warsaw and prints a phantom «02:00» — the exact bug the `dateValue()` helper was added to fix for `actualReturnAt` (see the helper's doc-comment). `departureAt` (reported) is a genuine datetime and DOES use the datetime helper — do not confuse the two.

#### Block C — «HISTORIA STATUSU» audit chain

A `span:'full'` section, icon `<ClipboardCheck>`, header «Historia statusu». Render it as a **vertical stepper** (three lifecycle events top-to-bottom, in order), NOT a two-column `<dl>` — the ordering carries meaning (registration → readied → confirmed-in-transit), and a stepper makes the chain legible:

```
 ● Zgłoszony przez        {reportedBy name}      {reportedAt  — dd.MM.yyyy, HH:mm}
 ● Zaakceptowany (eksport)       {readyBy name}         {readyAt     — dd.MM.yyyy, HH:mm}
 ● Potwierdzony w trasie  {verifiedBy name}      {verifiedAt  — dd.MM.yyyy, HH:mm}
```

**Row recipe (per step):** a small status dot (`h-2 w-2 rounded-full`, `bg-success` for stamped steps, `bg-border` for not-yet-reached), a connecting hairline (`w-px bg-border`) between dots forming the stepper spine, then a two-part text block: the **action label** (`text-sm font-medium text-text`) + actor name below (`text-xs text-text-sub`), and the **timestamp** right-aligned (`text-xs text-text-sub tabular-nums`, `dateTimeValue` — all three audit stamps are genuine datetimes). Reuse the `<TeamMembers>`-style spine treatment already used in the modal if convenient; a bespoke inline stepper is fine — not catalogue-worthy.

**The three actors — corrected, honest labels (this is the "un-overload verification" fix):**

| Step | Field pair | Actor role | PL action label | EN action label | Semantics (per `docs/20`) |
|---|---|---|---|---|---|
| 1 | `reportedBy` / `reportedAt` | carrier | **Zgłoszony przez** | **Registered by** | Carrier filed the `zgłoszenie` (`— → zgloszony`). |
| 2 | `readyBy` / `readyAt` | eksport | **Zaakceptowany (eksport)** | **Accepted (export)** | Eksport found the load / made the zlecenie → `zgloszony → gotowy`. In MAGTRANS "readying the load = acceptance", so a caption may add «akceptacja ładunku». |
| 3 | `verifiedBy` / `verifiedAt` | weryfikator | **Potwierdzony w trasie** | **Confirmed in transit** | Weryfikator confirmed the vehicle actually departed → `gotowy → w_trasie`. This is the **true** verification stamp — previously invisible. |

Note the label collision is gone: step 2 is honestly «Zaakceptowany (eksport)» (not «Zweryfikowany»), and step 3 surfaces the real weryfikator action under «Potwierdzony w trasie». No label says a bare «Zweryfikowany» anymore.

**Empty-state rule for audit steps (per step, differs from the actuals):** each audit step is shown as a **greyed, incomplete step** until its transition fires, NOT hidden. Rationale: the chain communicates *progress* — a missing step is meaningful ("not readied yet"), unlike a missing actual date. So:
- Step 1 (`reportedAt`) is **always** populated (a delegation cannot exist un-registered — `reportedAt` is non-nullable on the DTO).
- Steps 2 & 3: when the `*At` is `null`, render the step with a `bg-border` dot, the action label in `text-text-sub` (muted), and the value column shows the **pending caption** «— oczekuje» / «— pending» instead of a name/timestamp. When populated, the dot goes `bg-success`, label goes `text-text`, and name + timestamp show. This makes the current lifecycle position readable at a glance (how far the trip has progressed).
- `anulowany` outings: steps that never fired stay «— oczekuje»; do **not** invent a cancel step (cancel author isn't a tracked stamp on the DTO). The `<StatusBadge>` in the header already carries the «Anulowany» state.

**Subtle footer inside Block C:** `createdAt` / `updatedAt` are **not** audit steps — keep them in the modal's existing footer meta line (§6.6, «Utworzono … · Zaktualizowano …»), unchanged. Do **not** duplicate them as stepper rows. (They already live in the footer today; the redesign leaves that alone.)

#### Block D — «Notatki»

`notes` moves out of the audit section into its **own** `span:'full'` section, icon `<StickyNote>`, rendered as a `fullWidth` long-text row (§6.20). **Omit the whole section when `notes` is empty** (per §6.4 "empty section omitted") — no dangling «Notatki: —».

#### Copy table (PL default + EN) — ready for i18n keys

All keys live under `carrier.delegations.*` (the modal's existing namespace, shared by all five role views). New/changed keys marked ✚ / ✎; the old `form.actualReturnAt` / `form.verifiedBy` / `form.verifiedAt` audit usages are **removed from the modal** (the `form.*` keys may remain for the actual create/edit forms — do not delete blindly; just stop using them for the audit chain).

| Key | PL | EN | Notes |
|---|---|---|---|
| `routeCard.departure` | Wyjazd | Departure | mini-label (existing) |
| `routeCard.return` | Powrót | Return | mini-label (existing) |
| `routeCard.reportedPrefix` ✚ | zgł. | rep. | departure reported-line prefix |
| `routeCard.plannedPrefix` ✎ | plan. | plan. | return planned-line prefix (was «plan:») |
| `routeCard.actualPrefix` ✚ | fakt. | act. | actual-line prefix (both ends); `text-success` |
| `routeCard.postalPrefix` | kod: | code: | (existing) |
| `routeCard.durationDays` | {days, plural, …} dni · plan. | {days, plural, …} days · plan. | (existing) |
| `sections.route` | Trasa | Route | (existing) |
| `sections.vehicleAndDriver` | Pojazd i kierowca | Vehicle & driver | (existing) |
| `sections.audit` ✎ | Historia statusu | Status history | Block C header (was «Status i audyt») |
| `sections.notes` ✚ | Notatki | Notes | Block D header |
| `audit.registeredBy` ✚ | Zgłoszony przez | Registered by | step 1 action label |
| `audit.readiedBy` ✚ | Zaakceptowany (eksport) | Accepted (export) | step 2 action label |
| `audit.readiedCaption` ✚ | akceptacja ładunku | load accepted | optional step-2 sub-caption |
| `audit.confirmedInTransit` ✚ | Potwierdzony w trasie | Confirmed in transit | step 3 action label |
| `audit.pending` ✚ | — oczekuje | — pending | pending value for un-fired steps 2/3 |
| `form.notes` | Notatki | Notes | reuse for Block D label / sr-only `<dt>` |

> **Actor name resolution (unchanged pattern):** each step shows `*By?.name ?? *By?.login`; when the step is populated but the relation is somehow null, fall back to em-dash via `textValue`. The timestamp uses `dateTimeValue` (all three `*At` are datetimes).

**Responsive (RouteCard).**
- `≥ sm`: horizontal — `flex items-center gap-3`, departure / connector(`flex-1`) / return. Connector line + truck + pill centered.
- `< sm` (≤640px): the route card switches to a **vertical timeline** — departure block on top, a vertical connector (`<ArrowDown>` icon + the duration pill, with a `w-px bg-border` vertical rule), return block below. Use `flex flex-col items-start gap-3`. The circles stay `h-12 w-12`; the connector swaps `ChevronRight`→`ArrowDown`. Never horizontally scroll the card.

**a11y.** The route card is decorative-structural: wrap it in a `<div role="group" aria-label={t('routeCard.aria')}>` («Trasa wyjazdu z {DE} do {PL}»). The truck/arrow icons are `aria-hidden`. The duration pill text is real text (not icon-only) so SR users hear «4 dni, planowane». Country codes in the circles are real text. Contrast: `text-text-sub` on `bg-input` and on `bg-card` both clear AA at the 12px/13px sizes used; the duration pill border (`border-border`) carries a non-colour boundary so the pill is legible without relying on the faint `bg-input` fill.

### 6.4.2 Read-only detail modals — vehicle / driver / trailer (planista + dyspozytor)

These modals open when a row in the planista/dyspozytor fleet tabs (§6.4.3) is clicked. They reuse the **same `<EntityDetailModal>` shell and the same wrappers already specified for the admin context in §6.15 / §6.16 / §6.17** — but in the **read-only context** (no `onEdit` ⇒ footer is «Zamknij» only, §6.6).

> **2026-06-26 — planista vehicle modal = the full modal.** The slim curated field set + `<FleetVehicleDetailModal>` below now apply to the **dyspozytor** vehicle modal **only**. The **planista** vehicle modal is the full `<VehicleDetailModal>` (§6.15), incl. rates — see the dated note under «HARD EXCLUSION». Driver/trailer fleet modals stay slim/read-only for both roles.

**The data-availability gap and the API contract.** The admin vehicle/driver/trailer modals (§6.15–§6.17) read **full** `VehicleDto`/`DriverDto`/`TrailerDto`. The planista/dyspozytor panels are served by `/fleet/planista` and `/fleet/dyspozytor`, which currently return the **slim** `VehicleListItem` / `DriverListItem` / `TrailerListItem` (see `packages/shared/src/schemas/fleet.ts`). A detail modal needs more than the slim list carries. Two options were considered:

- (a) lazily fetch the full `*Dto` on row click — rejected: planista/dyspozytor have no JWT scope on the admin `/vehicles/:id` etc. endpoints, and adding role grants there widens the attack surface for fields they must not see (rates). *(2026-06-26: this option (a) is now in fact chosen for the **planista vehicle modal** — planista is authorized for the full `GET /vehicles/:id` scoped to its `plannerId`, and the product decision is that planista **should** see rates, so the "fields they must not see" concern no longer applies to planista. Option (b) still holds for the **dyspozytor** vehicle modal and for **both** roles' driver/trailer modals — see the dated note under «HARD EXCLUSION».)*
- (b) **enrich the slim list-items** with a curated, non-sensitive field set so the panel renders the modal from data it already holds — **chosen.** api-agent widens the three `*ListItemSchema` with the additive fields below. Because these are **additive/optional**, they also flow into the carrier `/fleet/my` payload — which is fine: a carrier owns its own fleet and the added fields are all non-sensitive (no rates). **The field lists below ARE the api contract** — api-agent adds exactly these and nothing more.

**HARD EXCLUSION — dyspozytor only (vehicle rates).** Never include `rateDe` / `rateUe` / `rateExport` / `rateImport` for the **dyspozytor** viewer. Dyspozytor must not see pricing — the vehicle «Stawki» section from §6.15 is **dropped entirely** in the dyspozytor read-only fleet modal (it keeps using the slim `<FleetVehicleDetailModal>` described below).

> **2026-07-17 — delegation modal reuses the rates presentation, but server-scrubbed.** The §6.4.1 delegation detail modal now carries a «Stawki» block (the §6.15 rates presentation, live off the delegation's vehicle) with the **same dyspozytor exclusion** as this rule — but on the **delegation endpoint** the exclusion is **two-layer**: the UI omits the block AND the API scrubs the four rate fields to `null` on the delegation payload. This is **stronger** than the fleet/vehicle rule here: this §6.4.2 exclusion (and the §6.15 one) is **UI-only** and leaves the values on `VehicleDto` (the known "getById is not scoped" gap). For the delegation payload the **wire matches visibility** — dyspozytor never receives the values. The empty-section rule (§6.4) then auto-omits the block once all four are null, a third safety net.

> **Payload-boundary note — `packages/shared/src/schemas/fleet.ts` "HARD EXCLUSION" is unaffected.** The fleet-list "HARD EXCLUSION" comment (rates never on the `/fleet/*` list-item payload) **still stands** — the FLEET payload carries no rates. Its "planista must not see pricing" wording **predates the 2026-06-26 planista change** (planista now sees rates via the full `GET /vehicles/:id` → `VehicleDto`, not via the fleet list-item), so that comment's rationale is stale for planista, but the fleet-payload exclusion itself is correct and unchanged. **Only the DELEGATION payload now carries rates** (dyspozytor-scrubbed, per the note above); the fleet list-item payload does **not**.

> **2026-06-26 — planista now sees rates (reversal of the earlier planista-no-rates rule).** Product decision: the **planista** read-only vehicle modal becomes the **FULL** `<VehicleDetailModal>` — the same modal opiekun/admin/przewoźnik get, **including** the «Stawki» section. Planista is already server-authorized for the full vehicle detail (`GET /vehicles/:id`, scoped server-side to its `plannerId`), so its modal is fetched from the full `VehicleDto` rather than the enriched slim list-item — no curated rate-free field set, no slim-modal wrapper. The §6.4.2 rates exclusion therefore now applies to **dyspozytor only**, not planista. Driver/trailer fleet modals are unchanged for both roles (no rates exist there anyway). The slim `<FleetVehicleDetailModal>` below remains the **dyspozytor** vehicle modal.

**HARD EXCLUSION — driver/trailer (both roles):** `bankAccount` (driver, financial-adjacent) stays out of the role-panel driver modals; no rate fields exist on drivers/trailers.

**Formatters:** use the existing `entity-detail-values.tsx` helpers — `textValue` / `monoValue` / `dateValue` / `boolValue(v, yes, no)` / `listValue`. Empty/null → em-dash via each helper (§6.5). An entire section is omitted by the wrapper only if **every** value in it is empty (§6.4 "Empty section").

#### Vehicle detail modal (fleet read-only) — `<FleetVehicleDetailModal>`

- **Title** = `plateNumber` (mono). **Subtitle** = `[brand, model].filter(Boolean).join(' ')` (neutral) or omit. **Badge** = active/inactive.
- (a) **Slim fields already present** (keep): `plateNumber`, `sideNumber`, `brand`, `model`, `type`, `active`.
- (b) **Additive fields api must add to `VehicleListItemSchema`:** `year`, `euro`, `certificateL`, `gps`, `gpsMobilePhone`, `fuelCard`, `agreement`, `adr`, `wasteAllowed`, `wasteCountries`, `cabotageDe`, `cabotageFr`, `gb`, `it`, `fr`, `lastDroveAt`, `notes`. **Excluded:** all four rate fields; `carrier`/`planner`/`dispatcher` relations (not needed in a role panel scoped to the viewer's own fleet — omit the §6.15 "Przypisanie" section here); `adrClasses` and `wasteCountries` only if the slim DTO doesn't already model them as arrays — `wasteCountries` is added as `z.array(z.string()).nullable()`. (`adrClasses` is **not** in `VehicleDto` — the boolean `adr` flag is what exists; surface `adr` as a bool, do not fabricate `adrClasses`.)

| Section | `span` | Icon | Rows (label → field → formatter) |
|---|---|---|---|
| **Identyfikacja** (`sections.identification`) | half | `<Truck>` | Numer rejestracyjny → `plateNumber` `monoValue` · Numer boczny → `sideNumber` `textValue` · Marka → `brand` `textValue` · Model → `model` `textValue` · Rok → `year` `textValue(String(year))` · Typ → `type` (raw enum MEGA/STD/COIL) `textValue` · Norma EURO → `euro` (raw enum) `textValue` · Certyfikat L → `certificateL` `boolValue` |
| **Wyposażenie** (`sections.equipment`) | half | `<Package>` | GPS → `gps` `boolValue` · **ID urządzenia GPS** → `gpsMobilePhone` `monoValue` *(Quirk #2 — label is the GPS tracker device ID, NEVER "telefon")* · Karta paliwowa → `fuelCard` `boolValue` · Porozumienie → `agreement` `boolValue` |
| **Pozwolenia** (`sections.permissions`) | full | `<ShieldCheck>` | ADR → `adr` `boolValue` · Odpady → `wasteAllowed` `boolValue` · Kraje odpadowe → `wasteCountries` `listValue` · Kabotaż DE → `cabotageDe` `boolValue` · Kabotaż FR → `cabotageFr` `boolValue` · GB → `gb` `boolValue` · IT → `it` `boolValue` · FR → `fr` `boolValue` |
| **Eksploatacja** (`sections.usage`) | full | `<Globe2>` | Ostatni przejazd → `lastDroveAt` `dateValue` *(Quirk #11 — display-only, never editable; fine to show here)* · **Zespół** → `dispatchTeam` rendered via `<TeamMembers variant="chips" size="md">` as a `fullWidth` row (Phase 11, §7.9 — non-sensitive team composition; **not** a rate/relation that the §6.4.2 HARD EXCLUSION blocks) · Notatki → `notes` `textValue` `fullWidth: true` |

> **«Zespół» field (Phase 11).** Both the **admin** VehicleDetailModal and this read-only **FleetVehicleDetailModal** render the vehicle's `dispatchTeam` via `<TeamMembers variant="chips" size="md">` as a `fullWidth` row in the Eksploatacja section. This requires `dispatchTeam` (`{code, name, active, members[{id,firstName,lastName}]}`) on the vehicle payload — additive, non-sensitive (no rates), consistent with the §6.4.2 "enrich the slim list-item" rationale. Empty/inactive states handled by `<TeamMembers>` itself (§7.9.3). Full spec: §7.9.

#### Driver detail modal (fleet read-only) — `<FleetDriverDetailModal>`

- **Title** = `firstName + lastName`. **Subtitle** = `idDocumentNumber` (mono) or omit. **Badge** = active/inactive.
- (a) **Slim fields already present** (keep): `firstName`, `lastName`, `phone`, `active`, `licenseExpiry` (already in slim DTO).
- (b) **Additive fields api must add to `DriverListItemSchema`:** `phone2`, `email`, `idDocumentNumber`, `adr`, `notes`. **Excluded:** `bankAccount` (financial-adjacent; keep it out of the role panels), `carrier` relation.

| Section | `span` | Icon | Rows (label → field → formatter) |
|---|---|---|---|
| **Dane osobowe i kontakt** (`sections.personal`) | half | `<User>` | Imię → `firstName` `textValue` · Nazwisko → `lastName` `textValue` · Telefon → `phone` `textValue` · Telefon (drugi) → `phone2` `textValue` · E-mail → `email` `textValue` |
| **Dokumenty** (`sections.documents`) | half | `<CreditCard>` | Numer dokumentu tożsamości → `idDocumentNumber` `monoValue` · Ważność prawa jazdy → `licenseExpiry` `dateValue` · ADR → `adr` `boolValue` |
| **Notatki** (`sections.notes`) | full | `<StickyNote>` | Notatki → `notes` `textValue` `fullWidth: true` *(omit the whole section if `notes` is empty)* |

#### Trailer detail modal (fleet read-only) — `<FleetTrailerDetailModal>`

- **Title** = `plateNumber` (mono). **Subtitle** = `trailerType.shortCode ?? trailerType.name` (neutral) or `trailerTypeName`. **Badge** = active/inactive.
- (a) **Slim fields already present** (keep): `plateNumber`, `trailerTypeName` (the slim DTO carries `trailerTypeId` + `trailerTypeName`), `brand`, `model`, `active`.
- (b) **Additive fields api must add to `TrailerListItemSchema`:** `year`, `belts`, `beltsCount`, `mats`, `matsCount`, `innerLength`, `innerWidth`, `innerHeight`, `capacity`, `airSuspension`, `certXl`, `multilock`, `notes`. (No rates exist on trailers — nothing to exclude beyond the universal rule.) The slim DTO may keep `trailerTypeName` flat; the modal can render `[shortCode] name` only if `shortCode` is also added — otherwise show `trailerTypeName` as-is.

| Section | `span` | Icon | Rows (label → field → formatter) |
|---|---|---|---|
| **Identyfikacja** (`sections.identification`) | half | `<Container>` | Numer rejestracyjny → `plateNumber` `monoValue` · Typ naczepy → `trailerTypeName` `textValue` · Marka → `brand` `textValue` · Model → `model` `textValue` · Rok → `year` `textValue(String(year))` |
| **Wymiary** (`sections.dimensions`) | half | `<Ruler>` | Długość wewn. (m) → `innerLength` `textValue` · Szerokość wewn. (m) → `innerWidth` `textValue` · Wysokość wewn. (m) → `innerHeight` `textValue` · Ładowność (t) → `capacity` `textValue` |
| **Wyposażenie** (`sections.equipment`) | full | `<Package>` | Pasy → `belts` `boolValue` · Liczba pasów → `beltsCount` `textValue` · Maty → `mats` `boolValue` · Liczba mat → `matsCount` `textValue` · Zawieszenie pneum. → `airSuspension` `boolValue` · Certyfikat XL → `certXl` `boolValue` · Multilock → `multilock` `boolValue` · Notatki → `notes` `textValue` `fullWidth: true` |

> Dimension/capacity units are in the labels («(m)», «(t)») so the values are bare numbers — same convention as §6.17.

**Empty-state handling (all three modals).** Per-row empties render `—` (the helpers do this). A section whose every value is empty is **omitted** by the wrapper (e.g. a trailer with no dimensions drops «Wymiary»; a driver with no notes drops «Notatki»). The modal as a whole is never empty — title (plate / name) + active badge always exist. No skeleton/loading/error state is needed: the data is already in the panel's `/fleet/*` query when the row is clicked (same "no second fetch" rationale as §6.8).

**Wrappers vs reuse of §6.15–§6.17 wrappers.** Because the field set differs (no rates, no relations, slightly regrouped sections) and the **data shape** differs (slim+enriched list-item vs full Dto), these are **new thin wrappers** colocated with the fleet panels — `components/fleet/FleetVehicleDetailModal.tsx` etc. — NOT the admin `VehicleDetailModal`. They still compose the **same generic `<EntityDetailModal>`** and the **same `entity-detail-values.tsx` helpers** — zero new shell code. Do not re-implement the shell.

### 6.4.3 Clickable-row affordance (read-only fleet + Delegacje tables)

The `<DataTable>` primitive **already** supports `onRowClick` and applies `cursor-pointer` + `hover:bg-brand-50 dark:hover:bg-brand/10` when a handler is present (`components/ui/DataTable.tsx`). The Phase 6.3 fleet sub-tables (`FleetVehiclesTable` / `FleetDriversTable` / `FleetTrailersTable`) and the Delegacje table are currently **inert** (no `onRowClick`). Making them clickable is now a behaviour change *plus* an a11y gap to close — the current `<tr onClick>` is **mouse-only** (no keyboard, no role/aria). The clickable-row pattern below is the canonical recipe; web-agent applies it to all four tables and back-ports the keyboard/aria bits into the `DataTable` primitive so every future clickable table inherits it.

**Visual / interaction (already present, keep):**
- Cursor: `cursor-pointer` on the row (only when `onRowClick` is set — keep the conditional).
- Hover background: `hover:bg-brand-50 dark:hover:bg-brand/10` (the established interactive-row hover, §4.4 "Brand-tinted hover"). No new token.
- Transition: `transition-colors` (already on the row).

**Keyboard + a11y (NEW — add to the `<tr>` when `onRowClick` is set):**
- `tabIndex={0}` — the row enters the tab order.
- `role="button"` — announces the row as activatable (the row is a `<tr>`; `role="button"` on it is acceptable here since the whole row is a single action target; do NOT also put interactive controls inside these read-only rows, so there's no nested-interactive conflict).
- `aria-label` — a concise row summary so SR users know what opens, e.g. «Pokaż szczegóły: {plateNumber}» / «Pokaż szczegóły delegacji: {plate}». web-agent supplies it via an optional `rowAriaLabel?: (row: T) => string` prop on `DataTable` (additive, optional — when omitted, no `aria-label` and the row stays non-interactive-labelled but still clickable for mouse; for the fleet tables, **always** pass it).
- `onKeyDown` — **Enter** and **Space** activate the row (`if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }`). `preventDefault` on Space stops the page from scrolling.
- **Focus ring:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset` on the `<tr>`. `ring-inset` keeps the ring inside the row bounds (a row spans the full table width; an outset ring would bleed past the table border). Reuses the brand focus-ring already used app-wide — no new token.

**Implementation note for web-agent.** Add the keyboard/aria bits **inside `DataTable`** (gated on `onRowClick` being defined) rather than per-table, so the Delegacje table, the three fleet tables, and the existing admin clickable tables all get keyboard parity in one change. The admin carriers/vehicles tables already use `onRowClick` for "open detail/edit" — they currently lack keyboard activation too, so this is a net a11y win across the app. This is the **only** change to the `DataTable` primitive (additive `rowAriaLabel` prop + keyboard handler + focus ring). No token change, no styling change to existing non-clickable tables (everything stays gated on `onRowClick`).

**Wiring per table:**
- `FleetVehiclesTable` → `onRowClick={(v) => openVehicleDetail(v)}` opens `<FleetVehicleDetailModal>`.
- `FleetDriversTable` → opens `<FleetDriverDetailModal>`.
- `FleetTrailersTable` → opens `<FleetTrailerDetailModal>`.
- Delegacje table (dyspozytor) → opens `<DelegationDetailModal>` (the §6.4.1 route-card modal).
- The panel page owns the `open` + `target` state per modal kind; the modal closes on «Zamknij»/Escape/overlay. Read-only throughout — clicking a row **opens a view**, never an edit surface (§6.3 read-only constraint is preserved: a detail modal is a read surface, not a mutation).

### 6.4.4 Components / shared / API changes summary (Phase 6.4)

| Change | Where | Owner |
|---|---|---|
| Header: drop driver-name subtitle → title = plate, badge = status only | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| New `<RouteCard>` presentational component (departure circle → connector+truck+duration pill → return circle, vertical on mobile) | `components/delegations/RouteCard.tsx` | web-agent |
| Driver+vehicle strip block (inline in the wrapper or small local component) | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| Delegation modal width override `className="max-w-[820px]"` (≈ +22% over base 2xl); sections become `span:'full'`; route card + driver strip as `fullWidth` rows; «Notatki» `fullWidth`; «STATUS I AUDYT» standard `<dl>` section | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| `differenceInCalendarDays(plannedReturnAt, departureAt.slice(0,10))` duration calc (date-only, ≥0 guard) | `components/delegations/RouteCard.tsx` | web-agent |
| New `<FleetVehicleDetailModal>` / `<FleetDriverDetailModal>` / `<FleetTrailerDetailModal>` thin wrappers over `<EntityDetailModal>` (read-only, no `onEdit`, no rate fields) | `components/fleet/Fleet{Vehicle,Driver,Trailer}DetailModal.tsx` | web-agent |
| Fleet sub-tables get `onRowClick` + open the matching detail modal; Delegacje table gets `onRowClick` → `<DelegationDetailModal>` | `components/fleet/FleetTables.tsx` + the dyspozytor panel page | web-agent |
| `DataTable`: additive `rowAriaLabel?: (row) => string` prop + keyboard (Enter/Space) + `role="button"` + `tabIndex={0}` + `focus-visible:ring-2 ring-brand ring-inset` on the `<tr>` **when `onRowClick` is set** | `components/ui/DataTable.tsx` | web-agent |
| **API enrich** `VehicleListItemSchema` += `year, euro, certificateL, gps, gpsMobilePhone, fuelCard, agreement, adr, wasteAllowed, wasteCountries, cabotageDe, cabotageFr, gb, it, fr, lastDroveAt, notes` (all additive/optional; **NO rate fields**) | `packages/shared/src/schemas/fleet.ts` + `fleet.service.ts` select | api-agent |
| **API enrich** `DriverListItemSchema` += `phone2, email, idDocumentNumber, adr, notes` (additive; **NO `bankAccount`**) | same | api-agent |
| **API enrich** `TrailerListItemSchema` += `year, belts, beltsCount, mats, matsCount, innerLength, innerWidth, innerHeight, capacity, airSuspension, certXl, multilock, notes` (additive) | same | api-agent |
| i18n: `carrier.delegations.routeCard.{aria,durationDays(ICU plural),departure,return,plannedPrefix,postalPrefix}` (note: `actualPrefix` **removed** — see «faktyczny» row below); `fleet.{vehicle,driver,trailer}.sections.*` + reused `fields.*`; `entityDetail.gpsDeviceId` («ID urządzenia GPS») | `messages/pl.json`, `en.json` | web-agent |
| **Remove «faktyczny» (actual-return) line from `<RouteCard>`** — delete the `text-xs text-text-sub` actual-return `<span>` in the return block (UI-only; `actualReturnAt` stays in `DelegationDto`/API/DB). Affects all 3 panels (carrier, eksport, admin) since `<RouteCard>` is shared. Also delete unused i18n key `carrier.delegations.routeCard.actualPrefix` (pl.json/en.json) | `components/delegations/RouteCard.tsx`; `messages/pl.json`, `en.json` | web-agent |
| **0** changes to `EntityDetailModal.tsx` shell, `tailwind.config.ts`, `globals.css` | — | — |

> The enriched list-items also widen the carrier `/fleet/my` payload (drivers/vehicles/trailers) — acceptable per §6.4.2: all added fields are non-sensitive and the carrier owns its own fleet. No new endpoint, no new role scope, no token change anywhere in Phase 6.4.

**§6.4.1a lifecycle-presentation redesign (2026-07-07) — supersedes the two rows above marked with «faktyczny» / «STATUS I AUDYT».** Actionable changes for web-agent (presentation-only, no schema/API/token change):

| Change | Where | Owner |
|---|---|---|
| **RouteCard: reinstate actuals as reported-vs-actual pairs.** Departure block += «fakt.» line = `actualDepartureAt` (**date-only** `formatDateFull`, NEVER `formatDateTime` — phantom-02:00 bug); return block += «fakt.» line = `actualReturnAt` (date-only). Both `text-success`-tinted prefix. **Omit each «fakt.» line entirely when its value is `null`** (no em-dash). Reported/planned lines always shown; return planned prefix relabelled «plan.» | `components/delegations/RouteCard.tsx` | web-agent |
| **DelegationDetailModal: replace flat «STATUS I AUDYT» `<dl>` with the «Historia statusu» audit stepper** — 3 ordered steps: `reportedBy/At` («Zgłoszony przez»), `readyBy/At` («Zaakceptowany (eksport)»), `verifiedBy/At` («Potwierdzony w trasie»). Success/border dots + `— oczekuje` pending caption for un-fired steps 2/3. **Remove `actualReturnAt` from this section** (now in RouteCard). **Surface the real `verifiedBy/At`** (was hidden). **Stop labelling `readyBy/At` as «Zweryfikowany»** | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| **Notatki → own Block D** `span:'full'` `<StickyNote>` section, `fullWidth` long-text; omit when `notes` empty | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| i18n add/change: `routeCard.reportedPrefix`=«zgł.», `routeCard.actualPrefix`=«fakt.», `routeCard.plannedPrefix`✎«plan.»; `sections.audit`✎«Historia statusu»; `sections.notes`✚«Notatki»; `audit.{registeredBy,readiedBy,readiedCaption,confirmedInTransit,pending}`✚ (full copy table in §6.4.1a) | `messages/pl.json`, `en.json` | web-agent |
| **0** schema / API / role-scope / token change — all fields (`actualDepartureAt`, `readyBy/At`, `verifiedBy/At`) already on `DelegationDto`; regrouping is role-neutral (same for carrier/planista/dyspozytor/eksport/weryfikator) | — | — |

### 6.4.5 Catalogue additions (Phase 6.4)

| Component | Type | Notes |
|---|---|---|
| `<RouteCard>` | New custom presentational | Departure/return country circles + truck connector + planned-duration pill + **reported-vs-actual date pairs on each end** (§6.4.1a, redesign 2026-07-07); horizontal on `sm+`, vertical timeline on phones. Composes existing tokens only. |
| Delegation audit stepper (Block C, «Historia statusu») | Documented layout recipe (§6.4.1a) | Vertical 3-step lifecycle chain (registered → readied/eksport → confirmed-in-transit/weryfikator) with success/border dots + pending-caption empty states. Inline recipe in `DelegationDetailModal`, not standalone. |
| `<FleetVehicleDetailModal>` / `<FleetDriverDetailModal>` / `<FleetTrailerDetailModal>` | New thin wrappers | Over `<EntityDetailModal>`, read-only (no `onEdit`), rate-free curated field sets (§6.4.2). |
| `DataTable.rowAriaLabel` + keyboard/role/focus-ring | Primitive enhancement (additive) | Canonical clickable-row a11y for every `onRowClick` table app-wide. |
| Duration pill / mini country-circle / driver-strip recipes | Documented layout recipes (§6.4.1) | Not standalone components — composition recipes inside `<RouteCard>` / the delegation wrapper. |

---

## 6.5 Unified wniosek-verification surface (`pracownik` / `weryfikator`) — Phase 7.1

> **Scope.** Replaces the two-surface verification flow (read-only `ClaimDetailModal` `<Dialog>` + editable `ClaimVerificationModal` `<Sheet side="right" w-[720px]>`) with **ONE centered `<Dialog>`** carrying a `mode: 'view' | 'edit'` state. Row-click opens `view` (read-only); the **«Edycja»** button morphs fields to editable **inline, without re-mounting** — same dialog, same layout. This is the canonical pattern for the `pracownik`/`weryfikator` claim-verification screen.
> Reference: `docs/screenshots/modal-status-p1.png` (top — fact pairs + correction) + `modal-status-p2.png` (bottom — recalc result + decyzja). Treat the two as one logical screen.
> **No new color / radius / shadow / font tokens.** Composes the existing palette, semantic colors, radius scale, `shadow-modal`, `animate-modal-in`, and the already-documented locked/computed-field + `HoursReadout` patterns. Builds on `components/ui/Dialog.tsx`.

### 6.5.0 The deliberate deviation from the Sheet-for-CRUD lock (documented, authorised)

The design system locks **edit-forms to `<Sheet side="right">`** in four places: § Phase 2 *Sheet* (the "Не используем `<Dialog>` для edit-форм" line), `<ClaimVerificationModal>` header (Phase 4), Phase 4 acceptance checklist, and §6.0 reconciliation table (row 1). **This section overrides that lock for — and only for — the wniosek-verification surface.** Each of those four sites now carries an inline ⚠️ pointer to §6.5.

**Why this surface is the exception (and a Sheet is wrong here):**

1. **It is not CRUD-on-an-entity.** Driver/Vehicle/Trailer/User/Limity forms edit *one record's own fields*. Verification is a **reconciliation**: for each of 6 facts the verifier reads the carrier-declared value and writes the checked value beside it. The screen's job is *comparison*, which wants a wide, centered, two-column-of-pairs canvas — not a 480–720px side rail.
2. **The «jump» is the actual problem being solved.** Today: click row → read-only Dialog (center) → press «Edytuj» → Dialog closes, Sheet slides in from the right with a *different* layout and decyzja-at-top order. The surface physically relocates and re-lays-out mid-task. The fix is *one* surface whose fields flip from static to editable **in place** (`mode` state, no unmount), so view↔edit feels like one object.
3. **Top-down narrative needs full width.** The intended reading order — *read declared → write checked → see recomputed dopłata → decide* — is a vertical stack of full-width blocks. A right Sheet at 720px forces the fact pairs to cramp; a centered `max-w-4xl` Dialog gives each pair room to sit side-by-side comfortably.

**Guardrail:** this exception does **not** generalise. Every other edit form stays `<Sheet side="right">`; every other read-only detail stays centered `<Dialog>` (§6.0). The verification surface is sui generis because view and edit are the *same* reconciliation surface, not a detail→edit handoff.

### 6.5.1 Container & width

| Property | Value | Notes |
|---|---|---|
| Container | centered **`<Dialog>`** (`components/ui/Dialog.tsx`) | Reuses portal, focus-trap, Escape, body-scroll-lock, `bg-card border border-border rounded-xl shadow-modal animate-modal-in`, top-right close-✕. |
| Width | **`max-w-4xl`** (56rem / 896px) | Chosen over `max-w-3xl` (768px): the edit mode renders **paired fact rows** (declared value + verifier input side-by-side, §6.5.3). At `3xl` the two columns of a pair plus their labels get tight on the 6-fact grid; `4xl` lets a pair sit comfortably as `[declared | input]` while still feeling like a focused modal, not a page. Do **not** go to `5xl` (1024px, the `EntityDetailModal` width) — that reads as a full read-only snapshot, not a working surface; the verification screen wants to feel *denser and more focused* than the entity-detail modals. |
| Mobile / narrow | `w-[calc(100%-2rem)]` then capped by `max-w-4xl` (from primitive) | 16px gutter each side on phones; paired rows collapse to stacked (declared above input) below `md` — see §6.5.3. |
| Height / scroll | `max-h-[calc(100dvh-4rem)]`, body `overflow-y-auto`; header + footer non-scrolling | Verification content is tall (facts + recalc + decyzja). Header (nrZgl + parties) and footer (decision buttons) stay pinned; only the body scrolls. |
| Animation | `animate-modal-in` (200ms, opacity + 10px translateY) | No mode-change animation — see §6.5.6. |

### 6.5.2 Top-down layout (the locked narrative order)

The body is a single vertical stack. Same order in `view` and `edit` — only the rendering of the fact block differs.

```
┌─ <DialogHeader> (non-scrolling) ─────────────────────────────────┐
│  Wniosek {nrZgl}            <StatusBadge>            [✕]          │
│  {carrierName} · {plate}                                          │
│  parties strip: PLANISTA · OPIEKUN · PRZEWOŹNIK (muted meta)      │  ← legacy "WNIOSEK / PLANISTA / OPIEKUN / PRZEWOŹNIK" bar
├─ <DialogBody> (overflow-y-auto) ─────────────────────────────────┤
│  ① DANE WNIOSKU / DANE PO WERYFIKACJI  (the 6 fact pairs)        │  ← §6.5.3
│        view  → read-only paired rows                             │
│        edit  → declared (muted, top/left) + verifier <Input>     │
│  ─────────────────────────────────────────────────────────────  │
│  ② DOPŁATA  (locked / computed field, live)                      │  ← §6.5.4  — ABOVE decision
│        <RecalcBadge> + amountApproved (read-only, server-comp.)  │
│  ─────────────────────────────────────────────────────────────  │
│  ②b MaksimGateBlock  (ONLY when status = OCZEKUJE_NA_AUTORYZ.)   │  ← §6.5.7  — auto Maksim-gate
│        danger-banner «Czeka na autoryzację» + upload screenshotu │
│        / cleared-state (download) — blocks decyzja until cleared │
│  ─────────────────────────────────────────────────────────────  │
│  ②c REKLAMACJA  (ONLY when claim.reklamacjaSubmitted)            │  ← §6.5.15 — read-only submission
│        kwota · maksimum wtedy · treść · data + resolution chip   │
│  ─────────────────────────────────────────────────────────────  │
│  ③ DECYZJA  (targetStatus select + conditional fields)           │  ← §6.5.5  — at the very bottom
│        ZAAKCEPTOWANO → orderNumber / orderDate / amountApproved   │
│        ODRZUCONO      → komentarz                                 │
│        REKLAMACJA_ZAAKCEPTOWANO → nr zlecenia + kwota (RO) + kom. │  ← §6.5.15
│        REKLAMACJA_ODRZUCONO     → powód (required)                │
│  ─────────────────────────────────────────────────────────────  │
│  ④ Secondary section: HISTORIA (diff)  (§6.5.7)                  │
├─ <DialogFooter> (non-scrolling) ─────────────────────────────────┤
│  [Odrzuć (ghost danger)]        [Anuluj]  [Edycja → / Zapisz]    │  ← §6.5.6
└──────────────────────────────────────────────────────────────────┘
```

**Narrative (locked):** *I read what the carrier declared → I type what I verified → I see the recomputed dopłata → I make the decision.* dopłata sits between facts and decyzja deliberately: it is the *consequence* of the facts and the *input* to the decision, so it must read after the facts and before the verdict. **Never** move decyzja above dopłata or above the facts (the legacy Sheet had decyzja near the top — that ordering is abandoned).

### 6.5.3 The 6 fact pairs (the heart of edit mode)

> ⚠️ **UPDATE 2026-07-30 (docs/20 §0⁗) — the pairs became TRIPLETS for facts 1–5.**
> Now that the carrier declares the period / times / mileage itself, the muted
> "declared" cell finally carries a genuinely independent figure, and the
> `pracownik` needs the weryfikator's own numbers beside it to do the actual
> reconciliation. Row layout in edit mode:
>
> `[ Deklaracja przewoźnika (muted) | Dane weryfikatora (muted) | Weryfikacja (input) ]`
> — `md:grid-cols-3`, collapsing to stacked below `md` as before.
>
> | Fact | Weryfikator source |
> |---|---|
> | `dateStart` | `claim.delegationActualDepartureAt` (date part) |
> | `dateEnd` | `claim.delegationActualReturnAt` (date part) |
> | `timeFrom` | `HH:mm` of `delegationActualDepartureAt` |
> | `timeTo` | `HH:mm` of `delegationActualReturnAt` |
> | `mileage` | `claim.verifierMileage` — Σ km-board over the actual window (verifier-only, detail-only) |
>
> **Divergence is INFORMATION, not an error.** The two sides come from different
> external systems and routinely disagree — a differing weryfikator cell is
> tinted `border-warning/40 bg-warning/10` + `font-semibold`, with **no** icon,
> **no** `role="alert"` and **no** effect on validity. An equal cell renders in
> the plain muted treatment.
>
> **The column disappears entirely** (row falls back to the 2-column layout,
> header included) when the outing carries no actual datetimes / no board data —
> never render an empty third cell. `hoursAdjusted` (fact 6) is untouched: still
> input-only. View mode is untouched: still the single checked value.

Six facts, each a **pair**: carrier-declared value (read-only, muted) and the verifier's checked value (`pracownik` input).

| # | Field | i18n label (PL) | Input type | Declared value source |
|---|---|---|---|---|
| 1 | `dateStart` | Data załadunku | date | `origDateStart` |
| 2 | `dateEnd` | Data rozładunku | date | `origDateEnd` |
| 3 | `timeFrom` | Godz. zjazdu (załadunku) | time | **`origTimeFrom`** (new DTO field — NOT the live editable `timeFrom`) |
| 4 | `timeTo` | Godz. przyjazdu (rozładunku) | time | **`origTimeTo`** (new DTO field — NOT the live editable `timeTo`) |
| 5 | `mileage` | Przebieg / km zrealizowane | number (km) | `origMileage` |
| 6 | `hoursAdjusted` | Korekta godzin — postój / przestój | number (h) | **none** — see special case |

**⚠️ `timeFrom` / `timeTo` declared values come from the new DTO fields `origTimeFrom` / `origTimeTo`** — never from the live, verifier-editable `timeFrom` / `timeTo`. Binding the muted "declared" cell to the live editable field would make it echo the verifier's own typing. The DTO must surface `origTimeFrom` / `origTimeTo` separately (api-agent: additive, optional, mirror of `origDateStart`/`origMileage`).

**⚠️ `hoursAdjusted` has NO carrier-declared value** (the carrier never enters a stoppage; `origHoursAdjusted = 0`, which is *not* a real declared figure). For this fact render **only the verifier input** — omit the muted "declared" top/left cell entirely. Do **not** render `0` as a declared value; that would imply the carrier declared zero stoppage, which is false. Keep this cell visually balanced with its row siblings (it spans the pair's full width as a single input, or sits alone — web-agent's call), and render the live `HoursReadout` under it (§A pattern, `live`).

**⚠️ `hoursAdjusted` row visibility differs by mode (locked):**

| Mode | Rule |
|---|---|
| `edit` | **Always rendered** — input-only cell (no muted declared sibling), unchanged from the rule above. The verifier needs the field to *enter* a stoppage correction. |
| `view` | **Rendered ONLY when a real correction was applied** — i.e. `hoursAdjustedValue > 0`. If there is no stoppage (or the claim is not yet verified), **omit the entire row** (label + value). Do **not** render an empty/`—`/`0` row. |

Rationale: the carrier never declares a stoppage, so in read-only `view` an empty «Korekta godzin» row is pure noise — it shows a fact that was never entered and never applied. Only when the verifier actually applied a stoppage (`hoursAdjustedValue > 0`) does the row carry information worth showing in `view`. The `edit`-mode treatment is unchanged (input present, no muted cell).

#### Pair anatomy & the muted (declared) treatment

Each pair is one `<FormGrid cols={2}>`-aligned logical row (per §"Grid-form field alignment"). On `md+` the declared value is the **left** cell, the verifier input the **right**; below `md` the declared value stacks **above** the input.

| Slot | view mode | edit mode |
|---|---|---|
| Section header (declared) | «DANE WNIOSKU» — `text-xs font-bold uppercase tracking-wider text-text-sub` | same |
| Section header (verifier) | hidden (no second column in view) | «DANE PO WERYFIKACJI» + hint «(wypełnij po sprawdzeniu danych przewoźnika)» `text-xs text-text-sub` |
| Declared value cell | `<dl>`-style static row: label + value | **muted read-only field** (treatment below) |
| Verifier value cell | static row (the saved checked value, or `—`) | live `<Input type=…>` (editable) |

**Muted "declared" treatment (locked) — recessed, clearly not-the-input:** the declared cell must read as *reference context*, so the eye lands on the editable verifier cell. Reuse the **locked/computed-field surface recipe** (§"Read-only / computed field pattern" (b)) MINUS the lock icon (this is reference data, not a locked computed payload field):

| Token | Value | Rationale |
|---|---|---|
| Surface | **`bg-input/40`** | Noticeably more recessed than the editable sibling's `bg-input` — same "more greyed than a normal input" idea as the locked field. |
| Value text | **`text-text-sub`** | Muted, not full `text-text`; keep `tabular-nums` on numeric facts (mileage/hours) so digits stay aligned. |
| Border / focus | `border-border`, `focus:ring-0` (non-interactive: `readOnly tabIndex={-1} aria-readonly="true"`) | Never lights up; it is reference, not a control. |
| Label | `text-[11px] uppercase tracking-wider text-text-sub` | Matches the existing `Stat`-row label slot. |
| Icon | **none** | Unlike the computed `amountApproved` field, the declared cell carries NO `<Lock>` — it is informational reference, not a locked payload field. A lock here would wrongly imply "computed/locked". |

This is intentionally the **same muted surface** as the computed-field pattern so the two "you don't type here" affordances read consistently, but **differentiated by the absence of the lock icon** (declared = reference; `amountApproved` = locked-computed).

**Changed-vs-unchanged emphasis (edit mode):** when the verifier's checked value diverges from the declared value, tint the verifier input wrapper subtly with the existing warning band (`bg-warning/10`, same token used by the Historia diff) — a quiet signal "this fact was corrected". Optional polish, not required for v1; if implemented it must be a token, never inline style.

### 6.5.4 Dopłata — locked / computed field, live, ABOVE the decision

> ⚠️ **EXTENDED by §16.6 (2026-09-20).** В header-строке этого блока, справа от `<RecalcBadge>`, добавляется вторичная кнопка **«Przelicz wg aktualnych limitów»** (`variant="outline"`, роли `admin` / `weryfikator`) + статичная строка `recalc.snapshotNote`. Кнопка **не** уезжает в футер — футер принадлежит решению. Диалог сравнения «было → станет» — §16.6.

> ⚠️ **EXTENDED by §16.5.10 (2026-09-24).** Directly under the dopłata field (above the «wyliczana automatycznie» description) a two-line **niedojazd** readout: a sentence («Pojazd przejechał o X km mniej, niż gwarantowano.») + formula («Niedojazd: G km gwarant. − D km … = X km × R €/km»). It uses the same data source as the field. The spec is in §16.5.10.

A single full-width block between the fact pairs and the decyzja block. This is the **`amountApproved` locked/computed-field pattern** already specified in §"Read-only / computed field pattern" (b) — render it verbatim (the canonical class string with `<Lock>` icon, `readOnly tabIndex={-1}`, `bg-input/40`, `<FormDescription>` "wyliczana automatycznie"):

- **Live recalculation, decision-independent.** It recomputes via the live `/claims/preview` dopłata whenever any of the 6 facts changes (debounced 300ms — keep the Phase 4 debounce), **regardless of which `targetStatus` is selected**. The verifier sees the financial consequence of their corrections *before* committing to a decision. This is the reason it sits above decyzja, not inside the ZAAKCEPTOWANO branch.
- **`<RecalcBadge>`** to the right of the dopłata value: `<Badge variant="outline" className="animate-pulse">Przeliczam…</Badge>` during debounce → `<Badge variant="outline" className="text-success">Aktualne</Badge>` when settled (the legacy «Przelicz» button + «Wynik przeliczenia» panel from `modal-status-p2.png` collapse into this live badge + value — no manual "Przelicz" click in the new design).
- The breakdown detail (period split, weekend-skip count, korekta serwisowa line) from `modal-status-p2.png` renders as a **collapsible `<BreakdownTable>`** (§"BreakdownTable") under the dopłata number — `view` shows it expanded read-only; `edit` keeps it but live-updates. Use the container-query layout already specified (`< 34rem` → stacked cards, `≥ 34rem` → 5-col table); inside a `max-w-4xl` Dialog body it lands in the table layout on `lg+`.
- **`HoursReadout`** (§A) renders `live` under the `hoursAdjusted` input (fact #6) AND once more in this dopłata block's breakdown — same component, same copy, do not fork.

### 6.5.5 Decyzja — at the very bottom

`targetStatus` `<Select>` first, then the fields conditional on the chosen status, then the footer. This block is the legacy «Decyzja» section from `modal-status-p2.png`, moved to the bottom of the unified surface.

| `targetStatus` | Conditional fields (shown only when selected) |
|---|---|
| `ZAAKCEPTOWANO` | `orderNumber` (Nr zlecenia, text) · `orderDate` (Data zlecenia, date) · `amountApproved` (Kwota zatwierdzona — **the same locked/computed field as §6.5.4**; do not render a second editable copy — bind the decision's amount to the live-computed value). · `comment` → **`decisionComment`** («Uzasadnienie decyzji (opcjonalnie)», `edit.decisionCommentAccepted`, textarea, optional) + helper «Widoczne dla przewoźnika» (`<FormDescription>` with `<Eye>`, wired via `aria-describedby`). Prefilled from `claim.decisionComment`, **never** from `claim.comment` (UWAGI #4, 2026-10-22). |
| `ODRZUCONO` | `comment` → **`decisionComment`** (Powód odrzucenia, textarea, required) + the same «Widoczne dla przewoźnika» helper. |
| *(read-only, any status — ②a «Notatki», between ② DOPŁATA and ②b, view **and** edit; omitted when both rows are empty)* | Flat `border-t border-border pt-5` section, `<dl>`; each row = `text-[11px] uppercase` label + right-aligned author tag (`text-[11px] text-text-sub`, Lucide icon) over the muted quoted surface `rounded-md bg-input/40 p-3 whitespace-pre-wrap`. **«Komentarz przewoźnika»** — `claim.comment`, tag `<Truck>` «przewoźnik» (`notes.carrierComment` / `notes.carrierAuthor`). **«Uzasadnienie decyzji»** (ZAAKCEPTOWANO) / **«Powód odrzucenia»** (ODRZUCONO) — `claim.decisionComment`, tag `<Gavel>` «MAGTRANS»; verdict = `statusBeforeReklamacja` while in REKLAMACJA; only on a decided claim (`lib/claims/claimNotes.ts`). |
| `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` | **Fully spec'd in §6.5.15** (REWORK 2026-07-31). Offered **only** when `status === 'REKLAMACJA'`, and then they are the **only** two options. Accept branch = `reklamacjaOrderNumber` (required, prefilled from `claim.orderNumber`) + the carrier's kwota **read-only** + optional comment — **there is no amount input**. Reject branch = required reason textarea → `reklamacjaResponse`. |

> **`OCZEKUJE_NA_AUTORYZACJE` is NOT a selectable `targetStatus`.** The manual «Wyślij do autoryzacji» decision (with its `margin` / `authDesc` fields) is **removed** (этап 5.1). `OCZEKUJE_NA_AUTORYZACJE` is now reached **automatically** by the backend when the saved verification's dopłata exceeds `getAuthThreshold`; the decyzja `<Select>` therefore offers only `ZAAKCEPTOWANO` / `ODRZUCONO` (+ reklamacja-branches). While a claim is in `OCZEKUJE_NA_AUTORYZACJE`, the decision is *blocked* until the verifier uploads Maksim's confirmation screenshot in `MaksimGateBlock` (§6.5.7) — it is a gate around the same two decisions, never a third target.

- Use `<FormGrid cols={2}>` for the ZAAKCEPTOWANO grid (orderNumber/orderDate side-by-side; `amountApproved` is a `col-span-2` full-width locked field). Mirrors the existing Phase 4 ClaimVerificationModal ZAAKCEPTOWANO grid.
- The conditional block mounts/unmounts on `targetStatus` change with no layout jump above it (facts + dopłata stay fixed; only this bottom block reflows).

#### No pre-selected decision on entering `edit` (locked)

- On entering `edit`, **`targetStatus` is NOT pre-selected.** The `<Select>` shows a placeholder «wybierz decyzję», and **no conditional fields render** (no orderNumber/orderDate/amount for ZAAKCEPTOWANO, no komentarz for ODRZUCONO, etc.) until a decision is chosen. The decyzja block is just the empty select + (if applicable) the acceptance hint below it.
- **Required-field validation for the decision's conditional fields fires only on «Zapisz» (submit)** — never on enter-edit, never on first render. The verifier must not see required-field errors before they have even picked a decision.
- **Focus on entering `edit` lands on the first fact (`dateStart`), not on the decyzja block** (overrides nothing — this matches §6.5.6's existing "focus to first verifier input" rule; restated here to make explicit it is the *fact*, never the decyzja select, that receives focus).

Rationale: pre-selecting a status (or rendering its required fields) makes the conditional inputs read as "screaming unfilled" the moment edit opens, and yanks focus to the bottom of the modal. The verifier's job is facts-first → read dopłata → *then* decide; the empty placeholder enforces that order and removes the false-error noise.

#### Acceptance gate by recalc result (locked)

The decyzja select must reflect the live dopłata recalc (§6.5.4):

- **When the live recalc shows the guarantee is met or exceeded** — `kmDifference <= 0` (no shortfall ⇒ no payout) — the **acceptance options (`ZAAKCEPTOWANO`, `REKLAMACJA_ZAAKCEPTOWANO`) are disabled / unavailable** in the `<Select>`. Only rejection options (`ODRZUCONO`, `REKLAMACJA_ODRZUCONO`) remain selectable.
- **If an acceptance was already selected and a subsequent fact edit pushes the recalc into "guarantee met" (`kmDifference <= 0`)**, the current `targetStatus` selection is **cleared back to the placeholder** (and its conditional fields unmount), forcing a re-decision among the rejection options.
- Render a short hint next to / under the decyzja block: **«Gwarancja wyjeżdżona — wniosek można tylko odrzucić.»** (`text-xs text-text-sub`, shown only while `kmDifference <= 0`).
- This is a **UI guard only** — the backend additionally hard-rejects any acceptance on a met-guarantee claim (`422`). The UI gate exists to prevent the verifier from ever reaching that error, not to replace the server check.

### 6.5.6 `mode: 'view' | 'edit'` — the in-place morph (no re-mount)

The whole point: view→edit must **not** swap containers or re-mount the form.

- **One component**, one mounted `<Dialog>`. `mode` is local React state (or a `useState` lifted to the page if the row-click vs «Edycja»-affordance needs to seed it). Default on row-click = `'view'`.
- **Fields are conditionally *rendered as static vs input*, not conditionally *mounted into a different tree*.** Each fact cell reads `mode` and renders either a `<dl>` static value (`view`) or an `<Input>` (`edit`). The surrounding grid, section headers, dopłata block, and decyzja block stay in the DOM across the morph — only the leaf controls change. RHF stays mounted the whole time (form is initialised on open; in `view` the inputs are simply not shown but the form state exists), so entering `edit` does **not** reset values.
- **No slide/cross-fade between modes.** The morph is instantaneous (static text ⇄ input). Animating it would re-introduce the "jump" we are removing. Only the initial open uses `animate-modal-in`.
- **Footer reflects mode** (§ below).
- **a11y:** when entering `edit`, move focus to the first verifier input (`dateStart`). When leaving `edit` (Anuluj from edit, or save success), return focus to the «Edycja» trigger. The Dialog's focus-trap covers the whole surface in both modes.

#### Footer per mode

| Mode | Left slot | Right slot |
|---|---|---|
| `view` | — (or `Odrzuć` ghost-danger if the role/status permits a one-click reject, mirroring Phase 4) | `<Button variant="ghost">Zamknij</Button>` · `<Button>Edycja</Button>` (primary; enters `edit`) |
| `edit` | `<Button variant="ghost" className="text-danger">Odrzuć</Button>` (only if status ≠ ODRZUCONO/ZAAKCEPTOWANO) | `<Button variant="ghost">Anuluj</Button>` (back to `view`, discard unsaved edits) · `<Button>Zapisz</Button>` (label = «Zaakceptuj»/«Odrzuć»/«Zapisz decyzję» depending on `targetStatus`, mirroring Phase 4 footer logic — no «Wyślij do autoryzacji»: authorization is automatic, §6.5.7) |

- `Anuluj` in `edit` returns to `view` and resets the RHF form to the last-saved values (`form.reset(serverValues)`) — it does NOT close the Dialog. Closing the Dialog (✕ / Escape / Zamknij) is a separate action available in both modes.
- `Zapisz` states: `saving` → primary-button spinner, all inputs disabled; `error` → `<Alert variant="destructive">` at the top of the body, form stays editable (mirrors Phase 4 `<ClaimVerificationModal>` states).

### 6.5.7 Historia (secondary) & the automatic Maksim-gate (`MaksimGateBlock`)

> **REWORK 2026-07-24 (этап 5.1).** The manual authorization flow is **gone**. There is no «Wymaga autoryzacji» button, no manual `kwotaMaksima` input, no `Autoryzacja` tab, and no user-selectable `OCZEKUJE_NA_AUTORYZACJE` target. Authorization is now **fully automatic** (backend Maksim-gate) and its only UI surface is the **`MaksimGateBlock`** in the *main* flow. The secondary sub-panel is reduced to **Historia only**.

#### Historia — single secondary section (no tabs)

- The **main flow (facts → dopłata → [MaksimGateBlock] → decyzja) is always visible** as the modal body; nothing is hidden behind a tab.
- **Historia** is the *only* secondary content, rendered as a single labelled section (a `<Separator>` + section title, **no `<Tabs>` chrome** — a tab-strip for one item is noise) **below the decyzja panel**, still inside the same scrolling `<DialogBody>`, and **only when `claim.origData != null`** (there was a reklamacja / re-submit). Side-by-side diff «Pierwotnie» / «Aktualnie», changed fields tinted `bg-warning/10` (same token as §6.5.3 changed-emphasis). Read-only.
- If `origData == null` the secondary section is **omitted entirely** — the modal ends at the decyzja panel + footer.

#### `MaksimGateBlock` — the automatic authorization surface (main flow)

`MaksimGateBlock` is the **existing** central block that sits between the DOPŁATA block (§6.5.4) and the DECYZJA panel (§6.5.5), rendered **only when `status === 'OCZEKUJE_NA_AUTORYZACJE'`**. It is not a tab and not a secondary section — it is a first-class step of the main narrative, because when it is present it *gates the decision*.

**How the claim enters this state (context, backend-owned).** On «Zapisz weryfikację», if the recomputed dopłata **exceeds `getAuthThreshold`**, the backend **automatically** flips the claim to `OCZEKUJE_NA_AUTORYZACJE` and emails Maksim a confirmation request (dedup by amount). The verifier does **not** trigger this; there is no button. The reverse auto-rollback is also backend-owned: an **admin-only** edit in `OCZEKUJE_NA_AUTORYZACJE` that pushes dopłata back **under** the threshold returns the claim to `NA_WERYFIKACJI` and the block disappears.

**States of the block:**

| State | When | Treatment |
|---|---|---|
| **Pending (danger banner)** | `OCZEKUJE_NA_AUTORYZACJE`, no confirmation screenshot yet | `<Alert variant="destructive">`-styled banner «Czeka na autoryzację» + short body: Maksim was emailed, upload his reply to proceed. Below it a `<FileUpload>` (single image/PDF) — the *only* control in the block. |
| **Cleared (uploaded)** | screenshot uploaded | Banner drops its danger tone → neutral confirmed line + a `<FileDownload>`/link to the uploaded screenshot (view/replace). The decyzja panel below is now **unblocked**. |

**Decision blocked until cleared.** While the block is in *pending* state, the decyzja `<Select>` / save-decision action is **disabled**, with a hint under the decyzja select — `progExceededHint` / `decisionBlockedHint` — «Najpierw wgraj potwierdzenie autoryzacji Maksima.» (`text-xs text-text-sub`, `role="status"`). Once the screenshot is uploaded, the hint clears and `ZAAKCEPTOWANO` / `ODRZUCONO` become selectable again. The status stays `OCZEKUJE_NA_AUTORYZACJE` until the verifier actually saves a decision.

**Facts are locked in `OCZEKUJE_NA_AUTORYZACJE`.** For `pracownik`, the `FactPairs` block renders in its static `view` form with a single `<LockNotice>` above it (Tier-B lock, §6.5.13 case 2, key `locked.factsPendingAuthorization`) — only an **admin** may correct the verification data in this state (admin sees the informational `locked.factsPendingAuthorizationAdmin` notice, editing intact). «Zapisz weryfikację» is **removed** (not disabled) for non-admin here (§6.5.13 case 3), and any admin edit that drops dopłata under the threshold triggers the auto-rollback above. This is the existing `factsNotice` locked/adminInfo pattern — `MaksimGateBlock` is the central block of the surface while this state is active.

> The whole authorization flow is now: *auto-enter `OCZEKUJE` on save-over-threshold → `MaksimGateBlock` danger banner → verifier uploads Maksim's screenshot → decyzja unblocks → verifier decides*. No manual button, no manual amount entry, one surface in the main flow. Diff (Historia) stays a passive secondary section after the decision inputs.

### 6.5.8 Tokens

**No new tokens.** Everything composes from existing tokens:

| Need | Token (existing) |
|---|---|
| Dialog shell | `bg-card border-border rounded-xl shadow-modal animate-modal-in` |
| Dialog width | `max-w-4xl` (stock Tailwind) |
| Muted declared-value surface | `bg-input/40` + `text-text-sub` (reuse of locked-field surface, §"Read-only / computed field pattern") |
| Editable input surface | `bg-input` (normal field) |
| Locked dopłata / amountApproved | full locked/computed-field recipe (§(b)) incl. `<Lock>` |
| Changed-fact / diff emphasis | `bg-warning/10` |
| RecalcBadge | `<Badge variant="outline">` + `animate-pulse` / `text-success` |
| HoursReadout | per §A (existing) |
| BreakdownTable | per §"BreakdownTable" (existing, container-query) |
| Section labels | `text-xs font-bold uppercase tracking-wider text-text-sub` |

### 6.5.9 Catalogue & migration impact (Phase 7.1, web-agent)

| Change | Where |
|---|---|
| `<ClaimVerificationModal>` container `<Sheet side="right" w-[720px]>` → **`<Dialog max-w-4xl>`** with `mode: 'view' \| 'edit'` state | `apps/web/components/claims/ClaimVerificationModal.tsx` |
| Merge read-only `ClaimDetailModal` content INTO the same Dialog (`view` mode) — delete the separate detail-modal handoff for claims (the §6.0 detail→edit handoff no longer applies to this surface) | `apps/web/components/claims/*` + `ClaimsTable` row-click wiring |
| Reorder body: fact pairs → **dopłata (above)** → `MaksimGateBlock` (only @ `OCZEKUJE_NA_AUTORYZACJE`) → decyzja (bottom) → secondary Historia section | same |
| 6 fact pairs with muted-declared (`bg-input/40` + `text-text-sub`, **no lock icon**) + verifier input; `<FormGrid cols={2}>` alignment | same |
| `timeFrom`/`timeTo` declared cells bind to **`origTimeFrom`/`origTimeTo`**, not live values | same |
| `hoursAdjusted` renders **input only** (no declared cell; never render `0` as declared) | same |
| dopłata = locked/computed field, live recalc (debounce 300ms) **independent of `targetStatus`**, `<RecalcBadge>` | same |
| Historia → single secondary section (no `<Tabs>`) below decyzja, only when `origData != null`, else omitted; manual Autoryzacja tab **deleted** — authorization is the automatic `MaksimGateBlock` in the main flow (danger banner + screenshot `<FileUpload>` + cleared/download state), rendered only @ `OCZEKUJE_NA_AUTORYZACJE` | same |
| Footer per mode: `view` → [Zamknij][Edycja]; `edit` → [Odrzuć][Anuluj][Zapisz] | same |
| In-place morph: no re-mount, RHF stays mounted, `form.reset` on Anuluj-from-edit, focus to first input on enter-edit | same |
| **API:** surface `origTimeFrom` / `origTimeTo` on the claim DTO (additive, optional, mirrors `origDateStart`/`origMileage`) | `packages/shared` claim schema + `claims.service` serializer (api-agent) |
| **0** new color/radius/shadow/font tokens; **0** changes to `Dialog.tsx` shell, `tailwind.config.ts`, `globals.css` | — |

### 6.5.10 Acceptance checklist (Phase 7.1)

- [ ] Verification surface is **one centered `<Dialog max-w-4xl>`**, not a Sheet, not two modals.
- [ ] Row-click opens `view` (read-only); «Edycja» enters `edit` **in place** — no re-mount, no container swap, no slide animation, RHF values preserved.
- [ ] Body order top→bottom: fact pairs → dopłata (locked/computed, live) → `MaksimGateBlock` (only @ `OCZEKUJE_NA_AUTORYZACJE`) → decyzja (select + conditional fields) → optional Historia section.
- [ ] 6 fact pairs; declared cells muted `bg-input/40` + `text-text-sub` **without** lock icon; `timeFrom`/`timeTo` declared from `origTimeFrom`/`origTimeTo`; `hoursAdjusted` has input only (no declared cell, never `0`).
- [ ] `hoursAdjusted` row in **`view`** is rendered **only when `hoursAdjustedValue > 0`**; omitted entirely (no empty/`—`/`0` row) when there is no stoppage / claim not verified. In `edit` the input is always present.
- [ ] On entering `edit`, `targetStatus` is **not pre-selected** (placeholder «wybierz decyzję»); decision conditional fields do **not** render until a decision is chosen; decision required-field validation fires **only on «Zapisz»**; focus lands on `dateStart`, not the decyzja block.
- [ ] Acceptance gate: when live recalc shows `kmDifference <= 0` (guarantee met), `ZAAKCEPTOWANO` / `REKLAMACJA_ZAAKCEPTOWANO` are disabled; a prior acceptance selection is cleared if an edit pushes recalc into "guarantee met"; hint «Gwarancja wyjeżdżona — wniosek można tylko odrzucić» shown; backend still hard-rejects acceptance (`422`). ⚠️ The `REKLAMACJA_ZAAKCEPTOWANO` half of this gate is **flagged for review** — see §6.5.15 D (an uznana reklamacja pays the carrier's kwota, not a recalculated dopłata). Unchanged until the owner decides.
- [ ] dopłata recomputes live (300ms debounce) on any fact change, **independent of selected `targetStatus`**; `<RecalcBadge>` Przeliczam…→Aktualne.
- [ ] Historia = single secondary section (no `<Tabs>`) only when `origData != null`, else omitted. No manual Autoryzacja tab. Authorization = automatic `MaksimGateBlock` @ `OCZEKUJE_NA_AUTORYZACJE` only: danger banner «Czeka na autoryzację» + screenshot `<FileUpload>` → cleared/download state; decyzja disabled with hint until the screenshot is uploaded.
- [ ] Footer differs by mode; Anuluj-from-edit returns to `view` + `form.reset`, does not close; ✕/Escape/Zamknij closes.
- [ ] Focus moves to first verifier input on enter-edit, back to «Edycja» trigger on leave-edit; focus-trap covers both modes.
- [ ] Works in dark mode via tokens only — no `[style*=]` hacks. `bg-input/40` legible on `#1f1f1f`; `text-brand` (`#ef4444` dark) dopłata number passes AA.
- [ ] **0** new color/radius/shadow/font tokens; `Dialog.tsx`, `tailwind.config.ts`, `globals.css` unchanged.

### 6.5.11 Deviations (web-agent implementation, Phase 7.1)

Implementation lands as **one new component `apps/web/components/claims/ClaimModal.tsx`**, replacing both `ClaimVerificationModal.tsx` and `ClaimDetailModal.tsx` (both deleted). The catalogue (§6.5.9) said "container `ClaimVerificationModal.tsx`"; the merged surface is renamed `ClaimModal.tsx` since it is no longer "verification-only" (it now covers the read-only `view` mode too). No behavioural deviation — same DTO contract, same `UpdateClaimSchema` discriminated-union submit, same `/preview` recalc.

Documented deviations from the literal §6.5 text, each within brand/token constraints:

1. **Maksim-gate applicability (automatic, этап 5.1).** There is no client-side threshold check and no manual authorization surface. The `MaksimGateBlock` is gated purely on **claim status**: rendered when `status === 'OCZEKUJE_NA_AUTORYZACJE'`, omitted otherwise. The backend owns the threshold (`getAuthThreshold`): it auto-enters the status on save-over-threshold and auto-rolls back to `NA_WERYFIKACJI` on an admin edit that drops under it. The block **does** carry a screenshot `<FileUpload>` (Maksim's confirmation) — this is the one FileUpload on the surface; there is no other manual authorization control (no «Wymaga autoryzacji» button, no manual `kwotaMaksima` input).
2. **dopłata locked field is a static computed display, not an RHF-registered input.** §6.5.4 says "render verbatim the `amountApproved` recipe with `readOnly` RHF registration". The standalone dopłata block (above decyzja) is the *live preview consequence* and is never submitted on its own, so it renders as a static muted value (`bg-input/40` + `<Lock>` + `<FormDescription>` "wyliczana automatycznie") rather than a registered `<input readOnly>`. The **RHF-registered** locked `amountApproved` field still exists inside the ZAAKCEPTOWANO decision branch (§6.5.5), bound to the same live-computed value — so the submitted payload is unchanged.
3. **Decyzja inputs are gated behind `edit` mode.** In `view` the decyzja block renders a muted "pick edit to decide" hint instead of the live `<Select>` — a decision is an edit, so it belongs to `edit` mode. The select + conditional fields appear the instant «Edycja» is pressed (no re-mount). This is consistent with §6.5.6's "leaf controls flip static⇄input" rule applied to the decyzja sub-tree. **On enter-edit the select shows the placeholder «wybierz decyzję» (no pre-selected `targetStatus`)** and no conditional fields render until a decision is picked; decision required-field validation fires only on «Zapisz» (see §6.5.5 "No pre-selected decision").
4. **Acceptance gated by recalc result.** Acceptance options are disabled (and any prior acceptance selection cleared) whenever the live recalc yields `kmDifference <= 0` (guarantee met ⇒ no payout); only rejection options remain, with the hint «Gwarancja wyjeżdżona — wniosek można tylko odrzucić». UI guard only; backend independently hard-rejects acceptance with `422` (see §6.5.5 "Acceptance gate by recalc result").

### 6.5.12 Decyzja block — visual containment (REFINEMENT 2026-07-18 — AUTHORITATIVE)

> **Problem being fixed.** In `ClaimModal.tsx` every body block (`FactPairs`, `DoplataBlock`, `MaksimGateBlock`, `DecisionFields`, `SecondaryPanel`) renders as the same flat `<section>` with a `border-t border-border pt-5` divider and a `text-xs uppercase text-text-sub` header. The result: the verifier cannot see where *reading/verifying data* ends and *committing a decision* begins — «wszystko się zlewa». The decyzja block is the only **irreversible, state-changing** block on the surface and must be visually containerised, not merely divided.

**Decision: the decyzja block becomes a contained panel (`<DecisionPanel>`), not a divided section.** Everything above it stays flat/divided (they are all *reading* steps of one narrative); decyzja is the *commitment* step, so it gets a box.

#### Container recipe (existing tokens only — 0 new tokens)

| Aspect | Value | Rationale |
|---|---|---|
| Wrapper | `mt-6 rounded-xl border border-border border-t-[3px] border-t-brand bg-card p-4 sm:p-5 space-y-4` | The **3px brand-red top rule** is the deliberate reuse of the login-card brand anchor (§`<LoginCard>` — 4px brand top border). Brand red = "this is the moment that matters" and is already the app's commit/primary colour. |
| Divider above | **REMOVED** — the decyzja section must NOT carry `border-t border-border pt-5` | A hairline rule says «same family, next item». A card says «different kind of thing». Keeping both double-signals and reads as a stray line above the box. Separation is carried by `mt-6` + the panel border. |
| Surface | **`bg-card`** (same as modal body) | Deliberate: the panel contains **editable inputs** (`bg-input`). If the panel itself were `bg-input`/`bg-input/40`, the inputs would lose their surface contrast *and* would collide with the locked-field language (§6.5.13, where `bg-input/40` means «you cannot type here»). Containment is carried by border + radius + padding, not by a fill. |
| Shadow | **none** | The panel is inside an already-elevated `shadow-modal` dialog; a nested shadow reads as a floating popover. |
| Radius | `rounded-xl` (12px, the card radius) | Matches the dialog/card family. |

#### Header inside the panel

The decyzja header is **promoted** out of the `text-xs uppercase text-text-sub` section-label class used by the blocks above it — that class is for *field-group labels*, and using it here is exactly why decyzja reads as "just another group".

```
[⚖ Gavel 16px, text-brand]  Decyzja            ← text-sm font-bold text-text
Ostatni krok — wybierz, co dzieje się z wnioskiem.  ← text-xs text-text-sub, mt-0.5
```

- Icon: Lucide **`<Gavel size={16} className="text-brand" />`**, `aria-hidden`, in a `flex items-center gap-2` row with the title. It is the only brand-coloured glyph in the modal body — that exclusivity is the point.
- Title: `text-sm font-bold text-text` (**not** uppercase, **not** `text-text-sub`). The step-up in weight/colour vs. `DANE WNIOSKU` / `DOPŁATA` is the primary hierarchy signal.
- Subtitle: `text-xs text-text-sub`, one line, i18n key `employee.claims.modal.unified.decyzjaSubtitle` — PL «Ostatni krok — wybierz, co dzieje się z wnioskiem.» / EN "Final step — choose what happens to this claim."
- The panel keeps the **same shell in all three render branches** (terminal-state note, view-mode «edit to decide» hint, edit-mode `<DecisionFields>`). Never render the hint bare and the fields boxed — the container must not appear/disappear across `mode`, per §6.5.6's no-jump rule. The existing muted `<p className="rounded-md border border-border bg-input …">` hints move *inside* the panel and drop their own border (`bg-input/40 rounded-md p-3 text-sm text-text-sub`) — a bordered note inside a bordered panel is double-chrome.
- The gate hints (`gateHint`, `decisionBlockedHint`, `guaranteeMetHint`) stay inside the panel, under the fields, `text-xs text-text-sub`, `role="status"` — unchanged.

#### Footer — «Zapisz weryfikację» vs «Zapisz» disambiguation (locked)

Two save buttons sitting adjacent in the same right-hand cluster with near-identical labels is the second half of the same complaint. Fix, in order of importance:

1. **Physically split the clusters.** `Zapisz weryfikację` moves to the footer's **left slot** (`mr-auto`), away from `[Anuluj] [Zapisz …]` on the right. Footer becomes `flex items-center gap-2` with the verify button carrying `mr-auto`. This mirrors the §6.5.6 footer table (destructive/secondary left, flow-actions right).
2. **Rename the primary.** When the decyzja panel is present (`isEdit && targets.length > 0`) the submit label is **«Zapisz decyzję»** (key `employee.claims.modal.edit.submitDecision`, EN "Save decision"), not the bare «Zapisz». The bare label stays for any future edit-only variant. A bare «Zapisz» next to «Zapisz weryfikację» is unresolvable without reading intent into a prefix.
3. **Reason on hover.** Native `title` on the verify button (no `<Tooltip>` component exists — same policy as §(b)): key `employee.claims.modal.edit.verifyButtonHint` — PL «Zapisuje skorygowane dane weryfikacji. Nie podejmuje decyzji.» / EN "Saves the corrected verification data. Does not make a decision."
4. Icons stay as they are (`<BadgeCheck>` on verify, none on the primary) — the icon on the secondary and none on the primary is already a differentiator; do not add an icon to the primary.

#### Acceptance (§6.5.12)

- [ ] Decyzja renders inside `<DecisionPanel>` — `rounded-xl border border-border border-t-[3px] border-t-brand bg-card p-4 sm:p-5`, `mt-6`, **no** `border-t border-border pt-5` divider on that section.
- [ ] Panel header = `<Gavel>` (`text-brand`) + `text-sm font-bold text-text` title + `text-xs text-text-sub` subtitle. No uppercase micro-label.
- [ ] Panel shell identical in terminal-state / view / edit branches; inner hints lose their own border.
- [ ] Footer: verify button in the left slot (`mr-auto`) with a `title` hint; primary label «Zapisz decyzję» when the decyzja panel is present.
- [ ] 0 new colour/radius/shadow tokens; dark mode via tokens only (`border-t-brand` = `#ef4444` dark, decorative — no contrast requirement).

### 6.5.13 «This field is locked because…» — the unified lock language (NEW 2026-07-18 — AUTHORITATIVE)

> **Scope.** One pattern for every "you cannot edit this right now" case across the wniosek surface, so three new lock cases do not spawn three styles. **Applies project-wide** to any form field/block that becomes non-editable for a *state or role* reason.
> **Canon settled:** the locked/computed rendering of `amountApproved` in `ClaimModal.tsx` **is** the canon — it already is §(b) "Read-only / computed field pattern" rendered verbatim. (The former admin-override *editable* branch of `amountApproved` — the «kwota Maksima» override — is **removed**, этап 5.1; `amountApproved` is now always the server-computed locked/computed field, never manually edited.) There are not two lock styles today and there must never be a third.

#### The two tiers (locked — pick by scope, never mix)

| Tier | When | Treatment | Reason shown |
|---|---|---|---|
| **A. Field-level lock** | **One** field is non-editable among editable siblings | §(b) canonical recipe **verbatim**: real `<Input readOnly tabIndex={-1} aria-readonly="true">` (never `disabled`), `bg-input/40 pr-9 font-semibold tabular-nums text-text-sub cursor-not-allowed focus:border-border focus:ring-0`, in-field `<Lock className="… size-3.5 text-text-sub/70">`, `<FormDescription className="flex items-center gap-1"><Lock className="size-3"/>…` | `<FormDescription>` = short reason (always visible) + native `title` = the fuller sentence |
| **B. Block-level lock** | A **whole section** (≥3 fields) is non-editable | Render the block in its existing **static / `view`** form. Do **not** render N greyed inputs, do **not** stamp N lock icons. | **ONE** `<LockNotice>` immediately above the block |

**Hard rule:** never express a block-level lock as a field-level one. Six locked inputs = six lock glyphs = six times the noise for one reason.

**Hard rule:** an action that is **impossible for this role in this state** is **removed, not disabled** (consistent with the §"Role-gated navigation" rule «что роль не видит — не рендерится»). Its reason is already carried by the block-level `<LockNotice>` for the same state — do not also render a dead disabled button.

#### `<LockNotice>` — new primitive (`components/ui/LockNotice.tsx`)

A quiet informational line. **Posture copied from §7.7.1b's lag-note: a locked field caused by a normal workflow state is NOT an error** — no `<Alert>`, no `bg-warning`/`bg-danger`, no dismiss button, no icon colour.

```
[🔒 Lock 14px, text-text-sub]  <reason sentence>
```

| Aspect | Value |
|---|---|
| Element | `<p role="note" id={id}>` |
| Classes | `flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 text-xs text-text-sub` |
| Icon | Lucide `<Lock size={14} aria-hidden className="mt-0.5 shrink-0" />` — inherits `text-text-sub`, **never** semantic-coloured |
| Placement | Directly **above** the locked block, inside the block's `<section>`, before the section header's content or immediately after it (web-agent's call — must be above the first locked field) |
| a11y | `id` on the notice; the locked block's container carries `aria-describedby={id}` and `aria-disabled="true"` |
| Contrast | `text-text-sub` on `bg-input` = 4.6:1 light / 6.4:1 dark → AA at 12px ✔ |
| Props | `{ children: ReactNode; id?: string; className?: string }` — copy is passed in, the component owns no i18n |

#### Reason copy — the non-negotiable rule

**Every lock states its CAUSE, never only its STATE.** Banned: a bare «Pole zablokowane.», «Tylko do odczytu», a grey field with no text at all. Required shape (PL default):

> **«Zablokowane — <przyczyna>.»**  ·  ≤ ~90 chars for the visible line; the `title` may add one clause of detail.

#### The two cases — locked mapping

> **Note (этап 5.1).** The former **case 1** (`amountApproved` locked because `amountMaximum != null` — the manual «kwota Maksima» override) is **removed**: the whole «kwota Maksima» concept is gone (field `amountMaximum` deleted from the DB, keys `amountApprovedLockedMaksim*` / `maksimAmountRef` / `maksimOverride*` retired). Only the two workflow-state locks below remain.

| # | Case | Tier | i18n key (`employee.claims.modal.locked.*` unless noted) | PL (default) | EN |
|---|---|---|---|---|---|
| 1 | `FactPairs` read-only for `pracownik` when status = `OCZEKUJE_NA_AUTORYZACJE` | **B** (block) | `factsPendingAuthorization` | «Dane weryfikacji są zablokowane — wniosek czeka na autoryzację Maksima. Zmiany może wprowadzić tylko administrator.» | "Verification data is locked — the claim is awaiting Maksim's authorisation. Only an administrator can make changes." |
| | ↳ same status, role = `admin` (facts still editable) | **B** (notice only, no lock) | `factsPendingAuthorizationAdmin` | «Wniosek czeka na autoryzację Maksima. Jako administrator możesz nadal korygować dane weryfikacji.» | "The claim is awaiting Maksim's authorisation. As an administrator you can still correct the verification data." |
| 2 | «Zapisz weryfikację» hidden for non-`admin` at `OCZEKUJE_NA_AUTORYZACJE` | **removed, not disabled** | — (no key) | reason already carried by case 1's notice | — |

**Case 1 detail (locked).** `pracownik` at `OCZEKUJE_NA_AUTORYZACJE` sees the fact block rendered exactly as `mode === 'view'` (static pair rows, `bg-input/40` declared cells, no inputs) even though the modal is in `edit` — the decyzja panel below stays live. This is the §6.5.6 "leaf controls flip static⇄input" rule applied per-block. The `<LockNotice>` sits above the `DANE WNIOSKU / DANE PO WERYFIKACJI` headers. The `admin` variant renders the notice **without** locking anything (informational — it explains why the surface feels different from the usual verification pass). An admin edit that drops dopłata under `getAuthThreshold` triggers the backend auto-rollback to `NA_WERYFIKACJI` (§6.5.7).

#### Anti-patterns (kill on sight)

- ❌ `disabled` on a locked *value* field (use `readOnly` + the §(b) surface). `disabled` stays reserved for **buttons** and for inputs that are inert for a *transient* reason (mutation in flight).
- ❌ `opacity-50` as a read-only affordance — that is the `disabled` recipe (§Form patterns) and reads as "broken", not "intentionally locked".
- ❌ A grey field with no reason text anywhere.
- ❌ More than one lock affordance per logical block (notice **or** per-field lock, never both).
- ❌ Semantic colour (warning/danger) on a lock caused by a normal workflow state — see §7.7.1a: "locked ≠ error".
- ❌ Adding a `<Tooltip>` dependency for the reason — native `title` remains the policy.

#### Catalogue additions (§6.5.12 + §6.5.13)

| Component | Kind | File |
|---|---|---|
| `<LockNotice>` | new custom primitive (reusable project-wide) | `apps/web/components/ui/LockNotice.tsx` |
| `<DecisionPanel>` | composition (may stay inline in `ClaimModal.tsx`) | `apps/web/components/claims/ClaimModal.tsx` |

**Tokens: 0 new.** Composes `bg-card`, `bg-input`, `bg-input/40`, `border-border`, `border-t-brand`, `text-brand`, `text-text`, `text-text-sub`, `rounded-xl`, `rounded-md`. No `tailwind.config.ts` / `globals.css` change.

#### Acceptance (§6.5.13)

- [ ] Exactly **one** lock visual language in the modal: §(b) recipe for field-level, `<LockNotice>` for block-level. No third style introduced.
- [ ] Every locked surface states its **cause** in visible text; no grey-with-no-reason field exists.
- [ ] `FactPairs` for `pracownik` @ `OCZEKUJE_NA_AUTORYZACJE` renders in static `view` form + one `<LockNotice>` above it; `admin` sees the informational variant with editing intact.
- [ ] «Zapisz weryfikację» is **absent** (not disabled) for non-admin in that status.
- [ ] `<LockNotice>` is neutral-coloured, `role="note"`, referenced via `aria-describedby` from the locked block; `aria-disabled="true"` on that block.
- [ ] AA contrast verified in both themes; 0 new tokens.

### 6.5.14 Kwota Maksima vs kwota zatwierdzona — REMOVED (этап 5.1)

> ❌ **This entire section is removed.** The «kwota Maksima» concept — a manually-entered `amountMaximum` acting as a reference/override against `amountApproved`, the `pracownik`-locked / `admin`-editable split keyed on `amountMaximum != null`, the `<AmountOverrideRow>` comparison component, and the «Nadpisano decyzję Maksima» divergence band — no longer exists. The DB field `amountMaximum` is deleted; there is no second amount to reconcile against.
>
> **Retired with it (removed from `pl.json` / `en.json` — web-agent):** `employee.claims.modal.edit.amountMaximum`, `edit.margin`, `edit.amountApprovedLockedMaksim`, `edit.amountApprovedLockedMaksimHint`, `edit.maksimAmountRef`, `edit.maksimOverrideTitle`, `edit.maksimOverrideBadge`, `edit.maksimOverrideConsequence`, `edit.maksimOverrideCommentHint`, `edit.amountApprovedFromMaksim`, plus the `targetStatus.OCZEKUJE_NA_AUTORYZACJE` decision option and the `unified.secondaryAuthorization` / `auth.*` (manual Autoryzacja tab) keys. Component `<AmountOverrideRow>` is deleted.
>
> **What replaces it:** nothing on the pracownik side — `amountApproved` is simply the server-computed approved amount (locked/computed field per §6.5.4 / §(b)), with no competing «kwota Maksima» number. Authorization over the threshold is now the **automatic Maksim-gate** (`MaksimGateBlock`, §6.5.7), whose only stored artefact is the confirmation-screenshot upload — not a manually keyed amount.

### 6.5.15 Reklamacja in the staff `ClaimModal` (NEW 2026-07-31 — AUTHORITATIVE)

> **Scope.** The `pracownik` / `admin` side of the reworked reklamacja, inside the existing unified surface `apps/web/components/claims/ClaimModal.tsx`. Carrier-side surfaces (the submit sheet, the eligibility predicate, the detail-page outcome block, the «Wypłacono łącznie» total) are spec'd in Phase 3 → «Reklamacja sheet» + «Reklamacja — carrier claim-detail outcome block». **Read both; they share the same field names and the same resolution vocabulary.**
>
> **The one thing that changed hardest:** the pracownik **no longer types an amount** when accepting a reklamacja. The paid amount **is** the carrier's requested kwota, byte-for-byte. The old editable `reklamacjaAmount` input in the accept branch is **deleted**; the kwota is shown read-only instead.

#### A. `<ReklamacjaBlock>` — read-only submission block (②c in the §6.5.2 stack)

**Visibility:** `claim.reklamacjaSubmitted === true`. Independent of `status`, of `mode`, and of the resolution — a decided reklamacja stays visible forever (the claim status no longer records it, so this block is the *only* staff-side trace besides Historia).

**Placement (locked):** a flat `<section>` in the `<DialogBody>` stack **between** `MaksimGateBlock` (§6.5.7) and the `<DecisionPanel>` (§6.5.12) — i.e. the last thing the verifier reads before deciding. It keeps the standard block chrome used by every non-decision section (`border-t border-border pt-5` + `text-xs font-bold uppercase tracking-wider text-text-sub` header «REKLAMACJA»), **not** the boxed `<DecisionPanel>` treatment: it is a *reading* step, and the box is reserved for the commitment step.

Rationale for the position: facts → dopłata → *what the carrier is disputing* → decision. Putting it above the facts would make the modal open on a complaint; putting it below the decision panel would hide the input to the decision beneath the decision itself.

**Header row:** `flex items-center justify-between gap-3` → the uppercase micro-label on the left, `<ReklamacjaResolutionChip>` on the right (pending / UZNANA / ODRZUCONA — same component and same tones as the carrier side; see the carrier outcome-block table).

**Fields (read-only, `<dl>` `grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm`; label `text-[11px] uppercase tracking-wider text-text-sub`, value `text-text`):**

| # | Row | Label PL | Value | Notes |
|---|---|---|---|---|
| 1 | **Kwota reklamacji** | «Kwota reklamacji» | `reklamacjaAmount` | `font-semibold tabular-nums`. **This is the amount that will be paid on UZNANA** — nothing recomputes it. |
| 2 | **Maksimum w chwili zgłoszenia** | «Maksimum (wnioskowana − wypłacona)» | `origPaymentEur − (amountApproved ?? 0)` rendered as `{max} € = {requested} € − {paid} €` | The reviewer's sanity check: was the ask within the ceiling? `tabular-nums`, `text-text-sub`. **Derived for display only** — computed from fields already on the DTO, never re-validated client-side. If `amountApproved == null` (claim was rejected) render `{max} € = {requested} € − 0,00 €` and append the muted clause «(wniosek odrzucony)». |
| 3 | **Data zgłoszenia** | «Zgłoszono» | `reklamacjaSubmittedAt` | date-only via the modal's existing formatter, consistent with the other modal dates. |
| 4 | **Treść** | «Treść reklamacji» | `reklamacjaText` | `sm:col-span-2`, `whitespace-pre-wrap`, on `bg-input/40 rounded-md p-3` — the muted read-only surface (§6.5.3), so a long carrier paragraph reads as quoted reference material, not as an input. |
| 5 | **Nr zlecenia (reklamacji)** | «Nr zlecenia» | `reklamacjaOrderNumber` | only after a **UZNANA** decision, `font-mono`. Omit when null (never `—`). |
| 6 | **Data rozpatrzenia** | «Rozpatrzono» | `reklamacjaDecidedAt` | only when `reklamacjaResolution != null`. |
| 7 | **Odpowiedź / powód** | «Odpowiedź» | `reklamacjaResponse` | only when non-empty, `sm:col-span-2`, same muted quoted surface as row 4. |

Rows 5–7 are the **post-decision** half: before the decision the block is rows 1–4 + the pending chip; after it, rows 1–7 + the resolution chip. **No banner, no tint on the section** — the chip carries the tone. (The tinted state-banner treatment belongs to the carrier's detail page, whose reader needs the emotional readout; the staff modal is a work surface.)

#### B. Decision UX when `status === 'REKLAMACJA'`

Everything happens inside the existing `<DecisionPanel>` (§6.5.12) — same box, same `<Gavel>` header, same footer logic. Only the `targetStatus` option set and its conditional fields change.

**Option set (locked):**

| `claim.status` | `targetStatus` options offered |
|---|---|
| `NA_WERYFIKACJI`, `OCZEKUJE_NA_AUTORYZACJE` | `ZAAKCEPTOWANO` · `ODRZUCONO` (existing) |
| **`REKLAMACJA`** | **`REKLAMACJA_ZAAKCEPTOWANO` · `REKLAMACJA_ODRZUCONO` — and nothing else.** The plain accept/reject options are **removed from the list** (not disabled): the claim's own decision is already made and is not being re-taken; only the reklamacja is being decided. |

Option labels (PL, `employee.claims.modal.edit.targetStatus.*`): «Uznaj reklamację» / «Odrzuć reklamację». Verb-first, because the select is an action chooser, not a status display — matching the existing accept/reject wording pattern.

**Accept branch — `REKLAMACJA_ZAAKCEPTOWANO`** (`<FormGrid cols={2}>`):

| Field | Control | Rules |
|---|---|---|
| `reklamacjaOrderNumber` | `<FormField label="Nr zlecenia" required>` + `<Input>` (`font-mono`) | **Required.** Prefilled from `claim.orderNumber` **when present**; the field is **fully editable** and **may legitimately start empty** (a rejected claim has no `orderNumber`). Prefill is a convenience, never a lock — do **not** render it as read-only, do **not** re-prefill after the user has typed (seed once on entering `edit`). |
| Kwota reklamacji | **read-only value, not an input** | Renders the §(b) locked/computed recipe **without** the `<Lock>` icon → the muted declared-value treatment of §6.5.3 (`bg-input/40`, `text-text-sub`, `font-semibold tabular-nums`, `readOnly tabIndex={-1} aria-readonly="true"`). Label «Kwota do wypłaty (z reklamacji)». Value = `claim.reklamacjaAmount`, verbatim. |
| `comment` | `<FormField label="Komentarz">` + `<Textarea rows={3}>` | **Optional.** Placeholder «Opcjonalna notatka do decyzji». `sm:col-span-2`. |

**Helper text under `reklamacjaOrderNumber`** (`<FormDescription>`, `employee.claims.modal.edit.reklamacjaOrderNumberHint`):

> «Może to być poprawiony numer poprzedniego zlecenia albo całkiem nowe zlecenie — wpisz numer, na który zostanie wypłacona kwota reklamacji.»

**Why the kwota is not an input (locked, and the field is *gone*, not disabled).** The paid amount is defined by the carrier's request, which was already validated against the ceiling at submit time. An editable staff amount would (a) invent a second, unvalidated number, (b) re-open the ceiling question in a surface with no ceiling context, and (c) contradict the block above it. Per §6.5.13's hard rule an impossible action is **removed** — so there is no greyed «Kwota reklamacji» input in the accept branch. The read-only echo stays *because* the verifier is about to authorise that exact figure and must see it inside the commitment box, not only in the section above.

**Reject branch — `REKLAMACJA_ODRZUCONO`:**

| Field | Control | Rules |
|---|---|---|
| `reklamacjaResponse` | `<FormField label="Powód odrzucenia reklamacji" required>` + `<Textarea rows={4}>` | **Required**, min 10 chars (same posture as the existing `ODRZUCONO` → `komentarz`). Placeholder «Wyjaśnij przewoźnikowi, dlaczego reklamacja nie została uznana». `sm:col-span-2`. |

The carrier reads this verbatim in `<ReklamacjaOutcome>` row 6 — copy the "written for the carrier, not for the file" posture from the existing rejection-reason field. **There is no order-number and no amount in this branch.**

**Panel subtitle when `status === 'REKLAMACJA'`** (replaces the generic §6.5.12 subtitle, key `…unified.decyzjaSubtitleReklamacja`):

> «Ostatni krok — zdecyduj, czy reklamacja zostanie uznana.»

**Footer.** Unchanged mechanics (§6.5.12): primary label «Zapisz decyzję», verify button keeps the left slot. No new button.

**Status-after-decision — a `<LockNotice>`-toned informational line, not a warning** (`text-xs text-text-sub`, `role="status"`, under the fields, key `…edit.reklamacjaStatusReturnHint`):

> «Po zapisaniu wniosek wróci do statusu **{status}** — wynik reklamacji będzie widoczny jako osobna informacja.»

`{status}` = the PL label of `statusBeforeReklamacja` via `<StatusBadge>`'s label map. This exists because the verifier would otherwise read the status snapping back to «Odrzucono» as their decision having been lost. Neutral tone — nothing is wrong (§7.7.1a "a state is not an error").

#### C. After the decision — where the outcome lives

| Surface | Treatment |
|---|---|
| `<ReklamacjaBlock>` (§A) | Chip flips warning → `success` (UZNANA) / `danger` (ODRZUCONA); rows 5–7 appear. This is the primary staff-side readout. |
| `<StatusBadge>` in the modal header | Shows `statusBeforeReklamacja` again. **Carries no reklamacja meaning** — do not append «(reklamacja)» to the badge label, do not add a badge variant. |
| `<DecisionPanel>` | Falls back to its **terminal-state** branch (the existing muted note inside the same panel shell — never an empty or missing box, §6.5.12). Note copy: «Reklamacja została już rozpatrzona.» |
| Employee `<ClaimsTable>` | `<ReklamacjaResolutionChip>` as a **secondary** chip under the status cell (or trailing it), never replacing `<StatusBadge>`. This is the only way a reklamacja outcome is visible in a list, so it must be there. |
| **Historia** (§6.5.7) | See below. |

**Historia extension (§6.5.7).** The diff section already renders `reklamacjaText` / `reklamacjaResponse`. Extend the same read-only diff/record list with **`reklamacjaAmount`, `reklamacjaOrderNumber`, `reklamacjaSubmittedAt`, `reklamacjaDecidedAt`** — same rows, same `bg-warning/10` changed-emphasis, same «Pierwotnie / Aktualnie» columns, and the same "render only when non-empty" rule. No new layout. Historia's visibility trigger (`claim.origData != null`) is unchanged.

> **Do not duplicate.** `<ReklamacjaBlock>` (§A) is the *current state*; Historia is the *frozen pre-reklamacja mirror* (`origData`, see `docs/19-known-quirks.md` #reklamacja-mirror). Same field names, different questions — «what is being claimed now» vs «what did the claim look like before». Both may show `reklamacjaAmount`; that is not duplication, it is the diff.

#### D. Open question flagged for the owner (do NOT change unilaterally)

⚠️ **The §6.5.5 acceptance gate currently disables `REKLAMACJA_ZAAKCEPTOWANO` when the live recalc yields `kmDifference <= 0`.** With the rework, an uznana reklamacja pays `reklamacjaAmount` (the carrier's figure) and **not** a recalculated dopłata — so the "guarantee met ⇒ nothing to pay" rationale no longer transfers to the reklamacja branch, and a legitimate reklamacja on a *rejected* claim could be blocked by it. **Left as-is in this doc** (it is a business rule, not a design decision) — routed to the owner / api-agent. Design position, if asked: keep the gate for `ZAAKCEPTOWANO`, drop it for `REKLAMACJA_ZAAKCEPTOWANO`.

#### E. Catalogue, tokens, i18n

| Component | Kind | File |
|---|---|---|
| `<ReklamacjaBlock>` | new composition (may stay inline in `ClaimModal.tsx`, like `<DecisionPanel>`) | `apps/web/components/claims/ClaimModal.tsx` |
| `<ReklamacjaResolutionChip>` | thin `<Badge>` wrapper, shared with the carrier panel | `apps/web/components/claims/ReklamacjaResolutionChip.tsx` |
| ~~editable `reklamacjaAmount` input~~ | **DELETED** from the accept branch | — |

**Tokens: 0 new.** Composes `bg-input/40`, `bg-card`, `border-border`, `border-t-brand`, `text-text`, `text-text-sub`, `text-brand`, `success`/`danger`/`warning` badge variants, `rounded-md`/`rounded-xl`. No `globals.css` / Tailwind-config change (Phase 4.4 policy).

**New i18n keys (PL default; EN mirrored later):** `employee.claims.modal.reklamacja.{title,amount,maxAtSubmit,submittedAt,text,orderNumber,decidedAt,response,resolution.{pending,uznana,odrzucona},alreadyResolved}`, `employee.claims.modal.edit.{targetStatus.REKLAMACJA_ZAAKCEPTOWANO,targetStatus.REKLAMACJA_ODRZUCONO,reklamacjaOrderNumber,reklamacjaOrderNumberHint,reklamacjaPayoutAmount,reklamacjaResponse,reklamacjaResponsePlaceholder,reklamacjaStatusReturnHint}`, `employee.claims.modal.unified.decyzjaSubtitleReklamacja`. **Retired:** any `edit.reklamacjaAmount*` key belonging to the deleted amount input.

#### F. Acceptance checklist (§6.5.15)

- [ ] `<ReklamacjaBlock>` renders whenever `reklamacjaSubmitted`, between `MaksimGateBlock` and `<DecisionPanel>`, with flat section chrome (no box) + resolution chip in its header.
- [ ] Block shows kwota, the «wnioskowana − wypłacona» maximum with both addends, submittedAt and treść; treść/odpowiedź on the muted `bg-input/40` quoted surface.
- [ ] At `status === 'REKLAMACJA'` the `targetStatus` select offers **exactly** `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO`; plain accept/reject are **absent**, not disabled.
- [ ] Accept branch: `reklamacjaOrderNumber` required + prefilled-once from `claim.orderNumber` (may start empty) + helper text about amended/new zlecenie; **no amount input anywhere**; carrier kwota shown read-only (`bg-input/40`, no `<Lock>`); comment optional.
- [ ] Reject branch: required reason textarea → `reklamacjaResponse`; no order number, no amount.
- [ ] «Status will return to X» hint rendered neutral (`text-text-sub`, `role="status"`), never warning/danger tinted.
- [ ] After the decision: chip flips success/danger, rows 5–7 appear, `<DecisionPanel>` shows its terminal note in the **same box**, `<StatusBadge>` unchanged and un-annotated.
- [ ] Historia additionally lists `reklamacjaAmount` / `reklamacjaOrderNumber` / `reklamacjaSubmittedAt` / `reklamacjaDecidedAt` when present.
- [ ] `<ReklamacjaResolutionChip>` appears in the employee claims list as a **secondary** chip, never in the `<StatusBadge>` slot.
- [ ] 0 new colour/radius/shadow/font tokens; dark mode via tokens only; AA contrast checked on all three chip tones.

## Phase 7 — Eksport / Weryfikator delegation panels

> ⚠️ **REWORK 2026-06-10 #2 — §7.1 (weryfikator delegation action-UI) is SUPERSEDED.** The weryfikator role no longer works with delegations; it now stamps a **vehicle route-status board** (table of all active vehicles, per-row «W trasie» / «Zjechał» status). The authoritative spec is **§7.5 — Weryfikator vehicle route-status board** (below). The §7.1 in-transit/returned confirm-dialogs, the `actions` column on the *delegations* table, and `<DelegationStatusActionDialog>` are removed from the build — kept below only as history (struck through). **The `eksport` parts (§7.2 nav for eksport, the read-only delegations витрина) are UNCHANGED and remain authoritative.**

> **Scope (eksport — current).** The `eksport` single-purpose role's `/delegations` screen. Spec: [`20-phase-7-eksport-weryfikator.md`](20-phase-7-eksport-weryfikator.md) (owner decisions §4, rework §0). `eksport` = read-only витрина. This section covers (1) ~~the weryfikator delegation action-UI~~ **superseded → §7.5** and (2) the nav recommendation for both roles. The table/filter/history-toggle layout is **not re-derived here** — both pages reuse the Phase 6.3 read-only role-panel pattern (§"Phase 6 — Planista / Dyspozytor read-only panels") inside `RoleShell`: the 4.4 container strip, the read-only info banner (eksport only), a status filter + «historia» toggle, and a `<DataTable>` with the Phase 6.3 Delegacje column set + a static `<StatusBadge>`. The eksport page is that pattern verbatim, read-only, full stop.
>
> **No new tokens** (Phase 4.4 surface policy holds). Everything below composes existing primitives: `<Dialog>` (+ `DialogHeader`/`DialogDescription`/`DialogFooter`), `<Input type="date">`, `<FormField>`, `<Button>`, `<StatusBadge>`. Zero changes to `tailwind.config.ts` / `globals.css`.

### 7.1 ~~Weryfikator per-row status actions (confirm dialogs)~~ — SUPERSEDED by §7.5

> ⚠️ **Superseded (rework 2026-06-10 #2).** Weryfikator no longer acts on delegations. The whole §7.1 below — the `actions` column on the *delegations* table, the in-transit / returned confirm dialogs, `<DelegationStatusActionDialog>` — is **removed from the build**. Do not implement it. Replaced by the vehicle route-status board in **§7.5**. Kept here only as history.

~~The weryfikator Delegacje table gets **one extra trailing column** (`actions`)~~ on top of the read-only Phase 6.3 column set. There are **EXACTLY TWO** actions, both driven off the row status. There is **NO cancel («Anuluj») button anywhere on this page** — owner decision (2026-06-10): weryfikator has no cancel authority; cancel stays carrier-only and is not represented in this UI. Do not render a cancel button, a kebab "anuluj" item, or any anulowanie affordance here.

**Status → action mapping (row-level):**

| Row `status` | Action button (PL / EN) | Variant | Dialog | Endpoint |
|---|---|---|---|---|
| `zgloszony` | «Oznacz w trasie» / "Mark in transit" | `<Button size="sm">` (brand default) | **plain confirm** (no input) | `POST /delegations/:id/in-transit` |
| `w_trasie` | «Oznacz zjechał» / "Mark returned" | `<Button size="sm">` (brand default) | **confirm + single date input** (`actualReturnAt`) | `POST /delegations/:id/returned` |
| `zjechal`, `anulowany` | — (no button) | — | — | — |

Terminal-status rows render **nothing** in the `actions` cell (an em-dash `—` in `text-text-sub` is acceptable to keep the column visually anchored). Each row exposes **at most one** action — the status is a strict state machine, so there is never a choice of two actions on the same row.

**Button placement.** Trailing `actions` column, right-aligned cell (`text-right`), single `<Button size="sm">` per the design system's `h-8` small button (≥32px tall; on the touch breakpoints the `<Button>` primitive already meets the 44px target via its hit-area padding — keep `size="sm"`, do not shrink below it). The button is the brand-red default variant in both cases: status advancement is the page's primary affordance, not a destructive one, so it leans on the brand button rather than a muted/ghost treatment. No icon is required; if one is wanted, `<Truck size={14}/>` for in-transit and `<CheckCircle2 size={14}/>` for returned (Lucide, leading, `mr-1.5`) — optional, keep labels.

**(a) `zgloszony` → «Oznacz w trasie» — plain confirm `<Dialog>` (no input).**
A bare confirmation, no form fields. Reuse the `<Dialog>` primitive directly (this is simpler than `ConfirmDeleteWithReasonDialog` — there is no input to validate):
- `DialogTitle` (PL): «Oznacz jako w trasie» / (EN) "Mark as in transit".
- `DialogDescription` (PL): «Wyjazd {plate} zostanie oznaczony jako w trasie.» / (EN) "Delegation {plate} will be marked as in transit." (interpolate the vehicle plate so the verifier sees exactly which row).
- `DialogFooter`: `<Button variant="ghost" size="sm">` «Anuluj» (this is the **dialog-dismiss** button — the standard modal "close without acting" control, NOT a delegation-cancel action; it does not call any cancel endpoint) + primary `<Button size="sm">` «Oznacz w trasie» which fires `in-transit`. On success the dialog closes, the table refetches, toast «Oznaczono jako w trasie».

> Naming note for web-agent: the ghost footer button reading «Anuluj» is the universal *dismiss-the-dialog* affordance (same word the rest of the DS uses for "close this modal"). The owner decision "no Anuluj button" refers to the **delegation-cancel business action**, which is genuinely absent here. Do not conflate them, and do not remove the dialog-dismiss button.

**(b) `w_trasie` → «Oznacz zjechał» — confirm `<Dialog>` with one date-only input.**
Structurally the `ConfirmDeleteWithReasonDialog` pattern (§Phase 4.4 shared confirm dialog) with the textarea swapped for a single date field; RHF + Zod, submit disabled until valid, dialog stays open on error so the date isn't re-typed:
- `DialogTitle` (PL): «Oznacz jako zjechał» / (EN) "Mark as returned".
- `DialogDescription` (PL): «Podaj faktyczną datę zjazdu dla wyjazdu {plate}.» / (EN) "Enter the actual return date for delegation {plate}."
- One `<FormField label="Data zjazdu" required>` wrapping `<Input type="date" className="h-10" autoFocus>` bound to `actualReturnAt`. **Date-only** — match the carrier delegation-create precedent (`plannedReturnAt` is `<Input type="date">`, DB column `@db.Date`); do **not** use `datetime-local`. EN label "Return date".
- `DialogFooter`: ghost «Anuluj» (dialog-dismiss, as in (a)) + primary «Oznacz zjechał» firing `returned` with `{ actualReturnAt }`. Success → close, refetch, toast «Oznaczono jako zjechał».

**Date-input validation expectation (Zod, in `@magguarantee/shared`):**
- `actualReturnAt` — **required** (empty string → inline error «Podaj datę zjazdu»). Submit button disabled while invalid (`mode: 'onChange'`, same as the reason-dialog).
- **date-only** string (`YYYY-MM-DD`), not a timestamp.
- **Suggested guard (not a hard owner requirement):** reject a **future** date — the verifier records a return that has already happened. Inline message «Data zjazdu nie może być w przyszłości». A lower-bound guard (`actualReturnAt >= departureAt`) is a reasonable additional sanity check if the row's `departureAt` is in scope; treat both as suggestions for the web/api agents to confirm, not locked DS rules. The backend re-validates regardless (never trust the client clock).

Both dialogs follow the established mutation flow: optimistic-free, `await onConfirm()`, close on resolve, keep open + parent toast on reject — identical to `ConfirmDeleteWithReasonDialog`.

### 7.2 Nav recommendation for `eksport` / `weryfikator` (opinionated — implement directly)

**Recommendation: redirect each role's landing route straight to `/delegations`. Delete the `WelcomePanel` stub for both roles.** Full design authority exercised — this is the call, web-agent may implement it directly.

Rationale:
- Each role has **exactly one destination**. A landing page whose only job is to point at the single real screen is a pointless extra click and an empty surface to maintain. The legacy app effectively dropped these roles straight onto their one list; "like legacy" is satisfied by going directly to the list.
- `RoleShell` is already sidebar-less, so there is no nav rail to populate — a `WelcomePanel` here is a dead-end card, not a hub. Removing it removes a stub, not a feature.
- Implementation: the role landing route (`app/(eksport)/eksport/page.tsx`, `app/(weryfikator)/weryfikator/page.tsx`) becomes a server-side `redirect('/eksport/delegations')` / `redirect('/weryfikator/delegations')` (Next.js `redirect()` in the route segment — no flash of an intermediate panel). The real screen lives at `.../delegations/page.tsx`. Keep both pages inside their existing `RoleShell` route group so the header (logo + role badge + theme/lang toggles + logout) is unchanged.
- Because the role then has a single in-shell screen, **no in-page `<Tabs>` sub-nav is needed** (unlike planista/dyspozytor, which have multiple fleet tabs). The Delegacje table is the whole page. If a second destination is ever added to either role, reintroduce the Phase 6.3 in-page `<Tabs>` bar at that point — not before.
- Header role-badge label: «Eksport» / «Weryfikator» (already role-driven by the shared `<Header>` — no change). The header's logo/home link should resolve to `/delegations` for these roles so "click the logo" is not a dead loop back through the redirect.

This deviates from the plan's "empty WelcomePanel stub" only to remove a no-op step; it does not change which screens exist or any permission. If the owner prefers to keep a literal welcome landing for consistency with multi-destination roles, that is a one-line revert (restore the `WelcomePanel`), but the recommendation stands: **redirect, no stub.**

### 7.3 Components / shared changes summary (Phase 7)

| Change | Where | Notes |
|---|---|---|
| ~~New `<DelegationStatusActionDialog>`~~ — **REMOVED** (rework #2) | ~~`apps/web/components/delegations/`~~ | Superseded by §7.5. Do not build. |
| ~~`actions` column on the weryfikator Delegacje `<DataTable>`~~ — **REMOVED** | — | Weryfikator no longer has a delegations table. See §7.5. |
| Reuse `<Dialog>` / `<Input type="date">` / `<FormField>` / `<Button>` / `<StatusBadge>` / `<DataTable>` | existing | No primitive changes. Read-only Phase 6.3 panel pattern for the **eksport** table. |
| Role landing routes → `redirect('/.../delegations')` (eksport) / `redirect('/.../vehicles')` (weryfikator, §7.5); delete `WelcomePanel` stubs | `app/(eksport)/eksport/page.tsx`, `app/(weryfikator)/weryfikator/page.tsx` | §7.2 (eksport) + §7.5 (weryfikator landing → `/weryfikator/vehicles`). |
| ~~shared Zod: `MarkReturnedSchema`~~ — **REMOVED** (delegation in-transit/returned dropped); new `SetVehicleRouteStatusSchema` in §7.5 | `@magguarantee/shared` | api-agent owns the contract. |
| i18n | `messages/pl.json`, `en.json` | **eksport** strings unchanged; ~~`weryfikator.actions.{inTransit,returned}`~~ delegation strings removed; new `weryfikator.*` vehicle-board strings per §7.5. |
| **0** changes to `tailwind.config.ts` / `globals.css` | — | Token policy respected. |

### 7.4 ~~Acceptance checklist (Phase 7 weryfikator action-UI)~~ — SUPERSEDED by §7.5

> ⚠️ **Superseded (rework 2026-06-10 #2).** The weryfikator delegation-action checks below no longer apply (no delegation actions for weryfikator). The **nav** check still applies but the weryfikator target changes to `/weryfikator/vehicles` (see §7.5.7). The **eksport** read-only витрина checks still apply. Use §7.5.7 for the weryfikator board's acceptance. Kept below as history.

- [ ] ~~**Exactly two actions, no cancel.**~~ `zgloszony` row → «Oznacz w trasie»; `w_trasie` row → «Oznacz zjechał»; `zjechal`/`anulowany` → no button. **No «Anuluj» delegation-cancel control anywhere** (the only «Anuluj» on the page is the dialog-dismiss footer button).
- [ ] **In-transit confirm = no input.** Plain `<Dialog>` confirm; fires `in-transit`; plate interpolated in the description.
- [ ] **Returned confirm = one date-only field.** `<Input type="date">` (not `datetime-local`), RHF + Zod, required; submit disabled until valid; future-date guard present (suggested) with an inline message; dialog stays open on error.
- [ ] **Token policy respected.** Zero `tailwind.config.ts` / `globals.css` changes; no new component tokens; all surfaces existing.
- [ ] **Nav.** `eksport` and `weryfikator` landing routes `redirect()` to `/delegations`; no `WelcomePanel` stub remains; header logo/home link points at `/delegations` for these roles; no in-page `<Tabs>` (single screen).
- [ ] **a11y.** Action buttons reach ≥44px touch target via `size="sm"` hit area; dialogs trap focus + close on Escape (from the `<Dialog>` primitive); date input has an associated `<Label>` via `<FormField htmlFor>`; status meaning carried by `<StatusBadge>` text + colour, not colour alone.
- [ ] **Dark-mode verified.** Both dialogs (`bg-card`), date input (`bg-input`), brand buttons, status badges legible with tokens / `dark:` variants only.

---

### 7.5 ~~Weryfikator vehicle route-status board~~ — SUPERSEDED by §7.7 (REWORK 2026-06-12 #3)

> ⛔ **SUPERSEDED — see §7.7 (Weekly km-board, REWORK 2026-06-12 #3).** Spec source: [`20-phase-7-eksport-weryfikator.md` §0′](20-phase-7-eksport-weryfikator.md). The per-vehicle, per-day **route-status** stamp («W trasie» / «Zjechał», `VehicleRouteStatusLog`) is **absorbed into the daily km-list** (`VehicleDailyKm`). The weryfikator no longer stamps a binary route status; they record **how many km each vehicle drove each day** on a **weekly grid** (row = vehicle, 7 day-columns). The derived vehicle status (`w ruchu` / `nie jeździ` / `nieznany`) is now computed *from the km cells* and shown only as header counters, not as a per-row badge column. The `vehicles/route-board` table, the two `outline` stamp buttons, and `<VehicleRouteStatusHistoryDialog>` (route-status flavour) are **removed from the build** — kept below as history. The §7.5.1 three-state tone-map survives conceptually (it maps cleanly onto the §7.7 derived statuses) and is reused; the rest is replaced. Route changes from `/weryfikator/vehicles` → **`/weryfikator/km`**.
>
> Below kept as history.

#### 7.5 (history) Weryfikator vehicle route-status board (rework 2026-06-10 #2)

> **Scope.** Replaces §7.1. The weryfikator no longer touches delegations. Their entire screen is now **one table of all active vehicles**, where they stamp each vehicle's *daily operational route-status* («W trasie» / «Zjechał») using info from an external GPS service + people outside the app. Spec source: [`20-phase-7-eksport-weryfikator.md` §0](20-phase-7-eksport-weryfikator.md). Route: `app/(weryfikator)/weryfikator/vehicles/page.tsx`.
>
> **No new tokens** (Phase 4.4 policy). Everything composes existing primitives: the Phase 6.3 read-only role-panel layout, `<DataTable>`, `<StatusBadge>` (existing `<Badge>` variants only — `success` / `muted` / `outline`), `<Button>`, `<Dialog>`. Zero `tailwind.config.ts` / `globals.css` changes.

#### 7.5.1 Status model + `StatusBadge` tone-map (three states, existing variants only)

The route-status is a **per-vehicle, per-day** signal derived from an append-only history table (`vehicle_route_statuses`). The stored enum has **two** values; the third is **derived** ("no history row dated today"):

| Board status | Source | `<Badge>` variant | Label PL | Label EN | Tone rationale |
|---|---|---|---|---|---|
| `w_trasie` | stored enum | `success` | «W trasie» | "On the road" | Vehicle is actively working — the positive operational signal. Matches the existing `DelegationStatus.w_trasie → success` precedent (§`<StatusBadge>` map). |
| `zjechal` | stored enum | `muted` | «Zjechał» | "Returned" | Vehicle is done/parked — neutral-settled, not alarming. Matches existing `DelegationStatus.zjechal → muted`. |
| `nieznany` | **derived** (no row for today) | `outline` | «Nie sprawdzono» | "Not checked" | **Default / neutral-muted.** This is the *normal* fresh-day state, NOT an error. Use the quietest badge — `outline` (transparent fill, `border-border`, `text-text-sub`). It must read as "not yet looked at", visually *recessive* vs. the two acted states. **Never** map to `warning` / `danger` (no orange/red) — that would frame an unchecked vehicle as a problem, which it isn't until policy says so. |

Tone-map decisions (locked):
- **`w_trasie` = `success`**, **`zjechal` = `muted`** — reuse the existing delegation precedent verbatim so the same two words carry the same colour anywhere in the app.
- **`nieznany` = `outline`**, deliberately *more recessive* than `muted` (`muted` has a soft grey fill; `outline` is fill-less). The hierarchy is: acted-positive (`success`, green) > acted-done (`muted`, grey fill) > **un-acted default** (`outline`, no fill). The eye lands on green «W trasie» rows first (those are live on the road), then the grey «Zjechał», and the unchecked rows sit quietest — correct for a board the verifier works *down* from top each morning.
- Wrapper: extend the existing `<StatusBadge>` (or a sibling `<VehicleRouteStatusBadge>`) with a `vehicleRouteStatus` const-map in `@magguarantee/shared` next to the `DelegationStatus` map. Same anatomy as the existing badge (`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap`). Optional Lucide leading icon (12px): `<Truck />` for `w_trasie`, `<ParkingSquare />` for `zjechal`, `<HelpCircle />` for `nieznany` — optional, label always present (status carried by text + colour, not colour alone — a11y).

#### 7.5.2 Table layout (reuse Phase 6.3 read-only panel + `<DataTable>`)

Same canonical container as the Phase 6.3 role panels (4.4 strip → page heading → `<DataTable>`), **but this one is NOT read-only** — it carries a single trailing `actions` column (the only mutating affordance the weryfikator has). No in-page `<Tabs>` — it's a single screen. A status filter (`<Select>`: wszystkie / w trasie / zjechał / nie sprawdzono) + optional search by plate/carrier sits in the `bg-input` filter row above the table (search-only chrome per the surface policy; the status filter is a read filter, not a mutation).

Columns (order). **No driver column** — the verifier works at vehicle granularity:

| col | header (PL) | content |
|---|---|---|
| `vehicle` | NUMER | `plateNumber` (primary, `font-medium tabular-nums`) + `sideNumber` under it as `text-xs text-text-sub` (`«bok {sideNumber}»`), or just plate if no side number. |
| `carrier` | PRZEWOŹNIK | `carrier.nazwa`, `truncate` (flex col per the Phase 6.4 `DataTableColumn.width`/`truncate` strategy). |
| `planista` | PLANISTA | `planner` full name or `—` if unassigned. |
| `status` | STATUS | `<StatusBadge>` per §7.5.1 (the derived `nieznany` computed client/server-side from "today's latest row"). Static indicator, no dropdown. |
| `notedMeta` | OZNACZONO | "who + when" meta cell — see §7.5.3. For `nieznany` rows renders `—` `text-text-sub`. |
| `actions` | — (blank header) | two stamp buttons, right-aligned — see §7.5.4. |

Row height + cell padding: Phase 2 `<DataTable>` standard (`h-12`, `px-3 py-2`). Whole-row click is **not** an edit (rows aren't a form); instead the row is clickable to open the **history modal** (§7.5.5) — pass `onRowClick` + `rowAriaLabel` («Pokaż historię statusu: {plateNumber}») per the Phase 6.4 clickable-row a11y enhancement. The trailing action buttons `e.stopPropagation()` so a stamp click doesn't also open history.

#### 7.5.3 `notedMeta` cell — "who + when noted"

Two stacked lines, compact:
- Line 1: actor — `notedBy` full name, or **«GPS»** in `text-text-sub` when `source = gps` (`notedById` null). `text-xs font-medium`.
- Line 2: relative-or-short timestamp `notedAt`, `text-xs text-text-sub tabular-nums` (e.g. «dziś 08:14» / today HH:mm; if the latest stored row is older than today the board still shows `nieznany`, so this cell is only populated for `w_trasie`/`zjechal` today). Optional tiny `source` hint: a `<Badge variant="muted" className="text-[10px]">GPS</Badge>` pill when GPS-sourced, so manual vs. automatic stamps are distinguishable at a glance.
- `nieznany` rows: single `—` `text-text-sub`, no second line.

#### 7.5.4 Per-row action affordance — two **re-stampable** buttons

Trailing `actions` cell, right-aligned (`flex justify-end gap-2`). **Always two buttons on every row**, regardless of current status — this is NOT a state machine. The board is a daily ledger: a vehicle can be re-marked any number of times (each click appends a new history row). So unlike the old delegation actions, both «W trasie» and «Zjechał» are **always present and always enabled**.

| Button | Label PL / EN | Variant | Endpoint |
|---|---|---|---|
| in-transit | «W trasie» / "On the road" | `<Button size="sm" variant="outline">` | `POST /vehicles/:id/route-status { status: 'w_trasie' }` |
| returned | «Zjechał» / "Returned" | `<Button size="sm" variant="outline">` | `POST /vehicles/:id/route-status { status: 'zjechal' }` |

Posture (locked):
- These are **routine, non-destructive status stamps**, not the page's headline CTA and not destructive — so they use the quiet **`outline`** button (not brand-red, not danger). This is the key posture difference from old §7.1, where status advancement *was* the brand-red primary. Here stamping happens many times a day across many rows; a wall of red buttons would scream. Outline keeps the board calm; the *colour signal* lives in the status badge, not the buttons.
- **Current-status button = active/pressed, not disabled.** Whichever status matches today's latest stamp renders in its semantic accent to show "this is the current state" while **staying clickable** (re-stamping is allowed — e.g. re-confirming «W trasie» appends a fresh-timestamp row). Treatment: the matching button gets `aria-pressed="true"` + a filled accent (`w_trasie` active → `variant="success"` style; `zjechal` active → a muted-filled style) while the other stays `outline`. Do **not** `disabled` the current button — disabling would block the legitimate "re-confirm / correct the timestamp" action and is the wrong affordance for an append-only ledger. For `nieznany` rows both buttons are plain `outline` (nothing stamped yet today).
- **No confirm dialog.** Unlike §7.1, a stamp is low-stakes and high-frequency — gating each on a modal would be hostile. Click → optimistic `POST` → toast («Oznaczono: W trasie» / «Oznaczono: Zjechał») → row badge + `notedMeta` update; on error rollback + `<Toast variant="destructive">`. (If a future policy needs an undo, prefer a toast-action «Cofnij» over a pre-confirm.)
- Touch target: `size="sm"` meets ≥44px via the `<Button>` hit-area on touch breakpoints (same rule as §7.1). On narrow viewports the two buttons may wrap or collapse to icon-only (`<Truck/>` / `<ParkingSquare/>` with `aria-label`) — keep both reachable.

#### 7.5.5 Per-vehicle history — `<VehicleRouteStatusHistoryDialog>` (`<Dialog>`)

Opened by row-click (§7.5.2). A centered `<Dialog>` (`bg-card`) showing the append-only route-status log for one vehicle, newest first.

- `DialogHeader`: title «Historia statusu — {plateNumber}» + `DialogDescription` carrier + side number (`text-sm text-text-sub`).
- Body: a vertical list (not a nested `<DataTable>` — it's a short log; a `<DataTable>` is overkill in a dialog). Each entry is a row:
  - left: `<StatusBadge>` for that entry's stored `status` (`w_trasie`/`zjechal` — history never contains the derived `nieznany`).
  - middle: actor — `notedBy` name or «GPS», `text-sm`; below it the `source` as a small `muted` pill («ręcznie» / "manual" vs «GPS»).
  - right: `notedAt` full date-time, `text-xs text-text-sub tabular-nums`, right-aligned. Optional `notes` on its own line `text-xs text-text-sub` when present.
  - Separator between entries: `divide-y divide-border`.
- Newest entry gets a subtle "current" marker (`text-text` weight vs. older `text-text-sub`), since the top row of today is what drives the board badge.
- Empty (vehicle never stamped): `<EmptyState>` inside the dialog — «Brak historii statusu dla tego pojazdu» / "No route-status history for this vehicle yet."
- `DialogFooter`: single ghost «Zamknij» (dialog-dismiss). The history dialog is **read-only** — stamping happens from the table row, not from here (keeps one mutation entry-point).

> Row-expand was considered as an alternative to the dialog; the `<Dialog>` is chosen for parity with the rest of the app's detail surfaces (Phase 6 modals) and because the board rows are dense — an inline expand would push the whole table around. If web-agent prefers an expand later it's a non-breaking swap (same data, same item layout).

#### 7.5.6 Empty / `nieznany`-default board state (fresh day)

Two distinct emptiness cases — do not conflate:
- **No vehicles at all** (no active fleet): standard `<DataTable>` `empty={<EmptyState>}` slot — «Brak aktywnych pojazdów» / "No active vehicles." This is a true empty table.
- **Fresh day — vehicles present, none stamped yet** (the *normal* morning state): this is **NOT** an empty state. The table is full of rows, every `status` cell shows the `nieznany` `outline` badge, every `notedMeta` shows `—`, both action buttons plain `outline`. The board intentionally reads as "a full list of vehicles awaiting today's check", visually calm (no orange/red), so the verifier just works down it. Do **not** render an `<EmptyState>` here and do **not** tint these rows as warnings. An optional one-line helper above the table («{n} z {total} pojazdów sprawdzonych dzisiaj» / "{n} of {total} vehicles checked today", `text-sm text-text-sub`) gives progress without alarm — recommended, not required.
- Loading: Phase 2 `<DataTable isLoading>` skeleton rows (no special skeleton needed).

#### 7.5.7 Components / shared / nav summary + acceptance (Phase 7.5)

| Change | Where | Notes |
|---|---|---|
| New page `weryfikator/vehicles` (full-fleet board) | `app/(weryfikator)/weryfikator/vehicles/page.tsx` | Phase 6.3 panel layout + `<DataTable>` with `actions` column. No `<Tabs>`. |
| Weryfikator landing redirect → `/weryfikator/vehicles` | `app/(weryfikator)/weryfikator/page.tsx` | `redirect()`; delete `WelcomePanel` stub; header logo/home → `/weryfikator/vehicles` (supersedes the §7.2 `/delegations` target for weryfikator only). `eksport` landing unchanged. |
| `vehicleRouteStatus` tone-map (const-map) + `<StatusBadge>` / `<VehicleRouteStatusBadge>` support | `@magguarantee/shared` + `components/.../StatusBadge.tsx` | Three states per §7.5.1, existing `success`/`muted`/`outline` variants — **no new badge variant**. |
| Two `outline` stamp buttons per row (always present, current = `aria-pressed` accent, never disabled) | weryfikator vehicles page | §7.5.4. No confirm dialog. |
| `<VehicleRouteStatusHistoryDialog>` (`<Dialog>` read-only log) | `apps/web/components/vehicles/` (web-agent decides path) | §7.5.5. Row-click opens it. |
| Reuse `<DataTable>` (+ `rowAriaLabel`/`onRowClick` from Phase 6.4) / `<Dialog>` / `<Button>` / `<Badge>`/`<StatusBadge>` / `<EmptyState>` / `<Select>` | existing | No primitive changes, no new tokens. |
| shared Zod: `SetVehicleRouteStatusSchema` (`{ status: 'w_trasie' \| 'zjechal', notes?: string }`) | `@magguarantee/shared` | api-agent owns the contract (§0 of the phase doc). |
| i18n | `messages/pl.json` / `en.json` | rewrite `weryfikator.*` for the vehicle board: column headers, status labels, button labels, toasts, history dialog, progress helper. Remove old `weryfikator.actions.{inTransit,returned}`. |
| **0** changes to `tailwind.config.ts` / `globals.css` | — | Token policy respected. |

Acceptance (Phase 7.5):
- [ ] **Three-state tone-map.** `w_trasie`→`success`, `zjechal`→`muted`, `nieznany`→`outline`; the derived `nieznany` reads as neutral/recessive (no orange/red), never as an error; status carried by text + colour (a11y).
- [ ] **Table.** Columns plate(+side) / carrier / planista / status badge / who+when meta / actions; **no driver column**; row-click opens history; action cell `stopPropagation`s.
- [ ] **Re-stampable actions.** Two `outline` buttons on every row, always enabled (including the current status), each click appends a history row; current-status button shows `aria-pressed` accent but stays clickable; no per-stamp confirm dialog; success/error toasts.
- [ ] **History dialog.** Read-only `<Dialog>` log newest-first (status / who / when / source manual|gps / optional notes); empty state when no history; dismiss-only footer.
- [ ] **Fresh-day default ≠ empty.** Full board of `nieznany` `outline` rows renders as a calm list (no `<EmptyState>`, no warning tint); true `<EmptyState>` only when there are zero active vehicles; optional "{n}/{total} checked today" helper.
- [ ] **Nav.** Weryfikator landing `redirect()`s to `/weryfikator/vehicles`; no `WelcomePanel` stub; header logo/home → `/weryfikator/vehicles`; no in-page `<Tabs>`.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts`/`globals.css` changes; no new badge variant; board, badges, outline buttons, history dialog (`bg-card`) all legible in dark via tokens / `dark:` variants only.

### 7.6 Pracownik dashboard — verification-SLA «attention» severity scale (Phase 7.6)

> **2026-10-22:** в `overdue` / `dueSoon` попадают и wnioski в статусе `REKLAMACJA` (тот же 7-дневный счётчик от подачи рекламации, [docs/21](21-pracownik-verification-sla.md)). Строка рекламации в `<SlaAttentionSection>` несёт существующий чип статуса «Reklamacja»; новых токенов и уровней severity нет, бейджа в списке wniosków и в `ClaimModal` по-прежнему нет (дашборд-only).

> **Scope.** The pracownik dashboard replaces the old crude `urgent` list with two SLA «attention» buckets surfaced in `<DashboardSidebar>` (§`<DashboardSidebar>`): **`overdue`** (`workingDaysLeft < 0`) and **`dueSoon`** (`0 ≤ workingDaysLeft ≤ 3`). Spec source: [`21-pracownik-verification-sla.md` §2, §4](21-pracownik-verification-sla.md). Both buckets list `NA_WERYFIKACJI` claims; clicking a row opens the §6.5 verification Dialog.
>
> **No new tokens** (Phase 4.4 policy). The two urgency levels map cleanly onto the **existing `danger` (red, brand-aligned) and `warning` (amber) semantics** already used by `StatusBadge`/alert bands. `tailwind.config.ts` / `globals.css` untouched.

#### 7.6.1 Severity scale — two levels, existing semantics only

The palette already expresses two distinct urgency levels, so we reuse them verbatim. **`overdue` = `danger` (strongest, red — aligns with MAGTRANS RED `#dc2626`); `dueSoon` = `warning` (amber).** This mirrors the established `ODRZUCONO → danger` / `NA_WERYFIKACJI → warning` mapping, so the two attention levels read consistently with the rest of the claim UI.

Per-element token classes web-agent applies (light → dark handled by the semantic tokens / `dark:` variants already in §Tailwind config; the `-bg` surfaces + `dark:bg-*/15` follow the §6 alert-band convention):

| Element | `overdue` (red / `danger`) | `dueSoon` (amber / `warning`) |
|---|---|---|
| **Group header** (section title row in sidebar) | `text-sm font-bold uppercase tracking-wider text-danger` + leading `<AlertTriangle size={14} className="text-danger" />` + count pill `<Badge variant="outline" className="border-danger/40 text-danger">{n}</Badge>` | `text-sm font-bold uppercase tracking-wider text-warning` + leading `<Clock size={14} className="text-warning" />` + count pill `<Badge variant="outline" className="border-warning/40 text-warning">{n}</Badge>` |
| **Per-row item** (one claim) | row wrapper `flex items-center gap-2 rounded-md px-2 py-1.5 border-l-2 border-danger bg-danger-bg/40 dark:bg-danger/10 hover:bg-danger-bg/70 dark:hover:bg-danger/15 cursor-pointer transition-colors` + `focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-inset` | same shape with `warning`: `border-l-2 border-warning bg-warning-bg/40 dark:bg-warning/10 hover:bg-warning-bg/70 dark:hover:bg-warning/15` + `focus-visible:ring-warning` |
| Row content | `nrZgl` `font-medium tabular-nums text-text` · carrier name `text-xs text-text-sub truncate` · plate `text-xs text-text-sub tabular-nums` | identical (urgency carried by the left-border + countdown badge + header tone, not by the body text) |
| **Countdown badge** (working-days-left) | **`po terminie`** when `< -? ` n/a → fixed label; or **`{n} dni po terminie`** if you surface the overdue magnitude. Class: `inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap bg-danger/15 text-danger border-danger/30 tabular-nums` | **«{n} dni robocze»** (ICU plural: `dzień` / `dni`; `0` → «dziś ostatni dzień»). Class: `… bg-warning/15 text-warning border-warning/30 tabular-nums` |

Notes (locked):
- **`overdue` is strictly stronger than `dueSoon`** — same colour family as the brand red, full `danger` treatment (left-border, tinted row, red badge). `dueSoon` uses the amber `warning` family one notch down. The two are mutually exclusive (overdue wins, per §2 of the spec) so a claim is never in both.
- **A11y:** urgency is never colour-alone — every row carries a textual countdown badge («po terminie» / «{n} dni robocze»), and group headers carry an icon + a worded title. Badge contrast: `text-danger`/`text-warning` on the `/15` tinted chip meets AA at `text-xs` `font-semibold` in both themes (same recipe as `StatusBadge`).
- **Countdown badge label** comes from `workingDaysLeft` (signed): `< 0` → «po terminie» (red); `0` → «dziś ostatni dzień» (amber); `1–3` → «{n} dni robocze» (amber, ICU plural). All `tabular-nums`.
- **Row interaction:** whole-row click opens the §6.5 verification Dialog; pass `role="button"`, `tabIndex={0}`, Enter/Space handler, and the `focus-visible` ring per the §6.4.3 clickable-row a11y recipe. `aria-label` e.g. «Wniosek {nrZgl} — po terminie, otwórz weryfikację».

#### 7.6.2 Placement in `<DashboardSidebar>` (order + empty states)

The two buckets are **two stacked sections at the top of the sidebar** (`space-y-4` per §`<DashboardSidebar>`), each a `<Card>` with the §7.6.1 group header, **ordered most-urgent-first**:

1. **`overdue`** section — **above** `dueSoon`. Rendered only when `overdue.length > 0`. Card may carry a subtle red accent: `border-danger/30` on the `<Card>` (optional, keep `shadow-sm`).
2. **`dueSoon`** section — directly below. Rendered only when `dueSoon.length > 0`. Optional `border-warning/30`.
3. The rest of the sidebar (Recent activity, Monthly trend, etc., per §`<DashboardSidebar>`) follows unchanged.

Empty-state rules:
- **One bucket empty, the other not:** omit the empty section entirely (no «brak» placeholder card — a zero-count attention card is noise). Render only the non-empty one.
- **Both empty (nothing needs attention):** collapse the two sections into **one quiet «all-clear» card** — `<Card>` with neutral surface (no red/amber), a `<CheckCircle2 size={16} className="text-success" />` + «Brak wniosków wymagających uwagi» / "No claims need attention", `text-sm text-text-sub`. **Calm, not alarming** — this is the good state (mirrors the §7.5.6 «fresh-day ≠ error» principle and the §5 digest «empty → no email»). Do **not** render two empty red/amber shells.
- **Loading:** each section independent `<Skeleton>` 3 rows (per §`<DashboardSidebar>` loading rule); don't block the whole sidebar.

This **supersedes** the «Urgent / Required notes» row in the §`<DashboardSidebar>` section table: that single `urgent` list is replaced by the two SLA buckets above (the «Required notes» list, if still wanted, stays a separate neutral section — it is not an SLA bucket).

#### 7.6.3 Digest email accent (confirmation)

> **SUPERSEDED 2026-07-27 → [22-email-design.md](22-email-design.md).** The whole
> transactional-email fleet now shares one table-based template. The digest's
> brand red is **`#E02020`** (email palette, distinct from the web `#dc2626`); the
> header is a neutral logo/wordmark strip (no red top-bar), and the two buckets
> stay «Po terminie» (brand red) / «Zbliża się termin» (amber `#8A5A16`). The
> paragraph below is kept for history — treat docs/22 as authoritative.

The daily verification-digest email (`mail/templates/verification-digest.tsx`, §5 of the spec) **keeps the brand accent `#dc2626`** — same as `maksim-confirmation-request.tsx`. Email clients have poor/no support for CSS custom properties and `dark:` variants, so the digest uses **inline brand-red `#dc2626`** for the header bar / heading accent and plain-text fallback, exactly per the existing mail-template convention. Inside the body, the two buckets may be visually separated (e.g. an «Po terminie» group heading in `#dc2626` and a «Zbliża się termin» group in an amber `#f97316` heading), but the **primary brand accent stays `#dc2626`** — no per-email theme tokens, no new colours. This is a hard-coded inline-style context (email), which is the one place inline styles are correct and expected.

#### 7.6.4 Components / tokens / acceptance (Phase 7.6)

| Change | Where | Notes |
|---|---|---|
| `<SlaAttentionSection>` (two instances: `overdue` red, `dueSoon` amber) | `apps/web/components/dashboard/` | Composes `<Card>` + §7.6.1 header + clickable rows. Severity passed as a prop (`'overdue' \| 'dueSoon'`) selecting `danger`/`warning` classes. |
| `<SlaCountdownBadge workingDaysLeft>` | same | Renders «po terminie» / «dziś ostatni dzień» / «{n} dni robocze» with the §7.6.1 badge classes; ICU plural via next-intl. |
| All-clear card (both buckets empty) | dashboard sidebar | Neutral `<Card>` + `text-success` check + muted text. |
| Replace old `urgent` sidebar section | `app/(employee)/employee/dashboard/` | Wire the two new sections from `DashboardDto.overdue[]` / `dueSoon[]`. |
| i18n `dashboard.sla.{overdueTitle,dueSoonTitle,allClear,countdown.*(ICU plural)}` | `messages/pl.json` / `en.json` | — |
| Digest email inline brand accent (now `#E02020`, see [22-email-design.md](22-email-design.md)) | `mail/templates/verification-digest.tsx` | api-agent; email uses its own table-based design system, no web DS token. |
| **0** changes to `tailwind.config.ts` / `globals.css`; **0** new colour/badge variants | — | `danger`/`warning` semantics + `-bg` surfaces already exist. |

Acceptance (Phase 7.6):
- [ ] **Two-level severity, existing tokens.** `overdue` → `danger` (red, brand-aligned), `dueSoon` → `warning` (amber); applied to group header, per-row left-border + tinted surface, and countdown badge; **no new tokens / badge variants**.
- [ ] **Order.** `overdue` section sits above `dueSoon` in `<DashboardSidebar>`; empty buckets are omitted; both-empty collapses to one calm `text-success` «all-clear» card (no red/amber empty shells).
- [ ] **A11y.** Urgency never colour-alone (worded countdown badge + header icon/title); rows keyboard-activatable (`role=button`, Enter/Space, `focus-visible:ring-{danger,warning}`); AA contrast on `/15` badges both themes.
- [ ] **Digest email.** Uses the shared email design system ([22-email-design.md](22-email-design.md), brand `#E02020`); empty → no email (§5); no web DS tokens.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts`/`globals.css` changes; all surfaces legible in dark via `dark:bg-{danger,warning}/10..15` variants.

---

## 7.7 Weekly km-board + read-only km-report + delegation km-calendar (REWORK 2026-06-12 #3 — AUTHORITATIVE)

> **Scope.** Supersedes §7.5 (route-status board). Three deliverables, one shared visual primitive (the weekly km-grid):
> 1. **Weryfikator weekly km-board** — `/weryfikator/km`. Row = vehicle, 7 day-columns (PN..ND). The verifier records, per vehicle per day, **either** the km driven (`drove`) **or** "nie jeździ" (`idle`), **or** leaves it blank (not checked). The binary route-status of §7.5 is absorbed: vehicle status is now *derived from the cells* and only summarized in the header tiles.
> 2. **Read-only km-report** — same grid, view-only, scoped to *own* vehicles, for `planista` / `dyspozytor` / `eksport` / `admin`. This is the legacy «Raport km — moje pojazdy» screen. Has a "tylko jeżdżące" (in-motion only) filter.
> 3. **Delegation km-calendar** — inside the carrier delegation detail modal (the §6.4.1 route-card modal), a compact per-day km calendar from `departureAt` to the real trip end (§7.7.9 window rule — `actualReturnAt`/`plannedReturnAt`/last km day per status) of the assigned vehicle (join by `vehicleId`, **no FK**). The "visual link" delegation↔km.
>
> **Reference look.** Legacy «Raport km — moje pojazdy» (Panel Planisty): weekly grid PN..ND with km in cells, a `Σ KM` column, and a header strip of counters. (No standalone screenshot file exists for this screen — it is described in the contract; the closest structural reference for the surrounding chrome is `docs/screenshots/planista-fleet.png` for the read-only role-panel shell, and `docs/screenshots/carrier-delegations.png` for the carrier delegation row that opens the calendar modal.)
>
> **Spec source:** [`20-phase-7-eksport-weryfikator.md` §0′](20-phase-7-eksport-weryfikator.md).
>
> **HARD: no new tokens** (Phase 4.4 surface policy + no-new-token policy). Everything below composes existing tokens only: surfaces `bg-card` / `bg-input` / `bg-bg` / `bg-brand-50` (+`dark:bg-brand/10`); semantic accents `text-success` / `text-warning` / `text-danger` / `text-info` / `text-brand` / `text-text-sub` and their `bg-*/10..15` + `border-*/30..40` opacity variants; the existing radius scale, `shadow-card`, `shadow-modal`, `animate-modal-in`; the brand focus ring (`ring-brand`); `font-mono` / `tabular-nums`. **Zero changes** to `tailwind.config.ts` / `globals.css`. The §7.5.1 three-state tone-map (`success` / `muted` / `outline`) is reused for the *derived* vehicle status; it is **not** a new token.

### 7.7.1 The cell state model — three states, the heart of the grid

Each `(vehicle × day)` intersection has **exactly three** presentational states. This is the single most important primitive in this section — call it `<KmCell>`.

| Cell state | Meaning | Source | Visual (locked) |
|---|---|---|---|
| **`drove`** | vehicle drove `km > 0` that day | stored `VehicleDailyKm{state:'drove', km}` | A **filled km value** + a small leading `<Check size={12} className="text-success" />`. Value `font-mono font-semibold tabular-nums text-text`. Cell surface gets a faint positive tint `bg-success/10` (token-with-opacity, not a new token) so driving days read at a glance down a column. |
| **`idle`** | "nie jeździ" — checked, confirmed parked | stored `VehicleDailyKm{state:'idle', km:null}` | A muted dash-pill: `<span className="inline-flex items-center gap-1 text-xs text-text-sub"><ParkingSquare size={12}/> nie jeździ</span>` (PL) on a neutral `bg-input` cell. **No km number.** Reads as "looked at, nothing to count". |
| **`empty`** | not checked today/this period | **no row exists** | Truly blank cell — `bg-card`, a single faint `—` in `text-text-sub/60` centered, no tint. Recessive, so the verifier sees what's left to do. **Never** tint as warning/danger — an unchecked day is normal, not an error (mirrors §7.5.6 "fresh-day ≠ error"). |

Cell geometry: each day-column is a fixed narrow track (`w-[68px]` desktop, content-centered, `px-1.5 py-1`, `text-center`). The grid is a real table for semantics + alignment; the cells use `tabular-nums` so km columns align. Cell min touch height = the row height (`h-12`) so even on touch the whole cell is an easy target.

**Derived vehicle status (NOT stored, header-only).** Per the contract: the latest dated cell in the period drives the row's *operational* status — `drove` ⇒ `w ruchu`, `idle` ⇒ `nie jeździ`, no cell at all ⇒ `nieznany`. This feeds **only the header counters** (W RUCHU / NIE JEŻDŻĄ) and the §7.7.7 read-report filter — it is **not** rendered as a per-row badge column on the board (the cells already carry the per-day truth; a redundant status column would compete). The tone vocabulary, if ever surfaced as a chip, reuses §7.5.1: `w ruchu → success`, `nie jeździ → muted`, `nieznany → outline`. No new variant.

### 7.7.1a Locked (non-editable) cell — the time-gated 4th *modifier* (REFINEMENT 2026-06-15 — AUTHORITATIVE)

> **Why this exists.** Verification is always done **a day late** (§7.7.1b lag). The verifier marks *yesterday and earlier*; **today and any future day are not yet verifiable**. So on the **edit** board (`mode="edit"`, weryfikator/admin) the day-columns for **today and all future dates** must be **non-editable**. This is **not** a 4th cell *state* — it is a **lock modifier** layered on top of the three §7.7.1 states (`drove` / `idle` / `empty`). Any of the three can be locked. A past `drove`/`idle` cell that rolls into "today" overnight keeps its value but becomes locked; a future `empty` cell is locked-and-blank. The lock is **purely time-driven** and applies **only in `mode="edit"`** — in `mode="view"` (all §7.7.7 / §7.8 read-only screens) *every* cell is already inert, so no lock affordance is shown there (it would be redundant noise; read-only cells render their plain three-state visuals).

**Locked-cell rule (edit board only):** `isLocked = mode === 'edit' && day >= today` (strictly-past days editable; today + future locked). Web-agent computes `today` in the board's display timezone (Europe/Warsaw) so the boundary flips at local midnight, matching the lag note.

**Visual treatment** — composes existing tokens only; **0** new tokens, no `tailwind.config.ts` / `globals.css` change:

| Aspect | Locked treatment | Token / class |
|---|---|---|
| **Surface** | Muted, recessive — reads as "chrome, not a control". Sits **under** any state tint so a locked `drove` still shows its faint positive wash but dimmed. | base `bg-input`; for a locked `drove` keep the `bg-success/10` wash but add `opacity-60` on the cell content wrapper (the tint reads softer, value still legible) |
| **Content opacity** | Existing content stays **readable**, just clearly de-emphasised. | content wrapper `opacity-60` (a locked `drove` km / `idle` pill / `empty` `—` all render exactly as §7.7.1, only dimmed). Do **not** drop below `opacity-60` — value must stay ≥4.5:1 legible. |
| **Cursor** | Not-clickable. | `cursor-not-allowed` |
| **Hover** | **No** hover affordance — the §7.7.3 row `hover:bg-brand-50` still paints the row, but the locked cell itself gets **no** cell-level hover, no brand ring, no pointer feedback. | `<KmCell>` in locked branch renders a **`<div>`/`<td>` content, NOT a `<button>`** — it is not interactive, so there is nothing to hover/press. |
| **Focus / tab order** | **Not** a focus target — removed from tab order entirely (it is not an actionable control). | render as non-button; **no** `tabIndex`, **no** `focus-visible:ring`. (Contrast: an *editable* cell is a focusable `<button>` per §7.7.4.) |
| **Lock cue (NOT colour-alone)** | Per the §7.7.1 a11y convention (meaning never by colour alone), the lock is signalled by a **glyph**, not the muting. A small `<Lock size={11} className="text-text-sub" />` sits in the cell's **top-right corner** (`absolute top-1 right-1`, the cell wrapper is `relative`). For `empty` locked cells (no other content) the lock glyph is the **only** mark — it replaces the faint `—` so a blank future cell reads as "locked, nothing to enter" rather than "to-do". For `drove`/`idle` locked cells the lock sits **alongside** the dimmed value (top-right corner, does not overlap the centered value). | Lucide `<Lock>` `size={11}`, `text-text-sub`; `absolute top-1 right-1` |
| **a11y label** | The cell still announces its state **and** its locked nature to SR. | `aria-disabled="true"` on the cell wrapper + the `aria.cell` value extended with the locked suffix (see §7.7.10 `aria.cellLocked`). e.g. «WGM12345, Pn 16.06: nie sprawdzono — zablokowane (dzień bieżący/przyszły)». |

**Decision rationale.** A locked cell must read as *chrome*, not as a disabled-button (a greyed button still invites a click and fails the "not focusable" goal). Rendering it as a non-button `<td>` content with `cursor-not-allowed` + `opacity-60` + a corner `<Lock>` glyph achieves: (a) clearly not-clickable, (b) content still readable, (c) meaning carried by glyph + cursor + aria, not colour, (d) sits cleanly over the three existing state visuals without a new colour. It deliberately does **not** reuse `bg-danger`/orange — a locked future day is *normal* (the day hasn't happened / isn't verifiable yet), never an error, mirroring the §7.5.6 "fresh-day ≠ error" principle.

> **No tooltip required, but allowed.** Web-agent MAY add a `title` / `<Tooltip>` on the locked cell with the §7.7.10 `cell.lockedHint` copy («Można uzupełnić dopiero następnego dnia.»). It is an optional progressive enhancement; the corner `<Lock>` + `aria-disabled` are the required cues.

### 7.7.1b Data-lag notice — the "as of yesterday" note (REFINEMENT 2026-06-15 — AUTHORITATIVE)

> **Why.** Because verification runs a day late, every km screen — edit **and** read-only — shows data that is *current as of the previous day*. A short persistent note sets that expectation so no one reads a blank "today" column as missing data. Tone is **informational** (`role="note"`), **never** a warning — there is no problem, it is the designed cadence.

**Component.** A single small inline note, **not** an `<Alert variant="destructive/warning">`. Build it as a quiet info line: a `<p role="note">` (or a thin `bg-input` chip) with a leading `<Info size={14} className="text-text-sub" />` + `text-xs text-text-sub`. **No** colour-coded severity surface (no yellow/orange/red), no dismiss button — it is **persistent** (the lag is permanent, so it is not dismissible; same posture as the non-dismissible read-only banner). It must satisfy ≥4.5:1 (`text-text-sub` on `bg-input`/`bg-card` already does).

**Placement — two contexts:**

| Context | Where the lag note lives | Form |
|---|---|---|
| **(a) Edit board** (`mode="edit"`, weryfikator/admin, §7.7) | In the **control area**, in the card header row next to the §7.7.5 `<WeekNavigator>` (left slot of the header `flex items-center justify-between` — nav stays right). **Stands alone** — the edit board has no read-only banner. On narrow widths it wraps to its own line above the grid. | Standalone `<p role="note">` info line (Info glyph + `text-xs text-text-sub`). |
| **(b) Read-only km tabs** (`mode="view"` — §7.7.7 report **and** §7.8 multi-carrier tab, for carrier/opiekun/planista/dyspozytor/eksport/admin) | **Joins** the existing non-dismissible **read-only banner** (`weryfikator.km.readOnlyBanner` / `myKm.readOnlyBanner`) as a **second line inside the same banner block** — not a separate floating note. The banner already occupies the "meta info above the grid" slot; appending the lag line there keeps one consolidated info block instead of two stacked notes. | Render the banner as two lines: line 1 = read-only copy (existing), line 2 = the lag copy (`text-xs text-text-sub`, leading `<Info size={14}/>` shared or one glyph for the block). |

**Copy (PL default + EN)** — short, factual, no alarm:

| Key | PL (default) | EN |
|---|---|---|
| `weryfikator.km.lagNote` | «Dane aktualne na poprzedni dzień. Dzień bieżący i przyszłe są zablokowane.» | "Data as of the previous day. Today and future days are locked." |
| `weryfikator.km.lagNoteShort` *(read-only banner line — context already says read-only, so drop the lock clause)* | «Dane aktualne na poprzedni dzień.» | "Data as of the previous day." |

> **Phrasing decision.** Kept the user's PL/EN baseline verbatim as `lagNoteShort` (used in the read-only banner, where the lock clause is irrelevant — read-only cells aren't lockable). For the **edit board** the fuller `lagNote` adds the one-clause reason the *today/future* columns look frozen, so the verifier doesn't try to click them. Both are role-agnostic and reused by §7.8 (`myKm.*` reuses `weryfikator.km.lagNote*` — do **not** duplicate).

### 7.7.2 Header tiles — the counter strip (`<KpiCard>` reuse)

A counter strip sits between the page heading and the grid, composed **entirely** of the existing `<KpiCard>` (no new card). It mirrors the legacy «Raport km» header counters. Responsive grid identical to the §6.3.3 dyspozytor strip family:

```
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
```

Six tiles, left→right, with the locked tone mapping (reuses the 4.3 KpiCard tone vocabulary; **`tone="purple"` is never used** — same rationale as §6.3.3, colour encodes operational state not totals):

| # | Tile label (PL) | Value | `tone` | Accent token | Lucide icon | Rationale |
|---|---|---|---|---|---|---|
| 1 | TYDZIEŃ | `Wnn/YYYY` (ISO week, e.g. «W24/2026») | `neutral` | `text-text-sub` | `CalendarRange` | Context, not a metric — neutral. The value is the ISO-week label, `font-semibold tabular-nums`. |
| 2 | CIĄGNIKI | total active tractors on the board | `neutral` | `text-text-sub` | `Truck` | A total count → inert neutral. |
| 3 | W RUCHU | vehicles whose derived status = `w ruchu` | `green` | `text-success` | `Car` | The positive operational signal (matches §7.5.1 `w_trasie→success`). |
| 4 | NIE JEŻDŻĄ | derived status = `nie jeździ` | `neutral` | `text-text-sub` | `ParkingSquare` | Settled/parked — neutral, not alarming (matches §7.5.1 `zjechal→muted`). Deliberately **not** orange: a parked truck is not a problem. |
| 5 | Σ KM | sum of all `drove` km across the visible week | `blue` | `text-info` | `Gauge` | The headline aggregate the screen exists for; `font-mono tabular-nums`. |
| 6 | NOTATEK | count of cells carrying a `notes` value this week | `neutral` | `text-text-sub` | `StickyNote` | A meta count → neutral. |

> If the API returns a `nieznany` count worth surfacing, it can replace tile 6 or extend to `lg:grid-cols-7` — keep the breakpoint family identical and the new tile `tone="outline"`-equivalent (`neutral`). Do not introduce orange/red on this strip; the board has no "error" aggregate.

### 7.7.3 The weekly grid — layout (`<KmWeekGrid>`)

The core shared primitive. A horizontally-scrollable table inside a `<Card>` (`rounded-xl border border-border bg-card shadow-card overflow-hidden`). It is **not** a `<DataTable>` — the matrix layout (frozen left identity columns + 7 day tracks + trailing summary/action) is too bespoke for the generic table primitive; build it as a dedicated component but **reuse the `<DataTable>` visual grammar** (header `bg-bg`, `h-12` rows, `px-3 py-2`, `divide-y divide-border`, row hover `hover:bg-brand-50 dark:hover:bg-brand/10`).

**Column structure, left→right:**

1. **Identity block (frozen / sticky-left).** A single logical left region (`sticky left-0 z-10 bg-card` so it stays put during horizontal scroll; header cell `bg-bg`). It stacks per the contract's row identity — **two lines** to stay compact:
   - line 1: `plateNumber` (`font-mono font-semibold text-text`) + `sideNumber` as `text-xs text-text-sub` («bok {sideNumber}») under or beside it.
   - line 2: a muted meta line — `przewoźnik` · `opiekun` · `dyspozytor` joined with `·`, `text-xs text-text-sub truncate`, with a `title`/tooltip for the full string. (On `xl+` these may split into 2–3 narrow columns — `PRZEWOŹNIK` / `OPIEKUN` / `DYSPOZYTOR` — if width allows; on smaller widths collapse to the single meta line to protect the 7 day tracks.)
2. **7 day-columns (PN..ND).** Header for each: two lines — weekday abbrev `PN/WT/ŚR/CZ/PT/SB/ND` (`text-xs font-bold uppercase`) + the date `DD.MM` (`text-[11px] text-text-sub tabular-nums`). **Today's column** header gets a brand underline accent: `border-b-2 border-brand` + the date in `text-brand font-semibold` (the only brand-red on the grid — anchors "today" for the daily worker). Weekend columns (SB/ND) get a faint `bg-input` header tint to visually separate the work week (token-with-opacity feel via `bg-input`, not a new token). Each body cell is a `<KmCell>` (§7.7.1).
3. **`Σ KM` column (trailing summary).** Per-row week sum of `drove` km. `font-mono font-semibold tabular-nums text-text`, right-aligned, header «Σ KM». Cell surface `bg-input` to read as a derived/total column (consistent with the §6.4 "total reads as soft-chrome" feel). Zero shows a muted `0` in `text-text-sub`.
4. **`NOTATKA` column.** A note affordance per row: if any cell in the week has notes, show a `<StickyNote size={14} className="text-text-sub" />` button that opens a small popover listing that week's notes by day; otherwise an em-dash. (Notes live on individual cells in the model; this column is a roll-up entry-point so the matrix stays clean.)
5. **Action column — «Historia».** A trailing `<Button variant="ghost" size="sm">` with `<History size={14}/>` «Historia» opening the per-vehicle history modal (§7.7.6). Right-aligned, `text-xs`. (Read-only report variant, §7.7.7, keeps this column — history is read-only — but drops all cell editing.)

**Sticky behaviour.** Header row `sticky top-0 z-20 bg-bg`; identity block `sticky left-0`. On horizontal scroll the day tracks slide under the frozen identity + over nothing on the right (Σ KM / NOTATKA / Historia are *not* frozen — they scroll with the day tracks, which is fine since they sit at the natural right edge). The card itself owns the `overflow-x-auto`; never let the page body scroll horizontally.

### 7.7.4 Cell editing (weryfikator board only) — modal editor + clear-with-confirm

> **REWORK 2026-06-12 #4 — AUTHORITATIVE. Supersedes the previous in-cell inline-editor spec entirely.** The old toggle-revealed-on-focus / commit-on-blur / `Esc`-revert / `Enter`-to-move-down spreadsheet editor is **removed from the build**. There is **no inline cell editor and no cell-to-cell keyboard chaining** any more. The user chose the simpler, explicit modal flow. Web-agent: ignore any older mention of in-cell editing — this subsection is the only editing spec for the board.

The km-board is still the **one mutating surface**, but editing is now **deliberate, one day at a time, through a modal** — not a high-frequency inline stamp. The cell remains a *display* primitive (§7.7.1 three states); interaction on it just opens an editor.

**Opening the editor.** In `mode="edit"` (board only — **never** the read-only report §7.7.7), a `<KmCell>` is a single focusable button (`focus-visible:ring-2 ring-brand ring-inset`, full-cell `h-12` target). Click / `Enter` / `Space` opens `<KmCellEditDialog>`. This is true for **all three** states: an `empty` cell opens the editor to *create* a record; a `drove`/`idle` cell opens it to *edit* an existing one. Creating and editing are the same gesture, just pre-filled differently.

**`<KmCellEditDialog>` — reuse the `<Dialog>` primitive** (the same centered `<Dialog>` grammar as the §7.7.6 monthly km-calendar modal: `bg-card`, `animate-modal-in`, `shadow-modal`, brand focus ring; **not** a bespoke surface). Contents top→bottom:

- **`DialogHeader` — vehicle identity + the specific day.**
  - Title: `plateNumber` (`font-mono font-semibold text-text`) + side number «bok {side}» (`text-text-sub`).
  - `DialogDescription` (`text-sm text-text-sub`): the carrier name + the day, e.g. «{carrier} · {weekday}, {DD.MM.YYYY}». The weekday + full date make it unmistakable *which* cell is being edited (no spreadsheet ambiguity).
- **Body — a real `<form>` (RHF + Zod, schema `SetVehicleDailyKmSchema`):**
  - **State choice — `drove` / `idle`.** A 2-option `<ToggleGroup type="single">` (Radix, shadcn family) — «Jechał» / «Nie jeździ», `aria`-labelled, one always selected. This is the primary decision of the dialog, so it sits first and full-width.
  - **Km numeric input — shown ONLY for `drove`.** `<Input inputMode="numeric" className="text-center font-mono tabular-nums">` with label «Przebieg (km)». Selecting `idle` **hides** the km field entirely and the payload carries `km:null` (idle has no km — never a disabled-but-present input, just absent). Empty + `drove` is invalid → standard inline field error «Podaj km» (`border-danger` + sr message), Save disabled until valid. `0` is allowed but shows the soft, non-blocking hint «0 km? oznacz „nie jeździ”».
  - **Notes — `<Textarea>`** labelled «Notatka», optional, placeholder «Notatka do dnia…». Applies to both states. Feeds the roll-up `NOTATKA` column (§7.7.3) and the per-day cells of the monthly km-calendar (§7.7.6).
- **`DialogFooter` — actions:**
  - Primary **«Zapisz»** (`<Button>` brand primary). On submit → `PUT /vehicles/:id/daily-km { date, state, km?, notes? }` (upsert). Follow the established modal-mutation flow: `await onSave()`, Save shows a spinner + form disabled while saving, **close on resolve**, keep the dialog **open** on reject with an `<Alert variant="destructive">` at the top of the body (so the typed km/notes aren't lost). On success, optimistically update the cell + the row `Σ KM` + the header `Σ KM`/counters; error path rolls back. Because each save is now an explicit modal commit (not a silent blur), a quiet success toast is acceptable but optional.
  - **«Anuluj» / close** (`<Button variant="ghost">`, plus the Dialog `X` and overlay/`Esc` dismiss). Cancel makes **zero changes and zero network calls** — it never fires the `PUT`, never mutates the cell, never optimistically updates. Dismiss = pure no-op. (This is the explicit contrast with the dropped blur-commit behaviour: nothing persists unless «Zapisz» is pressed.)

**«Wyczyść ten dzień» (clear this day) — destructive, confirmed.**

- **Visibility.** Rendered **only when the cell already has a state** (`cell.state != null`, i.e. `drove` or `idle`). For an `empty` cell there is nothing to clear, so the action is **absent** (not disabled). Placed in the footer's left slot as a destructive ghost: `<Button variant="ghost" className="text-danger">` with a leading `<Trash2 size={14}/>` — the established left-aligned destructive-slot posture (§4 modal-footer convention; mirrors the §Phase-4.4 «Odrzuć» destructive slot).
- **Behaviour.** Clearing **DELETES** the day's `VehicleDailyKm` record and returns the cell to the **`empty` / «Nie sprawdzono»** state (§7.7.1) — the exact target state a clear returns to. Endpoint: `DELETE /vehicles/:id/daily-km { date }` (or the contract's delete shape). On success the cell renders the faint `—`, and the row/header `Σ KM` + counters update.
- **Confirmation — reuse the existing destructive-confirm pattern.** Clear **must** route through a second, destructive confirmation `<Dialog>` — the same `ConfirmDeleteWithReasonDialog`-family destructive-confirm the design system already defines for deletes (centered `<Dialog>`, danger framing, `await onConfirm()` flow, stays open on reject). No reason field is needed here, so it is the bare-confirm variant (like the §7.1(a) plain confirm `<Dialog>`), but styled **destructive**: the confirm button is `<Button variant="destructive">` «Wyczyść». Copy: title «Wyczyść ten dzień?», body «Czy na pewno chcesz wyczyścić zapis km dla {plate}, {weekday} {date}? Dzień wróci do stanu „Nie sprawdzono”.», confirm «Wyczyść», cancel «Anuluj». Cancelling the confirm returns to the edit dialog with no change.

> **No keyboard cell-chaining.** The old arrows/Tab-between-cells + `Enter`-commits-and-moves-down + `Esc`-reverts spreadsheet navigation is **gone**. Cells are ordinary buttons in tab order; opening, editing, and saving all happen inside the modal with standard dialog keyboard semantics (`Esc` closes the modal = cancel = no-op; `Enter` in the form submits «Zapisz»). There is no cell-to-cell entry chaining — one cell, one modal, one explicit save.

### 7.7.5 Week navigation

A control row sits in the card header (or just above the grid), right-aligned, `flex items-center gap-2`:

- `<Button variant="outline" size="sm">` `<ChevronLeft/>` — previous week (`aria-label` «Poprzedni tydzień»).
- A center label / picker: the current ISO week «Tydzień {Wnn} · {DD.MM}–{DD.MM}.{YYYY}» (`text-sm font-semibold tabular-nums`). Clicking it opens a small week-picker `<Popover>` (a month calendar where selecting any day snaps to that day's ISO week; reuse the existing date-picker primitive used by `<Input type="date">` / the carrier delegation form — do not build a bespoke calendar here unless one already exists). 
- `<Button variant="outline" size="sm">` `<ChevronRight/>` — next week («Następny tydzień»).
- A quiet `<Button variant="ghost" size="sm">` «Bieżący tydzień» (jump-to-this-week) shown only when not on the current week.

The week param is the URL source of truth (`?week=YYYY-Www`, contract §0′) so navigation is shareable/back-button-friendly. Changing weeks refetches `GET /vehicles/km-board?week=…`; show the §7.7.8 loading skeleton during the fetch (keep the header tiles visible, skeleton only the grid body).

### 7.7.6 Per-vehicle monthly km-calendar — `<VehicleMonthKmModal>` (`<Dialog>`)

Opened by the row click / «Historia» handler (§7.7.3) — same `onOpenHistory(vehicle)` contract as before. A centered `<Dialog>` (`bg-card`, `animate-modal-in`, `shadow-modal`, brand focus ring; `max-w-2xl`, `flex flex-col`) showing ONE vehicle's daily km as a **Monday-first month calendar** (`GET /vehicles/:id/daily-km?from&to` over the shown month), replacing the former flat newest-first list. This is the §6.5 «one component, two modes» principle taken one step further: the calendar reuses the board's `<KmCell mode="view">` **verbatim**, so the three drove / idle / empty visuals and their `weryfikator.km.cell.*` labels match the weekly board exactly.

- **No new tokens.** Every visual — the `bg-success/10` drove wash, the `bg-input` idle pill, the faint `—` empty cell, the brand ring — is `<KmCell>`'s, reused as-is. The modal adds only chrome (header, month-nav, weekday header row, footer Σ).
- **Read-only for ALL roles, incl. weryfikator.** Editing stays on the weekly board (§7.7.4) — one mutation entry-point (same principle as §7.5.5). The calendar never mutates; cells are `mode="view"` inert tiles. The board click that opens it is identical in edit (weryfikator/admin) and read-report (planista/dyspozytor/eksport) contexts.
- `DialogHeader`: title «Przebieg km — {plateNumber} · bok {sideNumber}» + `DialogDescription` = the carrier name (`text-sm text-text-sub`). All three identity fields come off the board item.
- **Month-nav row:** `‹ {Month YYYY} ›` — two ghost icon-buttons (`<ChevronLeft/>` / `<ChevronRight/>`, `aria-label` from `month.prev` / `month.next`) flanking the month label, centered. The label is produced via next-intl `useFormatter().dateTime({ month: 'long', year: 'numeric' })` (PL default → «Czerwiec 2026»; the leading letter is upper-cased since `Intl` lower-cases PL month names) — **never hard-coded month names**.
- **Bounded paging.** The shown month is clamped: lower bound = the vehicle's `createdAt` month (`VehicleKmBoardItemDto.createdAt`, **not** `addedAt`), upper bound = the current month (Europe/Warsaw business date via `todayIso()`). `‹ prev` disables when `!canPrev(month, createdAtMonthKey)`; `next ›` disables when `!canNext(month, todayMonthKey)`. Initial month = the current month, clamped up to the createdAt month for a vehicle created this month. Opening for a **different** vehicle resets the shown month to the current month (bounds move with the vehicle).
- **Grid.** A 7-column Monday-first `<table>`; weekday header `<th>`s reuse `weryfikator.km.weekday.*`. Leading blanks before day 1 from `weekdayIndexMonFirst(firstOfMonth)`, trailing blanks pad the last week. Each real day renders `<KmCell mode="view">` with a small day-of-month number overlaid top-left (`text-[10px] tabular-nums text-text-sub`). Days **out of range** (future days of the current month; days before `createdAt` in the first month) render as the same `view` cell at `opacity-40` (km unknown / not yet recorded), not a separate error style.
- **Data.** `useVehicleDailyKmHistory(vehicle.id, { from: startOfMonthIso(month), to: endOfMonthIso(month) })` — the hook's query key already includes `from`/`to`, so paging the month re-fetches. The response is a **sparse** `VehicleDailyKmDto[]`; it is folded into a `Map<dateString, VehicleKmCellDto>` and any day without a row renders an empty cell `{ date, state: null, km: null, notes: null }`.
- **States.** Loading → a `grid-cols-7` block of `<Skeleton className="h-12">` tiles. Empty month (no rows at all) → `<EmptyState icon={Gauge}>` «Brak zapisów km w tym miesiącu».
- `DialogFooter`: **Σ km for the month** (sum of `drove` cells, `font-mono tabular-nums`) labelled `month.sumLabel`, plus the month range `month.range` («Zakres: {DD.MM}–{DD.MM}»). Both `tabular-nums`.

### 7.7.7 Read-only km-report variant (planista / dyspozytor / eksport / admin)

The **same `<KmWeekGrid>`** primitive, in a **read-only context** — this is the legacy «Raport km — moje pojazdy». Differences from the weryfikator board:

- **No cell editing.** Cells render the three states (§7.7.1) but are **inert** — no toggle, no km `<Input>`, no per-cell notes editor. Cells are not focus targets for editing (they may still be focusable to read notes via the roll-up popover). The whole surface is read-only — same posture as the §6.3 read-only role panels, with the **non-dismissible read-only info banner** above the grid («Dane są tylko do podglądu — edytuje weryfikator.» / "Data is read-only — managed by the verifier.").
- **Scope = own vehicles.** Served by `GET /vehicles/km-report?week=…`, already role-scoped server-side (`planista`→own `plannerId`, `dyspozytor`→own team, `eksport`/`admin`→all). The UI does not re-filter by owner; it trusts the scoped payload.
- **"Tylko jeżdżące" filter (in-motion only).** A single `<Switch>` / `<Checkbox>` above the grid — «Tylko jeżdżące» / "In-motion only" — that hides rows whose week has **zero** `drove` cells (derived status ≠ `nieznany`/`idle`-only). Default **on** for the report (the report's purpose is the vehicles that actually moved; the contract scopes the report endpoint to "only vehicles with `drove` days", so this filter is mostly a within-week refinement). Compose from the existing `bg-input` filter-row pattern; it's a read filter, not a mutation.
- **Keeps** the header counter strip (§7.7.2), the `Σ KM` / `NOTATKA` columns, week navigation (§7.7.5), and the monthly km-calendar modal (§7.7.6 — read-only for all roles). Drops only the editing affordances.
- **Container + chrome.** Lives inside `RoleShell` (sidebar-less) for planista/dyspozytor/eksport, using the 4.4 container strip `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`, page heading «Raport km — moje pojazdy» + a one-line scope subtitle. For `admin` it lives in the employee shell.

> One component, two modes. `<KmWeekGrid mode="edit" | "view">` — the same component the weryfikator and the read-report render, gated by `mode` (exactly the §6.5 `mode: 'view' | 'edit'` precedent for the verification dialog). Do not fork two grids.

> **Note (2026-06-25):** the standalone `/planista/km` and `/dyspozytor/km` read-report routes were **removed**. Planista and dyspozytor now expose a **single** km tab — «Moje pojazdy — przebieg» (§7.8, `/{role}/moje-pojazdy`) — instead of two near-duplicate km links. The §7.7.7 read-report variant still backs eksport/admin and the §7.8 tab itself (same `<KmBoardScreen mode="view">`); only the duplicate planista/dyspozytor `/km` entry points are gone.

### 7.7.8 States — loading / empty / empty-team / fresh-week

| State | Trigger | Treatment |
|---|---|---|
| **Loading** | week fetch in flight | Header tiles stay (skeleton their numeric values with `<Skeleton className="h-6 w-12">`); grid body = 6–8 skeleton rows: identity block `<Skeleton>` two-line + 7 `<Skeleton className="h-5 w-10 mx-auto">` cells + `Σ` skeleton. Keep the day-column headers (week is known from the URL before the data lands). |
| **No vehicles at all** (empty fleet / empty team) | board/report returns zero rows | Standard `<EmptyState>` in the card body (icon `Truck`): weryfikator — «Brak aktywnych pojazdów» / "No active vehicles." ; read-report — «Brak przypisanych pojazdów» / "No vehicles assigned to you." This is the **empty-team** case the contract calls out for dyspozytor/planista with no fleet. |
| **Fresh week — vehicles present, no cells yet** (the *normal* Monday-morning state) | rows exist, every cell `empty` | **NOT an empty state.** Full grid of blank `—` cells, header counters read `W RUCHU 0 / Σ KM 0 / NOTATEK 0`, `CIĄGNIKI` = total. The board reads as "a full list awaiting this week's entry", calm (no warning tint — §7.5.6 principle). Optional one-line helper above the grid «{n} z {total} pojazdów uzupełnionych w tym tygodniu» / "{n} of {total} vehicles filled this week", `text-sm text-text-sub`. |
| **Empty report after filter** | "Tylko jeżdżące" on, nothing moved this week | A lightweight in-card `<EmptyState>` (icon `Gauge`): «Żaden pojazd nie jeździł w tym tygodniu» / "No vehicle moved this week." with a hint to toggle the filter off or change week. Distinct from the true no-vehicles empty. |
| **Error** | fetch fails | The standard query-error treatment used elsewhere (inline error card with retry). No bespoke token. |

### 7.7.9 Delegation km-calendar (carrier delegation detail modal) — `<DelegationKmCalendar>`

The "visual link" delegation↔km, **inside** the existing §6.4.1 delegation detail modal (`<EntityDetailModal>` + `<RouteCard>`). It is a **fourth body block**, a `span:'full'` section below the §6.4.1 «STATUS I AUDYT» section, rendered as a `fullWidth` row (the §6.20 escape hatch — same mechanism the `<RouteCard>` and `<BreakdownTable>` use).

**What it shows.** A compact **per-day calendar** spanning the delegation period from `departureAt` to the **real trip end** (date-only span, same `differenceInCalendarDays` math as the §6.4.1 duration pill). For each day in the period it shows the assigned vehicle's `VehicleDailyKm` (joined by `vehicleId` + date intersection — **no FK**, the join is purely visual/data-side). This makes a carrier *see* how the truck performed during the trip without any modelled relationship.

**Window length — real trip end, not always `plannedReturnAt`.** The strip's `start` is always `date(departureAt)` (the outing anchor; prior-trip days are excluded). The `end` is the **actual** end of the trip, which can extend **past** `plannedReturnAt` when the carrier returns late:

- **`zjechal`** (closed) → `end = actualReturnAt` (later km belong to the *next* trip; an early return shortens the strip, a late return lengthens it).
- **`w_trasie`** (open) → `end = max(plannedReturnAt, lastKmDate)`, where `lastKmDate` is the latest recorded `VehicleDailyKm.date` on or after departure. A late-running trip with km past the plan shows those days; the empty tail is clamped to the last real km day so a long open trip doesn't paint weeks of empty tiles.
- **`gotowy` / `zgloszony`** (not departed) → `end = plannedReturnAt` (the planning window).

This fixes the prior behaviour where the strip *always* stopped at `plannedReturnAt` and **hid** the existing `VehicleDailyKm` rows for late-return days. The colour/state vocabulary and layout are unchanged — only the window LENGTH changes. The window math is a pure helper `deriveCalendarWindow(delegation, kmRows, today)` (+ `calendarFetchTo` for the broad FETCH `to`) in `apps/web/lib/format/delegationCalendar.ts`, unit-tested; `today` is the Europe/Warsaw business date (`businessTodayIso`).

**Layout — period-strip calendar (not a full month grid).** Because a delegation is a short bounded span (the duration pill already shows «{n} dni»), render a **horizontal strip of day-cells** (one per day in the period), wrapping to multiple rows when long, NOT a full month calendar (a month grid would be mostly empty padding for a 4-day trip). Each day-cell is a small tile:

```
┌─ section (span:'full') — «Przebieg w trakcie wyjazdu» ───────────────────────┐
│  NR REJ. WGM1234 · 12.03–16.03.2025 · 4 dni            Σ 1 240 km            │
│                                                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                               │
│  │ ŚR   │ │ CZ   │ │ PT   │ │ SB   │ │ ND   │                               │
│  │ 12.03│ │ 13.03│ │ 14.03│ │ 15.03│ │ 16.03│                               │
│  │ 420  │ │ 380  │ │ 440  │ │ ·    │ │  —   │                               │
│  │ ✓ km │ │ ✓ km │ │ ✓ km │ │nie j.│ │brak  │                               │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

Day-tile anatomy (`rounded-lg border border-border bg-card p-2 text-center min-w-[64px]`):
- top: weekday abbrev `text-[10px] uppercase text-text-sub` + date `DD.MM` `text-xs tabular-nums`.
- middle: the **value** — `drove` ⇒ km `font-mono font-semibold tabular-nums text-text` + tile gets `bg-success/10` + a leading `<Check size={11} className="text-success"/>`; `idle` ⇒ «nie jeździ» muted `text-xs text-text-sub` on `bg-input`; `empty` (no row) ⇒ faint `—` `text-text-sub/60` (no tint). **Same three-state vocabulary as `<KmCell>` §7.7.1** — deliberate consistency so a carrier and a verifier read the same colours.
- Departure / planned-return days may carry a tiny corner marker (a `<Plane>`/`<Flag>` `size={10} text-text-sub`) to anchor the trip ends to the §6.4.1 route card, but keep it subtle.

**Section header + summary line.** Header label (PL) «Przebieg w trakcie wyjazdu» / (EN) "Mileage during the trip", icon `<Gauge size={15}/>`. A right-aligned `Σ {sum} km` (`font-mono tabular-nums`) sums only the `drove` days in the window. Sub-line under the header: `NR REJ. {plate} · {DD.MM}–{DD.MM} · {n} dni` `text-xs text-text-sub`.

**No vehicle assigned / no data.**
- If the delegation has no resolvable `vehicleId` (carrier never attached one): omit the section entirely (per §6.4 "empty section omitted") — don't render an empty calendar.
- If a vehicle is attached but **zero** `VehicleDailyKm` rows fall in the window: still render the section with all-`empty` day tiles and a muted caption «Brak danych km dla tego okresu» / "No km data for this period." — this is informative (it tells the carrier the verifier hasn't recorded the trip yet), so it is shown rather than omitted.

**Read-only.** The carrier never edits km here — this is purely a window into the verifier's data. No inputs, no toggles. Tiles are inert (not focus targets beyond reading); the whole block is `aria-label`ed «Przebieg pojazdu {plate} w okresie {od}–{do}».

**Responsive.** The day-strip is `flex flex-wrap gap-2`; tiles keep `min-w-[64px]`. On a long delegation (e.g. 14 days) it wraps to 2–3 rows — acceptable and readable; never horizontal-scroll inside the modal body. On phones the modal is already full-width-ish (§6.4.1), tiles wrap naturally.

**a11y / contrast.** Three-state meaning carried by **icon + text**, not colour alone (`✓`+km, «nie jeździ», `—`) — same colour-blind-safe rule as the grid. `bg-success/10` is decorative reinforcement only. `text-text-sub` on `bg-input`/`bg-card` clears AA at the 11–13px sizes used (same as the §6.4.1 route-card sub-labels). Tiles are `tabular-nums` so km align across the strip.

### 7.7.10 i18n contract — `weryfikator.km.*` and `delegation.kmCalendar.*` (PL + EN)

Two namespaces. Web-agent adds these to `messages/pl.json` / `messages/en.json`. ICU plurals where marked. Keys are the contract; do not rename.

**`weryfikator.km.*`** (board + read-report share this namespace; report-only keys noted):

| Key | PL | EN |
|---|---|---|
| `weryfikator.km.title` | «Raport km — moje pojazdy» *(report)* / «Tablica km» *(board)* | "Km report — my vehicles" / "Km board" |
| `weryfikator.km.subtitle` | «Dzienny przebieg pojazdów — tydzień {week}» | "Daily vehicle mileage — week {week}" |
| `weryfikator.km.tiles.week` | «Tydzień» | "Week" |
| `weryfikator.km.tiles.tractors` | «Ciągniki» | "Tractors" |
| `weryfikator.km.tiles.inMotion` | «W ruchu» | "In motion" |
| `weryfikator.km.tiles.idle` | «Nie jeżdżą» | "Not driving" |
| `weryfikator.km.tiles.sumKm` | «Σ km» | "Σ km" |
| `weryfikator.km.tiles.notes` | «Notatek» | "Notes" |
| `weryfikator.km.col.vehicle` | «Pojazd» | "Vehicle" |
| `weryfikator.km.col.sideShort` | «bok {side}» | "side {side}" |
| `weryfikator.km.col.carrier` | «Przewoźnik» | "Carrier" |
| `weryfikator.km.col.opiekun` | «Opiekun» | "Account manager" |
| `weryfikator.km.col.dispatcher` | «Dyspozytor» | "Dispatcher" |
| `weryfikator.km.col.sumKm` | «Σ km» | "Σ km" |
| `weryfikator.km.col.note` | «Notatka» | "Note" |
| `weryfikator.km.col.history` | «Historia» | "History" |
| `weryfikator.km.weekday.mon`…`.sun` | «Pn / Wt / Śr / Cz / Pt / Sb / Nd» | "Mon / Tue / Wed / Thu / Fri / Sat / Sun" |
| `weryfikator.km.cell.drove` *(view display + modal state label)* | «Jechał» | "Drove" |
| `weryfikator.km.cell.idle` *(view display + modal state label)* | «Nie jeździ» | "Not driving" |
| `weryfikator.km.cell.empty` *(view display + clear target)* | «Nie sprawdzono» | "Not checked" |
| `weryfikator.km.cell.kmPlaceholder` *(view display unit)* | «km» | "km" |
| `weryfikator.km.cell.locked` *(SR/state suffix — today/future, edit board)* | «zablokowane» | "locked" |
| `weryfikator.km.cell.lockedHint` *(optional tooltip on a locked cell)* | «Można uzupełnić dopiero następnego dnia.» | "Can only be filled in the next day." |
| `weryfikator.km.modal.title` | «{plate} · bok {side}» | "{plate} · side {side}" |
| `weryfikator.km.modal.desc` | «{carrier} · {weekday}, {date}» | "{carrier} · {weekday}, {date}" |
| `weryfikator.km.modal.stateLabel` | «Status dnia» | "Day status" |
| `weryfikator.km.modal.stateDrove` | «Jechał» | "Drove" |
| `weryfikator.km.modal.stateIdle` | «Nie jeździ» | "Not driving" |
| `weryfikator.km.modal.kmLabel` | «Przebieg (km)» | "Mileage (km)" |
| `weryfikator.km.modal.kmRequired` | «Podaj km» | "Enter km" |
| `weryfikator.km.modal.kmZeroHint` | «0 km? oznacz „nie jeździ”» | "0 km? mark “not driving”" |
| `weryfikator.km.modal.notesLabel` | «Notatka» | "Note" |
| `weryfikator.km.modal.notesPlaceholder` | «Notatka do dnia…» | "Note for this day…" |
| `weryfikator.km.modal.save` | «Zapisz» | "Save" |
| `weryfikator.km.modal.cancel` | «Anuluj» | "Cancel" |
| `weryfikator.km.modal.saveError` | «Nie udało się zapisać km» | "Failed to save km" |
| `weryfikator.km.clear.action` | «Wyczyść ten dzień» | "Clear this day" |
| `weryfikator.km.clear.confirmTitle` | «Wyczyść ten dzień?» | "Clear this day?" |
| `weryfikator.km.clear.confirmBody` | «Czy na pewno chcesz wyczyścić zapis km dla {plate}, {weekday} {date}? Dzień wróci do stanu „Nie sprawdzono”.» | "Are you sure you want to clear the km record for {plate}, {weekday} {date}? The day will return to “Not checked”." |
| `weryfikator.km.clear.confirm` | «Wyczyść» | "Clear" |
| `weryfikator.km.clear.cancel` | «Anuluj» | "Cancel" |
| `weryfikator.km.clear.error` | «Nie udało się wyczyścić dnia» | "Failed to clear the day" |
| `weryfikator.km.nav.prev` | «Poprzedni tydzień» | "Previous week" |
| `weryfikator.km.nav.next` | «Następny tydzień» | "Next week" |
| `weryfikator.km.nav.current` | «Bieżący tydzień» | "Current week" |
| `weryfikator.km.nav.weekLabel` | «Tydzień {week} · {from}–{to}» | "Week {week} · {from}–{to}" |
| `weryfikator.km.nav.pickWeek` | «Wybierz tydzień» | "Pick a week" |
| `weryfikator.km.progress` | «{checked} z {total} pojazdów uzupełnionych w tym tygodniu» | "{checked} of {total} vehicles filled this week" |
| `weryfikator.km.filter.inMotionOnly` | «Tylko jeżdżące» *(report)* | "In-motion only" |
| `weryfikator.km.readOnlyBanner` | «Dane są tylko do podglądu — edytuje weryfikator.» *(report)* | "Data is read-only — managed by the verifier." |
| `weryfikator.km.empty.noVehicles` | «Brak aktywnych pojazdów» | "No active vehicles" |
| `weryfikator.km.empty.noAssigned` | «Brak przypisanych pojazdów» *(report)* | "No vehicles assigned to you" |
| `weryfikator.km.empty.noMotion` | «Żaden pojazd nie jeździł w tym tygodniu» *(report, filtered)* | "No vehicle moved this week" |
| `weryfikator.km.month.title` *(monthly km modal §7.7.6)* | «Przebieg km — {plate} · bok {side}» | "Mileage — {plate} · side {side}" |
| `weryfikator.km.month.desc` | «{carrier}» | "{carrier}" |
| `weryfikator.km.month.prev` *(aria — prev-month nav)* | «Poprzedni miesiąc» | "Previous month" |
| `weryfikator.km.month.next` *(aria — next-month nav)* | «Następny miesiąc» | "Next month" |
| `weryfikator.km.month.gridLabel` *(aria — calendar table)* | «Kalendarz przebiegu km — {month}» | "Mileage calendar — {month}" |
| `weryfikator.km.month.sumLabel` *(footer Σ)* | «Σ km w miesiącu» | "Σ km this month" |
| `weryfikator.km.month.range` *(footer range)* | «Zakres: {from}–{to}» | "Range: {from}–{to}" |
| `weryfikator.km.month.emptyMonth` | «Brak zapisów km w tym miesiącu» | "No km records for this month" |
| `weryfikator.km.notesPopover.title` | «Notatki w tym tygodniu» | "Notes this week" |
| `weryfikator.km.notesPopover.empty` | «Brak notatek» | "No notes" |
| `weryfikator.km.aria.cell` | «{plate}, {weekday} {date}: {state}» | "{plate}, {weekday} {date}: {state}" |
| `weryfikator.km.aria.cellLocked` *(locked cell — edit board)* | «{plate}, {weekday} {date}: {state} — zablokowane (dzień bieżący lub przyszły)» | "{plate}, {weekday} {date}: {state} — locked (today or a future day)" |
| `weryfikator.km.aria.grid` | «Tygodniowa tablica km» | "Weekly km board" |
| `weryfikator.km.lagNote` *(edit board control area; §7.7.1b)* | «Dane aktualne na poprzedni dzień. Dzień bieżący i przyszłe są zablokowane.» | "Data as of the previous day. Today and future days are locked." |
| `weryfikator.km.lagNoteShort` *(read-only banner second line; §7.7.1b)* | «Dane aktualne na poprzedni dzień.» | "Data as of the previous day." |

**`delegation.kmCalendar.*`** (carrier delegation detail modal block):

| Key | PL | EN |
|---|---|---|
| `delegation.kmCalendar.title` | «Przebieg w trakcie wyjazdu» | "Mileage during the trip" |
| `delegation.kmCalendar.summary` | «NR REJ. {plate} · {from}–{to} · {days}» | "Reg. {plate} · {from}–{to} · {days}" |
| `delegation.kmCalendar.days` | `{n, plural, one {# dzień} few {# dni} many {# dni} other {# dni}}` | `{n, plural, one {# day} other {# days}}` |
| `delegation.kmCalendar.sumKm` | «Σ {sum} km» | "Σ {sum} km" |
| `delegation.kmCalendar.drove` | «{km} km» | "{km} km" |
| `delegation.kmCalendar.idle` | «nie jeździ» | "not driving" |
| `delegation.kmCalendar.empty` | «—» | "—" |
| `delegation.kmCalendar.noData` | «Brak danych km dla tego okresu» | "No km data for this period" |
| `delegation.kmCalendar.aria` | «Przebieg pojazdu {plate} w okresie {from}–{to}» | "Mileage of vehicle {plate} for {from}–{to}" |
| `delegation.kmCalendar.weekday.mon`…`.sun` | (reuse `weryfikator.km.weekday.*` values) | (same) |

> Plural source: `delegation.kmCalendar.days` mirrors the §6.4.1 `routeCard.durationDays` ICU plural — keep the two consistent (same PL `dzień`/`dni` rules). If web-agent prefers, point both at one shared key; the values must match.

### 7.7.11 Components / shared / nav summary (Phase 7.7)

| Change | Where | Owner |
|---|---|---|
| New page `weryfikator/km` (editable weekly km-board) | `app/(weryfikator)/weryfikator/km/page.tsx` | web-agent |
| New read-only km-report page(s) | `app/(planista)/…/km`, `app/(dyspozytor)/…/km`, `app/(eksport)/…/km` (+ admin under employee shell) — web-agent decides exact routes inside each role group | web-agent |
| Weryfikator landing redirect → `/weryfikator/km` (supersedes §7.5 `/weryfikator/vehicles`); delete old route-status page + `WelcomePanel` stub; header logo/home → `/weryfikator/km` | `app/(weryfikator)/weryfikator/page.tsx` | web-agent |
| New `<KmWeekGrid mode="edit"\|"view">` — the shared weekly matrix (frozen identity + 7 day tracks + Σ KM + Notatka + Historia) | `apps/web/components/km/KmWeekGrid.tsx` | web-agent |
| New `<KmCell>` — three-state **display** cell (drove/idle/empty); in `mode="edit"` an *unlocked* cell is a focusable button that opens `<KmCellEditDialog>` (no inline editor); a **locked** cell (`day >= today`, §7.7.1a) renders as **non-button** content — `cursor-not-allowed`, content `opacity-60`, top-right `<Lock size={11}>` glyph, `aria-disabled` + `aria.cellLocked`, not focusable | `apps/web/components/km/KmCell.tsx` | web-agent |
| New lag note + lock cue — reuse Lucide `<Info>` (lag note) and `<Lock>` (locked cell); edit board: standalone `role="note"` line in the header control area (`lagNote`); read-only banner: append `lagNoteShort` as 2nd line. **No** Alert/warning surface, not dismissible | `apps/web/components/km/` (lag note inline; lock cue inside `<KmCell>`) | web-agent |
| New `<KmCellEditDialog>` — per-day edit modal (state toggle + km input for `drove` + notes + Save/Cancel) reusing the `<Dialog>` primitive; cancel = zero changes/zero network; «Wyczyść ten dzień» destructive action (only when `cell.state != null`) routed through the existing destructive-confirm `<Dialog>` → `DELETE` day → returns cell to `empty` | `apps/web/components/km/KmCellEditDialog.tsx` | web-agent |
| New `<KmHeaderTiles>` (composes existing `<KpiCard>` ×6; **never** `tone="purple"`) | colocated with the km pages | web-agent |
| New `<WeekNavigator>` (prev/next/current + week-picker `<Popover>` reusing the existing date-picker) | `apps/web/components/km/` | web-agent |
| New `<VehicleMonthKmModal>` (read-only monthly km-calendar `<Dialog>`, §7.7.6) | `apps/web/components/km/` | web-agent |
| New `<DelegationKmCalendar>` — period-strip day-tiles, `fullWidth` `span:'full'` block inside the §6.4.1 delegation detail modal | `apps/web/components/delegations/DelegationKmCalendar.tsx` | web-agent |
| Wire `<DelegationKmCalendar>` as a 4th body section in `DelegationDetailModal` (after «STATUS I AUDYT»); omit when no vehicle | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| Reuse `<KpiCard>` / `<Dialog>` / `<Button>` / `<Input>` / `<Textarea>` / `<ToggleGroup>` / `<Popover>` / `<Switch>` / `<EntityDetailModal>` / `<EmptyState>` / `<Skeleton>` / `<Badge>` + the existing destructive-confirm dialog (`ConfirmDeleteWithReasonDialog` family, bare-confirm variant) for «Wyczyść ten dzień» | existing | — |
| shared Zod: add the day-clear delete shape (`DELETE /vehicles/:id/daily-km { date }`) alongside `SetVehicleDailyKmSchema` | `@magguarantee/shared` | api-agent |
| Derived-status tone-map reuse (`w ruchu→success`, `nie jeździ→muted`, `nieznany→outline`) | `@magguarantee/shared` (the §7.5.1 const-map) | — |
| shared Zod: `SetVehicleDailyKmSchema { date, state: 'drove'\|'idle', km?: number, notes?: string }`, `VehicleDailyKmDto`, `VehicleKmBoardItemDto`, enum `VehicleDayState`, derived-status helper | `@magguarantee/shared` | api-agent (contract per §0′) |
| Remove old `SetVehicleRouteStatusSchema` + route-status board page + `<VehicleRouteStatusHistoryDialog>` | shared + web | api-agent / web-agent |
| i18n: `weryfikator.km.*` (incl. new `weryfikator.km.modal.*` + `weryfikator.km.clear.*`; `cell.*` kept for view-mode display) + `delegation.kmCalendar.*` (§7.7.10); remove old `weryfikator.*` route-status strings | `messages/pl.json` / `en.json` | web-agent |
| **0** changes to `tailwind.config.ts` / `globals.css` | — | — |

### 7.7.12 Acceptance checklist (Phase 7.7)

- [ ] **Three-state cell.** `<KmCell>` renders exactly `drove` (km + `text-success` check + `bg-success/10`), `idle` («nie jeździ» on `bg-input`, no number), `empty` (faint `—`, no tint). Meaning carried by icon + text, never colour alone. Blank cell is never tinted as a warning.
- [ ] **Weekly grid.** Frozen identity block (sticky-left) with plate/side + carrier·opiekun·dyspozytor; 7 PN..ND day-columns with `DD.MM` headers; **today's column** has the brand underline accent; weekend columns softly tinted; trailing `Σ KM` (`bg-input`), `NOTATKA` roll-up, «Historia» action. Horizontal scroll lives in the card, never the page.
- [ ] **Header tiles.** Six `<KpiCard>` (TYDZIEŃ / CIĄGNIKI / W RUCHU / NIE JEŻDŻĄ / Σ KM / NOTATEK) with the §7.7.2 tones; **`tone="purple"` not used**; no orange/red aggregate; responsive `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` with no horizontal scroll at 320/360/640/1024/1280/1536/1920.
- [ ] **Locked cells (edit board only).** `isLocked = mode==='edit' && day >= today` (Europe/Warsaw). Locked cells render as **non-button** content (not focusable, not in tab order, no cell hover, `cursor-not-allowed`), keep their dimmed-but-legible three-state visual (`opacity-60`), carry a top-right `<Lock size={11} text-text-sub>` glyph (the only mark on a locked `empty` cell — replaces the `—`), and announce via `aria-disabled` + `aria.cellLocked`. No new token; no `bg-danger`/orange (a future day is not an error). In `mode="view"` no lock affordance is shown (cells already inert).
- [ ] **Lag notice.** Persistent `role="note"` info line «Dane aktualne na poprzedni dzień…» — **never** an Alert/warning surface, **not** dismissible, `text-xs text-text-sub` + leading `<Info size={14}>`. (a) Edit board: stands alone in the card header control area beside the `<WeekNavigator>` (`lagNote`, full copy incl. lock clause). (b) Read-only tabs (§7.7.7 + §7.8): appended as a **second line inside the existing read-only banner** (`lagNoteShort`), not a separate floating note. ≥4.5:1 in light + dark.
- [ ] **Editing (board only) — modal flow.** Clicking any cell (incl. `empty`, to create) opens `<KmCellEditDialog>` (reuses `<Dialog>`); header shows plate/side + carrier + weekday/date; `drove`/`nie jeździ` `<ToggleGroup>`; km `<Input>` shown **only** for `drove` (idle = no km field, payload `km:null`); empty+drove invalid with inline «Podaj km»; notes `<Textarea>`; «Zapisz» → upsert `PUT /vehicles/:id/daily-km`, optimistic Σ/counter update + rollback; «Anuluj»/Esc/overlay = **zero changes, zero network calls**. **No** inline cell editor, **no** spreadsheet cell-to-cell keyboard chaining.
- [ ] **Clear-with-confirm (board only).** «Wyczyść ten dzień» destructive action appears **only** when `cell.state != null`; routes through the existing destructive-confirm `<Dialog>` (danger framing, `variant="destructive"` confirm); on confirm `DELETE`s the day's record and returns the cell to `empty` / «Nie sprawdzono»; cancel = no change.
- [ ] **Read-only report.** Same grid `mode="view"`, cells inert, non-dismissible read-only banner, «Tylko jeżdżące» filter (default on), scoped payload trusted; keeps tiles / Σ / Historia / week-nav.
- [ ] **Week navigation.** prev/next/current + week-picker; `?week=YYYY-Www` is URL source of truth; grid-body skeleton on refetch with tiles + day-headers retained.
- [ ] **History dialog.** Read-only `<Dialog>` log newest-first (date / state / km-or-idle / actor / source manual|GPS / optional notes); empty state; dismiss-only footer.
- [ ] **States.** Loading skeleton; true `<EmptyState>` only for zero vehicles / empty team; **fresh week ≠ empty** (full grid of `—`, calm, optional «{n}/{total} uzupełnionych» helper); filtered-empty report has its own «żaden pojazd nie jeździł» empty.
- [ ] **Delegation km-calendar.** A `span:'full'` `fullWidth` block in the §6.4.1 delegation detail modal, below «STATUS I AUDYT»; period-strip day-tiles from `departureAt` to the real trip end (§7.7.9 window rule) joined by `vehicleId` (no FK); same three-state vocabulary; `Σ km` summary; omitted when no vehicle; shown-with-«brak danych» when vehicle present but no km; read-only + `aria-label`ed; wraps, never horizontal-scrolls.
- [ ] **Nav.** Weryfikator landing `redirect()`s to `/weryfikator/km`; old `/weryfikator/vehicles` route-status page + `WelcomePanel` removed; header logo/home → `/weryfikator/km`.
- [ ] **i18n.** All `weryfikator.km.*` + `delegation.kmCalendar.*` keys present in PL + EN (§7.7.10); ICU plural for `kmCalendar.days`; old route-status `weryfikator.*` strings removed.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts` / `globals.css` changes; no new colour/radius/shadow/font token; soft surfaces are `bg-input` only; tints are `bg-{success}/10` opacity variants; the whole grid + tiles + cells + calendar + monthly km-calendar modal legible in dark via tokens / `dark:` variants only.

## 7.8 «Moje pojazdy — przebieg» multi-carrier read-only km tab (NEW — AUTHORITATIVE 2026-06-13)

> **Scope.** A NEW, strictly **read-only** weekly km tab — a more presentable sibling of the §7.7.7 read-report — shown to four roles, each server-scoped to the vehicles that "belong" to them:
> - `przewoznik` (carrier) → only **their own** vehicles (one carrier);
> - `opiekun` → vehicles of the carriers they supervise (many carriers);
> - `planista` → vehicles where they are the planner (potentially many carriers);
> - `dyspozytor` → vehicles where they are the dispatcher (potentially many carriers).
>
> **It reuses everything from §7.7 unchanged:** `<KmBoardScreen mode="view">` → `<KmWeekGrid mode="view">` → `<KmCell>` (the exact three-state cell language, §7.7.1, **identical** so users don't relearn it), the §7.7.2 header tiles, the §7.7.5 week-navigation, the §7.7.6 history modal. There is **no cell editing** anywhere on this tab. The **only** net-new design concern is **visually distinguishing carriers** in a single table when a role can see vehicles from several carriers at once.
>
> **DECISION 1 (locked):** same WEEKLY grid with prev/next/current week navigation (§7.7.5). NOT a multi-week aggregate.
> **DECISION 2 (locked):** show **ALL** of the role's vehicles, including ones that didn't drive / have no marks that week. The §7.7.7 «Tylko jeżdżące» filter is **OFF by default here** and surfaced only as an opt-in toggle (see §7.8.5) — the purpose of this tab is fleet *oversight*, so a parked truck must still be visible.
>
> **Token policy.** No new radius/shadow/font tokens; surfaces stay on existing tokens. The carrier-accent palette (§7.8.2) needs mutually-distinguishable **non-semantic category** hues, which the current set cannot supply without abusing state colours — so §7.8.2 proposes a **single, minimal, additive** colour-token pair (`--color-cat-blue` + `--color-cat-violet`) with explicit justification, **or** a zero-new-token fallback (degraded distinguishability). This is flagged as an **open question for the user** (§ summary). MAGTRANS RED (`bg-brand`/`text-brand`) is **reserved** for the "today" column accent (§7.7.3) and is **never** used as a carrier accent — brand-red must not be diluted into an arbitrary category colour.
>
> **Sole km tab for planista/dyspozytor (2026-06-25).** For planista and dyspozytor this «Moje pojazdy — przebieg» tab (`/{role}/moje-pojazdy`) is now their **only** km surface — the duplicate §7.7.7 «Raport km» link and its `/planista/km` · `/dyspozytor/km` routes were removed. Eksport/admin keep the §7.7.7 read-report separately.

### 7.8.1 The carrier-distinction mechanism — grouped section-headers + a deterministic per-carrier accent

The treatment is a **combination**: **carrier group section-rows** (primary structure) **plus** a thin **deterministic carrier accent** (secondary reinforcement). Both are driven by the per-row `carrier { id, name }` already in `VehicleKmBoardItemDto` — **no new API field**.

**(a) Grouped carrier section-headers (primary).** Rows are sorted by `carrier.name` (locale `pl`, then by `plateNumber`) and rendered in contiguous carrier blocks. Each block opens with a **group header row** spanning the full table width (`<tr>` with a single `<td colSpan={allColumns}>`), styled as soft chrome — `bg-input` (the established "derived/grouping surface" tone), `h-9`, `px-3`, `sticky left-0` for the label so it stays anchored during horizontal scroll. Group header content, left→right:
- a **4px carrier-accent rail** (`w-1 self-stretch rounded-full` using the carrier's `accentBar` class, §7.8.2) — the colour key;
- the **carrier name** `text-sm font-semibold text-text` (`<Truck size={14} className="text-text-sub" />` leading icon);
- a right-aligned **per-carrier roll-up** `text-xs text-text-sub tabular-nums`: «{n} pojazdów · Σ {sum} km» (vehicle count in the block + sum of that block's `drove` km this week).

This makes the table scan as a sequence of small per-carrier mini-boards while keeping ONE set of frozen day-columns, ONE header, ONE week. Group headers are **not** collapsible in v1 (keep it simple; the accent + sort already do the work) — a future enhancement may add disclosure, but it is out of scope.

**(b) Per-row carrier accent (secondary).** Every vehicle row carries a **2px left accent border** in the carrier's colour (`border-l-2` + the carrier's `accentBorder` class, §7.8.2), applied to the **frozen identity cell only** (so it travels with the sticky-left block and never bleeds into the scrolling day tracks). This is a quiet reinforcement so that, even when a long carrier block scrolls past its group header, the row still reads as "belonging to carrier X". The accent is **border + the group rail only** — rows do **not** get a tinted background (a full-row tint would fight the §7.7.1 `bg-success/10` "drove" cell tint, which must stay the dominant in-cell signal). Colour is therefore never the *sole* carrier signal: the group header name is the accessible source of truth; the accent is decorative reinforcement (WCAG 1.4.1 — meaning not by colour alone).

**(c) Identity meta line — drop the redundant carrier name.** On this tab the §7.7.3 identity meta line (`przewoźnik · opiekun · dyspozytor`) **drops the `przewoźnik` segment inside grouped mode** (it is already the group header) and shows only the still-useful `opiekun · dyspozytor` context. (On the §7.7.7 weryfikator/admin board the full meta line is unchanged — this drop is scoped to this tab's grouped rendering.)

**(d) Block treatment — discrete carrier blocks with a spacer band (REFINEMENT 2026-06-15 — AUTHORITATIVE, locks (a)/(b)).** The shipped grouped grid read as *uneven / messy*. Root cause is NOT zebra striping (there is none) — it is **three different tints stacking against plain rows with carriers running together**: the `bg-input` group-header band, the weekend-column `bg-input` tint, and the Σ-column `bg-input` tint all share one surface tone, so a contiguous run of carriers reads as random alternating shading. The fix is to make the grid read as **discrete per-carrier blocks** and to **stop the three tints from looking like the same accidental pattern**. The following five decisions are binding; they change ONLY the grouped (`grouped === true`) rendering — the plain §7.7.7 path is byte-for-byte unchanged.

> **(d1) Inter-block gap — a presentational spacer `<tr>`.** Because this is a real `<table>`, CSS flex/grid `gap` does not apply between rows; the only way to put air between carrier blocks is a dedicated spacer row. **Between every two carrier blocks** (i.e. *before* every group-header row **except the first**) render one spacer row:
> ```
> <tr aria-hidden="true" class="h-3 bg-bg">
>   <td colSpan={TOTAL_COLUMNS} class="sticky left-0 bg-bg p-0" />
> </tr>
> ```
> - **Height `h-3` (12px)** — enough air to read blocks as separate, small enough to keep the fleet dense.
> - **Surface `bg-bg`** (the app/page canvas tone, *one step back from* the `bg-card` table body) — this is the key move: the gap reads as a true break "through" the card, visually detaching one block from the next, instead of looking like another tinted row.
> - **`aria-hidden="true"`, no interactive content, single empty `colSpan` cell.** It is invisible to SR and to keyboard.
> - **`sticky left-0` on the spacer cell with the SAME `bg-bg`** so the frozen identity column does not show a colour seam under the gap during horizontal scroll (the sticky cell must repaint the canvas tone, not let the body `bg-card` bleed through). One cell spanning all columns is correct — `colSpan={TOTAL_COLUMNS}` keeps it visually continuous across the scroll region.
> - The spacer sits **inside `<tbody className="divide-y divide-border">`**; that is fine — an empty 12px `bg-bg` row between blocks just renders the divider hairlines flush against the canvas gap, which reinforces the break rather than fighting it. Do **not** add the spacer before the first block or after the last (no leading/trailing dead space; the card's own padding/edges handle those).

> **(d2) Weekend / Σ tint vs the group-header band — restyle the band, keep the column tints.** The column tints (weekend `bg-input`, Σ `bg-input`) are **load-bearing data affordances** and must stay (weekend separation + the running total are real signals, identical to §7.7.7 — do not touch them). What must change is the **group-header band**, so it stops sharing the exact `bg-input` tone that the columns use. **Promote the group-header row to the `bg-card` surface** (the table-body base tone) **with a `bg-input` accent only on the rail+label cluster is unnecessary** — instead give the header row a clear *structural* identity rather than another wash:
> - Header row surface: **`bg-card`** (NOT `bg-input`) — same base as the data rows, so it no longer reads as "one more tinted band".
> - It is set apart **structurally**, not by a competing tint: a **bottom hairline `border-b border-border`** under the header cluster + the **4px carrier rail** (see (d3)) + the header's own typographic weight (`text-sm font-semibold text-text`). The spacer `bg-bg` gap above it (d1) already frames the block, so the header needs no fill of its own.
> - Net effect: within a block, the only `bg-input` surfaces are the **weekend columns and the Σ column** — and because every data row in the block shows them in the *same vertical tracks*, they read as **columns**, not as random per-row alternation. The header band no longer adds a fourth competing tone.

> **(d3) Carrier accent — strengthen and unify as the block's identity.** Keep the deterministic accent (§7.8.2) but make it the *single* per-block identity cue, applied consistently top-to-bottom on the frozen identity column:
> - **Group-header rail:** keep the **4px** rail (`w-1 self-stretch rounded-full` + `accentBar`), `h-5` is fine; it leads the header cluster.
> - **Vehicle-row border:** keep the **2px** `border-l-2 ${accentBorder}` on the **frozen identity cell only** (never on the scrolling day cells).
> - **Alignment:** the header rail and the row borders sit in the same left edge of the frozen column, so the whole block reads as a single coloured spine. This + the `bg-bg` gap is what makes each block read as "one carrier", with no need for any card border/shadow per block (a per-block `<Card>` is impossible inside one `<table>` and is explicitly rejected — the spine + gap do the containment job).

> **(d4) Row striping — NONE.** Do **not** introduce zebra striping in grouped mode (or anywhere). Containment is carried entirely by: the `bg-bg` spacer gap (d1) + `divide-y divide-border` row hairlines + the carrier spine (d3) + the restyled header (d2). Adding alternating row fills would re-create exactly the "random alternation" the user complained about and would fight the in-cell `bg-success/10` drove tint. Row hover stays `hover:bg-brand-50 dark:hover:bg-brand/10` unchanged.

> **(d5) Sticky-left integrity on horizontal scroll.** Every full-width row in grouped mode (group header **and** spacer) uses a **single `colSpan={TOTAL_COLUMNS}` cell that is itself `sticky left-0`** and repaints its own surface (`bg-card` for the header, `bg-bg` for the spacer). This guarantees that as the day-columns scroll under the frozen identity column, neither the header band nor the gap shows a colour seam or lets the body `bg-card` bleed through the frozen edge. The header's `border-b border-border` likewise spans the full `colSpan`, so the hairline is continuous across the scroll region.

> **Summary of the visual model.** Page canvas (`bg-bg`) → card (`bg-card`, `rounded-xl border border-border shadow-card`) → inside it, a stack of carrier blocks separated by 12px `bg-bg` spacer rows; each block = a `bg-card` group header (carrier rail + name + roll-up, `border-b border-border`) followed by its `bg-card` vehicle rows (carrier-coloured 2px spine on the frozen cell, weekend + Σ `bg-input` column tints, `divide-y` hairlines). No new tokens; the only behavioural change vs the shipped grid is: header band `bg-input → bg-card` + `border-b`, plus the new `bg-bg` spacer rows between blocks.

### 7.8.2 Deterministic carrier → accent assignment (algorithm + palette)

Carrier accents are computed **client-side** from `carrier.id` — the server assigns **no** colour, so the contract is untouched and the same carrier always renders the same accent everywhere (this tab, future carrier chips, etc.).

**Algorithm** (mirrors the shipped `avatarBg` hash in `components/audit/AuditRow.tsx`, kept deterministic across renders):

```ts
// lib/format/carrier-accent.ts  (web-agent)
export function carrierAccentIndex(carrierId: string): number {
  let h = 0;
  for (const ch of carrierId) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return h % CARRIER_ACCENT_PALETTE.length;
}
```

`carrierId` is a UUID → stable, high-entropy seed; the `& 0xffff` keeps it a small int; `% palette.length` lands in the palette. Same id ⇒ same index ⇒ same colour, with no server round-trip and no persistence.

**Token reality check (read first).** The shipped token set (`globals.css @theme`) has only these semantic accent hues: `brand` `#dc2626` (red), `danger` `#ef4444` (red — visually ~brand), `success` `#22c55e` (green), `warning` `#f97316` (orange), `info` `#eab308` (**yellow**, not blue), the neutral `text-sub`, and one reserved calm surface `info-soft` `#f0f9ff` (slate-blue). **There is no blue and no purple token** — `KpiCard tone="purple"` deliberately maps to `bg-brand`. After removing the reserved/colliding hues (`brand`+`danger` are reserved for the "today" accent and read as red; `success` is the in-cell `drove` signal), the cleanly-usable *neutral category* hues are effectively **warning (orange), info (yellow), text-sub (slate)** — only **three**. That is not enough mutually-distinguishable accents for a `planista`/`dyspozytor` who can see a handful of carriers.

**Decision — propose ONE minimal new token, justified.** Rather than overload state colours (which would re-teach users that orange/green *mean* something on a board where they already encode operational state), introduce a **single new, semantically-empty "category" token family** explicitly for categorical (carrier) accents — `--color-accent-cat` is **wrong**; instead add **two** neutral-but-distinct hues that the palette below + future category needs (audit avatars, tag chips) can share: a **blue** and a **violet**, the two hues a Western user most strongly reads as "just a category, not a status". This is the **only** justified token addition in §7.8 and it is additive (no existing token changes, no existing usage affected):

```css
/* globals.css @theme — NEW categorical accents (non-semantic, for carrier/tag grouping).
 * Chosen because (a) the set lacks any blue/violet, (b) blue+violet read as
 * neutral categories, never as success/warning/danger state. Used at low
 * opacity as rails/borders — never as text/fill that implies meaning. */
--color-cat-blue:   #3b82f6;   /* tailwind blue-500   */
--color-cat-violet: #8b5cf6;   /* tailwind violet-500 */
```

> **Justification against the strict no-new-token policy.** §7.7 forbade new tokens because it composed purely from existing *state* colours and that was sufficient. §7.8's carrier-distinction is a genuinely *new need* (mutually-distinguishable **non-semantic categories**) that the existing palette cannot satisfy without abusing state colours — exactly the situation the policy's "unless justified" escape covers. Two hues is the minimum that, combined with the three already-clean families, yields six. If the user prefers ZERO new tokens, the fallback is the **3-hue + opacity-step** palette in the note below (degraded distinguishability) — flag this as an **open question for the user**.

**Palette — 6 category accents.** Each entry exposes `accentBar` (the 4px group rail) and `accentBorder` (the 2px row border). All used at controlled opacity so they read as quiet rails, never as full surfaces. Disjoint from the in-cell `success`/`bg-input` state language and from the reserved brand-red "today" accent.

| idx | Accent (category) | `accentBar` (4px rail) | `accentBorder` (2px row) | Source |
|---|---|---|---|---|
| 0 | Blue | `bg-cat-blue/70 dark:bg-cat-blue/80` | `border-cat-blue/60` | **new** `cat-blue` |
| 1 | Violet | `bg-cat-violet/70 dark:bg-cat-violet/80` | `border-cat-violet/60` | **new** `cat-violet` |
| 2 | Amber/orange | `bg-warning/60 dark:bg-warning/70` | `border-warning/55` | existing `warning` |
| 3 | Yellow | `bg-info/65 dark:bg-info/75` | `border-info/60` | existing `info` |
| 4 | Slate (neutral-strong) | `bg-text-sub/55 dark:bg-text-sub/65` | `border-text-sub/50` | existing `text-sub` |
| 5 | Teal-ish (success-deep) | `bg-success/60 dark:bg-success/70` | `border-success/55` | existing `success` at a **deeper, 4px-rail-only** opacity, spatially separated from the full-cell `bg-success/10` drove tint |

> **Why six and the wrap behaviour.** Six covers the realistic multi-carrier roles; a single `opiekun`/`planista`/`dyspozytor` rarely sees >6 carriers in one week. On overflow (>6) the hash wraps and two carriers share an accent — acceptable, because the **group-header name is the accessible source of truth** (§7.8.1c) and the accent is only a scanning aid.
> **Why idx 5 reuses `success` despite the drove tint.** The cell uses `bg-success/10` as a full-cell wash; idx 5 uses `bg-success/60` as a 4px solid vertical rail in the frozen identity column only — different surface, saturation, and location; they never overlap spatially. If web-agent finds them confusable, drop idx 5 to a second `cat-blue`/`cat-violet` opacity step.
> **ZERO-new-token fallback (if user vetoes the two tokens).** Build the 6 indices from the 3 clean families at two opacity steps each: `warning/60`, `warning/35`, `info/65`, `info/35`, `text-sub/55`, `success/60`. Distinguishability is weaker (orange-light vs orange-dark is subtle) but it adds no tokens. Default recommendation is the 2-token palette above; this fallback is the conservative alternative pending the open question.

### 7.8.3 Single-carrier collapse (`przewoznik` and any role with one carrier)

When the visible rows resolve to **exactly one** distinct `carrier.id` (always true for `przewoznik`; also true for an `opiekun`/`planista`/`dyspozytor` who happens to have a single carrier this week), the carrier-distinction treatment **gracefully collapses**:
- **No group section-header row** is rendered (a single «{carrier}» header over the whole table is pure redundancy).
- **No per-row accent border** (nothing to distinguish from).
- The identity meta line behaves exactly as §7.7.3 (carrier shown there is harmless; for `przewoznik` it is their own name — web-agent may also drop it since the page title already scopes to "my vehicles").
- The table is then **visually identical** to the plain §7.7.7 read-report grid — which is the desired outcome: a carrier sees a clean, ungrouped weekly board of just their trucks.

Collapse is decided purely from the data (`new Set(items.map(i => i.carrier?.id)).size <= 1`), not from the role — so a multi-carrier role with one carrier this week also collapses, and a `przewoznik` is just the guaranteed case. **Grouped mode renders only when `distinctCarriers >= 2`.**

### 7.8.4 Layout & chrome

- **Container.** Lives in each role's shell. For `przewoznik` → the carrier panel as a new tab «Przebieg» (alongside the existing carrier tabs); for `opiekun` → the employee shell «Moja opieka» area / a dedicated route; for `planista`/`dyspozytor` → their `RoleShell` (sidebar-less), reusing the §7.7.7 container strip `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`. Web-agent decides exact route paths inside each role group.
- **Page heading** «Moje pojazdy — przebieg» + a one-line scope subtitle per role (§7.8.6 i18n).
- **Header tiles (§7.7.2) are kept**, with one scoped relabel: tile #2 «CIĄGNIKI» counts the role's visible tractors; for multi-carrier roles an **optional** extra tile «PRZEWOŹNICY» (count of distinct carriers) MAY replace tile #6 «NOTATEK» on this tab — `tone="neutral"`, icon `Building2`/`Users`. Keep the §7.7.2 breakpoint family; do not add orange/red.
- **Read-only banner.** Reuse the §7.7.7 non-dismissible read-only banner, copy scoped to this tab (§7.8.6 `myKm.readOnlyBanner`): «Dane są tylko do podglądu — przebieg uzupełnia weryfikator.»
- **Grid.** `<KmWeekGrid mode="view">` exactly as §7.7.3/§7.7.7 — frozen identity, 7 PN..ND tracks (today-accent + weekend tint unchanged), Σ KM, NOTATKA roll-up, «Historia». In grouped mode the group-header rows + inter-block spacer rows are interleaved by `<KmWeekGrid>` (it already owns the `<tbody>` map; web-agent adds the group-break rows there, gated by a new `groupByCarrier?: boolean` prop — default `false` so §7.7 callers are untouched). **The grouped block treatment is locked in §7.8.1d** (spacer-row gap, `bg-card` header band, carrier spine, no striping) — implement exactly that.

### 7.8.5 «Tylko jeżdżące» filter — OFF by default, opt-in only (overrides §7.7.7 default for this tab)

Per DECISION 2, the in-motion filter is **off by default** on this tab. It is still surfaced as a single opt-in `<Checkbox>`/`<Switch>` «Tylko jeżdżące» in the control row (same `bg-input` filter chip as §7.7.7), so a user can narrow to movers on demand — but the landing view shows the **full** fleet including parked/blank-week vehicles. `<KmBoardScreen>` gets the default wired by a prop (e.g. `inMotionDefault?: boolean`, default `true` to keep §7.7.7 unchanged; this tab passes `false`). The filtered-empty state (§7.7.8 «Żaden pojazd nie jeździł w tym tygodniu») still applies when the user *does* turn it on and nothing moved.

### 7.8.6 i18n contract — `myKm.*` (PL default + EN)

A NEW namespace `myKm.*` for this tab's chrome. All grid/cell/nav/history/tiles strings are **reused** from `weryfikator.km.*` (§7.7.10) — do NOT duplicate them; only the tab-specific copy below is new.

| Key | PL | EN |
|---|---|---|
| `myKm.title` | «Moje pojazdy — przebieg» | "My vehicles — mileage" |
| `myKm.subtitle.carrier` | «Tygodniowy przebieg Twoich pojazdów — tydzień {week}» | "Weekly mileage of your vehicles — week {week}" |
| `myKm.subtitle.opiekun` | «Przebieg pojazdów Twoich przewoźników — tydzień {week}» | "Mileage of your carriers' vehicles — week {week}" |
| `myKm.subtitle.planista` | «Przebieg planowanych pojazdów — tydzień {week}» | "Mileage of your planned vehicles — week {week}" |
| `myKm.subtitle.dyspozytor` | «Przebieg pojazdów Twojego zespołu — tydzień {week}» | "Mileage of your team's vehicles — week {week}" |
| `myKm.tab` | «Przebieg» | "Mileage" |
| `myKm.readOnlyBanner` | «Dane są tylko do podglądu — przebieg uzupełnia weryfikator.» | "Data is read-only — mileage is recorded by the verifier." |
| `myKm.group.summary` | `{count, plural, one {# pojazd} few {# pojazdy} many {# pojazdów} other {# pojazdów}} · Σ {sum} km` | `{count, plural, one {# vehicle} other {# vehicles}} · Σ {sum} km` |
| `myKm.tiles.carriers` | «Przewoźnicy» | "Carriers" |
| `myKm.filter.inMotionOnly` | «Tylko jeżdżące» | "In-motion only" |
| `myKm.empty.noVehicles.carrier` | «Nie masz jeszcze pojazdów» | "You have no vehicles yet" |
| `myKm.empty.noVehicles.scoped` | «Brak przypisanych pojazdów» | "No vehicles assigned to you" |
| `myKm.aria.carrierGroup` | «Przewoźnik {carrier}: {count} pojazdów» | "Carrier {carrier}: {count} vehicles" |

> Reuse from `weryfikator.km.*`: every `col.*`, `weekday.*`, `cell.*`, `nav.*`, `tiles.week|tractors|inMotion|idle|sumKm`, `history.*`, `notesPopover.*`, `aria.cell|grid`, **`lagNoteShort`** (the lag line appended to the read-only banner — §7.7.1b context (b)). The `myKm.*` namespace exists only for the heading/subtitle/banner/group/tab strings that differ. **Note:** `cell.locked`/`cell.lockedHint`/`aria.cellLocked`/`lagNote` (the *full* edit-board variants) are **not** used by `myKm.*` — those tabs are `mode="view"`, where no cell is lockable; only `lagNoteShort` applies.

### 7.8.7 Components / shared / nav summary (Phase 7.8)

| Change | Where | Owner |
|---|---|---|
| New page(s) «Moje pojazdy — przebieg» per role | `app/(carrier)/.../km` (tab), `app/(employee)/.../moja-opieka/km` or similar, `app/(planista)/.../km`, `app/(dyspozytor)/.../km` — web-agent decides exact paths | web-agent |
| Reuse `<KmBoardScreen mode="view">` with a new `inMotionDefault={false}` prop + a new `groupByCarrier` prop wired through to `<KmWeekGrid>` | `components/km/KmBoardScreen.tsx` | web-agent |
| Extend `<KmWeekGrid>` with `groupByCarrier?: boolean` (default `false`) → interleave carrier group-header rows (`colSpan` full) sorted by `carrier.name`, + 2px `accentBorder` on the frozen identity cell; collapse to plain grid when `distinctCarriers <= 1`; drop `przewoźnik` segment from the meta line in grouped mode | `components/km/KmWeekGrid.tsx` | web-agent |
| New `carrierAccentIndex(id)` + `CARRIER_ACCENT_PALETTE` (`accentBar` / `accentBorder` class pairs, §7.8.2) | `apps/web/lib/format/carrier-accent.ts` | web-agent |
| **(pending user sign-off)** add `--color-cat-blue` + `--color-cat-violet` to `globals.css @theme` (the ONLY token addition; §7.8.2). If vetoed → use the zero-new-token fallback palette | `apps/web/app/globals.css` | web-agent (after user decision) |
| New i18n namespace `myKm.*` (§7.8.6) in PL + EN; reuse `weryfikator.km.*` for grid/cell/nav/history | `messages/pl.json` / `en.json` | web-agent |
| New read-scoped endpoints OR reuse `GET /vehicles/km-report?week=…` with role-based server scoping for `przewoznik`/`opiekun`/`planista`/`dyspozytor` (carrier→own, opiekun→supervised carriers, planista→plannerId, dyspozytor→team). **Same `VehicleKmBoardDto` envelope** — `carrier{id,name}` + `opiekun{id,name}` already present, **no contract change** | `apps/api` (vehicles km-report controller scope) | api-agent |
| Add `przewoznik`/`opiekun` to the roles allowed on the km-report read endpoint (currently planista/dyspozytor/eksport/admin) | api guard on `GET /vehicles/km-report` | api-agent |
| **0** new radius/shadow/font tokens; only the §7.8.2 `cat-blue`/`cat-violet` colour pair MAY be added (pending sign-off); brand-red NOT used as a carrier accent | — | — |

### 7.8.8 Acceptance checklist (Phase 7.8)

- [ ] **Read-only.** No cell editing anywhere — `<KmBoardScreen mode="view">`; cells inert; non-dismissible read-only banner (`myKm.readOnlyBanner`); monthly km-calendar modal read-only (§7.7.6 — read-only for all roles).
- [ ] **Same cell language.** `<KmCell>` renders the identical §7.7.1 three states (drove `bg-success/10`+check / idle `bg-input` / empty faint `—`). No relearning.
- [ ] **Carrier grouping (≥2 carriers).** Rows grouped under `bg-input` carrier section-headers (sorted by `carrier.name`), each with a 4px carrier-accent rail + name + «{n} pojazdów · Σ {sum} km»; every row carries a 2px `accentBorder` on the frozen identity cell; `przewoźnik` segment dropped from the row meta line.
- [ ] **Deterministic accent.** `carrierAccentIndex(carrier.id)` (avatarBg-style hash) → stable accent across renders/sessions; palette is the 6 §7.8.2 category hues (4 existing + the proposed `cat-blue`/`cat-violet`, or the zero-token fallback if vetoed); brand-red (`bg-brand`) NOT used as a carrier accent (reserved for the "today" column); accents disjoint from in-cell state colours; meaning never by colour alone (group name is source of truth).
- [ ] **Single-carrier collapse.** `distinctCarriers <= 1` (always for `przewoznik`) → no group headers, no row accent border, plain §7.7.7-identical grid.
- [ ] **All vehicles by default.** Full fleet shown including non-driving / blank-week vehicles; «Tylko jeżdżące» is OFF by default and surfaced as an opt-in toggle only (`inMotionDefault={false}`); filtered-empty state applies only when the user turns it on.
- [ ] **Week nav + monthly km-calendar.** §7.7.5 prev/next/current + week-picker, `?week=YYYY-Www` URL source of truth; §7.7.6 monthly km-calendar modal reused.
- [ ] **Header tiles.** §7.7.2 tiles kept; optional «PRZEWOŹNICY» count tile (`tone="neutral"`) on multi-carrier roles; no orange/red aggregate; responsive family unchanged.
- [ ] **Scope.** Server-scoped payload trusted (carrier→own, opiekun→supervised, planista→plannerId, dyspozytor→team); UI does not re-filter by owner.
- [ ] **i18n.** `myKm.*` keys present PL + EN; grid/cell/nav/history reuse `weryfikator.km.*` (not duplicated); ICU plural on `myKm.group.summary`.
- [ ] **Token policy + dark-mode.** No new radius/shadow/font tokens; the only colour addition is the §7.8.2 `cat-blue`/`cat-violet` pair (pending sign-off — else fallback); carrier accents are opacity rails legible in dark via the listed `dark:` steps; **no API contract change** beyond role-scoping the existing read endpoint.

---

## Phase 11 — `<TeamMembers>` (team composition) (NEW — AUTHORITATIVE 2026-06-17)

> **Status:** ✅ Locked. This formalises the **single reusable component** that renders a dispatch team's
> identity (code + name) and its member dispatchers, wherever a team is shown across the app. It replaces the
> ad-hoc "list the dispatchers inline" rendering that would otherwise drift between the vehicle form, the three
> vehicle detail modals, the delegation detail modal, the dispatcher panel and the admin Team CRUD.
>
> **Why one component.** `Vehicle.dispatchTeam` (and `Team.members`) surfaces in **six** contexts (§7.9.6 table).
> Each previously risked its own bespoke "kod + names" markup. `<TeamMembers>` is the **single source of truth**
> for: how the code chip looks, how the team name sits relative to the code, how member dispatchers render
> (avatar + name), and — critically — the three **states** (members / empty team / inactive team) that must look
> identical everywhere.
>
> **No new design tokens.** Everything composes the existing palette, radius, type and spacing scale
> (`bg-input`, `text-text`, `text-text-sub`, `bg-muted`/`text-muted-foreground` for the inactive badge,
> `border-warning/40 bg-warning/10 text-warning` for the empty-team box — the §3.5.x soft-warning recipe already
> used by the Reklamacja indicator and the §3.5 idle-vehicles list). No `tailwind.config.ts` / `globals.css` change.

### 7.9.1 Anatomy

```
┌─ <TeamMembers> (variant="chips", size="md") ─────────────────────────────┐
│                                                                          │
│   1.1.13   Zespół Wschód                       [ chips row ]             │
│   └ code   └ Team.name (text-text, omitted-no-gap if null)              │
│                                                                          │
│   ( JK )  Jan Kowalski    ( AN )  Anna Nowak    ( PW )  Piotr Wój…       │
│   └ InitialsAvatar (neutral)  └ dispatcher full name                     │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Identity line** — the team **code chip** (mono code-chip, always present unless `showCode={false}`) +
  the optional **team name**. Code chip: `inline-flex items-center rounded-md bg-input px-1.5 py-0.5 font-mono
  tabular-nums text-text` (`text-xs` at `sm`, `text-sm` at `md`). Example code `1.1.13` — **3 dot-segments**,
  `tabular-nums` keeps segments aligned across rows. Team name: `text-text` (co-equal weight with the code,
  **not** muted) at the same size as the code; when `team.name` is `null`/empty the name span is **not rendered
  at all** (no residual margin, no «—» placeholder — the chip simply sits alone).
- **Members** — each dispatcher is an `<InitialsAvatar>` + their **full name** (`firstName + ' ' + lastName`).
  `chips` variant lays members out as a `flex flex-wrap gap-2` row of pill-ish member tokens; `list` variant
  stacks them `flex flex-col gap-1.5` (one avatar+name per line).

### 7.9.2 `<InitialsAvatar>` — new primitive

A neutral, **non-coloured** initials circle. Deliberately **not** per-person tinted (decision: avatars are
wayfinding, not identity-colour; a team of dispatchers should read as a calm uniform set, not a rainbow).

| Prop | Type | Default | Notes |
|---|---|---|---|
| `name` | `string` | — | Source for initials; takes first letter of first two whitespace-separated tokens, uppercased (`"Jan Kowalski"` → `JK`; single-token `"Admin"` → `A`). Empty/whitespace → `?`. |
| `size` | `'sm' \| 'md'` | `'md'` | `sm` = `h-6 w-6 text-[10px]`; `md` = `h-8 w-8 text-xs`. |
| `className` | `string?` | — | Escape hatch only. |

Base classes: `inline-flex shrink-0 items-center justify-center rounded-full bg-input font-semibold
text-text-sub select-none`. **Neutral always** (`bg-input` fill, `text-text-sub` initials) in both light and
dark — `bg-input` and `text-text-sub` are theme-aware CSS-var tokens, so no `dark:` override is needed. The
circle is decorative; the **name text beside it is the accessible label**, so the avatar itself is
`aria-hidden` (no duplicate SR announcement of the initials).

> **Reuse note.** This is a generic primitive — it is **not** team-specific. It supersedes the inline
> `<User size={18}/>` placeholder avatar in the §6.4.1 driver strip *only if web-agent chooses to*; that is
> optional and out of scope here. The §6.4.1 driver avatar may stay a `<User>` glyph. `<InitialsAvatar>` is
> introduced **for `<TeamMembers>`** and offered app-wide.

### 7.9.3 States

| State | Trigger | Treatment |
|---|---|---|
| **Members** (normal) | `team` present, `active`, `members.length > 0` | Identity line + member row/list per variant (§7.9.1). |
| **Empty team** | `team` present, `members.length === 0` | **Amber soft-warning box** in place of the member row: `mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-bold text-warning` + `<AlertTriangle size={12} aria-hidden />` + «Brak dyspozytorów w zespole». Mirrors the §3.5 Reklamacja-indicator recipe. **The identity line (code + name) still renders** — the team exists, it just has no people. **This box stays at full contrast even when the wrapper is dimmed (inactive)** — it is the one element exempt from the `opacity-70` dim (apply the dim to the members/identity, not to the warning box; web-agent: render the warning box outside the dimmed subtree, or counter-dim it with `opacity-100`). |
| **Inactive team** | `team.active === false` | A **`muted` badge** «Nieaktywny» appended to the identity line (`<Badge variant="muted">` — `bg-muted text-muted-foreground`, the existing inactive treatment used by the entity tables) **and** `opacity-70` on the component wrapper (`dim` the whole composition so it visually recedes). The empty-team warning box (if also empty) is exempt from the dim (above). Inactive + empty can co-occur: muted «Nieaktywny» badge **and** the full-contrast amber box. |

> **State precedence.** The states compose, they don't exclude: `inactive` adds the badge + dim; `empty`
> swaps the member area for the amber box. A team can be **inactive AND empty** (badge + dim + full-contrast
> amber box). `members` is simply "neither empty nor (only) inactive".

### 7.9.4 Variants & sizes

| Axis | Value | Use |
|---|---|---|
| **variant** | `chips` (default) | Member tokens flow in a `flex flex-wrap gap-2` row; compact, good under a form dropdown or in a wide modal field. Each token: `inline-flex items-center gap-1.5 rounded-full bg-input/60 pl-1 pr-2.5 py-1` (avatar + name). |
| **variant** | `list` | Members stack `flex flex-col gap-1.5`, one `flex items-center gap-2` row each (avatar + name). For narrow columns / dense detail-modal fields / the admin Team CRUD member panel where vertical scanning is preferred. |
| **size** | `md` (default) | `InitialsAvatar size="md"` (`h-8 w-8`), code chip `text-sm`, name `text-sm`. Modals, panels, admin. |
| **size** | `sm` | `InitialsAvatar size="sm"` (`h-6 w-6`), code chip `text-xs`, name `text-xs`. Inline previews (vehicle-form preview under the dropdown), tight table cells. |

### 7.9.5 Props contract

```ts
interface TeamMembersProps {
  team: {
    code: string;                 // "1.1.13" — 3 dot-segments, mono code-chip
    name: string | null;          // Team.name — text-text, omitted-no-gap if null
    active: boolean;              // false → muted «Nieaktywny» badge + opacity-70 dim
    members: Array<{
      id: string;
      firstName: string;
      lastName: string;
    }>;
  };
  variant?: 'chips' | 'list';     // default 'chips'
  size?: 'sm' | 'md';             // default 'md'
  showCode?: boolean;             // default true — host may suppress a DUPLICATE code only
  className?: string;
}
```

- **`showCode`** lets a host that already prints the code in its own header (e.g. the admin Team-CRUD row title)
  suppress the chip to avoid a visual duplicate. **It must never be used to hide team identity entirely** — if
  `showCode={false}`, the component **still renders the team name** (and the name carries the identity). The
  component **never silently shows nothing**: with `showCode={false}` **and** `name == null`, fall back to
  rendering the code chip anyway (identity is non-negotiable; the dedup only applies when the name can stand in).
- **`members`** order is taken as-given (host sorts; component does not re-sort). Truncate long names with
  `truncate max-w-[14ch]` inside each token (chips variant) — never wrap a single name mid-token.

### 7.9.6 Per-context usage

| Context | Where | variant / size / showCode | Notes |
|---|---|---|---|
| **Vehicle form — team preview** | `apps/web/components/.../VehicleForm` under the "Zespół dyspozytorów" dropdown | `chips` / `sm` / `showCode=true` | Live preview of the team the user just picked in the `<Select>`; updates on selection. Empty-team amber box warns the admin the chosen team has no dispatchers **before** saving. |
| **Full VehicleDetailModal** (admin / opiekun / przewoźnik / planista) | §6.15 «Przypisanie / Ludzie» — «Zespół prowadzący» field (`fullWidth` row), alongside Przewoźnik / Opiekun / Planista | `chips` / `md` / `showCode=true` | Shows the vehicle's assigned `dispatchTeam`. Planista joined this modal 2026-06-26 (§6.4.2). Przewoźnik viewer hides the Przewoźnik row (carrier-self hide, §6.15). |
| **FleetVehicleDetailModal** (dyspozytor read-only) | §6.4.2 — «Zespół» field (`fullWidth` row) | `chips` / `md` / `showCode=true` | Read-only slim modal; same team data, no edit, no rates (dyspozytor only — §6.4.2). |
| **DelegationDetailModal** | §6.4.1 — «ZESPÓŁ PROWADZĄCY» block (see §7.9.7) | `list` / `md` / `showCode=true` | Shows the **current** `Vehicle.dispatchTeam` (live, **not** a delegation-time snapshot). |
| **Dyspozytor panel** | dispatcher panel header / "my team" surface | `chips` / `md` / `showCode=true` | The dispatcher sees their own team composition. |
| **Admin Team CRUD** | team list rows + team edit surface | `list` / `md` / `showCode=false` (list rows print the code in the row title) | `showCode=false` here is the canonical dedup case — the row already shows the code, so the chip is suppressed but the name + members still render. |

### 7.9.7 Cross-reference — DelegationDetailModal «ZESPÓŁ PROWADZĄCY» block

A **new body block** in the §6.4.1 delegation detail modal, rendered as a `span:'full'` section
(an additional `fullWidth` row, same §6.20 escape hatch as `<RouteCard>` / the km-calendar). It sits **below
the «STATUS I AUDYT» section** (and below the §7.7.9 km-calendar if present), so the reading order ends with
"who is steering this trip".

- **Section header** = «ZESPÓŁ PROWADZĄCY» (icon `<Users size={15}/>`). The label **deliberately mirrors the
  heading of the Google Chat trip-notification** so the modal and the gchat message read as the same artefact.
- **Body** = a single `<TeamMembers variant="list" size="md">` fed the **current** `Vehicle.dispatchTeam` of the
  delegation's assigned vehicle (resolved live by `vehicleId` — **not** a snapshot captured at delegation time;
  if the truck is reassigned to a new team, this block reflects the new team).
- **Planista row (2026-09-28, §17.8):** the planista shown in this block is the **delegation snapshot** (`delegation.planner`), not the live vehicle planner; the dispatch team stays live. When the two planners differ, one `text-xs text-text-sub` line «Ciągnik prowadzi obecnie: {name}».
- **No vehicle / no team:** if the delegation has no resolvable `vehicleId`, **omit the whole section**
  (per §6.4 "empty section omitted"). If the vehicle exists but has **no `dispatchTeam` assigned**, render the
  section with the `<TeamMembers>` empty-team amber box semantics — but since there is no team object at all,
  show the same amber box with copy «Brak zespołu prowadzącego» (`team.noTeam`, see §7.9.9). (Distinct from
  «Brak dyspozytorów w zespole», which means a team exists but is unstaffed.)

### 7.9.8 a11y

- **Avatars `aria-hidden`** — the adjacent full name is the accessible label; the initials circle adds nothing
  for SR users and would otherwise double-announce.
- **Member list is a real list** — `list` variant renders `<ul><li>` so SR users get "list, N items"; `chips`
  variant uses `role="list"` / `role="listitem"` on the flex row + tokens to preserve the same semantics.
- **Empty-team box** carries the warning meaning in **text** («Brak dyspozytorów w zespole»), not colour — the
  amber tint + `<AlertTriangle aria-hidden>` are reinforcement only (colour-blind safe).
- **Inactive** — the «Nieaktywny» badge is real text; the `opacity-70` dim is decorative and never the sole
  signal. Contrast: even at `opacity-70`, `text-text` over `bg-card` clears AA; the amber box is exempt from the
  dim so it always clears AA at full contrast.
- **Code chip** is real `font-mono` text (`1.1.13`), read verbatim by SR — no `aria-label` rewrite needed.

### 7.9.9 i18n — `team.*` (PL default + EN)

| Key | PL | EN |
|---|---|---|
| `team.emptyMembers` | Brak dyspozytorów w zespole | No dispatchers in this team |
| `team.noTeam` | Brak zespołu prowadzącego | No leading team assigned |
| `team.inactiveBadge` | Nieaktywny | Inactive |
| `team.leadingTeamHeader` | ZESPÓŁ PROWADZĄCY | LEADING TEAM |
| `team.codeAria` | Kod zespołu: {code} | Team code: {code} |
| `team.membersAria` | Dyspozytorzy zespołu {code} | Dispatchers of team {code} |

PL is the default bundle (`messages/pl.json`), EN mirrors every key (`messages/en.json`). No hard-coded strings;
PL+EN key parity holds (existing i18n-parity check covers this).

### 7.9.10 Catalogue additions (Phase 11)

| Component | Type | Notes |
|---|---|---|
| `<TeamMembers>` | New custom presentational | Single source of truth for team identity (code chip + name) + member dispatchers; 3 states (members / empty / inactive), 2 variants (`chips`/`list`), 2 sizes (`sm`/`md`); composes existing tokens only. `apps/web/components/teams/TeamMembers.tsx`. |
| `<InitialsAvatar>` | New primitive | Neutral (`bg-input`/`text-text-sub`) initials circle, `aria-hidden`, `sm`/`md`; generic, offered app-wide. `apps/web/components/ui/InitialsAvatar.tsx`. |

### 7.9.11 Components / cross-ref / acceptance (Phase 11)

| Change | Where | Owner |
|---|---|---|
| New `<TeamMembers>` (3 states, 2 variants, 2 sizes, `showCode` dedup, identity-never-hidden rule) | `components/teams/TeamMembers.tsx` | web-agent |
| New `<InitialsAvatar>` neutral primitive (`sm`/`md`, `aria-hidden`) | `components/ui/InitialsAvatar.tsx` | web-agent |
| Vehicle-form: render `<TeamMembers variant="chips" size="sm">` preview under the "Zespół dyspozytorów" dropdown | `VehicleForm` | web-agent |
| «Zespół prowadzący» field uses `<TeamMembers variant="chips" size="md">` in the full VehicleDetailModal (admin/opiekun/przewoźnik/planista, §6.15) + dyspozytor FleetVehicleDetailModal (§6.4.2) (`fullWidth` row) | `Fleet/admin vehicle modals` | web-agent |
| §6.4.1 delegation modal: new `span:'full'` «ZESPÓŁ PROWADZĄCY» block (`<Users>` header) rendering `<TeamMembers variant="list" size="md">` from **current** `Vehicle.dispatchTeam` | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| Dyspozytor panel + admin Team CRUD use `<TeamMembers>` (`showCode=false` in CRUD list rows) | dispatcher panel + Team CRUD pages | web-agent |
| i18n: `team.{emptyMembers,noTeam,inactiveBadge,leadingTeamHeader,codeAria,membersAria}` PL+EN | `messages/pl.json`, `en.json` | web-agent |
| **0** changes to `tailwind.config.ts` / `globals.css` / any shell (`EntityDetailModal` reused via `fullWidth` row) | — | — |

**Acceptance checklist (Phase 11):**

- [ ] **One component everywhere.** All six contexts (§7.9.6) render `<TeamMembers>` — no bespoke "kod + names" markup remains.
- [ ] **Neutral avatars.** `<InitialsAvatar>` is `bg-input`/`text-text-sub` in both themes; never per-person tinted; `aria-hidden`.
- [ ] **Name weight + null collapse.** `team.name` is `text-text` (co-equal with the code), and disappears with **no residual gap** when null.
- [ ] **Empty team.** Amber `border-warning/40 bg-warning/10 text-warning` box + `<AlertTriangle>` + bold «Brak dyspozytorów w zespole»; stays full-contrast even on a dimmed inactive card.
- [ ] **Inactive.** `muted` «Nieaktywny» badge + `opacity-70` dim on the wrapper; co-occurs with the (exempt) amber box when also empty.
- [ ] **Delegation modal block.** «ZESPÓŁ PROWADZĄCY» mirrors the gchat header, shows **current** `Vehicle.dispatchTeam` (not snapshot), omitted when no vehicle, «Brak zespołu prowadzącego» when vehicle has no team.
- [ ] **Code chip.** `font-mono tabular-nums` `1.1.13` (3 segments); `showCode` only dedups a duplicate and **never** hides identity (name stands in; if name null, chip renders anyway).
- [ ] **No new tokens.** Only existing palette/radius/type/spacing; no `tailwind.config.ts`/`globals.css` change.
- [ ] **a11y.** Member list real `<ul>`/`role=list`; avatars `aria-hidden`; warning carried by text not colour; `team.*` keys PL+EN parity.

---

## 7.10 Delegation operational statuses RETURN (eksport + weryfikator) + wniosek↔wyjazd link (REWORK 2026-06-20 #4 — AUTHORITATIVE)

> **Scope.** The delegation lifecycle is operational again. Two roles drive it: **`eksport`** (flips `zgloszony→gotowy` + rollback) and **`weryfikator`** (flips `gotowy→w_trasie` and `w_trasie→zjechal` recording the actual departure/return **datetime** — §0‴). The carrier picks a (`zjechal`) delegation when submitting a wniosek (`Claim.delegationId` FK), and a late `zjechal` auto-recalculates the linked wniosek. This section specifies the **four UI artefacts** uiux owns: (1) the **5-status** `<StatusBadge>` tone-map, (2) the **status-change confirm dialogs** (C/D now `datetime-local`), (3) the **carrier claims/new derived read-only fields** (§0‴ — the former `w_trasie` warning banner is removed), (4) the **auto-recalc badge** in the pracownik `ClaimModal`.
>
> **Spec source (source of truth):** [`20-phase-7-eksport-weryfikator.md` §0″ — REWORK 2026-06-20 #4](20-phase-7-eksport-weryfikator.md). The km-board (§7.7) stays; weryfikator gains a **second** screen (delegation statuses) alongside the km-board — two tabs.
>
> **HARD: no new tokens** (project no-new-token policy). Everything composes existing semantics (`info` / `warning` / `success` / `muted` / `danger`), the existing `-bg` surfaces + `dark:bg-*/10..15` opacity variants, the §7.5 confirm-dialog pattern, the §1195 carrier warning-banner recipe, and the §6.5.4 `<RecalcBadge>` precedent. **Zero** `tailwind.config.ts` / `globals.css` changes.
>
> ⚠️ **UPDATE (2026-07-08, §0‴ — точные времена).** Since this section was written the weryfikator dialogs became **datetime** and wniosek-submission tightened to `zjechal`-only. Net changes (annotated inline below):
> - **`<MarkInTransitDialog>`** now carries a `datetime-local` field → `POST /delegations/:id/in-transit` `{ actualDepartureAt }` (was a plain confirm). Auto-fill = the carrier-declared `departureAt`.
> - **`<MarkReturnedDialog>`** field is now `datetime-local` (date **+ time**) → `{ actualReturnAt }` (was date-only). Auto-fill = `plannedReturnAt` date + a default time. New guards: future (`RETURN_DATE_FUTURE`) and `actualReturnAt >= actualDepartureAt` (`RETURN_BEFORE_DEPARTURE`).
> - **Carrier form (§7.10.3):** the `w_trasie` **warning banner + soft-confirm gate are REMOVED** — submission is allowed **only from `zjechal`**. The carrier no longer inputs a time window; `timeFrom`/`timeTo` are **derived** from the delegation's actual times and shown read-only («Godziny (z wyjazdu)»). The submit body drops `timeFrom`/`timeTo`.

### 7.10.1 `<StatusBadge>` — the 5-status delegation tone-map (LOCKED)

`DelegationStatus` += **`gotowy`** ⇒ the lifecycle is now `zgloszony → gotowy → w_trasie → zjechal` (+ terminal `anulowany`). This is the canonical const-map; it supersedes the prior 4-row map and is mirrored at the `<StatusBadge>` definition (§"`<StatusBadge>` — extends existing `<Badge>`"). **Reuse the existing `<Badge>` variants only — no new variant.**

| `DelegationStatus` | Badge variant | Token surface (light → dark) | Label PL | Label EN | Optional icon (12px) | Tone rationale |
|---|---|---|---|---|---|---|
| `zgloszony` | **`info`** | `bg-info/15 text-info border-info/30` → `dark:bg-info/15` | «Zgłoszony» | "Reported" | `<FileText />` | Just-submitted, informational/neutral — nothing has happened operationally yet. Reuses the prior precedent verbatim. |
| `gotowy` *(NEW)* | **`warning`** | `bg-warning/15 text-warning border-warning/30` → `dark:bg-warning/15` | «Gotowy» | "Ready" | `<PackageCheck />` | **Load found, zlecenie made, awaiting departure** — a *transient holding* state needing the next operator (weryfikator) to act. Amber `warning` = "in-flight / attention", NOT an error. Sits one notch warmer than `zgloszony` (info) and cooler than the active `w_trasie` (success) — a correct middle rung. Distinct from the claim `NA_WERYFIKACJI`/`REKLAMACJA` warning usage by **context** (delegation board vs claim table); the shared amber means "a human still has to move this forward" in both. |
| `w_trasie` | **`success`** | `bg-success/15 text-success border-success/30` → `dark:bg-success/15` | «W trasie» | "On the road" | `<Truck />` | Vehicle is actively working — the positive operational signal. Reuses the long-standing precedent (§7.5.1) so the same word carries the same green everywhere. |
| `zjechal` | **`muted`** | `bg-muted text-muted-foreground border-border` (soft grey fill) | «Zjechał» | "Returned" | `<ParkingSquare />` | Done / parked — neutral-settled, *not* alarming and *not* celebratory (the money outcome lives on the claim, not here). Reuses precedent. |
| `anulowany` | **`danger`** | `bg-danger/15 text-danger border-danger/30` → `dark:bg-danger/15` | «Anulowany» | "Cancelled" | `<XCircle />` | Terminal, void. Reuses precedent. |

**Visual hierarchy (top-of-mind for the eksport/weryfikator boards):** the eye should land on what needs action.
`gotowy` (amber, "weryfikator: take me to the road") and `w_trasie` (green, "live") are the **acting** rows; `zgloszony` (info) is "eksport's queue"; `zjechal` (muted) and `anulowany` (danger-but-terminal) recede. The amber `gotowy` deliberately stands out on the eksport board (its rollback/advance target) and on the weryfikator board (its «Oznacz W trasie» queue).

**Anatomy / a11y (unchanged):** same badge shell as all `<StatusBadge>` (`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap`); status is carried by **text + colour**, never colour alone (label always rendered; icon optional). Const-map lives in `@magguarantee/shared` next to the claim-status map; `<StatusBadge status>` resolves enum → `{variant,label,icon}`.

### 7.10.2 Status-change confirm dialogs (eksport + weryfikator)

All dialogs reuse the **§7.1 confirm-`<Dialog>` pattern** (centered `<Dialog>`, `bg-card`, `DialogHeader`/`DialogDescription`/`DialogFooter`; ghost «Anuluj» = dialog-dismiss + one primary action; `await onConfirm()`, close on resolve, stay-open + toast on reject). **No new tokens.** The `{plate}` (and where useful `{sideNumber}`) is interpolated so the operator sees exactly which delegation. Each dialog's primary `<Button>` is the **brand-red default** (these *are* the page's primary affordance for these single-purpose roles — unlike the high-frequency km-cell stamps which stay `outline`). Touch ≥44px via the `<Button>` hit-area.

| # | Role | Trigger row status | Dialog title (PL) | Body / fields | Primary button (PL) | Endpoint |
|---|---|---|---|---|---|---|
| **A** | eksport \| admin | `zgloszony` | «Oznacz jako gotowy» | plain confirm, no input. Desc: «Wyjazd {plate} zostanie oznaczony jako *gotowy* (ładunek znaleziony, zlecenie wystawione).» | «Oznacz gotowy» | `POST /delegations/:id/ready` |
| **B** | eksport \| admin | `gotowy` | «Cofnij do: zgłoszony» | plain confirm, no input. Desc: «Wyjazd {plate} wróci do statusu *zgłoszony*. Możliwe tylko zanim ruszy w trasę.» | «Cofnij status» | `POST /delegations/:id/ready` (rollback; api toggles `gotowy→zgloszony`) |
| **C** | weryfikator \| admin | `gotowy` | «Oznacz jako w trasie» | **one datetime field (§0‴)** — `<FormField label="Data i godzina wyjazdu" required>` wrapping `<Input type="datetime-local" className="h-10" autoFocus>` bound to `actualDepartureAt`, **pre-filled with the carrier-declared `departureAt`** (date + time). Desc: «Podaj faktyczny moment wyjazdu dla wyjazdu {plate}.» | «Oznacz w trasie» | `POST /delegations/:id/in-transit` `{ actualDepartureAt }` |
| **D** | weryfikator \| admin | `w_trasie` | «Oznacz jako zjechał» | **one datetime field (§0‴)** — `<FormField label="Data i godzina zjazdu" required>` wrapping `<Input type="datetime-local" className="h-10" autoFocus>` bound to `actualReturnAt`, **pre-filled with `plannedReturnAt` (date) + a default time**. Desc: «Podaj faktyczny moment zjazdu dla wyjazdu {plate}.» | «Oznacz zjechał» | `POST /delegations/:id/returned` `{ actualReturnAt }` |

**Dialog A/B — plain confirm (no input).** Direct `<Dialog>` use; footer = ghost «Anuluj» (dismiss; this is NOT the business-cancel action — delegation-cancel stays carrier/admin-only and is not on these boards) + brand-red primary. Success → close, table refetch, toast («Oznaczono jako gotowy» / «Cofnięto do: zgłoszony»). **C и D теперь несут datetime-input** (§0‴, см. ниже) — не plain confirm.

**Dialog B is a guarded rollback.** The «Cofnij do: zgłoszony» action is offered **only** on `gotowy` rows and **only** while the delegation is not yet `w_trasie` (the api enforces this; the UI simply doesn't render the action once the row advances). On the eksport board this is the row's secondary affordance (a `<Button size="sm" variant="ghost">` sitting after the primary «Oznacz gotowy» disappears, i.e. a `gotowy` row shows the rollback as its single action). Do not render a rollback on `w_trasie`/`zjechal`/`anulowany`.

**Dialogs C & D — confirm + datetime input (§0‴; the §7.1(b) `ConfirmWithDateDialog` shape, now datetime).** RHF + Zod, `mode:'onChange'`, submit disabled until valid, dialog stays open on error so the value isn't re-typed. Both use `<Input type="datetime-local">` — the weryfikator records the **exact moment** (date + time), NOT just a date. C binds `actualDepartureAt`, D binds `actualReturnAt`:
- **C `actualDepartureAt`** is pre-filled with the carrier-declared `departureAt` (date + time). Guards (api re-validates): `>= start-of-day(departureAt)` and `<= now` — future rejected (`DEPARTURE_DATE_FUTURE`, now datetime-granular).
- **D `actualReturnAt`** is pre-filled with `plannedReturnAt` (date) + a default time; the verifier adjusts if the truck came back at a different moment. If `plannedReturnAt` is somehow absent, default to today. Guards: reject a **future** datetime (`RETURN_DATE_FUTURE`, «Data zjazdu nie może być w przyszłości») and enforce `actualReturnAt >= actualDepartureAt` (`RETURN_BEFORE_DEPARTURE`).
- Required (empty → inline «Podaj datę i godzinę»). `Claim.timeFrom`/`timeTo` are later **derived** from these actual times (the carrier no longer enters a time window).
- Success → close, refetch, toast («Oznaczono jako w trasie» / «Oznaczono jako zjechał»). **Side-effects are invisible to the D dialog** (`vehicle.lastDroveAt` bump + linked-wniosek auto-recalc happen server-side); if the linked claim was recalculated the operator is not interrupted — the signal surfaces later on the pracownik `ClaimModal` (§7.10.4), per the "audit + UI flag, no email" decision.

**Board placement (both roles).** Each delegation table gets a trailing `actions` cell. **At most one primary action per row** (strict state machine): `zgloszony`→A (eksport) ; `gotowy`→C (weryfikator) **or** B-rollback (eksport) depending on whose board ; `w_trasie`→D (weryfikator) ; `zjechal`/`anulowany`→ `—`. The weryfikator's two screens (km-board + delegation statuses) are **two `<Tabs>`** inside `RoleShell` — reintroduce the Phase 6.3 in-page `<Tabs>` bar now that the role has a second destination (this overrides the §7.5 "single screen, no tabs" note for weryfikator). Eksport stays a single screen (no tabs).

### 7.10.3 Carrier `/carrier/claims/new` — read-only derived fields (delegation picker)

> ⛔ **SUPERSEDED in part — РАЗВОРОТ 2026-07-30 (docs/20 §0⁗).** The carrier
> DECLARES the facts again: **period, time window and mileage are editable
> inputs**, no longer read-only derived fields. What survives from this section:
> the delegation picker itself, the `zjechal`-only feed, the guarantee block
> screen, and the read-only **vehicle / trailer / driver** trio (those really are
> derived). The read-only period card, the «Godziny (z wyjazdu)» block and the
> read-only mileage row are **gone**.
>
> **New form shape** — three sections on the left column:
> 1. **Wyjazd** — the picker (unchanged) + selected-status chip.
> 2. **Okres** — `dateStart` / `dateEnd` (`type="date"`) + `timeFrom` / `timeTo`
>    (`type="time"`), 2-col `<FormGrid>`, all required. `dateStart` carries
>    `min={delegation.departureAt.slice(0,10)}` and a description line («Nie
>    wcześniej niż zgłoszona data wyjazdu ({date})») mirroring the api's 422
>    `CLAIM_DATE_BEFORE_DEPARTURE`. `dateEnd` gets `min={dateStart}`; both carry
>    `max={today}`.
> 3. **Wartości** — `mileage` (`type="number"`, `min=1`), required.
>
> **Deliberately absent (customer decision):** no prefill from the outing and
> **no** "differs from the km board" hint. The carrier is paid on SpedTrans
> mileage; nudging it toward the weryfikator's number would be nudging it toward
> a figure the business does not pay on. The client mirrors the tier-1 date rules
> (order / future / span) but **not** the deadline rule — that one is measured
> server-side from `actualReturnAt`, which this form has no business showing.
>
> ⚠️ **2026-09-24 (docs/20 §0⁵):** the rationale above is obsolete — the weryfikator now reads daily km from SpedTrans as well, so the two figures agree. The form rule itself (no prefill, no board hint) stays until decided otherwise.

> ⚠️ **§0‴ (2026-07-08):** the former `w_trasie` **warning banner + soft-confirm gate are REMOVED** — a wniosek can be submitted **only** for a `zjechal` delegation. The carrier no longer inputs a time window; `timeFrom`/`timeTo` are derived from the delegation's actual times and shown read-only («Godziny (z wyjazdu)»).

When the carrier submits a wniosek by **picking their delegation** (selector replaces the old manual period entry), only `zjechal` outings without a claim are offered (`GET /delegations?claimable=true`); `gotowy`/`w_trasie`/`zgloszony` are not selectable.

**Everything derives from the wyjazd (Phase 7 §0‴, AUTHORITATIVE).** The carrier's ONLY inputs on this form are: the **wyjazd**, an optional **comment**, and optional **attachments**. Everything else — **period, time window, vehicle, trailer, driver, mileage** — is shown **pre-filled and READ-ONLY**, derived from the selected wyjazd. They mirror the derived-period card's visual treatment (`rounded-md border border-border bg-input/40 px-3 py-2`, uppercase micro-label, value `text-sm text-text`), via a shared `ReadOnlyField` helper:

| Read-only field | Data source | Empty/placeholder state |
|---|---|---|
| Godziny (z wyjazdu) | **preview response** `timeFrom`/`timeTo` (`HH:mm`, derived from the delegation's `actualDepartureAt`/`actualReturnAt`) | muted «— z wyjazdu» until the preview returns |
| Vehicle plate | `selectedDelegation.vehicle.plateNumber` | before a wyjazd is picked, the whole vehicle/trailer/driver block shows one muted placeholder card («Najpierw wybierz wyjazd — pojazd, naczepa i kierowca zostaną pobrane z wyjazdu») |
| Trailer plate | `selectedDelegation.trailer.plateNumber` | (same block placeholder) |
| Driver name | `selectedDelegation.driver` (`firstName lastName`), falling back to `selectedDelegation.driverNameSnapshot` | (same block placeholder) |
| Mileage (km) | **preview response** `mileage` — the server-authoritative `Σ VehicleDailyKm (state=drove)` over the derived period; updates on the same trigger as the derived period | muted `«— obliczany z wyjazdu»` until the preview returns |

The submit body is the backend's `.strict()` shape — **only** `delegationId`, `comment?`, `attachmentIds?`. `timeFrom`/`timeTo` are **no longer sent** (derived server-side from the delegation's actual times); vehicle/trailer/driver/mileage are never sent either — the api derives them from `delegationId`; sending any of them is a 400. The required-fields submit gate is just `delegationId`. The mileage and the time window are **never carrier-editable** — there is no override input.

> ⚠️ **REMOVED (§0‴, 2026-07-08): `w_trasie` warning banner + soft-confirm gate + "tymczasowy okres" hint.** Since submission is now allowed **only from `zjechal`**, the whole soft-warning apparatus is gone:
> - The `bg-warning-bg` banner («Wyjazd jeszcze nie ma statusu „Zjechał" …») and its `carrier.claims.wyjazdPicker.warning*` copy — deleted (a `w_trasie` outing is never selectable, so there is nothing to warn about).
> - The soft-confirm `<Checkbox>` / confirm-`<Dialog>` ack gate — deleted; a `zjechal` submission is straight-through.
> - The muted «Okres tymczasowy z planowanego powrotu…» period note — obsolete: the period always derives from the actual (`actualReturnAt`) times, never from `plannedReturnAt`, so it never shifts post-submit.

### 7.10.4 Auto-recalc badge in the pracownik `ClaimModal` (§6.5)

When a late `zjechal` carries an `actualReturnAt` ≠ the period the wniosek was filed on, the backend either **applies** an auto-recalc (claim not yet decided AND period not human-edited) or **skips** it (decided OR `periodAdjustedByVerifier`). The §6.5 verification surface must show **which** happened. This is a **status indicator** (like §6.5.4's `<RecalcBadge>` for the live debounce), but it reports a *server-side historical* event — a sibling badge, not the live one.

Place it in the **linked-delegation context row** at the top of §6.5.3 (the fact-pairs block) — i.e. next to where the modal shows the linked wyjazd (plan vs. fakt). It reuses the §789 `<StatusBadge>` anatomy (`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium`). **Two states, existing tones only:**

| State | Condition (DTO) | Badge variant | Token | Label PL | Icon | Behaviour |
|---|---|---|---|---|---|---|
| **Applied** | `claim.autoRecalcApplied === true` (period was auto-updated to `actualReturnAt`) | **`success`** | `bg-success/15 text-success border-success/30` | «Przeliczono wg faktycznej daty zjazdu» (EN "Recalculated to actual return date") | `<RefreshCw size={12} />` | Informational/positive — the system did the right thing automatically. Optional tooltip: «Okres zaktualizowany z {origDateEnd} na {actualReturnAt}». |
| **Skipped / needs attention** | `claim.autoRecalcSkipped === true` (decided OR human-edited period; `actualReturnAt` differs) | **`warning`** | `bg-warning/15 text-warning border-warning/30` | «Wymaga uwagi: faktyczna data zjazdu różni się od okresu wniosku» (EN "Needs attention: actual return date differs from the claim period") | `<AlertTriangle size={12} />` | Amber attention (NOT `danger` — nothing is broken; a human must just decide whether to re-open / adjust). Optional tooltip: «Wyjazd zjechał {actualReturnAt}, okres wniosku: {dateEnd}. Pominięto auto-przeliczenie ({skipReason}).» |

Rationale for tones: this mirrors the established **`success` = applied/positive**, **`warning` = transient human-attention** vocabulary used by the §7.6 SLA scale and the §7.10.1 `gotowy` status — consistent across the app. The skip state must read as "look at this", **never** as an error/`danger` (the claim is valid; only its period may want a human second look). Both badges render **only** when a linked delegation exists AND `actualReturnAt` is set; otherwise the row carries just the plan/fakt delegation info with no badge. The two states are mutually exclusive. The badge is **static** (a record of what happened), distinct from §6.5.4's live `Przeliczam…/Aktualne` recalc badge — do not conflate; both may be visible (live badge by the dopłata value, this historical badge by the delegation context row).

### 7.10.5 Components / shared / nav summary (Phase 7.10)

| Change | Where | Owner |
|---|---|---|
| `<StatusBadge>` `DelegationStatus` const-map += `gotowy` (`warning`); 5-status map per §7.10.1 | `@magguarantee/shared` (status const-map) + `components/carrier/StatusBadge.tsx` | web-agent |
| New `<MarkReadyDialog>` (plain confirm, advance + rollback variants) | `apps/web/components/delegations/` | web-agent |
| New `<MarkInTransitDialog>` (confirm + `datetime-local` `actualDepartureAt`, pre-filled `departureAt`) | `apps/web/components/delegations/` | web-agent |
| New `<MarkReturnedDialog>` (confirm + `datetime-local` `actualReturnAt`, pre-filled `plannedReturnAt` + default time) | `apps/web/components/delegations/` | web-agent |
| Eksport delegations board (`actions` col: A advance + B rollback) | `app/(eksport)/eksport/delegations/page.tsx`; default board filter `{zgloszony, gotowy, w_trasie}` + history toggle | web-agent |
| Weryfikator gains **2nd screen** (delegation statuses) → reintroduce Phase 6.3 in-page `<Tabs>` (km-board ‖ wyjazdy); wyjazdy board `actions`: C + D | `app/(weryfikator)/…` | web-agent |
| Carrier delegation-picker: read-only derived «Godziny (z wyjazdu)» + period/vehicle/trailer/driver/mileage (§0‴ — `w_trasie` warning banner + soft-confirm gate + "tymczasowy okres" hint REMOVED; submit only from `zjechal`) | `app/(carrier)/carrier/claims/new/…` | web-agent |
| Auto-recalc historical badge (applied `success` / skipped `warning`) in §6.5 linked-delegation row | `components/.../ClaimVerificationModal` (the §6.5 surface) | web-agent |
| i18n: `eksport.delegations.*`, `weryfikator.delegations.*`, `carrier.claims.wyjazdPicker.*` (incl. `warning*`), `claim.autoRecalc.{applied,skipped}` | `messages/pl.json` / `en.json` | web-agent |
| **0** changes to `tailwind.config.ts` / `globals.css`; **0** new colour/badge variants | — | — |

### 7.10.6 Acceptance checklist (Phase 7.10)

- [ ] **5-status tone-map.** `zgloszony`→`info`, **`gotowy`→`warning`**, `w_trasie`→`success`, `zjechal`→`muted`, `anulowany`→`danger`; label always present (a11y, not colour-alone); const-map in shared; no new variant.
- [ ] **eksport dialogs.** `zgloszony`→«Oznacz gotowy» (plain confirm → `/ready`); `gotowy`→«Cofnij do: zgłoszony» (rollback, only pre-`w_trasie`); brand-red primary; ghost «Anuluj» = dismiss only.
- [ ] **weryfikator dialogs (§0‴).** `gotowy`→«Oznacz w trasie» (confirm + **`datetime-local`** `actualDepartureAt`, **pre-filled `departureAt`**, future guard `DEPARTURE_DATE_FUTURE` → `/in-transit`); `w_trasie`→«Oznacz zjechał» (confirm + **`datetime-local`** `actualReturnAt`, **pre-filled `plannedReturnAt` + default time**, guards `RETURN_DATE_FUTURE` / `RETURN_BEFORE_DEPARTURE`, dialog stays open on error → `/returned`).
- [ ] **weryfikator two tabs.** km-board (§7.7) ‖ delegation statuses, Phase 6.3 in-page `<Tabs>`; eksport stays single screen.
- [ ] **Carrier form derived read-only (§0‴).** Only `zjechal` outings selectable; «Godziny (z wyjazdu)» + period/vehicle/trailer/driver/mileage render read-only from the preview; submit body = `{ delegationId, comment?, attachmentIds? }`. **No** `w_trasie` warning banner, **no** soft-confirm gate, **no** "tymczasowy okres" hint (all removed).
- [ ] **Auto-recalc badge.** §6.5 linked-delegation row shows `success` «Przeliczono wg faktycznej daty zjazdu» (applied) or `warning` «Wymaga uwagi…» (skipped); mutually exclusive; static (distinct from §6.5.4 live recalc badge); never `danger`.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts`/`globals.css` changes; all surfaces legible in dark via `dark:bg-*/10..15` / `dark:text-*` variants; confirm dialogs `bg-card`, date input `bg-input`, brand-red primaries.

---

## Phase 8 — Polish & Accessibility (loading / empty / toast / keyboard / a11y / dark-mode)

> **Status:** 🚧 In progress (start 2026-06-16). This is **not** a from-scratch design. Every primitive
> already exists (`<Skeleton>`, `<EmptyState>`, sonner `<Toast>`, focus-trapped `Dialog`/`Sheet`).
> Phase 8 is a **consistency pass**: define WHERE and HOW each primitive is applied across the *already-built*
> screens, so web-agent can walk screen-by-screen and tick boxes. **No new design tokens** — surface-token
> policy is LOCKED since Phase 4.4 (`bg-input` is the single soft-chrome surface; `bg-bg-soft` deprecated).
>
> ⚠️ **DEFER (per roadmap Phase 8 note).** The `eksport`-specific rows in every matrix below
> (`/eksport`, `/eksport/delegations`, `/eksport/km`) **are** polished now — but the eksport flow may change
> when the export-panel scope is finalised (Phase 7 unresolved). Treat eksport rows as **provisional**:
> ticked boxes stand, but re-run the §8.5 / §8.6 pass on those three screens after the export panel is locked.
> No other screen is deferred.

### 8.0 Screen archetypes — the 4 shapes everything reduces to

Every built screen maps to exactly one **archetype**. The polish recipe is defined **once per archetype**
(§8.1–§8.2 skeletons + empty states), then the matrix in §8.7 just names the archetype per screen.

| Archetype | Shape | Screens (route → archetype) |
|---|---|---|
| **A — Data-table page** | filter row + `<DataTable>` (one or `<Tabs>`-of-tables) | `/carrier/claims`, `/employee/claims`, `/employee/carriers`, `/employee/vehicles`, `/employee/drivers`, `/employee/trailers`, `/employee/trailer-types`, `/employee/users`, `/employee/limits`, `/employee/audit`, `/employee/delegations`, `/eksport/delegations`, `/carrier/fleet` (unified, KPI strip + in-page `<Tabs>`-of-tables — see Phase 3 carrier fleet panel), `/carrier/delegations`, `/planista`, `/dyspozytor`, `/eksport` |
| **B — Dashboard (KPI + panels/charts)** | `<KpiCard>` row + side/section panels, some Recharts | `/carrier` (carrier dashboard), `/employee/dashboard`, `/employee` (entry), `/dyspozytor` KPI strip, `/employee/diagnostics` |
| **C — Detail modal / sheet / drill page** | `Dialog`/`Sheet`/grouped-`<dl>` detail surface | `ClaimModal` (claim verify/detail), `EntityDetailModal` (vehicle/driver/trailer/carrier), `/carrier/claims/[nrZgl]`, `/employee/opieka/carriers/[login]`, delegation detail modal, `VehicleMonthKmModal` |
| **D — Form page / wizard** | RHF + Zod form (single or multi-step) | `/carrier/claims/new`, `/carrier/delegations/new`, carrier-onboarding wizard, all edit `<Sheet>` forms |
| **E — Km-board / grid** | `<KmWeekGrid>` weekly grid (already fully specced §7.7.8) | `/*/km`, `/*/moje-pojazdy` — **already covered by §7.7.8**, listed here only so the matrix is complete; do **not** re-spec, reuse §7.7.8 states verbatim |

`/employee/opieka` (the opiekun carrier card-grid) is its **own** archetype, already fully specced in
§5.2.7 / §5.2.8 — reuse those, do not re-derive.

### 8.1 Loading skeletons — per-archetype recipe

**Rule (roadmap):** bare `Loading...` / `<p>Ładowanie…</p>` is **banned** everywhere. Every async surface
renders a `<Skeleton>` composition that **reserves the same geometry** as the loaded content (no layout jump).
Reuse the existing `apps/web/components/ui/Skeleton.tsx` — **no new primitive**.

| Archetype | Skeleton recipe |
|---|---|
| **A — Data-table** | Filter row stays **live** (inputs are not data-dependent — render real `<Input>`/`<Select>`, disabled while `isLoading`). Table body = **8 skeleton rows**, each a `<tr>` of `<Skeleton className="h-4 w-[60–80%]">` cells matching the real column count + widths; keep the **real `<thead>`** (column set is static). This is the `<DataTable isLoading>` slot — centralise it in `DataTable` so every table page inherits it. `<Tabs>`-of-tables: skeleton only the **active** tab's body. |
| **B — Dashboard** | `<KpiCard>` row: render the real cards, skeleton **only the numeric value** (`<Skeleton className="h-6 w-12">`) + delta line — keep titles/icons live (static). Panels/lists: 3–5 skeleton rows. **Charts (Recharts):** a single `<Skeleton className="h-[var(--chart-h)] w-full rounded-md">` block sized to the chart container — **do not** fake axes/bars. Header counters skeleton their values only (same as §7.7.8 km tiles). |
| **C — Detail modal/sheet** | When the modal opens before its data resolves: header title `<Skeleton className="h-5 w-40">`; each `<dl>` section = 4–6 rows of `label<Skeleton h-3 w-20> / value<Skeleton h-4 w-32>`. Footer (Zamknij) stays live. If the detail is **fetched on row-click and cached**, prefer opening with the row data already in hand (no skeleton) — skeleton only the fields not present on the list row. |
| **D — Form** | Forms are **input-first**, not data-first — the empty form renders immediately. Skeleton applies **only** to (a) edit-forms hydrating an existing record → skeleton the field **values** as `<Skeleton className="h-9 w-full">` over the input slots until defaults load; (b) the live-preview panel (`<LivePreviewPanel>`/`<BreakdownTable>`) → already specced, keep its existing skeleton. The static field **labels** never skeleton. |
| **E — Km-board** | Use §7.7.8 verbatim (header tiles skeleton values + 6–8 skeleton grid rows, keep day-column headers). |

**Skeleton shimmer in dark mode:** `<Skeleton>` already uses `bg-input/80 dark:bg-input` + `animate-pulse`.
Verify the pulse is visible against `--card-bg` (`#1f1f1f`) on every dark surface — it is the **one** dark-mode
skeleton check in the §8.6 matrix. No new token; if a skeleton sits on `bg-input` itself (e.g. a chip), bump
that instance to `bg-border/60` locally (utility, not token).

### 8.2 Empty states — per-archetype copy + actionability

**Rule:** every list/table/grid that can legitimately return zero rows renders `<EmptyState>` (existing
component) **instead of** an empty table body — never a blank card. An empty state is **actionable** when the
user can do something about it from here (then pass `action`); **informational** when they cannot (no `action`).

| Archetype | Empty-state shape |
|---|---|
| **A — Data-table** | Two distinct empties, **do not conflate**: (1) **No data yet** (the dataset is genuinely empty) → `<EmptyState>` with icon + title + message, **+ `action`** when the role can create here (e.g. carrier `/carrier/claims` → «Złóż pierwszy wniosek» button to `/carrier/claims/new`; admin `/employee/users` → «Dodaj użytkownika»). Read-only roles (planista/dyspozytor/eksport/weryfikator, all opiekun read tables) get **no** `action` — informational only. (2) **No results for current filter** → distinct copy («Brak wyników dla wybranych filtrów» / "No results match your filters.") + a **«Wyczyść filtry»** ghost action that resets the filter row — **never** a create button (creating wouldn't help). `DataTable` exposes both via its empty slot; the page passes which one based on `hasActiveFilters`. |
| **B — Dashboard** | Dashboards rarely fully-empty; per-panel: a chart/list panel with no data shows a **compact in-panel** `<EmptyState className="py-8">` (smaller padding than table empties), informational only («Brak danych w tym okresie»). KPI cards never empty — show `0` / `—`, not an empty state. |
| **C — Detail / drill** | A drill page (`/employee/opieka/carriers/[login]`, `/carrier/claims/[nrZgl]`) whose **sub-list** is empty (e.g. carrier has no vehicles) shows an in-section `<EmptyState>`; the page itself is never empty (the parent entity exists). A detail modal for a missing/deleted record → close + `toast.error` (§8.3), not an in-modal empty state. |
| **D — Form** | No empty state (a form is never "empty data"). The closest case — a `<MultiSelect>`/dependent dropdown with zero options — shows the existing inline `<CommandEmpty>` row, not `<EmptyState>`. |
| **E — Km-board** | §7.7.8 already defines all four km empties (no-vehicles / empty-team / fresh-week-is-NOT-empty / filtered-empty). Reuse verbatim. |

**i18n convention (next-intl).** Every empty-state string lives under a per-screen namespace, key suffixes
**`empty.title` / `empty.message` / `empty.action`** for the no-data case and **`emptyFiltered.title` /
`emptyFiltered.message` / `emptyFiltered.action`** for the filtered case. Namespaces follow the existing scheme:
`claims.empty.*`, `carriers.empty.*`, `users.empty.*`, `audit.empty.*`, `delegations.empty.*`, etc. PL is the
default bundle (`messages/pl.json`), EN mirrors every key (`messages/en.json`). **Acceptance:** no empty-state
copy is hard-coded; PL+EN key parity holds (the existing i18n-parity check covers this).

### 8.3 Toast conventions (sonner)

The decision of **inline vs toast** is the crux — toasts disappear, so they are only for **transient confirmation
of a completed action the user already initiated**, never for state the user must keep reading.

| Use a toast for | Treatment |
|---|---|
| **Mutation success** (create / update / delete / status-stamp succeeded and the surface closed or stayed) | `toast.success(t('…toast.saved'))`. Standard messages: create → «Dodano», update → «Zapisano zmiany», delete → «Usunięto», status-stamp → the action-specific string already defined (e.g. «Oznaczono: W trasie»). Keep them **short** (1 line). |
| **Mutation failure** that is **not** field-level (network, 500, 403, optimistic rollback) | `toast.error(t('…toast.saveFailed'))` (+ rollback if optimistic). For optimistic km/limits cells this is the **only** failure signal — keep it. |
| **Fire-and-forget side effects** with no visible result | clipboard copy **failure** (`toast.error`), background refetch failure. Clipboard **success** stays **inline** (checkmark swap) per §3.4 — do **not** double-toast. |

**Do NOT toast (use inline instead):**

- **Form / field validation** — Zod errors render inline via `<FormMessage>` under the field. Never raise a
  validation toast (the "looks-wrong" soft-warnings in §6.1.7 are explicitly **never** toasts).
- **Loading** — use skeletons (§8.1), not an info toast.
- **Per-file upload errors** — inline on the offending file row (§5 FileUpload), they must persist.
- **Anything the user must act on or re-read** — that belongs in a banner/inline region, not a 4s toast.

**Variants & duration.** `success` (default tone) and `error` (`<Toast variant="destructive">`) only; **avoid
`info`** unless it's a genuine neutral notice with no success/fail polarity (rare — e.g. «Brak nowych danych» on
manual refresh). No custom durations; sonner defaults. One toast per action — collapse N-row bulk results into
one summary toast, never N toasts.

### 8.4 Keyboard-shortcut contract

Built on the existing `Dialog`/`Sheet` primitives (which already provide **Esc-to-close**, focus-trap,
scroll-lock — see §2.x catalogue & §6.2). This section makes the contract **explicit and verifiable** so
web-agent can tick it per modal/form.

**Esc — closes the top-most overlay.** Always. `Dialog`/`Sheet`/`Popover`/`<MultiSelect>` popover all close on
Esc and **return focus to the trigger** (Radix default — do not override). Nested overlay: Esc closes only the
inner one (a confirm-dialog over a sheet → Esc dismisses the confirm, sheet stays). **Exception — dirty-form
guard:** an edit `Sheet`/`Dialog` with unsaved changes intercepts Esc/outside-click with the existing
unsaved-changes confirm (do not silently discard); Esc on the **confirm** itself cancels the close.

**Enter — submits the form** when focus is in a single-line input inside a form with a single primary submit.
Maps to native `<form onSubmit>` (RHF). **Exceptions where Enter must NOT submit:**

- **`<textarea>`** — Enter inserts a newline (claim description, rejection reason, audit note). Submit only via
  the button or ⌘/Ctrl+Enter (optional nicety, not required).
- **Multi-step wizard** (`<WizardStepper>`) — Enter advances to **next step**, does not final-submit until the
  last step's primary button.
- **Inputs with an open suggestion popover** (`<MultiSelect>`, combobox, `<Command>`) — Enter selects the active
  option, does not submit the parent form (Radix/cmdk default — verify it doesn't bubble to submit).
- **Inline-edit cells** (limits, km) — Enter commits the cell (blur-save), does not submit a page-level form.

**Other keys (inherited, verify don't break):** `<Tabs>` arrow-key navigation between triggers; `<CodeBox>`
2FA auto-advance + Backspace-to-prev; `<Command>` arrow+type-ahead. No new global hotkeys introduced in Phase 8.

### 8.5 Accessibility checklist (per-screen pass/fail)

Frame as a checklist web-agent runs **per screen**. Acceptance bar (roadmap): **< 5, ideally 0, axe violations
on key screens.** **Key screens** (the must-pass set, run axe DevTools on each in light **and** dark):

1. `/login` + `/login/verify` (public entry — highest exposure)
2. `/employee/dashboard` (densest employee surface — KPIs + charts + panels)
3. `/employee/claims` + `ClaimModal` open (core workflow + the most complex modal)
4. `/employee/carriers` (representative admin DataTable + `EntityDetailModal`)
5. `/carrier` + `/carrier/claims/new` (carrier dashboard + the primary carrier form)
6. `/weryfikator/km` (the editable km-grid — densest interactive grid)
7. `/employee/audit` (new Phase 8 screen — must be born accessible)

Per-screen a11y checklist (tick every row):

- [ ] **Focus-trap** — every `Dialog`/`Sheet` traps Tab within the overlay, Esc closes, focus returns to trigger (inherited; verify not broken by custom content). First focus lands on the first interactive element or the heading, **not** the close ✕.
- [ ] **Icon-only buttons have `aria-label`** — every icon-only control (refresh, copy, theme-toggle, row-action, ✕, reveal/hide, remove-chip, kebab) carries a descriptive `aria-label`; the icon is `aria-hidden`. (The existing patterns in §3.2 / §5 are the template.)
- [ ] **Label↔input association** — every form input has a programmatic label (`<Label htmlFor>` / `<FormLabel>` via shadcn `<Form>`); no placeholder-as-label. Error `<FormMessage>` is `aria-describedby`-linked (shadcn default).
- [ ] **Table semantics** — `<table>`/`<thead>`/`<th scope="col">`/`<tbody>`; clickable rows expose `rowAriaLabel` (the §6.4.3 `rowAriaLabel` prop) and are keyboard-activatable (Enter/Space); sort headers are `<button>` with `aria-sort`.
- [ ] **Read-only detail uses `<dl>`** — label/value pairs are `<dl><dt><dd>` (§6.5 semantics), not div-soup.
- [ ] **Contrast (WCAG AA)** — body text ≥ 4.5:1, large/UI text + borders ≥ 3:1, in **both** themes. Known watch-points: `text-text-sub` on `bg-input`, status/role badge text on tinted bg, brand-red on dark.
- [ ] **Visible focus ring** — `focus-visible:ring-[3px] focus-visible:ring-brand/40` on all interactive elements; never `outline:none` without a replacement.
- [ ] **Status not by colour alone** — every status/severity carries text or an icon, never hue only (§5.2.9 principle).
- [ ] **Touch targets** — primary/action controls ≥ 44×44 (icon buttons on mobile use the `h-9 w-9`+ size; below `lg` icon-only fleet buttons are 36×36 per §3.4 — acceptable for secondary, but primary CTAs stay ≥ 44).
- [ ] **Landmarks & headings** — one `<h1>` per page; section headings descend in order; nav/main/header landmarks present (the shell provides them — verify pages don't skip levels).
- [ ] **axe DevTools** — run on the screen in light + dark; **0 critical/serious**, total < 5. Record count.

### 8.6 Dark-mode verification matrix

Run per screen, in dark theme, against `--card-bg #1f1f1f` / `--body-bg #121212`. Tick each column. The
**known risk areas** (call them out explicitly, they are where dark mode breaks): **Recharts colours**,
**status badges**, **role badges**, **skeleton shimmer**, **tinted-surface text contrast**.

| Check (column) | What to verify |
|---|---|
| **Text contrast** | All text (esp. `text-text-sub`) ≥ AA on the dark surface it sits on. No `#000`-on-dark leftovers. |
| **Borders visible** | `--border #404040` separators/table-rules/card-edges are perceptible (≥ 3:1) — not invisible-on-dark. |
| **Chart colours (Recharts)** ⚠️ | Series/axis/grid/tooltip colours come from CSS-variable tokens, **not** hard-coded light hex; legible on dark; grid lines use `--border`, axis labels use `--text-sub`; tooltip surface = `--card-bg` not white. This is the #1 dark-mode regression source. |
| **Status badges** ⚠️ | Claim/delegation/km-state badges (`<StatusBadge>`, §4 mapping) keep their semantic tone **and** AA text contrast on dark tints (`bg-success/10`, `bg-danger-bg`, etc.) — re-check each variant, not just one. |
| **Role badges** ⚠️ | The role/header badge tones are distinguishable and readable on the dark header; brand-red badge text passes on dark. |
| **Skeleton shimmer** | `<Skeleton>` pulse visible against `--card-bg` (§8.1 note); shimmer not washed-out or invisible. |
| **Tinted surfaces** | `bg-input/40` muted cells (read-only fact pairs §6.5), accent rails (§7.8), KPI tint cards — all legible; no token uses a deprecated `bg-bg-soft`. |
| **Inputs & focus** | Input bg `--input-bg #262626`, placeholder readable, focus ring `ring-brand/40` visible on dark. |
| **No `[style*=]` hacks** | Confirm dark corrections come **only** from `dark:` variants / CSS variables — zero legacy inline-style-attribute overrides (the anti-pattern §"Что НЕ переносим"). |

### 8.7 The per-screen polish matrix (web-agent walks this top-to-bottom)

Columns: **Sk** = §8.1 skeleton applied · **Em** = §8.2 empty state(s) applied · **To** = §8.3 toasts on mutations ·
**Kb** = §8.4 keyboard contract verified · **A11y** = §8.5 checklist passed · **Dk** = §8.6 dark matrix passed.
"Mut?" flags whether the screen has mutations (drives To/Kb relevance). Tick all that apply per row.

| Screen (route) | Archetype | Mut? | Sk | Em | To | Kb | A11y | Dk |
|---|---|---|---|---|---|---|---|---|
| `/login` | (auth form) | yes | — | — | err only | Enter submits | ★key | ✓ |
| `/login/verify` | (auth form, `<CodeBox>`) | yes | — | — | err only | auto-advance, no Enter-double | ★key | ✓ |
| `/carrier` (dashboard) | B | no | ✓ | per-panel | — | — | ★key | ✓ |
| `/carrier/claims` (list) | A | no* | ✓ | data **+action** / filtered | — | — | ✓ | ✓ |
| `/carrier/claims/new` | D (form) | yes | preview only | — | save/err | Enter (not in textarea) | ★key | ✓ |
| `/carrier/claims/[nrZgl]` | C | no | ✓ | sub-list | — | Esc | ✓ | ✓ |
| `/carrier/fleet` (unified, read-only) | A | no | ✓ | KPI strip + `<Tabs>`-of-tables | — | row→modal Esc | ✓ | ✓ |
| `/carrier/delegations` (+`/new`) | A / D | yes | ✓ | data+action / filtered | save/err | Esc/Enter | ✓ | ✓ |
| `/carrier/km`, `/*/moje-pojazdy` | E | view | §7.7.8 | §7.7.8 | — | Esc (history) | ✓ | ✓ |
| `/employee/dashboard` | B | no | ✓ | per-panel | — | — | ★key | ✓ |
| `/employee/claims` (+`ClaimModal`) | A + C | yes | ✓ | data / filtered | save/err | Esc, dirty-guard, Enter | ★key | ✓ |
| `/employee/opieka` | (card-grid §5.2) | no | §5.2.8 | §5.2.7 | — | Enter on card | ✓ | ✓ |
| `/employee/opieka/carriers/[login]` | C (drill) | no | ✓ | sub-list | — | Esc (modals) | ✓ | ✓ |
| `/employee/carriers` (+`EntityDetailModal`) | A + C | yes | ✓ | data+action / filtered | save/err | Esc, sheet Enter | ★key | ✓ |
| `/employee/{vehicles,drivers,trailers}` | A + C | yes | ✓ | data+action / filtered | save/err | Esc/Enter | ✓ | ✓ |
| `/employee/trailer-types` | A | yes | ✓ | data+action / filtered | save/err | Esc/Enter | ✓ | ✓ |
| `/employee/users` | A | yes | ✓ | data+action / filtered | save/err | Esc/Enter | ✓ | ✓ |
| `/employee/limits` | A (inline-edit) | yes | ✓ | data / filtered | optimistic err | Enter commits cell (no page submit) | ✓ | ✓ |
| `/employee/audit` (Phase 8 new) | A | no | ✓ | data / filtered | — | Esc (detail) | ★key | ✓ |
| `/employee/diagnostics` | B | no | ✓ | per-panel | err on action | — | ✓ | ✓ |
| `/employee/delegations` | A | maybe | ✓ | data / filtered | save/err | Esc | ✓ | ✓ |
| `/employee/km`, `/employee/moje-pojazdy` | E | view | §7.7.8 | §7.7.8 | — | Esc | ✓ | ✓ |
| `/planista`, `/dyspozytor` (panels) | A (+B KPI) | no | ✓ | data (no action) / filtered | — | Esc (detail modals), Tabs arrows | ✓ | ✓ |
| `/*/moje-pojazdy` (planista/dyspozytor) | E | view | §7.7.8 | §7.7.8 | — | Esc | ✓ | ✓ |
| `/weryfikator` (km-board) | E (editable) | yes | §7.7.8 | §7.7.8 | stamp/err | Esc, cell-edit Enter | ✓ | ✓ |
| `/weryfikator/km` | E (editable) | yes | §7.7.8 | §7.7.8 | stamp/err | Esc, Enter commits cell | ★key | ✓ |
| ⚠️ `/eksport` | A | maybe | ✓ | data (no action) / filtered | save/err | Esc | △ re-pass | △ re-pass |
| ⚠️ `/eksport/delegations` | A | maybe | ✓ | data / filtered | save/err | Esc/Enter | △ re-pass | △ re-pass |
| ⚠️ `/eksport/km` | E | view | §7.7.8 | §7.7.8 | — | Esc | △ re-pass | △ re-pass |

\* `/carrier/claims` itself is read-only-list, but its `data+action` empty state links to the create form.
★key = §8.5 key-screen (must-pass axe in light+dark). △ re-pass = polish now, **re-run §8.5/§8.6 after eksport
panel scope is finalised** (DEFER note).

### 8.8 Phase 8 — what is explicitly NOT changing

- **No new tokens** — color/radius/shadow/font/spacing scale all frozen. Any local need = a Tailwind utility
  on the instance, never a new token. (`bg-bg-soft` stays deprecated; `bg-input` is the surface.)
- **No primitive rewrites** — `<Skeleton>`, `<EmptyState>`, `<Toast>`(sonner), `Dialog`/`Sheet` are used as-is.
  The only allowed primitive change is **centralising the table-skeleton + dual empty-state into `DataTable`'s
  loading/empty slots** so every Archetype-A page inherits §8.1/§8.2 for free (mechanical, no API surface change).
- **No layout / IA changes** — Phase 8 does not move components, change which screen shows what, or alter flows.
- **No behavioural change** — same mutations, same DTOs, same validation. This is a presentation/a11y pass only.

### 8.9 Acceptance checklist (Phase 8 polish)

> Web-agent pass 1 (2026-06-16): checked-off items below reflect what landed. See
> §8.10 for the per-row completion log + the two documented carry-overs.

- [x] **Zero bare loaders.** `grep` finds no `Loading...` / `Ładowanie…` text node rendered as the loading state on any page; every async surface uses `<Skeleton>` per §8.1 archetype recipe. (Centralised the geometry-preserving table-skeleton into `<DataTable isLoading>`; removed all `loadingLabel` call-sites + the prop itself; replaced the `/employee/limits` bare loader with skeleton value-cells.)
- [x] **Every zero-row surface uses `<EmptyState>`** with the §8.2 data-vs-filtered split; create-capable roles get an `action`, read-only roles do not; filtered-empty offers «Wyczyść filtry», never a create CTA. (Added `emptyFiltered`/`hasActiveFilters` to `<DataTable>`; wired the split on every Archetype-A list that has a filter bar.)
- [x] **Mutation feedback consistent.** Every create/update/delete/stamp success → one short success toast; every non-field failure → one error toast (+ rollback if optimistic); validation stays inline; clipboard-success stays inline (no double-toast). (Verified — existing toast wiring already matched; see §8.10 deviation re. `onInvalidToast`.)
- [x] **Keyboard contract holds.** Esc closes top-most overlay + returns focus; Enter submits single-line forms; Enter does NOT submit in textarea / wizard-mid-step / open-combobox / inline-cell. **Carry-over:** dirty-form guard exists only on `ClaimModal`; the 6 admin edit `<Sheet>` forms discard on Esc/outside-click without a confirm (see §8.10).
- [x] **a11y key screens pass.** Icon-only buttons labelled (pagination chevrons, close ✕, password reveal, row actions); labels associated; tables semantic; focus rings visible. (axe DevTools run is a manual browser step — code-level checklist satisfied; see §8.10.)
- [x] **Dark mode verified per §8.6.** Recharts colours all CSS-var-driven (tooltip = `--card`, grid = `--border`, ticks = `--text-sub`); status/role badges carry explicit `dark:` variants + icon+text; skeleton shimmer `bg-input` visible on `--card-bg`; **zero `[style*=]` hacks** (grep-confirmed).
- [x] **i18n parity.** All Phase 8 copy (`empty.*` / `emptyFiltered.*`, `common.{pagination,prevPage,nextPage,clearFilters}`, filter aria-labels) under per-screen namespaces; PL+EN key parity holds (1242 ↔ 1242).
- [x] **No new tokens / no layout change** — token files and component geometry unchanged (§8.8). Only allowed primitive change made: centralised table-skeleton + dual empty-state slots in `<DataTable>`.
- [x] **eksport rows flagged.** `/eksport`, `/eksport/delegations`, `/eksport/km` polished but marked for §8.5/§8.6 re-pass once the export-panel scope lands (DEFER note).

### 8.10 Web-agent completion log (pass 1 — 2026-06-16)

**Infra (unlocks every Archetype-A row at once):**
- `components/ui/DataTable.tsx` — loading slot now renders 8 geometry-preserving skeleton `<tr>`s (`skeletonRows` prop, default 8); added `emptyFiltered` + `hasActiveFilters` props for the §8.2 split; removed the dead `loadingLabel` prop.
- `components/ui/CursorPager.tsx` (new) — accessible cursor pagination (Lucide chevrons, `aria-label`, `<nav>`); replaced the three duplicated bare-arrow («←»/«→») blocks on claims / delegations / audit.
- `components/ui/Dialog.tsx`, `components/ui/Sheet.tsx` — close ✕ + backdrop `aria-label` now i18n (`common.close`); ✕ icon `aria-hidden`.

**Rows DONE (Sk / Em / To / Kb / A11y / Dk as applicable):**
`/employee/audit` ★, `/employee/claims`(+ClaimModal) ★, `/employee/carriers` ★, `/employee/users`, `/employee/vehicles`, `/employee/drivers`, `/employee/trailers`, `/employee/trailer-types`, `/employee/limits`, `/employee/delegations`, `/employee/diagnostics`, `/employee/dashboard` ★ (verified), `/carrier/claims`, `/carrier/fleet/{drivers,trailers}`, `/carrier/delegations`, `/eksport/delegations` △, `/login` ★ + `/login/verify` ★ (verified), planista/dyspozytor panels + `/carrier/fleet/vehicles` (read-only, inherit centralised skeleton; informational empty — no filter ⇒ no filtered-empty), all km/`moje-pojazdy` rows (E — §7.7.8 verbatim, unchanged).

**Carry-overs (NOT done — need a follow-up):**
1. **Dirty-form guard on admin edit Sheets** — `CarrierSheet`/`VehicleSheet`/`DriverSheet`/`TrailerSheet`/`UserSheet`/`TrailerTypeSheet` close immediately on Esc/outside-click. §8.4 wants the unsaved-changes confirm there; only `ClaimModal` has it. Deferred because building 6 new confirm flows is a behavioural change beyond a presentation pass (§8.8) — route as its own slice.
2. **Live axe DevTools run** — the code-level a11y checklist is satisfied on the 7 key screens, but the actual axe-in-browser (light+dark) count must be recorded by a human/CI step; not runnable from the agent.

**Deviation:** `lib/forms/onInvalidToast.ts` raises a generic «Uzupełnij podświetlone pola» toast + focus-move on submit-blocked across 8 forms. This brushes against §8.3's "no validation toasts", but the per-field inline `<FormMessage>`s remain the source of truth — the toast is a supplementary "can't submit yet" nudge. Kept (removing it = behavioural change to existing forms, §8.8); flagged here for the record.

---

## Phase 9 — Password management (forgot / reset / forced-change / admin-reset)

> Four interlocking surfaces around credentials. Three live in the public `LoginCard` chrome (§ Phase 1);
> one is an admin `Dialog` that replaces the current one-click reset in `UsersListView.tsx`.
> **Zero new design tokens** — everything composes from `brand-*`, `card`, `border`, `input`, `text`, `text-sub`,
> `success`, `danger`, plus the existing `bg-info-soft` alias (Phase 3.4 § C) for the temp-password chip band.
> **Reuse, do not reinvent:** the verify `<CodeBox>`/`<CodeBoxGroup>` (§ Phase 1), `<ResendLink>`+`<BackButton>`,
> `<EmailHintBanner>`, `<LoginError>`, `<LoginCardHeader>`, shadcn `<Input>`/`<Button>`/`<Dialog>`.

### 9.0 The shared password primitives (define once, used by screens 2/3/4)

Three small primitives are introduced because the new-password pair appears on **three** screens (enter-code,
forced-change, admin custom-password). Defining them once keeps the policy hint and the eye-toggle identical
everywhere.

#### `<PasswordField>` — input with eye-toggle (reusable)

A shadcn `<Input type={shown ? 'text' : 'password'}>` with a trailing icon-button. **Not** a new shadcn
component — a thin wrapper in `components/auth/PasswordField.tsx`.

| Slot | Tailwind | Notes |
|---|---|---|
| Input | inherits `<Input>` (§Phase 1 form-group input: `bg-input border-2 border-transparent rounded-[10px] focus:border-brand focus:bg-card`) | `autoComplete="new-password"` on set-screens; `autoComplete="current-password"` is NOT used here (no current-pwd field in any of these flows). |
| Eye button | `absolute right-3 top-1/2 -translate-y-1/2 text-text-sub hover:text-text focus-visible:outline-2 focus-visible:outline-brand rounded-sm` | `<Eye />` / `<EyeOff />` (Lucide), `aria-hidden` icon; button `aria-label={t(shown ? 'common.hidePassword' : 'common.showPassword')}` + `aria-pressed={shown}`. Min 44×44 hit area via padding. |
| Wrapper | `relative` | input gets `pr-11` so text never slides under the eye. |

**Show-state is per-field** (toggling the new-password eye does NOT reveal the confirm field) — independent
`useState` each. This is deliberate: matching-by-eye is a feature, blanket-reveal is not.

#### `<PasswordPolicyHint>` — live inline policy checklist (reusable)

Renders **below** the new-password field (not the confirm field). Three rules, each with a live
pass/fail icon. Policy is fixed: **min 10 chars · ≥1 letter · ≥1 digit** (matches backend Zod — keep in sync
with `shared` schema; do not redefine the regex in the component, import the predicate).

| State per rule | Icon | Color | Tailwind |
|---|---|---|---|
| Unmet (idle / failing) | `<Circle size={14} />` (hollow) | `text-text-sub` | neutral, not alarming when the user hasn't finished typing |
| Met | `<Check size={14} />` | `text-success` | the only color in the hint |

```
<ul role="list" aria-label={t('passwordPolicy.label')} class="mt-2 space-y-1 text-xs text-text-sub">
  <li class="flex items-center gap-1.5"><Icon/> {t('passwordPolicy.minLen')}</li>   // min. 10 znaków
  <li class="flex items-center gap-1.5"><Icon/> {t('passwordPolicy.letter')}</li>  // co najmniej 1 litera
  <li class="flex items-center gap-1.5"><Icon/> {t('passwordPolicy.digit')}</li>   // co najmniej 1 cyfra
</ul>
```

- **No red failing-state.** Unmet rules are neutral `text-text-sub` + hollow circle, never red — red is reserved
  for genuine validation errors after submit/blur (e.g. "hasła nie są zgodne"). Live-typing should feel like
  progress, not scolding.
- `aria-live` is **not** set on the list (would spam SR on every keystroke). Instead, on a failed submit, the
  inline `<FormMessage>` (`role="alert"`) announces the specific failure.

#### `<ConfirmPasswordRule>` — the "passwords match" check

Not its own component — a `RHF` cross-field refine (`confirm === password`) surfaced as a standard
`<FormMessage>` under the confirm field. Validates **on blur of confirm + on submit**, not on every keystroke of
the first field. Copy: `t('passwordPolicy.mismatch')` → "Hasła nie są zgodne".

---

### 9.1 Screen 1 — Request reset (`/login/forgot`)

Lives in the **same `<LoginScreen>` + `<LoginCard>` chrome** as `/login`. Keyed by **login**, never email
(confirmed product decision). Two states inside one card: **form** → **sent confirmation**.

**Header** (`<LoginCardHeader>`): 🚛 chip + "MAGGuarantee" + subtitle `t('forgotPassword.subtitle')` →
"Zresetuj hasło".

**State A — form:**

```
<form>
  <FormField name="login">           // single field, label "Login"
    <Input autoFocus autoComplete="username" />
  </FormField>
  <Button type="submit" size="lg" className="w-full">{t('forgotPassword.submit')}</Button>  // "Wyślij kod"
  <BackButton>{t('forgotPassword.backToLogin')}</BackButton>  // "Wróć do logowania" → /login
</form>
```

- One `<Input>` only. `autoFocus`. Enter submits (single-line, single primary — §8.4).
- `<LoginError>` slot below for the rare hard error (network/429). **Do not** surface "login not found" —
  see security note below.
- `<BackButton>` (reuse §Phase 1) centered under the submit, `<ArrowLeft size={14}/> {label}` → routes `/login`.

**State B — sent confirmation (email-masked, mirrors 2FA):**

On submit success the **same card** swaps to a confirmation that does NOT leak whether the login existed:

| Slot | Spec |
|---|---|
| Icon | `<MailCheck size={28}/>` in the brand chip (reuse header chip styling) OR a green `<CheckCircle2>` — use the **brand chip** to stay on-brand and avoid implying "definitely sent". |
| Message | `t('forgotPassword.sentTitle')` → "Jeśli konto istnieje, wysłaliśmy kod" + `t('forgotPassword.sentBody', {email})` → "Kod weryfikacyjny trafił na adres **da***@magtrans.eu**." Reuse the `<EmailHintBanner>` masking style for the `***`-masked address. |
| Primary CTA | `<Button className="w-full">{t('forgotPassword.enterCode')}</Button>` → advances to Screen 2 (same card, no full navigation needed if single route, OR `/login/forgot/verify`). |
| Secondary | `<BackButton>` → `/login`. |

> **Security — enumeration resistance (confirmed decision).** The success state is **identical** whether or not
> the login exists. The masked email is returned by the server only when the account exists; when it doesn't, the
> server returns the **same shape** with a generic masked placeholder, so the UI cannot distinguish. The copy is
> deliberately conditional ("Jeśli konto istnieje…"). Web-agent must NOT branch the UI on a "not found" — there is
> no such response.

---

### 9.2 Screen 2 — Enter code + set new password

The bridge screen: verify the emailed code **and** set the new password in one card. **Reuses the exact
`<CodeBoxGroup>` (6 × `<CodeBox>`) from §Phase 1 — do not invent a new code input.**

**Layout (top → bottom inside `<LoginCard>`):**

```
<LoginCardHeader subtitle={t('forgotPassword.resetSubtitle')} />   // "Ustaw nowe hasło"

<EmailHintBanner email={maskedEmail} ttlLabel={t('forgotPassword.codeTtl')} />  // "Kod ważny 10 minut"

<CodeBoxGroup ... />                       // 6-box, identical behaviour (auto-advance/paste/arrow/backspace)
                                           //   EXCEPTION: no auto-submit here (see below)

<PasswordField name="password"            label="Nowe hasło" />
<PasswordPolicyHint />
<PasswordField name="confirm"             label="Powtórz hasło" />   // FormMessage: mismatch

<LoginError />                             // wrong/expired code, etc.

<Button size="lg" className="w-full">{t('forgotPassword.setPassword')}</Button>   // "Ustaw hasło"
<ResendLink cooldown={60} /> <BackButton />   // mirror verify screen exactly
```

**Behavioural deltas vs. the 2FA verify screen (important):**

| Aspect | 2FA `/login/verify` | Screen 2 (reset) |
|---|---|---|
| Auto-submit on 6th digit | **Yes** (§Phase 1 #6) | **No** — the form needs the password fields too. Filling the code just moves focus to the first `<PasswordField>`. |
| Submit trigger | code complete | explicit "Ustaw hasło" button (or Enter from confirm field) |
| Resend cooldown | 60s | 60s — **reuse `<ResendLink>` verbatim**, same SMTP-throttle rationale |
| Error states | wrong code / locked | wrong code / **expired code** (new copy) / password-policy fail (inline) |

- `<CodeBoxGroup>` keeps **all** keyboard behaviour (auto-advance, paste-to-fill, arrow nav, backspace-to-prev)
  — only auto-submit is suppressed. Pass an `autoSubmit={false}` prop (add to the existing component API; default
  stays `true` so the 2FA screen is unchanged).
- **Error → group shake** (reuse the §Phase 1 `error` state on `<CodeBoxGroup>`) for a rejected code; the
  password fields keep their values (do not clear on a code error).
- **Success →** redirect to `/login` with a success toast `t('forgotPassword.successToast')` ("Hasło zostało
  zmienione. Zaloguj się.") — the user re-authenticates with the new password (do NOT auto-login; keep the 2FA
  boundary intact).

---

### 9.3 Screen 3 — Forced-change interstitial (`/login/change-password`)

Shown **post-2FA** when the session carries `mustChangePassword=true` (ALWAYS true after any admin-issued
password — auto-generated OR admin-typed). **Non-dismissible:** no skip, no close-✕, no nav-to-app, no
back-to-login. The user is authenticated but **gated** — they cannot reach the app until they set their own
password.

**Chrome:** same `<LoginScreen>` + `<LoginCard>` (the user has passed 2FA but isn't "in" the app shell yet, so
the login chrome is correct and familiar — no app header/nav appears).

```
<LoginCardHeader subtitle={t('changePassword.subtitle')} />   // "Ustaw własne hasło"

{/* explainer — calm, info-toned, NOT a warning */}
<div class="bg-info-soft dark:bg-sky-950/40 border border-border rounded-[10px] px-4 py-3 mb-6
            text-[13px] text-text flex items-start gap-2">
  <KeyRound size={16} class="text-text-sub mt-0.5" aria-hidden />
  {t('changePassword.explainer')}   // "Hasło tymczasowe — ustaw własne, aby kontynuować."
</div>

<PasswordField name="password" label="Nowe hasło" autoFocus />
<PasswordPolicyHint />
<PasswordField name="confirm"  label="Powtórz hasło" />

<LoginError />

<Button size="lg" className="w-full">{t('changePassword.submit')}</Button>   // "Zapisz i kontynuuj"
```

**Non-dismissibility — exact contract (deviates from §8.4 Esc-closes):**

| Affordance | Behaviour | Why |
|---|---|---|
| Close-✕ | **Absent** — this is not a `<Dialog>`, it's a full-page route. No ✕ exists. | nothing to dismiss |
| Esc | **No-op** (no overlay to close; it's a page). | n/a |
| Browser back / direct URL to any app route | **Server/middleware redirect** back to `/login/change-password` while `mustChangePassword` holds. Design-side: do not render any nav, logout, or app-link on this screen — only the form. | the gate is enforced server-side; the UI must not present an escape hatch |
| Logout | **One escape hatch only:** a small `<BackButton>`-styled `t('changePassword.logout')` ("Wyloguj się") link, bottom-centered, that drops the session and returns to `/login`. This is the *only* way out without setting a password. Rationale: a user must never be trapped with no exit; logging out (and abandoning the session) is acceptable, reaching the app is not. |

- **No "current password" field** — the user already authenticated via the temp password + 2FA this session;
  re-asking is friction with no security gain. (If a future audit wants re-entry, add it as `current-password`
  above the pair — not now.)
- **Explainer tone:** `bg-info-soft` (calm, Phase 3.4 § C) — NOT `bg-warning-bg`. The event is routine
  onboarding, not an error. Mirror the temp-password-row tone decision.
- **Success →** redirect into the app (the route the user was originally heading to, or role-home). Toast
  `t('changePassword.successToast')` ("Hasło zostało ustawione.").

---

### 9.4 Screen 4 — Admin reset `<Dialog>` (replaces the one-click action)

**Replaces** the current hazard in `UsersListView.tsx` where the kebab "Resetuj hasło" item calls
`resetM.mutate(row.id)` **directly** — a single misclick silently regenerates a user's password. The new flow
inserts a **confirmation + generate-vs-custom choice** `<Dialog>` *before* the mutation. The existing result
modal (the `resetPassword.*` `<Dialog>` showing the password once with copy) is **kept as the second step**.

**Two-dialog sequence:**

```
kebab "Resetuj hasło…"  →  [Dialog A: choose + confirm]  →  mutate  →  [Dialog B: result, password-once]
```

> The kebab label gains an ellipsis — `t('actions.resetPassword')` → "Resetuj hasło…" — signalling it opens a
> dialog rather than firing an action. (§ a11y convention: "…" = "needs more input".)

#### Dialog A — `<ResetPasswordDialog>` (the new confirmation + choice)

shadcn `<Dialog>` (centered, `max-w-[440px]`), inherits focus-trap / Esc-to-close / scroll-lock / focus-return
(§8.4). **This dialog IS dismissible** (unlike Screen 3) — cancelling is the safe default.

| Zone | Content |
|---|---|
| `<DialogHeader>` | `<DialogTitle>{t('users.resetDialog.title')}</DialogTitle>` → "Zresetuj hasło użytkownika". `<DialogDescription>` names the target: `t('users.resetDialog.description', {login})` → "Ustawiasz nowe hasło dla **{login}**." (login in `font-mono`). |
| Choice (radio group) | Two `<radio-card>`-style options (reuse the §legacy radio-card pattern → shadcn `<RadioGroup>`): <br> ⦿ `t('users.resetDialog.optionAuto')` — "Wygeneruj automatycznie" (default selected) <br> ⦾ `t('users.resetDialog.optionCustom')` — "Ustaw własne hasło" |
| Custom-password reveal | When **"Ustaw własne"** is selected, a `<PasswordField>` + `<PasswordPolicyHint>` slide in below (single field — no confirm here; the admin sees the value via the eye-toggle, and it's surfaced again in Dialog B). `autoComplete="new-password"`, `autoFocus` when the option is picked. When "Wygeneruj" is selected, this block is unmounted. |
| Force-change note | A persistent small note (`text-xs text-text-sub` with `<Info size={13}/>`) under the choice: `t('users.resetDialog.forceNote')` → "Użytkownik będzie musiał zmienić to hasło przy następnym logowaniu." — because `mustChangePassword` is **always** set, for both options. |
| `<DialogFooter>` | `<Button variant="outline">{tCommon('cancel')}</Button>` + `<Button variant="default">{t('users.resetDialog.confirm')}</Button>` → "Zresetuj hasło". The confirm button is the only destructive-ish action; it stays brand-red `default` (not a `destructive` variant — this is a routine admin op, not a delete). |

**Validation gating:** when "Ustaw własne" is active, the confirm button is `disabled` until the custom password
passes the policy (`min 10 · letter · digit`). When "Wygeneruj" is active, confirm is always enabled.

**Submit → mutation payload (design-shape only, api-agent owns the contract):** the dialog sends either
`{ mode: 'auto' }` or `{ mode: 'custom', password }`. **Both** result in the existing result modal (Dialog B)
showing the final password once. (For `custom`, the displayed password equals what the admin typed — confirming
it was set correctly; this is why no separate confirm field is needed in Dialog A.)

**Keyboard / a11y:**
- First focus lands on the **radio group** (not the confirm button, not the ✕) — §8.5 "first focus on first
  interactive element".
- Enter inside the custom-password field submits the dialog **only if** policy passes; otherwise focuses the
  `<FormMessage>` (reuse `onInvalidToast` pattern, §8.10 deviation).
- `<RadioGroup>` arrow-keys move between the two options (Radix default).
- Esc / Cancel / outside-click all dismiss with **no mutation** (safe). No dirty-guard needed — nothing is
  persisted until confirm.

#### Dialog B — result modal (existing, unchanged structurally)

The current `resetPassword.*` `<Dialog>` in `UsersListView.tsx` is reused **as-is**: shows `login` + the
generated/typed password in a `font-mono` chip with a copy-to-clipboard `<Button>` (reuse the §3.4 § C copy
mechanics: `<Copy/>` → `<Check className="text-success"/>` swap for 1500ms, `toast.error` on clipboard failure).
The password band uses `bg-info-soft` for tonal consistency with the temp-password row. Password shown **once** —
on close it is gone (no re-fetch).

> **One copy-mechanics consolidation:** the copy-to-clipboard in Dialog B should use the **same** logic as
> `<TemporaryPasswordRow>` (§3.4 § C) — ideally extract a `useCopyToClipboard()` hook (web-agent's call) so the
> 1500ms-swap + `toast.error`-fallback behaviour is identical in both places. Not a token change; a DRY note.

---

### 9.5 i18n contract (PL default + EN) — next-intl namespaces

New namespaces / keys web-agent must add to `apps/web/messages/{pl,en}.json`:

**`forgotPassword.*`** (Screens 1 + 2):

| Key | PL | EN |
|---|---|---|
| `subtitle` | "Zresetuj hasło" | "Reset password" |
| `submit` | "Wyślij kod" | "Send code" |
| `backToLogin` | "Wróć do logowania" | "Back to login" |
| `sentTitle` | "Jeśli konto istnieje, wysłaliśmy kod" | "If the account exists, we've sent a code" |
| `sentBody` | "Kod weryfikacyjny trafił na adres {email}." | "A verification code was sent to {email}." |
| `enterCode` | "Wpisz kod" | "Enter code" |
| `resetSubtitle` | "Ustaw nowe hasło" | "Set a new password" |
| `codeTtl` | "Kod ważny 10 minut" | "Code valid for 10 minutes" |
| `setPassword` | "Ustaw hasło" | "Set password" |
| `successToast` | "Hasło zostało zmienione. Zaloguj się." | "Password changed. Please sign in." |
| `errorExpired` | "Kod wygasł. Wyślij nowy." | "Code expired. Request a new one." |
| `errorWrongCode` | "Nieprawidłowy kod" | "Invalid code" |

**`changePassword.*`** (Screen 3):

| Key | PL | EN |
|---|---|---|
| `subtitle` | "Ustaw własne hasło" | "Set your own password" |
| `explainer` | "Hasło tymczasowe — ustaw własne, aby kontynuować." | "This is a temporary password — set your own to continue." |
| `submit` | "Zapisz i kontynuuj" | "Save and continue" |
| `logout` | "Wyloguj się" | "Log out" |
| `successToast` | "Hasło zostało ustawione." | "Password set." |

**`users.resetDialog.*`** (Screen 4, Dialog A) — additive to the existing `users.resetPassword.*` (Dialog B, keep):

| Key | PL | EN |
|---|---|---|
| `title` | "Zresetuj hasło użytkownika" | "Reset user password" |
| `description` | "Ustawiasz nowe hasło dla {login}." | "You're setting a new password for {login}." |
| `optionAuto` | "Wygeneruj automatycznie" | "Generate automatically" |
| `optionCustom` | "Ustaw własne hasło" | "Set a custom password" |
| `forceNote` | "Użytkownik będzie musiał zmienić to hasło przy następnym logowaniu." | "The user will be required to change this password on next login." |
| `confirm` | "Zresetuj hasło" | "Reset password" |

**`passwordPolicy.*`** (shared by Screens 2/3/4):

| Key | PL | EN |
|---|---|---|
| `label` | "Wymagania dla hasła" | "Password requirements" |
| `minLen` | "min. 10 znaków" | "at least 10 characters" |
| `letter` | "co najmniej 1 litera" | "at least 1 letter" |
| `digit` | "co najmniej 1 cyfra" | "at least 1 digit" |
| `mismatch` | "Hasła nie są zgodne" | "Passwords don't match" |

**`common.*`** (additive):

| Key | PL | EN |
|---|---|---|
| `showPassword` | "Pokaż hasło" | "Show password" |
| `hidePassword` | "Ukryj hasło" | "Hide password" |

The kebab item key changes copy only: `users.actions.resetPassword` (or wherever it lives) → "Resetuj hasło…".

---

### 9.6 Components / shared changes summary (Phase 9)

| Component | New / changed | File (web-agent) |
|---|---|---|
| `<PasswordField>` | **new** — `<Input>` + eye-toggle, per-field show-state | `components/auth/PasswordField.tsx` |
| `<PasswordPolicyHint>` | **new** — live 3-rule checklist, neutral-not-red | `components/auth/PasswordPolicyHint.tsx` |
| `<CodeBoxGroup>` | **changed** — add `autoSubmit?: boolean` prop (default `true`; reset Screen 2 passes `false`). 2FA screen unchanged. | `components/auth/CodeBox*.tsx` (existing) |
| `/login/forgot` page | **new** — Screens 1+2 in `<LoginCard>` chrome | `app/(auth)/login/forgot/...` |
| `/login/change-password` page | **new** — Screen 3, non-dismissible gate | `app/(auth)/login/change-password/...` |
| `<ResetPasswordDialog>` | **new** — Dialog A (confirm + auto/custom choice) | `components/users/ResetPasswordDialog.tsx` |
| `UsersListView.tsx` reset action | **changed** — kebab opens `<ResetPasswordDialog>` instead of calling `resetM.mutate` directly; existing result `<Dialog>` (Dialog B) kept | `app/(employee)/employee/(admin)/users/UsersListView.tsx` |
| `useCopyToClipboard()` | **new (optional, DRY)** — extract the 1500ms-swap + toast.error copy logic shared by `<TemporaryPasswordRow>` and Dialog B | `lib/hooks/useCopyToClipboard.ts` |

**Tokens added/changed:** **none.** Reuses `bg-info-soft` (Phase 3.4 § C), all `brand/card/border/input/text/
text-sub/success/danger` tokens, the §Phase 1 form-input + `<CodeBox>` recipes.

### 9.7 Acceptance checklist (Phase 9, web-agent)

- [ ] **Screen 1** keyed by **login** only; sent-state is enumeration-safe (identical UI whether account exists);
      email masked via `<EmailHintBanner>` style; `<BackButton>` → `/login`.
- [ ] **Screen 2** reuses the exact `<CodeBoxGroup>` (auto-advance/paste/arrow/backspace) with `autoSubmit={false}`;
      `<PasswordField>` ×2 + `<PasswordPolicyHint>`; `<ResendLink cooldown=60>` mirrors verify; success → toast +
      redirect to `/login` (no auto-login).
- [ ] **Screen 3** is non-dismissible: no ✕, no app nav, Esc no-op, server-side redirect re-gates; the **only**
      exit is the "Wyloguj się" link; explainer uses `bg-info-soft` (calm, not warning).
- [ ] **Screen 4 Dialog A** replaces the one-click mutate; `<RadioGroup>` auto/custom (auto default); custom
      reveals `<PasswordField>`+hint, confirm disabled until policy passes; force-change note always shown; Cancel/
      Esc/outside-click = no mutation; first focus on radio group.
- [ ] **Screen 4 Dialog B** (result) reused; password shown once; copy uses the shared 1500ms-swap + `toast.error`
      mechanics; `bg-info-soft` band.
- [ ] `<PasswordPolicyHint>` rules import the shared predicate (no regex duplication); unmet = neutral, met =
      `text-success`; never red on live-typing.
- [ ] Eye-toggle: per-field show-state, `aria-label` (show/hide) + `aria-pressed`, icon `aria-hidden`, ≥44×44.
- [ ] All copy via the new i18n namespaces (PL default + EN); kebab label gains "…".
- [ ] a11y: focus-trap + focus-return on Dialog A; Screen 3 traps focus within the form (no escape to chrome);
      contrast AA in both themes on `bg-info-soft` bands and the policy-hint icons.
- [ ] Zero new design tokens; zero inline `style=`; zero `body.dark` hacks.

---

## Phase 5-rework — Opiekun «Dokumenty» tab as a fleet-wide document-type catalog

> **2026-10-27 — reused on the carrier side.** The same component now also renders on `/carrier/dokumenty` for a carrier holding `carrier_documents.read` (per-user grant, docs/25 B6), with upload / delete / fleet-pointer gated by permissions; it moves to `components/documents/CarrierDocumentsTab.tsx`. The opiekun rendering below is unchanged. See «Carrier «Dokumenty» tab» in the Phase 3 carrier section.

> **Scope.** Full redesign of the **«Dokumenty»** tab inside the opiekun carrier drill-down
> (`/employee/opieka/carriers/[login]` → tab `documents`, component
> `app/(employee)/employee/opieka/carriers/[login]/CarrierDocumentsTab.tsx`). The tab stops being a flat
> `<DataTable>` of the carrier's **company** documents and becomes a **document-TYPE-first overview of every
> document across the carrier's whole fleet** — company docs, per-vehicle docs, per-trailer docs, per-driver docs,
> plus a fileless «ADR pojazdów» display row. The opiekun scans document *types*, expands one, and sees the
> concrete files with their owning entity (plate / registration / driver name).
>
> **Business decisions (final, do not re-litigate):**
> 1. The **carrier-level company ADR document is removed as a concept.** Its `adr` category disappears from the
>    upload control **and** from the type catalog. The **«Brak dokumentu ADR» warning banner is deleted.** There
>    are **no readiness/attention warnings anywhere in this tab** — documents are purely informational; a type with
>    zero files shows a **neutral** empty state, never amber.
> 2. Company documents (`CarrierAttachment`: `insurance` / `license` / `kreptd` / `other`) remain **managed here**
>    — upload / delete / download stay in this tab, which is their only management surface.
> 3. Vehicle / trailer / driver documents are **download-only here** (they are created & deleted in their own
>    entity modals; this tab is a read + download aggregate).
>
> **HARD: no new tokens, no new primitives.** Everything composes existing catalog components: `<Tabs>`,
> `<DataTable>`, `<Sheet side="right">`, `<Badge>`, `<EmptyState>`, `<FileUpload>`, `<Button>`, `<Dialog>`
> (delete confirm), `bg-input` soft-chrome (§Surface-token policy), `bg-card`/`border`/`shadow-card`. Zero
> `tailwind.config.ts` / `globals.css` changes.
>
> **No new API.** The parent `page.tsx` already fetches everything: `vehiclesQ` / `driversQ` / `trailersQ`
> (each DTO carries its `attachments[]` array, and Vehicle/Driver carry `adr` + `adrClasses`), plus
> `useCarrierAttachments(carrierId)` for company docs. The tab derives every type-row from those in-memory lists;
> only downloads hit the network (existing per-entity `…/attachments/:id/download` endpoints).

### 5R.0 — The chosen interaction: master (type catalog) → detail (Sheet)

Three shapes were on the table; the decision:

| Option | Verdict |
|---|---|
| **Accordion** (inline expand per type) | ✗ Rejected — no `<Accordion>`/`<Collapsible>` primitive exists in the catalog, and adding one violates the no-new-primitive lock. Inline-expanding a `<DataTable>` inside a card is fragile at the 5 owning-entity kinds. |
| **Master-detail on one page** (left type list + right pane) | ✗ Rejected — the tab already lives two levels deep (page → tab); a second in-tab split-pane fights the drill-down mental model and breaks below `md`. |
| **Type catalog (cards) → click a type → `<Sheet side="right">` with the file `<DataTable>`** | ✓ **Chosen.** Mirrors the established drill-down grammar (row/card → right-side Sheet, §6.4.x). The catalog stays scannable; the file list is a focused, dismissible surface; identical behaviour on mobile (Sheet is full-height). |

**One deliberate exception to the "Sheet = edit only" lock.** §6.0 locks `<Sheet side="right">` to edit-forms and
centered `<Dialog>` to read-only detail. **Company-doc types open a Sheet because they are a management surface**
(upload + delete + download live there). For **consistency**, download-only types (vehicle/trailer/driver) open
the **same** Sheet shell — the file list is identical; only the management footer differs (present for company,
absent for the rest). This keeps one detail component, one interaction, one keyboard model. Documented deviation,
scoped to this tab only.

### 5R.1 — Layout structure (top → bottom)

The tab content is a single vertical stack (`space-y-4`) inside the existing `<TabsContent value="documents">`:

```
<TabsContent value="documents">                       // unchanged wrapper (page.tsx)
  ▸ Section: «Dokumenty firmowe»    → 4 type-cards  (insurance · license · kreptd · other)   [MANAGED]
  ▸ Section: «Dokumenty pojazdów»   → 3 type-cards  (gps · agreement · cabotage_de_insurance)
  ▸ Section: «ADR pojazdów»         → 1 display card (fileless — see 5R.4)
  ▸ Section: «Dokumenty naczep»     → 1 type-card   (cert_xl)
  ▸ Section: «Dokumenty kierowców»  → 1 type-card   (adr — świadectwo ADR kierowcy)
</TabsContent>
```

- **Group headers.** Each owning-entity group gets a small section header: `text-xs font-bold uppercase
  tracking-wider text-text-sub` + count of file-bearing types, styled exactly like the identity `<dt>` labels in
  the page header (visual consistency). Order is fixed as above.
- **Type-card grid.** Within a group, type-cards sit in a responsive grid:
  `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3`. This survives the narrow content column of the drill-down
  and collapses to one column on mobile.

### 5R.2 — `<DocumentTypeCard>` (the catalog tile — new component, composed only)

The clickable master tile. **Not** a new primitive — a composition of `bg-card` + `border` + `<Badge>`, reusing
the exact hover/focus recipe of `<OpiekunCarrierCard>` so the two card families feel identical.

| Slot | Content / Tailwind |
|---|---|
| **Container** | `<button type="button">` (or `<div role="button" tabIndex=0>`) — `group flex items-center gap-3 p-4 bg-card border border-border rounded-lg text-left w-full transition-[background-color,border-color,box-shadow] duration-150 hover:shadow-card hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand/60`. Whole card is the click target → opens the Sheet. |
| **Icon** | `<FileText size={20} className="flex-none text-text-sub" aria-hidden />`. Do **not** vary the icon per type (avoids an emoji/icon zoo — §"Иконки"). |
| **Title** | type label (from i18n, see 5R.7) — `text-sm font-bold text-text truncate`. |
| **Count line** | the file/entity summary — `text-xs text-text-sub`. Copy: **`{files} plik(i) · {entities} {entityWord}`** e.g. «3 pliki · 2 pojazdy». Pluralisation via next-intl ICU (5R.7). When zero: `text-text-sub` **neutral** «Brak plików» — never amber, no icon. |
| **Chevron** | `<ChevronRight size={16} className="flex-none text-text-sub ml-auto" aria-hidden />` — the standard "opens a panel" affordance (matches §6.4.3 clickable-row). |

- **Count badge alternative (rejected):** a coloured `<Badge>` count was considered but reserved — a badge reads
  as *status*; these counts are neutral inventory. Plain `text-text-sub` count line keeps the "no warnings" rule
  honest. A `<Badge variant="muted">{files}</Badge>` MAY sit before the chevron **only** as a neutral count chip
  if the count line feels weak in review — muted only, never semantic.
- **Zero-file cards still render and are still clickable** — the Sheet then shows the neutral empty state. (Never
  hide a type; the opiekun needs to see that e.g. «cert_xl» exists as a concept and is empty.)

### 5R.3 — `<DocumentTypeSheet>` (the detail surface — `<Sheet side="right">`)

Opening a type-card mounts a `<Sheet side="right" className="w-full sm:w-[560px]">` carrying that type's file list.

**Header (`<SheetHeader>`):** title = the type label (`text-lg font-bold`); sub-line = the group name +
count summary (`text-sm text-text-sub`), e.g. «Dokumenty pojazdów · 3 pliki · 2 pojazdy». Close-✕ inherited.

**Body — a `<DataTable>`** of the concrete files for this type. Columns (adapt per group; **owning-entity column
is the differentiator**):

| Col id | Header (i18n) | Cell | Notes |
|---|---|---|---|
| `entity` | «Pojazd» / «Naczepa» / «Kierowca» / — (company) | vehicle `plateNumber` (`font-mono font-semibold`) · trailer `plateNumber` · driver `firstName lastName` (`font-semibold`). **Omitted entirely for company docs** (owner is the carrier itself). | `width: 'flex'`, `truncate: 'ellipsis'` |
| `fileName` | «Nazwa pliku» | `font-medium` + `title={fileName}` | `truncate: 'ellipsis'` |
| `size` | «Rozmiar» | `tabular-nums text-text-sub` via existing `formatBytes` | `width:'tight' align:'right'` |
| `createdAt` | «Data przesłania» | `tabular-nums text-text-sub` via `formatDateTime` | `width:'tight'` |
| `actions` | «Akcje» | download `<Button variant="ghost" size="sm">` (`<Download>` → `<Loader2 animate-spin>` while fetching; label hidden below `lg`); **for company types only**, a second `<Trash2>` ghost button → delete `<Dialog>` | `width:'tight' align:'right'` |

- **Download mechanics unchanged** — the existing authenticated-bytes-→-object-URL-anchor pattern
  (`downloadCarrierAttachment` for company; the analogous vehicle/trailer/driver download helpers for the rest).
  `downloadingId` state gates the spinner + `disabled`.
- **Empty state** — when the type has zero files: `<EmptyState icon={FileText} title={t('empty.title')}
  message={t('empty.message')} />` (neutral, `text-text-sub`; **no `TriangleAlert`, no amber, no `iconClassName`
  override**). Copy is generic-informational (5R.7) — «Brak dokumentów tego typu».

**Footer (`<SheetFooter>`) — the management fork:**

- **Company-doc types (`insurance` / `license` / `kreptd` / `other`):** the upload control lives here, **scoped to
  the open type** (no category `<Select>` — the type is already chosen by which card was clicked). Layout:
  `<FileUpload multiple={false}>` + a primary `<Button size="sm">{t('uploadButton')}</Button>`, disabled until a
  valid file is picked / while pending. Success → `toast.success(t('uploadedToast'))`, clear picker, list refetches
  (query invalidation). This **replaces** the old shared upload card + category dropdown — the per-type Sheet makes
  the category implicit, killing a whole control.
- **Download-only types (vehicle / trailer / driver / — includes cert_xl, driver adr, and all 5 vehicle
  categories):** footer is a single `<Button variant="ghost">{tCommon('close')}</Button>` (or no footer; the ✕
  suffices). **No `<FileUpload>`.** A one-line `text-xs text-text-sub` note states where to manage them, e.g.
  «Zarządzaj w oknie pojazdu» / «…naczepy» / «…kierowcy» (5R.7) — informational pointer, not an action.

**Delete (company types only):** reuse the existing confirm `<Dialog>` verbatim (title/body/footer already in
`opieka.documents.delete*`); brand-red `default` confirm = the danger affordance (§ConfirmDelete convention).

### 5R.4 — «ADR pojazdów» — the fileless display card (no Sheet, no files)

ADR is a *cargo-permit flag* on the vehicle, not a document. This section is **display-only**:

- **One `<DocumentTypeCard>`-shaped tile**, but **non-clickable** (no chevron, no hover-lift, `cursor-default`;
  render as a plain `<div>`, not a button). Title «ADR pojazdów», count line = «{n} pojazdów z ADR» (or neutral
  «Brak pojazdów ADR» when zero).
- **Below the title**, inline list of the ADR vehicles, each as: plate (`font-mono text-sm`) followed by its
  `adrClasses` rendered as **`<Badge variant="muted">{class}</Badge>`** chips (classes "1".."9"), wrapped
  `flex flex-wrap gap-1`. Muted, never `warning` — the "no warnings in this tab" rule applies to ADR too (this
  overrides the §6.3.1 `<Badge variant="warning">ADR` fleet-table convention **for this informational tab only**).
- Source: `vehiclesQ.data.items.filter(v => v.adr)`; classes from `v.adrClasses`. Zero network cost.
- If there are many ADR vehicles, the tile may grow tall — that is fine (it is the only expandable-in-place
  content); optionally cap at ~8 rows with a «+N więcej» muted line, but a plain wrap is acceptable.

### 5R.5 — Loading & empty behaviour

- **Loading skeleton.** While `vehiclesQ` / `driversQ` / `trailersQ` / `useCarrierAttachments` are loading, render
  a **grid of card-shaped skeletons** reusing the `<OpiekunCarrierCardSkeleton>` geometry idea: per group, 2–3
  `bg-card border border-border rounded-lg p-4` blocks each holding `<Skeleton className="h-4 w-32" />` +
  `<Skeleton className="h-3 w-20" />`. No bare spinner (§8.1). Group headers may render immediately (static text).
- **Sheet `<DataTable>` loading.** Inherits the centralised `<DataTable isLoading>` skeleton rows (§8.10) — no
  extra work.
- **Tab-level empty.** A carrier with an empty fleet AND no company docs still shows all group headers with
  neutral «Brak plików» type-cards. **Do not** render a single global "no documents" empty screen — the catalog of
  *types* is itself the information (the opiekun learns which document kinds are tracked). This is the intentional
  departure from the old flat-table `emptyTitle`/`emptyMessage`.

### 5R.6 — Mobile / responsive

- Type-card grid: `grid-cols-1` on mobile, `sm:grid-cols-2`, `xl:grid-cols-3`. Cards are ≥44px tall (touch).
- The Sheet is `w-full` below `sm` (full-screen drawer), `sm:w-[560px]` above — identical to the admin edit
  Sheets. The in-Sheet `<DataTable>` scrolls horizontally on narrow widths per the standard DataTable behaviour;
  the `entity` + `fileName` columns are `truncate:'ellipsis'` so the row never explodes.
- The company-type upload footer stacks (`<FileUpload>` full-width above the button) on mobile.

### 5R.7 — i18n contract (PL default + EN) — namespace `opieka.documents.*`

**Additive + restructuring.** Keep the existing `opieka.documents.category.{insurance,license,kreptd,other}`,
`columns.*`, `download`, `delete*`, `uploadedToast`, `deletedToast`, `downloadError`, `uploadButton`. **Remove**
the ADR-banner + company-ADR-category keys (5R.8). Add the following:

**Group headers — `opieka.documents.group.*`:**

| Key | PL | EN |
|---|---|---|
| `company` | "Dokumenty firmowe" | "Company documents" |
| `vehicles` | "Dokumenty pojazdów" | "Vehicle documents" |
| `adrVehicles` | "ADR pojazdów" | "Vehicle ADR" |
| `trailers` | "Dokumenty naczep" | "Trailer documents" |
| `drivers` | "Dokumenty kierowców" | "Driver documents" |

**Vehicle / trailer / driver type labels — `opieka.documents.type.*`** (company types reuse the existing
`category.*` labels; these are the download-only types):

| Key | PL | EN |
|---|---|---|
| `gps` | "Umowa GPS" | "GPS agreement" |
| `agreement` | "Porozumienie" | "Guarantee agreement" |
| `cabotage_de_insurance` | "Ubezpieczenie kabotażowe DE" | "Cabotage insurance DE" |
| `cert_xl` | "Certyfikat XL" | "XL certificate" |
| `driverAdr` | "Świadectwo ADR kierowcy" | "Driver ADR certificate" |

**Count line & owning-entity — `opieka.documents.count.*` (ICU plural):**

| Key | PL | EN |
|---|---|---|
| `files` | "{count, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}" | "{count, plural, one {# file} other {# files}}" |
| `vehicles` | "{count, plural, one {# pojazd} few {# pojazdy} many {# pojazdów} other {# pojazdu}}" | "{count, plural, one {# vehicle} other {# vehicles}}" |
| `trailers` | "{count, plural, one {# naczepa} few {# naczepy} many {# naczep} other {# naczepy}}" | "{count, plural, one {# trailer} other {# trailers}}" |
| `drivers` | "{count, plural, one {# kierowca} few {# kierowców} many {# kierowców} other {# kierowcy}}" | "{count, plural, one {# driver} other {# drivers}}" |
| `summary` | "{files} · {entities}" | "{files} · {entities}" |
| `noFiles` | "Brak plików" | "No files" |
| `adrVehiclesCount` | "{count, plural, one {# pojazd z ADR} few {# pojazdy z ADR} many {# pojazdów z ADR} other {# pojazdu z ADR}}" | "{count, plural, one {# vehicle with ADR} other {# vehicles with ADR}}" |
| `noAdrVehicles` | "Brak pojazdów ADR" | "No ADR vehicles" |

**Column headers — `opieka.documents.columns.*` (additive to existing):**

| Key | PL | EN |
|---|---|---|
| `entityVehicle` | "Pojazd" | "Vehicle" |
| `entityTrailer` | "Naczepa" | "Trailer" |
| `entityDriver` | "Kierowca" | "Driver" |

**Sheet chrome & empty — `opieka.documents.sheet.*` / `.empty.*`:**

| Key | PL | EN |
|---|---|---|
| `empty.title` | "Brak dokumentów" | "No documents" |
| `empty.message` | "Nie przesłano jeszcze dokumentów tego typu." | "No documents of this type have been uploaded yet." |
| `manageInVehicle` | "Zarządzaj w oknie pojazdu." | "Managed in the vehicle window." |
| `manageInTrailer` | "Zarządzaj w oknie naczepy." | "Managed in the trailer window." |
| `manageInDriver` | "Zarządzaj w oknie kierowcy." | "Managed in the driver window." |
| `uploadHint` | "Prześlij dokument dla tej kategorii." | "Upload a document for this category." |
| `openAria` | "Otwórz listę: {type}" | "Open list: {type}" |

> `common.close` (existing) is used for the Sheet footer of download-only types. `uploadHeading`/`categoryLabel`/
> `fileLabel` from the old shared upload card become **dead** (the per-type Sheet has no category select) — remove
> `categoryLabel` + `fileLabel`; `uploadHint` replaces the standalone `uploadHeading`.

### 5R.8 — Explicit removals (web-agent must delete, not leave dead)

| What | Where | Action |
|---|---|---|
| **ADR warning banner** (`adrMissing` block, `TriangleAlert` + amber `bg-warning-bg`) | `CarrierDocumentsTab.tsx` L266-291 | **Delete** the entire block + the `adrMissing`/`hasAdr` derivation. |
| **`hasAdrVehicle` prop + derivation** | `page.tsx` L120-127 passes it; `Props.hasAdrVehicle` | **Delete** — no longer consumed. (The vehicle ADR *display* section derives from `vehiclesQ` directly, not a boolean prop.) |
| **`adr` company category** | `CATEGORIES` array (L56-62), `category` state default `'adr'` (L93-95), `category.adr` label, `adrExistsHint`/`adrExistsToast`/`adrDuplicateBlocked`/409-handling, `adrMissingTitle`/`adrMissingMessage` i18n | **Delete** `adr` from `CATEGORIES` → `['insurance','license','kreptd','other']`; drop the single-ADR duplicate guard entirely; remove those i18n keys from `pl.json` + `en.json`. |
| **Shared upload card + category `<Select>`** | L293-341 | **Replace** — upload moves into the company-type Sheet footer; the `<Select>` is gone (type implicit). |
| **Flat company-only `<DataTable>`** | L343-356 | **Replace** with the type-catalog grid; the file table survives *inside* the Sheet. |
| **`<Badge variant="warning">ADR`** for the ADR display | (new code) | Use `<Badge variant="muted">` for `adrClasses` chips — no warning tone in this tab. |

> **`adrDocReminderToast`** (`vehicles.adrDocReminderToast`, "…pamiętaj, aby dodać dokument ADR przewoźnika…")
> becomes semantically stale (there is no carrier ADR document to add). Flag for removal to the vehicle-modal
> owner; out of scope for this tab but note it so it isn't left misleading users.

### 5R.9 — Components / data summary (web-agent)

| Component | New / changed | File |
|---|---|---|
| `<DocumentTypeCard>` | **new** (composition only — `bg-card`+`border`+`<Badge>`, `<OpiekunCarrierCard>` hover recipe) | `app/(employee)/…/[login]/CarrierDocumentsTab.tsx` (co-located) or `components/opieka/DocumentTypeCard.tsx` |
| `<DocumentTypeSheet>` | **new** (`<Sheet side="right">` + in-Sheet `<DataTable>` + conditional upload/delete footer) | co-located in `CarrierDocumentsTab.tsx` |
| `CarrierDocumentsTab.tsx` | **rewritten** — catalog grid over the 5 groups; drops banner + shared upload + flat table | same path |
| `page.tsx` | **changed** — remove `hasAdrVehicle` prop pass-down (keep the vehicles/drivers/trailers queries; the tab now consumes their `attachments[]`) | `…/[login]/page.tsx` |
| Data source | **no new API** — `vehiclesQ`/`driversQ`/`trailersQ` `attachments[]` + `useCarrierAttachments`; downloads via existing per-entity endpoints | — |

**Tokens added/changed: none.** `bg-card` / `border` / `shadow-card` / `bg-brand-50` / `brand/40` / `text-sub` /
`bg-input` / `<Badge variant="muted">` — all pre-existing.

### 5R.10 — Acceptance checklist (Phase 5-rework)

- [ ] **No warnings anywhere in the tab** — grep confirms no `TriangleAlert`, no `bg-warning`, no `adrMissing*`
      in `CarrierDocumentsTab.tsx`; every zero-file state is neutral `text-text-sub` / `<EmptyState>` default tone.
- [ ] **Company-ADR fully gone** — `CATEGORIES` = `['insurance','license','kreptd','other']`; `adrExists*` /
      `adrMissing*` i18n keys removed from `pl.json` **and** `en.json`; `hasAdrVehicle` prop deleted from `Props`
      and `page.tsx`.
- [ ] **5 groups render** in fixed order (company / vehicles / adrVehicles / trailers / drivers) with headers;
      each file-bearing type is a clickable `<DocumentTypeCard>` opening the `<Sheet>`; «ADR pojazdów» is a
      **non-clickable** display card with `<Badge variant="muted">` class chips.
- [ ] **Count lines** use the ICU plural keys («3 pliki · 2 pojazdy»); zero → neutral «Brak plików».
- [ ] **Sheet file `<DataTable>`** shows the owning-entity column (plate/registration/name), fileName, size,
      uploadedAt, download; **company types** additionally show delete + the scoped upload footer (no category
      `<Select>`); **download-only types** show a manage-elsewhere note and no `<FileUpload>`.
- [ ] **Download** reuses the authenticated-bytes anchor; spinner + `disabled` while fetching; `toast.error` on
      failure.
- [ ] **Delete** (company only) uses the existing confirm `<Dialog>`; brand-red confirm; list refetches.
- [ ] **Loading** = card-shaped skeleton grid (no bare spinner); Sheet table inherits `<DataTable isLoading>`.
- [ ] **Mobile** — 1-col grid; full-width Sheet; upload footer stacks; ≥44px touch targets; focus ring on cards.
- [ ] **a11y** — cards are real buttons with `aria-label` (`sheet.openAria`); `<FileText>`/chevron `aria-hidden`;
      Sheet focus-trap + Esc + focus-return inherited; badge chips carry text (class number), not colour-only.
- [ ] **Dark mode** — cards on `bg-card`, muted ADR chips, `bg-input` upload dropzone all AA in dark (§8.6).
- [ ] **Zero new tokens / zero new primitives / zero new API** (§5R.9).

---

## §12 — Guarantee Watchdog (Porozumienie o gwarancji przebiegu)

> **Scope.** The **Guarantee Watchdog** enforces the porozumienie obligation: a guaranteed vehicle must have a
> reported **wyjazd** at least once every **10 Polish working days** after its last **zjazd** (or since the
> guarantee was switched on). The watchdog is a *read-only* surface family — carriers resolve episodes
> **implicitly** by reporting a wyjazd (`POST /delegations`), there are **no manual episode writes**. This section
> is the design contract for the **four** watchdog artefacts and reconciles what shipped in Phase 12 (commit
> `451cc31`) with the new carrier-facing **«Porozumienie»** tab:
>   1. §12.0 the **state → severity** model (the one map every surface obeys — already in `lib/guarantee.ts`);
>   2. §12.1 the **`<GuaranteeCountdownBadge>`** working-days chip (shipped);
>   3. §12.2 the carrier **Wnioski escalation strip** (evolves the shipped `<GuaranteeReminderBanner>`);
>   4. §12.3 the new carrier **«Porozumienie» tab** (`/carrier/porozumienie`) — grouped full-width status **rows** (reworked 2026-07-07, replaces the rejected card grid) + explainer + nav badge;
>   5. §12.4 the opiekun/admin **compliance board** (shipped `<GuaranteeComplianceBoard>`);
>   6. §12.7 the shared **episode-archive** history layout (carrier tab + opiekun drill-down).
>
> **Spec source (data contract):** `packages/shared/src/schemas/guarantee-watchdog.ts` (the three read
> endpoints: `GET /guarantee-compliance`, `…/me`, `GET /guarantee-episodes`) + the pure domain fn
> `computeGuaranteeWatchdog`. The web derivations live in `apps/web/lib/guarantee.ts`.
>
> **HARD: no new tokens** (project no-new-token policy). Everything composes the existing severity semantics
> (`danger` / `warning` / `success` / `muted` / `info`), their `-bg` / `dark:bg-*/10..15` opacity surfaces, the
> `bg-input` soft-chrome, the `bg-info-soft` calm alias (Phase 3.4 § C), the §7.6 SLA attention-section shape,
> and the §7.10.1 `<StatusBadge>` anatomy. **Zero** `tailwind.config.ts` / `globals.css` changes.
>
> **The governing principle — «silence is the good state».** When a carrier owes nothing, the watchdog is quiet:
> the Wnioski strip does **not** render, the nav badge is **hidden**, and the Porozumienie tab greets them with a
> calm all-clear line — never a green «wszystko OK» placeholder screaming for attention (§7.6 empty-state rule).
> Alarm is spent only on what is actually owed.

### §12.0 — The state → severity model (the single source everyone obeys)

The live watchdog reports one of **four** states per vehicle (`GuaranteeWatchdogStatusDto`). Every watchdog UI
maps that state to a **severity tone** through **one** function — `watchdogSeverity()` in `lib/guarantee.ts` — so
the banner, the badge, the cards and the board can never disagree. **Do not re-derive this map in a component.**

| Live state (`item.state`) | Condition | Watchdog severity | Tone family | Meaning |
|---|---|---|---|---|
| `violated` | deadline passed (`daysLeft < 0`) | **`violated`** | `danger` (red) | Obligation broken — a wyjazd is overdue. |
| `counting` + `daysLeft ≤ 3` | counter running, ≤3 wd of room | **`dueSoon`** | `warning` (amber) | Closing in — report soon. |
| `counting` + `daysLeft ≥ 4` | counter running, comfortable room | **`calm`** | `muted` (neutral) | Under observation, nothing owed *yet*. |
| `ok_active` | an active delegation silences the counter | **`none`** | `success` (calm-positive) | In trasie / wyjazd zgłoszony — the good state. |
| `inactive` | no live guarantee (off / not guaranteed) | **`none`** | — (hidden) | Not part of the watchdog. |

- **Owed = `violated` ∨ `dueSoon`** (`isOwed()`). This is the set that raises the carrier's attention (strip +
  nav badge) and populates the opiekun board's action sections.
- **Ordering** everywhere is `compareByUrgency()`: `violated` first (most-negative `daysLeft` on top), then
  `dueSoon` ascending by `daysLeft`. A `null` `daysLeft` sorts last within its group.
- **Urgency is never colour-alone.** Every watchdog surface pairs the tone with a **worded** «N dni robocze» /
  «po terminie» countdown and/or a text state-chip (a11y — same discipline as §7.10.1 `<StatusBadge>`).
- **`ok_active` visibility diverges by audience (LOCKED):** the **opiekun/admin board hides** `ok_active`/`inactive`
  (it is a problem-list, §12.4). The **carrier Porozumienie tab SHOWS `ok_active`** as a calm-positive card
  (§12.3.2) — the carrier deserves to see their compliant, in-trasie vehicles, not just their debts.

### §12.1 — `<GuaranteeCountdownBadge>` (shipped) — the working-days chip

A sibling of §7.6.1's `<SlaCountdownBadge>`: identical chip geometry
(`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap tabular-nums`),
driven by the signed `daysLeft` the API returns. **This is the shipped component — do not restyle it; §12.3/§12.7
reuse it verbatim.**

| `daysLeft` | Label (ICU plural, PL) | Tone classes |
|---|---|---|
| `< 0` | «po terminie» / «{n} dni po terminie» | `bg-danger/15 text-danger border-danger/30` |
| `= 0` | «dziś ostatni dzień» | `bg-warning/15 text-warning border-warning/30` |
| `1 – 3` | «{n} dni robocze» | `bg-warning/15 text-warning border-warning/30` |
| `≥ 4` | «{n} dni robocze» | `bg-input text-text-sub border-border` (soft chrome — a comfortable countdown never looks alarming) |

The `≥ 4` muted variant only appears where a *calm* countdown is welcome — the fleet-row badge, the board's «Pod
obserwacją» rows, and the Porozumienie calm cards; it must **never** appear inside the escalation strip. Overdue
surfaces the magnitude as a positive count so the «dni» plural reads correctly.

### §12.2 — Carrier Wnioski **escalation strip** (evolves the shipped banner)

**What shipped (`<GuaranteeReminderBanner>`):** a roll-up card at the top of `/carrier/claims` listing up to 5
owed vehicles (all `isOwed`, i.e. `daysLeft ≤ 3`) with per-row countdown badges, CTA → `/carrier/delegations/new`.

**What §12 makes it (target — web-agent refactors):** now that the full per-vehicle detail has a **home** (the
Porozumierie tab, §12.3), the Wnioski surface no longer needs to carry the whole list. It becomes a **one-line
escalation strip** — the Wnioski page is for filing claims, so the watchdog only interrupts there when something
is **genuinely urgent**, then points at the tab that owns the detail.

| Aspect | Contract |
|---|---|
| **Visibility (LOCKED)** | Render **only** when at least one owed vehicle is `violated` **or** has `daysLeft ≤ 1`. At `daysLeft` 2–3 the strip stays silent (that lives on the tab + nav badge). Nothing owed / still loading → render **nothing** (silence is good; a phantom red bar that vanishes is worse than a late one). |
| **Tone** | `danger` if any qualifying vehicle is `violated`, else `warning`. Worst-vehicle-wins, same rule as the shipped banner. |
| **Shape** | Single line: `border-l-4` tinted card (`border-danger bg-danger-bg/40 dark:bg-danger/10` or the `warning` equivalent), icon (`<AlertTriangle>` violated / `<Clock>` dueSoon) + one ICU-plural sentence + a trailing link. **No per-vehicle rows** here anymore. `role="region" aria-label`. |
| **Copy (PL / EN)** | «{count, plural, one {# pojazd wymaga} other {# pojazdy wymagają}} pilnego zgłoszenia wyjazdu» / "{count} vehicle(s) need an urgent wyjazd report". |
| **Action (LOCKED)** | Deep-links to **`/carrier/porozumienie`** (the tab that owns the detail), **not** `/carrier/delegations/new`. A `<Link>` styled as a `Button size="sm"` («Przejdź do Porozumień» + `<ArrowRight size={14}/>`, `min-h-[44px]`). The carrier reports the wyjazd from the tab's per-card CTA. |
| **Count basis** | `owed.filter(v => v.state==='violated' || (v.daysLeft ?? 99) <= 1).length`. |

> **Reconciliation note for web-agent.** Keep the shipped component file, but (a) narrow its visibility predicate
> from `isOwed` to the escalation predicate above, (b) collapse the `<ul>` of rows into the single sentence, and
> (c) retarget the CTA to `/carrier/porozumienie`. The `<GuaranteeCountdownBadge>` import can drop from this file
> (the strip carries no per-vehicle badge). All other watchdog surfaces keep the badge.

### §12.3 — Carrier **«Porozumienie» tab** (`/carrier/porozumienie`) — NEW

The carrier's home for the guarantee obligation. One route, three stacked blocks: **(A) per-vehicle status
rows** (grouped, full-width — §12.3.2, *reworked 2026-07-07*), **(B) a static explainer**, **(C) the episode
history** (§12.7). Data: `GET /guarantee-compliance/me` (rows, via `useMyGuaranteeCompliance`) +
`GET /guarantee-episodes` scoped to the carrier (history). Reuses the shipped board/badge vocabulary — **no new
component families**.

#### §12.3.1 — Tab entry + nav attention badge

Add a sixth tab to `<CarrierTabs>`, keeping the emoji-prefix convention (§Phase 3): **🤝 «Porozumienie»**,
`href: '/carrier/porozumienie'`, `matchPrefix: '/carrier/porozumienie'`, `labelKey: 'porozumienie'` (namespace
`carrier.tabs`). Placement: after «Wyjazdy», before «Przebieg» (obligation sits next to the wyjazd flow it drives).

**Attention badge on the tab (LOCKED):**

| Property | Contract |
|---|---|
| **Count** | `summary.violated + summary.dueSoon` from `GET /guarantee-compliance/me` (the two *owed* buckets — matches §12.0 `isOwed`). |
| **Hidden when 0** | No badge, no dot — silence is good. Also hidden while the query is loading (no phantom badge). |
| **Tone** | `danger` if `summary.violated > 0`, else `warning`. Worst-bucket-wins. |
| **Shape** | Tiny numeric pill riding the tab label — reuse the existing `<Badge>` count style used elsewhere on tab counters: `ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold`, tone `bg-danger text-white` / `bg-warning text-white` (solid, high-contrast — a nav badge must read at a glance; this is the one place the watchdog uses a *filled* severity, mirroring existing nav counters). |
| **a11y** | The badge value is announced as part of the tab label via `aria-label` — e.g. «Porozumienie, {count} pilnych» — never colour/number alone. |

The badge shares the `useMyGuaranteeCompliance` cache with the strip and cards, so a reported wyjazd (which
invalidates `GUARANTEE_KEY`) shrinks the badge on the next refetch without a manual refresh.

#### §12.3.2 — Per-vehicle **status rows** (block A) — REWORKED 2026-07-07

> **Why this changed (rejected v1).** The first cut rendered per-vehicle **floating cards** in a
> `sm:grid-cols-2 xl:grid-cols-3` grid, each card carrying its own `<GuaranteeStateChip>`. It shipped and was
> rejected for four concrete reasons: **(1)** long PL state labels («Zbliża się termin», «W trasie / wyjazd
> zgłoszony») **overflowed the card's right edge**; **(2)** the **muted-gray calm chip** («Pod obserwacją») read as
> flat gray-on-gray; **(3)** the internal **`sideNumber` leaked** to the carrier (incl. the «· —» dash placeholder);
> **(4)** the **card-grid layout itself** looked broken — one lone card in a row, three cramped in the next, floating
> over a wide empty canvas that scaled badly with fleet size. **The fix adopts the opiekun board's stacked-row
> format** (§12.4 — the row style the user has seen and not complained about) for the carrier surface too: one
> **full-width, single-column list of grouped rows** that fills the content column identically whether the carrier
> has 1 vehicle or 20.

**Structure — grouped sections of full-width rows, not cards.** Each non-empty group is one `<Card>`; **the group
header carries the state** (tone + worded label + count). Because the state is named once, in the header, the
individual rows need **no per-row state chip** — this is what structurally kills the v1 overflow *and* the ugly gray
calm chip at once (there is no long PL state string competing for width inside a row's budget). `<GuaranteeStateChip>`
is **retired** (§12.8). The a11y rule of §12.0 (state is worded + icon'd, never colour-alone) is satisfied by the
group header. Groups, order, and the calm all-clear line are **unchanged** from v1:

| Group (order) | Contains | Header tone | Header icon | Section header copy (PL / EN) |
|---|---|---|---|---|
| 1. Po terminie | `violated` | `danger` (`text-danger`) | `<AlertTriangle>` | «Po terminie» / "Overdue" |
| 2. Zbliża się termin | `dueSoon` (`counting`, `daysLeft ≤ 3`) | `warning` (`text-warning`) | `<Clock>` | «Zbliża się termin» / "Due soon" |
| 3. Pod obserwacją | `calm` (`counting`, `daysLeft ≥ 4`) | `muted` (`text-text-sub`) | `<Eye>` | «Pod obserwacją» / "Watched" |
| 4. W trasie | `ok_active` | `success` (`text-success`) | `<Truck>` | «W trasie / wyjazd zgłoszony» / "On the road / reported" |

When groups 1–2 are empty, the tab opens with a **calm all-clear line** at the top (reuse the board's card:
`<CheckCircle2 className="text-success"/>` + «Wszystkie pojazdy w porządku — nic nie wymaga zgłoszenia»), and
groups 3–4 follow below. Never show an empty red/amber shell.

**Group-section anatomy** (one `<Card>` per non-empty group — mirrors the §12.4 board section):

```
<Card class="overflow-hidden">
  {/* group header — the ONLY place the state is named (tone + worded label + count) */}
  <div class="flex items-center gap-2 px-4 py-2.5 border-b border-border">
    <GroupIcon class="{severity-text} shrink-0" size={16} />
    <span class="text-xs font-bold uppercase tracking-wide {severity-text}">{groupLabel}</span>
    <Badge variant="{severity}" class="ml-auto">{group.length}</Badge>
  </div>
  {/* rows — divided, full-width, one per vehicle */}
  <ul class="divide-y divide-border">
    {group.map(v => <GuaranteeStatusRow vehicle={v} />)}
  </ul>
</Card>
```

**Row anatomy** (`<GuaranteeStatusRow>` — replaces the retired `<GuaranteeStatusCard>`; reuses §12.2 tinted-surface
tokens, no new tokens):

```
<li class="flex flex-col gap-3 border-l-4 {row-border} {row-bg} px-4 py-3
           sm:flex-row sm:items-center">
  {/* identity + meta — grows, truncates; NO sideNumber (carrier never sees internal designation) */}
  <div class="min-w-0 flex-1">
    <span class="font-mono font-semibold text-text">{plateNumber}</span>
    <p class="mt-0.5 text-xs text-text-sub tabular-nums truncate">{metaLine}</p>
  </div>
  {/* right cluster — never shrinks, never overflows */}
  <div class="flex items-center gap-2 shrink-0 max-sm:justify-end">
    <GuaranteeCountdownBadge daysLeft={daysLeft} />   {/* omitted for ok_active */}
    <Link href="/carrier/delegations/new?vehicleId={id}">
      <Button size="sm" variant={okActive ? 'outline' : 'default'}
              class="min-h-[44px] whitespace-nowrap">
        Zgłoś wyjazd <ArrowRight size={14}/>
      </Button>
    </Link>
  </div>
</li>
```

| Element | Contract |
|---|---|
| **Left border + row bg (severity)** | `violated` → `border-danger` + `bg-danger-bg/30 dark:bg-danger/10`; `dueSoon` → `border-warning` + `bg-warning-bg/30 dark:bg-warning/10`; `calm` → `border-border` + **plain `bg-card`** (quiet — no gray fill, the fix for the rejected gray chip); `ok_active` → `border-success` + plain `bg-card`. Worst-wins tint family, same as the strip and board. |
| **Identity** | `plateNumber` only (`font-mono font-semibold text-text`). **`sideNumber` is NEVER rendered on this surface** (nor the «· —» dash) — see the gating rule below. Carrier name is redundant (own fleet) and omitted. |
| **Meta line** | Anchor + deadline joined by « · », one truncating line: `anchorSource === 'zjechal'` → «ostatni zjazd: {DD.MM.YYYY} · termin: {DD.MM.YYYY}»; `anchorSource === 'agreement'` → «od włączenia gwarancji: {DD.MM.YYYY} · termin: {DD.MM.YYYY}». For `ok_active`: «w trasie» (+ departure date if known) — **no deadline** (counter paused). `text-xs text-text-sub tabular-nums truncate`. |
| **Countdown badge** | `<GuaranteeCountdownBadge daysLeft>` (§12.1, verbatim). Omitted for `ok_active`. The `≥4` (calm) variant renders its soft-chrome `bg-input text-text-sub` here — the calm group's only accent, quiet by design. |
| **CTA (per row — KEPT)** | «Zgłoś wyjazd» → `/carrier/delegations/new?vehicleId={id}` — the form preselects that tractor once the fleet has loaded (overrides a stored draft's vehicle, other draft fields stay; an id not in the active fleet is ignored silently; «Wyczyść» does not re-apply it). `Button size="sm"`, `min-h-[44px]` touch target, `whitespace-nowrap`. Shown on **every** row incl. `ok_active` (a carrier may report the next wyjazd early) — but on `ok_active` render it `variant="outline"` so it recedes (nothing owed). |
| **Loading** | Per-group `<Skeleton>` rows (reuse the board skeleton shape), don't block the page. |

**sideNumber gating (LOCKED — carrier never, opiekun keeps):** the `sideNumber` is the **internal MAGTRANS
designation** and must **never** reach a carrier-facing surface. `<GuaranteeStatusRow>` is a **carrier-only**
component — it has **no side-number slot at all** (do not add a prop; there is nothing to gate — the field is simply
absent). The opiekun/admin `<GuaranteeComplianceBoard>` (§12.4) is a **separate** component and **keeps** `sideNumber`
in its rows (supervisor info). The **shared** `<GuaranteeEpisodeHistory>` (§12.7) is the one component used by both
audiences — there the field is gated by a prop (§12.7). See also §12.8 for the fleet-panel column removal.

**Overflow rules (the load-bearing fix for feedback #1):**
- The identity/meta column is `min-w-0 flex-1`; the meta line uses `truncate` — a long carrier/date string clips with
  an ellipsis, it can **never** push the row wider. `min-w-0` is mandatory (without it a flex child refuses to shrink
  below its content and the row overflows — the exact v1 failure).
- The right cluster is `shrink-0`: the countdown pill (`whitespace-nowrap`, §12.1) and the CTA (`whitespace-nowrap`)
  hold their intrinsic width and are never compressed or wrapped mid-word.
- The plate never truncates (short, mono).
- Because the **state label lives in the group header, not the row**, no long PL state string is ever rendered inside
  a row's width budget — overflow like v1's is structurally impossible.

**Responsive:** always **one full-width single column of group `<Card>`s** — no grid, ever (the rejected v1 grid is
gone). Each row is horizontal on `sm+` (`sm:flex-row sm:items-center`) and **stacks on mobile** (`flex-col`): the meta
line sits on top and the right cluster becomes a full-width footer (`max-sm:justify-end`), CTA keeping `min-h-[44px]`.
No horizontal scroll at any width. This layout fills the content column consistently for **any** fleet size (1 → 20+).

#### §12.3.3 — Static explainer (block B) — the porozumienie rules

A calm, **info-toned** (never `warning`) block that states the obligation. Placed **between** the cards and the
history so a first-time carrier can learn the rules without hunting. Reuse the Phase 9 §9.3 calm-explainer recipe
(`bg-info-soft dark:bg-sky-950/40 border border-border rounded-[10px] px-4 py-3`) with an `<Info size={16}
className="text-text-sub"/>` lead icon; **not** an alarm band.

Content — a titled `<ul>` of four rules (i18n `guarantee.porozumienie.explainer.*`):

| # | PL | EN |
|---|---|---|
| title | «Jak działa porozumienie o gwarancji» | "How the guarantee agreement works" |
| 1 · obligation | «Po każdym zjeździe zgłoś kolejny wyjazd w ciągu **10 polskich dni roboczych**.» | "After each return, report the next wyjazd within **10 Polish working days**." |
| 2 · reminders | «Przypomnienia wysyłamy na **3 dni** i **1 dzień** przed terminem.» | "Reminders are sent **3 days** and **1 day** before the deadline." |
| 3 · what silences | «Aktywny wyjazd **zatrzymuje** licznik — w trasie nic nie musisz robić.» | "An active wyjazd **pauses** the counter — nothing to do while on the road." |
| 4 · what restarts | «Zjazd pojazdu **restartuje** licznik od nowa (10 dni roboczych).» | "A vehicle's return **restarts** the counter (10 working days)." |

Static content — no data fetch, no interactivity (a `<details>`/collapse is web-agent's option if vertical space
is tight, defaulting **open** on first visit).

### §12.4 — Opiekun / admin **compliance board** (shipped `<GuaranteeComplianceBoard>`)

The problem-list for supervisors. **One** component for both roles (API scopes rows server-side: admin → all
carriers, opiekun → supervised carriers only — no role branching in the UI). This is the shipped
`<GuaranteeComplianceBoard>`; documented here for completeness and continuity — **no redesign**.

- **KPI strip** (3 tiles, §Phase 5.2 `<KpiCard>`): «Po terminie» (`danger`, `summary.violated`) · «Zbliża się
  termin» (`orange`, `summary.dueSoon`) · «Pod obserwacją» (`neutral`, the calm-counting count). When a
  search/filter is active the tiles reflect the filtered view.
- **Filter row:** search (plate ∨ carrier name) + a state `<Select>` (all / violated / dueSoon / watched).
- **Three severity sections** (mirroring §7.6.2 `<SlaAttentionSection>`): **Po terminie → Zbliża się termin → Pod
  obserwacją**, most-urgent-first, each a `<Card>` with a tinted left-border row list + `<GuaranteeCountdownBadge>`.
  `ok_active`/`inactive` are **filtered out entirely** (they live in the per-carrier fleet views, not here).
- **«Pod obserwacją» is opt-in** when unfiltered (a «Pokaż wszystkie ({n})» button) so the board stays focused on
  what needs action.
- **All-clear:** when nothing is owed across every in-scope carrier, the whole board collapses to **one calm
  card** (`<CheckCircle2 className="text-success"/>` + «all clear») — never an empty red/amber shell. A filter that
  matched nothing shows the distinct `<EmptyState>` (`<SearchX>`), with a clear-filters action.
- **Row deep-link:** each row links to the opiekun drill-down «Porozumienia» tab
  (`/employee/opieka/carriers/[login]?tab=porozumienia&vehicleId=…`), where the per-vehicle detail + episode
  history (§12.7) live. `login` is resolved client-side from the cached opiekun-fleet response.

### §12.7 — Episode-archive **history** layout (shared: carrier tab + opiekun drill-down)

The durable violation journal (`GET /guarantee-episodes`, `useGuaranteeEpisodes`). Rendered as block **C** of the
carrier Porozumienie tab (scoped to the carrier's own fleet, server-side) **and** on the opiekun drill-down
«Porozumienia» tab (scoped to one carrier/vehicle). **One `<GuaranteeEpisodeHistory>` component, all states
shown, newest first, cursor «load more».**

| Aspect | Contract |
|---|---|
| **States shown** | **All** — `warning`, `violated`, `resolved` (unlike the live board, the archive is a full record, not a to-do). |
| **Order** | Newest first (server returns descending; the list preserves it). |
| **Pagination** | Cursor «load more» — `useGuaranteeEpisodes` with `nextCursor`; a `<Button variant="outline">` «Załaduj więcej» appends the next page. No infinite-scroll (deterministic, mobile-friendly). |
| **Layout** | Mobile-first **stacked list** of rows (not a wide DataTable — the carrier tab is card-shaped and mobile-second-class). Each row: `rounded-md border border-border bg-card px-3 py-2`. On `sm+` it may relax into aligned columns, but the stacked shape is the baseline. |
| **Empty** | `<EmptyState>` (calm, `<History>`/`<CheckCircle2>` icon) — «Brak historii — żaden termin nie został jeszcze przekroczony» / "No history yet". Silence-is-good tone, never alarming. |
| **Loading** | 3 `<Skeleton>` rows. |

**Row content** (per `GuaranteeEpisodeDto`):

| Slot | Source | Rendering |
|---|---|---|
| State pill | `episode.state` | §7.10.1 `<StatusBadge>` anatomy — `warning` «Ostrzeżenie» · `danger` «Po terminie» (`violated`) · `success` «Rozwiązane» (`resolved`). Text + colour, never colour-alone. |
| Anchor | `anchorAt` + `anchorSource` | «od {DD.MM.YYYY}» with the §12.3.2 wording («ostatni zjazd» / «od włączenia gwarancji»). `text-xs text-text-sub tabular-nums`. |
| Deadline | `deadlineAt` | «termin: {DD.MM.YYYY}». |
| Resolution | `resolvedAt` + `resolvedReason` | Shown only when `state === 'resolved'`: «rozwiązano {DD.MM.YYYY} · {reason}» where reason maps `wyjazd` → «Zgłoszono wyjazd» · `agreement_off` → «Gwarancja wyłączona» · `vehicle_inactive` → «Pojazd nieaktywny». |
| Reminders (opiekun only, optional) | `reminder3SentAt` / `reminder1SentAt` / `violationSentAt` | On the opiekun drill-down, a muted micro-line «przypomnienia: D-3 ✓ · D-1 ✓» helps supervisors see what fired. Omit on the carrier tab (noise). |

**Identity + sideNumber gating (LOCKED — `<GuaranteeEpisodeHistory>` is the shared component).** Because this one
component renders on **both** the carrier tab and the opiekun drill-down, the internal `sideNumber` is gated by a
prop, **defaulting off** so it can never leak by omission:

| Prop | Default | Carrier tab | Opiekun drill-down |
|---|---|---|---|
| `showSideNumber?: boolean` | `false` | **`false`** — rows show **`plateNumber` only** (mono) as identity; `sideNumber` (and the «· —» dash when absent) is **never rendered**; carrier name omitted (own fleet). | **pass `showSideNumber`** — rows may show `plateNumber · sideNumber` and the carrier name (multi-vehicle supervisor context). |

Recommendation for the carrier tab: **one combined feed** under block C with the `plateNumber` shown per row (a
carrier has few vehicles). The `sideNumber` and carrier-name columns exist **only** on the opiekun surface.

### §12.8 — Components / i18n / acceptance summary

| Change | Where | Owner |
|---|---|---|
| `<GuaranteeReminderBanner>` → **escalation strip** (narrow visibility to `violated ∨ daysLeft ≤ 1`, collapse rows to one line, retarget CTA → `/carrier/porozumienie`) | `components/carrier/GuaranteeReminderBanner.tsx` | web-agent |
| `<CarrierTabs>` += 🤝 «Porozumienie» tab + attention badge (`summary.violated + summary.dueSoon`, hidden at 0) | `components/carrier/CarrierTabs.tsx` | web-agent |
| **New** `/carrier/porozumienie` page (grouped status **rows** §12.3.2 + explainer §12.3.3 + history §12.7) | `app/(carrier)/carrier/porozumienie/…` | web-agent |
| ~~`<GuaranteeStateChip>`~~ **RETIRED (rework 2026-07-07)** — the state is carried by the group-section header (tone + worded label + count); there is **no per-row state chip**. Do not build/keep this component. | — | — |
| **New** `<GuaranteeStatusRow>` (per-vehicle **row**, §12.3.2 — replaces the rejected `<GuaranteeStatusCard>` grid; full-width, no `sideNumber`, right-cluster countdown + «Zgłoś wyjazd») + a trivial grouped-section `<Card>` wrapper (header names the state) | `components/guarantee/` | web-agent |
| **New** `<GuaranteeEpisodeHistory>` (§12.7 cursor list, shared carrier + opiekun drill-down) — **`showSideNumber` prop, default `false`**; carrier never passes it, opiekun opts in | `components/guarantee/` | web-agent |
| Reuse verbatim: `<GuaranteeCountdownBadge>`, `<GuaranteeComplianceBoard>`, `useMyGuaranteeCompliance` / `useGuaranteeCompliance` / `useGuaranteeEpisodes` (share `GUARANTEE_KEY` cache) | existing | — |
| i18n: `carrier.tabs.porozumienie`, `guarantee.strip.*`, `guarantee.tab.*` / `guarantee.porozumienie.*` (cards, groups, explainer), `guarantee.episodes.*` (state pills, resolve reasons, load-more, empty) | `messages/{pl,en}.json` | web-agent |
| **0** changes to `tailwind.config.ts` / `globals.css`; **0** new colour/badge variants | — | — |

**i18n additions (PL default + EN)** — new keys web-agent must add:

| Key | PL | EN |
|---|---|---|
| `carrier.tabs.porozumienie` | «Porozumienie» | "Agreement" |
| `guarantee.strip.title` | «{count, plural, one {# pojazd wymaga} other {# pojazdy wymagają}} pilnego zgłoszenia wyjazdu» | "{count} vehicle(s) need an urgent wyjazd report" |
| `guarantee.strip.cta` | «Przejdź do Porozumień» | "Go to Agreement" |
| `guarantee.tab.badgeAria` | «Porozumienie, {count} pilnych» | "Agreement, {count} urgent" |
| `guarantee.porozumienie.allClear` | «Wszystkie pojazdy w porządku — nic nie wymaga zgłoszenia» | "All vehicles in order — nothing to report" |
| `guarantee.porozumienie.group.violated` | «Po terminie» | "Overdue" |
| `guarantee.porozumienie.group.dueSoon` | «Zbliża się termin» | "Due soon" |
| `guarantee.porozumienie.group.watched` | «Pod obserwacją» | "Watched" |
| `guarantee.porozumienie.group.okActive` | «W trasie / wyjazd zgłoszony» | "On the road / reported" |
| ~~`guarantee.porozumienie.chip.violated`~~ | *retired 2026-07-07 — state now shown in the group header only; reuse `…group.violated`* | — |
| ~~`guarantee.porozumienie.chip.dueSoon`~~ | *retired — reuse `…group.dueSoon`* | — |
| ~~`guarantee.porozumienie.chip.watched`~~ | *retired — reuse `…group.watched`* | — |
| ~~`guarantee.porozumienie.chip.okActive`~~ | *retired — reuse `…group.okActive`* | — |
| `guarantee.porozumienie.anchor.zjechal` | «ostatni zjazd: {date}» | "last return: {date}" |
| `guarantee.porozumienie.anchor.agreement` | «od włączenia gwarancji: {date}» | "since guarantee start: {date}" |
| `guarantee.porozumienie.deadline` | «termin: {date}» | "deadline: {date}" |
| `guarantee.porozumienie.reportCta` | «Zgłoś wyjazd» | "Report wyjazd" |
| `guarantee.porozumienie.explainer.title` | «Jak działa porozumienie o gwarancji» | "How the guarantee agreement works" |
| `guarantee.porozumienie.explainer.obligation` | «Po każdym zjeździe zgłoś kolejny wyjazd w ciągu 10 polskich dni roboczych.» | "After each return, report the next wyjazd within 10 Polish working days." |
| `guarantee.porozumienie.explainer.reminders` | «Przypomnienia wysyłamy na 3 dni i 1 dzień przed terminem.» | "Reminders are sent 3 days and 1 day before the deadline." |
| `guarantee.porozumienie.explainer.silence` | «Aktywny wyjazd zatrzymuje licznik — w trasie nic nie musisz robić.» | "An active wyjazd pauses the counter — nothing to do on the road." |
| `guarantee.porozumienie.explainer.restart` | «Zjazd pojazdu restartuje licznik od nowa (10 dni roboczych).» | "A vehicle's return restarts the counter (10 working days)." |
| `guarantee.episodes.title` | «Historia» | "History" |
| `guarantee.episodes.state.warning` | «Ostrzeżenie» | "Warning" |
| `guarantee.episodes.state.violated` | «Po terminie» | "Overdue" |
| `guarantee.episodes.state.resolved` | «Rozwiązane» | "Resolved" |
| `guarantee.episodes.reason.wyjazd` | «Zgłoszono wyjazd» | "Wyjazd reported" |
| `guarantee.episodes.reason.agreement_off` | «Gwarancja wyłączona» | "Guarantee switched off" |
| `guarantee.episodes.reason.vehicle_inactive` | «Pojazd nieaktywny» | "Vehicle inactive" |
| `guarantee.episodes.resolvedAt` | «rozwiązano {date} · {reason}» | "resolved {date} · {reason}" |
| `guarantee.episodes.loadMore` | «Załaduj więcej» | "Load more" |
| `guarantee.episodes.empty` | «Brak historii — żaden termin nie został jeszcze przekroczony» | "No history yet — no deadline has been missed" |

### §12.9 — Acceptance checklist (§12, web-agent)

- [ ] **Severity model.** Every surface derives tone via `watchdogSeverity()` / `isOwed()` / `compareByUrgency()`
      from `lib/guarantee.ts` — no re-derived maps. `ok_active` hidden on the board, **shown** on the carrier tab.
- [ ] **Countdown badge** unchanged (§12.1); reused by cards + history; `≥4` stays muted `bg-input`, never in the strip.
- [ ] **Wnioski strip** renders only for `violated ∨ daysLeft ≤ 1`; one line, no per-vehicle rows; CTA →
      `/carrier/porozumienie`; nothing owed / loading → renders nothing.
- [ ] **Nav badge** = `summary.violated + summary.dueSoon`; hidden at 0 and while loading; `danger` if any violated
      else `warning`; announced in the tab `aria-label`.
- [ ] **Porozumienie status rows (REWORKED — no card grid).** Full-width single column of grouped `<Card>` sections
      (Po terminie → Zbliża się → Pod obserwacją → W trasie), **no `grid-cols`**; the **group header** carries the
      state (tone + worded label + count) — **no per-row `<GuaranteeStateChip>`** (retired). Each row: `plateNumber`
      only (**no `sideNumber`, no «· —»**), truncating meta line (anchor · deadline; deadline omitted on ok_active),
      right-cluster countdown (omitted on ok_active) + «Zgłoś wyjazd» CTA (`outline` + no urgency on ok_active);
      `min-w-0 flex-1` + `truncate` on meta, `shrink-0` right cluster → **no overflow at any width**; stacks on
      mobile; ≥44px touch; per-group skeletons; calm all-clear line when no owed groups.
- [ ] **sideNumber never reaches the carrier.** Absent from status rows, from `<GuaranteeEpisodeHistory>` when
      `showSideNumber` is false (carrier default), and from the CarrierFleetPanel «Auta» table. Opiekun board +
      opiekun drill-down keep it.
- [ ] **Explainer** is `bg-info-soft` calm (NOT warning), 4 rules, static, default-open.
- [ ] **Episode history** shows all states, newest first, cursor «Załaduj więcej»; resolve-reason mapped; calm
      empty state; `<Skeleton>` loading; shared by carrier tab + opiekun drill-down.
- [ ] **Silence-is-good** honoured across all four surfaces (strip, badge, tab all-clear, empty history).
- [ ] **i18n** PL default + EN for every new key; ICU plural on the strip; a11y label on the nav badge.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts` / `globals.css` changes; all surfaces legible in dark
      via `dark:bg-*/10..15` / `dark:text-*`; cards `bg-card`, soft chrome `bg-input`, explainer `bg-info-soft`.

---

## §13 — Fleet forms rework: Sheet → centered `<FormDialog>` (2026-07-08)

> **Approved decision (user):** replace the three right-side `<Sheet>` fleet forms — `VehicleSheet.tsx` (~36 fields, 640px), `TrailerSheet.tsx`, `DriverSheet.tsx` — with a **large centered dialog** built on the existing `components/ui/Dialog.tsx`. A full-page route was considered and **rejected** (keeps list context, no new routes). Customer feedback: file-upload scans ate enormous vertical space; forms must be *lakoniczne, podzielone i ładne* (concise, sectioned, pretty).
>
> **Token policy (LOCKED):** zero new tokens. Everything below composes from existing brand palette, `success` / `warning` / `danger` / `info` semantics (+ `-bg` / `-dark`), the radius scale (`rounded-sm` 8 / `rounded-[10px]` input / `rounded` 12 / `rounded-lg` 14 / `rounded-xl` 16), `shadow-modal`, `animate-modal-in`, `animate-slide-in`, and the single-surface `bg-input` policy. No inline-style, no `!important`, no `dark:[style*=…]` overrides.
>
> **Scope note for web-agent:** several sub-sections below introduce **new fields / enums** (fuel-card details, waste countries, edscha, side clearance, XL-cert upload, driver nationality + languages, etc.). Those are **data-model changes owned by shared/db/api agents** — this doc specifies only the *UI, labels, grouping, and validation affordances*. Backend dependencies are collected in §13.9; do not invent DTO shape from this doc.

### §13.1 — `<FormDialog>` shell contract

A new shared shell **`components/forms/FormDialog.tsx`** that **composes** the existing `<Dialog>` primitive (portal, overlay `bg-black/40 backdrop-blur-sm`, focus-restore, Escape-close, `animate-modal-in` are inherited — do **not** re-implement them). The confirm-style `<Dialog>` callers (delete/deactivate) keep their current `max-w-md p-6` behaviour untouched — `<FormDialog>` overrides only via `className` on `<DialogContent>`.

**Why a wrapper, not raw `<DialogContent>`:** `DialogContent` bakes in `max-w-md p-6` and has no header/body/footer bands. `cn()` uses `tailwind-merge`, so passing `max-w-[900px] p-0` on `className` *cleanly overrides* both. The wrapper adds the three structural bands (mirroring `<Sheet>`'s proven `SheetHeader/Body/Footer`) so scroll + sticky footer work.

**Structure:**

```
<Dialog open onOpenChange>
  <DialogContent className="
      w-[calc(100%-2rem)] sm:max-w-[900px]
      max-h-[90dvh] p-0
      flex flex-col overflow-hidden">
    <form className="flex min-h-0 flex-1 flex-col">
      <FormDialogHeader/>   ← shrink-0, sticky top band
      <FormDialogBody/>     ← min-h-0 flex-1 overflow-y-auto  (the ONLY scroller)
      <FormDialogFooter/>   ← shrink-0, sticky bottom band
    </form>
  </DialogContent>
</Dialog>
```

| Band | Tailwind | Notes |
|---|---|---|
| **Content box** | `w-[calc(100%-2rem)] sm:max-w-[900px] max-h-[90dvh] p-0 flex flex-col overflow-hidden` | `p-0` moves padding into the bands so the footer can sit flush. `max-h-[90dvh]` guarantees ~5dvh gutters; the body scrolls, the box never exceeds viewport. `overflow-hidden` clips band corners to the `rounded-xl` (16) already on `DialogContent`. |
| **Header** (`FormDialogHeader`) | `shrink-0 border-b border-border px-6 py-4 pr-12` | `pr-12` clears the `<Dialog>` built-in close `×`. Contains `<DialogTitle>` + entity-context `<DialogDescription>`. |
| **Body** (`FormDialogBody`) | `min-h-0 flex-1 overflow-y-auto px-6 py-5 [overflow-anchor:none] overflow-x-hidden [scrollbar-gutter:stable]` | Copy the anti-shake trio from `SheetBody` verbatim (tall checkbox grids caused scroll shake). Direct child: `space-y-6` section stack. |
| **Footer** (`FormDialogFooter`) | `shrink-0 border-t border-border bg-card px-6 py-3 flex items-center justify-end gap-2` | Validation summary lives here `mr-auto` (left), actions right. |

**Dimensions / breakpoints.** All three forms use **one** width — `sm:max-w-[900px]` — for consistency (the vehicle form is the widest field-count; 900px seats a comfortable 2-column grid with 3–4 col sub-grids for rates/dimensions). Do **not** vary per form.

- **Desktop (≥768 `md`):** 900px box, 2-column field grids active (`FormGrid` already switches at `md:`).
- **Tablet (640–767 `sm`):** 900px cap rarely reached; box is `calc(100%-2rem)`. Field grids still `md:`-gated, so they render **1-column** below 768 — acceptable and intentional (readable stacked forms).
- **Mobile (<640):** full-width-minus-gutter, 1-column, body scrolls. `max-h-[90dvh]` keeps header/footer pinned.

**Header — title + entity context.** `<DialogTitle>` = «Nowy pojazd» / «Edytuj pojazd» (`text-lg font-bold text-text leading-tight`, inherited). `<DialogDescription>` = the entity identity in edit mode: `plateNumber` (mono) for pojazd/naczepa, `Imię Nazwisko` for kierowca; `null` on create.

**Sticky footer + validation-summary behaviour.**
- Footer order (LTR): `[validation summary — mr-auto]` … `[Wyczyść]` (create only, `variant="outline" size="sm"`) `[Anuluj]` (`variant="ghost" size="sm"`) `[Zapisz]` (`size="sm"`, label → `common.saving` while pending).
- **Validation summary** = the cross-field / attachment error string (the current `attachmentError` mechanism), rendered `mr-auto text-sm text-danger` with `role="alert"`. Per-field Zod errors stay **inline** under their field (`<FormMessage>`); the footer summary is reserved for *file-required* and *cross-field* rules (e.g. «min. 2 z 3 krajów», «Brak ubezpieczenia kabotażowego»). On submit-with-errors, keep the existing `onInvalidToast(form.setFocus, …)` — focus the first invalid field.

**Section header style.** Reuse the existing `<FormSection title>` component verbatim — `h4.text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border pb-2`, section wrapper `space-y-4`, body stack `space-y-6` between sections. No new heading treatment; no emoji (the legacy section emoji are an anti-pattern — drop them).

**2-column grid rules.**
- Default field layout = `<FormGrid cols={2}>` (existing subgrid-aligned component).
- **Full-width (`className="md:col-span-2"`) when:** `notes`/`Textarea`, any `<MultiSelect>`, any `<FileUpload>` (block or compact), any checkbox-grid, any conditional `RevealInset`, and any single long field (GPS number, GPS umowa upload).
- **`cols={4}`** for the numeric strips: vehicle Stawki (rateDe/Ue/Export/Import) and naczepa Dane podstawowe dimensions.
- **`cols={3}`** for the checkbox grids (special countries, permissions).
- Do **not** attempt a masonry / two-column *section* layout — sections stack full-width; the "wide" feeling comes from the 2-col field grids inside a 900px box. (Lower risk than side-by-side sections; matches the existing `FormGrid` subgrid alignment guarantees in §"Grid-form field alignment".)

### §13.2 — Shared patterns (used by all three forms)

#### §13.2.1 — `RevealInset` — the one conditional-reveal pattern

Every checkbox-gated field group across all three forms renders inside **one** consistent affordance — a **left-accent bordered inset**, so a revealed sub-block reads as *belonging to* the checkbox above it without wasteful `ml-6` indentation.

New tiny component **`components/forms/RevealInset.tsx`** (presentational; parent still owns the `watch()` + mount/unmount):

```
<RevealInset>  →  <div class="
    mt-2 space-y-3 animate-slide-in
    rounded-lg border border-border border-l-2 border-l-brand/50
    bg-input/40 p-3">
```

- Left 2px `border-l-brand/50` accent ties it to the enabling checkbox; `bg-input/40` is a calm inset fill (single-surface policy: still `bg-input`, just softened).
- Reveals with the existing `animate-slide-in` keyframe (no pop, no new keyframe).
- Replaces the current `ml-6 mt-2 animate-slide-in` `<FormItem>` indentation in Vehicle/Driver sheets **and** the ad-hoc `border-brand/40 bg-brand/5` equipment cells in TrailerSheet — one pattern everywhere.
- When a reveal contains **multiple** fields (e.g. fuel card: number + expiry + PIN + status badge), lay them out inside the inset with a nested `<FormGrid cols={2}>`.

#### §13.2.2 — `<FileUpload variant="compact">` — the vertical-footprint fix

Add a `variant?: 'block' | 'compact'` prop to `components/ui/FileUpload.tsx`. `'block'` = today's behaviour (unchanged; keep for any future large-drop context). `'compact'` is the **default for all fleet-form uploads** and is the direct answer to the customer complaint.

**Compact anatomy (single row + inline chips):**

```
Umowa GPS *                                             ← FormLabel (required asterisk)
┌───────────────────────────────────────────────────┐
│ ⬆  Dodaj plik lub upuść  · PDF/JPG/PNG · maks.10MB │  ← strip (the click/drop target), h-10
└───────────────────────────────────────────────────┘
[📄 umowa-gps.pdf ×] [🖼 skan.jpg ×]                      ← chips, wrap inline below strip
```

| Slot | Tailwind | Notes |
|---|---|---|
| **Strip (empty target)** | `flex h-10 w-full items-center gap-2 rounded-[10px] border border-dashed border-border bg-input px-3 text-sm text-text cursor-pointer transition-colors hover:border-brand-200 hover:bg-brand-50/50` | A real `<button type="button">` wrapping the hidden `<input type="file">`. Drag-over → `border-solid border-brand bg-brand-50` (non-colour cue = solid border, reuse block logic). Leading `<UploadCloud size={16} className="text-text-sub"/>`; label `common`-ish prompt (`fileUpload.promptCompact`) + constraints appended in `text-xs text-text-sub` (single line, truncates). |
| **Chip (per file)** | `inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-xs font-medium text-text` | Leading icon `<FileText size={14}/>` (PDF/other) or `<ImageIcon size={14}/>` (image) — **no 40px thumbnail** (that block is what ate height). Filename `truncate max-w-[18ch]` + `title` full name. Trailing remove `<button aria-label>` `inline-flex h-4 w-4 items-center justify-center rounded-full text-text-sub hover:bg-danger-bg hover:text-danger` with `<X size={12}/>` (mirror `<MultiSelect>` chip-remove exactly). |
| **Chip row** | `mt-2 flex flex-wrap gap-1.5` | Chips wrap; total footprint for 1–2 files ≈ strip 40px + one 28px chip row ≈ **68px** vs the old block's ~80px dropzone + 56px-per-row list. |
| **Error chip** | `border-danger/40 bg-danger-bg text-danger` variant of the chip; message via `title`/inline `text-danger` (client-side too-large / wrong-type — same three categories as block). | Stays visible so user dismisses via `×`; never a toast. |

**Single-file compact** (`multiple={false}` — ADR świadectwo, GPS umowa, XL cert, kabotaż scans): once a file exists, the strip is **replaced** by the single chip plus a subtle text-button «Zmień» (`text-xs font-semibold text-brand hover:underline`) that re-opens the picker. Empty → the strip.

**Required-file signalling (compact):**
- `<FormLabel required>` renders the `*` (existing).
- On **submit attempt** with a required-but-empty upload, the strip gets `aria-invalid` + `border-danger` (swap `border-border`→`border-danger`, keep dashed), and a `<FormMessage>` renders below (`fileUpload.required.<category>`). This mirrors the current `attachmentError` flow but moves the visible signal onto the field instead of only the footer. Keep the footer summary too for the cross-cutting cases.
- Clearing the error: any file change resets `aria-invalid` + border (existing `setAttachmentError(null)` hook point).

**Existing-vs-new files (edit mode):** identical chips — the list is one uniform "files attached to this field" set (§1.6 rule preserved). Optional nicety: existing (server) file chips may carry a download affordance (filename is a link), new local files are plain text — but **do not** add a second visual style/badge distinguishing them.

**Read-only / disabled:** compact read-only = chips only (no strip, no `×`, filename is a link). Disabled = strip inert `opacity-50`, chip `×` disabled. Same rules as block §1.7.

#### §13.2.3 — Status & warning affordances

| Affordance | Component / tokens | Usage |
|---|---|---|
| **Fuel-card status badge** | `<Badge variant="success">Karta aktywna</Badge>` / `<Badge variant="danger">Karta zablokowana</Badge>` — existing variants, no new colour. | Rendered inside the fuel-card `RevealInset`, next to the PIN field. **Live-computed**, see rule below. |
| **«Brak skanu porozumienia» soft warning** | Inline line, NOT blocking: `flex items-center gap-1.5 text-xs text-warning-dark dark:text-warning` + `<AlertTriangle size={14} aria-hidden/>`. In table/detail contexts use `<Badge variant="warning">`. | (a) **Form:** inside the porozumienie `RevealInset` when checkbox on + no scan. (b) **Vehicle table:** `<Badge variant="warning">` in the row (agreement=true, scan missing). (c) **VehicleDetailModal:** a warning row in the porozumienie field. One wording, three surfaces. |
| **Inline validation error** | `<FormMessage>` = `text-sm text-danger role="alert"`; input gets `aria-invalid` → `border-danger` (existing `<Input>` behaviour). | Every field-level Zod error, plus the special-countries «min. 2 z 3» rule rendered as a `<FormMessage>` under the checkbox grid, and the counts «min. 3» errors under each count input (existing TrailerSheet pattern). |

**Fuel-card live status rule** (`Karta zablokowana` until BOTH true): `agreement === true` **AND** the porozumienie scan bucket has ≥1 file (existing or new). Compute from `form.watch('agreement')` + porozumienie file bucket length; re-renders live as the operator ticks/uploads. When blocked, show `<Badge variant="danger">Karta zablokowana</Badge>` + a `text-xs text-text-sub` reason line («Wymaga aktywnego porozumienia i wgranego skanu»). When both satisfied → `<Badge variant="success">Karta aktywna</Badge>`.

#### §13.2.4 — `<ActiveStatusRow>` — the distinguished `Aktywny` control (all entity forms)

> **Approved decision (user):** the `active` («Aktywny») flag deactivates the **entire entity** — it is the single most consequential control in the form, yet as a bare inline `<Checkbox>` buried among dozens of equipment/permission checkboxes it reads as just-another-flag (in `VehicleFormDialog` it even sat at the very top of *Dane podstawowe*). Decision: in **all** entity form dialogs it is **lifted out of every `<FormSection>`** and rendered **once, at the very bottom of `<FormDialogBody>`**, as a distinguished bordered status row.

**One pattern, one place.** New tiny presentational component **`components/forms/ActiveStatusRow.tsx`** (parent owns the RHF `register('active')`; the component only renders the row + reads the live checked state for its badge). It is rendered as the **last child of the `space-y-6` stack inside `<FormDialogBody>`**, i.e. **after the final `<FormSection>`** and **not wrapped in a `<FormSection>`** (it is deliberately outside the section rhythm so it visually detaches). Applies to: `VehicleFormDialog`, `TrailerFormDialog`, `DriverFormDialog` (all three), and `CarrierSheet` **edit mode only**.

**Anatomy — full-width bordered row, checkbox + bold label + consequence line + live mirror badge:**

```
┌─────────────────────────────────────────────────────────────┐
│ ☑  Aktywny                                        [Aktywny]  │   ← badge mirrors state
│    Nieaktywny pojazd znika z list wyboru i nie może być …    │   ← consequence subline
└─────────────────────────────────────────────────────────────┘
```

| Slot | Tailwind | Notes |
|---|---|---|
| **Row wrapper** | `flex items-start gap-3 rounded-lg border border-border border-l-2 border-l-brand/50 bg-input/40 p-3` | **Same shell as `RevealInset` §13.2.1** (left-2px `border-l-brand/50` accent, `bg-input/40` calm fill) — the accent reads as *"important status control"*, brand-toned, **not** an error/warning (active is the normal state; do **not** use `danger`/`warning` token sets on the row). Reusing the RevealInset shell keeps the visual language consistent and adds **zero** new tokens. |
| **Checkbox** | existing `<Checkbox {...form.register('active')} />` | Sits in its own leading column; `mt-0.5` self-align to the bold label baseline. Wrap checkbox+label region in a `<label className="flex items-start gap-3 …">` so the whole text is a click target (≥44px effective hit area on tablet). |
| **Label** | `text-sm font-bold text-text` | Bold (heavier than every in-section checkbox label, which are plain `text-sm text-text`) — this weight bump is the primary "this one matters" cue. Copy = existing `<ns>.fields.active` («Aktywny»). |
| **Consequence subline** | `mt-0.5 text-xs text-text-sub` | One line describing the effect of deactivation. Copy = new `formActive.<entity>Consequence` key (PL/EN below). Sits directly under the label. |
| **Live mirror badge** | `<Badge variant="success">Aktywny</Badge>` when checked, `<Badge variant="muted">Nieaktywny</Badge>` when unchecked. `ml-auto shrink-0` — pinned to the row's right edge, top-aligned. | Uses `common.active` / `common.inactive`. **`muted` (not `danger`)** for the off state — a deactivated entity is an ordinary, reversible state, not an error. Re-renders live off `form.watch('active')`. |

**Placement & spacing.** As the last item in the `space-y-6` body stack it inherits the `24px` gap above it (same as between two sections), so it sits clearly separated from the final `<FormSection>` — no extra margin needed. It spans the full body width (no `FormGrid`; the row is inherently full-width). Do **not** add a `<FormSection>` heading above it — the bordered row *is* its own affordance.

**Create-mode behaviour.**
- **Vehicle / Trailer / Driver:** the row **is present** on create; the checkbox defaults **checked** (`getDefaults().active = true`, already the case). New entities are active by default; the operator sees the same distinguished control and may untick it to seed a pre-inactive record.
- **Carrier:** on **create the row is absent entirely** (`CreateCarrierDto` has no `active`; new carriers are always active) — mirror the current `isEdit &&` guard. On **edit** the row renders, defaulted from `carrier.active`.

**Removed from sections.** Delete the bare `Aktywny` checkbox from wherever it currently lives inside a section: `VehicleFormDialog` *Dane podstawowe* (the `<label>` at ~L553–556 — keep `Certyfikat L` there, remove only `active`), the *Notatki* sections of Trailer/Driver, and the `CarrierSheet` *Przypisanie* section (`isEdit && …` block at ~L860–864). The flag is now rendered **only** by `<ActiveStatusRow>` at the body bottom.

**i18n keys (new — add `formActive.*` block at message root; reuse `common`/`<ns>.fields.active`):**

| Key | PL | EN |
|---|---|---|
| `formActive.vehicleConsequence` | «Nieaktywny pojazd znika z list wyboru i nie może być użyty w nowych wyjazdach ani wnioskach.» | "An inactive vehicle disappears from selection lists and can't be used in new departures or claims." |
| `formActive.trailerConsequence` | «Nieaktywna naczepa znika z list wyboru i nie może być użyta w nowych wyjazdach.» | "An inactive trailer disappears from selection lists and can't be used in new departures." |
| `formActive.driverConsequence` | «Nieaktywny kierowca znika z list wyboru i nie może być przypisany do nowych wyjazdów.» | "An inactive driver disappears from selection lists and can't be assigned to new departures." |
| `formActive.carrierConsequence` | «Nieaktywny przewoźnik traci dostęp do panelu, a jego pojazdy i kierowcy znikają z list wyboru.» | "An inactive carrier loses panel access, and its vehicles and drivers disappear from selection lists." |

The label («Aktywny») and badge («Aktywny» / «Nieaktywny») reuse **existing** `common.active` / `common.inactive` and per-namespace `fields.active` — do **not** add duplicate label keys. Only the four `formActive.*Consequence` sublines are new. `<ActiveStatusRow>` takes `label`, `consequence`, and the `register('active')` props as inputs so the same component serves all four entities (the caller passes the right namespace's translations).

### §13.3 — Pojazd (`VehicleSheet` → `VehicleFormDialog`)

Sections top-to-bottom (each a `<FormSection>`):

> ⚠️ **EXTENDED by §17 (2026-09-28).** `Planista` — селект **только при создании**; в edit-режиме поле заблокировано (§6.5.13 Tier A), не входит в `PATCH`, рядом — заявка на передачу и индикатор ожидающей заявки. Читать §17.2.

1. **Dane podstawowe** — `FormGrid cols={2}`: `Nr rej.` (req), `Nr boczny`, `Typ` (select MEGA/STD/COIL, req), `Planista` (select, req — **create only**, §17.2), `Zespół dyspozytorów` (select + live `<TeamMembers>` preview, req), **static `<Badge variant="muted">EURO VI</Badge>`** (the `euro` select is **removed** — see §13.9), `Notatki` (`Textarea`, `md:col-span-2`), `Certyfikat L` (checkbox — kept here as a plain flag). Carrier picker on create (`md:col-span-2`, top). **`Aktywny` is NOT here** — it moves to `<ActiveStatusRow>` at the body bottom (§13.2.4).
2. **Kraje specjalne** — `FormGrid cols={3}` of GB / IT / FR checkboxes (keep the per-flag `text-xs text-text-sub` hint sublines). **Validation: min. 2 z 3** → inline `<FormMessage>` under the grid on submit if fewer than two checked.
3. **Stawki** — `FormGrid cols={4}`: `rateDe` / `rateUe` / `rateExport` / `rateImport` (number, req, `step=0.01 min=0`).
4. **GPS** — `Numer GPS` (optional input). When filled → reveal a **compact required** `<FileUpload multiple={false} variant="compact">` labelled «Umowa GPS» inside a `RevealInset`. (Empty GPS number → no upload.)
5. **Karta paliwowa** — checkbox → `RevealInset` (`FormGrid cols={2}`): `Numer karty` (16 cyfr, masked/`inputMode=numeric`), `Data ważności` (`type=date`), `PIN`, **+ live status badge §13.2.3**.
6. **Porozumienie** — checkbox → `RevealInset`: compact `<FileUpload multiple={false} variant="compact">` «Skan porozumienia». **Soft**: no scan = amber warning (§13.2.3), **does not block Zapisz**.
7. **Odpady** — checkbox → `RevealInset`: `<MultiSelect>` of countries **DE NL AT BE LUX FR GB IT CZ PL**, **min. 1** (inline error).
8. **Kabotaż** — two checkboxes: **DE** → `RevealInset` with **ONE** compact required upload («Ubezpieczenie kabotażowe», required); **FR** → checkbox only (no files).
9. **ADR** — checkbox → `RevealInset`: `<MultiSelect>` klas **1–9**, **min. 1**.
10. **`<ActiveStatusRow>`** (§13.2.4) — last child of the body stack, **after** *ADR*, outside any `<FormSection>`. `formActive.vehicleConsequence`. Present on create (default checked).

Removed from the form: `euro` select (→ static badge), any `airSuspension`-style dead flags. GPS is optional now (was unconditionally-required device id) — **confirm with api-agent** (§13.9).

### §13.4 — Naczepa (`TrailerSheet` → `TrailerFormDialog`)

1. **Dane podstawowe** — `Nr rej.` (req), `Typ naczepy` (select, req), then `FormGrid cols={4}` dims: `Dł. wewn.`, `Szer. wewn.`, `Wys. wewn.`, `Ładowność` — **all WYMAGANE now** (were optional), plus `Boczny prześwit ładunkowy (cm)` — **WYMAGANE** (new field).
2. **Dach** — `Podnoszony` (tak/nie), `Odsuwany` (tak/nie) → when tak, reveal (`RevealInset`) `Edscha` (tak/nie). Model these as checkboxes (tak = checked) for consistency with the rest of the form.
3. **Wyposażenie** — `Kosz paletowy` (checkbox), `Multilock` (checkbox), `Pasy` + liczba, `Maty` + liczba, `Belki zabezpieczające` + liczba. Count inputs reveal inline under their checkbox (keep the existing equipment-cell pattern, restyled to `RevealInset` where a count appears). **All counts min. 3** (inline error under each).
4. **Certyfikat XL** — checkbox → `RevealInset`: compact **required** `<FileUpload multiple={false} variant="compact" accept={pdf}>` «Certyfikat XL (PDF)».
5. **Notatki** — `Textarea` (`md:col-span-2`). **`Aktywny` is NOT here** — it moves to `<ActiveStatusRow>`.
6. **`<ActiveStatusRow>`** (§13.2.4) — last child of the body stack, after *Notatki*, outside any `<FormSection>`. `formActive.trailerConsequence`. Present on create (default checked).

Removed: `airSuspension` / zawieszenie pneumatyczne (§13.9).

### §13.5 — Kierowca (`DriverSheet` → `DriverFormDialog`)

1. **Dane osobowe** — `FormGrid cols={2}`: `Imię` (req), `Nazwisko` (req), `Dokument` (req), `Data ważności prawa jazdy` (`type=date`, req).
2. **Kontakt** — `Telefon 1` (req), `Telefon 2`, `Email`. **Prefiks telefonu jest NIEZALEŻNY od narodowości** — decouple the phone-prefix control from the `homeCountry`/nationality: each phone keeps its own prefix picker (the existing `<MaskedPhoneInput>` `country` prop is driven by a dedicated per-form phone-prefix selector, **not** by Narodowość). Remove the old "country scopes contact fields" coupling.
3. **Narodowość + Języki** — `Narodowość` select (**BY RUS UA PL UZB KRG KZ Inne**) + `Języki komunikacji` `<MultiSelect>` (**PL RU EN UA DE Inne**, min. 1).
4. **ADR** — checkbox → `RevealInset`: `<MultiSelect>` klas **1–9** + compact **required** `<FileUpload multiple={false} variant="compact">` «Świadectwo ADR».
5. **Notatki** — `Textarea` (`md:col-span-2`). **`Aktywny` is NOT here** — it moves to `<ActiveStatusRow>`.
6. **`<ActiveStatusRow>`** (§13.2.4) — last child of the body stack, after *Notatki*, outside any `<FormSection>`. `formActive.driverConsequence`. Present on create (default checked).

**Carrier note (`CarrierSheet`, edit mode only).** The `Aktywny` checkbox currently in the *Przypisanie* section (`isEdit &&` block) moves to `<ActiveStatusRow>` at the body bottom, `formActive.carrierConsequence`. On **create the row is absent** (no `active` in `CreateCarrierDto`).

### §13.6 — Acceptance checklist (§13, web-agent)

- [ ] `<FormDialog>` composes `<Dialog>` (portal/overlay/focus/Escape/`animate-modal-in` inherited — not re-implemented); confirm-style `<Dialog>` callers unchanged.
- [ ] Box: `sm:max-w-[900px]`, `max-h-[90dvh]`, `p-0`, `flex flex-col overflow-hidden`; **body is the only scroller** with the `[overflow-anchor:none] overflow-x-hidden [scrollbar-gutter:stable]` anti-shake trio; footer stays pinned.
- [ ] Header shows title + entity context (plate / name) in edit, none on create; `pr-12` clears the close `×`.
- [ ] Footer: validation summary `mr-auto text-danger role=alert`; `[Wyczyść (create)] [Anuluj] [Zapisz]`; `onInvalidToast` focuses first invalid field.
- [ ] Field grids: default `cols={2}`; `cols={4}` for Stawki + naczepa dims; `cols={3}` for checkbox grids; `md:col-span-2` for notes / MultiSelect / FileUpload / RevealInset.
- [ ] Below `md`, grids render 1-column and remain readable; mobile box is `calc(100%-2rem)`.
- [ ] `RevealInset` is the **single** conditional-reveal pattern in all three forms (left-accent inset, `animate-slide-in`); no `ml-6` indentation, no ad-hoc `bg-brand/5` cells.
- [ ] `<FileUpload variant="compact">` used for **every** fleet upload; footprint for 1–2 files ≈ ≤70px (strip + one chip row); **no 40px thumbnail**.
- [ ] Compact required upload: `*` on label + on-submit `aria-invalid`/`border-danger` on strip + `<FormMessage>` below; clears on file change.
- [ ] Single-file compact collapses to one chip + «Zmień» once a file exists.
- [ ] Fuel-card badge live-computes `Karta zablokowana` until `agreement && porozumienieScan≥1`, else `Karta aktywna`; reason subline when blocked.
- [ ] «Brak skanu porozumienia» = amber, **non-blocking**, identical wording in form / table / detail modal.
- [ ] `<ActiveStatusRow>` (§13.2.4) is the **single** `Aktywny` control in all four forms: rendered **once as the last child of `<FormDialogBody>`'s `space-y-6` stack, outside any `<FormSection>`**; no bare `active` checkbox survives inside any section.
- [ ] Row uses the RevealInset shell (`border-l-2 border-l-brand/50 bg-input/40 p-3`), bold `text-sm font-bold` label, `text-xs text-text-sub` consequence subline, and a live `ml-auto` mirror badge (`success:Aktywny` / `muted:Nieaktywny`) — **brand accent, no danger/warning tokens**; whole text region is a `<label>` click target.
- [ ] Create mode: Vehicle/Trailer/Driver show the row **defaulted checked**; **Carrier create omits the row entirely** (present in edit only).
- [ ] i18n: reuses `common.active`/`common.inactive` + `<ns>.fields.active`; only four new `formActive.*Consequence` sublines added (PL default + EN).
- [ ] Pojazd: EURO shown as static `<Badge>EURO VI</Badge>` (select gone); Kraje specjalne enforce min. 2 z 3 inline; Odpady/ADR multi-selects enforce min. 1; Kabotaż DE = one required upload (ubezpieczenie; DE permit scan dropped 2026-07-10), FR = checkbox only.
- [ ] Naczepa: dims + ładowność + boczny prześwit required; Dach→Odsuwany→Edscha reveal chain; counts min. 3; XL cert required PDF; airSuspension gone.
- [ ] Kierowca: phone prefix independent of Narodowość; Narodowość select + Języki multi-select (min. 1); ADR reveals classes multi-select + required świadectwo.
- [ ] Dark mode: all bands / inset / chips / strip legible via existing tokens; no `dark:[style*=…]`, no inline style, no `!important`.
- [ ] Touch: strip ≥40px tall, chip `×` and any icon buttons meet ≥44px hit area via padding on tablet.
- [ ] Zero new tokens; zero `tailwind.config.ts` / `globals.css` changes.

### §13.7 — Component inventory changes

| Component | Change | File |
|---|---|---|
| `<FormDialog>` + `FormDialogHeader/Body/Footer` | **NEW** shared shell composing `<Dialog>` | `components/forms/FormDialog.tsx` |
| `<RevealInset>` | **NEW** conditional-reveal inset | `components/forms/RevealInset.tsx` |
| `<ActiveStatusRow>` | **NEW** distinguished `Aktywny` status row (RevealInset shell + bold label + consequence line + live badge), body-bottom, all four forms (§13.2.4) | `components/forms/ActiveStatusRow.tsx` |
| `<FileUpload>` | **+`variant`** (`'block'` \| `'compact'`), compact chip layout | `components/ui/FileUpload.tsx` |
| `<VehicleFormDialog>` / `<TrailerFormDialog>` / `<DriverFormDialog>` | **REPLACE** the three `*Sheet` components (wizard mode preserved — the wizard steps embed these dialogs the same way) | `app/(employee)/employee/{vehicles,trailers,drivers}/` |
| `<Badge>` | reused (`success` / `danger` / `warning` / `muted`) — no change | `components/ui/Badge.tsx` |
| `<MultiSelect>` | reused for Odpady / ADR classes / Języki — no change | `components/ui/MultiSelect.tsx` |
| legacy `*Sheet.tsx` | **retire** once dialogs land (keep `<Sheet>` primitive — still used elsewhere) | — |

### §13.8 — Anti-patterns explicitly killed here

- Full-width `<FileUpload>` block with 40px thumbnails inside forms → **compact variant**.
- `ml-6` indentation + bare `animate-slide-in` `<FormItem>` for reveals → **`RevealInset`**.
- Ad-hoc `border-brand/40 bg-brand/5` equipment cells (TrailerSheet) → **`RevealInset`**.
- Section-header emoji (legacy) → dropped (plain `<FormSection>` uppercase label).
- `euro` `<Select>` with a single meaningful value → static `<Badge>`.
- Error-only-in-footer for required files → **field-level `aria-invalid` + `<FormMessage>`** (footer summary kept for cross-field).
- Critical `Aktywny` flag as a bare inline checkbox buried inside a section (Vehicle *Dane podstawowe* top, Trailer/Driver *Notatki*, Carrier *Przypisanie*) → **`<ActiveStatusRow>`** at the body bottom, distinguished (§13.2.4).

### §13.9 — Backend / data dependencies (route to shared/db/api — NOT design authority)

These UI changes assume model/enum work owned by other agents. Web-agent must **not** ship the dialogs until the contract exists; orchestrator should route:

- **Vehicle:** drop `euro` from the form payload (default `VI` server-side) or keep column but stop editing; `gpsMobilePhone` → **optional** (was required) + new attachment category «gps» revealed by GPS number; **fuel-card** fields (`fuelCardNumber` 16-digit, `fuelCardExpiry`, `fuelCardPin`) + derived blocked/active status; **porozumienie** scan attachment category (soft, non-blocking); **waste countries** array; **kabotaż DE** attachment category «cabotage_de_insurance» (sole required upload; DE permit scan dropped 2026-07-10); special-countries **min-2-of-3** Zod refine; ADR classes array; multi-select **min-1** refines.
- **Trailer:** make `innerLength/Width/Height/capacity` **required**; new `sideClearanceCm` (required); `roofLift` / `roofSlide` / `edscha` booleans (edscha gated on roofSlide); counts (`beltsCount`/`matsCount`/`beamsCount`) **min 3**; new `beams` flag + count; new `paletteBasket` flag; **XL cert** required attachment; **remove `airSuspension`**.
- **Driver:** `nationality` enum (BY/RUS/UA/PL/UZB/KRG/KZ/OTHER); `languages` array (PL/RU/EN/UA/DE/OTHER, min 1); phone-prefix decoupled from nationality; ADR classes array + required świadectwo attachment.
- **i18n:** web-agent adds PL(default)+EN keys for all new labels/sections/badges/errors under `vehicles.*` / `trailers.*` / `drivers.*` / `fileUpload.*`.


---

## §14 — Klik w aktywną zakładkę = odświeżenie danych (2026-07-29)

Клик по вкладке/пункту навигации, **на которой пользователь уже находится**, теперь перезагружает данные этого экрана. До этого такой клик был визуальным no-op: Next не перемонтирует страницу при навигации на тот же `href`, кеш TanStack Query отдаёт то же самое — пользователь жал и «ничего не происходило», а привычка «ткнуть в текущую вкладку, чтобы обновить» есть у всех.

### §14.1 — Механика (НЕ перезагрузка страницы)

Реализация — один общий хук `lib/hooks/useActiveNavRefresh.ts`:

```ts
queryClient.invalidateQueries({ type: 'active' })
```

- **`type: 'active'`** = только запросы с живыми наблюдателями, т.е. ровно то, что рендерит текущая страница (+ бейджи шапки/сайдбара). Кеш соседних вкладок не трогаем — переключение на них остаётся мгновенным.
- Инвалидация в TanStack Query v5 сама вызывает refetch активных запросов, поэтому каждый хук поднимает свой `isFetching` и страница показывает **свои привычные скелетоны/спиннеры** — отдельного оверлея не вводим.
- **Никаких `router.refresh()` / full page reload**: все страницы — тонкие server-shell'ы (`requireRoleAccess` + рендер клиентского view), данные тянут клиентские хуки. Полный запрос документа стоил бы лишний RTT и убил бы скролл, открытые модалки и состояние форм.
- Хук гасит переход через `e.preventDefault()` **только для активной ссылки**. Модифицированные клики (Ctrl/Cmd/Shift/Alt, средняя кнопка) пропускаются в браузер — «открыть в новой вкладке» работает как обычно.
- Повторные клики во время рефетча игнорируются (`inFlightRef`) — спама запросами нет.

### §14.2 — Фидбек (успех молчит)

- На время рефетча иконка **активной** вкладки подменяется крутящимся `<RefreshCw className="animate-spin">` (в `<CarrierTabs>` — вместо emoji, в `<OpiekaTabsNav>` иконка добавляется слева от лейбла). Минимальная длительность спиннера — 350 мс, иначе на тёплом кеше он моргает и клик «не читается».
- Тост об успехе **не показываем** (silent-on-success, как и везде); ошибку рефетча показывает сам экран через свой error-state.
- Активная ссылка получает `title={common.refreshHint}` («Kliknij, aby odświeżyć dane» / «Click to refresh data») и `aria-busy` на время рефетча.

### §14.3 — Где включено

| Навигация | Файл |
|---|---|
| Employee sidebar (admin / pracownik / opiekun) | `components/layout/EmployeeSidebar.tsx` |
| Carrier tab strip | `components/carrier/CarrierTabs.tsx` |
| Opieka sub-tabs (Przewoźnicy / Porozumienia) | `components/opieka/OpiekaTabsNav.tsx` |
| Weryfikator tabs (Przebieg / Wyjazdy) | `app/(weryfikator)/weryfikator/WeryfikatorTabsNav.tsx` |
| Planista tabs (Flota / Przebieg / Moje wnioski / Do zatwierdzenia) — **2026-09-28, §17.4.2** | `app/(planista)/PlanistaTabsNav.tsx` |

У `dyspozytor` / `eksport` таб-навигации нет (один экран под `<RoleShell>`) — включать нечего. У `planista` она появилась с §17. Логотип в `<Header>` — не вкладка, поведение не меняем.

**Правило для новых навигаций:** любой новый route-based таб-бар обязан прокинуть `useActiveNavRefresh()` на активную ссылку — иначе поведение станет непоследовательным между панелями.

---

## §15 — Klikalne kafelki KPI: drill-down do listy pojazdów (2026-07-29)

KPI-кафели показывали числа, но были тупиком: увидел «DO USUNIĘCIA 3» — и дальше ищи эти три машины руками. Теперь каждый кафель — affordance перехода, а числа в карточках перевозчиков — тоже.

Два режима, по наличию отдельного маршрута со списком:

| Поверхность | Режим | Цель |
|---|---|---|
| «Moja opieka» (`/employee/opieka`), 6 кафелей | **ссылка** | `/employee/carriers`, `/employee/vehicles`, `/employee/vehicles?status=<bucket>` |
| Карточка перевозчика, 4 цифры | **ссылка** | `/employee/vehicles?carrier=<id>&status=<bucket>` |
| Carrier / planista / dyspozytor, 5 кафелей | **тоггл** | фильтрует таблицу «Auta» на месте — отдельного списка машин у этих ролей нет |

### §15.1 — `<KpiCard>`: три состояния, одна анатомия

К props добавлены `href` (рендер как `<Link>`), `onClick` + `selected` (рендер как `<button aria-pressed>`) и `ariaLabel`. Без них — прежний инертный `<div>`, ни один существующий вызов не изменился.

- Hover/focus-рецепт интерактивного кафеля повторяет `<OpiekunCarrierCard>` (`hover:border-brand/40 hover:bg-brand-50/30 dark:hover:bg-brand/5` + `focus-visible:ring-[3px] ring-brand/40`) — кликабельный кафель и кликабельная карточка читаются как одна семья. Ноль новых токенов.
- Нажатое состояние тоггла: `border-brand/60 bg-brand-50/40 dark:bg-brand/10` + `aria-pressed`.
- `ariaLabel` обязателен для интерактивных: «Długo stojące: 4 — otwórz listę ciągników z tym statusem» лучше, чем «Długo stojące 4».

### §15.2 — Ссылочный режим: `?status=` + `?carrier=` как источник истины

`/employee/vehicles` держит два deep-link-фильтра **в URL** (`lib/vehicles-filter.ts` — имена параметров, парсер, билдер ссылок в одном месте), `q` остаётся локальным (набор текста не должен писать историю). Смена фильтра — `router.replace`, а не `push`: это уточнение текущего вида, а не новый пункт назначения.

- Фильтр применяется **на сервере** (`GET /vehicles?lifecycleStatus=`, docs/13), а не по загруженной странице — иначе список показывал бы срез из первых 50 строк и расходился с числом на кафеле.
- `limit` списка поднят 50 → 200 (максимум схемы): у таблицы нет пагинации, а отфильтрованный вид обязан вмещать всё, что посчитал кафель.
- В строке фильтров появился `<Select>` статуса со **всеми пятью** бакетами, включая «Wyłączone» — у него нет кафеля, но искать его руками — законный сценарий.
- «Wyczyść filtry» чистит и оба URL-параметра — одной навигацией (два последовательных `set` гонялись бы за один и тот же устаревший `searchParams`).

### §15.3 — Тоггл-режим: фильтр на месте

Кафель на carrier/planista/dyspozytor-панели фильтрует таблицу «Auta» по `lifecycleStatus` и **переключает `<Tabs>` на «Auta»**, чтобы у клика всегда был видимый эффект (обе панели перешли на controlled Tabs). Повторный клик по нажатому кафелю снимает фильтр; кафель AUTA — это «показать всё» (нажат, когда фильтра нет).

Фильтр никогда не бывает молчаливым:
- `<VehicleStatusFilterBar>` над таблицей — какой бакет применён, сколько строк осталось, кнопка «Wyczyść filtry». `role="status"`, потому что фокус при клике по кафелю не двигается.
- Пустой результат — `emptyFiltered` («Brak ciągników w tym statusie»), не «нет автопарка»: для этого в `FleetTables` проброшены `hasActiveFilters` / `emptyFiltered`.

### §15.4 — Карточка перевозчика: два таргета вместо одного

Карточка была одним большим `<Link>`; вложенные `<a>` невалидны, поэтому теперь это контейнер с **stretched-ссылкой** (`absolute inset-0 z-0`) на drill-down перевозчика и четырьмя stat-ссылками поверх неё (`relative z-10`). Клик по цифре открывает пойзды этого перевозчика в нужном статусе, клик по любому другому месту карточки — как раньше. Кольцо фокуса живёт на растянутой ссылке, поэтому клавиатурный фокус по-прежнему обводит карточку целиком.

### §15.5 — Правило

Новый KPI-кафель обязан отвечать на вопрос «а что за этим числом?»: либо `href` на отфильтрованный список, либо `onClick`-тоггл с `<VehicleStatusFilterBar>`. Инертный кафель допустим только там, где за числом действительно нет набора строк.

---

## §16 — Wyłączenie gwarancji: три состояния лимита, массовое применение, выключенный месяц у перевозчика (NEW 2026-09-20 — AUTHORITATIVE)

> **Scope.** Админский лист `/employee/limits` получает возможность **выключать гарантию** (месяц целиком и/или субботы), массово применять значения к диапазону месяцев; перевозчик и сотрудник получают честное объяснение, почему в выключенном месяце ноль. Этот раздел авторитетен для всего, что касается «включено / выключено / не настроено». Он **расширяет** §`<LimitsRow>` (Phase 4) и §`<BreakdownTable>` (Phase 3) и **добавляет** одну кнопку в §6.5.4.
>
> **Ноль новых токенов, ноль новых примитивов.** Всё собирается из `Checkbox`, `Input`, `Select`, `MultiSelect`, `Badge`, `Dialog` / `FormDialog`, `EmptyState`, `Button` и уже существующих цветовых токенов.

### §16.1 — Три состояния лимита — визуальный контракт (главное решение)

В БД у `kmPerDay` три значения с **противоположными** последствиями, и именно это нужно развести визуально:

| # | БД | Что реально применится | Название в UI (PL) |
|---|---|---|---|
| **A** | строки нет / `NULL` | **fallback 540 км/день, 0,50 €/км** — месяц молча платит по максимуму | «domyślne» |
| **B** | `0` | 0 км — гарантии нет | «wyłączona» |
| **C** | `> 0` | заданное значение | — (нормальное состояние) |

**Правило (locked): состояние A никогда не выражается пустотой.** Пустая ячейка не имеет права быть единственным сигналом «действует 540» — это ровно та ловушка, из-за которой забытый месяц выплачивает максимум. Поэтому состояние A всегда несёт **текст**, а не отсутствие текста.

**Треугольник различий — по трём осям сразу** (цвет, текст, поверхность), чтобы 12 строк читались одним взглядом:

| Ось | A. Nieskonfigurowany | B. Wyłączona | C. Aktywna |
|---|---|---|---|
| Поверхность `<tr>` | `bg-card` (обычная) | **`bg-input/40`** — единственная приглушённая строка в таблице | `bg-card` |
| Ячейка «Miesiąc» | название + **под-строка** `text-[11px] text-warning-dark dark:text-warning`: «domyślne: 540 km/dz. · 0,50 €/km» | название `text-text-sub` + под-строка `text-[11px] text-text-sub`: «gwarancja wyłączona (0 km)» | только название `font-semibold text-text`, под-строки нет |
| Инпут `Km/dzień` | пустой, `placeholder="540 (domyślnie)"` (`placeholder:text-text-sub`) | `readOnly`, значение `0`, поверхность `bg-input/40 text-text-sub cursor-not-allowed` | обычный `bg-input text-text` |
| Чекбокс в ячейке | **отмечен** (гарантия действует — по умолчанию) | снят | отмечен |

**Почему в состоянии A чекбокс отмечен.** Чекбокс отвечает на вопрос «действует ли гарантия в этом месяце», а не «есть ли строка в БД». При `NULL` гарантия действует (по fallback), поэтому галка стоит. Инвариант, который нельзя ломать: **снятая галка ⟺ значение `0` ⟺ ноль километров.** Одно значение — одно прочтение.

**Цвет — только у состояния A, только в под-строке.** Это единственное цветное пятно в таблице, потому что A — единственное опасное состояние («ты этого не настраивал, а деньги идут по максимуму»). Заливки `bg-warning/10` на всю строку **нет**: год без конфигурации превратился бы в янтарную стену, и сигнал перестал бы быть сигналом. Приглушённая заливка зарезервирована за B — «выключено» должно читаться как выключенный свет, а не как ошибка.

**Зачёркивание запрещено** во всей таблице лимитов: `line-through` читается как «удалено/аннулировано» (и так же озвучивается скринридерами `<del>`-семантикой), тогда как выключенный месяц — это действующая конфигурация, а сохранённая ставка вообще ценность, которую мы бережём.

**Страничная сводка (одна, не двенадцать).** Над таблицей, когда `count > 0` месяцев в состоянии A, — тихая нота в рецепте §7.7.1b / `<LockNotice>` (нейтральная, `role="note"`, `flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 text-xs text-text-sub`), иконка `<Info size={14} className="mt-0.5 shrink-0" />`, копия `limits.defaultsNotice`. Именно здесь живёт объяснение fallback-а целиком — под-строки в рядах его только маркируют.

**Обратной дороги в A нет.** UI **не** предоставляет способа вернуть месяц в `NULL`: как только строка записана, месяц сконфигурирован. Состояние A — только стартовое, никогда не пункт назначения. «Очистить месяц» в меню строки не добавлять.

**У `kmPerSaturday` состояний только два.** `NULL` и `0` поведенчески идентичны (гарантии по субботам нет), поэтому суббота рендерится как чистый вкл/выкл: снятая галка + `readOnly` `0` + `bg-input/40` в своей ячейке. Под-строки «domyślne» у субботы **нет** никогда — fallback субботы равен нулю, скрытого риска нет.

**Ставка (`ratePerKm`) не выключается.** У неё нет чекбокса и нет состояния «выключена»: ставка — цена километра, а не количество. В выключенном месяце она **сохраняется и остаётся редактируемой** (значение рендерится `text-text-sub`, поверхность обычная `bg-input`), с нативным `title` = `limits.disabledRateHint`. Это прямое следствие бизнес-требования «ставку не вводить заново».

### §16.2 — Размещение чекбоксов: внутри ячеек, а не в колонке слева

**Решение (locked): чекбокс живёт внутри той ячейки, которой управляет.** Ячейка `Km/dzień` = `[✓] [ 540 ]`, ячейка `Km/sobota` = `[ ] [ 0 ]`. Ни отдельной колонки слева от «Miesiąc», ни чекбокса в шапке колонки.

| Отвергнутый вариант | Почему нет |
|---|---|
| Чекбокс первой колонкой / слева от названия месяца | Чекбокс в первой колонке таблицы — это **универсальная конвенция row-selection**. А у нас на этой же странице появляется массовое применение, т.е. пользователь вправе ждать, что галка выбирает строку для bulk-операции. Коллизия смыслов на ровном месте. |
| Чекбокс субботы в шапке колонки `Km/sobota` | Чекбокс в `<th>` — тоже конвенция, и тоже чужая: «select all». Плюс он физически не может отличаться по месяцам, а суббота настраивается помесячно. |

**Что даёт выбранный вариант:** (1) чекбокс и число, которым он управляет, — одно визуальное целое; (2) два чекбокса стоят рядом в соседних ячейках, на одном уровне, **никакой вложенности** — это и есть визуальное доказательство их независимости; (3) первая колонка остаётся свободной под будущий row-select, если он когда-нибудь понадобится.

**Анатомия ячейки:**

| Элемент | Tailwind |
|---|---|
| Обёртка ячейки | `flex items-center gap-2` |
| Хит-область чекбокса | `<label className="inline-flex h-9 w-9 shrink-0 items-center justify-center cursor-pointer rounded-md hover:bg-input">` — сам `<Checkbox className="h-4 w-4">` внутри |
| Инпут | `h-9 w-24 tabular-nums` (был `w-28` — 4 единицы отданы чекбоксу; колонка по ширине не меняется) |
| Высота строки | `h-12` сохраняется; под-строки состояний ложатся в тот же ряд как второй `text-[11px]`-лайн в ячейке «Miesiąc», строка растёт до `h-14` только при наличии под-строки |

**Touch-target.** 36×36 хит-области достаточно: WCAG 2.2 **2.5.8 Target Size (Minimum) — AA = 24×24 CSS px**; 44×44 это 2.5.5 (AAA). В плотной админ-таблице 36×36 — сознательный компромисс, зафиксированный здесь, чтобы web-agent не «чинил» его до 44 и не ломал ритм строки.

**Доступное имя** у каждого чекбокса обязано содержать месяц, потому что видимая подпись — это заголовок колонки, а скринридер идёт по ячейкам: `aria-label={t('toggleDay', { month: 'Styczeń 2026' })}`. Для субботы — `toggleSaturday`.

**Независимость проговаривается словами, а не только вёрсткой.** Под таблицей (или в `subtitle` шапки) — одна строка `text-xs text-text-sub`: `limits.independenceHint` («Gwarancja dzienna i sobotnia są niezależne — miesiąc może mieć włączone tylko soboty.»). Снятие месячной галки **никогда** не трогает субботнюю (и наоборот): ни автоматически, ни с подтверждением.

### §16.3 — Поведение при переключении: снятие пишет, установка — нет

Механика утверждена и переносится в UI буквально:

| Действие | Что происходит с БД | Что видит пользователь |
|---|---|---|
| **Снять галку** | немедленный `PUT { kmPerDay: 0 }` (соотв. `{ kmPerSaturday: 0 }`) | ячейка `saving` → `success`-вспышка → строка оседает в состояние **B** |
| **Поставить галку** | **ничего не пишется** | инпут разблокируется, получает фокус, ячейка переходит в состояние **`unsaved`** |
| **Ввести значение и уйти с поля** | `PUT { kmPerDay: <value> }` | обычный `saving` → `success`, строка становится **C** |
| **Уйти с пустого поля / Esc** | ничего | галка **сама возвращается в снятое положение**, `unsaved` гаснет, строка остаётся **B** |

**Почему установка галки не пишет `NULL`:** запись `NULL` вернула бы месяц в состояние A, т.е. подарила бы ему fallback 540 — ровно та ловушка, от которой уходит вся фича. Это hard rule: **ни одна кнопка в приложении не пишет в лимит `NULL`.**

**`unsaved` — четвёртое состояние ячейки** (дополняет `idle / saving / success / error` из §`<LimitsRow>`):

| Аспект | Значение |
|---|---|
| Инпут | `border-warning bg-warning/5 focus:border-warning` |
| Под-строка | `text-[11px] text-warning-dark dark:text-warning` = `limits.unsaved` («Nie zapisano — obowiązuje 0 km») |
| Поверхность строки | **остаётся `bg-input/40`** (состояние B) — в БД по-прежнему ноль, и строка честно об этом говорит |
| a11y | `aria-describedby` инпута → id под-строки; при авто-возврате галки — `role="status"` sr-only «Gwarancja pozostaje wyłączona» |

Ключевой смысл: галка стоит, а строка всё ещё выглядит выключенной — это не баг вёрстки, это правда («пока не введёшь число, действует 0»).

**Память о прежнем значении (session-local).** При снятии галки компонент запоминает последнее `> 0` значение в локальном state. При повторной установке галки в том же сеансе инпут **предзаполняется** этим числом как черновик — но всё ещё в состоянии `unsaved`, запись происходит только по blur. Это снимает раздражение «выключил случайно — потерял 540», не нарушая правило «установка галки ничего не пишет». Если памяти нет (страница перезагружена) — инпут пустой, `unsaved` с полной подсказкой `limits.unsavedHint`.

**Подтверждения на одиночное выключение нет.** Один клик, мгновенно обратимый, значение помнится в сессии, ставка сохраняется, событие уходит в аудит. Диалог здесь был бы церемонией. Подтверждение появляется только у массовой операции (§16.4), где необратимость реальна.

**Смена года / уход со страницы при наличии `unsaved`-ячеек** не блокируется и не подтверждается: черновик ничего не изменил в БД, а состояние на сервере (0) уже корректно отражено в строке.

### §16.4 — `<BulkLimitsDialog>` — массовое применение к диапазону месяцев

Триггер: кнопка в шапке страницы, рядом с переключателем года — `<Button variant="outline" size="sm"><CalendarRange size={14}/> Zastosuj do wielu miesięcy</Button>`. Не primary: основной сценарий страницы — точечная правка, массовая операция вторична.

Поверхность — **`<FormDialog>` (§13.1), `sm:max-w-[900px]`**, а не `<ConfirmDialog>`: внутри форма + живая сводка, которые в `max-w-md` не живут.

**Три секции в `FormDialogBody` (`space-y-6`, заголовки — `<FormSection title>`):**

**1. `Zakres`.** Три взаимоисключающих режима — radio-группа, отрисованная как сегменты (`role="radiogroup"`, каждый сегмент — `<label>` с `border-border` / выбранный `border-brand/60 bg-brand-50/40 dark:bg-brand/10`, рецепт нажатого KPI-кафеля §15.1):

| Режим | Контрол | Дефолт |
|---|---|---|
| «Cały rok {year}» | — | ✔ выбран |
| «Od – do» | два `<Select>` месяцев (`Od`, `Do`); если `Do < Od` — границы меняются местами молча, ошибку не показываем | — |
| «Wybrane miesiące» | `<MultiSelect>` с 12 месяцами, `sort={false}` (календарный порядок важнее алфавитного) | — |

Область действия — **только выбранный на странице год**. Кросс-годовой диапазон не поддерживается; год печатается в заголовке диалога и в подписи кнопки, чтобы это не пришлось угадывать.

**2. `Wartości`.** Здесь форма **сознательно отличается** от строки таблицы: у строки два состояния (вкл/выкл), у массовой операции их три — вкл, выкл и **«не трогать»**. Чекбокс третье состояние честно выразить не может (indeterminate, переключаемый кликом, — гадание), поэтому:

| Поле | Контрол | Опции |
|---|---|---|
| `Km / dzień` | `<Select>` действия | «Bez zmian» (default) · «Włącz i ustaw wartość» · «Wyłącz (0 km)» |
| `Km / sobota` | `<Select>` действия | те же три |
| `Stawka € / km` | просто `<Input>` | пусто = «bez zmian» (`placeholder="bez zmian"`); у ставки нет вкл/выкл (§16.1) |

Числовой инпут для km появляется только при «Włącz i ustaw wartość» — через `RevealInset` (§13.2.1), чтобы подполе читалось как принадлежащее своему селекту. «Włącz и ustaw» с пустым значением — ошибка сабмита `limits.bulk.errorValueRequired`, а не тихая запись нуля (иначе мы бы воспроизвели ту же двусмысленность, что чиним).

**3. `Podsumowanie` — обязательная честная сводка.** Живая, пересчитывается на каждое изменение формы, стоит **над футером** и содержит:

- Заголовок: `limits.bulk.summaryHeadline` — «Zmienisz **9** z **12** miesięcy roku 2026.»
- Строка перезаписи: `limits.bulk.summaryOverwrite` — «6 miesięcy ma już ustawione wartości — zostaną nadpisane.» (считает только месяцы в состоянии C/B, т.е. те, где что-то реально затирается).
- Строка необратимости: `limits.bulk.summaryIrreversible` — «Operacji nie można cofnąć. Poprzednie wartości pozostaną widoczne w audycie.»
- **Таблица «Obecnie → Po zmianie»**, максимум 12 строк (скролла не будет):

```
Miesiąc     Km/dzień              Km/sobota          Stawka €/km
Styczeń     540      →  0         wyłączone → —      0,50 → bez zmian
Luty        brak (dom.) →  600    wyłączone → 300    0,50 → 0,52
Marzec      600      →  bez zmian …
```

| Слот | Оформление |
|---|---|
| Старое значение | `text-text-sub tabular-nums` |
| Стрелка | `<ArrowRight size={12} className="text-text-sub" />` (не символ `→` в тексте — иконка, чтобы скринридер не читал «стрелка вправо» 36 раз; вокруг колонки `<th>`-подписи `Obecnie` / `Po zmianie`) |
| Новое значение | `font-semibold text-text tabular-nums` |
| Без изменений | `text-text-sub` «bez zmian», вся ячейка приглушена |
| Строка, где вообще ничего не меняется | вся `<tr>` `text-text-sub`, считается отдельно: `limits.bulk.summaryNoop` |
| Пустое значение в «Obecnie» | **никогда не пустая ячейка** — «brak (domyślne)» для A, «wyłączone» для B |

Именно эта таблица и есть подтверждение. **Второго, вложенного `<ConfirmDialog>` нет** — стек диалогов хуже, чем одна честная сводка, а primary-кнопка у нас и так брендово-красная. Финальная кнопка **называет объём**: `limits.bulk.apply` = «Zastosuj do **9** miesięcy» (правило §6.5.12 «кнопка называет то, что коммитит»; голое «Zapisz» запрещено).

**Футер:** `[Anuluj (ghost)] [Zastosuj do {n} miesięcy (primary)]`. Primary `disabled`, пока нет ни одного выбранного месяца или ни одного изменения (`errorNoMonths` / `errorNoChanges` рендерится `mr-auto text-sm text-danger role="alert"` — стандартный validation-summary слот §13.1).

**Результат и частичный отказ.** Диалог закрывается только при полном успехе → `toast.success(limits.bulk.successToast)`. При провале части месяцев диалог **остаётся открытым**, и таблица сводки превращается в таблицу результата: у каждой строки статус-слот — `<Check size={14} className="text-success"/>` / `<X size={14} className="text-danger"/>`; в футере появляется `<Button variant="outline">Ponów nieudane</Button>`. Пер-строчный результат — единственный честный способ показать частичную запись.

> **Зависимость (не дизайнерское решение, вопрос к api-agent):** если бэкенд даст **один** bulk-эндпоинт с атомарной транзакцией, слой «пер-строчный результат» не понадобится — останется просто success/error. Если это N последовательных `PUT`, пер-строчный результат обязателен. Дизайн поддерживает оба варианта; предпочтителен атомарный.

### §16.5 — Выключенный месяц в разбивке: `<BreakdownTable>` (перевозчик + staff), смешанный период по tablicy km

Самая рискованная часть фичи: без пометок месяц с нулями читается как баг или как «у них что-то не настроено».

> ⚠️ **REWORK 2026-09-24 ([docs/20 §0⁵](20-phase-7-eksport-weryfikator.md)).** Смешанный период (есть выключенный месяц **и** есть активный) больше **не** делит заявленный пробег пропорционально дням. Км, вычитаемые из гарантии, — это **фактические** км с tablicy km weryfikatora за дни активных месяцев; цифра перевозчика на выплату не влияет. День активного месяца без записи на tablicy **не угадывается**: `ZAAKCEPTOWANO` недоступно, пока weryfikator не допишет; `ODRZUCONO` и «Zapisz weryfikację» — доступны всегда.
>
> **Что переписано:** §16.5.1 (флаг `mileageSource`), §16.5.3 (нота — новый текст, две аудитории), новые §16.5.5 (staff-колонки tablicy km), §16.5.6 (нота «brak danych» + гейт акцепта в `ClaimModal`), §16.5.7 (i18n), §16.5.8 (checklist). **Что осталось как было:** бейджи / приглушение / `—` вместо ставки-призрака (§16.5.2), пустое состояние всего выключенного периода (§16.5.4). Ключи `gapNotice` / `gapNoticeMonth` и формулировка «Do rozliczenia przyjęto {daysActive} dni i {mileageEffective} z {mileage} km» **удалены**.
>
> Периоды, где **все** месяцы активны, не меняются ни визуально, ни по копирайту — ни у перевозчика, ни у staff.

#### §16.5.1 Как UI понимает, что месяц выключен и что период смешанный

Состояние **месяца** производится из уже существующих полей `MonthBreakdownDto` — **новых API-полей на уровне месяца не требуется**:

| Признак | Условие | Трактовка |
|---|---|---|
| `disabled` | `kmPerDay === 0 && kmPerSaturday === 0` | гарантии нет весь месяц |
| `saturdayOnly` | `kmPerDay === 0 && kmFromSaturdays > 0` | будни выключены, субботы работают |
| обычный | иначе | без пометок |

Состояние **периода**. «Весь выключен» — по строкам, как было; **«смешанный» — только по серверному флагу**, из строк не выводится:

| Признак | Условие | Источник |
|---|---|---|
| `allDisabled` | все строки `disabled` | строки breakdown (как было) — §16.5.4 |
| `boardSettled` (смешанный) | `breakdown.mileageSource === 'board'` | сервер; отсутствие поля ⇒ `'declared'` |
| staff-вариант | `boardSettled` **и** компоненту передан `boardSettlement` | API отдаёт `boardSettlement` только pracownik / admin — перевозчику никогда (opiekun с 2026-10-22 wnioski не видит) |

Почему не из строк: единственный старый (локальный) wniosek с пропорциональным расчётом имеет смешанные строки, но `mileageSource` у него нет — для него любая из новых нот была бы неправдой, поэтому он рендерится **без ноты** (бейджи и приглушение остаются). В проде wniosków нет.

**Матрица рендера:**

| Период | Перевозчик | Staff |
|---|---|---|
| все месяцы активны (`mileageSource !== 'board'`) | как сегодня, без ноты | как сегодня: без колонок tablicy, без ноты, без гейта |
| смешанный (`'board'`) | §16.5.2 + нота `audience="carrier"` (§16.5.3) | §16.5.2 + нота `audience="staff"` (§16.5.3) + колонки tablicy (§16.5.5) + «brak danych» / гейт в `ClaimModal` (§16.5.6) |
| весь период выключен | `<EmptyState>` (§16.5.4) | `<EmptyState>` (§16.5.4); колонок, ноты и гейта нет |

#### §16.5.2 Оформление месяца

| Слот | `disabled` | `saturdayOnly` |
|---|---|---|
| Строка / карточка | `bg-input/40` | обычная (ничего не приглушаем — месяц платит) |
| Метка у месяца | `<Badge variant="outline" className="border-border text-text-sub text-[11px]">Gwarancja wyłączona</Badge>` | `<Badge variant="outline" className="border-border text-text-sub text-[11px]">Gwarancja tylko w soboty</Badge>` |
| `Km/dz.` | `0` в `text-text-sub` | `0` в `text-text-sub` |
| `€/km` | **`—`** + нативный `title={t('rateNoneTitle')}` | обычная ставка |
| `Km/mc` | `0` в `text-text-sub` (снимаем `font-semibold` — нечего подчёркивать) | обычная |
| Карточный вариант (`< 34rem`) | бейдж под названием месяца; строка `€/km` **не рендерится вовсе** (в карточке строку можно убрать, в таблице — только поставить `—`) | как обычно |

**Ставка-призрак — отдельное правило (locked).** Движок при `kmGuaranteed = 0` отдаёт `ratePerKmEffective` как глобальный fallback `0,50` — это артефакт вычисления, а не решение человека. **Везде, где `kmGuaranteed === 0`, ставка рендерится как `—`, а не как число:** в `<BreakdownTable>` (per-month и footer), в stat-карточках `<LivePreviewPanel>`, в §6.5 `ClaimModal`. Формулировка правила: *цена километра имеет смысл только при ненулевом количестве километров; ноль километров по 0,50 € — это не цена, это шум, который выглядит как обещание.*

**2026-09-24: всё в §16.5.2 остаётся без изменений и для перевозчика, и для staff** — смена правила расчёта не касается того, как выглядит выключенный месяц. Единственное дополнение — staff-колонки tablicy km в `disabled`-месяце: обе ячейки `—` (правило то же, что у ставки-призрака: число, которое не участвует в расчёте, не печатается), детали в §16.5.5.

#### §16.5.3 Нота смешанного периода — `<GuaranteeGapNotice audience>` (REWRITTEN 2026-09-24)

Имя компонента сохраняется (он по-прежнему объясняет «дыру» в гарантии), меняются условие и текст. Композиция (не примитив), рендерится **над** таблицей / карточками внутри карточки `<BreakdownTable>`, а не под ними: «сломанными» выглядят нулевые строки, объяснение читается раньше цифр.

| Аспект | Значение |
|---|---|
| Условие рендера | `mileageSource === 'board'` **и** не `allDisabled` (§16.5.1). Больше **не** выводится из строк |
| Аудитория | `audience="staff"`, если компоненту передан `boardSettlement`; иначе `"carrier"`. Одна нота на экран — никогда обе |
| Элемент | существующий `<LockNotice icon={Info}>` в обёртке `border-b border-border p-3` — **как сейчас в коде**, без изменений оформления |
| Иконка | `Info` — нейтральная, **не** semantic-цветная |
| Выделение | `t.rich(..., { b })` → `<strong className="font-semibold text-text">` — только на последнем предложении (carrier) / на предложении про цифру перевозчика (staff) |
| Тон | **нейтральный, не warning.** Выключенный месяц — действующая конфигурация, а не ошибка. Недостающие дни tablicy — отдельная, янтарная плашка **только у staff** (§16.5.6), в эту ноту их не смешиваем |
| Параметры | только `count` = число `disabled`-месяцев. **Никаких чисел км и дней** — ни у перевозчика, ни у staff |

**Перевозчик — `carrier.breakdown.mixedPeriodNotice`** (заменяет `gapNotice` + `gapNoticeMonth`):

> ⓘ Okres obejmuje miesiąc bez gwarancji. Dopłata zależy wtedy od przebiegu pojazdu w dniach objętych gwarancją, a nie od łącznego przebiegu podanego we wniosku. **Ostateczną kwotę ustala się po weryfikacji wniosku.**

Зачем каждое предложение:
1. *Okres obejmuje…* — почему в таблице нулевая строка (какой месяц — видно по бейджу строкой ниже, поэтому список месяцев из ноты убран вместе с `gapNoticeMonth`).
2. *Dopłata zależy wtedy od…* — **обязательное**: в смешанном периоде превью перевозчика **не реагирует** на поле «Przebieg» в форме. Без этой фразы перевозчик меняет число, видит ту же dopłatę и решает, что форма сломана. Источник («tablica km weryfikatora», SpedTrans) перевозчику не называем — ему достаточно знать, что считается пробег по дням, а не его итоговая цифра.
3. *Ostateczną kwotę ustala się po weryfikacji wniosku.* — сумма в превью и в поданном wniosku может быть посчитана без последнего дня (tablica за день съезда заполняется назавтра). Предложение в безличном настоящем времени — истинно и до, и после решения, поэтому один текст для формы, превью и страницы wniosku.

**Решения по перевозчику (locked 2026-09-24):**

| Вопрос | Решение | Почему |
|---|---|---|
| Видит ли перевозчик `mileageEffective`? | **Нет — нигде.** Ни в ноте, ни строкой «Razem», ни в карточке | Цифра может быть неполной (нет дня съезда), а предупреждать про недостающий день перевозчику решено **не** показывать (docs/20 §0⁵). Неполное число без предупреждения хуже, чем никакого |
| Пер-месячные / пер-дневные км tablicy | **Нет** | решение docs/20 §0⁵ |
| Предупреждение о незаписанном последнем дне | **Нет** | решение docs/20 §0⁵; третье предложение ноты закрывает это общим «сумма окончательна после weryfikacji» |
| Stat-карточки `<LivePreviewPanel>` (Km gwarantowane / Różnica km / Stawka / Dopłata) | **Без изменений** | это существующий контракт превью; `Różnica km` — агрегат периода, не пер-месячная цифра tablicy. Нота объясняет, почему `Różnica km ≠ Km gwarantowane − Przebieg` |
| Бейджи «Gwarancja wyłączona» / «Gwarancja tylko w soboty», `bg-input/40`, `Km/mc` без веса | **Остаются как есть** (§16.5.2) | |
| Правило `—` вместо ставки-призрака | **Остаётся как есть** (§16.5.2) | |
| Страница wniosku `/carrier/claims/[nrZgl]` | та же нота, тот же текст | `<BreakdownTable>` один и тот же; «Przebieg: X km» в фактах остаётся — это то, что перевозчик заявил |

**Staff — `carrier.breakdown.boardNotice`** (pracownik / admin; тот же компонент, `audience="staff"`):

> ⓘ Okres obejmuje miesiąc bez gwarancji. Dopłatę liczy się z tablicy km weryfikatora — tylko z dni w miesiącach z gwarancją. **Przebieg podany przez przewoźnika nie wpływa na kwotę — służy tylko do porównania.**

Выделенное предложение — главное для pracownik: поле «Przebieg / km zrealizowane» в `ClaimModal` остаётся редактируемым, но в смешанном периоде живой пересчёт на него **не реагирует**. Без этой строки правка км, не меняющая dopłatę, читается как баг `<RecalcBadge>`.

#### §16.5.4 Весь период без гарантии — пустое состояние вместо таблицы нулей

Условие: **все** строки breakdown `disabled` (эквивалентно `kmGuaranteed === 0 && daysActive === 0`). Таблица/карточки **не рендерятся вообще** — вместо них `<EmptyState>`:

| Слот | Значение |
|---|---|
| `icon` | `<CalendarOff />` |
| `iconClassName` | по умолчанию (muted) — **не** danger |
| `title` | `carrier.breakdown.allDisabledTitle` |
| `message` | `carrier.breakdown.allDisabledBody` |
| Обёртка | остаётся `bg-card rounded-lg border border-border` — карточка есть, содержимое заменено |

`<GuaranteeGapNotice>` в этом случае **не** рендерится (иначе два объяснения одного факта); футер «Razem (km gwarant.)» тоже скрыт — нулевой итог под пустым состоянием бессмыслен. Блок «Pierwszy / ostatni dzień okresu» скрывается по тому же правилу.

Финансовая часть вокруг (stat-карточки `<LivePreviewPanel>`, dopłata в §6.5) показывает `0,00 €` и `—` вместо ставки — она не прячется: перевозчик должен видеть, что сумма именно ноль, а не «не посчитано».

> **Вне зоны дизайна (вопрос владельцу процесса):** блокировать ли подачу wniosek-а, когда весь период без гарантии. Здесь зафиксировано только визуальное поведение превью. Существующий гейт §6.5.5 («Gwarancja wyjeżdżona — wniosek można tylko odrzucić» при `kmDifference <= 0`) в этом случае и так срабатывает на стороне сотрудника.

> **2026-09-24:** отказ сервера при подаче смешанного периода без недобега («W miesiącach objętych gwarancją przebieg jest równy lub wyższy niż km gwarantowane (X). Brak podstaw do dopłaty.») — серверный текст, показывается существующим путём 4xx-ошибки формы; отдельного ключа не заводим. Как и все серверные 4xx сегодня, он только по-польски.

#### §16.5.5 Staff: колонки tablicy km в `<BreakdownTable>` (NEW 2026-09-24)

**Контракт компонента.** `<BreakdownTable breakdown boardSettlement? className? />`.

- `boardSettlement` передаёт **только** `ClaimModal` (pracownik / admin). `LivePreviewPanel` и страница wniosku перевозчика его не передают — API перевозчику это поле не отдаёт. Роль компонент **не проверяет**: вариант определяется данными (§16.5.1).
- Prop `mileage` **удаляется** — он кормил только старую ноту `gapNotice`. Вызовы: `LivePreviewPanel.tsx`, `app/(carrier)/carrier/claims/[nrZgl]/page.tsx`, `ClaimModal.tsx` (`DoplataBlock`).
- В `ClaimModal` брать **`claim.boardSettlement` в паре с `claim.breakdown`** — один DTO, одни даты. Не смешивать `boardSettlement` из живого превью с persisted `claim.breakdown`: при правке дат месяцы разъедутся. (Если когда-нибудь разбивка в модалке переедет на живой breakdown — брать оба из превью.)
- Колонки рендерятся только при `mileageSource === 'board'` **и** наличии `boardSettlement`. Период «все месяцы активны» у staff выглядит **ровно как сегодня** — даже если API вдруг пришлёт `boardSettlement` и для него.
- Соединение: `boardSettlement.months` → строки breakdown по `yearMonth`. Месяц без пары → обе ячейки `—` (защитно; в норме не случается).

**Ячейки по режиму месяца** (`mode` из `boardSettlement.months[]`):

| Месяц | «Km wg weryfikatora» | «Wpisane dni» |
|---|---|---|
| `off` | `—`, `text-text-sub`, `title={t('boardOffTitle')}` | `—`, `text-text-sub` |
| `active`, `daysFilled === daysRequired` | `formatInt(km)`, `font-semibold text-text tabular-nums` (тот же вес, что `Km/mc`: это пара «gwarantowano → przejechano») | `boardDaysValue` → «14 z 14», `text-text tabular-nums` |
| `active`, `daysFilled < daysRequired` | как строкой выше — число показываем, сигнал несёт соседняя ячейка | `<AlertTriangle size={12} aria-hidden className="shrink-0" />` + «13 z 14» в `inline-flex items-center justify-end gap-1 font-semibold text-warning-dark dark:text-warning` + `<span className="sr-only">, {t('boardDaysMissingSr', { count: daysRequired − daysFilled })}</span>` |
| `saturdaysOnly` | `formatInt(km)` — км только зачётных суббот | `boardSaturdaysValue` → «2 z 2 sob.» — единица подписана, иначе «2 z 2» читается как «2 дня месяца». Неполно → та же янтарная трактовка |
| любой, `daysRequired === 0` | `—` | `—` |

Янтарь никогда не единственный сигнал: иконка + sr-only (WCAG 1.4.1). Контраст — существующая проверенная пара (`text-warning-dark` на `bg-card` light, `text-warning` на `bg-card` dark).

**Широкая таблица.** Порядок: `Miesiąc | Dni rob. | Km/dz. | €/km | Km/mc | Km wg weryfikatora | Wpisane dni`. Колонки tablicy стоят **сразу справа от `Km/mc`** — строка читается парой «gwarantowano X → przejechano Y», итог «Razem» — той же парой, а это и есть весь расчёт (`Σ gwarancji − Σ tablicy`). Граница «gwarancja | tablica km» — `border-l border-border` на первой колонке tablicy (в `th`, каждом `td` и `tfoot`). Заголовки — существующий класс `th`, `whitespace-nowrap`, выравнивание вправо, полные подписи (сокращать не нужно — см. порог ниже).

- Под-строки «Soboty» и «Dni wyłączone»: `colSpan` 5 → **7**, когда колонки tablicy есть.
- `tfoot`: лейбл `colSpan={4}` → **`total` «Razem»** (вместо «Razem (km gwarant.)» — под одним лейблом теперь два разных итога, что есть что — говорят заголовки колонок) | `kmGuaranteed` | `boardSettlement.mileageEffective` (`border-l`) | пустая ячейка. Итог колонки «Km wg weryfikatora» берётся **из того же живого `boardSettlement`, что и её строки** (Σ `months[].km`), поэтому колонка всегда сходится; **не** `breakdown.mileageEffective` — это км последнего расчёта wniosku (подача / верификация / решение), они устаревают, как только weryfikator дописал день. Выплату этот итог не показывает — сумма живёт только в поле dopłaty. «Wpisane dni» **не** суммируем: дни и субботы разных месяцев не складываются в осмысленное число; недостающие даты перечисляет §16.5.6.

```
┌ ⓘ Okres obejmuje miesiąc bez gwarancji. Dopłatę liczy się z tablicy km weryfikatora — … ─────────┐
│ MIESIĄC                        DNI ROB.  KM/DZ.  €/KM   KM/MC │ KM WG WERYFIKATORA   WPISANE DNI │
│ 2025-08 [Gwarancja wyłączona]       5       0     —        0 │                  —             — │ ← bg-input/40
│ 2025-09                            14     540  0,50    7 560 │              2 000    ⚠ 13 z 14  │
│ RAZEM                                                  7 560 │              2 000               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Порог «таблица / карточки».** С колонками tablicy таблица становится 7-колоночной — на 34rem она не помещается без сжатия. **Staff-вариант переключается на 40rem**: карточки `@max-[40rem]:block @min-[40rem]:hidden`, таблица `@max-[40rem]:hidden @min-[40rem]:block`. Перевозчик и staff без колонок — по-прежнему 34rem. Классы **литеральные** (Tailwind v4 сканирует исходник, интерполяция `@min-[${bp}]` не сгенерирует CSS): два полных набора строк, выбор через `cn(boardMode ? '…40rem…' : '…34rem…')`. В `ClaimModal` (`max-w-4xl`, тело ≈ 52rem) на десктопе staff видит таблицу; карточки — на планшете / телефоне.

**Узкий вид (карточки, контейнер < 40rem).** В карточке `active` / `saturdaysOnly`-месяца после существующих строк `dl` — блок tablicy: **две строки на всю ширину** (`col-span-2`; «Km wg weryfikatora» не помещается в полширины карточки) под разделителем `border-t border-border/60 pt-2` — тем же, что у строки «Soboty». Если у месяца есть и «Soboty», блок tablicy идёт **после** неё.

```
┌ 2025-09 ─────────────────────────────────┐
│ Dni rob.        14   Km/dz.         540   │
│ €/km          0,50   Km/mc        7 560   │
│ ───────────────────────────────────────── │
│ Km wg weryfikatora                2 000   │
│ Wpisane dni                   ⚠ 13 z 14   │
└───────────────────────────────────────────┘
```

- `off`-месяц: блок tablicy **не рендерится** (в карточке строку можно убрать — то же правило, что для `€/km`, §16.5.2).
- Итоговая плашка под карточками (`bg-bg`): вторая строка `boardTotalKm` «Razem (km wg weryfikatora)» + `boardSettlement.mileageEffective` (тот же живой итог, что в `tfoot`), тем же стилем, что «Razem (km gwarant.)», между строками `mt-1.5`.

#### §16.5.6 Staff: плашка «brak danych» + гейт `ZAAKCEPTOWANO` в `ClaimModal` (NEW 2026-09-24)

```ts
const board = claim.boardSettlement;                       // нет у перевозчика и у «всё активно»
const boardIncomplete = board != null && board.complete === false;
```

**Гейт акцепта — тот же механизм, что `metGuarantee` (§6.5.5 «Acceptance gate by recalc result»): `ZAAKCEPTOWANO` УДАЛЯЕТСЯ из опций `<Select>`**, не дизейблится.

- `availableTargets` фильтрует `ZAAKCEPTOWANO` при `metGuarantee || boardIncomplete`; существующий эффект, сбрасывающий устаревший выбор `ZAAKCEPTOWANO`, срабатывает по тому же `||`.
- **`REKLAMACJA_ZAAKCEPTOWANO` не трогаем** — uznana reklamacja платит свою замороженную сумму, tablica в ней не участвует (§6.5.15 D).
- `ODRZUCONO` остаётся всегда. «Zapisz weryfikację» гейт **не** затрагивает — сохранять верификацию с дырами можно.
- Почему удаление, а не `<option disabled>`: один механизм на все причины «акцепт сейчас невозможен»; нативная disabled-опция не несёт причины и по-разному озвучивается скринридерами; причина стоит прямо над селектом (плашка ниже).
- **`metGuarantee` старше.** Недостающие дни могут только **добавить** км, т.е. только уменьшить `kmDifference`. Если гарантия выезжена уже по неполной tablicy, после дозаполнения она останется выезженной. Поэтому при `metGuarantee` показывается только существующий `guaranteeMetHint`, а плашка «brak danych» **не** рендерится — её обещание «zaakceptować można po uzupełnieniu» было бы ложью.
- Отдельной строки-подсказки **под** селектом для этого гейта нет: плашка стоит прямо над ним, третье повторение того же факта — шум.

**Плашка `<BoardGapNotice>`** (композиция в `ClaimModal.tsx`, рядом с `InTransitGateBlock`).

Условие:
```
boardIncomplete && !metGuarantee && !inTransitGated && !isReklamacja
&& (claim.status === 'NA_WERYFIKACJI' || claim.status === 'OCZEKUJE_NA_AUTORYZACJE')
```
Гейтится **статусом, а не ролью**: ролевого гейта нет, видит любой, кто открывает `ClaimModal` (pracownik / admin; opiekun с 2026-10-22 wnioski не видит). Рендерится и в `view`, и в `edit` — в `view` читатель узнаёт, почему акцепта не будет, ещё до перехода в редактирование. При `inTransitGated` не рендерится: пока выезд в трассе, дыры на tablicy ожидаемы, а баннер «Wyjazd jeszcze w trasie» уже блокирует всё — одно объяснение на факт.

**Место: внутри `<DecisionPanel>`, первым дочерним элементом** — над `DecisionFields` (edit) / над абзацем `decisionRequired` (view). **Не** отдельным блоком над панелью, как Maksim / in-transit: те блокируют решение целиком (danger), этот убирает одну опцию — поэтому живёт в панели, непосредственно над селектом, в котором этой опции нет.

| Слот | Оформление |
|---|---|
| Контейнер | `<section role="status" aria-labelledby={titleId} className="rounded-md border border-warning/40 bg-warning-bg px-3 py-3 dark:bg-warning/15">` — рецепт поверхности `progExceededHint`, **0 новых токенов** |
| Тон | **warning, не danger.** Действие нужно от другого человека (weryfikator), читатель ничего не сломал; отклонить можно |
| Иконка | `<CalendarX size={16} aria-hidden className="mt-0.5 shrink-0 text-warning-dark dark:text-warning" />` |
| Заголовок | `<h4 id={titleId} className="text-sm font-bold text-warning-dark dark:text-warning">` ← `boardGate.title` «Brak danych za 2 dni» |
| Текст | `<p className="mt-1 text-sm text-text">` ← `boardGate.body` |
| Даты | `<ul aria-label={t('datesLabel')} className="mt-2 flex flex-wrap gap-1.5">`, каждая `<li className="rounded border border-warning/40 bg-card px-1.5 py-0.5 text-xs tabular-nums text-text">` |
| Подсказка дня съезда | `<p className="mt-2 text-xs text-text-sub">` ← `boardGate.returnDayHint`, **только** если `missingDates` содержит последний день периода (`claim.dateEnd.slice(0, 10)`) |

- **Источник дат:** `boardSettlement.missingDates` (верхнего уровня — уже только активные месяцы). `count` в заголовке = его длина. Сортировать по возрастанию защитно.
- **Формат даты:** `Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })`, `YYYY-MM-DD` парсится как **локальная** дата (`new Date(y, m − 1, d)`, как `formatExcludedDate` в `BreakdownTable`) — без UTC-сдвига. Год всегда: период может пересекать Новый год. Пунктуация — та, что даёт Intl (≈ «czw., 18.09.2025» / «Thu, 18/09/2025»).
- **Свёртка длинного списка:** ≤ 8 дат — все. > 8 — первые 6 + кнопка `boardGate.showAll` «Pokaż wszystkie (14)»; развёрнуто — все + `boardGate.showLess` «Zwiń». Кнопка: `<button type="button" aria-expanded={open} className="mt-1.5 py-1 text-xs font-semibold text-text underline-offset-2 hover:underline">`. Скрывать 1–2 даты ради кнопки бессмысленно — отсюда порог 8, а не 6. Число в заголовке всегда полное.
- Если `complete === false`, но `missingDates` пуст (защитно) — список и кнопка не рендерятся; заголовок берёт ветку `=0` («Brak danych na tablicy km»).

```
┌ DECYZJA ───────────────────────────────────────────────────────────┐
│ ┌ [CalendarX] Brak danych za 2 dni ─────────────────────────────┐ │  ← amber, role=status
│ │ Weryfikator nie wpisał jeszcze przebiegu na tablicy km za      │ │
│ │ poniższe dni w miesiącach z gwarancją. Zaakceptować wniosek…   │ │
│ │ [śr., 17.09.2025] [czw., 18.09.2025]                           │ │
│ │ Ostatni dzień okresu to zwykle dzień zjazdu — …                │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ Decyzja *  [ Wybierz decyzję       ▾ ]   ← без ZAAKCEPTOWANO         │
└────────────────────────────────────────────────────────────────────┘
```

**Ответы 422 на решение** — в `updateM.onError`, тем же паттерном, что `CLAIM_AUTHORIZATION_REQUIRED` / `CLAIM_DELEGATION_IN_TRANSIT`: ключ — `problemCode(err)`, инвалидировать `[...CLAIMS_KEY, 'detail', claim.nrZgl]`, показать **локализованный** тост (серверный польский `detail` не выводим — EN-интерфейс получил бы польский), `return`.

| Код | Что делает UI | Тост |
|---|---|---|
| `CLAIM_BOARD_INCOMPLETE` | инвалидация → свежий `boardSettlement` → опция `ZAAKCEPTOWANO` пропадает, устаревший выбор сбрасывается эффектом, появляется плашка | `toast.error(tBoard('incompleteToast', { count: extensions.missingDates?.length ?? 0 }))` |
| `CLAIM_BOARD_CHANGED` | инвалидация + локальный флаг `boardChanged = true`, входит в `decisionGated` (селект disabled), сбрасывается в `verifyM.onSuccess`. Подсказка `boardGate.changedHint` — в существующем слоте gate-hint под селектом (`text-xs text-text-sub`, `role="status"`), приоритет: после in-transit, **перед** подсказками верификации | `toast.error(tBoard('changedToast'))` |

Зачем локальный флаг для `CHANGED`: без него pracownik повторяет то же решение, получает тот же 422, и тост выглядит как петля. Флаг чисто клиентский; правда остаётся на сервере (после повторного «Zapisz weryfikację» сервер сам решит, можно ли теперь).

> **Открытый вопрос к api-agent (не дизайн):** docs/20 §0⁵ блокирует и авто-переход в `OCZEKUJE_NA_AUTORYZACJE`, пока tablica неполна. `progExceededHint` в блоке DOPŁATA обещает «po zapisaniu weryfikacji wniosek automatycznie przejdzie w stan „Czeka na autoryzację”». Если api действительно пропускает переход при `complete === false`, web **скрывает `progExceededHint` при `boardIncomplete`** (объяснение — янтарная плашка). Новый копирайт не нужен.

#### §16.5.7 i18n (2026-09-24) — готово к вставке

**`messages/pl.json` → `carrier.breakdown`:** **удалить** `gapNotice`, `gapNoticeMonth`; **добавить**:

```json
"mixedPeriodNotice": "Okres obejmuje {count, plural, one {miesiąc bez gwarancji} few {miesiące bez gwarancji} many {miesięcy bez gwarancji} other {miesięcy bez gwarancji}}. Dopłata zależy wtedy od przebiegu pojazdu w dniach objętych gwarancją, a nie od łącznego przebiegu podanego we wniosku. <b>Ostateczną kwotę ustala się po weryfikacji wniosku.</b>",
"boardNotice": "Okres obejmuje {count, plural, one {miesiąc bez gwarancji} few {miesiące bez gwarancji} many {miesięcy bez gwarancji} other {miesięcy bez gwarancji}}. Dopłatę liczy się z tablicy km weryfikatora — tylko z dni w miesiącach z gwarancją. <b>Przebieg podany przez przewoźnika nie wpływa na kwotę — służy tylko do porównania.</b>",
"boardKm": "Km wg weryfikatora",
"boardDays": "Wpisane dni",
"boardDaysValue": "{filled} z {required}",
"boardSaturdaysValue": "{filled} z {required} sob.",
"boardDaysMissingSr": "brak danych za {count, plural, one {# dzień} few {# dni} many {# dni} other {# dni}}",
"boardOffTitle": "Nie liczy się — gwarancja wyłączona w tym miesiącu",
"total": "Razem",
"boardTotalKm": "Razem (km wg weryfikatora)"
```

**`messages/en.json` → `carrier.breakdown`:** **удалить** `gapNotice`, `gapNoticeMonth`; **добавить**:

```json
"mixedPeriodNotice": "The period includes {count, plural, one {a month} other {months}} without a mileage guarantee. In that case the compensation depends on the vehicle's mileage on the guaranteed days, not on the total mileage entered in the claim. <b>The final amount is set once the claim has been verified.</b>",
"boardNotice": "The period includes {count, plural, one {a month} other {months}} without a mileage guarantee. The compensation is calculated from the verifier's km board — only days in guaranteed months count. <b>The mileage entered by the carrier does not affect the amount — it is for comparison only.</b>",
"boardKm": "Km per verifier",
"boardDays": "Days entered",
"boardDaysValue": "{filled} of {required}",
"boardSaturdaysValue": "{filled} of {required} Sat.",
"boardDaysMissingSr": "no data for {count, plural, one {# day} other {# days}}",
"boardOffTitle": "Not counted — the guarantee is disabled for this month",
"total": "Total",
"boardTotalKm": "Total (km per verifier)"
```

**`messages/pl.json` → `employee.claims.modal.boardGate`** (новый объект, сосед `maksimGate` / `inTransitGate`):

```json
"boardGate": {
  "title": "{count, plural, =0 {Brak danych na tablicy km} one {Brak danych za # dzień} few {Brak danych za # dni} many {Brak danych za # dni} other {Brak danych za # dni}}",
  "body": "Weryfikator nie wpisał jeszcze przebiegu na tablicy km za poniższe dni w miesiącach z gwarancją. Zaakceptować wniosek można dopiero po uzupełnieniu danych; odrzucić — w każdej chwili.",
  "datesLabel": "Dni bez przebiegu na tablicy km",
  "showAll": "Pokaż wszystkie ({count})",
  "showLess": "Zwiń",
  "returnDayHint": "Ostatni dzień okresu to zwykle dzień zjazdu — na tablicy km można go wpisać dopiero następnego dnia.",
  "incompleteToast": "Nie można zaakceptować wniosku — {count, plural, =0 {brak przebiegu na tablicy km w dniach z gwarancją} one {brak przebiegu na tablicy km za # dzień} few {brak przebiegu na tablicy km za # dni} many {brak przebiegu na tablicy km za # dni} other {brak przebiegu na tablicy km za # dni}}. Poczekaj, aż weryfikator uzupełni dane.",
  "changedToast": "Kwota dopłaty różni się od zapisanej przy weryfikacji — zmieniła się tablica km albo dane wniosku. Zapisz weryfikację ponownie, a następnie podejmij decyzję.",
  "changedHint": "Kwota dopłaty zmieniła się od zapisania weryfikacji — zapisz weryfikację ponownie, aby podjąć decyzję.",
  "changedHintNoEdit": "Kwota dopłaty zmieniła się od zapisania weryfikacji — weryfikację musi ponownie zapisać administrator."
}
```

**`messages/en.json` → `employee.claims.modal.boardGate`:**

```json
"boardGate": {
  "title": "{count, plural, =0 {No data on the km board} one {No data for # day} other {No data for # days}}",
  "body": "The verifier has not yet entered mileage on the km board for the days below in guaranteed months. The claim can be accepted only once the data is complete; it can be rejected at any time.",
  "datesLabel": "Days without mileage on the km board",
  "showAll": "Show all ({count})",
  "showLess": "Show less",
  "returnDayHint": "The last day of the period is usually the return day — it can only be entered on the km board the following day.",
  "incompleteToast": "The claim cannot be accepted — {count, plural, =0 {mileage is missing on the km board for guaranteed days} one {mileage is missing on the km board for # day} other {mileage is missing on the km board for # days}}. Wait until the verifier completes the data.",
  "changedToast": "The compensation amount differs from the one saved at verification — the km board or the claim data has changed. Save the verification again, then make the decision.",
  "changedHint": "The compensation amount changed since the verification was saved — save the verification again to make a decision.",
  "changedHintNoEdit": "The compensation amount changed since the verification was saved — an administrator must save the verification again."
}
```

> **2026-09-24, реализация (web-agent, решение main agent):** `changedToast` / `changedHint` переписаны нейтрально — «kwota różni się od zapisanej… zmieniła się tablica km **albo dane wniosku**» вместо «tablica km zmieniła się». Причина: web отправляет вместе с решением **все** correction-поля, поэтому 422 `CLAIM_BOARD_CHANGED` на смешанном периоде вызывает и несохранённая корректировка, не только правка tablicy (docs/13, `CLAIM_BOARD_CHANGED`). Текст, винящий tablicę, в этом случае был бы неправдой. PL-текст toast-а совпадает с серверным `detail`.
>
> **`changedHintNoEdit`** (добавлен 2026-09-24): вариант `changedHint` для пользователя, у которого **нет** кнопки «Zapisz weryfikację» (`perms.showVerifyButton === false` — на практике pracownik @ `OCZEKUJE_NA_AUTORYZACJE`, где пересохранить верификацию может только admin, 422 `CLAIM_VERIFY_ADMIN_ONLY`). Показывается в том же слоте gate-hint вместо `changedHint`, когда решение заблокировано флагом `boardChanged`. Велеть «zapisz weryfikację ponownie» тому, кто этого сделать не может, — тупик.

Параметры: `count` — число (ICU-плюрал); `filled` / `required` — числа; `<b>` — rich-тег для `t.rich` (как у удалённого `gapNotice`). `total` и `boardTotalKm` используются только в staff-варианте; у перевозчика футер по-прежнему `totalKmGuaranteed`.

#### §16.5.8 Acceptance checklist (2026-09-24, web-agent)

- [ ] Период «все месяцы активны» у перевозчика и у staff **пиксельно как до изменения**: нет ноты, нет колонок tablicy, нет гейта.
- [ ] Смешанный период определяется **только** по `mileageSource === 'board'`, не по строкам; без поля — `'declared'`.
- [ ] Перевозчик: одна нота `mixedPeriodNotice`, **ни одного** числа км / дней в ней; `mileageEffective` не показывается нигде; stat-карточки превью не изменились; бейджи / приглушение / `—` §16.5.2 на месте.
- [ ] `gapNotice` / `gapNoticeMonth` удалены из обоих `messages/*.json`, prop `mileage` удалён из `<BreakdownTable>` и всех трёх вызовов.
- [ ] Staff: нота `boardNotice`, колонки «Km wg weryfikatora» / «Wpisane dni» справа от `Km/mc` с `border-l`; `off` → `—` (с `title`); `saturdaysOnly` → «X z Y sob.»; неполный месяц — янтарь + иконка + sr-only.
- [ ] Staff-вариант переключает таблицу / карточки на **40rem** литеральными классами; в карточке `off`-месяца блока tablicy нет; итоговая плашка карточек — две строки.
- [ ] `tfoot` staff: «Razem» | `kmGuaranteed` | `boardSettlement.mileageEffective` (сходится с суммой колонки) | пусто.
- [ ] `ZAAKCEPTOWANO` **удалено** из опций при `boardIncomplete` (тем же фильтром, что `metGuarantee`), устаревший выбор сброшен; `REKLAMACJA_ZAAKCEPTOWANO`, `ODRZUCONO` и «Zapisz weryfikację» не затронуты.
- [ ] `<BoardGapNotice>` внутри `<DecisionPanel>` первым элементом, в view и edit; не рендерится при `metGuarantee`, `inTransitGated`, reklamacji и вне `NA_WERYFIKACJI` / `OCZEKUJE_NA_AUTORYZACJE`; opiekun её видит.
- [ ] Даты: локальный парсинг, год всегда, по возрастанию; > 8 → 6 + «Pokaż wszystkie (N)» с `aria-expanded`; `returnDayHint` только когда пропущен последний день периода.
- [ ] 422 `CLAIM_BOARD_INCOMPLETE` / `CLAIM_BOARD_CHANGED` → инвалидация detail + локализованный тост; `CHANGED` держит решение закрытым с `changedHint` до успешного «Zapisz weryfikację».
- [ ] Dark mode: `bg-warning-bg` / `dark:bg-warning/15`, `text-warning-dark` / `dark:text-warning` проверены в обеих темах.
- [ ] **0 новых токенов, 0 новых примитивов.**

#### §16.5.9 Deviations (web-agent implementation, 2026-09-24)

Токены, иконки, копирайт (кроме `changedToast` / `changedHint` / `changedHintNoEdit`, см. примечания в §16.5.7) и визуальные рецепты §16.5.1–§16.5.8 — без изменений.

**Источник данных в `ClaimModal` — как в §16.5.5 / §16.5.6, без отклонений:** таблица, гейт `ZAAKCEPTOWANO` и плашка «brak danych» читают **сохранённую пару claim-а** — `claim.breakdown` + `claim.boardSettlement` из `GET /claims/:nrZgl`, для всех ролей и в обоих режимах. Живое превью в таблицу не попадает. Период «все месяцы активны» (`claim.boardSettlement === null`, `mileageSource !== 'board'`) рендерится в модалке так же, как до фичи, в `view` и в `edit`.

Отклонения от буквы спеки:

1. **Dopłata решённого смешанного wniosku — сохранённая, не живая** (решение main agent, дополнение к §6.5.4). Живое превью `POST /claims/:nrZgl/preview` статус не проверяет, поэтому модалка и до фичи показывала в поле DOPŁATA (и в `<RecalcBadge>`) пересчитанную сумму даже для решённых wniosków. Для смешанного периода пересчёт идёт по tablicy «сейчас» и уезжает от решённой суммы при первой правке tablicy. Поэтому **ровно** при `claim.breakdown.mileageSource === 'board'` **и** статусе `ZAAKCEPTOWANO` / `ODRZUCONO` поле показывает сохранённый `claim.paymentEur` (бейдж тогда без дельты). `kmDifference` модалка не выводит (живой нужен только гейту `metGuarantee`, у решённого wniosku опций решения нет) — его не трогаем. **→ Устарело с §16.5.10:** модалка теперь выводит niedojazd под полем dopłaty, и он обязан брать `kmDifference` из **того же** объекта, что сумма (для решённого смешанного — сохранённый claim). Все остальные статусы (включая `REKLAMACJA`) и периоды «все активны» — как было.
2. ~~«Razem» колонки tablicy = `breakdown.mileageEffective`~~ — **ОТМЕНЕНО 2026-09-24 (баг из ручного теста).** Итог колонки «Km wg weryfikatora» (`tfoot` и вторая строка итоговой плашки карточек) = **`boardSettlement.mileageEffective`**, как и было в §16.5.5: колонка суммирует тот же живой источник, что её строки, и поэтому всегда сходится. Репро прежнего варианта: смешанный период 24.08–18.09.2026, wniosek подан при пустом дне сентября (посчитан на 4950 км), weryfikator потом дописал день — строка сентября показывала 5450 / «18 z 18», а «Razem» — устаревшие 4950 (`breakdown.mileageEffective` с момента подачи). Выплата по-прежнему выводится **только** в поле dopłaty; `boardSettlement.paymentEur` нигде не показывается, сохранённая dopłata решённого смешанного wniosku (п. 1) не меняется.
3. **`count` в `mixedPeriodNotice` / `boardNotice` = число месяцев с выключенной гарантией в будни (`kmPerDay === 0`)**, т.е. `disabled` **и** «tylko soboty», а не только `disabled`. Период «tylko soboty + активный» тоже `mileageSource === 'board'` (`settlementNeedsBoard`), и счёт только `disabled` дал бы `count = 0` → «Okres obejmuje miesięcy bez gwarancji». Бейдж «Gwarancja tylko w soboty» под нотой уточняет, какой это месяц.
4. **Несохранённые корректировки на смешанном периоде убирают `ZAAKCEPTOWANO`** (решение main agent, дополнение к §16.5.6). Условие: **сохранённый** период смешанный (`claim.boardSettlement` или `claim.breakdown.mileageSource === 'board'`; живое превью не учитывается — период «все активны» в `edit` ведёт себя как до фичи) **и** fact-блок редактируем (`perms.payloadIncludesCorrections`) **и** есть грязные correction-поля (`correctionsDirty`, тот же RHF dirty-state, что гейт чекпоинта). Механизм тот же, что у `metGuarantee` (удаление опции + сброс устаревшего выбора); подсказка — `boardGate.changedHint` в слоте gate-hint, **после** подсказок чекпоинта и Maksima. На практике срабатывает только у admin @ `OCZEKUJE_NA_AUTORYZACJE` — в `NA_WERYFIKACJI` грязные корректировки и так закрывают решение гейтом чекпоинта. Цель — чтобы 422 `CLAIM_BOARD_CHANGED` почти не случался.
5. **`progExceededHint` скрывается при неполной tablicy по любому из двух чтений** — `claim.boardSettlement` (сохранённые входы) **или** `boardSettlement` живого превью (текущие правки — ровно то, что посчитает «Zapisz weryfikację»; сама подсказка и так считается из превью). Так подсказка никогда не обещает переход, который api пропустит (открытый вопрос §16.5.6 закрыт: api пропускает авто-переход при неполной tablicy, docs/13). Это единственное место, где читается board из превью; на экран он не выводится.
6. **`boardGate.changedHintNoEdit`** — если решение закрыто флагом `CLAIM_BOARD_CHANGED`, а у пользователя нет кнопки «Zapisz weryfikację» (`perms.showVerifyButton === false`: pracownik @ `OCZEKUJE_NA_AUTORYZACJE`), вместо `changedHint` («zapisz weryfikację ponownie») выводится «weryfikację musi ponownie zapisać administrator». Toast `changedToast` не меняется.
7. **Кнопка «Pokaż wszystkie» получила `aria-controls`** на список дат (a11y, сверх `aria-expanded`).

#### §16.5.10 Niedojazd в блоке DOPŁATA (`ClaimModal`, staff) (NEW 2026-09-24)

**Проблема.** В модалке есть гарантия (`Km/mc`, «Razem»), км tablicy, сумма dopłaty и `<RecalcBadge>`, но нигде прямо не сказано «pojazd przejechał o 2 180 km mniej, niż gwarantowano». `kmDifference` модалка не выводит вообще (живое значение кормит только гейт `metGuarantee`). Pracownik вынужден вычитать в уме, а это ровно то число, за которое платят.

**Размещение (locked): две строки прямо под полем dopłaty, над `<FormDescription>` «wyliczana automatycznie».** Порядок чтения блока: *сумма → почему такая сумма → она автоматическая*.

```
DOPŁATA GWARANCYJNA                          [RecalcBadge] [Przelicz wg aktualnych limitów]
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1 090,00 €                                                           [Lock] │
└─────────────────────────────────────────────────────────────────────────────┘
W miesiącach z gwarancją pojazd przejechał o 2 180 km mniej, niż gwarantowano.   ← text-sm text-text, «2 180 km mniej» — font-semibold
Niedojazd: 7 630 km gwarant. − 5 450 km wg weryfikatora = 2 180 km × 0,50 €/km   ← text-xs text-text-sub tabular-nums
[Lock] wyliczana automatycznie
```

Почему здесь, а не в другом месте:

| Вариант | Решение |
|---|---|
| **Под полем dopłaty** | **выбран.** Niedojazd — причина суммы; его место непосредственно у суммы. Читается одним взглядом вместе с полем и бейджем, одинаково в `view` и `edit` |
| Строка «Razem» в `<BreakdownTable>` | **нет.** Таблица читает **сохранённую** пару claim-а (§16.5.9), а dopłata — живое превью: в `edit` строки разъехались бы, и `niedojazd × stawka ≠ dopłata`. Кроме того, в периоде «все активны» у таблицы нет колонки пробега — пришлось бы менять таблицу, которая по §16.5.8 должна остаться прежней |
| Отдельная stat-карточка / плитка | **нет.** Модалка и так плотная; третья «цифра» рядом с полем и бейджем спорила бы с суммой за внимание. Строка текста подчинена полю, карточка — нет |
| Только формула «7630 − 5450 = 2180 km» | **недостаточно.** Формулу надо расшифровывать; пожелание PO — сказать словами. Поэтому первая строка — фраза, вторая — формула для проверки |

**Роли.** Там же, где поле dopłaty: pracownik / admin — все, кто открывает `ClaimModal`, в `view` и в `edit`, во всех статусах, где рендерится блок DOPŁATA. Отдельного гейта по роли нет. Для смешанного периода staff и так видит км tablicy (§16.5.5) — новых данных строка не раскрывает.

**Перевозчик — ничего нового.** Карточка «Różnica km» в `<LivePreviewPanel>` остаётся как есть; на странице wniosku перевозчика ни фразы, ни формулы нет. Требование «перевозчик не видит цифр tablicy, которых не видел раньше» выполняется тем, что мы ему ничего не добавляем. (Факт для PO: `Km gwarantowane − Różnica km` в превью перевозчика уже сейчас арифметически равно сумме km tablicy для смешанного периода — это было принято в §16.5.3 и здесь не меняется.)

**Источник чисел — тот же объект, что у dopłaty (жёсткое правило).** Все четыре числа строки берутся из **одного** объекта — того, из которого поле берёт сумму:

```ts
// тот же выбор, что у liveDoplata; web может свести их в один объект
const src = showStoredDoplata ? claim : (previewQ.data ?? claim);
// src.kmGuaranteed, src.kmDifference, src.ratePerKmEffective, src.paymentEur,
// src.breakdown?.mileageSource
const driven = src.kmGuaranteed − src.kmDifference;   // = mileageEffective
```

- Никогда не смешивать `previewQ.data.kmDifference` с `claim.kmGuaranteed` (или наоборот): только так `niedojazd × stawka` всегда сходится с суммой в поле.
- Решённый смешанный wniosek (`showStoredDoplata`, §16.5.9 п.1) → сохранённые значения claim-а; всё остальное → живое превью с откатом на claim.
- **До прихода превью / во время дебаунса / при ошибке превью** — ровно как поле: показываем то, что показывает поле (claim до первого ответа; прошлый ответ, пока идёт пересчёт — `placeholderData`; claim при ошибке без данных). Ни скелетона, ни «—», ни приглушения — строка не должна вести себя иначе, чем сумма над ней; о пересчёте сообщает `<RecalcBadge>`.
- `scope` («board» / «declared») — из `src.breakdown?.mileageSource` того же объекта; отсутствие ⇒ `declared`. Если pracownik правкой дат превратил период из смешанного во «все активны», формулировка переключится вместе с суммой.

**Состояния.**

| Условие (по `src`) | Строка 1 | Строка 2 (формула) |
|---|---|---|
| `kmGuaranteed === 0` (весь период без гарантии) | **не рендерится** — факт уже объяснён `<EmptyState>` в таблице (§16.5.4), одно объяснение на факт | не рендерится |
| `isCompensationDue(kmDifference)` (niedojazd > 0) — тот же предикат, что у гейта `metGuarantee` | `shortfall.line` | `shortfall.formula` |
| `kmDifference === 0` | `shortfall.metEqual` | не рендерится |
| `kmDifference < 0` | `shortfall.metOver`, `km = |kmDifference|` — **отрицательное число не показываем никогда** | не рендерится |

- «Gwarancja wyjeżdżona» — тот же термин, что у `guaranteeMetHint` в Decyzji; фразы не противоречат друг другу.
- Тон: строка niedojazdu — `text-sm text-text`, выделение `<b>` → `font-semibold tabular-nums`; строки «wyjeżdżona» — `text-sm text-text-sub`. **Без семантического цвета и без иконки** (правило §16.6: сумма к выплате — не «плохо», её отсутствие — не «хорошо»).
- Без `aria-live`: строка пересчитывается на каждую правку, живой регион болтал бы на каждый символ. Об изменении суммы уже сообщает `<RecalcBadge>`.
- Формула **без** «= {dopłata}» в конце: сумма стоит строкой выше в поле, а повтор с округлением `round2` мог бы разойтись на цент с эффективной ставкой многомесячного периода.

**Формулировки по периоду.** `scope = 'board'` (смешанный): «W miesiącach z gwarancją pojazd przejechał …» и «km wg weryfikatora» — понятно, что сравнивались только активные месяцы и только km tablicy (`driven` = итог колонки «Km wg weryfikatora»). `scope = 'declared'` (все активны): «Pojazd przejechał …» и «km przebiegu» — это поле «Przebieg / km zrealizowane» после правок pracownika. `km gwarant.` — тот же сокращённый термин, что «Razem (km gwarant.)».

**Форматирование.** Параметры — предформатированные строки (как во всём `BreakdownTable`): `km` / `guaranteed` / `driven` — `Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })` (`mileageEffective` бывает с копейками — `333,33`; `formatInt` дал бы видимое расхождение с суммой); `rate` — `{ minimumFractionDigits: 2, maximumFractionDigits: 4 }` (эффективная ставка многомесячного периода может быть не круглой). Разность `kmGuaranteed − kmDifference` в JS считается с плавающей ошибкой — форматтер с `maximumFractionDigits: 2` её убирает.

**Термины: «Niedojazd» у staff vs «Różnica km» у перевозчика — расхождение намеренное.** Карточка перевозчика — это знаковое сырое число (может быть отрицательным), и слово «niedojazd» рядом с «−500» было бы бессмыслицей. Staff получает фразу, в которой знак заменён словами «mniej» / «więcej», поэтому здесь можно назвать вещь её рабочим именем. Карточку перевозчика не трогаем.

**i18n — `messages/pl.json` → `employee.claims.modal.shortfall`** (новый объект):

```json
"shortfall": {
  "line": "{scope, select, board {W miesiącach z gwarancją pojazd przejechał} other {Pojazd przejechał}} o <b>{km} km mniej</b>, niż gwarantowano.",
  "formula": "Niedojazd: {guaranteed} km gwarant. − {driven} {scope, select, board {km wg weryfikatora} other {km przebiegu}} = {km} km × {rate} €/km",
  "metEqual": "{scope, select, board {W miesiącach z gwarancją pojazd przejechał} other {Pojazd przejechał}} dokładnie tyle, ile gwarantowano ({guaranteed} km). Gwarancja wyjeżdżona — dopłata nie przysługuje.",
  "metOver": "{scope, select, board {W miesiącach z gwarancją pojazd przejechał} other {Pojazd przejechał}} {driven} km przy {guaranteed} km gwarantowanych — o {km} km więcej. Gwarancja wyjeżdżona — dopłata nie przysługuje."
}
```

**`messages/en.json` → `employee.claims.modal.shortfall`:**

```json
"shortfall": {
  "line": "{scope, select, board {In the guaranteed months the vehicle drove} other {The vehicle drove}} <b>{km} km less</b> than guaranteed.",
  "formula": "Shortfall: {guaranteed} guaranteed km − {driven} {scope, select, board {km per verifier} other {km driven}} = {km} km × {rate} €/km",
  "metEqual": "{scope, select, board {In the guaranteed months the vehicle drove} other {The vehicle drove}} exactly the guaranteed distance ({guaranteed} km). Guarantee met — no compensation is due.",
  "metOver": "{scope, select, board {In the guaranteed months the vehicle drove} other {The vehicle drove}} {driven} km against {guaranteed} guaranteed km — {km} km more. Guarantee met — no compensation is due."
}
```

Параметры: `scope` — `'board'` | `'declared'` (ветка `other` покрывает `declared` и отсутствие поля); `km`, `guaranteed`, `driven`, `rate` — строки; `<b>` — rich-тег, `t.rich` (только в `line`). Остальные ключи — `t()`.

**Acceptance checklist (§16.5.10):**

- [ ] Две строки стоят **между** полем dopłaty и `<FormDescription>` «wyliczana automatycznie», в `view` и `edit`, для pracownik / admin.
- [ ] Все числа строки и сумма в поле берутся из **одного** объекта `src` (решённый смешанный → claim; иначе `previewQ.data ?? claim`). На скриншоте в `edit` после правки км: `niedojazd × stawka` = сумма в поле.
- [ ] До ответа превью / во время пересчёта / при ошибке строка ведёт себя ровно как поле: без скелетона, без «—», без приглушения.
- [ ] `kmDifference > 0` → фраза + формула; `= 0` → `metEqual`; `< 0` → `metOver` с модулем; **отрицательное число нигде не выводится**; `kmGuaranteed === 0` → строк нет.
- [ ] Смешанный период (`src.breakdown.mileageSource === 'board'`) → «W miesiącach z gwarancją…» и «km wg weryfikatora»; в примере 7 630 − 5 450 = 2 180 km × 0,50 €/km при dopłacie 1 090,00 €; `driven` совпадает с итогом колонки «Km wg weryfikatora», когда превью и сохранённая пара считаны с одних входов.
- [ ] Км — до 2 знаков после запятой, ставка — 2–4 знака; без семантического цвета, без иконки, без `aria-live`.
- [ ] У перевозчика **ничего не изменилось**: `<LivePreviewPanel>` и страница wniosku — пиксельно как раньше.
- [ ] **0 новых токенов, 0 новых примитивов, 0 правок API.**

### §16.6 — «Przelicz wg aktualnych limitów» — кнопка и диалог сравнения

Суммы wniosek-а заморожены снимком лимитов на момент подачи (см. memory: `Claim.mileage`/суммы — снимок). Когда админ исправил лимит задним числом, это **единственный** способ подтянуть исправление.

**Размещение (locked): в блоке DOPŁATA (§6.5.4), в его header-строке, справа от `<RecalcBadge>` — не в футере.** Футер принадлежит решению («Zaakceptuj» / «Odrzuć»), и кнопка пересчёта рядом с ними читалась бы как третий вариант решения. Пересчёт действует на сумму — значит, живёт у суммы, ровно по нарративу §6.5.2 «факты → следствие → решение».

| Аспект | Значение |
|---|---|
| Вид | `<Button type="button" variant="outline" size="sm"><RefreshCw size={14} aria-hidden /> Przelicz wg aktualnych limitów</Button>` — вторичное действие, никогда не primary и не destructive |
| Роли | `admin`, `pracownik` (wniosek верифицирует именно `pracownik`; у `weryfikator` по [03-roles.md](03-roles.md) доступа к `/claims` нет вовсе). Для остальных **не рендерится** (§6.5.13 hard rule: невозможное действие удаляется, а не дизейблится) |
| Состояния статуса | скрыта на уже решённых wniosek-ах (`ZAAKCEPTOWANO` / `ODRZUCONO`) — пересчёт решённой заявки идёт через реклямацию, это другой поток |
| Контекст рядом | статичная строка в том же блоке `text-xs text-text-sub`: `recalc.snapshotNote` — «Kwoty wyliczono wg limitów z dnia złożenia wniosku (12.02.2026).» Без неё кнопка необъяснима |
| Отличие от `<RecalcBadge>` | бейдж — живой дебаунс-пересчёт по правкам фактов; кнопка — подтягивание **другого набора лимитов**. Их видно одновременно, они не конфликтуют |

**`<RecalcLimitsDialog>`** — небольшой `<Dialog max-w-md>` (не `<ConfirmDialog>`: тому можно передать только строку, а нам нужна таблица «было → станет»).

```
┌ Przelicz wg aktualnych limitów ──────────────────────┐
│ Porównaj kwoty wyliczone przy złożeniu wniosku       │
│ z kwotami wg aktualnych limitów.                     │
│                                                      │
│                  Wniosek (obecnie)   Wg aktualnych   │
│  Km gwarantowane      9 000      →        5 500      │
│  Dopłata           1 750,00 €    →      950,00 €     │
│                                Różnica: −800,00 €    │
│                                                      │
│              [ Anuluj ]  [ Zastosuj nowe kwoty ]     │
└──────────────────────────────────────────────────────┘
```

| Слот | Оформление |
|---|---|
| Старые значения | `text-text-sub tabular-nums` |
| Новые значения | `font-semibold text-text tabular-nums` |
| Дельта | `text-xs text-text-sub tabular-nums` со знаком — **без семантического цвета**. Уменьшение выплаты не «плохо» и не «ошибка»; красная дельта обвиняла бы систему в поломке |
| Загрузка | `<Skeleton className="h-4 w-20">` в колонке «Wg aktualnych», confirm `disabled`, пока идёт запрос |
| Изменений нет | вместо таблицы — `recalc.noChange`; футер схлопывается в одну `[Zamknij]` (нечего применять) |
| Новая сумма = 0 | под таблицей строка `text-xs text-text-sub`: `recalc.toZero` — «Po przeliczeniu wniosek nie generuje dopłaty — będzie można go tylko odrzucić.» (связка с гейтом §6.5.5) |
| Ошибка | диалог **остаётся открытым**, `toast.error(recalc.error)`, повтор доступен |

После применения: значения в модалке обновляются, живой `<RecalcBadge>` показывает «Aktualne», `toast.success(recalc.success)`. Если в этот момент выбранная `targetStatus` была акцептующей, а `kmDifference` стал `<= 0`, — выбор сбрасывается в плейсхолдер ровно по правилу §6.5.5, отдельного сообщения не нужно.

### §16.7 — i18n-контракт (PL default + EN) — готово к вставке

**`messages/pl.json` → `limits`** (добавить к существующему объекту):

```json
"toggleDay": "Gwarancja km/dzień — {month}",
"toggleSaturday": "Gwarancja km/sobota — {month}",
"stateDefault": "domyślne: {kmPerDay} km/dz. · {rate} €/km",
"stateDisabled": "gwarancja wyłączona (0 km)",
"unsaved": "Nie zapisano — obowiązuje 0 km",
"unsavedHint": "Wpisz wartość, aby włączyć gwarancję. Puste pole = miesiąc pozostaje wyłączony.",
"unsavedRevertedSr": "Gwarancja pozostaje wyłączona",
"disabledRateHint": "Stawka zachowana — zostanie użyta po ponownym włączeniu gwarancji.",
"independenceHint": "Gwarancja dzienna i sobotnia są niezależne — miesiąc może mieć włączone tylko soboty.",
"defaultsNotice": "{count, plural, one {# miesiąc nie ma konfiguracji} few {# miesiące nie mają konfiguracji} many {# miesięcy nie ma konfiguracji} other {# miesięcy nie ma konfiguracji}} — obowiązuje wartość domyślna: {kmPerDay} km/dzień i {rate} €/km.",
"placeholderDefault": "{value} (domyślnie)",
"placeholderNoChange": "bez zmian",
"bulk": {
  "trigger": "Zastosuj do wielu miesięcy",
  "title": "Zastosuj limity do wielu miesięcy",
  "description": "Zmiany dotyczą tylko roku {year}. Pola pozostawione jako „bez zmian” nie nadpisują istniejących wartości.",
  "rangeLegend": "Zakres",
  "rangeAll": "Cały rok {year}",
  "rangeFromTo": "Od – do",
  "rangeCustom": "Wybrane miesiące",
  "from": "Od",
  "to": "Do",
  "monthsPlaceholder": "Wybierz miesiące",
  "monthsSearchPlaceholder": "Szukaj miesiąca",
  "monthsEmpty": "Brak wyników",
  "valuesLegend": "Wartości",
  "actionNoChange": "Bez zmian",
  "actionSet": "Włącz i ustaw wartość",
  "actionDisable": "Wyłącz (0 km)",
  "kmPerDayAction": "Km / dzień",
  "kmPerSaturdayAction": "Km / sobota",
  "ratePerKm": "Stawka € / km",
  "rateHint": "Puste pole = bez zmian. Stawka jest zachowywana również przy wyłączeniu gwarancji.",
  "errorValueRequired": "Podaj wartość albo wybierz „Bez zmian” lub „Wyłącz (0 km)”.",
  "errorNoMonths": "Wybierz co najmniej jeden miesiąc.",
  "errorNoChanges": "Nie wybrano żadnej zmiany.",
  "summaryLegend": "Podsumowanie",
  "summaryHeadline": "Zmienisz {changed} z {total} miesięcy roku {year}.",
  "summaryOverwrite": "{count, plural, one {# miesiąc ma już ustawione wartości — zostanie nadpisany} few {# miesiące mają już ustawione wartości — zostaną nadpisane} many {# miesięcy ma już ustawione wartości — zostaną nadpisane} other {# miesięcy ma już ustawione wartości — zostaną nadpisane}}.",
  "summaryNoop": "{count, plural, one {# miesiąc bez zmian} few {# miesiące bez zmian} many {# miesięcy bez zmian} other {# miesięcy bez zmian}}.",
  "summaryIrreversible": "Operacji nie można cofnąć. Poprzednie wartości pozostaną widoczne w audycie.",
  "colMonth": "Miesiąc",
  "colCurrent": "Obecnie",
  "colNew": "Po zmianie",
  "arrowSr": "zmiana na",
  "valueNone": "brak (domyślne)",
  "valueDisabled": "wyłączone",
  "valueNoChange": "bez zmian",
  "apply": "{count, plural, one {Zastosuj do # miesiąca} few {Zastosuj do # miesięcy} many {Zastosuj do # miesięcy} other {Zastosuj do # miesięcy}}",
  "applying": "Zapisywanie…",
  "successToast": "{count, plural, one {Zaktualizowano # miesiąc} few {Zaktualizowano # miesiące} many {Zaktualizowano # miesięcy} other {Zaktualizowano # miesięcy}}",
  "partialError": "{count, plural, one {Nie zapisano # miesiąca} few {Nie zapisano # miesięcy} many {Nie zapisano # miesięcy} other {Nie zapisano # miesięcy}} — spróbuj ponownie.",
  "retryFailed": "Ponów nieudane",
  "rowOk": "Zapisano",
  "rowFailed": "Błąd zapisu"
}
```

**`messages/en.json` → `limits`:**

```json
"toggleDay": "Daily km guarantee — {month}",
"toggleSaturday": "Saturday km guarantee — {month}",
"stateDefault": "default: {kmPerDay} km/day · {rate} €/km",
"stateDisabled": "guarantee disabled (0 km)",
"unsaved": "Not saved — 0 km applies",
"unsavedHint": "Enter a value to enable the guarantee. An empty field means the month stays disabled.",
"unsavedRevertedSr": "The guarantee stays disabled",
"disabledRateHint": "Rate kept — it will be used again when the guarantee is re-enabled.",
"independenceHint": "The daily and Saturday guarantees are independent — a month can have Saturdays only.",
"defaultsNotice": "{count, plural, one {# month has no configuration} other {# months have no configuration}} — the default applies: {kmPerDay} km/day and {rate} €/km.",
"placeholderDefault": "{value} (default)",
"placeholderNoChange": "no change",
"bulk": {
  "trigger": "Apply to several months",
  "title": "Apply limits to several months",
  "description": "Changes affect {year} only. Fields left as “no change” do not overwrite existing values.",
  "rangeLegend": "Range",
  "rangeAll": "Whole year {year}",
  "rangeFromTo": "From – to",
  "rangeCustom": "Selected months",
  "from": "From",
  "to": "To",
  "monthsPlaceholder": "Select months",
  "monthsSearchPlaceholder": "Search month",
  "monthsEmpty": "No results",
  "valuesLegend": "Values",
  "actionNoChange": "No change",
  "actionSet": "Enable and set a value",
  "actionDisable": "Disable (0 km)",
  "kmPerDayAction": "Km / day",
  "kmPerSaturdayAction": "Km / Saturday",
  "ratePerKm": "Rate € / km",
  "rateHint": "Empty field = no change. The rate is kept even when the guarantee is disabled.",
  "errorValueRequired": "Enter a value, or choose “No change” or “Disable (0 km)”.",
  "errorNoMonths": "Select at least one month.",
  "errorNoChanges": "No change selected.",
  "summaryLegend": "Summary",
  "summaryHeadline": "You are changing {changed} of {total} months in {year}.",
  "summaryOverwrite": "{count, plural, one {# month already has values — it will be overwritten} other {# months already have values — they will be overwritten}}.",
  "summaryNoop": "{count, plural, one {# month unchanged} other {# months unchanged}}.",
  "summaryIrreversible": "This cannot be undone. Previous values remain visible in the audit log.",
  "colMonth": "Month",
  "colCurrent": "Current",
  "colNew": "After the change",
  "arrowSr": "changes to",
  "valueNone": "none (default)",
  "valueDisabled": "disabled",
  "valueNoChange": "no change",
  "apply": "{count, plural, one {Apply to # month} other {Apply to # months}}",
  "applying": "Saving…",
  "successToast": "{count, plural, one {# month updated} other {# months updated}}",
  "partialError": "{count, plural, one {# month not saved} other {# months not saved}} — please try again.",
  "retryFailed": "Retry failed months",
  "rowOk": "Saved",
  "rowFailed": "Save failed"
}
```

**`messages/pl.json` → `carrier.breakdown`** (добавить):

```json
"guaranteeDisabled": "Gwarancja wyłączona",
"guaranteeSaturdayOnly": "Gwarancja tylko w soboty",
"rateNoneTitle": "Brak stawki — gwarancja wyłączona w tym miesiącu",
"allDisabledTitle": "Brak gwarancji w tym okresie",
"allDisabledBody": "Dla wszystkich miesięcy tego okresu gwarancja przebiegu jest wyłączona, dlatego wniosek nie generuje dopłaty. Skontaktuj się z opiekunem, jeśli to pomyłka."
```

**`messages/en.json` → `carrier.breakdown`:**

```json
"guaranteeDisabled": "Guarantee disabled",
"guaranteeSaturdayOnly": "Saturdays only",
"rateNoneTitle": "No rate — the guarantee is disabled for this month",
"allDisabledTitle": "No guarantee in this period",
"allDisabledBody": "The mileage guarantee is disabled for every month of this period, so the claim generates no compensation. Contact your account manager if this is a mistake."
```

> **2026-09-24:** `gapNotice` / `gapNoticeMonth` удалены из обоих языков. Ключи смешанного периода (`mixedPeriodNotice`, `boardNotice`), staff-колонок tablicy km и `employee.claims.modal.boardGate` — **§16.5.7** (единственный источник, здесь не дублируются).

**`messages/pl.json` → `employee.claims.modal.recalc`** (новый объект):

```json
"recalc": {
  "button": "Przelicz wg aktualnych limitów",
  "buttonHint": "Pobierz aktualne limity i przelicz kwoty wniosku.",
  "snapshotNote": "Kwoty wyliczono wg limitów z dnia złożenia wniosku ({date}).",
  "dialogTitle": "Przelicz wg aktualnych limitów",
  "dialogBody": "Porównaj kwoty wyliczone przy złożeniu wniosku z kwotami wg aktualnych limitów. Zapis nadpisze kwoty wniosku.",
  "colBefore": "Wniosek (obecnie)",
  "colAfter": "Wg aktualnych limitów",
  "rowKmGuaranteed": "Km gwarantowane",
  "rowPayment": "Dopłata",
  "delta": "Różnica: {value}",
  "noChange": "Limity nie zmieniły się — kwoty pozostaną bez zmian.",
  "toZero": "Po przeliczeniu wniosek nie generuje dopłaty — będzie można go tylko odrzucić.",
  "confirm": "Zastosuj nowe kwoty",
  "loading": "Przeliczanie…",
  "success": "Przeliczono wg aktualnych limitów",
  "error": "Nie udało się przeliczyć wniosku"
}
```

**`messages/en.json` → `employee.claims.modal.recalc`:**

```json
"recalc": {
  "button": "Recalculate with current limits",
  "buttonHint": "Fetch the current limits and recalculate the claim amounts.",
  "snapshotNote": "Amounts were calculated with the limits in force on the submission date ({date}).",
  "dialogTitle": "Recalculate with current limits",
  "dialogBody": "Compare the amounts calculated at submission with the amounts under the current limits. Saving overwrites the claim amounts.",
  "colBefore": "Claim (current)",
  "colAfter": "With current limits",
  "rowKmGuaranteed": "Guaranteed km",
  "rowPayment": "Compensation",
  "delta": "Difference: {value}",
  "noChange": "The limits have not changed — the amounts stay the same.",
  "toZero": "After recalculation the claim generates no compensation — it can only be rejected.",
  "confirm": "Apply the new amounts",
  "loading": "Recalculating…",
  "success": "Recalculated with current limits",
  "error": "Could not recalculate the claim"
}
```

### §16.8 — Компоненты / файлы / токены (сводка для web-agent)

| Изменение | Где | Тип |
|---|---|---|
| `<LimitsRow>` — два чекбокса в ячейках, три состояния строки, состояние `unsaved`, память прежнего значения | `apps/web/components/limits/LimitsRow.tsx` | правка |
| `<LimitsView>` — кнопка «Zastosuj do wielu miesięcy», страничная нота `defaultsNotice`, подсказка `independenceHint` | `apps/web/app/(employee)/employee/(admin)/limits/LimitsView.tsx` | правка |
| `<BulkLimitsDialog>` — `<FormDialog>` + `<Select>` + `<MultiSelect>` + сводная таблица | `apps/web/components/limits/BulkLimitsDialog.tsx` | **новый** (композиция) |
| `<BreakdownTable>` — бейджи `disabled` / `saturdayOnly`, `—` вместо ставки-призрака, пустое состояние всего периода; **2026-09-24:** prop `boardSettlement?`, prop `mileage` удалён, staff-колонки tablicy km + порог 40rem (§16.5.5) | `apps/web/components/carrier/BreakdownTable.tsx` | правка |
| `<GuaranteeGapNotice audience>` — нота смешанного периода; **2026-09-24:** условие `mileageSource === 'board'`, тексты `mixedPeriodNotice` / `boardNotice` (§16.5.3) | в `BreakdownTable.tsx` | правка |
| `analyzeBreakdown` — **2026-09-24:** смешанный период = `mileageSource === 'board'`; поля `daysActive` / `daysTotal` / `mileageEffective` / `mileage` из `BreakdownGuaranteeInfo` больше не нужны UI | `apps/web/lib/claims/breakdownGuarantee.ts` (+ тест) | правка |
| **2026-09-24:** `<BoardGapNotice>` в `<DecisionPanel>`, гейт `ZAAKCEPTOWANO` по `boardSettlement.complete`, 422 `CLAIM_BOARD_INCOMPLETE` / `CLAIM_BOARD_CHANGED` (§16.5.6) | `apps/web/components/claims/ClaimModal.tsx` | правка |
| `<RecalcLimitsDialog>` — сравнение «было → станет» | `apps/web/components/claims/RecalcLimitsDialog.tsx` | **новый** (композиция `<Dialog>`) |
| Кнопка «Przelicz wg aktualnych limitów» + `snapshotNote` в блоке DOPŁATA | `apps/web/components/claims/ClaimModal.tsx` (§6.5.4) | правка |
| i18n-ключи §16.7 | `messages/pl.json`, `messages/en.json` | правка |

**Токены: 0 новых.** Используются существующие `bg-card`, `bg-input`, `bg-input/40`, `bg-warning/5`, `border-warning`, `text-warning-dark` / `dark:text-warning`, `text-text`, `text-text-sub`, `border-border`, `border-brand/60`, `bg-brand-50/40`, `text-success`, `text-danger`. **0 правок** `tailwind.config.ts` / `globals.css`.

**Иконки (Lucide):** `Info`, `CalendarRange`, `CalendarOff`, `ArrowRight`, `RefreshCw`, `Check`, `X`; **2026-09-24:** `CalendarX` (плашка «brak danych»), `AlertTriangle` (неполный месяц в колонке «Wpisane dni»). Эмодзи — нет. Токены для §16.5.5–16.5.6 — существующие `bg-warning-bg`, `dark:bg-warning/15`, `border-warning/40`, `text-warning-dark`, `dark:text-warning` (та же поверхность, что `progExceededHint`).

### §16.9 — Acceptance checklist (§16, web-agent)

- [ ] **Три состояния различимы одним взглядом.** Скриншот года, где есть все три, читается без наведения: A — под-строка «domyślne: …» янтарным + `placeholder="540 (domyślnie)"`; B — `bg-input/40` строка + «gwarancja wyłączona (0 km)»; C — обычная строка без под-строки.
- [ ] **Инвариант «снятая галка ⟺ 0 ⟺ ноль км»** соблюдён во всех трёх состояниях; при `NULL` галка **стоит**.
- [ ] Пустая ячейка **нигде** не является единственным сигналом fallback-а; страничная нота `defaultsNotice` появляется при `count > 0`.
- [ ] **`line-through` отсутствует** во всей таблице лимитов и в breakdown.
- [ ] Оба чекбокса — **внутри своих ячеек**, ни одного чекбокса в первой колонке и ни одного в `<th>`; хит-область 36×36 (`h-9 w-9`), `aria-label` содержит месяц.
- [ ] Выключение месяца **не** трогает субботу и наоборот; `independenceHint` отрендерен.
- [ ] Снятие галки пишет `0` немедленно; установка галки **не отправляет ни одного запроса**; состояние `unsaved` показывает «Nie zapisano — obowiązuje 0 km» и `aria-describedby`.
- [ ] Blur пустого поля при стоящей галке возвращает галку в снятое положение + sr-объявление; повторная установка в том же сеансе предзаполняет прежнее значение как черновик.
- [ ] **Ни один путь UI не отправляет `NULL`** в `kmPerDay` / `kmPerSaturday`.
- [ ] Ставка в выключенном месяце **сохраняется, остаётся редактируемой**, имеет `title` с объяснением.
- [ ] `<BulkLimitsDialog>`: три режима диапазона; для km — `<Select>` из трёх опций (не чекбокс); пустая ставка = «bez zmian»; «Włącz i ustaw» без значения блокирует сабмит.
- [ ] Сводка массовой операции показывает **пер-месячные «Obecnie → Po zmianie»**, счётчик перезаписываемых месяцев и строку необратимости; в «Obecnie» никогда нет пустой ячейки.
- [ ] Кнопка применения **называет число месяцев**; второго вложенного диалога подтверждения нет.
- [ ] Частичный отказ оставляет диалог открытым с пер-строчным результатом и «Ponów nieudane» (либо, при атомарном bulk-эндпоинте, простым success/error).
- [ ] Выключенный месяц у перевозчика: бейдж «Gwarancja wyłączona», приглушённая строка, `Km/mc` без `font-semibold`.
- [ ] **Ставка-призрак спрятана везде**, где `kmGuaranteed === 0` (breakdown per-month и footer, stat-карточки, `ClaimModal`) — рендерится `—`, `0,50` не появляется ни в одном месте.
- [ ] `<GuaranteeGapNotice>` появляется только при `mileageSource === 'board'`, стоит **над** таблицей, нейтрального тона, без чисел; текст по аудитории — §16.5.3 (REWRITTEN 2026-09-24). Остальной checklist смешанного периода — §16.5.8.
- [ ] Период целиком без гарантии → `<EmptyState>` с `<CalendarOff />` вместо таблицы; футер «Razem» и блок граничных дней скрыты; ноты смешанного периода нет.
- [ ] Кнопка «Przelicz wg aktualnych limitów» — `variant="outline"` в блоке DOPŁATA, **не** в футере; отсутствует (не дизейблится) для ролей вне `admin`/`pracownik` и на решённых wniosek-ах; рядом стоит `snapshotNote`.
- [ ] `<RecalcLimitsDialog>` показывает «было → станет» до записи; дельта **без семантического цвета**; вариант «Limity nie zmieniły się» схлопывает футер в «Zamknij»; ошибка оставляет диалог открытым.
- [ ] Dark mode: все новые поверхности (`bg-input/40`, `bg-warning/5`, бейджи, нота) проверены в обеих темах; контраст AA (`text-warning-dark` на `bg-card` в light, `text-warning` на `bg-card` в dark).
- [ ] Клавиатура: чекбокс → инпут → следующий чекбокс в естественном порядке табуляции; Esc в `unsaved`-ячейке отменяет черновик; фокус после закрытия диалогов возвращается на триггер.
- [ ] **0 новых токенов, 0 новых примитивов, 0 правок `tailwind.config.ts` / `globals.css`.**

---

## §17 — Przekazanie ciągnika innemu planiście: wniosek → decyzja, historia planistów (NEW 2026-09-28 — AUTHORITATIVE)

> **Changelog.**
> - **2026-10-23 — admin подаёт заявки (docs/29 U1 отменено).** Admin может подать заявку по **любой** активной машине — только из формы правки машины (E2 стал состоянием «подать», как E1; кнопки в футере детальной модалки у admin нет). Свои заявки admin видит на третьей вкладке **«Moje wnioski»** страницы `/employee/przekazania` (`scope=mine`). R4 не меняется: автор не решает свою заявку — заявку admin решает другой admin или лидер `fromPlanner`; при одном admin и без лидера её можно только отменить (принятый тупик, docs/29). Уведомлений по-прежнему нет. Admin по-прежнему редиректится с `/planista/*` (W7). Затронуты: D9 (новое), §17.2.2 (E2, E4, `<PendingTransferNotice>`), §17.3, §17.4.1, §17.4.2, §17.4.3, §17.5 (хосты, §17.5.1, §17.5.3, §17.5.4, §17.5.7, §17.5.8 — новое), §17.6.3, §17.11, §17.12 (A9), §17.13, §17.14, W4, W7. Токенов и типов компонентов не добавлено.
> - 2026-09-28 — первая версия.

> **Scope.** UI-спека к [29-vehicle-planner-transfer-plan.md](29-vehicle-planner-transfer-plan.md) §4. Контракт поведения — там (решения R1–R9, умолчания U1–U11); здесь только то, как это выглядит, называется и объявляется скринридеру. Если текст ниже расходится с docs/29 по **поведению** — прав docs/29; по **виду, копирайту, размещению** — прав этот раздел.
>
> Восемь артефактов: (1) статус-чип заявки, (2) ячейка «Planista» в `VehicleFormDialog`, (3) диалог подачи заявки, (4) навигация + счётчик, (5) входящие на решение (admin + лидер) и «мои заявки» (автор), (6) журнал назначений в карточке машины, (7) поле «Przełożony (lider)» в `UserSheet`, (8) планиста в модалке выезда.
>
> **Ноль новых токенов, ноль новых примитивов.** Всё собирается из `Badge`, `Button`, `Dialog`, `ConfirmDialog`, `Select`, `Textarea`, `FormField`, `LockNotice`, `EmptyState`, `Skeleton`, `CursorPager`, `Tabs`. Единственная правка примитива — аддитивный слот `extraActions` в `<EntityDetailModal>` (§17.6.3). Один **новый класс-использования** существующего токена: счётчик в навигации — `bg-warning-dark` (не `bg-warning`), обоснование в §17.4. **0 правок** `tailwind.config.ts` / `globals.css`.
>
> **Легаси-экрана нет** — скриншоты не используются. Композиция опирается на уже зафиксированные паттерны: §6.5.13 (язык блокировки), §7.10.2 (confirm-диалоги), §6.4.1a (спайн-степпер), §8.2–§8.3 (пустые состояния, тосты), §12.3.1 (счётчик на вкладке), §14 (клик по активной вкладке).

### §17.0 — Решения и отступления (прочитать первым)

| # | Решение | Отступление от | Почему |
|---|---|---|---|
| D1 | В UI сущность называется **«ciągnik»** (PL) / "vehicle" (EN): «Przekaż ciągnik», «Przekazania ciągników». В docs/29 — «pojazd» | docs/29 §4 (рабочие названия) | Приложение уже везде говорит «Ciągniki» (`nav.vehicles`, `planista.tabs.vehicles`, `myKm.*`). Одно слово на одну вещь |
| D2 | У планисты появляется **route-based таб-бар** `<PlanistaTabsNav>` (Flota / Przebieg / Moje wnioski / Do zatwierdzenia). Кнопка-ссылка «Przebieg» в шапке `FleetPanel` у планисты уходит (у диспетчера остаётся) | §6.3.1 («sub-навигация in-page `<Tabs>`»), §14.3 («у planista таб-навигации нет») | У роли стало ≥3 назначения; повторяем рецепт `WeryfikatorTabsNav` (§7.10.2) — это и есть «пункт меню», который просит docs/29 §4 |
| D3 | «Przekaż ciągnik» у планисты живёт **в футере `<VehicleDetailModal>`** (открывается кликом по строке «Ciągniki» на `/planista`) и CTA на вкладке «Moje wnioski» — **не** на `/planista/moje-pojazdy` | docs/29 §4 («Панель планисты `/planista/moje-pojazdy`») | `/planista/moje-pojazdy` — недельная км-доска (§7.8), у её строк нет места под действие. Строки флот-таблиц — `role="button"` (§6.4.3), вложенная кнопка в них запрещена |
| D4 | Панель планисты перестаёт быть «strictly read-only»: единственная мутация — **подать / отменить заявку**. Данные машины по-прежнему только на просмотр, баннер «Dane są tylko do podglądu» не меняется | §6.3 «Hard constraints — strictly read-only» | Заявка — это workflow-действие, не правка данных. Правка планисты напрямую невозможна ни для кого (R1) |
| D5 | Опекун получает пункт **«Przekazania»** в employee-sidebar в режиме «мои заявки» (без счётчика) | docs/29 §4 (упоминает только автора-планисту) | R9: уведомлений нет. Без списка опекун узнаёт об отказе и его причине, только случайно открыв машину. Права не расширяются — U11 уже даёт автору его заявки. **Снять, если orchestrator против** (открытый вопрос) |
| D6 | Поле в `UserSheet` называется **«Przełożony (lider)»**, не «Lider» | запрос («select Lider») | В той же форме уже есть чекбокс «Lider» (флаг docs/28). Два поля «Lider» с разным смыслом рядом — повтор путаницы R4 из docs/28 §7 |
| D7 | Входящие и «мои заявки» — **список карточек**, а не `<DataTable>` | §8.0 архетип A (таблица) | В каждой строке свободный текст (причина, комментарий, причина отказа), ради которого решение и принимается. Таблица его обрезает; карточка показывает целиком. Прецедент — `<ClaimCard>` на `/carrier/claims` |
| D8 | Счётчик — `bg-warning-dark text-white`, не `bg-warning text-white` как у «Moja opieka» | существующий pill в `EmployeeSidebar` | `#fff` на `#f97316` = 2.9:1 — провал AA для 11px bold. `#fff` на `#c2410c` = 5.2:1 ✔. Рекомендация back-port в pill «Moja opieka» — отдельной задачей |
| D9 | *(2026-10-23)* Admin подаёт заявку **только из формы правки машины** (E2, §17.2.2), как опекун; свои заявки — на вкладке **«Moje wnioski»** в `/employee/przekazania` (§17.5.8). На `/planista/*` admin не попадает (W7) | docs/29 U1 (было: «admin не подаёт») — U1 отменено решением 2026-10-23 | Один вход на роль: admin, как и опекун, правит машину в форме — там и видит, почему планиста заблокирован. Разделение «решаю / подал» повторяет лидера (`/planista/zatwierdzenia` vs `/planista/przekazania`), но в пределах одной страницы — у admin нет второго шелла |

### §17.1 — `<TransferStatusBadge>` — статус заявки

Тонкая обёртка над существующим `<Badge>` (`components/ui/Badge.tsx`), как `<VehicleStatusBadge>`. Только существующие варианты; ни одного нового.

| `status` | `Badge variant` | Lucide (12px, `aria-hidden`) | PL | EN | Почему этот тон |
|---|---|---|---|---|---|
| `pending` | `warning` | `Clock` | Oczekuje | Pending | «Человек ещё должен сдвинуть это дальше» — тот же смысл amber, что у `gotowy` (§7.10.1) |
| `approved` | `success` | `CheckCircle2` | Zatwierdzony | Approved | Изменение вступило в силу |
| `rejected` | `danger` | `XCircle` | Odrzucony | Rejected | Отрицательное решение; причина рядом |
| `cancelled` | `muted` | `Ban` | Anulowany | Cancelled | Отозван автором — нейтрально, не ошибка |

- Анатомия — как у всех статус-бейджей: `inline-flex items-center gap-1 whitespace-nowrap` + иконка + текст. Статус несёт **текст**, цвет и иконка — подкрепление.
- Контраст: `text-warning-dark` на `bg-warning-bg` ≈ 5.0:1, `text-danger-dark` на `bg-danger-bg` ≈ 6:1, `text-success-dark` на `bg-success-bg` ≈ 4.9:1 (light); dark — `/15`-подложки с `text-*` ≥ 4.5:1 ✔. `muted` = `text-text-sub` на `bg-input` 4.6:1 ✔.
- Род: «wniosek» — мужской, поэтому «Zatwierdzony / Odrzucony / Anulowany»; `pending` — глагол «Oczekuje», как в «Oczekuje na autoryzację».
- Файл: `apps/web/components/transfers/TransferStatusBadge.tsx`; маппинг `status → {variant, icon, labelKey}` — константа там же (в shared не нужен: чисто презентационный).

### §17.2 — `VehicleFormDialog`: ячейка «Planista»

Файл: `apps/web/app/(employee)/employee/vehicles/VehicleFormDialog.tsx`, секция «Dane podstawowe», `FormGrid cols={2}`, место в сетке не меняется (рядом с «Zespół dyspozytorów»).

#### §17.2.1 — Создание (и wizard перевозчика) — почти как сейчас

`<Select>` планисты остаётся, обязателен (R7). Добавляется одна строка `<FormDescription>` под селектом: `transfers.form.createHint` — «Późniejsza zmiana planisty wymaga wniosku i zatwierdzenia.» Создающий должен знать, что выбор «липкий».

#### §17.2.2 — Правка — поле заблокировано, действие рядом

Селекта **нет ни у кого**, включая admin (R1). Рецепт — **Tier A** §6.5.13 (одно заблокированное поле среди редактируемых), с одной оговоркой: поле **не зарегистрировано в RHF** и не попадает в тело `PATCH` (docs/29 §4 — «PATCH никогда не шлёт `plannerId`»). Значение берётся из `vehicle.planner` (`name ?? login`). Web-agent: убрать `plannerId` из дефолтов edit-формы и из edit-payload, а не просто спрятать инпут.

```
Planista                                        ← FormLabel, без «*» (поле не отправляется)
┌─────────────────────────────────────── 🔒 ┐
│ Anna Nowak                                 │  ← <Input readOnly tabIndex={-1} aria-readonly>, рецепт §6.5.13 A
└────────────────────────────────────────────┘
🔒 Zablokowane — planistę zmienia się tylko wnioskiem o przekazanie.   ← FormDescription (причина)
[⇄ Poproś o zmianę planisty]                                          ← opiekun или admin, если нет pending
```

Состояния ячейки (по роли зрителя и данным). Невозможное действие **убирается, а не дизейблится** (§6.5.13):

| # | Условие | Под полем | Действие |
|---|---|---|---|
| E1 | opiekun, машина активна, `pending` нет | `transfers.form.locked` | `<Button type="button" variant="outline" size="sm">` + `<ArrowLeftRight size={14}/>` «Poproś o zmianę planisty» (`transfers.request.button`) → §17.3 |
| E2 | *(2026-10-23)* admin, машина активна, `pending` нет — **любая** машина | `transfers.form.lockedAdmin` — «Zablokowane — planistę zmienia się tylko wnioskiem. Twój wniosek rozpatrzy inny administrator lub lider obecnego planisty.» | та же кнопка, что E1 (`transfers.request.button`) → §17.3; тот же skeleton, пока грузится журнал |
| E3 | машина выключена (`vehicle.active === false` в сохранённом состоянии), любая роль | `transfers.form.lockedInactive` | нет |
| E4 | есть `pending` (любая роль зрителя) | причина из E1/E2 + **`<PendingTransferNotice>`** под ней | автор (opiekun, планиста **или admin**): «Anuluj wniosek»; admin, который **не** автор: ссылка «Rozpatrz w „Przekazania”»; остальные — ничего |

Кнопка одна на E1 и E2 — ключ ролево-нейтральный (`request.button`); `request.buttonOpiekun` удаляется. Причина под полем (`locked` / `lockedAdmin`) остаётся ролевой: опекуну незачем знать, что admin решает чужие заявки, а admin должен знать, что свою заявку он **не** решит (R4).

`type="button"` обязателен — кнопка внутри `<form>` формы машины и не должна её сабмитить.

**`<PendingTransferNotice>`** — компактная плашка под полем (растёт вниз внутри band 2 `FormGrid`, соседний инпут не сдвигает):

```
┌──────────────────────────────────────────────────────────┐
│ [⏱ Oczekuje]  Wniosek o przekazanie do: Piotr Wiśniewski │
│ Wnioskuje: Jan Kowalski · Opiekun · 12.10.2026, 14:05     │
│ „Planista przechodzi do działu eksportu…”                  │
│ To Twój wniosek — decyzję podejmuje inny administrator…   │  ← только admin-автору
│                                        [Anuluj wniosek]  │  ← только автору
└──────────────────────────────────────────────────────────┘
```

| Слот | Классы |
|---|---|
| Обёртка | `mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-input/60 p-3 text-sm` — нейтральная поверхность; тон несёт только `<TransferStatusBadge status="pending">`. Не `bg-warning/10`: ожидающая заявка — нормальное состояние процесса, не проблема (§6.5.13 «locked ≠ error») |
| Заголовок | `flex flex-wrap items-center gap-2` + бейдж + `font-medium text-text` `transfers.form.pendingTitle` |
| Мета | `text-xs text-text-sub` `transfers.form.pendingMeta` (дата-время через `dateTimeValue`, `<time dateTime>`) |
| Причина | `text-sm text-text whitespace-pre-line break-words line-clamp-3` + полный текст в `title` |
| Кто решает *(2026-10-23, только admin-автор)* | `text-xs text-text-sub` `transfers.card.blockedRequesterAdmin` — «To Twój wniosek — decyzję podejmuje inny administrator lub lider obecnego planisty.» Над кнопкой отмены. Нужна именно admin: у него вместо привычной ссылки «Rozpatrz» появляется «Anuluj», и без этой строки неясно, почему решить нельзя. Опекуну/планисте-автору строка не показывается (им это уже сказал `request.info` при подаче) |
| Действие автора | `<Button type="button" variant="ghost" size="sm" className="self-end">` «Anuluj wniosek» → `<ConfirmDialog>` §17.5.6. Автор — по `viewerCanCancel`, admin включительно |
| Действие admin (не автор) | `<Link href="/employee/przekazania" className="self-end text-xs font-semibold text-brand hover:underline">` `transfers.form.reviewLink`. Приоритет: автор → отмена, иначе admin → ссылка. Admin-автор ссылку **не** получает — на «Do decyzji» его строка заблокирована (§17.5.4) |

Источник данных для `pending` — тот же запрос, что и журнал: `GET /vehicles/:id/planner-history` (§17.6), ключ кеша общий с карточкой машины. Пока запрос грузится — под полем `<Skeleton className="h-8 w-48">` вместо кнопки (нельзя показать кнопку, которая через секунду окажется «уже есть заявка»).

**Вложенный диалог.** Кнопка E1/E2 открывает §17.3 **поверх** открытой формы машины (форма не закрывается — в ней могут быть несохранённые правки). Esc закрывает только верхний диалог, фокус возвращается на кнопку. В диалоге §17.3 строка `transfers.request.independentOfForm` явно говорит, что заявка уходит сразу, независимо от «Zapisz». Web-agent: проверить, что самописный `components/ui/Dialog.tsx` корректно стекует два диалога (z-index, focus-trap верхнего, scroll-lock не снимается при закрытии верхнего).

### §17.3 — `<PlannerTransferRequestDialog>` — подать заявку

Файл: `apps/web/components/transfers/PlannerTransferRequestDialog.tsx`. Форма из трёх полей — это confirm-with-input (§7.10.2, форма `ConfirmDeleteWithReasonDialog`), **не** `<FormDialog>` 900px.

**Контейнер:** `<Dialog>` → `<DialogContent className="max-w-lg">` (512px), `DialogHeader` / тело `space-y-4` / `DialogFooter`. RHF + Zod, `mode: 'onChange'`.

**Две точки входа, один диалог:**

| Вход | Кто | Поле «Ciągnik» | Заголовок / описание |
|---|---|---|---|
| Форма машины (E1 / E2) и футер `<VehicleDetailModal>` (§17.6.3) | opiekun / admin (только форма, D9) / текущий планиста (только футер) | нет — машина задана | `DialogTitle` = `transfers.request.title` «Wniosek o zmianę planisty»; `DialogDescription` = `{plate} · {carrier}` (plate `font-mono`) |
| CTA на «Moje wnioski» (§17.5) | планиста | `<Select>` своих **активных** машин, без тех, по которым у него уже есть `pending` | тот же заголовок; описание — `—` до выбора машины, затем `{plate} · {carrier}` |

**Тело сверху вниз:**

1. *(только второй вход)* `FormField` «Ciągnik» `required` → `<Select>`; опции `transfers.request.vehicleOption` «{plate} · bok {side} — {carrier}». Нет машин → select `disabled`, `FormDescription` `noVehicles`, submit `disabled`.
2. Статичная пара (не инпут, §6.5 «value is text»): `<dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">` → `<dt className="text-text-sub">Obecny planista</dt><dd className="font-medium text-text">Anna Nowak</dd>`.
3. `FormField` «Nowy planista» `required` → `<Select>`: активные планисты **кроме текущего** (U2; пикер из lookups, docs/29 §3.4), `placeholder` `targetPlaceholder`. Загрузка — `<Skeleton className="h-10 w-full">` на месте селекта (не текст «Ładowanie…», §8.1). Пустой список → `disabled` + `FormDescription` `noTargets`, submit `disabled`.
4. `FormField` «Powód» `required` → `<Textarea rows={3} maxLength={500}>`, `placeholder` `reasonPlaceholder`; под полем справа счётчик `text-xs text-text-sub tabular-nums` «{count}/500». Лимиты `min 3 / max 500` — зеркало `DeleteWithReasonSchema`; **окончательно — по схеме api-agent** в shared.
5. Инфо-строка (нейтральная, рецепт `<LockNotice>` без замка): `flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 text-xs text-text-sub` + `<Info size={14} className="mt-0.5 shrink-0" aria-hidden/>` + `transfers.request.info`. Смысл: планиста сменится только после решения; уведомлений нет (R9) — пусть автор не ждёт письма. *(2026-10-23)* Если подаёт **admin** — вместо `info` ключ `transfers.request.infoAdmin`: тот же смысл + «свою заявку ты не утвердишь» + честный тупик (нет другого admin и лидера → только отмена). Выбор ключа — по `user.role === 'admin'`, иконка и рецепт те же.
6. *(только из формы машины)* `text-xs text-text-sub` `transfers.request.independentOfForm`.

**Футер (LTR):** `[слот ошибки — mr-auto text-sm text-danger role="alert"]` … `[Anuluj — ghost sm]` `[Wyślij wniosek — default sm]`. Primary `disabled`, пока форма невалидна или идёт запрос (label → `submitting`). Кнопка называет действие, голое «Zapisz» запрещено (§6.5.12).

**Ответы API → UI** (коды — `extensions.code` через `lib/api/problemCode.ts`; имена кодов определяет api-agent, ниже — смысловые классы):

| Ответ | Где показать | Текст | Что ещё |
|---|---|---|---|
| 201 | `toast.success` | `request.success` «Wniosek wysłany do zatwierdzenia» | закрыть; инвалидация §17.9 — у хоста сразу появляется `<PendingTransferNotice>` |
| 409 «уже есть pending» | слот ошибки футера | `request.errors.alreadyPending` | инвалидировать журнал машины; primary скрыть, «Anuluj» → «Zamknij» (повтор бессмыслен) |
| 422 на поле (`reason`, `toPlannerId`) | `<FormMessage>` под полем | текст по коду / Zod | диалог открыт, введённое сохранено |
| 422 «цель неактивна / совпадает с текущим» | слот ошибки | `request.errors.sameOrInvalidTarget` | перезапросить пикер целей, сбросить выбор |
| 422 «машина неактивна» | слот ошибки | `request.errors.vehicleInactive` | primary скрыть |
| 403 | слот ошибки | `request.errors.notAllowed` | primary скрыть |
| сеть / 5xx | `toast.error` | `request.errors.generic` | диалог открыт, повтор доступен |

### §17.4 — Навигация и счётчик

#### §17.4.1 — Employee sidebar: «Przekazania»

Новая запись в `lib/nav.config.ts`: `{ key: 'transfers', href: '/employee/przekazania', labelKey: 'nav.transfers', iconName: 'ArrowLeftRight', permission: ['vehicles.planner_transfer.request', 'vehicles.planner_transfer.decide'] }` (с B4; раньше `roles: ['admin', 'opiekun']`). Место — сразу после `vehicles` (передача — действие над машинами). Маршрут в `PATH_PERMISSIONS` под теми же правами (опекун туда ходит, D5).

| Роль | Содержимое страницы | Счётчик |
|---|---|---|
| admin | режим **decider** (§17.5), все заявки — вкладки «Do decyzji» / «Rozpatrzone» + *(2026-10-23)* третья вкладка **«Moje wnioski»** — свои заявки (`scope=mine`, §17.5.8) | да — `pending`, которые он **может решить** (свои не в счёт, §17.4.3) |
| opiekun | режим **author** — свои заявки | нет |

#### §17.4.2 — `<PlanistaTabsNav>` (D2)

Копия `WeryfikatorTabsNav` (route-based, `role="tablist"`, стрелки/Home/End, `useActiveNavRefresh` — правило §14.3) в `app/(planista)/layout.tsx` над `children`. Контейнер `px-4 sm:px-6 lg:px-10 xl:px-12 pt-6` — как у weryfikatora.

| Вкладка | `href` | Иконка | Видна | Лейбл |
|---|---|---|---|---|
| Flota | `/planista` | `Truck` | всем в шелле | `planista.nav.fleet` |
| Przebieg | `/planista/moje-pojazdy` | `Gauge` | всем | `myKm.tab` (reuse) |
| Moje wnioski | `/planista/przekazania` | `ArrowLeftRight` | `role === 'planista'` | `planista.nav.myTransfers` |
| Do zatwierdzenia | `/planista/zatwierdzenia` | `ClipboardCheck` | `role === 'planista' && user.lider` | `planista.nav.approvals` + счётчик |

- Admin в `(planista)`-шелле (debug-доступ) видит только «Flota» / «Przebieg»: и решения, и *(2026-10-23)* свои заявки («Moje wnioski», §17.5.8) у него живут в `/employee/przekazania`; прямой заход на `/planista/przekazania` / `/planista/zatwierdzenia` — редирект туда (W7).
- Решение «показывать ли вкладку» — **клиентское**, по `useAuth().user.lider`: edge-middleware не знает о лидерстве и не импортирует shared (docs/28 §9.2 #18). Прямой заход не-лидера на `/planista/zatwierdzenia` не редиректит, а рендерит информационный `<EmptyState icon={Lock}>` `transfers.empty.notLider` и **не вызывает API**.
- `FleetPanel` на `/planista` перестаёт получать `myKmHref` (вкладка «Przebieg» его заменяет); `/dyspozytor` не меняется.

#### §17.4.3 — Счётчик `pending` (не уведомление — R9)

Рецепт §12.3.1 / `EmployeeSidebar` pill, с одной заменой тона (D8):

| Свойство | Контракт |
|---|---|
| Где | sidebar «Przekazania» (только admin); вкладка «Do zatwierdzenia» (лидер) |
| Число | admin и лидер — `pending`, которые зритель **может решить** (`viewerCanDecide`; лидер: `toPlanner.id !== me && requestedBy.id !== me`; admin *(2026-10-23)*: `requestedBy.id !== me`). Заблокированные для него строки (§17.5.4), в том числе собственные заявки admin, в счёт не идут — иначе счётчик никогда не обнулится |
| Скрыт | при `0` и во время загрузки (нет фантомного бейджа) |
| Форма | `ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums` (в табе — `ml-1.5` вместо `ml-auto`) |
| Тон | **`bg-warning-dark text-white`** (5.2:1). Не `bg-danger`: красный — «просрочено/сломано» (Alerty), заявка — «ждёт человека» |
| a11y | `aria-label` + `title` = `nav.transfersBadge` / `planista.nav.approvalsBadge` («{count} wnioski czekają na decyzję») |
| Свежесть | общий кеш с `pending`-вкладкой входящих; без поллинга (как остальные счётчики): refetch при фокусе окна, при клике по активной вкладке (§14) и после любой мутации §17.9 |

### §17.5 — `<PlannerTransferList>` — входящие (decider) и мои заявки (author)

Один компонент, три хоста:

| Хост | Режим | Заголовок `h1` / подзаголовок |
|---|---|---|
| `/employee/przekazania` (admin) | `decider` на вкладках 1–2 + `author` на вкладке 3 «Moje wnioski» (§17.5.8) | `transfers.title` / `transfers.subtitle.admin` |
| `/employee/przekazania` (opiekun) | `author` | `transfers.title` / `transfers.subtitle.author` |
| `/planista/przekazania` | `author` | `planista.nav.myTransfers` / `transfers.subtitle.author` |
| `/planista/zatwierdzenia` (лидер) | `decider` | `planista.nav.approvals` / `transfers.subtitle.lider` |

Контейнер — тот же, что у соседних страниц шелла (employee: §3.4 A; planista: `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`). Шапка страницы — рецепт §6.3.1 п.1. В режиме `author` для планисты справа от заголовка — CTA `<Button size="sm"><ArrowLeftRight size={14}/> Przekaż ciągnik</Button>` → §17.3 (второй вход). У опекуна и admin CTA нет: они подают заявку из формы машины (D9).

#### §17.5.1 — Вкладки

`<Tabs>` (in-page, §6.3.1), `aria-label` = `transfers.tabs.ariaLabel`:

| Вкладка | decider | author | Сортировка | Данные |
|---|---|---|---|---|
| 1 | «Do decyzji» `pendingDecider` + счётчик в скобках | «Oczekujące» `pendingAuthor` | **старые сверху** (очередь: дольше всех ждёт — первой) | `status=pending` |
| 2 | «Rozpatrzone» `decided` | то же | новые решения сверху | `status ∈ approved, rejected, cancelled`; фильтр-`<Select>` статуса над списком (`bg-input` фильтр-бар, §Surface policy); пагинация `<CursorPager>` |
| 3 *(только admin, 2026-10-23)* | «Moje wnioski» `mine` | — | по фильтру: `pending` — старые сверху, остальное — новые решения сверху (как отдаёт api) | `scope=mine`; подробно — §17.5.8 |

Вкладка по умолчанию — первая, даже если она пуста (предсказуемость важнее «умного» переключения). У admin тоже: «Do decyzji» — его основная работа, «Moje wnioski» — редкий случай.

#### §17.5.2 — `<TransferRequestCard>`

```
┌──────────────────────────────────────────────────────────────────┐
│ WGM 1234A  bok 117   [⏱ Oczekuje]                12.10.2026, 14:05 │
│ Trans-Pol Sp. z o.o.                                               │
│ Anna Nowak  →  Piotr Wiśniewski                                    │
│ Wnioskuje: Jan Kowalski · Opiekun                                  │
│ POWÓD                                                              │
│ Planista przechodzi do działu eksportu, ciągnik jeździ na DE.      │
│ ─────────────────────────────────────────────────────────────────│
│ [🕘 Historia planistów]                     [Odrzuć] [Zatwierdź]    │
└──────────────────────────────────────────────────────────────────┘
```

| Слот | Классы / правило |
|---|---|
| Обёртка | `<article aria-labelledby>` `flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5`. Список — `<ul className="flex flex-col gap-3">`, карточка в `<li>` |
| Строка 1 | `flex flex-wrap items-center gap-x-3 gap-y-1`: plate `font-mono font-semibold text-text` (id заголовка карточки) · `text-xs text-text-sub` «bok {side}» (все зрители — сотрудники, номер боковой можно) · `<TransferStatusBadge>` · `ml-auto text-xs text-text-sub tabular-nums` `<time>` `createdAt` (`dateTimeValue`) |
| Строка 2 | перевозчик `text-sm text-text-sub` (`name ?? login`) |
| Строка 3 «от → к» | `flex flex-wrap items-center gap-2 text-sm`: `<span className="text-text">{from}</span>` `<ArrowRight size={14} aria-hidden className="text-text-sub"/>` `<span className="sr-only">{fromToSr}</span>` `<span className="font-semibold text-text">{to}</span>`. Получатель жирнее — это то, **что** утверждается |
| Строка 4 | `text-xs text-text-sub` `card.requestedBy` «Wnioskuje: {name} · {role}»; роль — `roleLabelKey(role, lider)` (лидер подписывается «Lider planistów») |
| *(опц., admin decider)* | `text-xs text-text-sub` `card.liderOf` «Lider planisty: {name}» / `card.noLider` — помогает admin понять, ждать ли лидера. Только если DTO несёт мини-объект лидера `fromPlanner` (§17.12) |
| Причина | подпись `text-[11px] font-semibold uppercase tracking-wider text-text-sub` «Powód» + `<p className="text-sm text-text whitespace-pre-line break-words">` — **полностью, без обрезки** |
| Блок решения (вкладка 2) | `border-l-2 pl-3 text-sm` — `border-l-success` (approved) / `border-l-danger` (rejected) / `border-l-border` (cancelled); строка `text-xs text-text-sub` `card.approvedBy` / `rejectedBy` / `cancelledAt`; ниже комментарий (`card.commentLabel`) или причина отказа (`card.rejectionLabel`) тем же рецептом, что причина заявки. Одобрение без комментария — только строка «Zatwierdził…» |
| Строка действий | `flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center`: слева `<Button variant="ghost" size="sm"><History size={14}/> Historia planistów</Button>` (§17.6.4); справа `sm:ml-auto flex gap-2` — действия по таблице §17.5.3. На мобильных кнопки `w-full min-h-[44px]` |

#### §17.5.3 — Действия на карточке (что есть у кого)

| Режим / статус | Действия |
|---|---|
| decider, `pending`, может решить | `[Odrzuć — outline sm]` `[Zatwierdź — default sm]` → §17.5.5 |
| decider, `pending`, **не может** решить (R4) | действий нет; на их месте `<LockNotice>` с причиной (§17.5.4) |
| author, `pending` (включая admin на «Moje wnioski») | `[Anuluj wniosek — ghost sm]` → §17.5.6 |
| любой, вкладка «Rozpatrzone»; «Moje wnioski» с фильтром, отличным от «Oczekujące» | только «Historia planistów» |

#### §17.5.4 — Почему лидер не может решить эту строку (R3/R4)

Строка остаётся в списке лидера (он должен знать, что заявка по его планисте существует), но вместо кнопок — `<LockNotice>` (§6.5.13, нейтральный, `role="note"`, замок `text-text-sub`) с **причиной, а не состоянием**:

| Условие (вычисляет UI по id; сервер — окончательно, 403) | Ключ | PL |
|---|---|---|
| `toPlanner.id === me` | `card.blockedTarget` | «Jesteś planistą docelowym tego wniosku — decyzję podejmuje administrator.» |
| `requestedBy.id === me`, зритель — лидер | `card.blockedRequester` | «To Twój wniosek — decyzję podejmuje administrator.» |
| `requestedBy.id === me`, зритель — **admin** *(2026-10-23)* | `card.blockedRequesterAdmin` | «To Twój wniosek — decyzję podejmuje inny administrator lub lider obecnego planisty.» |

Своя заявка admin остаётся на его «Do decyzji» (`scope=decide` у admin — все заявки): admin видит полную очередь, но вместо кнопок — `<LockNotice>` выше. Отмена своей заявки на этой вкладке **не** предлагается — она живёт на «Moje wnioski» (§17.5.8) и в плашке формы машины (§17.2.2); одно действие — одно место в списке. Кнопки **не рендерятся** (не `disabled`) — правило §6.5.13. Лидер, потерявший флаг (U10), до строк не доходит: страница показывает `empty.notLider` (§17.4.2).

#### §17.5.5 — Диалоги решения

Оба — `<Dialog>` `max-w-md`, рецепт §7.10.2 (`await onConfirm()`, закрыть на resolve, остаться открытым на reject). Описание (`DialogDescription`) — `{plate}: {from} → {to}`, чтобы было видно, **что** решается, не переводя взгляд на карточку.

**Zatwierdź** (`transfers.approve.*`):
- Блок последствий — нейтральная инфо-строка (рецепт §17.3 п.5), список `<ul className="list-disc pl-4 space-y-1">` из трёх пунктов: `effectVehicle`, `effectTrips`, `effectHistory`. Это R5/R6 человеческим языком: после клика машина сразу у нового, невыехавшие выезды переходят, выезд «W trasie» доводит старый.
- `FormField` «Komentarz (opcjonalnie)» → `<Textarea rows={2} maxLength={500}>` (U3).
- Футер: `[Anuluj — ghost]` `[Zatwierdź przekazanie — default]`.

**Odrzuć** (`transfers.reject.*`):
- `FormField` «Powód odrzucenia» `required` → `<Textarea rows={3}>`, min 3 / max 500 (U3); `FormDescription` `reasonHint` — «Wnioskujący zobaczy powód na swojej liście wniosków.» (R9: это его единственный канал узнать причину).
- Футер: `[Anuluj — ghost]` `[Odrzuć wniosek — destructive]`.

**Ответы API** (оба диалога):

| Ответ | Показ | Текст | Далее |
|---|---|---|---|
| 200 | `toast.success` | `approve.success` «Ciągnik {plate} przekazany do {to}» / `reject.success` | закрыть; инвалидация §17.9 |
| 409 (устарела: уже решена / планиста машины сменился — U6) | `role="alert"` в теле над футером | `decisionErrors.stale` | инвалидировать список; primary скрыть, «Anuluj» → «Zamknij» |
| 422 (получатель неактивен / машина неактивна) | то же | `decisionErrors.targetInactive` / `vehicleInactive` | primary скрыть. Отклонить такую заявку можно — диалог «Odrzuć» не блокируется |
| 422 на поле (`reason`) | `<FormMessage>` | Zod / код | диалог открыт |
| 403 | `role="alert"` | `decisionErrors.forbidden` | primary скрыть |
| сеть / 5xx | `toast.error` | `decisionErrors.generic` | открыт, повтор |

#### §17.5.6 — Отмена своей заявки

`<ConfirmDialog>` (существующий, destructive): `title` `cancel.title` «Anulować wniosek?», `body` `cancel.body`, `confirmLabel` `cancel.confirm` «Anuluj wniosek», **`cancelLabel` = `cancel.back` «Wróć»**. Кнопка закрытия диалога здесь **не может** называться «Anuluj» — рядом с «Anuluj wniosek» это читается как одно и то же действие. Успех → `toast.success(cancel.success)`; 409 (уже решена) → `toast.error(cancel.errors.notPending)` + инвалидация.

#### §17.5.7 — Загрузка и пустые состояния (§8.1 / §8.2)

- Загрузка вкладки — 3 skeleton-карточки той же геометрии: `rounded-xl border border-border p-5` с `<Skeleton>` `h-4 w-40` / `h-3 w-56` / `h-3 w-72` / `h-12 w-full`. Вкладки и фильтр — живые.
- Ошибка загрузки — существующий error-state списка (`queryErrorProps`), как на соседних страницах.

| Случай | Заголовок / текст | Действие |
|---|---|---|
| decider, «Do decyzji» пусто | `empty.pendingDecider` | нет (информационное) |
| author (планиста), «Oczekujące» пусто | `empty.pendingAuthor.title` + `messagePlanista` | «Przekaż ciągnik» → §17.3 |
| author (опекун), «Oczekujące» пусто | `empty.pendingAuthor.title` + `messageOpiekun` | нет |
| «Rozpatrzone» пусто без фильтра | `empty.decided` | нет |
| «Rozpatrzone» пусто с фильтром | `empty.decidedFiltered` | «Wyczyść filtry» |
| не-лидер на `/planista/zatwierdzenia` | `empty.notLider` (иконка `Lock`) | нет |
| admin, «Moje wnioski» | по фильтру — §17.5.8 | §17.5.8 |

Иконка пустых состояний — `ArrowLeftRight`.

#### §17.5.8 — Admin: вкладка «Moje wnioski» (`scope=mine`) (NEW 2026-10-23)

Третья вкладка в `<Tabs>` страницы `/employee/przekazania`, **только у admin**: `[Do decyzji (n)] [Rozpatrzone] [Moje wnioski]`. Лейбл `transfers.tabs.mine`, **без счётчика** (режим author счётчиков не имеет, §17.4.1 — у опекуна и планисты тоже). Рендер — тот же `<PlannerTransferList>` в режиме `author` внутри `TabsContent`, без собственной шапки страницы (`h1` / подзаголовок — общие для страницы, `subtitle.admin`).

Вложенные вкладки (как «Oczekujące / Rozpatrzone» у планисты) здесь **запрещены** — второй таб-бар под первым читается как одна навигация. Вместо них — один фильтр-`<Select>` статуса в `bg-input` фильтр-баре (рецепт вкладки «Rozpatrzone», включая W14 `bg-card` у селекта). Опции 1:1 повторяют значения `status` в API (docs/13), поэтому один запрос и одна курсорная пагинация:

| Опция | Ключ | `status=` | Сортировка (от api) |
|---|---|---|---|
| «Oczekujące» — **по умолчанию** | `transfers.filter.pending` | `pending` | старые сверху |
| «Wszystkie rozpatrzone» | `transfers.filter.allDecided` | `decided` | новые решения сверху |
| «Zatwierdzone» | `transfers.filter.approved` (есть) | `approved` | новые сверху |
| «Odrzucone» | `transfers.filter.rejected` (есть) | `rejected` | новые сверху |
| «Anulowane» | `transfers.filter.cancelled` (есть) | `cancelled` | новые сверху |

По умолчанию — «Oczekujące»: единственное, что admin-автор может сделать со своей заявкой, — отменить её, и это возможно только пока она `pending`. Фильтр — локальное состояние вкладки (не URL); переход на другую вкладку и обратно его не сбрасывает в пределах визита.

**Карточка** — `<TransferRequestCard>` без изменений, с `<TransferStatusBadge>` в строке 1, как на `/planista/przekazania`. Строка «Wnioskuje: {admin} · Administrator» остаётся (единый вид карточки). Действия — по §17.5.3:

| Статус карточки | Действия |
|---|---|
| `pending` | `[Historia planistów — ghost sm]` … `[Anuluj wniosek — ghost sm]` → §17.5.6 (`<ConfirmDialog>`, «Wróć») |
| `approved` / `rejected` / `cancelled` | только «Historia planistów»; блок решения как на «Rozpatrzone» (кто решил, комментарий / причина отказа — целиком) |

Строки `<LockNotice>` (§17.5.4) на этой вкладке нет: это список **своих** заявок, «не можешь решить» здесь — норма, не исключение. Почему решить нельзя, admin уже прочитал при подаче (`request.infoAdmin`) и видит в плашке формы (`card.blockedRequesterAdmin`).

**Загрузка / ошибка / пусто** — §17.5.7 (3 skeleton-карточки; `queryErrorProps`), пустые состояния:

| Фильтр | Заголовок / текст | Действие |
|---|---|---|
| «Oczekujące» | `empty.pendingAuthor.title` «Brak oczekujących wniosków» + `empty.pendingAuthor.messageOpiekun` «Wniosek o zmianę planisty złożysz w formularzu edycji ciągnika.» (текст ролево-нейтрален — reuse) | нет (вход — форма машины, D9) |
| «Wszystkie rozpatrzone» | `empty.decided` | нет |
| один терминальный статус | `empty.decidedFiltered` | «Wyczyść filtry» → фильтр обратно в «Oczekujące» (значение по умолчанию) |

**Инвалидация** — §17.9 без изменений: подача из формы машины и отмена инвалидируют список заявок, а значит и эту вкладку, и pill (в котором своя заявка admin всё равно не считается).

### §17.6 — Журнал назначений: `<PlannerHistoryTimeline>`

Файл: `apps/web/components/transfers/PlannerHistoryTimeline.tsx`. Данные — `GET /vehicles/:id/planner-history` (назначения + заявки по машине).

#### §17.6.1 — Кто видит (U11) и где

| Зритель | `<VehicleDetailModal>` (секция) | «Historia planistów» из карточки заявки (диалог) |
|---|---|---|
| admin | ✔ | ✔ (входящие) |
| opiekun перевозчика машины | ✔ | ✔ (свои заявки) |
| текущий планиста машины | ✔ | ✔ (свои заявки) |
| лидер текущего планисты | — (его scope не расширяется, docs/29 §9) | ✔ (входящие) — **единственный** путь лидера к журналу |
| przewoźnik | **нет** — секция не рендерится, запрос не отправляется | — |
| dyspozytor | — (`FleetVehicleDetailModal` без изменений) | — |
| прежний планиста | — (теряет машину сразу, U7) | — |

Ответ **403 → секция молча не рендерится** (зрителю не положено; ошибка тут — шум). Остальные ошибки — строка `text-sm text-text-sub` `history.error` + `<Button variant="ghost" size="sm">` `history.retry`.

#### §17.6.2 — Анатомия

Спайн — рецепт степпера §6.4.1a (точка `h-2 w-2 rounded-full` + волосок `w-px bg-border`), **новые сверху**:

```
HISTORIA PLANISTÓW                                    ← заголовок секции §6.4, <History size={15}>

 ◍  Oczekuje na decyzję: przekazanie do Piotr Wiśniewski   [⏱ Oczekuje]
 ┆  Wniosek z 12.10.2026, 14:05 · wnioskuje Jan Kowalski (Opiekun)
 ┆  „Planista przechodzi do działu eksportu…”
 ●  Anna Nowak                                  [Obecnie]
 │  od 04.10.2026, 09:12 · [Przekazanie]
 │  Wnioskował: Jan Kowalski · Opiekun · Zatwierdził: Marek Nowicki · Lider planistów
 │  „Zmiana regionu.”
 ●  Tomasz Zieliński
    12.03.2025 – 04.10.2026, 09:12 · [Dane historyczne]
    Przypisanie sprzed wprowadzenia historii — początek to data dodania ciągnika.

 ▸ Odrzucone lub anulowane wnioski (2)
```

| Элемент | Классы / правило |
|---|---|
| Список | `<ol aria-label={history.listAria}>` `relative flex flex-col gap-4`; `<li className="relative pl-5">`; спайн — `before:absolute before:left-[3px] before:top-3 before:bottom-[-1rem] before:w-px before:bg-border`, у последнего `li` спайна нет |
| Точка | `absolute left-0 top-1.5 h-2 w-2 rounded-full`: текущее назначение `bg-success`; закрытое `bg-border`; ожидающая заявка `bg-warning` |
| Имя планисты | `text-sm font-semibold text-text` (`name ?? login`); у текущего — `<Badge variant="success">` `history.current` «Obecnie» |
| Период | `text-xs text-text-sub tabular-nums`, `<time dateTime>`: открытое — `history.since` «od {from}»; закрытое — `history.range` «{from} – {to}». Даты-время `dd.MM.yyyy, HH:mm` (§6.5: timestamp = дата + время; передача вступает в силу мгновенно, U5, поэтому время важно, если в тот же день был выезд). **Исключение:** начало строки `backfill` — только дата (время там — время создания машины, смысла не несёт) |
| Источник | `<Badge variant="muted">` после периода: `history.source.create` «Utworzenie» / `transfer` «Przekazanie» / `backfill` «Dane historyczne» |
| Кто | `text-xs text-text-sub`: `create` → `history.createdBy` «Dodał: {name}»; `transfer` → `history.requestedBy` + ` · ` + `history.approvedBy` (роль через `roleLabelKey`); `backfill` → строка `history.backfillNote` (честно объясняет ограничение бэкфилла, docs/29 §2) |
| Причина / комментарий | для `transfer`: причина заявки `mt-1 border-l-2 border-border pl-2 text-sm text-text whitespace-pre-line break-words`; комментарий решения (если есть) — тем же рецептом, с префиксом `transfers.card.commentLabel` |
| Узел `pending` | всегда первым; имя = `history.pendingNode` «Oczekuje na decyzję: przekazanie do {to}» + `<TransferStatusBadge status="pending">`; мета `history.pendingMeta`; причина |
| Отклонённые / отменённые | не в спайне (планиста от них не менялся). Под списком — `<details>` `mt-3`: `<summary className="cursor-pointer text-xs font-semibold text-text-sub hover:text-text focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm">` `history.closedRequests` (ICU-plural); внутри — те же `<TransferRequestCard>`-строки в компактном виде (без строки действий, `p-3`). Скрыто при 0 |

#### §17.6.3 — В `<VehicleDetailModal>` (§6.15)

- Новая **последняя** секция (после «Załączniki»): `title` = `history.title`, `icon` `<History>`, `span: 'full'`, одна строка `fullWidth: true` (§6.20) с `<PlannerHistoryTimeline>`.
- Строка «Planista» в «Przypisanie / Ludzie» при наличии `pending` получает хвост `<TransferStatusBadge status="pending">` с `title` = `transfers.form.pendingTitle` — видно без прокрутки до журнала.
- Загрузка секции — независимо от модалки (модалка уже открыта с данными машины): 3 строки `<Skeleton>` (точка `h-2 w-2 rounded-full` + `h-4 w-40` + `h-3 w-56`).
- **Футер для текущего планисты** (D3): между «Zamknij» и (отсутствующим у него) «Edytuj» — `<Button variant="outline" size="sm"><ArrowLeftRight size={14}/> Przekaż ciągnik</Button>` → §17.3 (первый вход). Не рендерится, если есть `pending`, если машина выключена, для любой другой роли. Требует аддитивного слота `extraActions?: ReactNode` в `<EntityDetailModal>` (§6.9) — рендерится слева от primary, справа от «Zamknij». Существующие вызовы не меняются.
- Опекун и *(2026-10-23)* admin в детальной модалке кнопки не получают — у них путь через «Edytuj» (§17.2, E1 / E2; D9), как в docs/29 §4.

#### §17.6.4 — Диалог из карточки заявки

`<PlannerHistoryDialog vehicleId plate>` — `<Dialog>` `max-w-2xl`, `max-h-[85vh]`, тело `overflow-y-auto`; `DialogTitle` = `history.dialogTitle` «Historia planistów — {plate}» (plate `font-mono`), тело — `<PlannerHistoryTimeline>`, футер «Zamknij». Открывается кнопкой «Historia planistów» на карточке (§17.5.2).

### §17.7 — `UserSheet`: «E-mail lidera (CC)» → «Przełożony (lider)»

Файл: `app/(employee)/employee/(admin)/users/UserSheet.tsx`. Текстовое поле `liderEmail` **удаляется** вместе с ключами `users.fields.liderEmail` / `liderEmailHint`. На его месте — `FormField` + `<Select>` (D6):

| Аспект | Правило |
|---|---|
| Видимость | только когда **итоговая** роль = `planista`: `(roleOverride || role) === 'planista'` (не только `role`, как у старого поля — у MAGSpace-учётки роль может прийти из override). Смена роли на другую → значение сбрасывается в `null` (как флаг `lider`, docs/28 §9.2 #13) |
| Метка / подсказка | `users.fields.liderId` «Przełożony (lider)»; `FormDescription` `users.fields.liderIdHint` — «Zatwierdza przekazania ciągników tego planisty i dostaje kopię (CC) decyzji w wnioskach jego ciągników.» |
| Опции | первая — `users.fields.liderIdNone` «— brak (decyduje administrator) —» (`''` → `null`); дальше — активные планисты с `lider = true`, **кроме редактируемого пользователя** (U9), `name ?? login`, по алфавиту (lookup docs/29 §3.4) |
| Нет ни одного лидера | select `disabled`, вместо подсказки `users.fields.liderIdNoOptions` |
| Устаревшее значение (U10) | сохранённый `liderId` указывает на пользователя, который больше не лидер / неактивен → он **остаётся опцией** (иначе нативный select молча покажет «brak» и следующий «Zapisz» сотрёт связь) с суффиксом `liderIdStaleNotLider` «{name} (nie jest już liderem)» / `liderIdStaleInactive`; под полем — предупреждение `flex items-center gap-1.5 text-xs text-warning-dark dark:text-warning` + `<AlertTriangle size={14} aria-hidden/>` `users.fields.liderIdStaleHint` |
| MAGSpace-учётка | поле **активно** (не `disabled`, в отличие от `role`): `liderId` ставит только admin, reconcile его не трогает (U9) |
| PATCH | как у флага — слать, только если значение отличается от сохранённого |
| 422 (код валидации U9) | `<FormMessage>` под полем: `users.errors.liderIdInvalid` |
| Порядок полей | сразу после блока чекбокса «Lider» (где было старое поле) |

Опционально (не блокирует): в `UsersListView` у строки планисты — `text-xs text-text-sub` «↳ {liderName}» второй строкой под именем. Не обязательно для фичи.

### §17.8 — Модалка выезда: планиста из снимка

`DelegationDetailModal`, блок «ZESPÓŁ PROWADZĄCY» (§7.9.7), строка `team.planista`:

- Значение = **`delegation.planner`** (снимок периода выезда, docs/29 §3.3), не `delegation.vehicle.planner`. Метка **не меняется** («Planista») — блок и так про этот выезд, как заголовок Chat-сообщения.
- Если `delegation.planner.id !== delegation.vehicle.planner.id` — под именем одна строка `text-xs text-text-sub`: `team.planistaNow` «Ciągnik prowadzi obecnie: {name}». Больше ничего — ни бейджа, ни цвета. Это ровно тот случай, который иначе выглядит как ошибка: выезд «W trasie» ведёт прежний планиста (R6), а машина уже у нового.
- Строка-подсказка видна всем ролям, которые видят модалку: имя текущего планисты они и так видят в карточке машины.
- `delegation.planner == null` (не должно случиться после бэкфилла) → `—` по §6.5. Нет `vehicle.planner` в DTO → подсказки нет, дополнительного запроса нет.
- Комментарий в коде «resolved LIVE» (строки ≈523–525 `DelegationDetailModal.tsx`) переписать на «snapshot of the trip period (docs/29)».

### §17.9 — Инвалидация и тосты

Любая мутация (подача, отмена, одобрение, отказ) инвалидирует: список заявок (обе вкладки, оба режима) и счётчик; журнал этой машины; детали машины. Одобрение дополнительно — всё «живое» по машине (U7): списки машин (`/employee/vehicles`, `/fleet/planista`), выезды (`/delegations`), км-отчёт (`/planista/moje-pojazdy`). Точные query-keys — на web-agent.

Тосты — только короткий успех (§8.3), по одному на действие: `request.success`, `cancel.success`, `approve.success`, `reject.success`. Всё, что пользователь должен прочитать (409, 422), — **внутри открытого диалога**, не тостом.

### §17.10 — a11y

- Все диалоги — фокус на первом поле (`Nowy planista` / `Komentarz` / `Powód odrzucenia`), Esc закрывает верхний, фокус возвращается на кнопку-триггер (§8.4). Enter в `<textarea>` — перенос строки, не сабмит.
- Карточка — `<article aria-labelledby={plateId}>` + `aria-describedby` на строку «от → к»; отдельный `aria-label` не нужен.
- Стрелка «→» — иконка `aria-hidden` + `sr-only` «przekazanie do» (не символ в тексте).
- `<LockNotice>` в заблокированной карточке связан через `aria-describedby` с блоком карточки.
- Статус — всегда текстом (`TransferStatusBadge`), счётчик — всегда с `aria-label`.
- Кнопки действий ≥ 44px на мобильных (`min-h-[44px]` ниже `sm`).
- Даты — `<time dateTime={iso}>`.
- Контрасты: см. §17.1; `bg-warning-dark` + белый 5.2:1; `text-text-sub` на `bg-input/60` ≥ 4.5:1 в обеих темах (как `<LockNotice>` на `bg-input`).

### §17.11 — i18n-контракт (PL default + EN) — готово к вставке

**`messages/pl.json`**

```json
"nav": {
  "transfers": "Przekazania",
  "transfersBadge": "{count, plural, one {# wniosek czeka na decyzję} few {# wnioski czekają na decyzję} many {# wniosków czeka na decyzję} other {# wniosku czeka na decyzję}}"
},
"planista": {
  "nav": {
    "ariaLabel": "Sekcje panelu planisty",
    "fleet": "Flota",
    "myTransfers": "Moje wnioski",
    "approvals": "Do zatwierdzenia",
    "approvalsBadge": "{count, plural, one {# wniosek czeka na decyzję} few {# wnioski czekają na decyzję} many {# wniosków czeka na decyzję} other {# wniosku czeka na decyzję}}"
  }
},
"team": {
  "planistaNow": "Ciągnik prowadzi obecnie: {name}"
},
"users": {
  "fields": {
    "liderId": "Przełożony (lider)",
    "liderIdHint": "Zatwierdza przekazania ciągników tego planisty i dostaje kopię (CC) decyzji w wnioskach jego ciągników.",
    "liderIdNone": "— brak (decyduje administrator) —",
    "liderIdNoOptions": "Brak aktywnych liderów planistów — najpierw nadaj flagę „Lider” jednemu z planistów.",
    "liderIdStaleNotLider": "{name} (nie jest już liderem)",
    "liderIdStaleInactive": "{name} (nieaktywny)",
    "liderIdStaleHint": "Wybrany przełożony nie jest aktywnym liderem — wnioski tego planisty rozpatruje administrator. Wybierz innego lidera."
  },
  "errors": {
    "liderIdInvalid": "Przełożonym może być tylko aktywny planista z flagą „Lider”, inny niż ten użytkownik."
  }
},
"transfers": {
  "title": "Przekazania ciągników",
  "subtitle": {
    "admin": "Wnioski o zmianę planisty ciągnika. Planista zmienia się dopiero po zatwierdzeniu.",
    "lider": "Wnioski o przekazanie ciągników Twoich planistów.",
    "author": "Twoje wnioski o zmianę planisty i decyzje w ich sprawie."
  },
  "tabs": {
    "ariaLabel": "Wnioski o przekazanie",
    "pendingDecider": "Do decyzji",
    "pendingAuthor": "Oczekujące",
    "decided": "Rozpatrzone",
    "mine": "Moje wnioski"
  },
  "status": {
    "pending": "Oczekuje",
    "approved": "Zatwierdzony",
    "rejected": "Odrzucony",
    "cancelled": "Anulowany"
  },
  "filter": {
    "status": "Status",
    "all": "Wszystkie",
    "pending": "Oczekujące",
    "allDecided": "Wszystkie rozpatrzone",
    "approved": "Zatwierdzone",
    "rejected": "Odrzucone",
    "cancelled": "Anulowane"
  },
  "card": {
    "side": "bok {side}",
    "fromToSr": "przekazanie do",
    "requestedBy": "Wnioskuje: {name} · {role}",
    "reasonLabel": "Powód",
    "approvedBy": "Zatwierdził: {name} · {role} · {date}",
    "rejectedBy": "Odrzucił: {name} · {role} · {date}",
    "cancelledAt": "Anulowany przez wnioskującego · {date}",
    "commentLabel": "Komentarz",
    "rejectionLabel": "Powód odrzucenia",
    "liderOf": "Lider planisty: {name}",
    "noLider": "Planista bez lidera — decyduje administrator",
    "history": "Historia planistów",
    "approve": "Zatwierdź",
    "reject": "Odrzuć",
    "cancel": "Anuluj wniosek",
    "blockedTarget": "Jesteś planistą docelowym tego wniosku — decyzję podejmuje administrator.",
    "blockedRequester": "To Twój wniosek — decyzję podejmuje administrator.",
    "blockedRequesterAdmin": "To Twój wniosek — decyzję podejmuje inny administrator lub lider obecnego planisty."
  },
  "form": {
    "createHint": "Późniejsza zmiana planisty wymaga wniosku i zatwierdzenia.",
    "locked": "Zablokowane — planistę zmienia się tylko wnioskiem o przekazanie.",
    "lockedTitle": "Planisty nie można zmienić bezpośrednio. Złóż wniosek o przekazanie — zmiana nastąpi po zatwierdzeniu.",
    "lockedAdmin": "Zablokowane — planistę zmienia się tylko wnioskiem. Twój wniosek rozpatrzy inny administrator lub lider obecnego planisty.",
    "lockedInactive": "Zablokowane — ciągnik jest wyłączony, nie można go przekazać.",
    "pendingTitle": "Wniosek o przekazanie do: {to}",
    "pendingMeta": "Wnioskuje: {name} · {role} · {date}",
    "reviewLink": "Rozpatrz w „Przekazania”"
  },
  "request": {
    "button": "Poproś o zmianę planisty",
    "buttonPlanista": "Przekaż ciągnik",
    "title": "Wniosek o zmianę planisty",
    "vehicle": "Ciągnik",
    "vehiclePlaceholder": "Wybierz ciągnik",
    "vehicleOption": "{plate} · bok {side} — {carrier}",
    "noVehicles": "Nie masz ciągników, które można przekazać.",
    "currentPlanner": "Obecny planista",
    "target": "Nowy planista",
    "targetPlaceholder": "Wybierz planistę",
    "noTargets": "Brak innych aktywnych planistów.",
    "reason": "Powód",
    "reasonPlaceholder": "Dlaczego ciągnik ma przejść do innego planisty?",
    "reasonCounter": "{count}/{max}",
    "vehicleRequired": "Wybierz ciągnik.",
    "targetRequired": "Wybierz nowego planistę.",
    "reasonRequired": "Podaj powód (min. 3 znaki).",
    "reasonTooLong": "Powód może mieć maks. {max} znaków.",
    "info": "Planista zmieni się dopiero po zatwierdzeniu przez lidera obecnego planisty lub administratora. Nie wysyłamy powiadomień — wniosek czeka na ich liście „Do decyzji”.",
    "infoAdmin": "Planista zmieni się dopiero po zatwierdzeniu przez innego administratora lub lidera obecnego planisty — swojego wniosku nie zatwierdzisz. Nie wysyłamy powiadomień. Jeśli nie ma nikogo takiego, wniosek można tylko anulować.",
    "independentOfForm": "Wniosek wysyłasz od razu — niezależnie od zapisu formularza ciągnika.",
    "submit": "Wyślij wniosek",
    "submitting": "Wysyłanie…",
    "success": "Wniosek wysłany do zatwierdzenia",
    "errors": {
      "alreadyPending": "Dla tego ciągnika jest już oczekujący wniosek — widok został odświeżony.",
      "sameOrInvalidTarget": "Wybrany planista jest nieaktywny albo już prowadzi ten ciągnik. Wybierz innego.",
      "vehicleInactive": "Ciągnik jest wyłączony — nie można go przekazać.",
      "notAllowed": "Nie możesz złożyć wniosku dla tego ciągnika.",
      "generic": "Nie udało się wysłać wniosku. Spróbuj ponownie."
    }
  },
  "cancel": {
    "title": "Anulować wniosek?",
    "body": "Wniosek o przekazanie {plate} do planisty {to} zostanie anulowany. Możesz później złożyć nowy.",
    "confirm": "Anuluj wniosek",
    "back": "Wróć",
    "success": "Wniosek anulowany",
    "errors": {
      "notPending": "Wniosek został już rozpatrzony — widok został odświeżony.",
      "generic": "Nie udało się anulować wniosku."
    }
  },
  "approve": {
    "title": "Zatwierdzić przekazanie?",
    "description": "{plate}: {from} → {to}",
    "effectVehicle": "Ciągnik od razu przejdzie do planisty {to}.",
    "effectTrips": "Wyjazdy „Zgłoszony” i „Gotowy” przejdą do {to}. Wyjazd „W trasie” poprowadzi {from} do zjazdu.",
    "effectHistory": "{from} zachowa wgląd w wyjazdy, które prowadził.",
    "comment": "Komentarz (opcjonalnie)",
    "confirm": "Zatwierdź przekazanie",
    "success": "Ciągnik {plate} przekazany do {to}"
  },
  "reject": {
    "title": "Odrzucić wniosek?",
    "description": "{plate}: {from} → {to}",
    "reason": "Powód odrzucenia",
    "reasonHint": "Wnioskujący zobaczy powód na swojej liście wniosków.",
    "confirm": "Odrzuć wniosek",
    "success": "Wniosek odrzucony"
  },
  "decisionErrors": {
    "stale": "Wniosek jest nieaktualny — planista ciągnika się zmienił albo wniosek został już rozpatrzony. Lista została odświeżona.",
    "targetInactive": "Planista docelowy jest nieaktywny — wniosku nie można zatwierdzić.",
    "vehicleInactive": "Ciągnik jest wyłączony — wniosku nie można zatwierdzić.",
    "forbidden": "Nie możesz rozpatrzyć tego wniosku.",
    "generic": "Nie udało się zapisać decyzji. Spróbuj ponownie."
  },
  "history": {
    "title": "Historia planistów",
    "dialogTitle": "Historia planistów — {plate}",
    "listAria": "Historia planistów ciągnika {plate}",
    "current": "Obecnie",
    "since": "od {from}",
    "range": "{from} – {to}",
    "source": {
      "create": "Utworzenie",
      "transfer": "Przekazanie",
      "backfill": "Dane historyczne"
    },
    "createdBy": "Dodał: {name}",
    "requestedBy": "Wnioskował: {name} · {role}",
    "approvedBy": "Zatwierdził: {name} · {role}",
    "backfillNote": "Przypisanie sprzed wprowadzenia historii — początek to data dodania ciągnika.",
    "pendingNode": "Oczekuje na decyzję: przekazanie do {to}",
    "pendingMeta": "Wniosek z {date} · wnioskuje {name} ({role})",
    "closedRequests": "{count, plural, one {Odrzucony lub anulowany wniosek (#)} few {Odrzucone lub anulowane wnioski (#)} many {Odrzucone lub anulowane wnioski (#)} other {Odrzucone lub anulowane wnioski (#)}}",
    "error": "Nie udało się wczytać historii planistów.",
    "retry": "Spróbuj ponownie"
  },
  "empty": {
    "pendingDecider": {
      "title": "Brak wniosków do decyzji",
      "message": "Nowe wnioski o przekazanie ciągników pojawią się tutaj."
    },
    "pendingAuthor": {
      "title": "Brak oczekujących wniosków",
      "messagePlanista": "Aby przekazać ciągnik innemu planiście, złóż wniosek.",
      "messageOpiekun": "Wniosek o zmianę planisty złożysz w formularzu edycji ciągnika.",
      "action": "Przekaż ciągnik"
    },
    "decided": {
      "title": "Brak rozpatrzonych wniosków",
      "message": "Tu pojawią się zatwierdzone, odrzucone i anulowane wnioski."
    },
    "decidedFiltered": {
      "title": "Brak wyników",
      "message": "Brak wniosków o wybranym statusie.",
      "action": "Wyczyść filtry"
    },
    "notLider": {
      "title": "Sekcja dla liderów planistów",
      "message": "Wnioski o przekazanie ciągników rozpatruje lider planisty lub administrator."
    }
  }
}
```

**`messages/en.json`**

```json
"nav": {
  "transfers": "Transfers",
  "transfersBadge": "{count, plural, one {# request awaits a decision} other {# requests await a decision}}"
},
"planista": {
  "nav": {
    "ariaLabel": "Planner panel sections",
    "fleet": "Fleet",
    "myTransfers": "My requests",
    "approvals": "To approve",
    "approvalsBadge": "{count, plural, one {# request awaits a decision} other {# requests await a decision}}"
  }
},
"team": {
  "planistaNow": "Now planned by: {name}"
},
"users": {
  "fields": {
    "liderId": "Reports to (lead)",
    "liderIdHint": "Approves this planner's vehicle transfers and receives a copy (CC) of claim decisions for their vehicles.",
    "liderIdNone": "— none (an administrator decides) —",
    "liderIdNoOptions": "No active planner leads — first give the “Lead” flag to one of the planners.",
    "liderIdStaleNotLider": "{name} (no longer a lead)",
    "liderIdStaleInactive": "{name} (inactive)",
    "liderIdStaleHint": "The selected supervisor is not an active lead — this planner's requests are decided by an administrator. Choose another lead."
  },
  "errors": {
    "liderIdInvalid": "The supervisor must be an active planner with the “Lead” flag, other than this user."
  }
},
"transfers": {
  "title": "Vehicle transfers",
  "subtitle": {
    "admin": "Requests to change a vehicle's planner. The planner changes only after approval.",
    "lider": "Transfer requests for your planners' vehicles.",
    "author": "Your planner-change requests and their decisions."
  },
  "tabs": {
    "ariaLabel": "Transfer requests",
    "pendingDecider": "To decide",
    "pendingAuthor": "Pending",
    "decided": "Decided",
    "mine": "My requests"
  },
  "status": {
    "pending": "Pending",
    "approved": "Approved",
    "rejected": "Rejected",
    "cancelled": "Cancelled"
  },
  "filter": {
    "status": "Status",
    "all": "All",
    "pending": "Pending",
    "allDecided": "All decided",
    "approved": "Approved",
    "rejected": "Rejected",
    "cancelled": "Cancelled"
  },
  "card": {
    "side": "side {side}",
    "fromToSr": "transfer to",
    "requestedBy": "Requested by: {name} · {role}",
    "reasonLabel": "Reason",
    "approvedBy": "Approved by: {name} · {role} · {date}",
    "rejectedBy": "Rejected by: {name} · {role} · {date}",
    "cancelledAt": "Cancelled by the requester · {date}",
    "commentLabel": "Comment",
    "rejectionLabel": "Rejection reason",
    "liderOf": "Planner's lead: {name}",
    "noLider": "Planner has no lead — an administrator decides",
    "history": "Planner history",
    "approve": "Approve",
    "reject": "Reject",
    "cancel": "Cancel request",
    "blockedTarget": "You are the target planner of this request — an administrator decides.",
    "blockedRequester": "This is your request — an administrator decides.",
    "blockedRequesterAdmin": "This is your request — another administrator or the current planner's lead decides."
  },
  "form": {
    "createHint": "Changing the planner later requires a request and approval.",
    "locked": "Locked — the planner changes only through a transfer request.",
    "lockedTitle": "The planner can't be changed directly. File a transfer request — the change takes effect after approval.",
    "lockedAdmin": "Locked — the planner changes only through a request. Your request is decided by another administrator or the current planner's lead.",
    "lockedInactive": "Locked — the vehicle is disabled and can't be transferred.",
    "pendingTitle": "Transfer request to: {to}",
    "pendingMeta": "Requested by: {name} · {role} · {date}",
    "reviewLink": "Review in “Transfers”"
  },
  "request": {
    "button": "Request a planner change",
    "buttonPlanista": "Transfer vehicle",
    "title": "Planner change request",
    "vehicle": "Vehicle",
    "vehiclePlaceholder": "Select a vehicle",
    "vehicleOption": "{plate} · side {side} — {carrier}",
    "noVehicles": "You have no vehicles that can be transferred.",
    "currentPlanner": "Current planner",
    "target": "New planner",
    "targetPlaceholder": "Select a planner",
    "noTargets": "There are no other active planners.",
    "reason": "Reason",
    "reasonPlaceholder": "Why should the vehicle move to another planner?",
    "reasonCounter": "{count}/{max}",
    "vehicleRequired": "Select a vehicle.",
    "targetRequired": "Select the new planner.",
    "reasonRequired": "Enter a reason (at least 3 characters).",
    "reasonTooLong": "The reason can be at most {max} characters.",
    "info": "The planner changes only after the current planner's lead or an administrator approves. No notifications are sent — the request waits in their “To decide” list.",
    "infoAdmin": "The planner changes only after another administrator or the current planner's lead approves — you can't approve your own request. No notifications are sent. If there is no one who can decide, the request can only be cancelled.",
    "independentOfForm": "The request is sent immediately — independently of saving the vehicle form.",
    "submit": "Send request",
    "submitting": "Sending…",
    "success": "Request sent for approval",
    "errors": {
      "alreadyPending": "This vehicle already has a pending request — the view has been refreshed.",
      "sameOrInvalidTarget": "The selected planner is inactive or already plans this vehicle. Choose another one.",
      "vehicleInactive": "The vehicle is disabled and can't be transferred.",
      "notAllowed": "You can't file a request for this vehicle.",
      "generic": "Could not send the request. Please try again."
    }
  },
  "cancel": {
    "title": "Cancel the request?",
    "body": "The request to transfer {plate} to {to} will be cancelled. You can file a new one later.",
    "confirm": "Cancel request",
    "back": "Go back",
    "success": "Request cancelled",
    "errors": {
      "notPending": "The request has already been decided — the view has been refreshed.",
      "generic": "Could not cancel the request."
    }
  },
  "approve": {
    "title": "Approve the transfer?",
    "description": "{plate}: {from} → {to}",
    "effectVehicle": "The vehicle moves to {to} immediately.",
    "effectTrips": "“Reported” and “Ready” trips move to {to}. A trip “On the road” stays with {from} until it returns.",
    "effectHistory": "{from} keeps access to the trips they planned.",
    "comment": "Comment (optional)",
    "confirm": "Approve transfer",
    "success": "Vehicle {plate} transferred to {to}"
  },
  "reject": {
    "title": "Reject the request?",
    "description": "{plate}: {from} → {to}",
    "reason": "Rejection reason",
    "reasonHint": "The requester will see the reason in their list of requests.",
    "confirm": "Reject request",
    "success": "Request rejected"
  },
  "decisionErrors": {
    "stale": "The request is out of date — the vehicle's planner has changed or the request was already decided. The list has been refreshed.",
    "targetInactive": "The target planner is inactive — the request can't be approved.",
    "vehicleInactive": "The vehicle is disabled — the request can't be approved.",
    "forbidden": "You can't decide this request.",
    "generic": "Could not save the decision. Please try again."
  },
  "history": {
    "title": "Planner history",
    "dialogTitle": "Planner history — {plate}",
    "listAria": "Planner history of vehicle {plate}",
    "current": "Current",
    "since": "since {from}",
    "range": "{from} – {to}",
    "source": {
      "create": "Creation",
      "transfer": "Transfer",
      "backfill": "Historical data"
    },
    "createdBy": "Added by: {name}",
    "requestedBy": "Requested by: {name} · {role}",
    "approvedBy": "Approved by: {name} · {role}",
    "backfillNote": "Assignment from before history was recorded — the start is the date the vehicle was added.",
    "pendingNode": "Awaiting decision: transfer to {to}",
    "pendingMeta": "Request of {date} · requested by {name} ({role})",
    "closedRequests": "{count, plural, one {Rejected or cancelled request (#)} other {Rejected or cancelled requests (#)}}",
    "error": "Could not load the planner history.",
    "retry": "Try again"
  },
  "empty": {
    "pendingDecider": {
      "title": "No requests to decide",
      "message": "New vehicle transfer requests will appear here."
    },
    "pendingAuthor": {
      "title": "No pending requests",
      "messagePlanista": "To hand a vehicle over to another planner, file a request.",
      "messageOpiekun": "You file a planner-change request from the vehicle edit form.",
      "action": "Transfer vehicle"
    },
    "decided": {
      "title": "No decided requests",
      "message": "Approved, rejected and cancelled requests will appear here."
    },
    "decidedFiltered": {
      "title": "No results",
      "message": "No requests with the selected status.",
      "action": "Clear filters"
    },
    "notLider": {
      "title": "For planner leads only",
      "message": "Vehicle transfer requests are decided by the planner's lead or an administrator."
    }
  }
}
```

**Удалить** из обоих языков: `users.fields.liderEmail`, `users.fields.liderEmailHint`, *(2026-10-23)* `transfers.request.buttonOpiekun` (заменён `transfers.request.button`).

**Дельта 2026-10-23 (admin подаёт заявки)** — уже внесена в блоки выше; таблица для web-agent:

| Ключ | Действие | PL | EN |
|---|---|---|---|
| `transfers.request.button` | новый (вместо `buttonOpiekun`; опекун + admin, E1/E2) | Poproś o zmianę planisty | Request a planner change |
| `transfers.request.buttonOpiekun` | **удалить** | — | — |
| `transfers.form.lockedAdmin` | изменить текст (E2) | Zablokowane — planistę zmienia się tylko wnioskiem. Twój wniosek rozpatrzy inny administrator lub lider obecnego planisty. | Locked — the planner changes only through a request. Your request is decided by another administrator or the current planner's lead. |
| `transfers.request.infoAdmin` | новый (инфо-строка диалога подачи, admin) | Planista zmieni się dopiero po zatwierdzeniu przez innego administratora lub lidera obecnego planisty — swojego wniosku nie zatwierdzisz. Nie wysyłamy powiadomień. Jeśli nie ma nikogo takiego, wniosek można tylko anulować. | The planner changes only after another administrator or the current planner's lead approves — you can't approve your own request. No notifications are sent. If there is no one who can decide, the request can only be cancelled. |
| `transfers.card.blockedRequesterAdmin` | новый (`<LockNotice>` на «Do decyzji» + строка в `<PendingTransferNotice>`) | To Twój wniosek — decyzję podejmuje inny administrator lub lider obecnego planisty. | This is your request — another administrator or the current planner's lead decides. |
| `transfers.tabs.mine` | новый (3-я вкладка admin) | Moje wnioski | My requests |
| `transfers.filter.pending` | новый (фильтр «Moje wnioski», по умолчанию) | Oczekujące | Pending |
| `transfers.filter.allDecided` | новый (фильтр «Moje wnioski») | Wszystkie rozpatrzone | All decided |
| `transfers.filter.approved` / `rejected` / `cancelled` | reuse | — | — |
| `transfers.empty.pendingAuthor.title` + `.messageOpiekun`, `empty.decided`, `empty.decidedFiltered` | reuse (пустые состояния «Moje wnioski») | — | — |

Ключи-объекты выше **сливаются** с существующими (`nav`, `planista`, `team`, `users.fields`, `users.errors`), а не заменяют их. Метка вкладки «Przebieg» — существующий `myKm.tab`. Паритет PL/EN проверяется существующей проверкой.

### §17.12 — Что UI ждёт от api-agent (зависимости, не дизайн-решения)

| # | Нужно UI | Зачем |
|---|---|---|
| A1 | `GET /planner-transfers` различает **«мне решать»** и **«мои»** — параметр (`scope=decide \| mine`) или флаги в DTO (`viewerCanDecide`, `viewerBlockedReason: 'target' \| 'requester' \| null`) | Лидер-планиста одновременно может быть автором (своя машина) и решающим (машины подчинённых) — два разных экрана |
| A2 | DTO заявки: `id`, `status`, `vehicle {id, plateNumber, sideNumber, carrier {name, login}}`, `fromPlanner`, `toPlanner` (`{id, name, login}`), `requestedBy` / `decidedBy` (`{id, name, login, role, lider}`), `reason`, `decisionComment`, `decidedAt`, `createdAt`. *Опционально:* `fromPlanner.leader {id, name}` для строки `card.liderOf` | Карточка §17.5.2, подписи ролей через `roleLabelKey(role, lider)` |
| A3 | `GET /vehicles/:id/planner-history`: назначения (`planner`, `validFrom`, `validTo`, `source`, `actor`, связанная заявка с `requestedBy` / `decidedBy` / `reason` / `decisionComment`) + заявки по машине в любом статусе | Журнал §17.6 и индикатор `pending` в форме §17.2 (один запрос на оба) |
| A4 | Коды ошибок (`extensions.code`) для: уже есть `pending` (409), заявка устарела / уже решена (409), цель неактивна или совпадает с текущим (422), машина неактивна (422), ошибка поля `reason` (422) | Таблицы ответов §17.3 / §17.5.5 |
| A5 | Подача заявки по **выключенной** машине — 422 (UI прячет кнопку, но сервер — источник истины; U6 всё равно не даст её одобрить) | E3 в §17.2 |
| A6 | DTO выезда: `planner` (снимок) **и** `vehicle.planner {id, name, login}` | Подсказка §17.8 |
| A7 | Lookups: цели передачи (активные планисты без текущего) и лидеры для UserSheet (активные `planista` + `lider`) | §17.3 п.3, §17.7 |
| A8 | Пагинация «Rozpatrzone» — курсором (под `<CursorPager>`) | §17.5.1 |
| A9 *(2026-10-23)* | admin: `POST /vehicles/:id/planner-transfers` по любой машине, `POST /planner-transfers/:id/cancel` для своей заявки, `GET /planner-transfers?scope=mine` (все значения `status`); в `scope=decide` у admin своя заявка приходит с `viewerCanDecide=false`, `viewerBlockedReason='requester'`, `viewerCanCancel=true` | E2 / E4 (§17.2.2), pill (§17.4.3), §17.5.4, §17.5.8. UI дублирует проверку по id (`requestedBy.id === me`), сервер — окончательно (403) |

### §17.13 — Компоненты / файлы / токены (сводка для web-agent)

| Изменение | Где | Тип |
|---|---|---|
| `<TransferStatusBadge>` | `components/transfers/TransferStatusBadge.tsx` | **новый** (обёртка `<Badge>`) |
| `<PlannerTransferRequestDialog>` (2 входа) | `components/transfers/PlannerTransferRequestDialog.tsx` | **новый** (композиция `<Dialog>`) |
| `<PendingTransferNotice>` | `components/transfers/PendingTransferNotice.tsx` | **новый** (композиция) |
| `<PlannerTransferList mode="decider" \| "author">` + `<TransferRequestCard>` + диалоги Zatwierdź / Odrzuć | `components/transfers/` | **новые** (композиция `<Tabs>`, `<Dialog>`, `<ConfirmDialog>`, `<LockNotice>`, `<EmptyState>`, `<CursorPager>`) |
| `<PlannerHistoryTimeline>` + `<PlannerHistoryDialog>` | `components/transfers/` | **новые** |
| Ячейка «Planista»: create — `createHint`; edit — Tier A lock без RHF + E1–E4; `plannerId` вне edit-payload | `app/(employee)/employee/vehicles/VehicleFormDialog.tsx` | правка |
| Секция «Historia planistów» (последняя, `span:'full'`), бейдж `pending` у строки «Planista», кнопка «Przekaż ciągnik» для текущего планисты | `VehicleDetailModal` (§6.15) | правка |
| Аддитивный слот `extraActions?: ReactNode` в футере | `components/ui/EntityDetailModal.tsx` | правка примитива (аддитивно) |
| Пункт `transfers` + pill `bg-warning-dark` (только admin) | `lib/nav.config.ts`, `components/layout/EmployeeSidebar.tsx` | правка |
| `/employee/przekazania` (admin → decider + вкладка «Moje wnioski» `scope=mine` с фильтром статуса, §17.5.8; opiekun → author) | `app/(employee)/employee/przekazania/page.tsx` | **новый маршрут** (не admin-only) |
| *(2026-10-23)* E2 = «подать» для admin (кнопка `request.button`, причина `lockedAdmin`); `<PendingTransferNotice>`: строка `blockedRequesterAdmin` + отмена для admin-автора; `infoAdmin` в диалоге подачи; `blockedRequesterAdmin` в §17.5.4 | `VehiclePlannerLockedField.tsx` (+ `plannerCellState`), `PendingTransferNotice.tsx`, `PlannerTransferRequestDialog.tsx`, `TransferRequestCard.tsx` | правка |
| `<PlanistaTabsNav>` (4 вкладки, лидерская — по `user.lider`, pill) | `app/(planista)/PlanistaTabsNav.tsx` + `layout.tsx` | **новый** |
| `/planista/przekazania` (author), `/planista/zatwierdzenia` (decider, guard `user.lider`) | `app/(planista)/planista/…` | **новые маршруты** |
| `FleetPanel` без `myKmHref` на `/planista` | `app/(planista)/planista/page.tsx` | правка |
| «Przełożony (lider)» вместо «E-mail lidera (CC)» | `app/(employee)/employee/(admin)/users/UserSheet.tsx` | правка |
| Планиста из снимка + `team.planistaNow` | `components/delegations/DelegationDetailModal.tsx` | правка |
| i18n §17.11 (+ удаление двух ключей) | `messages/pl.json`, `messages/en.json` | правка |

**Токены: 0 новых.** Используются существующие `bg-card`, `bg-input`, `bg-input/60`, `border-border`, `border-border/60`, `border-l-success`, `border-l-danger`, `bg-success`, `bg-warning`, `bg-warning-dark`, `text-warning-dark` / `dark:text-warning`, `text-text`, `text-text-sub`, `text-brand`, `ring-brand/40`. **0 правок** `tailwind.config.ts` / `globals.css`.

**Иконки (Lucide):** `ArrowLeftRight`, `ArrowRight`, `ClipboardCheck`, `History`, `Clock`, `CheckCircle2`, `XCircle`, `Ban`, `Lock`, `Info`, `AlertTriangle`, `Truck`, `Gauge`. Эмодзи — нет.

### §17.14 — Acceptance checklist (§17, web-agent)

- [ ] **Никто не меняет планисту напрямую.** В edit-режиме `VehicleFormDialog` нет селекта планисты ни для одной роли, включая admin; `plannerId` отсутствует в теле `PATCH` (проверено в network).
- [ ] Create-режим (включая wizard): селект на месте, обязателен, под ним `createHint`.
- [ ] Заблокированное поле — рецепт §6.5.13 Tier A (readOnly-инпут + замок + причина в `FormDescription` + `title`), не `disabled`, не `opacity-50`; причина по роли/состоянию E1–E3.
- [ ] Кнопка «Poproś o zmianę planisty» (`request.button`) — opiekun (E1) и *(2026-10-23)* admin (E2, любая машина), только при активной машине и без `pending`; у других ролей её **нет в DOM**; `type="button"`. В футере детальной модалки у admin кнопки нет.
- [ ] `<PendingTransferNotice>` показывает цель, автора с ролью, дату-время, причину; «Anuluj wniosek» — только автору (admin включительно); admin-автор видит строку `blockedRequesterAdmin` и **не** видит ссылку «Rozpatrz»; admin, который не автор, видит ссылку в «Przekazania».
- [ ] *(2026-10-23)* Диалог подачи у admin — инфо-строка `request.infoAdmin` вместо `request.info`.
- [ ] *(2026-10-23)* `/employee/przekazania` у admin: вкладки «Do decyzji (n)» · «Rozpatrzone» · «Moje wnioski» (без счётчика, по умолчанию активна первая); на «Moje wnioski» — фильтр статуса (по умолчанию «Oczekujące»), без вложенных вкладок; `pending`-карточка — «Anuluj wniosek», остальные — только «Historia planistów». Своя заявка admin на «Do decyzji» — `<LockNotice>` `blockedRequesterAdmin`, без кнопок, в pill и «(n)» не считается.
- [ ] Диалог подачи: цель без текущего планисты, причина обязательна со счётчиком, инфо-строка про отсутствие уведомлений; из формы машины — строка `independentOfForm`; вложенный диалог корректно стекуется поверх формы.
- [ ] 409 «уже есть» / 422 / 403 показываются **в диалоге** (слот футера или `<FormMessage>`), не тостом; после 409 у хоста появляется `pending`-плашка.
- [ ] `<TransferStatusBadge>`: четыре статуса → `warning` / `success` / `danger` / `muted` + иконка + текст; ни одного нового варианта `<Badge>`.
- [ ] Sidebar: «Przekazania» у admin и opiekun; pill только у admin, `bg-warning-dark text-white`, скрыт при 0 и во время загрузки, с `aria-label`.
- [ ] `<PlanistaTabsNav>`: route-based, клавиатура как у weryfikatora, `useActiveNavRefresh`; «Moje wnioski» — только `planista`; «Do zatwierdzenia» — только `planista && user.lider`, с pill (считает только строки, которые он может решить); admin в шелле видит только Flota / Przebieg; прямой заход не-лидера — `empty.notLider` без запроса к API.
- [ ] Список заявок: вкладки «Do decyzji / Oczekujące» (старые сверху) и «Rozpatrzone» (новые сверху, фильтр статуса, курсорная пагинация); карточки показывают причину и комментарий **целиком**.
- [ ] Строка, которую лидер решить не может (он получатель / автор), — `<LockNotice>` с причиной, кнопок решения **нет в DOM**.
- [ ] «Zatwierdź»: три строки последствий, необязательный комментарий, primary `default`. «Odrzuć»: обязательная причина, подсказка про видимость автору, primary `destructive`. 409 «устарела» — сообщение в диалоге + обновление списка.
- [ ] Отмена своей заявки: `<ConfirmDialog>` с кнопкой закрытия «Wróć» (не «Anuluj»).
- [ ] `<PlannerHistoryTimeline>`: новые сверху; `pending`-узел первым; текущее назначение с «Obecnie»; период дата-время (кроме начала `backfill` — только дата); источник бейджем; `backfill` с пояснением; отклонённые/отменённые — в `<details>` со счётчиком.
- [ ] Журнал в `<VehicleDetailModal>`: последняя секция `span:'full'`; для przewoźnik секции нет и запрос не уходит; 403 → секция молча скрыта; своя загрузка секции.
- [ ] Лидер открывает журнал из карточки заявки (`<PlannerHistoryDialog>`).
- [ ] У текущего планисты в футере детальной модалки — «Przekaż ciągnik» (outline), скрыта при `pending` / выключенной машине; у других ролей её нет; слот `extraActions` аддитивен.
- [ ] `UserSheet`: поле «E-mail lidera (CC)» удалено; «Przełożony (lider)» видно при итоговой роли `planista`; опции — активные лидеры без самого пользователя + «brak»; устаревший выбор остаётся опцией с суффиксом и предупреждением; на MAGSpace-учётке поле активно; при смене роли сбрасывается.
- [ ] Модалка выезда: «Planista» = снимок выезда; при расхождении с текущим планистой машины — одна строка `team.planistaNow`; комментарий «resolved LIVE» исправлен.
- [ ] После любой мутации обновились список, счётчик, журнал и (для одобрения) флот / выезды / км-отчёт без перезагрузки страницы.
- [ ] Тосты — только успех; всё, что надо прочитать, — внутри диалога.
- [ ] Dark mode: карточки, `bg-input/60`-плашка, бейджи, pill `bg-warning-dark`, спайн журнала — проверены в обеих темах, AA.
- [ ] a11y: `<article aria-labelledby>`, `sr-only` у стрелки, `<time dateTime>`, фокус в диалогах на первом поле и возврат на триггер, кнопки ≥ 44px на мобильных.
- [ ] i18n §17.11 добавлен в PL и EN (паритет), `liderEmail` / `liderEmailHint` удалены.
- [ ] **0 новых токенов; 0 правок `tailwind.config.ts` / `globals.css`.**

### §17.15 — Реализация: отступления web-agent (2026-09-28)

Всё из §17.13 реализовано; ниже — только то, где реализация отличается от текста §17 или уточняет его. Токенов 0, правок `tailwind.config.ts` / `globals.css` 0.

| # | Где | Отступление / уточнение | Почему |
|---|---|---|---|
| W1 | `components/ui/Dialog.tsx`, `Sheet.tsx` (+ `overlayStack.ts`) | Проверка из §17.2 «вложенный диалог» нашла баг: каждый открытый `<Dialog>`/`<Sheet>` вешал свой `keydown` на `document`, и один Esc закрывал **оба** слоя (форма машины теряла несохранённые правки; тот же баг был у `KmCellEditorDialog` + `ConfirmDialog`). Добавлен стек оверлеев: Esc закрывает только верхний. z-index не менялся (поздний портал рисуется поверх), scroll-lock корректен (верхний восстанавливает `hidden`), фокус возвращается на кнопку-триггер. Focus-trap у самописного `Dialog` по-прежнему нет (только начальный фокус + возврат) — как было | a11y / потеря данных; визуально ничего не меняется |
| W2 | `VehicleFormDialog` | `<PlannerTransferRequestDialog>` рендерится **соседом** `<form>` внутри `FormDialog`, а его `onSubmit` делает `stopPropagation` | React-события всплывают по дереву компонентов и через портал: submit вложенной формы иначе дошёл бы до `onSubmit` формы машины и отправил бы PATCH |
| W3 | shared `vehicles.ts` | Новый экспорт `VehicleEditFormSchema` (web-only резолвер edit-формы: правила create **минус** `plannerId`, `.strip()`); общий `refineCompleteVehicle` для create и edit | Edit-форма валидировалась `CreateVehicleSchema`, где `plannerId` обязателен; без поля в форме валидация бы падала. `.strip()` вместо `.strict()` — «лишний» ключ отбрасывается, а не роняет форму root-ошибкой без поля |
| W4 | E2/E3 (§17.2.2) | У admin на **выключенной** машине причина — `lockedInactive`, а не `lockedAdmin`, и кнопки нет. *(2026-10-23: с отменой U1 правило вошло в саму таблицу E — E3 теперь «любая роль», а у E2 кнопка есть только при активной машине; поведение то же)* | Причина состояния важнее причины роли; подать заявку по выключенной машине нельзя никому (A5) |
| W5 | Футер `<VehicleDetailModal>` | «Przekaż ciągnik» появляется только после ответа журнала (`historyReady`) | Тот же принцип, что skeleton в E1: не показывать кнопку, которая через секунду окажется «уже есть заявка» |
| W6 | `<PlanistaTabsNav>` | Контейнер `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 pt-6` (добавлено `mx-auto max-w-screen-2xl`), `overflow-x-auto` на tablist | Страницы планисты (FleetPanel, KmBoardScreen) центрированы с `max-w-screen-2xl`; без этого на ≥1536px табы уезжали влево от заголовка. 4 вкладки на 360px прокручиваются, а не переносятся |
| W7 | `/planista/przekazania`, `/planista/zatwierdzenia` | Admin по прямой ссылке **редиректится** на `/employee/przekazania` (server). *(2026-10-23: остаётся без изменений; редирект идёт на страницу по умолчанию — вкладку «Do decyzji»)* | И решения, и свои заявки admin (вкладка «Moje wnioski», §17.5.8, D9) живут в employee-разделе; второго места для его заявок не нужно |
| W8 | `/employee/przekazania` | Закрыт для `pracownik`: edge — `PATH_PERMISSIONS` в `lib/roles.ts` (any-of `vehicles.planner_transfer.request` / `.decide` по `permissionsFor(role)`; каталог импортируется через чистый subpath `@magguarantee/shared/permissions`, без zod в edge-бандле — docs/28 §9.2 #18, B4 2026-10-23), server — `requirePermission(…, 'forbidden')` → `/employee/forbidden` | Маршрут не admin-only (опекун), но pracownik к передачам отношения не имеет, api ответил бы 403 на оба scope |
| W9 | i18n | Два **новых** ключа сверх §17.11: `transfers.card.cancelledBy` («Anulował: {name} · {role} · {date}») и `transfers.history.forbidden` («Nie masz już wglądu w historię planistów tego ciągnika.») | `cancelled` ставит не только автор: выключение/удаление машины и удаление перевозчика отменяют `pending` с `decidedBy` = выполнившему (docs/13) — «Anulowany przez wnioskującego» был бы ложью. `forbidden` — диалог журнала из карточки, когда зритель уже вне U11 (например, автор-планиста после одобрения): пустой диалог выглядел бы сломанным |
| W10 | `<PlannerHistoryDialog>` | `DialogTitle` = `history.dialogTitle` обычным шрифтом; номер `font-mono` — в `DialogDescription` (+ перевозчик) | Значения next-intl — только примитивы, React-узел в `{plate}` не вставить без смены ключа |
| W11 | `<PlannerHistoryTimeline>` | «od {from}» / «{from} – {to}» рендерятся с настоящими `<time dateTime>` в слотах (маркеры `lib/transfers/interpolateNodes.ts`), порядок слов остаётся за переводом | §17.10 требует `<time>`; ключи §17.11 не менялись |
| W12 | Вкладка «Do decyzji (n)» | Число в скобках скрыто при 0 и во время загрузки, считает только решаемые строки (`viewerCanDecide`) — как pill | Одно правило счётчика везде (§17.4.3) |
| W13 | Вкладка «Do decyzji»/«Oczekujące» | Тоже курсорная (`limit=200`), `<CursorPager>` появляется только за 200 | Очередь короткая, но потеря строк за первой страницей недопустима |
| W14 | Фильтр «Rozpatrzone» | `<Select>` в `bg-input`-баре получает `bg-card` | Иначе селект `bg-input` сливается с баром `bg-input` |
| W15 | Ошибки подачи | 422 `PLANNER_TRANSFER_NO_CURRENT_PLANNER` и 404 → текст `request.errors.notAllowed` + primary скрыт; ошибки решения: 404 → `decisionErrors.stale` | Отдельных ключей нет, смысл совпадает («по этой машине подать нельзя» / «строки больше нет») |
| W16 | `UserSheet` | Итоговая роль для «Przełożony (lider)»: `roleOverride` учитывается только при `managedBy = magspace` (при переключении на `local` api стирает override); смена `managedBy` тоже переоценивает и сбрасывает `liderId`. `liderId` уходит в PATCH только при изменении и **никогда** рядом с не-планистской ролью (api сам очищает связь, явная — 422) | Точнее, чем `(roleOverride \|\| role)` из §17.7, для случая «вернуть учётку в local» |
| W17 | `UsersListView` (опц. из §17.7) | Вторая строка «↳ {лидер}» сделана Lucide `CornerDownRight` (`aria-hidden`) + `sr-only` «Przełożony (lider):» вместо глифа «↳» | Скринридер читал бы «↳» как «стрелка вниз-вправо» |
| W18 | Счётчик / очередь решающего | Запрос `scope=decide&status=pending` идёт с `meta: SUPPRESS_GLOBAL_ERROR` | У pill нет своего error-UI: лидер, у которого только что сняли флаг (U10), получил бы 403-тост на каждой странице; страница входящих показывает inline error state того же запроса |
| W19 | `<LockNotice>` (§6.5.13, общий примитив) | Корень `<div role="note">` вместо `<p>`, обёртка текста `<div className="min-w-0">` вместо `<span>`; вид не меняется | `ApproveTransferDialog` кладёт внутрь `<ul>` — `<ul>` в `<p>` невалиден и давал hydration error в консоли (найдено в браузерной проверке 2026-09-28). Все вызовы стоят в блочных контейнерах |

## Deviations — BugBot header actions (web-agent, 2026-10-02)

«Zgłoś problem» (все роли) / «Zgłoś pomysł» (только admin) — переход в BugBot по одноразовой ссылке (`GET /integrations/bugbot/handoff`). Отдельной спеки uiux нет; ниже — решения по шапке (§7.2, «Carrier shell») и где они отходят от брифа. Видимость — build-time флаг `NEXT_PUBLIC_BUGBOT_ENABLED=true`. Токенов 0, правок `tailwind.config.ts` / `globals.css` 0.

| # | Где | Решение / отступление | Почему |
|---|---|---|---|
| B1 | `<BugbotButtons>` | Pill как у соседних `<LanguageToggle>`/`<ThemeToggle>` (`h-9 rounded-full border-border bg-card/80`, `hover:bg-input`, ring `brand/40`), а не `<Button variant="outline">` (`h-11 rounded-[10px]`) | В шапке все контролы — pill высотой 36px; кнопка другой формы и высоты выбивалась бы |
| B2 | Правый блок `<Header>` | Pill стоят **первыми** в правом блоке, перед `<LanguageToggle>` | При включении флага язык/тема/меню пользователя не сдвигаются; действия отделены от настроек |
| B3 | Брейкпоинты | **< lg** — в шапке ничего, оба действия — пункты `<UserMenu>` (`<BugbotMenuItems>`, после «Zmień hasło», с текстом). **lg+** — pill: одна кнопка — иконка + текст; две (admin) — только иконки (`aria-label` + `title`) до `xl`, с `xl` — иконка + текст | Бриф предлагал «на узких — только иконки». Замер (headless Chrome, собранный CSS): на 360px шапка переполнена уже **до** изменения — логотип сжимается 162→127px у перевозчика и →93px в employee-shell с бургером (заранее существующая проблема, не исправлялась); с иконками у admin он сжимался до 16px, правый блок вылезал за край. На md…lg у admin оставалось ~35px на имя. С lg запас ≥ 165px (одна кнопка с текстом) / ≥ 277px (две иконки); на xl у admin с подписями EN ~300px |
| B4 | Ошибка | Inline-плашка (не тост — решение продукта) под шапкой, справа по краю контента: `absolute top-full right-0 mt-2` от правого блока шапки (он `relative self-stretch`), высота шапки не меняется. `bg-card border-danger/50 shadow-toast`, текст `text-text` 13px semibold, `AlertCircle text-danger`, кнопка «Zamknij» (`common.close`). `role="alert"` на тексте, кнопка закрытия вне alert. Ширина `max-w-[calc(100vw-2rem)]`, с `sm` — `max-w-sm` | Плашка висит над контентом — нужен непрозрачный фон (`dark:bg-danger/15` из `Badge` просвечивал бы). Нейтральный текст вместо `text-danger`: красный на `card` в тёмной теме ≈ 4.4:1, ниже AA для 13px. Закрытие нужно: `Header` переживает навигацию, и без него ошибка висела бы до следующего клика |
| B5 | Иконки | Lucide `Bug` («Zgłoś problem»), `Lightbulb` («Zgłoś pomysł»), `Loader2` (`animate-spin`) на время запроса; обе кнопки `disabled` пока запрос идёт | — |
