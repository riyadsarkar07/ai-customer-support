export type OutboundMessage = {
  externalRecipientId: string;
  text: string;
  attachments?: Array<{ url: string; type: string; name: string }>;
};

export type SendResult = {
  externalMessageId?: string;
  status: "sent" | "failed" | "queued";
  error?: string;
};

export type InboundNormalized = {
  externalEventId?: string;
  externalConversationId: string;
  externalContactId: string;
  contactName?: string;
  contactEmail?: string;
  contactAvatar?: string;
  text: string;
  attachments?: Array<{ url: string; type: string; name: string }>;
  timestamp: Date;
  rawPayload: unknown;
  channelConnectionId: string;
  organizationId: string;
};

export type ProviderDefinition = {
  type:
    | "website"
    | "telegram"
    | "facebook"
    | "instagram"
    | "whatsapp"
    | "gmail"
    | "outlook";
  label: string;
  description: string;
  requiresOAuth: boolean;
  setupFields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url";
    required: boolean;
    hint?: string;
  }>;
  docsUrl?: string;
  send: (params: {
    connection: {
      accessToken: string | null;
      secret: string | null;
      externalId: string | null;
      config: Record<string, unknown>;
    };
    message: OutboundMessage;
  }) => Promise<SendResult>;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
