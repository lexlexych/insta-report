# InstaReply

InstaReply — AI-ассистент, который помогает малому бизнесу отвечать клиентам в Instagram Direct.
Сообщения из Instagram приходят на подключённый Telegram-бот в виде карточки с предложенным
черновиком ответа (сгенерированным LLM на основе базы знаний бизнеса); владелец подтверждает
отправку одним нажатием прямо в Telegram, либо правит текст перед отправкой.

Управление подключением Instagram, базой знаний, категориями и настройками происходит через
Telegram Mini App, встроенный в того же бота. Backend и Mini App — единое Next.js-приложение,
развёрнутое на Vercel; данные и очередь состояний — в Supabase (Postgres).

## Требования

- Node.js 20+
- pnpm (см. `packageManager` в `package.json`)

## Быстрый старт

```bash
pnpm install
cp .env.example .env.local   # заполните переменные окружения (см. описание в файле)
pnpm dev                     # http://localhost:3000/app
```

Полезные скрипты:

```bash
pnpm build       # production-сборка Next.js
pnpm start       # запуск production-сборки
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm format      # prettier --write .
```

## Переменные окружения

Единственная точка чтения `process.env` в коде — `src/lib/env.ts` (Zod-схема, ленивая
типобезопасная инициализация: см. `getEnv()`/`env`). Полный список переменных — в
`.env.example`, назначение каждой — в `docs/plan.md` §2.5.

## Структура каталогов

```
/app                     — Next.js App Router (страницы Mini App: /app/(miniapp)/*)
/app/api                 — роуты API (появятся по мере тикетов)
/src/lib/db              — репозитории, единственная точка доступа к Supabase
/src/lib/ig              — клиент Instagram Graph API
/src/lib/tg              — grammY-бот, клавиатуры, рендер карточек
/src/lib/llm             — LLM-клиент, промпты
/src/lib/pipeline        — обработчики потоков A/B (чистые функции + side-effect слой)
/src/lib/env.ts          — Zod-валидация env, единственный источник process.env
/supabase/migrations     — SQL-миграции
/scripts                 — служебные скрипты (setup:telegram и пр.)
/scripts/manual          — demo-скрипты и вспомогательные инструменты для ручного тестирования
```

Полное описание архитектуры, модели данных и плана тикетов — в [`docs/plan.md`](docs/plan.md).

## Ручное тестирование

Автоматических тестов в проекте нет (см. `docs/tickets/OVERRIDES.md`): каждый тикет
сопровождается инструкцией ручной проверки в `docs/manual-tests/T-0XX.md`. Там же — команды
для запуска demo-скриптов из `scripts/manual/` там, где у функциональности ещё нет UI.
