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

## Иконки

В legacy используются эмодзи прямо в тексте:
- 📋 Wnioski, ➕ Nowy, 🚛 Flota, 🚀 Wyjazdy, ✅ Zaakceptowano, ❌ Odrzucono, ⏳ Weryfikacja, ⚠️ Reklamacja, 🔄 Odśwież, 🌙 Ciemny, 🏢 Panel, 🔍 Szukaj, 📅 (date picker), ⎘ (copy).

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
- `pracownik` («Opiekun wniosków») — видит **только** Dashboard + Wnioski. Никаких CRUD-вкладок для справочных сущностей. Это соответствует legacy (`index.html:4682-4690`: tabs `Carriers/Vehicles/Drivers/Trailers` рендерятся `if isAdminRole`).
- `opiekun` — видит Dashboard + Wnioski (только своих перевозчиков) + вкладку «Moja opieka» (свой scope CRUD).
- `planista`, `dyspozytor`, `eksport`, `weryfikator` — собственные панели, не Employee panel.

Pattern:
- Список ссылок строится из конфига `nav.config.ts`, каждая запись — `{ href, label, icon, roles: Role[] }`.
- Фильтрация в layout server-component: `links.filter(l => l.roles.includes(currentRole))`.
- Никакого client-side hide через CSS. Что роль не видит — не рендерится.
- Активное состояние ссылки — `bg-brand-50 text-brand` light / `bg-brand/15 text-brand-light` dark.

### Phase 2 confirmation

Phase 2 web (admin DataTable + Sheet edit forms + RHF/Zod валидация + inline VIES/Biała Lista feedback) **не вводит новых color/radius/shadow токенов**. Всё собирается из существующей brand-палитры, semantic colors (`success`/`warning`/`danger`/`text-sub`) и shadcn-примитивов перечисленных выше. Единственный новый custom-компонент — `<FieldValidationBadge>`. Уровень полировки — UAT, не production.

---

## Phase 4 — Employee panel (polished UI)

> Pracownik («Opiekun wniosków») + admin. Полированный уровень, прод-ready. Все компоненты собираются из примитивов Phase 2 — **новых color/radius/shadow токенов не вводим**. Reference: `docs/screenshots/employee-*.png`, `docs/screenshots/modal-status-p1/p2.png`.

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
| Status | `<StatusBadge>` | filter (multi-select по enum) |
| Aktor (last edit) | initials avatar `h-6 w-6` + tooltip с pełnym именем | — |
| Data zmiany | relative (`2 godz. temu`) + tooltip с ISO | sortable, default desc |
| Akcje | row-hover-only kebab `<MoreHorizontal />` | — |

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
| `Autoryzacja` | `claim.doplata > LIMIT_OR_THRESHOLD` (бизнес-правило) | две секции: (1) кнопка «Wymaga autoryzacji» — `<Button variant="default">` с `<Mail />` icon, отправляет email Maksima + переводит claim в `OCZEKUJE_NA_AUTORYZACJE`, после клика disabled + label «Wysłano (yyyy-mm-dd hh:mm)». (2) поле `kwotaMaksima` — `<Input type="number">` с label «Kwota zatwierdzona przez Maksima (EUR)», ручной ввод после получения email-ответа; на blur — сохранение. **Никакого file-upload, никаких screenshot-ов.** |

Tabs typography: `text-sm font-medium`, active — `border-b-2 border-brand text-brand`, остальные — `text-text-sub hover:text-text`.

**Footer (`<SheetFooter>`, sticky):**
- Slot слева: destructive ghost `<Button variant="ghost" className="text-danger">Odrzuć</Button>` (только если статус != ODRZUCONO/ZAAKCEPTOWANO).
- Slot справа: `<Button variant="ghost">Anuluj</Button>` + primary `<Button>Zaakceptuj</Button>` (label меняется: «Zapisz» во вкладке Autoryzacja, «Zaakceptuj» в Edit).

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

Reference: legacy `ensureLimitySheet`. Таблица KM-гарантий per (carrier × vehicle × period).

**Anatomy:** строка `<DataTable>`, но cell `limit_km` рендерится как `<TextField>` (Phase 2 input, `h-8 w-24 tabular-nums`) **встроенный** в ячейку. На focus — `border-brand`. На blur — save (POST), optimistic update value, при ошибке rollback + `<Toast variant="destructive">`.

**Состояния cell:**
- `idle` — обычный input.
- `saving` — спиннер 12px справа от input, input disabled.
- `success` (200ms after save) — короткая зелёная полоска под input `bg-success h-0.5`, fade-out.
- `error` — `border-danger`, value reverted, toast.

**Прочие колонки** — read-only: carrier, vehicle plate, period (MM/YYYY), updatedAt, updatedBy.

**Add-row:** в footer таблицы кнопка `<Button variant="ghost"><Plus /> Dodaj limit</Button>` → открывает `<Sheet>` с RHF-формой (carrier select, vehicle select, period, limit_km).

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
- [ ] ⚠️ **SUPERSEDED Phase 7.1 (§6.5):** `<ClaimVerificationModal>` теперь = центральная `<Dialog max-w-4xl>` с `mode: 'view' | 'edit'`, **не** `<Sheet>`. Сохраняются: **в секции Autoryzacja НЕТ FileUpload компонента**; live recalc badge debounce 300ms; live dopłata пересчёт при правке фактов. Раскладку (факты → dopłata → decyzja), парные строки и Historia/Autoryzacja читать из §6.5.
- [ ] `<AuditRow>` имеет `default` и `compact` варианты; deterministic avatar-color hash; expand → JSON-diff `<pre>`.
- [ ] `<LimitsRow>` — inline TextField в cell, save-on-blur, optimistic update, rollback + toast on error.
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

**Top-level tabs:** `Wnioski` / `Nowy` / `Flota` / `Wyjazdy`. Emoji prefix kept per voice rules (📋 ➕ 🚛 🚀).

**Flota sub-tabs** (rendered inside `/carrier/fleet/*` layout, below the main tab bar): `Auta` (read-only) / `Kierowcy` (CRUD) / `Naczepy` (CRUD). Same visual pattern as top tabs but rendered as `<div role="tablist">` with `text-xs font-bold uppercase tracking-wider` labels and reduced padding `px-3 py-2`.

### `<StatusBadge>` — extends existing `<Badge>`

Existing `<Badge>` (`apps/web/components/ui/Badge.tsx`) is **sufficient**. Add a thin wrapper `<StatusBadge status={...}>` that maps enum → variant + label:

| `ClaimStatus` value | Badge variant | Visible label (PL) | Icon (Lucide, 12px) |
|---|---|---|---|
| `NA_WERYFIKACJI` | `info` | "Weryfikacja" | `<Clock />` |
| `ZAAKCEPTOWANO` | `success` | "Zaakceptowano" | `<CheckCircle2 />` |
| `ODRZUCONO` | `danger` | "Odrzucono" | `<XCircle />` |
| `REKLAMACJA` | `warning` | "Reklamacja" | `<AlertTriangle />` |
| `OCZEKUJE_NA_AUTORYZACJE` | `info` | "Czeka na autoryzację" | `<Clock />` |
| `AUTORYZACJA_KWOTA_MAKSIMA` | `warning` | "Autoryzacja — kwota maks." | `<AlertTriangle />` |

| `DelegationStatus` value | Badge variant | Label (PL) |
|---|---|---|
| `zgloszony` | `info` | "Zgłoszony" |
| `w_trasie` | `success` | "W trasie" |
| `zjechal` | `muted` | "Zjechał" |
| `anulowany` | `danger` | "Anulowany" |

No new variants — `Badge` covers all. `<StatusBadge>` lives in `components/carrier/StatusBadge.tsx` and is also reused in employee panel later.

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

Click → navigate to claim detail (`/carrier/claims/[id]`). Empty list → `<EmptyState>` with `<FileText />` icon and CTA "Złóż wniosek" linking to `/carrier/claims/new`.

### `<BreakdownTable>` — preview table on new-claim form

Compact read-only table fed by server preview response. Columns:

