# Исследование: подключение Instagram через Business Login (Instagram API with Instagram Login)

Дата исследования: 2026-07-07.
Вопрос: можно ли заменить текущий ручной онбординг (пользователь сам копирует access token,
app secret и настраивает webhook) на OAuth-вход «Business Login for Instagram» — кнопка в
Telegram Mini App → авторизация в Instagram → callback `/api/callback` в нашем приложении, —
добавляя пользователей тестировщиками Instagram в один (или несколько) Meta App.

---

## TL;DR — вывод

**Да, схема реализуема и именно так задумана Meta.** Business Login полностью убирает ручное
копирование токена: токен получает наш backend в callback-е, а webhook при этой схеме вообще
настраивается **один раз на всё приложение** (разработчиком), а не каждым пользователем.

Две существенные оговорки:

1. **Режим приложения.** В Development Mode вебхуки о сообщениях приходят только если
   *отправитель* сообщения — тестировщик приложения. Реальные клиенты, пишущие бизнесу в
   Direct, вебхук не вызовут. Решение: перевести Meta App в **Live Mode** — это делается
   тумблером без App Review. В Live Mode со Standard Access приложение обслуживает аккаунты,
   имеющие роль в приложении (наши тестировщики), — по документации Meta этого достаточно
   («Standard Access is available if your app serves Instagram professional accounts you own
   or manage **or have added to your app in the App Dashboard**»). Поведение Live + Standard
   Access для DM от произвольных отправителей на аккаунт тестировщика **обязательно проверить
   на пилоте** — в сообществе встречаются противоречивые отчёты (см. §6).
2. **Масштабирование.** Модель «каждый клиент — тестировщик» пригодна для пилота/ограниченного
   круга: каждого нужно вручную пригласить в App Dashboard, и он должен принять приглашение в
   Instagram. Для произвольных пользователей без ролей нужен App Review (Advanced Access) +
   Business Verification — одноразовая процедура (2–6 недель по отчётам сообщества), после
   которой тестировщики не нужны вовсе.

Подключение одного Mini App к **нескольким Meta App одновременно — возможно**, технических
запретов нет (§7).

---

## 1. Что такое Business Login for Instagram

Это OAuth 2.0-флоу «Instagram API with Instagram Login» (запущен в июле 2024): пользователь
входит **напрямую через Instagram** — Facebook-аккаунт и привязка Facebook Page **не
требуются**. Работает только с профессиональными аккаунтами Instagram (Business или Creator);
личные аккаунты доступа к API не имеют.

Флоу:

1. Пользователь нажимает кнопку/ссылку с authorize-URL (его же выдаёт App Dashboard в разделе
   «4. Set up business login» — это и есть Embed URL со скриншота).
2. Instagram показывает окно авторизации, пользователь выдаёт разрешения.
3. Instagram редиректит на наш `redirect_uri` с `?code=...`.
4. Backend меняет код на короткоживущий токен, затем на долгоживущий (60 дней).

### Endpoints (актуальные)

Окно авторизации:

```
https://www.instagram.com/oauth/authorize
  ?client_id={INSTAGRAM_APP_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope=instagram_business_basic,instagram_business_manage_messages
  &state={SIGNED_STATE}
```

- `client_id` — **Instagram App ID** из раздела продукта Instagram в App Dashboard (это
  отдельный ID, не совпадающий с общим Meta App ID).
- `redirect_uri` — должен быть HTTPS и **точно совпадать** с одним из URI, внесённых в
  «Business login settings» (наш `/api/callback`). Произвольные query-параметры добавлять
  нельзя — контекст передаётся через `state`.
- `state` — возвращается нетронутым; сюда кладём подписанную привязку к тенанту
  (tg user id / tenant id + CSRF-nonce).
- Embed URL из дашборда дополнительно содержит `enable_fb_login=0&force_authentication=1` —
  необязательные флаги (принудительный ввод логина/пароля вместо тихого SSO).

Обмен кода на короткоживущий токен (~1 час):

```
POST https://api.instagram.com/oauth/access_token
  client_id, client_secret (Instagram App Secret), grant_type=authorization_code,
  redirect_uri, code
→ { access_token, user_id, permissions }
```

Обмен на долгоживущий токен (60 дней):

```
GET https://graph.instagram.com/access_token
  ?grant_type=ig_exchange_token&client_secret={SECRET}&access_token={SHORT_LIVED}
```

