import { ProviderError, type ProviderDefinition } from "./types";

function encodeRaw(to: string, subject: string, body: string): string {
  const message = [
    `To: ${to}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const gmailProvider: ProviderDefinition = {
  type: "gmail",
  label: "Gmail",
  description:
    "Connect a Gmail account through Google OAuth to receive and reply to support email.",
  requiresOAuth: true,
  setupFields: [
    {
      key: "refreshToken",
      label: "OAuth refresh token",
      type: "password",
      required: true,
      hint: "Create an OAuth client in Google Cloud, authorize https://mail.google.com/ and paste the refresh token.",
    },
  ],
  docsUrl: "https://developers.google.com/gmail/api",
  async send({ connection, message }) {
    const refreshToken = connection.config.refreshToken as string | undefined;
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      return {
        status: "failed",
        error:
          "Gmail is not fully configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and provide a refresh token.",
      };
    }
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error_description?: string;
      };
      if (!tokenData.access_token) {
        throw new ProviderError(
          tokenData.error_description ?? "Gmail token refresh failed",
        );
      }

      const raw = encodeRaw(
        message.externalRecipientId,
        "Re: Support request",
        message.text,
      );
      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        },
      );
      const data = (await res.json()) as { id?: string; error?: { message: string } };
      if (!res.ok) {
        throw new ProviderError(data.error?.message ?? "Gmail send failed");
      }
      return { externalMessageId: data.id, status: "sent" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Gmail send failed",
      };
    }
  },
};

export const outlookProvider: ProviderDefinition = {
  type: "outlook",
  label: "Outlook / Microsoft 365",
  description:
    "Connect an Outlook mailbox through Microsoft Graph to receive and reply to email.",
  requiresOAuth: true,
  setupFields: [
    {
      key: "refreshToken",
      label: "OAuth refresh token",
      type: "password",
      required: true,
      hint: "Register an app in Azure AD with Mail.ReadWrite and Mail.Send, then paste a refresh token.",
    },
  ],
  docsUrl: "https://learn.microsoft.com/graph/api/resources/mail-api-overview",
  async send({ connection, message }) {
    const refreshToken = connection.config.refreshToken as string | undefined;
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      return {
        status: "failed",
        error:
          "Outlook is not fully configured. Set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET and provide a refresh token.",
      };
    }
    try {
      const tokenRes = await fetch(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            scope: "https://graph.microsoft.com/.default",
          }),
        },
      );
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        error_description?: string;
      };
      if (!tokenData.access_token) {
        throw new ProviderError(
          tokenData.error_description ?? "Outlook token refresh failed",
        );
      }

      const res = await fetch(
        "https://graph.microsoft.com/v1.0/me/sendMail",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              subject: "Re: Support request",
              body: { contentType: "Text", content: message.text },
              toRecipients: [
                { emailAddress: { address: message.externalRecipientId } },
              ],
            },
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new ProviderError(data.error?.message ?? "Outlook send failed");
      }
      return { externalMessageId: `outlook_${Date.now()}`, status: "sent" };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : "Outlook send failed",
      };
    }
  },
};