| Column | Header (PL) | Header (EN) | Format | Tailwind |
|---|---|---|---|---|
| `yearMonth` | "Miesiąc" | "Month" | `2026-04` | `text-left font-mono` |
| `workingDays` | "Dni rob." | "Work days" | integer | `text-right tabular-nums` |
| `kmPerDay` | "Km/dz." | "Km/day" | integer | `text-right tabular-nums` |
| `ratePerKm` | "€/km" | "€/km" | 4 decimals | `text-right tabular-nums` |
| `kmInMonth` | "Km/mc" | "Km/mo" | integer with thousand-sep | `text-right tabular-nums font-semibold` |

Headers were **abbreviated in Phase 3.1** (`Km/dzień`→`Km/dz.`, `Stawka €/km`→`€/km`, `Km w mc`→`Km/mc`, total `…(km gwarantowane)`→`…(km gwarant.)`) so the 5-column table never wraps headers even when squeezed into the narrow employee claim modal. i18n keys unchanged: `carrier.breakdown.*` in `messages/pl.json` + `en.json`.

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

Triggered from claim detail page when status is `ODRZUCONO` and within 48h of decision. shadcn `<Sheet side="right">`, `w-[480px]` (Phase 2 standard).

| Field | Type | Validation |
|---|---|---|
| `tresc` | `<Textarea>` rows=6, label "Treść reklamacji" | required, 20–2000 chars |
| `kwotaReklamacji` | `<Input type="number" step="0.01">`, label "Kwota reklamacji (EUR)", suffix "€" | required, > 0, ≤ `kwotaWnioskowana − kwotaWyplacona` (max value rendered as `<FormDescription>`: "Maksymalnie: 1 234,56 €") |

**48-hour countdown indicator** — sticky banner at top of the sheet body:

| Element | Tailwind |
|---|---|
| Wrapper | `flex items-center gap-2 rounded-md bg-warning-bg dark:bg-warning/15 px-3 py-2 mb-4` |
| Icon | `<Clock size={16} class="text-warning-dark dark:text-warning" />` |
| Text | `text-sm text-warning-dark dark:text-warning` — "Pozostało: **23h 14min**" (bold the duration) |
| Tick | re-render every 60s (no second-by-second — burns cycles, not informative) |
| When < 1h remaining | swap wrapper to `bg-danger-bg text-danger-dark dark:bg-danger/15 dark:text-danger` and apply `animate-blink-red` to the icon only |
| When expired (server source of truth) | sheet shows `<EmptyState>` "Termin reklamacji upłynął" with disabled form |

Footer: standard `<SheetFooter>` — `<Button variant="ghost">Anuluj</Button>` + `<Button>Wyślij reklamację</Button>`. Submit is server-validated (server re-checks 48h window — never trust client clock).

### Notes for web-agent

- All carrier pages use the existing `<DataTable>` for fleet sub-pages (Auta/Kierowcy/Naczepy) — no new table primitive.
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
| `<FleetSubTabs>` | `apps/web/components/carrier/FleetSubTabs.tsx` |
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

The number itself stays the same physical size in both states; **only the label and color change** to communicate "this is provisional". This avoids layout shift when the verifier flips the claim to `ZAAKCEPTOWANO` — the value just snaps from muted to emphasised.

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
| Reklamacja CTA | unchanged (`mt-6 flex items-center justify-end`) | Behavior locked — only visual position adjusts if the divider already sits above it; keep button intact. |

> **Locked behavior.** `<StatusBadge>`, the back-link (`← Wróć do listy`), and the reklamacja CTA keep their existing handlers, props, and visibility rules. Only their **layout placement** changes per the diagram above.

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
| **`wide`** (table / dashboard, fluid up to ~1600px) | `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8` | **NEW DEFAULT for all admin list pages and dashboards.** Replaces `max-w-7xl` on: `(employee)/employee/(admin)/carriers`, `…/vehicles`, `…/drivers`, `…/trailers`, `…/trailer-types`, `(employee)/employee/claims`, `(employee)/employee` (dashboard root), and the `(carrier)/carrier/fleet/*` list pages. |

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
| [thumb] umowa-2024.pdf            1.4 MB           [X]     |
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
| **Przypisanie** (`sections.people`) | `<UserCog>` | Przewoźnik → `carrier.name ?? carrier.login` · Planista → `planner.name ?? planner.login` · Dyspozytor → `dispatcher.name ?? dispatcher.login` |
| **Wyposażenie** (`sections.equipment`) | `<Package>` | GPS → `gps` (bool) · Numer GPS → `gpsMobilePhone` · Karta paliwowa → `fuelCard` (bool) · Porozumienie → `agreement` (bool) |
| **Stawki** (`sections.rates`) | `<Banknote>` | Stawka DE → `rateDe` (EUR fmt) · Stawka UE → `rateUe` (EUR fmt) · Stawka eksport → `rateExport` (EUR fmt) · Stawka import → `rateImport` (EUR fmt) |
| **Pozwolenia** (`sections.permissions`) | `<ShieldCheck>` | Klasy ADR → `adrClasses` (list) · Odpady → `wasteAllowed` (bool) · Kraje odpadowe → `wasteCountries` (list) · Kabotaż DE → `cabotageDe` (bool) · Kabotaż FR → `cabotageFr` (bool) · GB → `gb` (bool) · IT → `it` (bool) · FR → `fr` (bool) |
| **Kraje** (`sections.countries`) | `<Globe2>` | Kraje docelowe → `destinationCountries` (list) · Ostatni przejazd → `lastDroveAt` (date) · Notatki → `notes` |
| **Załączniki** (`sections.attachments`) — *only if `attachments.length > 0`* | `<FileText>` | one row per attachment: `category` → `fileName` (plain text, no download in v1) |

- New i18n field keys (`vehicles.fields.*`): `adrClasses`, `wasteCountries`, `gb`, `it`, `fr`, `lastDroveAt`. New section key: `vehicles.sections.attachments`.
- `type` / `euro` render as raw enum codes — matches the `VehicleSheet` `<Select>` options and the list-table cell (no human-label keys exist).
- **Section `span` (lg+ grid, §6.4):** `'full'` for **Pozwolenia** (9 rows — too tall to pair) and **Załączniki** (attachment rows need horizontal room for the file-name button). All others (`identification`, `people`, `equipment`, `rates`, `other`) are `'half'`.

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
- **Strictly read-only.** No action buttons, no kebab column, no inline edit, no status-change controls, no row-click-to-edit. Rows are inert (whole-row hover for affordance only, no `onClick` mutation). Delegation status changes are weryfikator territory (Phase 7) and must **not** appear here. A read-only info banner (below) states this explicitly to the user.

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

**Body — three blocks, top to bottom:**

```
┌─ body (single full-width column — see "span" note) ────────────────────────┐
│                                                                            │
│  ╭─ RouteCard (section A, span:'full', fullWidth row) ──────────────────╮  │
│  │                                                                      │  │
│  │   ( DE )  ───────  🚚  [ 4 dni · plan. ]  ───────►  ( PL )           │  │
│  │   wyjazd                                              powrót          │  │
│  │   12.03.2025, 08:00          (duration pill on        plan: 16.03.2025│  │
│  │   kod: 40-001                 the connector)          kod: 00-950     │  │
│  │                                              faktyczny: —             │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ Driver + vehicle strip (section B, span:'full', fullWidth row) ─────╮  │
│  │   (avatar) Jan Kowalski            │  NR REJ.  WGM 1234              │  │
│  │           +48 600 000 000          │  Naczepa  WGM 5678N            │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
│                                                                            │
│  ╭─ STATUS I AUDYT (section C, normal label/value rows) ────────────────╮  │
│  │   Zgłoszone przez   …        Zgłoszono   …                            │  │
│  │   Zweryfikowane     …        Zweryfikowano …                          │  │
│  │   Notatki           …  (fullWidth row, §6.20 long-text)               │  │
│  ╰──────────────────────────────────────────────────────────────────────╯  │
└────────────────────────────────────────────────────────────────────────────┘
   Footer:  Utworzono {createdAt}            [ Zamknij ]
```

**Section span decision.** All three sections are `span: 'full'` so the modal body is a single column (the route card and the driver/vehicle strip are inherently wide; pairing them into the lg 2-column grid would crush the route connector). This means the modal does **not** need the wide `max-w-5xl` of the dense vehicle modal — pass `className="max-w-2xl"` on `<EntityDetailModal>` to override back to ~672px, because a single-column route view reads better narrower (the wide variant exists for the 2-column field grids; this modal has no grid). This is a per-consumer className override of the geometry (§6.2 already establishes width is set via the `className` prop), **not** a token change.

