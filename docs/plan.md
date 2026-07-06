# InstaReply — AI-ассистент для ответов клиентам в Instagram Direct через Telegram

> **⚠️ РЕВИЗИЯ v1.1 (обязательна к применению).** Проект собирается БЕЗ автоматических тестов —
> приёмка каждого тикета выполняется человеком вручную по инструкции `docs/manual-tests/T-0XX.md`.
> Строка стека «Тесты: Vitest» и упоминания `pnpm test` в этом документе считаются удалёнными;
> Definition of Done = `pnpm lint && pnpm typecheck` + инструкция ручного теста. Supabase MCP
> не используется. Рабочий процесс (ветки, PR, статусы) — `docs/orchestration/workflow.md`;
> поправки к тикетам — `docs/tickets/OVERRIDES.md` (он сильнее текста тикетов).

**Версия документа:** 1.0 · **Дата:** 2026-07-03 · **Рынок:** Германия / ЕС

---

## 1. Концепция продукта

SaaS-сервис для малого бизнеса (салоны, кафе, магазины, мастера), который:

1. Принимает входящие сообщения Instagram Direct бизнес-аккаунта через вебхуки Meta.
2. С помощью LLM классифицирует обращение по настраиваемым категориям и генерирует черновик ответа на основе базы знаний о компании.
3. Отправляет черновик владельцу бизнеса в **Telegram** карточкой с кнопками: «🔗 Перейти в Instagram» и «✅ Отправить». По нажатию «Отправить» ответ уходит клиенту в Instagram Direct через Graph API.
4. Если владелец ответил клиенту вручную (echo-событие) — висящий черновик автоматически отзывается.

**Интерфейс продукта — Telegram Mini App**, открывающаяся из бота: онбординг, подключение Instagram, управление категориями, база знаний, тест-чат (симулятор клиента) и дашборд. Отдельного веб-сайта с регистрацией нет: личность пользователя = его Telegram-аккаунт.

**Подключение Instagram (переходная схема до прохождения App Review):** пользователь по пошаговой инструкции в Mini App создаёт собственное Meta App (Instagram API with Instagram Login), генерирует долгоживущий токен в App Dashboard и прописывает наш per-tenant webhook URL. Это легальная схема Standard Access («приложение обслуживает аккаунт, которым вы владеете»). Архитектура закладывает миграцию на центральный OAuth (`connection_mode: own_app | platform_app`) после прохождения нашей верификации в Meta.

**Монетизация (post-MVP, вне тикетов ниже):** подписка через Stripe, тарифы по числу диалогов/каналов. В MVP — поле `plan` в tenants и заглушка.

---

## 2. Архитектура

### 2.1 Компоненты

```
┌─────────────────────────── Vercel (Next.js 15, App Router) ───────────────────────────┐
│                                                                                        │
│  Mini App (React/Tailwind)          API Routes (serverless / fluid compute)           │
│  /app — онбординг, дашборд,   ←→    /api/miniapp/*  — бэкенд Mini App (auth: initData)│
│  метки, тест-чат, настройки          /api/telegram   — вебхук бота (grammY)            │
│                                      /api/wh/ig/[tenantId] — per-tenant вебхук Meta   │
│                                      /api/cron/*     — Vercel Cron (рефреш токенов)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                    │                                   │
                    ▼                                   ▼
        ┌───────────────────────┐          ┌─────────────────────────┐
        │  Supabase (Postgres)  │          │  Внешние API             │
        │  tenants, connections │          │  Telegram Bot API        │
        │  labels, drafts,      │          │  Instagram Graph API     │
        │  processed_events,    │          │  (graph.instagram.com)   │
        │  message_log, usage   │          │  LLM: OpenRouter /       │
        └───────────────────────┘          │  OpenAI-compatible       │
                                           └─────────────────────────┘
```

### 2.2 Ключевые потоки

**Поток A — входящее сообщение клиента:**
```
Meta POST /api/wh/ig/{tenantId}
 → проверка X-Hub-Signature-256 (app_secret тенанта)
 → мгновенный ответ 200 + waitUntil(process)
 → dedup по (tenant_id, mid) в processed_events
 → echo? → отменить pending-черновик (удалить TG-сообщение, drafts.status=cancelled) → конец
 → иначе: Graph API: username + последние 20 сообщений беседы
 → построить history + pendingText (неотвеченный хвост)
 → LLM #1: классификация в одну из меток (JSON-mode)
 → LLM #2: черновик ответа (system prompt из базы знаний + instruction метки)
 → если для (account, contact) уже есть pending-черновик: удалить его TG-сообщение, status=cancelled
 → отправить в TG карточку (HTML, blockquote, <pre> черновик, inline-кнопки)
 → insert drafts(status=pending, tg_message_id, draft_text, conversation_key, trigger_ts)
```

