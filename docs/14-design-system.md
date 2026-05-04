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
