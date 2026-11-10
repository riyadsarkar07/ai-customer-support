import { ProviderError, type ProviderDefinition } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(path: string, token: string, body: object) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as Record<string, unknown> & {
      error?: { message?: string; code?: number };
    };
    if (!res.ok || data.error) {
      throw new ProviderError(
        data.error?.message ?? `Meta API error ${res.status}`,
        res.status === 429 || res.status >= 500,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const facebookProvider: ProviderDefinition = {
  type: "facebook",
  label: "Facebook Messenger",
  description:
    "Connect a Facebook Page to receive Messenger DMs and reply through the official Graph API.",
  requiresOAuth: true,
  setupFields: [
    {
      key: "pageId",
      label: "Page ID",
      type: "text",
      required: true,
    },
    {
      key: "pageAccessToken",
      label: "Page access token",
      type: "password",
      required: true,
      hint: "Generate a long-lived Page access token in Meta for Developers with pages_messaging permission.",
    },
  ],
  docsUrl: "https://developers.facebook.com/docs/messenger-platform",
  async send({ connection, message }) {
    if (!connection.accessToken) {
      return { status: "failed", error: "Missing Page access token" };
    }
    try {
      const result = (await graphPost("/me/messages", connection.accessToken, {
        recipient: { id: message.externalRecipientId },
        messaging_type: "RESPONSE",
        message: { text: message.text },
      })) as { message_id?: string };
      return {
        externalMessageId: result.message_id,
        status: "sent",
      };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Facebook send failed",
      };
    }
  },
};

export const instagramProvider: ProviderDefinition = {
  type: "instagram",
  label: "Instagram Business DMs",
  description:
    "Connect an Instagram Business account to handle DMs in the unified inbox.",
  requiresOAuth: true,
  setupFields: [
    {
      key: "igAccountId",
      label: "Instagram Account ID",
      type: "text",
      required: true,
    },
    {
      key: "pageAccessToken",
      label: "Page access token",
      type: "password",
      required: true,
      hint: "Use a Page access token linked to the Instagram Business account with instagram_manage_messages.",
    },
  ],
  docsUrl: "https://developers.facebook.com/docs/instagram-platform",
  async send({ connection, message }) {
    if (!connection.accessToken) {
      return { status: "failed", error: "Missing access token" };
    }
    try {
      const result = (await graphPost(
        "/me/messages",
        connection.accessToken,
        {
          recipient: { id: message.externalRecipientId },
          message: { text: message.text },
        },
      )) as { message_id?: string };
      return { externalMessageId: result.message_id, status: "sent" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Instagram send failed",
      };
    }
  },
};

export const whatsappProvider: ProviderDefinition = {
  type: "whatsapp",
  label: "WhatsApp Business (Cloud API)",
  description:
    "Use the official WhatsApp Cloud API to send and receive messages. 24-hour reply windows apply.",
  requiresOAuth: true,
  setupFields: [
    {
      key: "phoneNumberId",
      label: "Phone number ID",
      type: "text",
      required: true,
    },
    {
      key: "accessToken",
      label: "Permanent access token",
      type: "password",
      required: true,
    },
  ],
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  async send({ connection, message }) {
    if (!connection.accessToken || !connection.externalId) {
      return {
        status: "failed",
        error: "Missing WhatsApp phone number ID or access token",
      };
    }
    try {
      const result = (await graphPost(
        `/${connection.externalId}/messages`,
        connection.accessToken,
        {
          messaging_product: "whatsapp",
          to: message.externalRecipientId,
          type: "text",
          text: { body: message.text },
        },
      )) as { messages?: Array<{ id: string }> };
      return {
        externalMessageId: result.messages?.[0]?.id,
        status: "sent",
      };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "WhatsApp send failed",
      };
    }
  },
};