**Поток B — нажатие «✅ Отправить»:**
```
Telegram POST /api/telegram (callback_query, data="send:{draft_id}")
 → answerCallbackQuery("Отправляю…")
 → транзакция: drafts pending → sending (если не pending — выход, кнопка устарела)
 → Graph API: перечитать беседу; бизнес уже ответил после trigger_ts?
    → да: editMessageText("⚠️ Отменено: вы уже ответили вручную"), status=cancelled
    → нет: POST /{ig_id}/messages (разбиение текста >1000 байт), status=sent,
           editMessageText карточки → «✅ Отправлено», лог в message_log
```

Обратите внимание: в отличие от n8n-версии здесь **нет Wait/resume и воркфлоу-моста** — состояние живёт в таблице `drafts`, оба потока — независимые обработчики. Гонки закрываются переходами статусов в одной транзакции.

### 2.3 Ограничения serverless и принятые решения

| Проблема | Решение |
|---|---|
| Meta ретраит вебхук при медленном ответе | Отвечаем 200 сразу, обработка в `waitUntil()` (Vercel Fluid Compute, maxDuration=60) |
| Повторные доставки вебхуков | Таблица `processed_events` с уникальным индексом (tenant_id, event_mid); insert-or-skip |
| Нет长living процессов | Никаких таймеров в памяти; всё состояние — в Postgres |
| Рефреш IG-токенов (живут 60 дней) | Vercel Cron раз в сутки: `refresh_access_token` для токенов старше 24 ч |
| Секреты тенантов в БД (ig token, app_secret) | AES-256-GCM шифрование на уровне приложения, ключ в env `ENCRYPTION_KEY` |
| Один Telegram-бот на всех | Центральный бот @ProductBot; черновики — в личный чат владельца. Раскладка по топикам категорий прямо в личном чате бота (Bot API 9.3, темы в приватных чатах) |

### 2.4 Модель данных (Supabase / Postgres)

```sql
tenants            id uuid pk, telegram_user_id bigint unique, tg_chat_id bigint,
                   org_name text, org_description text, knowledge_base text,
                   system_prompt text, reply_language text default 'auto',
                   plan text default 'free', onboarding_step text, created_at

ig_connections     id uuid pk, tenant_id fk unique, connection_mode text ('own_app'),
                   ig_account_id text, ig_username text,
                   access_token_enc text, app_secret_enc text, verify_token text,
                   token_refreshed_at timestamptz, webhook_last_seen_at timestamptz,
                   status text ('pending'|'active'|'error'), created_at

labels             id uuid pk, tenant_id fk, name text, description text,
                   instruction text, tg_thread_id bigint null, sort int
                   -- unique (tenant_id, name); сид: «Без категории»

drafts             id uuid pk, tenant_id fk, conversation_key text, -- "{ig_acc}:{contact}"
                   contact_id text, contact_username text,
                   pending_text text, history_snapshot text, label_id fk null,
                   draft_text text, tg_chat_id bigint, tg_message_id bigint,
                   trigger_ts bigint, status text ('pending'|'sending'|'sent'|
                   'cancelled'|'skipped_manual'|'error'), error text, created_at
                   -- partial unique index: (tenant_id, conversation_key) where status='pending'

processed_events   tenant_id, event_mid text, created_at; unique (tenant_id, event_mid)

message_log        id, tenant_id, conversation_key, direction ('in'|'out'|'manual'),
                   text, created_at  -- для дашборда и топика «История»

usage_stats        id, tenant_id, day date, llm_calls int, tokens_in int,
                   tokens_out int, drafts_created int, drafts_sent int
                   -- unique (tenant_id, day), инкременты upsert'ом
```

Доступ к БД — только с сервера через `SUPABASE_SECRET_KEY` (RLS включён, политики запрещают anon; клиентский supabase-js не используется).

### 2.5 Переменные окружения

