import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocuments } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission, ValidationError } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { enforceKnowledgeLimit } from "@/lib/tenant";
import { extractText, ingestDocument, knowledgeStorageUsed } from "@/lib/ai/knowledge";
import { audit } from "@/lib/api/audit";
import { getActiveSubscription } from "@/lib/tenant";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "knowledge.manage");

    const docs = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.organizationId, ctx.organization.id))
      .orderBy(desc(knowledgeDocuments.createdAt));

    const used = await knowledgeStorageUsed(ctx.organization.id);
    const sub = await getActiveSubscription(ctx.organization.id);

    return NextResponse.json({
      documents: docs,
      storageUsed: used,
      storageLimitMb: sub?.plan.maxKnowledgeMb ?? null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "knowledge.manage");

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as {
        sourceType?: string;
        title?: string;
        url?: string;
        text?: string;
      } | null;
      if (!body) throw new ValidationError("Invalid request body");

      if (body.sourceType === "url") {
        if (!body.url || !/^https?:\/\//i.test(body.url)) {
          throw new ValidationError("A valid http(s) URL is required");
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        let html: string;
        try {
          const res = await fetch(body.url, {
            signal: controller.signal,
            headers: { "User-Agent": "SupportPilotBot/1.0" },
          });
          if (!res.ok) {
            throw new ValidationError(
              `Could not fetch the website (HTTP ${res.status})`,
            );
          }
          html = await res.text();
        } finally {
          clearTimeout(timer);
        }
        const text = stripHtml(html);
        if (text.length < 40) {
          throw new ValidationError("No readable content found at this URL");
        }
        await enforceKnowledgeLimit(ctx.organization.id, text.length);
        return await createAndIngest({
          organizationId: ctx.organization.id,
          userId: ctx.user.id,
          title: body.title?.trim() || new URL(body.url).hostname,
          sourceType: "url",
          sourceUrl: body.url,
          text,
          fileName: null,
          mimeType: "text/html",
          sizeBytes: text.length,
        });
      }

      if (body.sourceType === "text") {
        const text = body.text?.trim() ?? "";
        if (text.length < 20) {
          throw new ValidationError("Text content is too short");
        }
        await enforceKnowledgeLimit(ctx.organization.id, text.length);
        return await createAndIngest({
          organizationId: ctx.organization.id,
          userId: ctx.user.id,
          title: body.title?.trim() || "Manual entry",
          sourceType: "text",
          text,
          fileName: null,
          mimeType: "text/plain",
          sizeBytes: text.length,
        });
      }

      throw new ValidationError("Unsupported source type");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("No file uploaded");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError("File exceeds the 15 MB limit");
    }

    await enforceKnowledgeLimit(ctx.organization.id, file.size);

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      text = await extractText({
        buffer,
        mimeType: file.type,
        fileName: file.name,
      });
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : "Could not read this file",
      );
    }

    if (text.trim().length < 20) {
      throw new ValidationError(
        "No readable text was found in this file (scanned PDFs are not supported).",
      );
    }

    return await createAndIngest({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      title: file.name.replace(/\.[^.]+$/, ""),
      sourceType: "file",
      text,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function createAndIngest(params: {
  organizationId: string;
  userId: string;
  title: string;
  sourceType: string;
  text: string;
  sourceUrl?: string;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
}) {
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      organizationId: params.organizationId,
      title: params.title,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      status: "processing",
      createdBy: params.userId,
    })
    .returning();

  const result = await ingestDocument({
    organizationId: params.organizationId,
    documentId: doc!.id,
    text: params.text,
  });

  const [updated] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, doc!.id))
    .limit(1);

  await audit({
    organizationId: params.organizationId,
    actorId: params.userId,
    action: "knowledge.upload",
    resourceType: "knowledge_document",
    resourceId: doc!.id,
    metadata: { chunks: result.chunks },
  });

  return NextResponse.json({ document: updated }, { status: 201 });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
