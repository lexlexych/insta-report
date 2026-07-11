# InstaReply

InstaReply — AI-ассистент, который помогает малому бизнесу отвечать клиентам в Instagram Direct.
Сообщения из Instagram приходят на подключённый Telegram-бот в виде карточки с предложенным
черновиком ответа (сгенерированным LLM на основе базы знаний бизнеса); владелец подтверждает
отправку одним нажатием прямо в Telegram, либо правит текст перед отправкой.

Управление подключением Instagram, базой знаний, категориями и настройками происходит через
Telegram Mini App, встроенный в того же бота. Первичная настройка — полноэкранный онбординг:
пользователь выбирает сферу деятельности и правит под себя предустановленный шаблон базы знаний
(`src/lib/kb-templates/`); подключение Instagram проходит через заявку с подтверждением
администратором (пилотная схема, аккаунты добавляются в Meta App вручную). Backend и
Mini App — единое Next.js-приложение, развёрнутое на Vercel; данные и очередь состояний —
в Supabase (Postgres).

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
pnpm db:push     # supabase db push — применить SQL-миграции к связанному Supabase-проекту
pnpm db:types    # supabase gen types typescript --linked > src/lib/db/types.gen.ts
pnpm gen:key     # сгенерировать случайный ключ для ENCRYPTION_KEY (AES-256-GCM, base64/32 байта)
```

## Переменные окружения

Единственная точка чтения `process.env` в коде — `src/lib/env.ts` (Zod-схема, ленивая
типобезопасная инициализация: см. `getEnv()`/`env`). Полный список переменных — в
`.env.example`, назначение каждой — в `docs/plan.md` §2.5.

Значение для `ENCRYPTION_KEY` (base64 от 32 случайных байт — ключ AES-256-GCM, используемый
`src/lib/crypto.ts` для шифрования секретов тенантов) можно сгенерировать командой:

```bash
pnpm gen:key
```

Скрипт печатает случайную base64-строку в stdout — скопируйте её в `ENCRYPTION_KEY` в
`.env.local` (в вывод не попадает ничего, кроме сгенерированного ключа).


## Плановые задачи Vercel Cron

`vercel.json` запускает ежедневный рефреш долгоживущих Instagram-токенов по расписанию
`0 4 * * *` через `GET /api/cron/refresh-tokens`. Роут принимает секрет двумя способами:

- заголовок `Authorization: Bearer <CRON_SECRET>` — основной вариант для защищённых cron-вызовов;
- query-параметр `?key=<CRON_SECRET>` — совместимый ручной/диагностический запуск, если окружение cron не проставляет заголовок.

Задайте `CRON_SECRET` в переменных окружения Vercel и не публикуйте его в логах, PR или инструкциях.
При ошибке обновления одного тенанта cron продолжает обработку остальных, помечает проблемное
Instagram-подключение как `error`, уведомляет владельца в Telegram и отправляет алерт администраторам
из `ADMIN_TELEGRAM_IDS`.

## База данных

Схема Postgres живёт в `/supabase/migrations` (SQL-миграции Supabase CLI, добавлен как
devDependency): `0001_init.sql` — все таблицы модели данных (`tenants`, `ig_connections`,
`labels`, `drafts`, `processed_events`, `message_log`, `usage_stats`) + необходимые индексы
(включая partial unique `drafts(tenant_id, conversation_key) WHERE status='pending'`) + RLS,
включённый на всех таблицах без единой политики (это даёт **deny-all** для anon-ключа: доступ
к БД возможен только через `SUPABASE_SECRET_KEY`, который обходит RLS; клиентский
`supabase-js` в проекте не используется) + функция сида метки `seed_default_labels(tenant_id)`.
`0002_increment_usage.sql` — атомарный upsert-инкремент `increment_usage(...)` для
`usage_stats`.

Применить миграции к своему dev-проекту Supabase:

```bash
supabase link --project-ref <ref>   # один раз, нужен доступ к проекту в дашборде Supabase
pnpm db:push                        # supabase db push — применяет supabase/migrations/*.sql
```

Перед этим убедитесь, что в `.env.local` заполнены `SUPABASE_URL` и
`SUPABASE_SECRET_KEY` (см. `.env.example`), а сам проект Supabase создан в регионе ЕС
(Frankfurt) — см. `docs/plan.md` §4.

Регенерировать TypeScript-типы после изменения схемы:

```bash
pnpm db:types   # supabase gen types typescript --linked > src/lib/db/types.gen.ts
```

`src/lib/db/types.gen.ts` уже закоммичен (написан вручную по формату реального вывода
`supabase gen types typescript`, т.к. в среде разработки нет привязанного живого проекта) —
после первого `supabase link` его нужно перегенерировать командой выше.

## Структура каталогов

```
/app                     — Next.js App Router (страницы Mini App: /app/(miniapp)/*)
/app/api                 — роуты API (появятся по мере тикетов)
/src/lib/db              — репозитории, единственная точка доступа к Supabase
/src/lib/ig              — клиент Instagram Graph API
/src/lib/tg              — grammY-бот, клавиатуры, рендер карточек
/src/lib/llm             — LLM-клиент, промпты
/src/lib/kb-templates    — предустановленные шаблоны баз знаний по сферам деятельности (.md)
/src/lib/pipeline        — обработчики потоков A/B (чистые функции + side-effect слой)
/src/lib/crypto.ts       — шифрование секретов (AES-256-GCM)
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