```
TELEGRAM_BOT_TOKEN            токен центрального бота
TELEGRAM_WEBHOOK_SECRET       secret_token для setWebhook
MINIAPP_JWT_SECRET            подпись сессий Mini App
ENCRYPTION_KEY                32 байта base64 для AES-256-GCM
SUPABASE_URL / SUPABASE_SECRET_KEY
LLM_BASE_URL                  напр. https://openrouter.ai/api/v1
LLM_API_KEY
LLM_MODEL_CLASSIFY            напр. openai/gpt-4o-mini
LLM_MODEL_DRAFT               напр. openai/gpt-4o-mini
APP_BASE_URL                  https://<project>.vercel.app
CRON_SECRET                   защита /api/cron/*
ADMIN_TELEGRAM_IDS            csv id для алертов/страницы ошибок
```

---

## 3. Технологический стек

| Слой | Выбор | Обоснование |
|---|---|---|
| Фреймворк | **Next.js 15 (App Router), TypeScript strict** | один деплой на Vercel: и Mini App, и API |
| Telegram-бот | **grammY** + `webhookCallback` | зрелый, отлично работает в serverless |
| Mini App SDK | **@telegram-apps/sdk-react** | initData, тема, BackButton, MainButton |
| UI | **Tailwind CSS** + минимальные свои компоненты | лёгкий бандл для WebView |
| БД | **Supabase (Postgres)** + supabase CLI миграции в `/supabase/migrations` | генерация TS-типов `supabase gen types` |
| LLM | **openai** SDK c `baseURL` → OpenRouter | провайдер-агностично, смена через env |
| Валидация | **Zod** | схемы вебхуков, форм, env |
| Тесты | **Vitest** | юниты для парсеров/крипто/пайплайна, моки fetch |
| CI | **GitHub Actions** | lint + typecheck + test на PR |

---

## 4. Развертывание (GitHub + Vercel + Supabase)

1. **GitHub:** монорепо, ветка `main` = production. PR-flow, CI обязателен.
2. **Supabase:** проект в регионе **ЕС (Frankfurt)** — важно для GDPR/рынка Германии. Миграции применяются `supabase db push` (CI job) либо вручную. Service role key → в Vercel env.
3. **Vercel:** импорт репо, framework Next.js. Env-переменные из раздела 2.5. Включить Fluid Compute; `maxDuration: 60` для webhook/cron роутов. `vercel.json` содержит расписание crons.
4. **Telegram:** скрипт `pnpm run setup:telegram` вызывает `setWebhook` на `{APP_BASE_URL}/api/telegram` с `secret_token`, регистрирует команды и кнопку меню Mini App (`setChatMenuButton` → web_app URL `{APP_BASE_URL}/app`).
5. **Meta (на стороне каждого тенанта):** пользователь создаёт своё App, вводит в его дашборде наш callback URL `{APP_BASE_URL}/api/wh/ig/{tenantId}` и verify token из Mini App, подписывается на поле `messages`.

---

## 5. Соглашения для AI-кодинг-агентов (прочитать перед каждым тикетом)

1. **Структура каталогов (не менять без тикета):**
```
/app                     — Next.js App Router (страницы Mini App: /app/(miniapp)/*)
/app/api                 — роуты API
/src/lib/db              — репозитории (единственная точка доступа к Supabase)
/src/lib/ig              — клиент Instagram Graph API
/src/lib/tg              — grammY-бот, клавиатуры, рендер карточек
/src/lib/llm             — LLM-клиент, промпты
/src/lib/pipeline        — обработчики потоков A/B (чистые функции + side-effect слой)
/src/lib/crypto.ts       — шифрование секретов
/src/lib/env.ts          — Zod-валидация env, единственный источник process.env
/supabase/migrations     — SQL-миграции
/scripts                 — setup:telegram и пр.
/tests                   — vitest
```
2. **Никаких обращений к `process.env` вне `src/lib/env.ts`.** Никаких прямых вызовов supabase-js вне `src/lib/db`.
3. Все внешние вызовы (Graph API, Telegram, LLM) — через клиенты из `src/lib/*` с таймаутами и типизированными ошибками; в юнит-тестах — моки.
4. Каждый тикет завершается: код + тесты (если указаны в AC) + обновление `README.md`/`docs/` при изменении публичного поведения + зелёный `pnpm lint && pnpm typecheck && pnpm test`.
5. Тексты UI — на немецком и русском не хардкодить: словарь `src/lib/i18n.ts` (ключи en/de/ru), MVP заполняет `ru` + `de`.
6. Секреты тенантов записывать в БД только через `encrypt()`; в логи не выводить.
7. Не выдумывать поля Meta/Telegram API — использовать типы из тикетов; при сомнении оставлять TODO-комментарий, а не догадку.

