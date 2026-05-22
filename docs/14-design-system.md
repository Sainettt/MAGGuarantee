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
| Read-only display | not as disabled input — render `<dl>` с label + value |
| Two-column rows | `grid grid-cols-1 md:grid-cols-2 gap-4` (для vehicle-form с 36 полями) |
| Section divider | `<Separator />` + section title `text-xs font-bold uppercase tracking-wider text-text-sub` |

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

Reference: `employee-dashboard-required-notes.png` (4 верхних tile-а).

**Anatomy:**
- Wrapper: `<Card className="p-4 flex flex-col gap-1">`.
- Label: `text-xs font-medium uppercase tracking-wider text-text-sub`.
- Value: `text-3xl font-bold text-text` (number или `1.2k €`).
- Delta-badge (опц.): inline `<Badge variant="outline">` с `<ArrowUp/Down />` icon, `text-success` / `text-danger` в зависимости от знака.
- Icon-slot (опц.): `<Icon className="h-5 w-5 text-text-sub" />` в правом-верхнем углу, абсолютно.

**Tokens:** `bg-card`, `border-border`, `rounded-lg`, `shadow-sm` (унаследовано от `<Card>`).

**Состояния:** `loading` → `<Skeleton className="h-8 w-24" />` на месте value, label остаётся; `empty` → value = `—` (em-dash) серым.

**Layout:** строка `grid grid-cols-2 md:grid-cols-4 gap-4` сверху dashboard.

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

**Filter bar (sticky над таблицей):** search input (по nrZgl, NIP, plate) + status multiselect + period range + carrier select. Layout — `flex flex-wrap gap-2 p-3 border-b border-border bg-bg-soft`.

### `<ClaimVerificationModal>` (Sheet, не Dialog)

Reference: `modal-status-p1.png` + `modal-status-p2.png`. **Locked decision:** `<Sheet side="right" className="w-full sm:w-[720px]">`. Не Dialog, не Drawer.

> Note (UIUX judgement, locked anyway): 720px достаточно для двух-column form (KM / EUR в одной строке), но `Historia`-таб с large origData diff может ощущаться тесно — допустимо, scroll-y решает. Если в Phase 5 dyspozytor/weryfikator получит ещё более широкий diff-view, можно поднять до `w-[840px]` локально для конкретного экрана, **но единый компонент остаётся 720**.

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
- Expand chevron: `<ChevronDown />`, на click — раскрытие JSON-diff под строкой (`<pre className="text-xs bg-bg-soft p-3 rounded-md overflow-x-auto">`).

**Compact variant (`<AuditRow variant="compact">`):** без expand, без avatar — только initials inline + verb + target + relative time. Высота `h-9`. Используется в dashboard sidebar.

**Tokens:** `bg-card` row, hover — `--table-hover` (red-tinted, Phase 2). Expanded — `bg-bg-soft`.

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
- [ ] `<ClaimVerificationModal>` = `<Sheet side="right" w-[720px]>` с 3 табами; **в табе Autoryzacja НЕТ FileUpload компонента**; live recalc badge debounce 300ms.
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

| Column | Header (PL) | Format | Tailwind |
|---|---|---|---|
| `yearMonth` | "Miesiąc" | `2026-04` | `text-left font-mono` |
| `workingDays` | "Dni rob." | integer | `text-right tabular-nums` |
| `kmPerDay` | "Km/dzień" | integer | `text-right tabular-nums` |
| `ratePerKm` | "Stawka €/km" | 4 decimals | `text-right tabular-nums` |
| `kmInMonth` | "Km w mc" | integer with thousand-sep | `text-right tabular-nums font-semibold` |

Layout: shadcn `<Table>` inside a `<Card>` (`bg-card rounded-lg border border-border overflow-hidden`). Header row uses Phase 2 DataTable header style (`bg-bg text-xs font-bold uppercase tracking-wider`). Row height `h-10` (compact, denser than DataTable). Footer row: `bg-bg font-extrabold` with label "Razem (km gwarantowane)" spanning first 4 columns and `kmGuaranteed` in the last column.

Empty / loading state — see `<LivePreviewPanel>`.

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
| Max-width | **`max-w-2xl`** (672px) | override the primitive's default `max-w-md` via the `className` prop | Wide enough for a comfortable two-column label/value grid; not so wide it feels like a page. |
| Width (mobile) | `w-[calc(100%-2rem)]` | (from primitive) | 16px gutter each side — unchanged. |
| Max-height | **`max-h-[85vh]`** | `max-h-[85vh]` | Caps the modal so it never exceeds the viewport; the **body** scrolls, not the page. |
| Internal layout | **3-zone flex column**: header (fixed) · body (`flex-1 overflow-y-auto`) · footer (fixed) | `flex flex-col` on the content; header + footer `shrink-0`, body `min-h-0 flex-1 overflow-y-auto` | Only the body scrolls. Header and footer stay pinned — they never scroll away. |
| Padding | header `px-6 pt-6 pb-4`; body `px-6 py-5`; footer `px-6 py-4` | — | The primitive's blanket `p-6` is **overridden** (pass `className` that resets padding; `<EntityDetailModal>` owns its own zone padding). |
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