Продление (токен должен быть старше 24 ч и не просрочен):

```
GET https://graph.instagram.com/refresh_access_token
  ?grant_type=ig_refresh_token&access_token={LONG_LIVED}
```

Профиль подключённого аккаунта (для отображения и маппинга вебхуков):

```
GET https://graph.instagram.com/v23.0/me?fields=user_id,username,account_type
```

### Scopes

С 27.01.2025 действуют только новые имена (старые `business_basic` и т.п. отключены):

| Scope | Что даёт |
|---|---|
| `instagram_business_basic` | профиль, медиа (обязательный, база) |
| `instagram_business_manage_messages` | приём и отправка Direct-сообщений — **ядро InstaReply** |
| `instagram_business_manage_comments` | комментарии (на будущее) |
| `instagram_business_content_publish` | публикация контента (не нужно) |
| `instagram_business_manage_insights` | статистика (не нужно) |

---

## 2. Пункты дашборда со скриншота — что настраивается один раз

Всё это делает **разработчик, один раз на Meta App** (пользователей не касается):

1. **Разрешения** — добавить нужные scopes (см. выше).
2. **Маркеры доступа** — ручная генерация токенов в дашборде нам больше не нужна: токены
   приходят через OAuth. Раздел полезен только для быстрых экспериментов.
3. **Webhooks** — задать **один** callback URL и verify token на всё приложение и подписаться
   на поле `messages` (объект Instagram). Пользователи вебхук не настраивают вообще.
4. **Business Login** — вписать наш `redirect_uri` (`/api/callback`), забрать Embed URL для
   кнопки. Именно этот пункт и предлагается использовать — да, это правильная точка входа.
5. **App Review** — нужен только для выхода за пределы аккаунтов с ролями (см. §6).

---

## 3. Что остаётся сделать пользователю (сравнение с текущим флоу)

| Шаг | Сейчас (ручной) | С Business Login |
|---|---|---|
| Создать/иметь профессиональный аккаунт IG | да | да (без изменений — требование API) |
| Получить и вставить access token | вручную, по инструкции | **автоматически** (OAuth callback) |
| Вставить app secret | вручную | **не нужно** (secret один, платформенный, в env) |
| Настроить webhook URL + verify token | вручную в чужом дашборде | **не нужно** (настроен один раз на приложение) |
| Принять приглашение Instagram-тестировщика | — | да, пока нет App Review: Instagram → Settings → Website permissions / Apps and Websites → Tester Invites |
| Разрешить доступ приложений к сообщениям | иногда | да: Instagram → Settings → Messages and story replies → Message controls → «Connected tools» / «Allow access to messages» (без этого DM-вебхуки не приходят) |
| Нажать кнопку в Mini App и подтвердить доступ | — | да (это и есть весь вход) |

Итого ручных действий у пользователя: принять приглашение тестировщика (временно, до App
Review), включить доступ к сообщениям в настройках Instagram, нажать кнопку. Токены и вебхуки
руками больше никто не копирует. Подтверждаю исходную гипотезу.

---

## 4. Вебхуки при Instagram Login — важное отличие от текущей архитектуры

- Callback URL **один на Meta App** (задаётся в дашборде), а не по URL на тенанта, как сейчас
  (`/api/wh/ig/{tenantId}`). Определять тенанта нужно по `entry[].id` в payload —
  это Instagram-scoped user id аккаунта-получателя; его надо сохранять при OAuth
  (`GET /me?fields=user_id`).
- Подпись: заголовок `X-Hub-Signature-256` = HMAC-SHA256 от raw body ключом **App Secret
  приложения** (одним на всех тенантов) — упрощение против текущего per-tenant secret.
- Верификация при настройке: стандартный `GET` c `hub.mode=subscribe`, `hub.verify_token`,
  `hub.challenge` — verify token тоже один, платформенный.
- После OAuth каждый подключённый аккаунт нужно программно подписать на события:

```
POST https://graph.instagram.com/v23.0/me/subscribed_apps
  ?subscribed_fields=messages&access_token={токен пользователя}
```

  Это делает backend в callback-е — пользователь не участвует.
- Endpoint должен отвечать 200 в пределах ~5 секунд; доставка "at-least-once" (нужна
  дедупликация — в проекте уже есть `processed_events`).

---

## 5. Токены: жизненный цикл

- Короткоживущий (~1 ч) → долгоживущий (60 дней) → продление через `ig_refresh_token`
  (не раньше чем через 24 ч после выдачи, до истечения).