---
## 6. Тикеты

Формат: **ID · Название** · Зависимости · Задача · Критерии приёмки (AC). Выполнять по порядку эпиков; внутри эпика зависимости указаны явно.

---

### Эпик 0 — Фундамент

**T-001 · Скаффолд проекта**
Зависимости: —
Задача: создать Next.js 15 (App Router, TS strict) + Tailwind + pnpm; структуру каталогов из раздела 5; ESLint + Prettier; Vitest c примером теста; `src/lib/env.ts` (Zod-схема всех env из 2.5, fail-fast); `.env.example`; базовый `README.md`; GitHub Actions workflow (lint, typecheck, test).
AC: `pnpm dev` поднимает пустую страницу `/app`; CI зелёный; импорт `env` из любого места типобезопасен; в `.env.example` перечислены все переменные с комментариями.

**T-002 · Схема БД и миграции Supabase**
Зависимости: T-001
Задача: SQL-миграция со всеми таблицами из раздела 2.4 (включая индексы: unique `(tenant_id, event_mid)`; partial unique `(tenant_id, conversation_key) WHERE status='pending'`; unique `(tenant_id, day)`); включить RLS с deny-all для anon; сид метки «Без категории» реализовать функцией `seed_default_labels(tenant_id)`; настроить `supabase gen types typescript` → `src/lib/db/types.gen.ts`; npm-скрипты `db:push`, `db:types`.
AC: миграция применяется на чистый проект без ошибок; сгенерированные типы коммитятся; в README раздел «База данных».

**T-003 · Модуль шифрования секретов**
Зависимости: T-001
Задача: `src/lib/crypto.ts`: `encrypt(plain): string` / `decrypt(payload): string` — AES-256-GCM, ключ из `env.ENCRYPTION_KEY` (base64, 32 байта), формат `v1:{iv}:{tag}:{ciphertext}` base64. Скрипт генерации ключа `scripts/gen-key.ts`.
AC: vitest: roundtrip; повреждённый tag → исключение; разные iv у одинаковых plaintext.

**T-004 · Слой репозиториев**
Зависимости: T-002, T-003
Задача: `src/lib/db/`: единый серверный supabase-клиент (service role); репозитории `tenants`, `igConnections` (секреты — только через crypto), `labels`, `drafts` (включая методы `claimPendingToSending(draftId)` — атомарный UPDATE ... WHERE status='pending' RETURNING; `cancelPendingByConversation(tenantId, key)`), `processedEvents.tryInsert()` (true/false), `messageLog`, `usageStats.increment(tenantId, patch)` (upsert).
AC: vitest с моком supabase-js: claim при статусе `sent` возвращает null; tryInsert дубликата → false; секрет в БД не равен plaintext.

---

### Эпик 1 — Telegram-бот и аутентификация Mini App

**T-005 · Каркас бота (grammY) и вебхук**
Зависимости: T-004
Задача: `src/lib/tg/bot.ts` (grammY, lazy-init); роут `POST /api/telegram` через `webhookCallback`, проверка заголовка `X-Telegram-Bot-Api-Secret-Token` == `env.TELEGRAM_WEBHOOK_SECRET`, иначе 401. `/start`: upsert tenant по `telegram_user_id`, сохранить `tg_chat_id`, приветствие + inline-кнопка `web_app` на `{APP_BASE_URL}/app`. Скрипт `scripts/setup-telegram.ts`: `setWebhook` (secret_token, allowed_updates: message, callback_query), `setMyCommands`, `setChatMenuButton` (web_app).
AC: неверный secret → 401; повторный /start не создаёт дубликат tenant; скрипт идемпотентен.

**T-006 · Каркас Mini App**
Зависимости: T-001
Задача: маршрут `/app` (route group `(miniapp)`): инициализация `@telegram-apps/sdk-react`, подхват темы Telegram (CSS-переменные), layout с нижней навигацией (Дашборд · Тест-чат · Категории · Настройки), заглушки страниц, `src/lib/i18n.ts` (ru/de) и хук `useT()`. Вне Telegram — заглушка «Откройте через бота».
AC: страницы переключаются; тема dark/light применяется; словарь i18n покрывает навигацию.