**Block A — `<RouteCard>` (new component, §6.4.4).** A three-zone horizontal composition inside one `rounded-xl border border-border/60 bg-card p-5` card (matches the §6.4 section-card recipe — no tint, no extra shadow):

| Zone | Content | Spec |
|---|---|---|
| **Departure (left)** | Country "circle" + label «Wyjazd» + date-time + postal | Circle: `inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-input text-sm font-bold text-text` showing the **ISO country code** (`departureCountry`, e.g. `DE`). Under it: `text-[11px] font-semibold uppercase tracking-[0.08em] text-text-sub` = «Wyjazd»; then `text-sm text-text tabular-nums` = `formatDateTime(departureAt)` (date + time, since `departureAt` is a datetime); then `text-xs text-text-sub` = «kod: {departurePostalCode}» mono. |
| **Connector (center)** | Arrow line + truck icon + duration pill | A horizontal connector: `flex-1` with a hairline rule (`h-px bg-border` or `border-t border-border`) running behind a centered cluster. Cluster = Lucide `<Truck size={18} className="text-text-sub" />` + the **duration pill**. End the line with a Lucide `<ChevronRight>` / arrowhead pointing at the return circle. On narrow widths the connector rotates to vertical (see responsive). |
| **Return (right)** | Country circle + label «Powrót» + planned date + postal + actual | Circle same recipe, code = `returnCountry`. Label «Powrót». Planned: `text-sm text-text tabular-nums` = «plan: {formatDateFull(plannedReturnAt)}» (date-only — `plannedReturnAt` is `@db.Date`). Postal: `text-xs text-text-sub` = «kod: {returnPostalCode}» mono. **Actual** return line (always shown, even when null): `text-xs text-text-sub` = «faktyczny: {actualReturnAt ? formatDateTime(actualReturnAt) : '—'}». The em-dash uses the standard empty treatment (§6.5). |

**Duration pill** — `inline-flex items-center gap-1 rounded-full border border-border bg-input px-2.5 py-0.5 text-xs font-medium text-text-sub` with the text «{n} dni · plan.». `n` = **whole-day count between `departureAt` and `plannedReturnAt`**, computed date-only: `differenceInCalendarDays(plannedReturnAt, departureAt.slice(0,10))` (drop the time portion of `departureAt`, exactly mirroring the zod cross-field validation at `delegations.ts:113`). Pluralize via the existing PL plural i18n (`1 dzień` / `2–4 dni` / `5+ dni`) — add `delegations.routeCard.durationDays` ICU plural; the `· plan.` suffix marks it as the *planned* span (so it never reads as actual elapsed time). Guard `n >= 0` (the zod schema already forbids `plannedReturnAt < departureAt`); if for any reason the pill would be negative, render «— · plan.».

**Block B — Driver + vehicle strip.** A single `rounded-xl border border-border/60 bg-card p-5` card split into two halves on `sm+` (`grid grid-cols-1 sm:grid-cols-2 gap-4`), stacked on phones:

- **Driver half:** a small avatar circle (`inline-flex h-9 w-9 items-center justify-center rounded-full bg-input text-text-sub` with a Lucide `<User size={18} />` — **no** photo, no initials needed) + a two-line stack: name `text-sm font-semibold text-text` (`driver.firstName + lastName` ?? `driverNameSnapshot`, em-dash if both null) and phone `text-xs text-text-sub font-mono` (`driverPhoneSnapshot`, em-dash if null). This is where the driver name + phone live now (moved out of the header).
- **Vehicle half:** a compact label/value pair set — «NR REJ.» → `vehicle.plateNumber` (`font-mono font-semibold`); «Naczepa» → `trailer.plateNumber` rendered as the connected string «Naczepa {plate}» (`font-mono`, em-dash → «Naczepa —» if no trailer). Use the same `text-[11px] uppercase tracking-[0.08em] text-text-sub` mini-label treatment as the route-card sub-labels for visual consistency.

**Block C — «STATUS I AUDYT» section.** A normal `<EntityDetailSection>` (NOT custom) — reuses the standard label/value `<dl>` rows (§6.5), so all the system/audit fields keep their proven rendering:

| Row | Field | Formatter |
|---|---|---|
| Zgłoszone przez | `reportedBy?.name ?? reportedBy?.login` | `textValue` |
| Zgłoszono | `reportedAt` | `dateTimeValue` |
| Zweryfikowane przez | `verifiedBy?.name ?? verifiedBy?.login` | `textValue` |
| Zweryfikowano | `verifiedAt` | `dateTimeValue` |
| Notatki | `notes` | `textValue`, **`fullWidth: true`** (§6.20 — long free-text spans the section, no label gutter; the sr-only `<dt>` keeps the «Notatki» label for SR users, and a visible inline caption is acceptable) |

Section header: icon `<ClipboardCheck>` (or keep `<Info>`), label «STATUS I AUDYT». `span: 'full'`.

**All fields accounted for (no field dropped).** Mapping of the 19 `DelegationDto` fields to the new layout:
- Header: `vehicle.plateNumber` (title), `status` (badge).
- Route card: `departureAt`, `departureCountry`, `departurePostalCode`, `plannedReturnAt`, `returnCountry`, `returnPostalCode`, `actualReturnAt` (+ the derived duration pill).
- Driver/vehicle strip: `driver`/`driverNameSnapshot`, `driverPhoneSnapshot`, `vehicle.plateNumber` (echoed in body for the strip), `trailer.plateNumber`.
- Status & audit section: `reportedBy`, `reportedAt`, `verifiedBy`, `verifiedAt`, `notes`.
- Footer meta line: `createdAt`, `updatedAt` (unchanged, §6.6).

**Read-only.** No `onEdit` is passed ⇒ footer is meta line + «Zamknij» only (the existing behaviour — keep it). No edit/cancel control inside the modal.

**Responsive (RouteCard).**
- `≥ sm`: horizontal — `flex items-center gap-3`, departure / connector(`flex-1`) / return. Connector line + truck + pill centered.
- `< sm` (≤640px): the route card switches to a **vertical timeline** — departure block on top, a vertical connector (`<ArrowDown>` icon + the duration pill, with a `w-px bg-border` vertical rule), return block below. Use `flex flex-col items-start gap-3`. The circles stay `h-12 w-12`; the connector swaps `ChevronRight`→`ArrowDown`. Never horizontally scroll the card.

**a11y.** The route card is decorative-structural: wrap it in a `<div role="group" aria-label={t('routeCard.aria')}>` («Trasa wyjazdu z {DE} do {PL}»). The truck/arrow icons are `aria-hidden`. The duration pill text is real text (not icon-only) so SR users hear «4 dni, planowane». Country codes in the circles are real text. Contrast: `text-text-sub` on `bg-input` and on `bg-card` both clear AA at the 12px/13px sizes used; the duration pill border (`border-border`) carries a non-colour boundary so the pill is legible without relying on the faint `bg-input` fill.

### 6.4.2 Read-only detail modals — vehicle / driver / trailer (planista + dyspozytor)

These three modals open when a row in the planista/dyspozytor fleet tabs (§6.4.3) is clicked. They reuse the **same `<EntityDetailModal>` shell and the same wrappers already specified for the admin context in §6.15 / §6.16 / §6.17** — but in the **read-only context** (no `onEdit` ⇒ footer is «Zamknij» only, §6.6).

**The data-availability gap and the API contract.** The admin vehicle/driver/trailer modals (§6.15–§6.17) read **full** `VehicleDto`/`DriverDto`/`TrailerDto`. The planista/dyspozytor panels are served by `/fleet/planista` and `/fleet/dyspozytor`, which currently return the **slim** `VehicleListItem` / `DriverListItem` / `TrailerListItem` (see `packages/shared/src/schemas/fleet.ts`). A detail modal needs more than the slim list carries. Two options were considered:

