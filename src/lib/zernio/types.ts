export type ZernioAccount = {
  accountId: string;
  profileId: string;
  platform: string;
  username: string;
  displayName: string;
  isActive: boolean;
};

export type ZernioInboxMessage = {
  id: string;
  conversationId: string;
  accountId: string;
  platform: string;
  message: string;
  senderId: string;
  senderName: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
  attachments: Array<{ type: string; url: string }>;
};

export type ZernioWebhookSetting = {
  _id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastFiredAt?: string;
  failureCount?: number;
};