**T-007 · Аутентификация Mini App (initData)**
Зависимости: T-005, T-006
Задача: `POST /api/miniapp/auth`: валидация `initData` (HMAC-SHA256 по алгоритму Telegram, ключ из bot token; отклонять `auth_date` старше 1 ч) → upsert tenant → выдача JWT (`MINIAPP_JWT_SECRET`, TTL 12 ч, payload `{tenantId}`) в httpOnly cookie. Хелпер `requireTenant(req)` для всех роутов `/api/miniapp/*`. Клиент: авто-auth при старте, состояние в React context.
AC: vitest: валидная подпись из фикстуры проходит, изменённая — 401, старый auth_date — 401; роут с `requireTenant` без cookie → 401.

---

### Эпик 2 — Онбординг и база знаний

**T-008 · LLM-клиент**
Зависимости: T-001
Задача: `src/lib/llm/client.ts`: обёртка над `openai` SDK с `baseURL=env.LLM_BASE_URL`; функции `complete(opts)` и `completeJSON<T>(opts, zodSchema)` (response_format json + zod-парсинг + 1 retry при невалидном JSON); таймаут 30 с, 2 ретрая на 429/5xx с backoff; возврат usage (tokens in/out); хук `onUsage` → `usageStats.increment`.
AC: vitest c моком fetch: retry срабатывает; невалидный JSON → повторный вызов → ошибка типизирована; usage прокидывается.

**T-009 · Визард онбординга (UI)**
Зависимости: T-006, T-007
Задача: страница `/app/onboarding`, шаги: 1) приветствие и описание продукта; 2) форма «Название организации» + «Опишите бизнес свободным текстом» (textarea, подсказки); 3) экран «Генерируем базу знаний…» → показ результата с возможностью редактирования; 4) финал с кнопками «Подключить Instagram» и «Попробовать тест-чат». Прогресс сохраняется в `tenants.onboarding_step`; выход/возврат продолжает с места остановки. MainButton Telegram как основная CTA.
AC: перезапуск Mini App возвращает на незавершённый шаг; поля валидируются (мин. длины); после финала редирект на дашборд.

**T-010 · Генерация базы знаний и system prompt**
Зависимости: T-004, T-008
Задача: `POST /api/miniapp/onboarding/generate`: из org_name + org_description LLM формирует (a) структурированную базу знаний (markdown: о компании, услуги/товары, тон, FAQ-заготовки) и (b) system prompt ассистента (шаблон в `src/lib/llm/prompts.ts`, язык ответа = язык клиента). Сохранение в tenants; `PUT /api/miniapp/knowledge` для правок; вызов `seed_default_labels`.
AC: интеграционный тест с моком LLM: поля заполнены, метка «Без категории» создана; повторная генерация перезаписывает по подтверждению (флаг `overwrite`).

---

### Эпик 3 — Подключение Instagram

**T-011 · Per-tenant вебхук Meta: verify + приём**
Зависимости: T-004
Задача: роут `/api/wh/ig/[tenantId]`. GET: сверка `hub.verify_token` с `ig_connections.verify_token` → ответ `hub.challenge` (200 text), обновить `status='active'`, `webhook_last_seen_at`. POST: raw body; проверка `X-Hub-Signature-256` HMAC-SHA256 c `app_secret` тенанта (timing-safe), иначе 401; мгновенный `200 OK` + `waitUntil(handleIgEvent(tenantId, body))` (заглушка до T-016); обновить `webhook_last_seen_at`. `export const maxDuration = 60`.
AC: vitest: верный/неверный verify_token; верная/подделанная подпись; тело парсится после проверки подписи по raw bytes.

**T-012 · Визард подключения Instagram (UI)**
Зависимости: T-007, T-011
Задача: страница `/app/connect-instagram`: генерация `verify_token` (crypto random) при первом заходе; пошаговая инструкция (шаги-аккордеоны, места под скриншоты `/public/guide/*.png` с плейсхолдерами): создать Meta App → добавить продукт Instagram → API setup with Instagram login → привязать свой профессиональный аккаунт → сгенерировать долгоживущий токен → вписать наши Callback URL (`{APP_BASE_URL}/api/wh/ig/{tenantId}`, кнопка «копировать») и Verify Token → подписаться на поле `messages`. Форма: `access_token`, `app_secret` (password-поля) → `POST /api/miniapp/ig/connect` (шифрование, статус `pending`).
AC: URL и verify token копируются; сохранение не пишет секреты в логи; повторное открытие показывает статус подключения, поля токенов маскированы.

