# Документация проекта MagTrans

Система управления гарантией километража для логистической компании, реализованная как Google Apps Script Web App поверх Google Sheets.

## Состав репозитория

| Файл | Описание | Размер |
|------|----------|--------|
| `Code.gs` | Backend на Google Apps Script (API, бизнес-логика, доступ к Sheets) | ~7 482 строки |
| `index.html` | Монолитный фронтенд (HTML + CSS + клиентский JS) | ~10 584 строк |

## Структура документации

| # | Файл | Тема |
|---|------|------|
| 1 | [01-overview.md](01-overview.md) | Общий обзор: что делает система, ключевые потоки, бизнес-сценарии |
| 2 | [02-architecture.md](02-architecture.md) | Архитектура: слои, точки входа, внешние интеграции |
| 3 | [03-roles.md](03-roles.md) | **Роли и сущности**: что может делать каждая роль (перевозчик, диспетчер, опекун, планиста и т.д.) |
| 4 | [04-data-model.md](04-data-model.md) | Структура Google Sheets: листы, колонки, связи |
| 5 | [05-backend-api.md](05-backend-api.md) | Карта функций `Code.gs` по группам |
| 6 | [06-frontend.md](06-frontend.md) | Структура `index.html`: экраны, модалы, клиентский JS |
| 7 | [07-modularization-plan.md](07-modularization-plan.md) | **План разбиения** монолита на модули — для читаемости и поддержки |
| 8 | [08-issues-and-solutions.md](08-issues-and-solutions.md) | **Проблемы кода** (security, performance, дублирование) и предлагаемые решения |

## Быстрая навигация по ролям

- **Перевозчик (przewoznik)** — подаёт заявления (wnioski), управляет своим автопарком → [03-roles.md#перевозчик](03-roles.md#przewoznik)
- **Опекун (opiekun)** — куратор группы перевозчиков → [03-roles.md#опекун](03-roles.md#opiekun)
- **Планиста (planista)** — спедитор, видит закреплённые авто → [03-roles.md#планиста](03-roles.md#planista)
- **Диспетчер (dyspozytor)** — диспетчер по своим авто → [03-roles.md#диспетчер](03-roles.md#dyspozytor)
- **Работник/Админ (pracownik/admin)** — верифицирует заявления → [03-roles.md#работник](03-roles.md#pracownik)
- **Эксперт экспорта (eksport)** / **Верификатор (weryfikator)** — модуль делегаций → [03-roles.md#специальные](03-roles.md#специальные-роли)

## Быстрая навигация по проблемам

- 🔴 [Пароли в plaintext](08-issues-and-solutions.md#1-хранение-паролей-в-plaintext) — критично
- 🔴 [XSS в обработке ошибок](08-issues-and-solutions.md#2-xss-в-сообщениях-об-ошибках) — критично
- 🟠 [Монолит 10k+ строк](07-modularization-plan.md) — план разбиения
- 🟠 [Функция `updateClaimFull` — 462 строки](08-issues-and-solutions.md#5-слишком-длинные-функции)
- 🟡 [N+1 запросы к Sheets](08-issues-and-solutions.md#7-n1-запросы-и-производительность)
