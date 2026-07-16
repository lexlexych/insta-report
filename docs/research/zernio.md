# Research: Zernio — унифицированный API соцсетей и мессенджеров

> Дата исследования: 2026-07-16. Источники: https://docs.zernio.com, https://zernio.com/openapi.yaml
> (спецификация скачивалась и разбиралась целиком), https://zernio.com/llms.txt.
> Этот файл — обязательное чтение для implementer'ов тикетов эпика 12 (T-045…T-052).

## 1. Что такое Zernio

Zernio (https://zernio.com) — REST API-агрегатор для 15 платформ (Instagram, Facebook, WhatsApp,
Telegram, X/Twitter и др.): публикация постов, аналитика, реклама и — важное для нас —
**единый inbox для DM** (чтение переписок, отправка сообщений, вебхуки о входящих).

Ключевая ценность для InstaReply: **подключение Instagram-аккаунта идёт через Meta App самого
Zernio** (прошедший App Review, Advanced Access). Пользователю НЕ нужно быть тестировщиком нашего
Meta App → выпадают шаги «админ подтверждает ник» и «принять приглашение тестировщика».
Подключение = клик по кнопке → OAuth-экран Meta → готово.

Требование платформы: Instagram-аккаунт должен быть **Business** (Creator — под вопросом,
маркетинг Zernio говорит «Business only»; проверяется в пилоте).

## 2. Аутентификация и базовые понятия

