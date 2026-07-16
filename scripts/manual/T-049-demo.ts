process.env.TELEGRAM_BOT_TOKEN ??= 'dummy';
process.env.TELEGRAM_WEBHOOK_SECRET ??= 'dummy';
process.env.MINIAPP_JWT_SECRET ??= 'dummy';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32).toString('base64');
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY ??= 'dummy';
process.env.LLM_BASE_URL ??= 'https://llm.example.test';
process.env.LLM_API_KEY ??= 'dummy';
process.env.LLM_MODEL_CLASSIFY ??= 'dummy-classify';
process.env.LLM_MODEL_DRAFT ??= 'dummy-draft';
process.env.APP_BASE_URL ??= 'https://app.example.test';
process.env.CRON_SECRET ??= 'dummy';
process.env.ADMIN_TELEGRAM_IDS ??= '';

type ZernioPayload = {
  event: 'message.received' | 'message.sent';
  message: {
    conversationId: string;
    platform: string;
    platformMessageId: string;
    direction: 'incoming' | 'outgoing';
    text: string | null;
    attachments: Array<{ type?: string }>;
    sender: { id: string; username?: string };
    sentAt: string;
  };
  conversation: { participantId: string; participantUsername?: string };
  account: { accountId: string };
};

const account = {
  id: 'row-1',
  tenant_id: 'tenant-1',
  platform: 'instagram',
  zernio_profile_id: 'profile-1',
  zernio_account_id: 'zernio-account-1',
  username: 'business',
  status: 'active',
  connected_at: '2026-07-16T08:00:00.000Z',
  disconnect_reason: null,
  created_at: '2026-07-16T08:00:00.000Z',
} as const;

function payload(
  overrides: Partial<ZernioPayload['message']> = {},
  event: ZernioPayload['event'] = 'message.received',
): ZernioPayload {
  return {
    event,
    message: {
      conversationId: 'conversation-1',
      platform: 'instagram',
      platformMessageId: 'meta-mid-1',
      direction: event === 'message.sent' ? 'outgoing' : 'incoming',
      text: 'Здравствуйте, хочу записаться',
      attachments: [],
      sender: { id: 'client-1', username: 'client_from_message' },
      sentAt: '2026-07-16T10:00:00.000Z',
      ...overrides,
    },
    conversation: { participantId: 'client-1', participantUsername: 'client_from_conversation' },
    account: { accountId: 'zernio-account-1' },
  };
}

let failed = false;

