import type { DecryptedIgConnection } from '../../src/lib/db/igConnections';
import { buildContext, deriveContext, type ConversationMessage } from '../../src/lib/pipeline/context';
import type { IgEvent } from '../../src/lib/pipeline/types';

function report(label: string, ok: boolean, detail?: string): void {
  const status = ok ? 'OK' : 'FAIL';
  console.log(`${status} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  report(label, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

async function main(): Promise<void> {
const igAccountId = 'business-1';
const contactId = 'client-1';
const baseMessages: ConversationMessage[] = [
  { text: 'Здравствуйте', fromId: contactId, createdTime: 1_000 },
  { text: 'Чем помочь?', fromId: igAccountId, createdTime: 2_000 },
  { text: 'Нужна запись', fromId: contactId, createdTime: 3_000 },
  { text: 'На завтра', fromId: contactId, createdTime: 4_000 },
];

const mixed = deriveContext(baseMessages, igAccountId, 'fallback');
assertEqual('[К, Б, К, К] -> pendingText два последних клиента', mixed.pendingText, 'Нужна запись\nНа завтра');
assertEqual('lastBusinessTs берётся из последнего сообщения бизнеса', mixed.lastBusinessTs, 2_000);
assertEqual(
  'история хронологична и содержит префиксы сторон',
  mixed.history,
  'Клиент: Здравствуйте\nБизнес: Чем помочь?\nКлиент: Нужна запись\nКлиент: На завтра',
);

const clientOnly = deriveContext(
  [
    { text: 'Первое', fromId: contactId, createdTime: 2_000 },
    { text: 'Второе', fromId: contactId, createdTime: 3_000 },
  ],
  igAccountId,
  'fallback',
);
assertEqual('бизнес не писал -> pendingText все сообщения клиента', clientOnly.pendingText, 'Первое\nВторое');
assertEqual('бизнес не писал -> lastBusinessTs=null', clientOnly.lastBusinessTs, null);

const businessLast = deriveContext(
  [
    { text: 'Клиент', fromId: contactId, createdTime: 1_000 },
    { text: 'Ответ бизнеса', fromId: igAccountId, createdTime: 2_000 },
  ],
  igAccountId,
  'гонка fallback',
);
assertEqual('последним писал бизнес -> pendingText fallbackText', businessLast.pendingText, 'гонка fallback');

const attachment = deriveContext(
  [{ text: '', fromId: contactId, createdTime: 1_000 }],
  igAccountId,
  'fallback',
);
assertEqual('пустой текст в истории -> [вложение]', attachment.history, 'Клиент: [вложение]');
assertEqual('пустой pendingText вложения -> [вложение]', attachment.pendingText, '[вложение]');

const conn = {
  accessToken: 'token',
  ig_account_id: igAccountId,
} as DecryptedIgConnection;
const ev: IgEvent = {
  kind: 'incoming',
  accountId: igAccountId,
  contactId,
  text: 'fallback from webhook',
  hasAttachments: false,
  mid: 'mid-1',
  ts: 5_000,
};

const built = await buildContext(conn, ev, {
  getUsername: async (token, igsid) => {
    assertEqual('buildContext передал token в getUsername', token, 'token');
    assertEqual('buildContext передал contactId в getUsername', igsid, contactId);
    return 'client_username';
  },
  getConversation: async (token, account, igsid, limit) => {
    assertEqual('buildContext передал token в getConversation', token, 'token');
    assertEqual('buildContext передал igAccountId в getConversation', account, igAccountId);
    assertEqual('buildContext передал contactId в getConversation', igsid, contactId);
    assertEqual('buildContext запросил limit=20', limit, 20);
    return [];
  },
});

assertEqual('пустая беседа -> username из Graph', built.username, 'client_username');
assertEqual('пустая беседа -> single-message fallback', built.messages.length, 1);
assertEqual('пустая беседа -> pendingText из webhook', built.pendingText, 'fallback from webhook');

if (process.exitCode) {
  throw new Error('T-017 manual demo failed');
}
console.log('OK T-017 demo completed');
}

void main();