- Существующий cron `GET /api/cron/refresh-tokens` ложится на эту схему без концептуальных
  изменений — меняется только endpoint продления.
- Если пользователь сменил пароль / отозвал доступ / токен истёк — нужен повторный вход
  (кнопка «Переподключить» в Mini App).

---

## 6. Режимы приложения, роли и App Review — главный подводный камень

Уровни доступа Instagram Platform:

- **Standard Access** — по умолчанию, **без App Review**. Официальная формулировка (страницы
  Overview / Messaging API): *«Standard Access is available if your app serves Instagram
  professional accounts you own or manage or have added to your app in the App Dashboard»* —
  т.е. модель «добавляю клиентов тестировщиками» прямо санкционирована документацией.
- **Advanced Access** — для обслуживания аккаунтов **без ролей** в приложении. Требует App
  Review (скринкаст использования каждого разрешения, рабочее демо) + Business Verification.
  По отчётам сообщества — 2–6 недель и часто не с первой попытки.

Режимы:

- **Development Mode**: API-вызовы работают только для аккаунтов с ролями; вебхуки о DM
  срабатывают **только если отправитель сообщения — тестировщик** (многочисленные независимые
  подтверждения: n8n community, Bubble forum, chatwoot issues). Для продукта это означает: в
  dev-режиме сообщения реальных клиентов до InstaReply не дойдут.
- **Live Mode**: включается тумблером без ревью (нужны Privacy Policy URL и т.п.). Разрешения
  без Advanced Access продолжают работать **только для аккаунтов с ролями** — что для модели
  «клиенты = тестировщики» и требуется.

⚠️ **Единственный пункт, который не удалось закрыть документацией на 100%**: приходят ли в
Live Mode + Standard Access вебхуки о DM, отправленных *произвольным* человеком (клиентом без
роли) на аккаунт тестировщика. Логика уровней доступа и формулировка про Standard Access
говорят «да» (событие принадлежит аккаунту-тестировщику); часть форумных отчётов о проблемах
сводится к незакрытым мелочам (не вызван `subscribed_apps`, выключен «Allow access to
messages», аккаунт не профессиональный), но есть и отчёты, где проблема не была разрешена.
Официальные страницы Meta недоступны для автоматической выгрузки (403), проверить дословно
не вышло. **Рекомендация: первым шагом реализации сделать пилот на одном тестовом аккаунте и
проверить именно этот сценарий** — до переделки основной архитектуры.

Прочие ограничения:

- Документированного жёсткого лимита на число Instagram-тестировщиков не найдено (ни в доках,
  ни в сообществе). Практический потолок — ручное приглашение/принятие. Для реального
  масштаба всё равно нужен App Review, после него роли не нужны.
- Rate limits messaging (справочно): отправка текста ~100/с; общий Platform-лимит вызовов
  считается от числа подключённых аккаунтов. Встречается упоминание лимита ~200 исходящих
  DM/час на аккаунт. На приём вебхуков лимитов нет.
- Окно ответа: 24 ч с последнего сообщения клиента (human agent — до 7 дней, отдельное
  разрешение через ревью). Уже учтено в модели продукта.

---

## 7. Несколько Meta App на один Mini App — возможно ли?

**Да.** Ни OAuth-флоу, ни вебхуки этому не препятствуют:

- Один и тот же `redirect_uri` (`https://<домен>/api/callback`) можно зарегистрировать в
  нескольких Meta App — списки разрешённых URI независимы, кросс-проверок между приложениями
  нет.
- Какому Meta App принадлежит вход, backend узнаёт из `state` (кладём туда `appKey` при
  генерации ссылки) и использует соответствующую пару `client_id`/`client_secret` для обмена
  кода.
- Вебхуки: у каждого Meta App свой callback URL — регистрируем разные пути, например
  `/api/wh/ig/app/{appKey}`, чтобы проверять подпись правильным App Secret (иначе пришлось бы
  перебирать секреты).
- Конфигурация — таблица/env-мэппинг: `appKey → { instagram_app_id, instagram_app_secret,
  verify_token }`; у тенанта хранится `app_key` + `ig_user_id`.

Зачем это может быть нужно:

| Сценарий | Комментарий |
|---|---|
| Dev/staging vs production | стандартная практика |
| «Sandbox»-приложение без ревью (тестировщики) + основное после App Review | плавная миграция на масштаб |
| Изоляция риска блокировки | бан одного приложения не кладёт всех клиентов |
| Обход лимита тестировщиков | лимит не документирован; запас на всякий случай |