**T-013 · Клиент Instagram Graph API**
Зависимости: T-003, T-004
Задача: `src/lib/ig/client.ts` (граф-версия константой `v25.0`): `getAccount(token)` (`/me?fields=user_id,username`), `getUsername(token, igsid)`, `getConversation(token, igAccountId, contactId, limit=20)` (fields `messages{message,from,created_time}`), `sendMessage(token, igAccountId, igsid, text)` — авто-разбиение текста на части ≤900 байт UTF-8 по границам предложений, последовательная отправка; типизированные ошибки (OAuthException → пометить connection `error`), учёт 429.
AC: vitest: разбиение длинного текста (кириллица!) не рвёт середину слова и укладывается в лимит; OAuthException мапится в `IgAuthError`.

**T-014 · Диагностика подключения**
Зависимости: T-012, T-013
Задача: `GET /api/miniapp/ig/status`: (a) валидность токена — живой вызов `getAccount`, сохранить `ig_account_id/ig_username`; (b) вебхук: `webhook_last_seen_at` (handshake был? событие было?). UI-блок «Проверка подключения»: три индикатора (токен · handshake · первое событие) + инструкция «отправьте сообщение своему аккаунту с другого профиля» + кнопка «Обновить».
AC: при валидном токене username отображается; при отсутствии handshake — подсказка, что проверить; ошибочный токен переводит connection в `error` c человекочитаемым текстом.

**T-015 · Cron: рефреш токенов**
Зависимости: T-013
Задача: `GET /api/cron/refresh-tokens` (защита `Authorization: Bearer {CRON_SECRET}`): для активных подключений с `token_refreshed_at` старше 7 дней вызвать `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`; сохранить новый токен (encrypt) и дату; при ошибке — connection `error` + сообщение владельцу в TG («Подключение Instagram требует внимания», кнопка в Mini App) + алерт админам. `vercel.json`: schedule `0 4 * * *`.
AC: vitest: успешный рефреш обновляет token и дату; провал шлёт уведомление (мок TG) и не роняет обработку остальных тенантов.

---

### Эпик 4 — Пайплайн обработки сообщений

**T-016 · Парсер событий и dedup**
Зависимости: T-011
Задача: `src/lib/pipeline/parse.ts`: Zod-схема вебхука messaging; функция `parseIgEvent(body)` → `{ isEcho, accountId, contactId, text, mid, ts } | null` (портировать логику из n8n Code-ноды: echo → account=sender, иначе account=recipient); не-текстовые вложения → `text=''` + флаг `hasAttachments`. `handleIgEvent`: parse → `processedEvents.tryInsert(tenantId, mid)`; дубликат → выход; echo → T-022; входящее → T-017+.
AC: vitest на фикстурах реальных payload (входящее, echo, вложение, read-событие): корректные поля; повторный mid не обрабатывается дважды.

**T-017 · Сбор контекста беседы**
Зависимости: T-013, T-016
Задача: `src/lib/pipeline/context.ts`: по (tenant, contactId) получить username и последние 20 сообщений; построить `history` («Бизнес:/Клиент:» хронологически) и `pendingText` — все сообщения клиента после последнего сообщения бизнеса (fallback: текст триггера). Портировать из Code-нод WF1 c юнит-тестами на граничные случаи (бизнес ещё не писал; клиент прислал 3 подряд).
AC: vitest: pendingText для серии сообщений склеивается через \n; порядок history хронологический.

**T-018 · Классификация по меткам**
Зависимости: T-008, T-017
Задача: `src/lib/pipeline/classify.ts`: промпт из WF1 (вернуть точное имя категории или пустую строку), `completeJSON` со схемой `{label: string}`, модель `LLM_MODEL_CLASSIFY`; сопоставление с метками тенанта case-insensitive; нет совпадения → «Без категории». Возврат `{label, instruction}`.
AC: vitest (мок LLM): точное имя → метка; выдуманное имя → «Без категории»; пустая строка → «Без категории».

**T-019 · Генерация черновика**
Зависимости: T-008, T-018
Задача: `src/lib/pipeline/draft.ts`: промпт из WF1 (history, pendingText, knowledge_base, instruction метки; system prompt тенанта; «пиши на языке клиента, не выдумывай фактов»), модель `LLM_MODEL_DRAFT`. Если `hasAttachments` и пустой текст — черновик-уточнение («вижу вложение…») и пометка в карточке.
AC: vitest (мок LLM): все части контекста попадают в промпт; usage учитывается в usage_stats.

