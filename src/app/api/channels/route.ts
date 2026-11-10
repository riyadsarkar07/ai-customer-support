import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channelConnections } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission, ValidationError } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { providerCatalog } from "@/lib/channels/registry";
import { enforceChannelLimit } from "@/lib/tenant";
import { audit } from "@/lib/api/audit";
import { maskSecret, encryptSecret, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);

    const rows = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.organizationId, ctx.organization.id));

    const channels = rows.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      status: c.status,
      externalId: c.externalId,
      aiEnabled: c.aiEnabled,
      lastError: c.lastError,
      lastEventAt: c.lastEventAt,
      createdAt: c.createdAt,
      publicKey:
        c.type === "website"
          ? ((c.config as Record<string, unknown>).publicKey as string | undefined)
          : undefined,
      allowedOrigins:
        c.type === "website"
          ? ((c.config as Record<string, unknown>).allowedOrigins as string | undefined)
          : undefined,
      hasToken: Boolean(c.accessToken),
      tokenPreview: maskSecret(c.accessToken),
      config: sanitizeConfig(c.type, c.config as Record<string, unknown>),
    }));

    return NextResponse.json({
      channels,
      catalog: providerCatalog(),
      appUrl: env.APP_URL,
      webhookSecrets: {
        telegramConfigured: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function sanitizeConfig(
  type: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const clone = { ...config };
  delete clone.publicKey;
  if (type === "gmail" || type === "outlook") {
    if (clone.refreshToken) clone.refreshToken = "••••••••";
  }
  return clone;
}

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "channel.manage");

    const body = (await req.json().catch(() => null)) as {
      type?: string;
      name?: string;
      botToken?: string;
      allowedOrigins?: string;
      pageId?: string;
      pageAccessToken?: string;
      igAccountId?: string;
      phoneNumberId?: string;
      accessToken?: string;
      refreshToken?: string;
    } | null;

    if (!body?.type) throw new ValidationError("Channel type is required");

    await enforceChannelLimit(ctx.organization.id);

    const name = body.name?.trim() || body.type;
    const type = body.type;

    if (type === "telegram") {
      if (!body.botToken) throw new ValidationError("Bot token is required");
      const { telegramGetMe, setTelegramWebhook } = await import(
        "@/lib/channels/telegram"
      );
      const me = await telegramGetMe(body.botToken);
      const existing = await db
        .select({ id: channelConnections.id })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.organizationId, ctx.organization.id),
            eq(channelConnections.type, "telegram"),
            eq(channelConnections.externalId, String(me.id)),
          ),
        )
        .limit(1);
      if (existing[0]) {
        throw new ValidationError("This Telegram bot is already connected");
      }

      const secret = randomToken(24);
      const [channel] = await db
        .insert(channelConnections)
        .values({
          organizationId: ctx.organization.id,
          type: "telegram",
          name: name || `@${me.username}`,
          status: "connected",
          externalId: String(me.id),
          accessToken: encryptSecret(body.botToken),
          secret: encryptSecret(secret),
          config: { username: me.username },
          createdBy: ctx.user.id,
        })
        .returning();

      await setTelegramWebhook({
        token: body.botToken,
        url: `${env.APP_URL}/api/webhooks/telegram/${channel!.id}`,
        secret,
      });

      await audit({
        organizationId: ctx.organization.id,
        actorId: ctx.user.id,
        action: "channel.connect",
        resourceType: "channel",
        resourceId: channel!.id,
        metadata: { type },
      });

      return NextResponse.json(
        {
          channel: {
            id: channel!.id,
            name: channel!.name,
            type: channel!.type,
            status: channel!.status,
          },
        },
        { status: 201 },
      );
    }

    if (type === "website") {
      const publicKey = `spk_${randomToken(18)}`;
      const [channel] = await db
        .insert(channelConnections)
        .values({
          organizationId: ctx.organization.id,
          type: "website",
          name: name || "Website Chat",
          status: "connected",
          externalId: publicKey,
          config: {
            publicKey,
            allowedOrigins: body.allowedOrigins ?? "",
          },
          createdBy: ctx.user.id,
        })
        .returning();

      await audit({
        organizationId: ctx.organization.id,
        actorId: ctx.user.id,
        action: "channel.connect",
        resourceType: "channel",
        resourceId: channel!.id,
        metadata: { type },
      });

      return NextResponse.json(
        {
          channel: {
            id: channel!.id,
            name: channel!.name,
            type: channel!.type,
            status: channel!.status,
            publicKey,
          },
        },
        { status: 201 },
      );
    }

    if (type === "facebook" || type === "instagram" || type === "whatsapp") {
      const externalId =
        type === "facebook"
          ? body.pageId
          : type === "instagram"
            ? body.igAccountId
            : body.phoneNumberId;
      const token = body.accessToken ?? body.pageAccessToken;

      if (!externalId || !token) {
        throw new ValidationError(
          type === "whatsapp"
            ? "Phone number ID and access token are required"
            : "Account ID and access token are required",
        );
      }

      const [channel] = await db
        .insert(channelConnections)
        .values({
          organizationId: ctx.organization.id,
          type: type as "facebook",
          name: name || type,
          status: "connected",
          externalId,
          accessToken: encryptSecret(token),
          config: {},
          createdBy: ctx.user.id,
        })
        .returning();

      await audit({
        organizationId: ctx.organization.id,
        actorId: ctx.user.id,
        action: "channel.connect",
        resourceType: "channel",
        resourceId: channel!.id,
        metadata: { type },
      });

      return NextResponse.json(
        { channel: { id: channel!.id, name: channel!.name, type: channel!.type } },
        { status: 201 },
      );
    }

    if (type === "gmail" || type === "outlook") {
      if (!body.refreshToken) {
        throw new ValidationError(
          "OAuth refresh token is required. Complete the provider OAuth flow first.",
        );
      }
      const clientConfigured =
        type === "gmail"
          ? Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET)
          : Boolean(env.OUTLOOK_CLIENT_ID && env.OUTLOOK_CLIENT_SECRET);
      if (!clientConfigured) {
        throw new ValidationError(
          `Server OAuth credentials for ${type} are not configured. Add them to environment variables first.`,
        );
      }

      const [channel] = await db
        .insert(channelConnections)
        .values({
          organizationId: ctx.organization.id,
          type: type as "gmail",
          name: name || type,
          status: "connected",
          externalId: body.name || type,
          config: { refreshToken: body.refreshToken },
          createdBy: ctx.user.id,
        })
        .returning();

      return NextResponse.json(
        { channel: { id: channel!.id, name: channel!.name, type: channel!.type } },
        { status: 201 },
      );
    }

    throw new ValidationError("Unsupported channel type");
  } catch (error) {
    return toErrorResponse(error);
  }
}
