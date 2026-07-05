import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { handleIgEvent, type HandleIgEventDeps } from '../../src/lib/pipeline/handleIgEvent';
import { parseIgEvent } from '../../src/lib/pipeline/parse';
import type { IgEvent } from '../../src/lib/pipeline/types';

/**
 * Прогоняет parseIgEvent на фикстурах tests/fixtures/ig/*.json и диспетчеризацию
 * handleIgEvent (со шпионами вместо реальной БД/обработчиков) — без env/сервера/БД.
 *
 *   pnpm tsx scripts/manual/T-016-demo.ts
 */

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../tests/fixtures/ig/${name}`, import.meta.url)), 'utf8'),
  );
}

let failed = false;

function report(label: string, ok: boolean, extra?: string): void {
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label}${extra ? ` (${extra})` : ''}`);
  failed ||= !ok;
}

interface Spies {
  deps: Partial<HandleIgEventDeps>;
  tryInsertCalls: Array<{ tenantId: string; mid: string }>;
  echoCalls: IgEvent[];
  incomingCalls: IgEvent[];
}

function createSpies(tryInsertResult: boolean): Spies {
  const tryInsertCalls: Array<{ tenantId: string; mid: string }> = [];
  const echoCalls: IgEvent[] = [];
  const incomingCalls: IgEvent[] = [];
  const deps: Partial<HandleIgEventDeps> = {
    tryInsert: async (tenantId, mid) => {
      tryInsertCalls.push({ tenantId, mid });
      return tryInsertResult;
    },
    handleEcho: async (tenantId, ev) => {
      void tenantId;
      echoCalls.push(ev);
    },
    handleIncoming: async (tenantId, ev) => {
      void tenantId;
      incomingCalls.push(ev);
    },
  };
  return { deps, tryInsertCalls, echoCalls, incomingCalls };
}

async function main(): Promise<void> {
  // ---------------------------------------------------------------------
  // Блок A — parseIgEvent на фикстурах
  // ---------------------------------------------------------------------
  const incomingText = loadFixture('incoming_text.json');
  const echo = loadFixture('echo.json');
  const attachmentOnly = loadFixture('attachment_only.json');
  const readEvent = loadFixture('read_event.json');

  const incomingEv = parseIgEvent(incomingText);
  report('incoming_text -> kind=incoming', incomingEv?.kind === 'incoming');
  report('incoming_text -> accountId=business', incomingEv?.accountId === '17841400000000001');
  report('incoming_text -> contactId=client', incomingEv?.contactId === '9988776655');
  report('incoming_text -> text не пуст', !!incomingEv && incomingEv.text.length > 0);
  report('incoming_text -> hasAttachments=false', incomingEv?.hasAttachments === false);
  report('incoming_text -> mid не пуст', !!incomingEv && incomingEv.mid.length > 0);
  report('incoming_text -> ts число', typeof incomingEv?.ts === 'number');

  const echoEv = parseIgEvent(echo);
  report('echo -> kind=echo', echoEv?.kind === 'echo');
  report('echo -> accountId=sender (стороны развёрнуты)', echoEv?.accountId === '17841400000000001');
  report('echo -> contactId=recipient (стороны развёрнуты)', echoEv?.contactId === '9988776655');
  report('echo -> hasAttachments=false', echoEv?.hasAttachments === false);

  const attachmentEv = parseIgEvent(attachmentOnly);
  report('attachment_only -> kind=incoming', attachmentEv?.kind === 'incoming');
  report('attachment_only -> text=""', attachmentEv?.text === '');
  report('attachment_only -> hasAttachments=true', attachmentEv?.hasAttachments === true);

  const readEv = parseIgEvent(readEvent);
  report('read_event -> null (нет message)', readEv === null);

  const garbageCases: Array<{ label: string; body: unknown }> = [
    { label: '{}', body: {} },
    { label: 'null', body: null },
    { label: "'nope'", body: 'nope' },
    { label: "{ object: 'page', entry: [] }", body: { object: 'page', entry: [] } },
    {
      label: "{ object: 'instagram', entry: [{ id: 'x', time: 1, messaging: [] }] }",
      body: { object: 'instagram', entry: [{ id: 'x', time: 1, messaging: [] }] },
    },
  ];
  for (const { label, body } of garbageCases) {
    report(`мусор ${label} -> null`, parseIgEvent(body) === null);
  }

  // ---------------------------------------------------------------------
  // Блок B — диспетчеризация handleIgEvent (шпионы вместо реальной БД)
  // ---------------------------------------------------------------------

  // Мусорное тело: parse=null → до tryInsert/handlers дело не доходит.
  const garbageSpies = createSpies(true);
  await handleIgEvent('tenant-1', {}, garbageSpies.deps);
  report('мусор -> tryInsert не вызван', garbageSpies.tryInsertCalls.length === 0);
  report('мусор -> handleIncoming не вызван', garbageSpies.incomingCalls.length === 0);
  report('мусор -> handleEcho не вызван', garbageSpies.echoCalls.length === 0);

  // Дубликат mid: tryInsert=false → обработчики не вызываются.
  const duplicateSpies = createSpies(false);
  await handleIgEvent('tenant-1', incomingText, duplicateSpies.deps);
  report('дубликат mid -> tryInsert вызван 1 раз', duplicateSpies.tryInsertCalls.length === 1);
  report('дубликат mid -> handleIncoming не вызван', duplicateSpies.incomingCalls.length === 0);
  report('дубликат mid -> handleEcho не вызван', duplicateSpies.echoCalls.length === 0);

  // Входящее сообщение: диспетчеризация в handleIncoming.
  const incomingSpies = createSpies(true);
  await handleIgEvent('tenant-1', incomingText, incomingSpies.deps);
  report('входящее -> handleIncoming вызван 1 раз', incomingSpies.incomingCalls.length === 1);
  report(
    'входящее -> ev.mid совпадает с фикстурой',
    incomingSpies.incomingCalls[0]?.mid === incomingEv?.mid,
  );
  report('входящее -> handleEcho не вызван', incomingSpies.echoCalls.length === 0);

  // Echo: диспетчеризация в handleEcho.
  const echoSpies = createSpies(true);
  await handleIgEvent('tenant-1', echo, echoSpies.deps);
  report('echo -> handleEcho вызван 1 раз', echoSpies.echoCalls.length === 1);
  report('echo -> handleIncoming не вызван', echoSpies.incomingCalls.length === 0);

  // Пустое входящее (message с mid, без text и attachments) — тихий игнор после tryInsert.
  const emptyIncomingBody = {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000001',
        time: 1719950400000,
        messaging: [
          {
            sender: { id: '9988776655' },
            recipient: { id: '17841400000000001' },
            timestamp: 1719950400000,
            message: { mid: 'aWdfZG1fZW1wdHlfMDAx' },
          },
        ],
      },
    ],
  };
  const emptySpies = createSpies(true);
  await handleIgEvent('tenant-1', emptyIncomingBody, emptySpies.deps);
  report('пустое входящее -> tryInsert вызван 1 раз', emptySpies.tryInsertCalls.length === 1);
  report('пустое входящее -> handleIncoming не вызван', emptySpies.incomingCalls.length === 0);
  report('пустое входящее -> handleEcho не вызван', emptySpies.echoCalls.length === 0);

  if (failed) {
    throw new Error('T-016 demo: одна или несколько проверок провалились, см. вывод выше');
  }
  console.log('T-016 demo completed: все проверки прошли.');
}

main().catch((error: unknown) => {
  console.error('T-016 FAILED:', error);
  process.exitCode = 1;
});