**T-020 · Карточка черновика в Telegram + замещение старого**
Зависимости: T-005, T-019
Задача: `src/lib/tg/draftCard.ts`: HTML-рендер (эскейпинг!) — «📩 Новое сообщение от <a>username</a>» + `<blockquote>` pendingText + «🏷 Категория» + `<pre>` черновик («нажмите, чтобы скопировать»); inline-кнопки: URL `https://ig.me/m/{username}` и callback `send:{draftId}`. Оркестратор `src/lib/pipeline/deliver.ts`: `cancelPendingByConversation` (+ deleteMessage старой карточки, ошибки TG глотать) → sendMessage карточки → insert drafts(pending). `message_log`: входящее.
AC: vitest: HTML-инъекция в тексте клиента эскейпится; при существующем pending старая карточка удаляется и статус cancelled; draft_id в callback ≤64 байт.

**T-021 · Обработчик «✅ Отправить»**
Зависимости: T-013, T-020
Задача: в grammY: `callback_query` с data `send:{draftId}` → `answerCallbackQuery('Отправляю…')` → `claimPendingToSending`; null → editMessage «карточка устарела». Далее: re-fetch беседы; есть сообщение бизнеса с `created_time > trigger_ts` → status `skipped_manual`, editMessage «⚠️ Отменено: вы уже ответили вручную». Иначе `sendMessage` в IG → status `sent`, editMessage: карточка без кнопок + «✅ Отправлено HH:MM», `message_log(out)`, `usage_stats.drafts_sent++`. Ошибка IG → status `error`, editMessage с текстом ошибки и кнопкой «Повторить» (`retry:{draftId}`, error→pending→повтор сценария).
AC: vitest: двойной клик не шлёт дважды (второй claim = null); ручной ответ детектится; retry из error работает.

**T-022 · Обработчик echo**
Зависимости: T-016, T-020
Задача: `src/lib/pipeline/echo.ts`: echo-событие → найти pending по conversation_key → deleteMessage карточки (ошибки глотать) → status `cancelled` → `message_log(manual)`. Echo от собственной отправки бота (mid совпадает с только что отправленным) игнорировать через processed_events.
AC: vitest: pending отменяется; отсутствие pending — no-op; наш собственный echo не трогает свежесозданный следующий черновик.

---

### Эпик 5 — Категории и топики

**T-023 · UI управления категориями**
Зависимости: T-007, T-010
Задача: страница `/app/labels`: список, создание/редактирование/удаление (name, description — «когда применяется», instruction — «как отвечать»), drag-sort; «Без категории» нельзя удалить/переименовать. CRUD `/api/miniapp/labels`. Удаление метки → drafts.label_id NULL.
AC: CRUD работает; валидация уникальности имени; UI на i18n.

**T-024 ·  Топики в личном чате бота по категориям**
Зависимости: T-021, T-023
Задача: раскладка по топикам прямо в личном чате владельца (Bot API 9.3 — темы в приватных чатах, включаются в @BotFather; детект через `User.has_topics_enabled`). При создании категории в Mini App — `createForumTopic` в личном чате и сохранение `message_thread_id` в `labels.tg_thread_id`; доставка черновика метки — с её `message_thread_id`; топик «История» для лога отправленных. Любая ошибка топиков → fallback в General-топик без потери черновика. Отдельной группы нет.
AC: топик создаётся один раз на метку; при выключенных темах — плоская доставка как раньше; fallback работает.

---

### Эпик 6 — Тест-чат (симулятор)

**T-025 · Бэкенд симулятора**
Зависимости: T-018, T-019
Задача: `POST /api/miniapp/simulator/message`: виртуальная беседа в памяти запроса (клиент передаёт историю с фронта, stateless), прогон classify → draft тем же кодом пайплайна (без IG и без TG); ответ `{label, draft, usage}`. Лимит 30 сообщений/день на tenant (usage_stats).
AC: vitest: пайплайн-функции вызываются те же (по спаям), лимит срабатывает.