The body is the only scrollable zone (`flex-1 overflow-y-auto`). Content is an ordered list of **sections**; sections are separated vertically with `space-y-5`.

**Section anatomy** — reuse the established *section-card* rhythm from the vehicle Sheet (§ Phase 5, "section-card pattern"), tuned for read-only:

```
DANE KONTA I KONTAKT                          <- section header
─────────────────────────────────────────
Login            carrier-login-123           <- label/value row
E-mail           biuro@example.eu
Nazwa            Przykładowy Przewoźnik
Telefon          +48 600 000 000
```

| Slot | Spec |
|---|---|
| Section header | `flex items-center gap-1.5` + an optional **Lucide icon** (14px, `text-text-sub`, `aria-hidden`) + label `text-xs font-bold uppercase tracking-wider text-text-sub`. This is the same "table-header / section-title" typography used elsewhere — keep it consistent, do NOT invent a new section-title style. |
| Section icons (carrier) | Account & contact → `<User>` · Company data → `<Building2>` · Finance → `<Banknote>` · Permits → `<FileBadge>` · Assignment → `<UserCog>`. Icons are decorative; passing an icon is optional in the generic API. |
| Section container | A light surface card: `rounded-lg border border-border bg-card p-4`. **Do not tint** section backgrounds — read-only detail favours calm neutrality over the colour-coded vehicle-form tints. The header sits inside the card, rows below it with `mt-3`. |
| Empty section | If every value in a section is null/empty, the entity wrapper may omit the whole section. The generic shell renders exactly the sections it is given. |

### 6.5 Label/value row — the core read-only primitive

This is the heart of the pattern. **A value is text, not a disabled input.** Read-only is *not* a greyed-out form field — no input border, no input background, no `disabled` styling. Render as a description list (`<dl>` / `<dt>` / `<dd>`) for semantics and a11y.

**Layout — two-column row (default, ≥ `sm`):**

```
<dt>  Label (left)   <dd>  Value (right)
```

| Property | Spec |
|---|---|
| Row container | `<div>` per pair, inside a `<dl>`. Grid: `grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1`. Label column fixed ~144px, value column flexes. |
| Row vertical rhythm | `py-1.5` per row; rows within a section separated by a hairline `divide-y divide-border/60` **or** plain `space-y-2` — pick `divide-y` for ≥6-row sections (carrier Finance), plain spacing for short sections. Web-agent may standardise on `divide-y divide-border/60` for all — acceptable. |
| Label (`<dt>`) | `text-sm font-medium text-text-sub`. Sentence case, not uppercase (uppercase is reserved for the *section* header). Left-aligned, top-aligned (`self-start`) so it lines up with the first line of a multi-line value. |
| Value (`<dd>`) | `text-sm text-text`. `font-medium` for emphasis is allowed but default is `400`. Left-aligned. Wraps freely (`break-words`); never truncates in the detail modal — the user came here to read the full value. |
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
| ≥ `sm` (≥640px) | Two-column label/value grid (§6.5). Footer meta + buttons on one row. Modal `max-w-2xl`. |
| < `sm` (≤640px) | Label/value rows **stack** (`grid-cols-1`): label line (`text-xs font-medium text-text-sub`) above value (`text-sm`). Section cards keep `p-4`. Footer: buttons full-row, meta line wraps to its own line **above** the buttons (`flex-col-reverse`), or is hidden if cramped. Modal width `w-[calc(100%-2rem)]`, `max-h-[85vh]` still caps height; body scroll is the norm on small screens. |
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
| `sections` | Ordered array. Each section: `{ title, icon?, rows }`. Each row: `{ label, value }` where `value` is `ReactNode` (string, `—`, mono span, badge…). The wrapper is responsible for formatting (dates, money, mono, em-dash for null). |
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
- i18n: reuse the existing `carriers.fields.*` and `carriers.sections.*` keys — **no new field-label keys needed**. New keys: `entityDetail.edit` ("Edytuj"), `entityDetail.close` ("Zamknij"), `entityDetail.createdAt`, `entityDetail.updatedAt` (or reuse `common.*` if present).

### 6.11 Wiring on the carriers page (web-agent)

Currently `carriers/page.tsx` does `onRowClick={openEdit}` — row click opens `CarrierSheet` directly. The new flow inserts the detail modal between:

1. `onRowClick={openDetail}` → opens `<CarrierDetailModal>` with the clicked `CarrierDto`.
2. Detail modal «Edytuj» → `onEdit`: the modal closes itself, then the page does `setTarget(row); setSheetOpen(true)` — the **existing** `CarrierSheet` edit drawer opens, unchanged.
3. The row-level «Edytuj» kebab/button in the actions column — **decision for web-agent:** it may either keep opening the edit Sheet directly (power-user shortcut) or also route through the detail modal. Recommended: the explicit «Edytuj» action-column button opens edit directly; a plain **row click** opens the read-only detail modal. This gives both a "glance" and a "jump straight to edit" path.
4. The two surfaces are never open simultaneously — modal closes before Sheet opens.

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

### 6.16 Driver field mapping — 3 logical sections

`DriverSheet` has a **flat layout** (no `FormSection`s), so there is no Sheet order to mirror 1:1. `DriverDetailModal` groups the fields into three clean logical sections instead. Title = `firstName + lastName`; subtitle = `driverLicenseNumber` (mono, falls back to `loginSlug`). Status (`active`) → header badge.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Dane osobowe i kontakt** (`sections.personal`) | `<User>` | Imię → `firstName` · Nazwisko → `lastName` · Telefon → `phone` · Telefon (drugi) → `phone2` · E-mail → `email` |
| **Prawo jazdy i finanse** (`sections.license`) | `<CreditCard>` | Numer prawa jazdy → `driverLicenseNumber` (mono) · Ważność prawa jazdy → `licenseExpiry` (date) · Numer konta → `bankAccount` (mono) |
| **Przypisanie** (`sections.assignment`) | `<UserCog>` | Przewoźnik → `carrier.name ?? carrier.login` · Notatki → `notes` |

- New i18n section keys: `drivers.sections.personal`, `drivers.sections.license`, `drivers.sections.assignment` (PL + EN). All field keys reuse existing `drivers.fields.*`.

### 6.17 Trailer field mapping — the 3 sections

`TrailerDetailModal` mirrors the **three `TrailerSheet` `FormSection`s** in order. Title = `plateNumber`; subtitle = `trailerType.shortCode ?? trailerType.name`. Status (`active`) → header badge.

| Section | Icon | Rows (label → field) |
|---|---|---|
| **Identyfikacja** (`sections.identification`) | `<Container>` | Przewoźnik → `carrier.name ?? carrier.login` · Numer rejestracyjny → `plateNumber` · Typ naczepy → `trailerType` (`[shortCode] name`) · Marka → `brand` · Model → `model` · Rok → `year` (num) · Następny przegląd → `nextInspectionDate` (date) |
| **Wymiary** (`sections.dimensions`) | `<Ruler>` | Długość wewn. (m) → `innerLength` · Szerokość wewn. (m) → `innerWidth` · Wysokość wewn. (m) → `innerHeight` · Ładowność (t) → `capacity` |
| **Wyposażenie** (`sections.equipment`) | `<Package>` | Pasy → `belts` (bool) · Maty → `mats` (bool) · Zawieszenie pneum. → `airSuspension` (bool) · Załadunek tył → `loadFromBack` (bool) · Załadunek bok → `loadFromSide` (bool) · Załadunek góra → `loadFromTop` (bool) · Dach przesuwany → `slidingRoof` (bool) · Dach Edscha → `edschaSlidingRoof` (bool) · Wyposażenie → `equipment` · Notatki → `notes` |

- Dimension/capacity units are baked into the field labels themselves (`innerLength` → "Długość wewn. (m)", `capacity` → "Ładowność (t)") — exactly as `TrailerSheet` renders them — so the values are bare numbers. No new i18n keys needed.

### 6.18 Phase 6 replication — components / shared changes summary

| Change | Where | Owner |
|---|---|---|
| `entity-detail-values.tsx` (shared value-formatter helpers: `emptyValue`/`textValue`/`monoValue`/`dateValue`/`boolValue`/`listValue`) | `apps/web/components/ui/entity-detail-values.tsx` | web-agent |
| `CarrierDetailModal` refactored to import the shared helpers | `apps/web/components/carriers/CarrierDetailModal.tsx` | web-agent |
| `VehicleDetailModal` / `DriverDetailModal` / `TrailerDetailModal` (new entity wrappers) | `apps/web/components/{vehicles,drivers,trailers}/` | web-agent |
| Row click → detail modal; «Edytuj» → existing Sheet | `apps/web/app/(employee)/employee/(admin)/{vehicles,drivers,trailers}/page.tsx` | web-agent |
| i18n: `vehicles.fields.{adrClasses,wasteCountries,gb,it,fr,lastDroveAt}`, `vehicles.sections.attachments`, `drivers.sections.{personal,license,assignment}` | `apps/web/messages/pl.json`, `en.json` | web-agent |
| 0 changes to `EntityDetailModal.tsx`, `tailwind.config.ts`, `globals.css` | — | — |

