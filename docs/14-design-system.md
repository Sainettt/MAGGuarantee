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