**T-026 · UI тест-чата**
Зависимости: T-006, T-025
Задача: страница `/app/simulator`: интерфейс мессенджера (пузыри «клиент» — ввод пользователя, «ассистент» — черновик с бейджем категории); typing-индикатор; кнопка «Начать заново»; подсказка «Так будут выглядеть черновики; в реальной работе вы подтверждаете отправку в Telegram».
AC: диалог из 5+ сообщений сохраняет контекст в рамках сессии; ошибки LLM показываются нефатально.

---

### Эпик 7 — Дашборд и настройки

**T-027 · Дашборд**
Зависимости: T-014, T-021
Задача: страница `/app` (главная): карточки за 7/30 дней — входящих диалогов, черновиков создано/отправлено/отменено, LLM-токены; статус подключения IG (из T-014) c кнопкой перехода; последние 10 записей message_log. `GET /api/miniapp/dashboard`.
AC: цифры сходятся с usage_stats/drafts в тестовых данных; пустое состояние с CTA на подключение.

**T-028 · Настройки + GDPR-действия**
Зависимости: T-010
Задача: страница `/app/settings`: редактирование базы знаний и system prompt (textarea + предпросмотр), язык интерфейса (ru/de), «Отключить Instagram» (удалить секреты, status), «Удалить все мои данные» (двойное подтверждение → каскадное удаление tenant и связанных строк, прощальное сообщение в TG). `DELETE /api/miniapp/tenant`.
AC: удаление стирает секреты и все строки тенанта (тест); повторный /start создаёт чистый tenant.

---

### Эпик 8 — Продакшен-готовность

**T-029 · Структурированное логирование и алерты**
Зависимости: T-021
Задача: `src/lib/log.ts` (pino): JSON-логи с `tenantId`, `conversationKey`, `requestId`; уровни; секреты редактируются. Критические ошибки пайплайна → сообщение админам (`ADMIN_TELEGRAM_IDS`) c троттлингом (не чаще 1/мин на тип). Заменить console.* по кодовой базе.
AC: grep не находит console.log в src; тест: токен в объекте лога маскируется.

**T-030 · Rate limiting и защита**
Зависимости: T-011, T-025
Задача: лимитер на Postgres (таблица `rate_limits`, скользящее окно): `/api/miniapp/*` — 60 rpm/tenant; simulator — из T-025; вебхук IG — 300 rpm/tenant (защита от штормов). Заголовки безопасности (CSP для Mini App, X-Frame-Options допускает Telegram WebView). Аудит: все роуты либо requireTenant, либо подпись (Meta/TG/cron).
AC: тест: превышение → 429; таблица чистится cron'ом.

**T-031 · E2E смоук-тест сценария**
Зависимости: T-022
Задача: vitest-интеграция «полный круг» с моками внешних API: вебхук входящего → карточка в TG (мок) → callback send → сообщение в IG (мок) → статусы/логи корректны; второй сценарий: echo отменяет черновик; третий: дубль вебхука игнорируется.
AC: все три сценария зелёные в CI; фикстуры payload вынесены в `/tests/fixtures`.

**T-032 · Деплой-документация и юридические страницы**
Зависимости: T-001…T-031
Задача: `docs/deploy.md`: пошагово GitHub → Supabase (EU) → Vercel (env, Fluid Compute, crons) → setup:telegram → чек-лист первого тенанта. Публичные страницы `/legal/impressum`, `/legal/datenschutz`, `/legal/avv` с шаблонами-заглушками (пометка «требует ревью юриста») — Datenschutz упоминает обработку переписки, LLM-провайдера, хостинг в ЕС. Ссылки из настроек Mini App.
AC: новый разработчик по docs/deploy.md разворачивает проект с нуля; страницы доступны без auth.

---

## 7. Порядок работы и определение готовности MVP

Критический путь: **T-001 → T-004 → T-005/T-007 → T-011 → T-013 → T-016…T-022** — после него продукт функционален end-to-end. Эпики 2, 6, 7 могут идти параллельно после T-008. T-024 — за скобки MVP.

MVP готов, когда: пилотный пользователь проходит онбординг в Mini App, подключает своё Meta App по визарду, диагностика зелёная, входящее сообщение из Instagram превращается в карточку в Telegram, кнопка «Отправить» доставляет ответ клиенту, ручной ответ отзывает черновик, а cron рефрешит токен.

Post-MVP бэклог (вне тикетов): Stripe-биллинг, центральный OAuth (`platform_app`) после App Review, канал Telegram-бизнес-аккаунтов для клиентов, WhatsApp Cloud API, автоотправка без подтверждения (per-label), веб-версия панели.
