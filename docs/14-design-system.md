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

Employee nav (top tabs или left sidebar — решит web-agent в Phase 4) содержит ссылки `Carriers / Vehicles / Drivers / Trailers / Trailer types` **только** для ролей `admin` и `pracownik`. Прочие employee-роли (opiekun, planista, dyspozytor, eksport, weryfikator) их не видят.

Pattern:
- Список ссылок строится из конфига `nav.config.ts`, каждая запись — `{ href, label, icon, roles: Role[] }`.
- Фильтрация в layout server-component: `links.filter(l => l.roles.includes(currentRole))`.
- Никакого client-side hide через CSS. Что роль не видит — не рендерится.
- Активное состояние ссылки — `bg-brand-50 text-brand` light / `bg-brand/15 text-brand-light` dark.

### Phase 2 confirmation

Phase 2 web (admin DataTable + Sheet edit forms + RHF/Zod валидация + inline VIES/Biała Lista feedback) **не вводит новых color/radius/shadow токенов**. Всё собирается из существующей brand-палитры, semantic colors (`success`/`warning`/`danger`/`text-sub`) и shadcn-примитивов перечисленных выше. Единственный новый custom-компонент — `<FieldValidationBadge>`. Уровень полировки — UAT, не production.

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