Издержки: каждый App настраивается и проходит ревью отдельно; rate limits, режимы и статусы —
per-app; пользователь должен получить ссылку именно того приложения, в котором он тестировщик
(Mini App должен знать `appKey` тенанта заранее или давать выбор).

---

## 8. Последствия для текущей архитектуры InstaReply

Изменения относительно сегодняшнего кода (см. `app/api/miniapp/ig/connect/route.ts`,
`app/api/wh/ig/[tenantId]/route.ts`):

1. **Новый endpoint `GET /api/callback`** (лучше — `/api/ig/callback`): проверка `state`,
   обмен `code` → short-lived → long-lived, `GET /me` (username, `user_id`),
   `POST /me/subscribed_apps?subscribed_fields=messages`, сохранение соединения
   (`accessToken`, `ig_user_id`, `ig_username`, `status='connected'`), страница/редирект
   «Готово, вернитесь в Telegram» с deep-link `https://t.me/<bot>?startapp=...`.
2. **Генерация login-URL** в Mini App (`GET /api/miniapp/ig/login-url`): собираем authorize-URL
   с подписанным `state`. Открывать через `Telegram.WebApp.openLink()` (внешний браузер) —
   OAuth внутри webview Mini App может резаться; возврат — по deep-link со страницы callback.
3. **Webhook**: глобальный роут (per-app при мульти-app), маппинг тенанта по `entry[].id ==
   ig_user_id`; подпись — платформенным App Secret из env. Per-tenant `verify_token`/
   `app_secret` и URL `/api/wh/ig/{tenantId}` становятся не нужны (оставить на переходный
   период).
4. **Схема БД**: `ig_connections` + `ig_user_id` (индекс/unique), `app_key`; per-tenant
   `app_secret` — deprecated.
5. **Cron refresh**: заменить endpoint продления на `graph.instagram.com/refresh_access_token`.
6. **Env**: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `IG_WEBHOOK_VERIFY_TOKEN` (или мэппинг
   для нескольких приложений).

Ручной онбординг из T-012 можно оставить как fallback за фичефлагом.

---

## 9. Чеклист проверки на пилоте (перед переделкой)

1. Создать Meta App (тип Business) + продукт Instagram; вписать redirect URI; настроить
   webhook (`messages`), verify token.
2. Добавить свой профессиональный IG-аккаунт Instagram-тестировщиком, принять приглашение.
3. Пройти OAuth, получить long-lived токен, вызвать `subscribed_apps`.
4. Включить «Allow access to messages» в настройках Instagram аккаунта.
5. **Dev Mode**: написать в Direct с постороннего аккаунта → вебхук не придёт (ожидаемо);
   с аккаунта-тестировщика → придёт.
6. **Переключить в Live Mode**: написать с постороннего аккаунта → ключевая проверка §6.
   Если вебхук приходит — схема полностью рабочая без App Review для тестировщиков.
7. Отправить ответ через `POST /v23.0/me/messages` внутри 24-часового окна.

---

## Источники

Официальная документация Meta (страницы отдают 403 автоматическим клиентам — использованы
поисковая выдача с цитатами и независимые пересказы; при ручной проверке открывать в браузере):

- Business Login for Instagram — developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/
- Instagram API with Instagram Login (обзор) — developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- Messaging API — developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/
- Webhooks (Instagram Platform) — developers.facebook.com/docs/instagram-platform/webhooks
- App Review / Access Levels — developers.facebook.com/docs/instagram-platform/app-review/
- OAuth Authorize (reference) — developers.facebook.com/docs/instagram-platform/reference/oauth-authorize/

Практические руководства и отчёты сообщества:

- «Instagram Platform API (Instagram Direct Login) guide» — gist.github.com/PrenSJ2/0213e60e834e66b7e09f7f93999163fc
- «Instagram Official APIs — Comprehensive Reference (April 2026)» — gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42
- Chatwoot: Instagram via Instagram Business Login + Instagram App Review — developers.chatwoot.com
- n8n community: «Instagram DMs webhooks work only in test mode» — community.n8n.io/t/176851 (dev-mode ограничение отправителей)
- HORISEN BM: Instagram Channel Setup (роли и dev-mode ограничения) — developers.horisen.com