- База API: `https://zernio.com/api` (все пути ниже — относительно неё, т.е. `/v1/...`).
- Авторизация: `Authorization: Bearer <ZERNIO_API_KEY>` на каждый запрос. API-ключ создаётся
  в дашборде Zernio (https://zernio.com/dashboard). Один ключ — один аккаунт Zernio (наш SaaS).
- **Profile** — именованная группа подключённых соцаккаунтов внутри аккаунта Zernio
  («workspace»). Для мультитенантности используем **один profile на тенанта**.
- **Account** — подключённый соцаккаунт (`accountId`, он же `_id`), принадлежит profile.
- Тарификация: первые 2 подключённых аккаунта бесплатно; для inbox-endpoints возможен
  «Inbox addon» (ответ 403 `Inbox addon required`) — проверить на нашем тарифе в пилоте.

## 3. Profiles

- `GET /v1/profiles` → `{ profiles: [{ _id, name, color, isDefault }] }`
- `POST /v1/profiles` body `{ name, description?, color? }` → 201
  `{ message, profile: { _id, userId, name, ... } }`. 403 — превышен лимит профилей плана.
- `DELETE /v1/profiles/{profileId}` — 400, если на профиле есть активные подключённые аккаунты
  (сначала отключить их).

## 4. Подключение аккаунта (OAuth connect flow)

1. `GET /v1/connect/{platform}?profileId=<id>&redirect_url=<url>` (Bearer) →
   `{ authUrl, state }`. `platform` для нас — `instagram`.
2. Пользователя отправляем на `authUrl` (экран авторизации Meta, хостится через Meta App Zernio).
3. После успешной авторизации Zernio сам создаёт account и редиректит пользователя на наш
   `redirect_url`. **Параметры результата ДОПИСЫВАЮТСЯ к redirect_url через URL API — уже
   существующая query string сохраняется** (можно класть свой подписанный state прямо в
   redirect_url). Standard mode дописывает: `connected={platform}&profileId=X&accountId=Y&username=Z`.
4. Instagram НЕ требует «вторичного выбора» (страницы/организации), поэтому standard mode
   (без `headless=true`) достаточно: аккаунт создаётся сразу, редирект содержит `accountId`.
5. Параллельно (belt-and-braces) прилетает вебхук `account.connected` (см. §7).

Замечания:
- `redirect_url` принимает http(s), кастомные схемы приложений и относительные пути.
- Форма редиректа при отказе пользователя/ошибке OAuth в спецификации НЕ зафиксирована
  (redirect без `accountId` считать неуспехом). Уточнить в пилоте; поддержка: miki@zernio.com.
- OAuth-scopes запрашиваются Zernio все сразу (`instagram_business_basic`,
  `instagram_business_manage_messages`, `..._content_publish`, `..._manage_comments`,
  `..._manage_insights`) — по отдельности выбрать нельзя.
- Токены Meta живут у Zernio, их refresh — забота Zernio. Протухание → вебхук
  `account.disconnected` c `disconnectionType: 'unintentional'`.

## 5. Accounts

- `GET /v1/accounts?profileId=&platform=&status=connected|disconnected` →
  `{ accounts: [{ _id, platform, profileId: {_id, name, slug}, username, displayName,
  profileUrl, isActive }] }`. Внимание: `profileId` в ответе — populated-объект.
- `GET /v1/accounts/{accountId}/health` — фактические (granted) права аккаунта, живость токена.
- `DELETE /v1/accounts/{accountId}` — отключение.

## 6. Inbox: переписки и сообщения

- `GET /v1/inbox/conversations?profileId=&platform=instagram&accountId=&limit=&cursor=` →
  `{ data: [{ id, platform, accountId, accountUsername, participantId, participantName,
  participantPicture, lastMessage, updatedTime, status, unreadCount, instagramProfile:
  { isFollower, isFollowing, followerCount, isVerified, fetchedAt } }], pagination:
  { hasMore, nextCursor }, meta }`. 403 — Inbox addon required.
- `GET /v1/inbox/conversations/{conversationId}/messages?accountId=<req>&limit=&cursor=&sortOrder=asc|desc`
  → `{ messages: [{ id, conversationId, accountId, platform, message, senderId, senderName,
  direction: 'incoming'|'outgoing', createdAt, attachments: [{ id, type, url, ... }],
  storyReply?, isStoryMention?, deliveryStatus?, ... }], pagination, sortOrderApplied }`.
  Instagram честно поддерживает sortOrder на курсорных страницах. Endpoint read-only
  (read-receipts НЕ шлёт).
- **Отправка**: `POST /v1/inbox/conversations/{conversationId}/messages`
  body `{ accountId, message, attachmentUrl?, attachmentType?, quickReplies?, buttons?,
  messagingType?, messageTag? }` → `{ success, data: { messageId } }`.
  - `conversationId` — поле `id` из list conversations / `message.conversationId` вебхука.
  - Окно 24 часа Meta действует. Вне окна: `messagingType: 'MESSAGE_TAG'` +
    `messageTag: 'HUMAN_AGENT'` (для Instagram допустим только HUMAN_AGENT).
  - Ошибка платформенных ограничений → 400 `{ code: 'PLATFORM_LIMITATION' }`.
- `POST /v1/inbox/conversations/{conversationId}/read` — пометить прочитанным (по желанию).
- `POST /v1/inbox/conversations` (create conversation) для Instagram НЕ поддерживается
  (только X/Bluesky/Reddit/WhatsApp) — первым всегда пишет клиент, нам этого достаточно.

## 7. Вебхуки

- Настройка: `POST /v1/webhooks/settings` body `{ name (≤50), url, secret?, events: [...],
  isActive?, customHeaders? }`; `GET` — список `{ webhooks: [{ _id, name, url, events,
  isActive, lastFiredAt, failureCount }] }`; `PUT` body `{ _id, ...патч }`; `DELETE ?id=`.
  Максимум 10 вебхуков на аккаунт Zernio. **Вебхук ГЛОБАЛЬНЫЙ (на весь наш аккаунт Zernio),
  не per-profile** → один endpoint на весь SaaS, тенанта определяем по payload
  (`account.profileId` / `account.accountId`).
- Интересующие события: `message.received`, `message.sent`, `account.connected`,
  `account.disconnected` (полный enum в спеке шире: post.*, comment.received, message.read и др.).
- Подпись: заголовок `X-Zernio-Signature` = lowercase hex HMAC-SHA256 от **raw body**, ключ —
  `secret` из настройки вебхука. Заголовок `X-Zernio-Event-Id` дублирует `id` payload'а.
- Доставка: успех = 2xx **в течение 5 секунд** → отвечать сразу, обрабатывать асинхронно.
  Ретраи: экспоненциально, до 7 попыток (~51 час), семантика **at-least-once** (дубликаты
  возможны — дедуплицировать по event `id`/`platformMessageId`). После 10 подряд ошибок
  вебхук автоматически ОТКЛЮЧАЕТСЯ (isActive=false) — мониторить.
- Тест: `POST /v1/webhooks/test`; логи доставки: `GET /v1/webhooks/logs?event=`.

### Payload `message.received` (и `message.sent` — та же форма)

```jsonc
{
  "id": "<uuid — стабильный ID события>",
  "event": "message.received",
  "timestamp": "2026-07-16T09:00:00Z",
  "message": {
    "id": "<внутренний ID сообщения Zernio>",
    "conversationId": "<внутренний ID переписки — им же шлём ответ>",
    "platform": "instagram",
    "platformMessageId": "<mid Meta — тот же namespace, что в прямой интеграции!>",
    "direction": "incoming",            // incoming | outgoing
    "text": "Привет!",                  // может быть null
    "attachments": [{ "type": "image", "url": "https://...", "payload": {} }],
    "sender": {
      "id": "<IGSID отправителя>",
      "name": "...", "username": "...", "picture": "...",
      "instagramProfile": { "isFollower": true, "followerCount": 120, "isVerified": false }
    },
    "sentAt": "2026-07-16T09:00:00Z",
    "isRead": false
  },
  "conversation": {
    "id": "<тот же conversationId>",
    "platformConversationId": "<ID переписки на стороне Meta>",
    "participantId": "<IGSID клиента>",
    "participantName": "...", "participantUsername": "...", "participantPicture": "...",
    "status": "active"
  },
  "account": {
    "id": "<zernio accountId>",
    "accountId": "<тот же — канонично>",
    "profileId": "<zernio profileId — наш ключ к тенанту>",
    "platform": "instagram",
    "username": "<ig username бизнеса>",
    "displayName": "..."
  },
  "metadata": null                       // quickReplyPayload/postbackPayload при кнопках
}
```

Payload `account.connected`: `{ id, event, account: { accountId, profileId, platform,
username, displayName }, timestamp }`.
Payload `account.disconnected`: то же + `disconnectionType: 'intentional'|'unintentional'`,
`reason: string`.

## 8. Следствия для архитектуры InstaReply

1. **Дедупликация между провайдерами бесплатно**: `message.platformMessageId` — это mid Meta,
   тот же, что приходит в прямой вебхук `/api/wh/ig`. Наш `processed_events (tenant_id,
   event_mid)` автоматически гасит двойную обработку, если тенант подключил и Meta-директ,
   и Zernio на один IG-аккаунт.
2. **Echo-паттерн сохраняется**: `direction: 'outgoing'` (событие `message.sent`) — аналог
   Meta-echo; собственные отправки гасим предварительной регистрацией `messageId` ответа
   send-endpoint'а в `processed_events` (как сейчас делает `attemptSend` с `mids`).
3. Для отправки ответа нужен `conversationId` → хранить его в `drafts`.
4. История беседы — `GET .../messages` (замена `getConversation` из Graph API), username
   клиента приходит прямо в вебхуке (`conversation.participantUsername`) — отдельный вызов
   не нужен.
5. Ключ тенанта при входящем — `account.profileId` (или `account.accountId`); заводим
   таблицу-реестр `zernio_accounts`.

## 9. Открытые вопросы (проверить в пилоте, до массового включения)

1. Форма redirect'а при отказе пользователя на OAuth-экране (какие параметры дописываются).
2. Шлёт ли Zernio `message.sent` для ответов, отправленных владельцем вручную из приложения
   Instagram (аналог Meta-echo) — критично для сценария T-022. Ожидание: да (Zernio сам
   подписан на echo Meta). Если нет — ручные ответы гасить только по anti-double-check
   перед отправкой.
3. Нужен ли Inbox addon на нашем тарифе; лимиты запросов inbox-endpoints.
4. Business vs Creator аккаунты Instagram.
5. Латентность `message.received` относительно прямого вебхука Meta.
6. Лимит профилей текущего плана Zernio (403 на `POST /v1/profiles` при превышении).

Контакт поддержки: miki@zernio.com. Статус сервиса: https://status.zernio.com.