- (a) lazily fetch the full `*Dto` on row click — rejected: planista/dyspozytor have no JWT scope on the admin `/vehicles/:id` etc. endpoints, and adding role grants there widens the attack surface for fields they must not see (rates).
- (b) **enrich the slim list-items** with a curated, non-sensitive field set so the panel renders the modal from data it already holds — **chosen.** api-agent widens the three `*ListItemSchema` with the additive fields below. Because these are **additive/optional**, they also flow into the carrier `/fleet/my` payload — which is fine: a carrier owns its own fleet and the added fields are all non-sensitive (no rates). **The field lists below ARE the api contract** — api-agent adds exactly these and nothing more.

**HARD EXCLUSION (all three entities):** never include `rateDe` / `rateUe` / `rateExport` / `rateImport`. Planista/dyspozytor must not see pricing. The vehicle "Stawki" section from §6.15 is **dropped entirely** in this read-only fleet context.

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
| **Eksploatacja** (`sections.usage`) | full | `<Globe2>` | Ostatni przejazd → `lastDroveAt` `dateValue` *(Quirk #11 — display-only, never editable; fine to show here)* · Notatki → `notes` `textValue` `fullWidth: true` |

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
| Delegation modal width override `className="max-w-2xl"`; sections become `span:'full'`; route card + driver strip as `fullWidth` rows; «Notatki» `fullWidth`; «STATUS I AUDYT» standard `<dl>` section | `components/delegations/DelegationDetailModal.tsx` | web-agent |
| `differenceInCalendarDays(plannedReturnAt, departureAt.slice(0,10))` duration calc (date-only, ≥0 guard) | `components/delegations/RouteCard.tsx` | web-agent |
| New `<FleetVehicleDetailModal>` / `<FleetDriverDetailModal>` / `<FleetTrailerDetailModal>` thin wrappers over `<EntityDetailModal>` (read-only, no `onEdit`, no rate fields) | `components/fleet/Fleet{Vehicle,Driver,Trailer}DetailModal.tsx` | web-agent |
| Fleet sub-tables get `onRowClick` + open the matching detail modal; Delegacje table gets `onRowClick` → `<DelegationDetailModal>` | `components/fleet/FleetTables.tsx` + the dyspozytor panel page | web-agent |
| `DataTable`: additive `rowAriaLabel?: (row) => string` prop + keyboard (Enter/Space) + `role="button"` + `tabIndex={0}` + `focus-visible:ring-2 ring-brand ring-inset` on the `<tr>` **when `onRowClick` is set** | `components/ui/DataTable.tsx` | web-agent |
| **API enrich** `VehicleListItemSchema` += `year, euro, certificateL, gps, gpsMobilePhone, fuelCard, agreement, adr, wasteAllowed, wasteCountries, cabotageDe, cabotageFr, gb, it, fr, lastDroveAt, notes` (all additive/optional; **NO rate fields**) | `packages/shared/src/schemas/fleet.ts` + `fleet.service.ts` select | api-agent |
| **API enrich** `DriverListItemSchema` += `phone2, email, idDocumentNumber, adr, notes` (additive; **NO `bankAccount`**) | same | api-agent |
| **API enrich** `TrailerListItemSchema` += `year, belts, beltsCount, mats, matsCount, innerLength, innerWidth, innerHeight, capacity, airSuspension, certXl, multilock, notes` (additive) | same | api-agent |
| i18n: `carrier.delegations.routeCard.{aria,durationDays(ICU plural),departure,return,plannedPrefix,actualPrefix,postalPrefix}`; `fleet.{vehicle,driver,trailer}.sections.*` + reused `fields.*`; `entityDetail.gpsDeviceId` («ID urządzenia GPS») | `messages/pl.json`, `en.json` | web-agent |
| **0** changes to `EntityDetailModal.tsx` shell, `tailwind.config.ts`, `globals.css` | — | — |

> The enriched list-items also widen the carrier `/fleet/my` payload (drivers/vehicles/trailers) — acceptable per §6.4.2: all added fields are non-sensitive and the carrier owns its own fleet. No new endpoint, no new role scope, no token change anywhere in Phase 6.4.

### 6.4.5 Catalogue additions (Phase 6.4)

| Component | Type | Notes |
|---|---|---|
| `<RouteCard>` | New custom presentational | Departure/return country circles + truck connector + planned-duration pill; horizontal on `sm+`, vertical timeline on phones. Composes existing tokens only. |
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
│  ③ DECYZJA  (targetStatus select + conditional fields)           │  ← §6.5.5  — at the very bottom
│        ZAAKCEPTOWANO → orderNumber / orderDate / amountApproved   │
│        ODRZUCONO      → komentarz                                 │
│        OCZEKUJE_NA_AUTORYZACJE → margin / authDesc                │
│        reklamacja-variants                                        │
│  ─────────────────────────────────────────────────────────────  │
│  ④ Secondary sections: HISTORIA (diff) · AUTORYZACJA  (§6.5.7)   │
├─ <DialogFooter> (non-scrolling) ─────────────────────────────────┤
│  [Odrzuć (ghost danger)]        [Anuluj]  [Edycja → / Zapisz]    │  ← §6.5.6
└──────────────────────────────────────────────────────────────────┘
```

**Narrative (locked):** *I read what the carrier declared → I type what I verified → I see the recomputed dopłata → I make the decision.* dopłata sits between facts and decyzja deliberately: it is the *consequence* of the facts and the *input* to the decision, so it must read after the facts and before the verdict. **Never** move decyzja above dopłata or above the facts (the legacy Sheet had decyzja near the top — that ordering is abandoned).

### 6.5.3 The 6 fact pairs (the heart of edit mode)

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

A single full-width block between the fact pairs and the decyzja block. This is the **`amountApproved` locked/computed-field pattern** already specified in §"Read-only / computed field pattern" (b) — render it verbatim (the canonical class string with `<Lock>` icon, `readOnly tabIndex={-1}`, `bg-input/40`, `<FormDescription>` "wyliczana automatycznie"):

- **Live recalculation, decision-independent.** It recomputes via the live `/claims/preview` dopłata whenever any of the 6 facts changes (debounced 300ms — keep the Phase 4 debounce), **regardless of which `targetStatus` is selected**. The verifier sees the financial consequence of their corrections *before* committing to a decision. This is the reason it sits above decyzja, not inside the ZAAKCEPTOWANO branch.
- **`<RecalcBadge>`** to the right of the dopłata value: `<Badge variant="outline" className="animate-pulse">Przeliczam…</Badge>` during debounce → `<Badge variant="outline" className="text-success">Aktualne</Badge>` when settled (the legacy «Przelicz» button + «Wynik przeliczenia» panel from `modal-status-p2.png` collapse into this live badge + value — no manual "Przelicz" click in the new design).
- The breakdown detail (period split, weekend-skip count, korekta serwisowa line) from `modal-status-p2.png` renders as a **collapsible `<BreakdownTable>`** (§"BreakdownTable") under the dopłata number — `view` shows it expanded read-only; `edit` keeps it but live-updates. Use the container-query layout already specified (`< 34rem` → stacked cards, `≥ 34rem` → 5-col table); inside a `max-w-4xl` Dialog body it lands in the table layout on `lg+`.
- **`HoursReadout`** (§A) renders `live` under the `hoursAdjusted` input (fact #6) AND once more in this dopłata block's breakdown — same component, same copy, do not fork.

### 6.5.5 Decyzja — at the very bottom

`targetStatus` `<Select>` first, then the fields conditional on the chosen status, then the footer. This block is the legacy «Decyzja» section from `modal-status-p2.png`, moved to the bottom of the unified surface.

| `targetStatus` | Conditional fields (shown only when selected) |
|---|---|
| `ZAAKCEPTOWANO` | `orderNumber` (Nr zlecenia, text) · `orderDate` (Data zlecenia, date) · `amountApproved` (Kwota zatwierdzona — **the same locked/computed field as §6.5.4**; do not render a second editable copy — bind the decision's amount to the live-computed value). |
| `ODRZUCONO` | `komentarz` (Powód odrzucenia, textarea, required). |
| `OCZEKUJE_NA_AUTORYZACJE` | `margin` (Marża, number) · `authDesc` (Opis dla autoryzacji, textarea). Hands off to the Autoryzacja section (§6.5.7). |
| reklamacja-variants | per existing claim-status rules (`<ReklamacjaSheet>` copy not re-spec'd here — the verification surface only *triggers* the variant; the conditional fields follow the same RHF pattern). |

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
| `edit` | `<Button variant="ghost" className="text-danger">Odrzuć</Button>` (only if status ≠ ODRZUCONO/ZAAKCEPTOWANO) | `<Button variant="ghost">Anuluj</Button>` (back to `view`, discard unsaved edits) · `<Button>Zapisz</Button>` (label = «Zaakceptuj»/«Zapisz»/«Wyślij do autoryzacji» depending on `targetStatus`, mirroring Phase 4 footer logic) |

- `Anuluj` in `edit` returns to `view` and resets the RHF form to the last-saved values (`form.reset(serverValues)`) — it does NOT close the Dialog. Closing the Dialog (✕ / Escape / Zamknij) is a separate action available in both modes.
- `Zapisz` states: `saving` → primary-button spinner, all inputs disabled; `error` → `<Alert variant="destructive">` at the top of the body, form stays editable (mirrors Phase 4 `<ClaimVerificationModal>` states).

### 6.5.7 Historia & Autoryzacja inside the single Dialog

The Phase 4 design used three tabs (Edit / Historia / Autoryzacja). In the unified centered surface the primary flow (facts → dopłata → decyzja) is **not** a tab — it is always the main scroll body. Historia and Autoryzacja are **secondary** and must not compete with the main narrative.

**Decision: secondary tabs scoped to a sub-region, NOT top-level tabs over the whole modal.** Rationale: top-level tabs would hide the facts/dopłata/decyzja flow behind a tab and re-introduce a "where did my form go" mode-switch — the opposite of the unification goal. Instead:

- The **main flow (facts → dopłata → decyzja) is always visible** as the modal body. It is never behind a tab.
- **Historia** and **Autoryzacja** live in a **secondary tabbed sub-panel below the decyzja block** (still inside the same scrolling `<DialogBody>`), using shadcn `<Tabs>` with exactly the tabs that apply:
  - `Historia` tab — rendered only when `claim.origData != null`. Side-by-side diff «Pierwotnie» / «Aktualnie», changed fields tinted `bg-warning/10` (same token as §6.5.3 changed-emphasis). Read-only. (This is the legacy diff content from the Phase 4 Historia tab, unchanged — only its *placement* moves from a top-level tab to this secondary sub-panel.)
  - `Autoryzacja` tab — rendered only when the business threshold applies (`claim.doplata > LIMIT_OR_THRESHOLD`). Two sub-sections: (1) «Wymaga autoryzacji» button (`<Mail>` icon → emails Maksim, sets `OCZEKUJE_NA_AUTORYZACJE`, then disabled + «Wysłano (yyyy-mm-dd hh:mm)»); (2) `kwotaMaksima` `<Input type="number">` «Kwota zatwierdzona przez Maksima (EUR)», manual entry, save-on-blur. **Still NO FileUpload, NO screenshots** (carried over from the Phase 4 locked rule — see acceptance checklist).
- If **neither** secondary tab applies (no origData, below threshold — the common case for a clean first-time verification) the entire secondary sub-panel is **omitted** — the modal ends at the decyzja block + footer. No empty tab bar.
- If **only one** applies, render it as a single labelled section (no `<Tabs>` chrome for one item — a `<Tabs>` with one tab is visual noise; just a `<Separator>` + section title).

> This keeps Historia/Autoryzacja discoverable and in-context (same surface, no new modal/Sheet) while guaranteeing the verifier's primary task — reconcile facts, read dopłata, decide — is never hidden behind a tab. Diff and authorization are *supporting evidence*, placed after the decision inputs, exactly where a verifier reaches for them ("let me double-check the history / kick off authorization") rather than before.

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
| Reorder body: fact pairs → **dopłata (above)** → decyzja (bottom) → secondary Historia/Autoryzacja sub-panel | same |
| 6 fact pairs with muted-declared (`bg-input/40` + `text-text-sub`, **no lock icon**) + verifier input; `<FormGrid cols={2}>` alignment | same |
| `timeFrom`/`timeTo` declared cells bind to **`origTimeFrom`/`origTimeTo`**, not live values | same |
| `hoursAdjusted` renders **input only** (no declared cell; never render `0` as declared) | same |
| dopłata = locked/computed field, live recalc (debounce 300ms) **independent of `targetStatus`**, `<RecalcBadge>` | same |
| Historia/Autoryzacja → secondary `<Tabs>` sub-panel below decyzja; omitted entirely if neither applies; single section (no tabs) if only one applies; **still no FileUpload in Autoryzacja** | same |
| Footer per mode: `view` → [Zamknij][Edycja]; `edit` → [Odrzuć][Anuluj][Zapisz] | same |
| In-place morph: no re-mount, RHF stays mounted, `form.reset` on Anuluj-from-edit, focus to first input on enter-edit | same |
| **API:** surface `origTimeFrom` / `origTimeTo` on the claim DTO (additive, optional, mirrors `origDateStart`/`origMileage`) | `packages/shared` claim schema + `claims.service` serializer (api-agent) |
| **0** new color/radius/shadow/font tokens; **0** changes to `Dialog.tsx` shell, `tailwind.config.ts`, `globals.css` | — |

### 6.5.10 Acceptance checklist (Phase 7.1)

- [ ] Verification surface is **one centered `<Dialog max-w-4xl>`**, not a Sheet, not two modals.
- [ ] Row-click opens `view` (read-only); «Edycja» enters `edit` **in place** — no re-mount, no container swap, no slide animation, RHF values preserved.
- [ ] Body order top→bottom: fact pairs → dopłata (locked/computed, live) → decyzja (select + conditional fields) → optional Historia/Autoryzacja sub-panel.
- [ ] 6 fact pairs; declared cells muted `bg-input/40` + `text-text-sub` **without** lock icon; `timeFrom`/`timeTo` declared from `origTimeFrom`/`origTimeTo`; `hoursAdjusted` has input only (no declared cell, never `0`).
- [ ] `hoursAdjusted` row in **`view`** is rendered **only when `hoursAdjustedValue > 0`**; omitted entirely (no empty/`—`/`0` row) when there is no stoppage / claim not verified. In `edit` the input is always present.
- [ ] On entering `edit`, `targetStatus` is **not pre-selected** (placeholder «wybierz decyzję»); decision conditional fields do **not** render until a decision is chosen; decision required-field validation fires **only on «Zapisz»**; focus lands on `dateStart`, not the decyzja block.
- [ ] Acceptance gate: when live recalc shows `kmDifference <= 0` (guarantee met), `ZAAKCEPTOWANO` / `REKLAMACJA_ZAAKCEPTOWANO` are disabled; a prior acceptance selection is cleared if an edit pushes recalc into "guarantee met"; hint «Gwarancja wyjeżdżona — wniosek można tylko odrzucić» shown; backend still hard-rejects acceptance (`422`).
- [ ] dopłata recomputes live (300ms debounce) on any fact change, **independent of selected `targetStatus`**; `<RecalcBadge>` Przeliczam…→Aktualne.
- [ ] Historia tab only when `origData != null`; Autoryzacja only above threshold; **no FileUpload in Autoryzacja**; both omitted when neither applies; single labelled section (no `<Tabs>`) when only one applies.
- [ ] Footer differs by mode; Anuluj-from-edit returns to `view` + `form.reset`, does not close; ✕/Escape/Zamknij closes.
- [ ] Focus moves to first verifier input on enter-edit, back to «Edycja» trigger on leave-edit; focus-trap covers both modes.
- [ ] Works in dark mode via tokens only — no `[style*=]` hacks. `bg-input/40` legible on `#1f1f1f`; `text-brand` (`#ef4444` dark) dopłata number passes AA.
- [ ] **0** new color/radius/shadow/font tokens; `Dialog.tsx`, `tailwind.config.ts`, `globals.css` unchanged.

### 6.5.11 Deviations (web-agent implementation, Phase 7.1)

Implementation lands as **one new component `apps/web/components/claims/ClaimModal.tsx`**, replacing both `ClaimVerificationModal.tsx` and `ClaimDetailModal.tsx` (both deleted). The catalogue (§6.5.9) said "container `ClaimVerificationModal.tsx`"; the merged surface is renamed `ClaimModal.tsx` since it is no longer "verification-only" (it now covers the read-only `view` mode too). No behavioural deviation — same DTO contract, same `UpdateClaimSchema` discriminated-union submit, same `/preview` recalc.

Documented deviations from the literal §6.5 text, each within brand/token constraints:

1. **Autoryzacja applicability gate.** §6.5.7 keys the Autoryzacja secondary tab on a business threshold (`claim.doplata > LIMIT_OR_THRESHOLD`). That limit constant is **not exposed to the client** (no DTO field / config endpoint surfaces it). To preserve functional identity with the Phase 4 flow, the Autoryzacja section is gated on **claim status** instead: shown when `status ∈ { NA_WERYFIKACJI (request-authorization form), OCZEKUJE_NA_AUTORYZACJE (read-only pending summary) }`, omitted otherwise. If a numeric threshold is later surfaced on the DTO, swap this predicate. **No FileUpload / screenshots** (the locked rule is preserved).
2. **dopłata locked field is a static computed display, not an RHF-registered input.** §6.5.4 says "render verbatim the `amountApproved` recipe with `readOnly` RHF registration". The standalone dopłata block (above decyzja) is the *live preview consequence* and is never submitted on its own, so it renders as a static muted value (`bg-input/40` + `<Lock>` + `<FormDescription>` "wyliczana automatycznie") rather than a registered `<input readOnly>`. The **RHF-registered** locked `amountApproved` field still exists inside the ZAAKCEPTOWANO decision branch (§6.5.5), bound to the same live-computed value — so the submitted payload is unchanged.
3. **Decyzja inputs are gated behind `edit` mode.** In `view` the decyzja block renders a muted "pick edit to decide" hint instead of the live `<Select>` — a decision is an edit, so it belongs to `edit` mode. The select + conditional fields appear the instant «Edycja» is pressed (no re-mount). This is consistent with §6.5.6's "leaf controls flip static⇄input" rule applied to the decyzja sub-tree. **On enter-edit the select shows the placeholder «wybierz decyzję» (no pre-selected `targetStatus`)** and no conditional fields render until a decision is picked; decision required-field validation fires only on «Zapisz» (see §6.5.5 "No pre-selected decision").
4. **Acceptance gated by recalc result.** Acceptance options are disabled (and any prior acceptance selection cleared) whenever the live recalc yields `kmDifference <= 0` (guarantee met ⇒ no payout); only rejection options remain, with the hint «Gwarancja wyjeżdżona — wniosek można tylko odrzucić». UI guard only; backend independently hard-rejects acceptance with `422` (see §6.5.5 "Acceptance gate by recalc result").

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

The daily verification-digest email (`mail/templates/verification-digest.tsx`, §5 of the spec) **keeps the brand accent `#dc2626`** — same as `authorization-request.tsx`. Email clients have poor/no support for CSS custom properties and `dark:` variants, so the digest uses **inline brand-red `#dc2626`** for the header bar / heading accent and plain-text fallback, exactly per the existing mail-template convention. Inside the body, the two buckets may be visually separated (e.g. an «Po terminie» group heading in `#dc2626` and a «Zbliża się termin» group in an amber `#f97316` heading), but the **primary brand accent stays `#dc2626`** — no per-email theme tokens, no new colours. This is a hard-coded inline-style context (email), which is the one place inline styles are correct and expected.

#### 7.6.4 Components / tokens / acceptance (Phase 7.6)

| Change | Where | Notes |
|---|---|---|
| `<SlaAttentionSection>` (two instances: `overdue` red, `dueSoon` amber) | `apps/web/components/dashboard/` | Composes `<Card>` + §7.6.1 header + clickable rows. Severity passed as a prop (`'overdue' \| 'dueSoon'`) selecting `danger`/`warning` classes. |
| `<SlaCountdownBadge workingDaysLeft>` | same | Renders «po terminie» / «dziś ostatni dzień» / «{n} dni robocze» with the §7.6.1 badge classes; ICU plural via next-intl. |
| All-clear card (both buckets empty) | dashboard sidebar | Neutral `<Card>` + `text-success` check + muted text. |
| Replace old `urgent` sidebar section | `app/(employee)/employee/dashboard/` | Wire the two new sections from `DashboardDto.overdue[]` / `dueSoon[]`. |
| i18n `dashboard.sla.{overdueTitle,dueSoonTitle,allClear,countdown.*(ICU plural)}` | `messages/pl.json` / `en.json` | — |
| Digest email keeps inline `#dc2626` brand accent | `mail/templates/verification-digest.tsx` | api-agent; §7.6.3. No DS token (email is inline-style by design). |
| **0** changes to `tailwind.config.ts` / `globals.css`; **0** new colour/badge variants | — | `danger`/`warning` semantics + `-bg` surfaces already exist. |

Acceptance (Phase 7.6):
- [ ] **Two-level severity, existing tokens.** `overdue` → `danger` (red, brand-aligned), `dueSoon` → `warning` (amber); applied to group header, per-row left-border + tinted surface, and countdown badge; **no new tokens / badge variants**.
- [ ] **Order.** `overdue` section sits above `dueSoon` in `<DashboardSidebar>`; empty buckets are omitted; both-empty collapses to one calm `text-success` «all-clear» card (no red/amber empty shells).
- [ ] **A11y.** Urgency never colour-alone (worded countdown badge + header icon/title); rows keyboard-activatable (`role=button`, Enter/Space, `focus-visible:ring-{danger,warning}`); AA contrast on `/15` badges both themes.
- [ ] **Digest email.** Brand accent stays inline `#dc2626`; empty → no email (§5); no per-email theme tokens.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts`/`globals.css` changes; all surfaces legible in dark via `dark:bg-{danger,warning}/10..15` variants.

---

## 7.7 Weekly km-board + read-only km-report + delegation km-calendar (REWORK 2026-06-12 #3 — AUTHORITATIVE)

> **Scope.** Supersedes §7.5 (route-status board). Three deliverables, one shared visual primitive (the weekly km-grid):
> 1. **Weryfikator weekly km-board** — `/weryfikator/km`. Row = vehicle, 7 day-columns (PN..ND). The verifier records, per vehicle per day, **either** the km driven (`drove`) **or** "nie jeździ" (`idle`), **or** leaves it blank (not checked). The binary route-status of §7.5 is absorbed: vehicle status is now *derived from the cells* and only summarized in the header tiles.
> 2. **Read-only km-report** — same grid, view-only, scoped to *own* vehicles, for `planista` / `dyspozytor` / `eksport` / `admin`. This is the legacy «Raport km — moje pojazdy» screen. Has a "tylko jeżdżące" (in-motion only) filter.
> 3. **Delegation km-calendar** — inside the carrier delegation detail modal (the §6.4.1 route-card modal), a compact per-day km calendar for the period `[departureAt, plannedReturnAt]` of the assigned vehicle (join by `vehicleId`, **no FK**). The "visual link" delegation↔km.
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

**`<KmCellEditDialog>` — reuse the `<Dialog>` primitive** (the same centered `<Dialog>` grammar as the §7.7.6 history dialog: `bg-card`, `animate-modal-in`, `shadow-modal`, brand focus ring; **not** a bespoke surface). Contents top→bottom:

- **`DialogHeader` — vehicle identity + the specific day.**
  - Title: `plateNumber` (`font-mono font-semibold text-text`) + side number «bok {side}» (`text-text-sub`).
  - `DialogDescription` (`text-sm text-text-sub`): the carrier name + the day, e.g. «{carrier} · {weekday}, {DD.MM.YYYY}». The weekday + full date make it unmistakable *which* cell is being edited (no spreadsheet ambiguity).
- **Body — a real `<form>` (RHF + Zod, schema `SetVehicleDailyKmSchema`):**
  - **State choice — `drove` / `idle`.** A 2-option `<ToggleGroup type="single">` (Radix, shadcn family) — «Jechał» / «Nie jeździ», `aria`-labelled, one always selected. This is the primary decision of the dialog, so it sits first and full-width.
  - **Km numeric input — shown ONLY for `drove`.** `<Input inputMode="numeric" className="text-center font-mono tabular-nums">` with label «Przebieg (km)». Selecting `idle` **hides** the km field entirely and the payload carries `km:null` (idle has no km — never a disabled-but-present input, just absent). Empty + `drove` is invalid → standard inline field error «Podaj km» (`border-danger` + sr message), Save disabled until valid. `0` is allowed but shows the soft, non-blocking hint «0 km? oznacz „nie jeździ”».
  - **Notes — `<Textarea>`** labelled «Notatka», optional, placeholder «Notatka do dnia…». Applies to both states. Feeds the roll-up `NOTATKA` column (§7.7.3) and the history log (§7.7.6).
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

### 7.7.6 Per-vehicle history — `<VehicleKmHistoryDialog>` (`<Dialog>`)

Opened by the row «Historia» button (§7.7.3). A centered `<Dialog>` (`bg-card`, `animate-modal-in`, `shadow-modal`) showing the daily-km log for one vehicle across a range (`GET /vehicles/:id/daily-km?from&to`), newest-first.

- `DialogHeader`: title «Historia km — {plateNumber}» + `DialogDescription` = `bok {sideNumber} · {przewoźnik}` (`text-sm text-text-sub`).
- Body: a vertical `divide-y divide-border` list (not a nested grid — it's a per-vehicle log). Each entry:
  - left: the **date** `text-sm font-medium tabular-nums` + weekday abbrev under it `text-xs text-text-sub`.
  - middle: the **state** — for `drove`, the km in `font-mono font-semibold` + a `<Check className="text-success"/>`; for `idle`, the muted «nie jeździ» pill (§7.7.1). Below, optional `notes` `text-xs text-text-sub`.
  - right: actor + source — `notedBy` name or **«GPS»** (when `source='gps'`, `notedById` null) `text-xs text-text-sub`, with a small `<Badge variant="muted" className="text-[10px]">GPS</Badge>` / «ręcznie» pill so manual vs automatic is distinguishable (parity with §7.5.3).
- Range control: a small from/to or "ostatnie 30 dni / ten miesiąc" toggle at the top (optional); default = the visible week ± a sensible window.
- Empty: `<EmptyState>` inside the dialog — «Brak historii km dla tego pojazdu».
- `DialogFooter`: single ghost «Zamknij». History is **read-only** — editing stays in the grid (one mutation entry-point, same principle as §7.5.5).

### 7.7.7 Read-only km-report variant (planista / dyspozytor / eksport / admin)

The **same `<KmWeekGrid>`** primitive, in a **read-only context** — this is the legacy «Raport km — moje pojazdy». Differences from the weryfikator board:

- **No cell editing.** Cells render the three states (§7.7.1) but are **inert** — no toggle, no km `<Input>`, no per-cell notes editor. Cells are not focus targets for editing (they may still be focusable to read notes via the roll-up popover). The whole surface is read-only — same posture as the §6.3 read-only role panels, with the **non-dismissible read-only info banner** above the grid («Dane są tylko do podglądu — edytuje weryfikator.» / "Data is read-only — managed by the verifier.").
- **Scope = own vehicles.** Served by `GET /vehicles/km-report?week=…`, already role-scoped server-side (`planista`→own `plannerId`, `dyspozytor`→own team, `eksport`/`admin`→all). The UI does not re-filter by owner; it trusts the scoped payload.
- **"Tylko jeżdżące" filter (in-motion only).** A single `<Switch>` / `<Checkbox>` above the grid — «Tylko jeżdżące» / "In-motion only" — that hides rows whose week has **zero** `drove` cells (derived status ≠ `nieznany`/`idle`-only). Default **on** for the report (the report's purpose is the vehicles that actually moved; the contract scopes the report endpoint to "only vehicles with `drove` days", so this filter is mostly a within-week refinement). Compose from the existing `bg-input` filter-row pattern; it's a read filter, not a mutation.
- **Keeps** the header counter strip (§7.7.2), the `Σ KM` / `NOTATKA` columns, week navigation (§7.7.5), and the «Historia» modal (§7.7.6 — read-only already). Drops only the editing affordances.
- **Container + chrome.** Lives inside `RoleShell` (sidebar-less) for planista/dyspozytor/eksport, using the 4.4 container strip `mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8`, page heading «Raport km — moje pojazdy» + a one-line scope subtitle. For `admin` it lives in the employee shell.

> One component, two modes. `<KmWeekGrid mode="edit" | "view">` — the same component the weryfikator and the read-report render, gated by `mode` (exactly the §6.5 `mode: 'view' | 'edit'` precedent for the verification dialog). Do not fork two grids.

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

**What it shows.** A compact **per-day calendar** spanning the delegation period `[departureAt, plannedReturnAt]` (date-only span, same `differenceInCalendarDays` math as the §6.4.1 duration pill). For each day in the period it shows the assigned vehicle's `VehicleDailyKm` (joined by `vehicleId` + date intersection — **no FK**, the join is purely visual/data-side). This makes a carrier *see* how the truck performed during the trip without any modelled relationship.

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
| `weryfikator.km.history.title` | «Historia km — {plate}» | "Km history — {plate}" |
| `weryfikator.km.history.desc` | «bok {side} · {carrier}» | "side {side} · {carrier}" |
| `weryfikator.km.history.sourceManual` | «ręcznie» | "manual" |
| `weryfikator.km.history.sourceGps` | «GPS» | "GPS" |
| `weryfikator.km.history.empty` | «Brak historii km dla tego pojazdu» | "No km history for this vehicle yet" |
| `weryfikator.km.history.close` | «Zamknij» | "Close" |
| `weryfikator.km.notesPopover.title` | «Notatki w tym tygodniu» | "Notes this week" |
| `weryfikator.km.notesPopover.empty` | «Brak notatek» | "No notes" |
| `weryfikator.km.aria.cell` | «{plate}, {weekday} {date}: {state}» | "{plate}, {weekday} {date}: {state}" |
| `weryfikator.km.aria.grid` | «Tygodniowa tablica km» | "Weekly km board" |

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
| New `<KmCell>` — three-state **display** cell (drove/idle/empty); in `mode="edit"` it is a focusable button that opens `<KmCellEditDialog>` (no inline editor) | `apps/web/components/km/KmCell.tsx` | web-agent |
| New `<KmCellEditDialog>` — per-day edit modal (state toggle + km input for `drove` + notes + Save/Cancel) reusing the `<Dialog>` primitive; cancel = zero changes/zero network; «Wyczyść ten dzień» destructive action (only when `cell.state != null`) routed through the existing destructive-confirm `<Dialog>` → `DELETE` day → returns cell to `empty` | `apps/web/components/km/KmCellEditDialog.tsx` | web-agent |
| New `<KmHeaderTiles>` (composes existing `<KpiCard>` ×6; **never** `tone="purple"`) | colocated with the km pages | web-agent |
| New `<WeekNavigator>` (prev/next/current + week-picker `<Popover>` reusing the existing date-picker) | `apps/web/components/km/` | web-agent |
| New `<VehicleKmHistoryDialog>` (read-only `<Dialog>` log) | `apps/web/components/km/` | web-agent |
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
- [ ] **Editing (board only) — modal flow.** Clicking any cell (incl. `empty`, to create) opens `<KmCellEditDialog>` (reuses `<Dialog>`); header shows plate/side + carrier + weekday/date; `drove`/`nie jeździ` `<ToggleGroup>`; km `<Input>` shown **only** for `drove` (idle = no km field, payload `km:null`); empty+drove invalid with inline «Podaj km»; notes `<Textarea>`; «Zapisz» → upsert `PUT /vehicles/:id/daily-km`, optimistic Σ/counter update + rollback; «Anuluj»/Esc/overlay = **zero changes, zero network calls**. **No** inline cell editor, **no** spreadsheet cell-to-cell keyboard chaining.
- [ ] **Clear-with-confirm (board only).** «Wyczyść ten dzień» destructive action appears **only** when `cell.state != null`; routes through the existing destructive-confirm `<Dialog>` (danger framing, `variant="destructive"` confirm); on confirm `DELETE`s the day's record and returns the cell to `empty` / «Nie sprawdzono»; cancel = no change.
- [ ] **Read-only report.** Same grid `mode="view"`, cells inert, non-dismissible read-only banner, «Tylko jeżdżące» filter (default on), scoped payload trusted; keeps tiles / Σ / Historia / week-nav.
- [ ] **Week navigation.** prev/next/current + week-picker; `?week=YYYY-Www` is URL source of truth; grid-body skeleton on refetch with tiles + day-headers retained.
- [ ] **History dialog.** Read-only `<Dialog>` log newest-first (date / state / km-or-idle / actor / source manual|GPS / optional notes); empty state; dismiss-only footer.
- [ ] **States.** Loading skeleton; true `<EmptyState>` only for zero vehicles / empty team; **fresh week ≠ empty** (full grid of `—`, calm, optional «{n}/{total} uzupełnionych» helper); filtered-empty report has its own «żaden pojazd nie jeździł» empty.
- [ ] **Delegation km-calendar.** A `span:'full'` `fullWidth` block in the §6.4.1 delegation detail modal, below «STATUS I AUDYT»; period-strip day-tiles `[departureAt, plannedReturnAt]` joined by `vehicleId` (no FK); same three-state vocabulary; `Σ km` summary; omitted when no vehicle; shown-with-«brak danych» when vehicle present but no km; read-only + `aria-label`ed; wraps, never horizontal-scrolls.
- [ ] **Nav.** Weryfikator landing `redirect()`s to `/weryfikator/km`; old `/weryfikator/vehicles` route-status page + `WelcomePanel` removed; header logo/home → `/weryfikator/km`.
- [ ] **i18n.** All `weryfikator.km.*` + `delegation.kmCalendar.*` keys present in PL + EN (§7.7.10); ICU plural for `kmCalendar.days`; old route-status `weryfikator.*` strings removed.
- [ ] **Token policy + dark-mode.** Zero `tailwind.config.ts` / `globals.css` changes; no new colour/radius/shadow/font token; soft surfaces are `bg-input` only; tints are `bg-{success}/10` opacity variants; the whole grid + tiles + cells + calendar + history dialog legible in dark via tokens / `dark:` variants only.

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

### 7.8.1 The carrier-distinction mechanism — grouped section-headers + a deterministic per-carrier accent

The treatment is a **combination**: **carrier group section-rows** (primary structure) **plus** a thin **deterministic carrier accent** (secondary reinforcement). Both are driven by the per-row `carrier { id, name }` already in `VehicleKmBoardItemDto` — **no new API field**.

**(a) Grouped carrier section-headers (primary).** Rows are sorted by `carrier.name` (locale `pl`, then by `plateNumber`) and rendered in contiguous carrier blocks. Each block opens with a **group header row** spanning the full table width (`<tr>` with a single `<td colSpan={allColumns}>`), styled as soft chrome — `bg-input` (the established "derived/grouping surface" tone), `h-9`, `px-3`, `sticky left-0` for the label so it stays anchored during horizontal scroll. Group header content, left→right:
- a **4px carrier-accent rail** (`w-1 self-stretch rounded-full` using the carrier's `accentBar` class, §7.8.2) — the colour key;
- the **carrier name** `text-sm font-semibold text-text` (`<Truck size={14} className="text-text-sub" />` leading icon);
- a right-aligned **per-carrier roll-up** `text-xs text-text-sub tabular-nums`: «{n} pojazdów · Σ {sum} km» (vehicle count in the block + sum of that block's `drove` km this week).

This makes the table scan as a sequence of small per-carrier mini-boards while keeping ONE set of frozen day-columns, ONE header, ONE week. Group headers are **not** collapsible in v1 (keep it simple; the accent + sort already do the work) — a future enhancement may add disclosure, but it is out of scope.

**(b) Per-row carrier accent (secondary).** Every vehicle row carries a **2px left accent border** in the carrier's colour (`border-l-2` + the carrier's `accentBorder` class, §7.8.2), applied to the **frozen identity cell only** (so it travels with the sticky-left block and never bleeds into the scrolling day tracks). This is a quiet reinforcement so that, even when a long carrier block scrolls past its group header, the row still reads as "belonging to carrier X". The accent is **border + the group rail only** — rows do **not** get a tinted background (a full-row tint would fight the §7.7.1 `bg-success/10` "drove" cell tint, which must stay the dominant in-cell signal). Colour is therefore never the *sole* carrier signal: the group header name is the accessible source of truth; the accent is decorative reinforcement (WCAG 1.4.1 — meaning not by colour alone).

**(c) Identity meta line — drop the redundant carrier name.** On this tab the §7.7.3 identity meta line (`przewoźnik · opiekun · dyspozytor`) **drops the `przewoźnik` segment inside grouped mode** (it is already the group header) and shows only the still-useful `opiekun · dyspozytor` context. (On the §7.7.7 weryfikator/admin board the full meta line is unchanged — this drop is scoped to this tab's grouped rendering.)

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
- **Grid.** `<KmWeekGrid mode="view">` exactly as §7.7.3/§7.7.7 — frozen identity, 7 PN..ND tracks (today-accent + weekend tint unchanged), Σ KM, NOTATKA roll-up, «Historia». In grouped mode the group-header rows are interleaved by `<KmWeekGrid>` (it already owns the `<tbody>` map; web-agent adds the group-break rows there, gated by a new `groupByCarrier?: boolean` prop — default `false` so §7.7 callers are untouched).

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

> Reuse from `weryfikator.km.*`: every `col.*`, `weekday.*`, `cell.*`, `nav.*`, `tiles.week|tractors|inMotion|idle|sumKm`, `history.*`, `notesPopover.*`, `aria.cell|grid`. The `myKm.*` namespace exists only for the heading/subtitle/banner/group/tab strings that differ.

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

- [ ] **Read-only.** No cell editing anywhere — `<KmBoardScreen mode="view">`; cells inert; non-dismissible read-only banner (`myKm.readOnlyBanner`); «Historia» modal read-only (§7.7.6).
- [ ] **Same cell language.** `<KmCell>` renders the identical §7.7.1 three states (drove `bg-success/10`+check / idle `bg-input` / empty faint `—`). No relearning.
- [ ] **Carrier grouping (≥2 carriers).** Rows grouped under `bg-input` carrier section-headers (sorted by `carrier.name`), each with a 4px carrier-accent rail + name + «{n} pojazdów · Σ {sum} km»; every row carries a 2px `accentBorder` on the frozen identity cell; `przewoźnik` segment dropped from the row meta line.
- [ ] **Deterministic accent.** `carrierAccentIndex(carrier.id)` (avatarBg-style hash) → stable accent across renders/sessions; palette is the 6 §7.8.2 category hues (4 existing + the proposed `cat-blue`/`cat-violet`, or the zero-token fallback if vetoed); brand-red (`bg-brand`) NOT used as a carrier accent (reserved for the "today" column); accents disjoint from in-cell state colours; meaning never by colour alone (group name is source of truth).
- [ ] **Single-carrier collapse.** `distinctCarriers <= 1` (always for `przewoznik`) → no group headers, no row accent border, plain §7.7.7-identical grid.
- [ ] **All vehicles by default.** Full fleet shown including non-driving / blank-week vehicles; «Tylko jeżdżące» is OFF by default and surfaced as an opt-in toggle only (`inMotionDefault={false}`); filtered-empty state applies only when the user turns it on.
- [ ] **Week nav + history.** §7.7.5 prev/next/current + week-picker, `?week=YYYY-Www` URL source of truth; §7.7.6 history modal reused.
- [ ] **Header tiles.** §7.7.2 tiles kept; optional «PRZEWOŹNICY» count tile (`tone="neutral"`) on multi-carrier roles; no orange/red aggregate; responsive family unchanged.
- [ ] **Scope.** Server-scoped payload trusted (carrier→own, opiekun→supervised, planista→plannerId, dyspozytor→team); UI does not re-filter by owner.
- [ ] **i18n.** `myKm.*` keys present PL + EN; grid/cell/nav/history reuse `weryfikator.km.*` (not duplicated); ICU plural on `myKm.group.summary`.
- [ ] **Token policy + dark-mode.** No new radius/shadow/font tokens; the only colour addition is the §7.8.2 `cat-blue`/`cat-violet` pair (pending sign-off — else fallback); carrier accents are opacity rails legible in dark via the listed `dark:` steps; **no API contract change** beyond role-scoping the existing read endpoint.

