import { ProviderError, type ProviderDefinition } from "./types";

const API = "https://api.telegram.org";

async function telegramSend(
  token: string,
  chatId: string,
  text: string,
): Promise<{ message_id: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (!res.ok || !data.ok) {
      throw new ProviderError(
        data.description ?? `Telegram error ${res.status}`,
        res.status === 429 || res.status >= 500,
      );
    }
    return data.result!;
  } finally {
    clearTimeout(timer);
  }
}

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function telegramGetMe(token: string): Promise<{
  id: number;
  username: string;
  first_name: string;
}> {
  const res = await fetch(`${API}/bot${token}/getMe`);
  const data = (await res.json()) as {
    ok: boolean;
    result?: { id: number; username: string; first_name: string };
    description?: string;
  };
  if (!res.ok || !data.ok || !data.result) {
    throw new ProviderError(
      data.description ?? "Invalid Telegram bot token",
      false,
    );
  }
  return data.result;
}

export const telegramProvider: ProviderDefinition = {
  type: "telegram",
  label: "Telegram",
  description:
    "Connect a Telegram bot to receive and answer direct messages automatically.",
  requiresOAuth: false,
  setupFields: [
    {
      key: "botToken",
      label: "Bot token",
      type: "password",
      required: true,
      hint: "Create a bot with @BotFather and paste the HTTP API token here.",
    },
  ],
  docsUrl: "https://core.telegram.org/bots/tutorial",
  async send({ connection, message }) {
    if (!connection.accessToken) {
      return { status: "failed", error: "Missing Telegram bot token" };
    }
    try {
      const result = await telegramSend(
        connection.accessToken,
        message.externalRecipientId,
        convertMarkdownToTelegram(message.text),
      );
      return { externalMessageId: String(result.message_id), status: "sent" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Telegram send failed",
      };
    }
  },
};

function convertMarkdownToTelegram(text: string): string {
  const escaped = escapeTelegramHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<i>$1</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export async function setTelegramWebhook(params: {
  token: string;
  url: string;
  secret: string;
}): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(`${API}/bot${params.token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: params.url,
      secret_token: params.secret,
      allowed_updates: ["message", "edited_message", "callback_query"],
    }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  return data;
}

export async function deleteTelegramWebhook(token: string): Promise<void> {
  await fetch(`${API}/bot${token}/deleteWebhook`).catch(() => undefined);
}