function report(label: string, ok: boolean): void {
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}`);
  failed ||= !ok;
}

async function main(): Promise<void> {
  const { buildZernioContext } = await import('../../src/lib/zernio/context');
  const { handleZernioMessage } = await import('../../src/lib/zernio/handleMessage');
  const { mapZernioMessage } = await import('../../src/lib/zernio/mapEvent');
  const { deliverDraft } = await import('../../src/lib/pipeline/deliver');

  const incoming = payload();
  const mapped = mapZernioMessage(incoming);
  report('message.received маппится в incoming', mapped?.kind === 'incoming');
  report('accountId — стабильный ID аккаунта Zernio', mapped?.accountId === 'zernio-account-1');
  report('contactId берётся из conversation.participantId', mapped?.contactId === 'client-1');
  report('Meta mid сохранён для кросс-провайдерного дедупа', mapped?.mid === 'meta-mid-1');
  report('username из conversation имеет приоритет', mapped?.contactUsername === 'client_from_conversation');

  const attachment = mapZernioMessage(
    payload({ platformMessageId: 'meta-mid-attachment', text: null, attachments: [{}] }),
  );
  report('вложение без type маппится как unknown', attachment?.attachmentTypes[0] === 'unknown');
  report('вложение без текста остаётся входящим', attachment?.hasAttachments === true);
  report(
    'не-Instagram событие пропускается',
    mapZernioMessage(payload({ platform: 'facebook' })) === null,
  );
  report(
    'квитанция без текста и вложений пропускается',
    mapZernioMessage(payload({ text: null, attachments: [] })) === null,
  );

  const seenMids = new Set<string>();
  const decisions: string[] = [];
  const sharedDeps = {
    getAccount: async (accountId: string | null | undefined) =>
      accountId === account.zernio_account_id ? account : null,
    tryInsert: async (tenantId: string, mid: string) => {
      void tenantId;
      if (seenMids.has(mid)) return false;
      seenMids.add(mid);
      return true;
    },
    handleEcho: async (tenantId: string) => {
      void tenantId;
      decisions.push('echo');
    },
    handleIncoming: async (tenantId: string, event: { mid: string; provider?: string }) => {
      void tenantId;
      decisions.push(`incoming:${event.mid}:${event.provider}`);
    },
  };

  await handleZernioMessage(incoming, sharedDeps);
  report('входящее передано в общий pipeline', decisions.join(',') === 'incoming:meta-mid-1:zernio');

  await handleZernioMessage(incoming, sharedDeps);
  report('повтор same mid не создаёт второй pipeline-run', decisions.length === 1);

  await handleZernioMessage(payload({ platformMessageId: 'meta-mid-echo' }, 'message.sent'), sharedDeps);
  report('message.sent передан в общий handleEcho', decisions.at(-1) === 'echo');

  await handleZernioMessage(
    payload({ platformMessageId: 'meta-mid-repost', text: '', attachments: [{ type: 'share' }] }),
    sharedDeps,
  );
  report('чистый репост не создаёт черновик', !decisions.some((decision) => decision.includes('meta-mid-repost')));

  await handleZernioMessage(
    { ...payload({ platformMessageId: 'meta-mid-other' }), account: { accountId: 'foreign-account' } },
    sharedDeps,
  );
  report('чужой accountId не попадает в pipeline', !decisions.some((decision) => decision.includes('meta-mid-other')));

  const context = await buildZernioContext(account, mapped!, {
    getConversationMessages: async (conversationId, accountId, options) => {
      report('контекст запрашивает переписку Zernio', conversationId === 'conversation-1');
      report('контекст передаёт zernio account ID', accountId === 'zernio-account-1');
      report('контекст ограничивает историю 20 сообщениями', options?.limit === 20);
      return [
        {
          id: 'in-1',
          conversationId,
          accountId,
          platform: 'instagram',
          message: 'Первый вопрос',
          senderId: 'client-1',
          senderName: 'Клиент',
          direction: 'incoming',
          createdAt: '2026-07-16T09:00:00.000Z',
          attachments: [],
        },
        {
          id: 'out-1',
          conversationId,
          accountId,
          platform: 'instagram',
          message: 'Ответ бизнеса',
          senderId: 'any-sender-id',
          senderName: 'Бизнес',
          direction: 'outgoing',
          createdAt: '2026-07-16T09:01:00.000Z',
          attachments: [],
        },
      ];
    },
  });
  report('контекст использует username из вебхука', context.username === 'client_from_conversation');
  report('история размечает сторону business по direction', context.history.includes('Бизнес: Ответ бизнеса'));

  const inserted: Array<{ provider?: string; zernio_conversation_id?: string | null }> = [];
  await deliverDraft(
    {
      tenant: { id: 'tenant-1', tg_chat_id: 1001 } as never,
      conn: account,
      ev: mapped!,
      ctx: context,
      label: { id: 'label-1', name: 'Без категории' } as never,
      draftText: 'Подготовленный ответ',
    },
    {
      randomUUID: () => '00000000-0000-4000-8000-000000000049',
      cancelPendingByConversation: async () => null,
      ensureLabelTopic: async () => null,
      sendMessageHTML: async () => ({ message_id: 49 }),
      deleteMessageSafe: async () => undefined,
      insertPending: async (draft) => {
        inserted.push(draft);
        return draft as never;
      },
      logger: console,
    },
  );
  report('draft сохраняется с provider=zernio', inserted[0]?.provider === 'zernio');
  report(
    'draft сохраняет zernio_conversation_id',
    inserted[0]?.zernio_conversation_id === 'conversation-1',
  );

  if (failed) throw new Error('T-049 demo: одна или несколько проверок провалились');
  console.log('OK T-049 demo completed: все проверки прошли.');
}

void main();
