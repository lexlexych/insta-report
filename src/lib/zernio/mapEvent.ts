import { z } from 'zod';

import type { IgEvent } from '@/lib/pipeline/types';

const attachmentSchema = z
  .object({ type: z.string().trim().min(1).optional() })
  .passthrough();

const zernioMessageSchema = z
  .object({
    conversationId: z.string().trim().min(1),
    platform: z.string().trim().min(1),
    platformMessageId: z.string().trim().min(1).optional(),
    direction: z.enum(['incoming', 'outgoing']),
    text: z.string().nullable().optional(),
    attachments: z.array(attachmentSchema).optional(),
    sender: z
      .object({ id: z.string().trim().min(1).optional(), username: z.string().trim().min(1).nullable().optional() })
      .passthrough()
      .optional(),
    sentAt: z.string().optional(),
  })
  .passthrough();

const zernioMessagePayloadSchema = z
  .object({
    message: zernioMessageSchema,
    conversation: z
      .object({
        participantId: z.string().trim().min(1).optional(),
        participantUsername: z.string().trim().min(1).nullable().optional(),
      })
      .passthrough(),
    account: z
      .object({ accountId: z.string().trim().min(1) })
      .passthrough(),
  })
  .passthrough();

export type ZernioPipelineEvent = IgEvent & {
  provider: 'zernio';
  zernioConversationId: string;
  zernioAccountId: string;
  contactUsername: string | null;
};

function logIgnored(reason: string): void {
  console.debug(`[zernio/message] ignored: ${reason}`);
}

/**
 * Приводит message.received/message.sent Zernio к общему формату pipeline.
 * Meta mid сохраняется без изменений: это общий namespace для дедупликации обоих провайдеров.
 */
export function mapZernioMessage(payload: unknown): ZernioPipelineEvent | null {
  const parsed = zernioMessagePayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logIgnored('payload has no complete message, conversation, or account');
    return null;
  }

  const { account, conversation, message } = parsed.data;
  if (message.platform.toLowerCase() !== 'instagram') {
    logIgnored(`unsupported platform=${message.platform}`);
    return null;
  }
  if (!message.platformMessageId) {
    logIgnored('platformMessageId is missing');
    return null;
  }

  const text = message.text ?? '';
  const attachments = message.attachments ?? [];
  if (!text && attachments.length === 0) {
    logIgnored('message has neither text nor attachments');
    return null;
  }

  const contactId = conversation.participantId ?? (message.direction === 'incoming' ? message.sender?.id : undefined);
  if (!contactId) {
    logIgnored('contact ID is missing');
    return null;
  }

  const parsedTimestamp = message.sentAt ? Date.parse(message.sentAt) : Number.NaN;
  return {
    kind: message.direction === 'incoming' ? 'incoming' : 'echo',
    accountId: account.accountId,
    contactId,
    text,
    hasAttachments: attachments.length > 0,
    attachmentTypes: attachments.map((attachment) => attachment.type ?? 'unknown'),
    mid: message.platformMessageId,
    ts: Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now(),
    provider: 'zernio',
    zernioConversationId: message.conversationId,
    zernioAccountId: account.accountId,
    contactUsername: conversation.participantUsername ?? message.sender?.username ?? null,
  };
}
