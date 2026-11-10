import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunks, knowledgeDocuments } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { audit } from "@/lib/api/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "knowledge.manage");

    const { id } = await params;
    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!doc) return jsonError("Document not found", 404);

    const chunks = await db
      .select({
        id: knowledgeChunks.id,
        chunkIndex: knowledgeChunks.chunkIndex,
        content: knowledgeChunks.content,
        tokenCount: knowledgeChunks.tokenCount,
      })
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.documentId, id),
          eq(knowledgeChunks.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(knowledgeChunks.chunkIndex);

    return NextResponse.json({ document: doc, chunks });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "knowledge.manage");

    const { id } = await params;
    const [doc] = await db
      .select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!doc) return jsonError("Document not found", 404);

    await db
      .delete(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.id, id),
          eq(knowledgeDocuments.organizationId, ctx.organization.id),
        ),
      );

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "knowledge.delete",
      resourceType: "knowledge_document",
      resourceId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
