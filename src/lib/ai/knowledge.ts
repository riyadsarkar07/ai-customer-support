import { and, desc, eq, sql } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import {
  knowledgeChunks,
  knowledgeDocuments,
} from "@/lib/db/schema";
import { embedTexts, AiUnavailableError } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

export function chunkText(
  text: string,
  opts: { size?: number; overlap?: number } = {},
): string[] {
  const size = opts.size ?? 1200;
  const overlap = opts.overlap ?? 150;
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf("\n\n", end);
      const sentence = clean.lastIndexOf(". ", end);
      if (boundary > start + size * 0.5) end = boundary;
      else if (sentence > start + size * 0.5) end = sentence + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export async function extractText(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const { buffer, mimeType, fileName } = params;
  const lower = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default as (
      b: Buffer,
    ) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text ?? "";
  }

  if (
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/msword" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (
    mimeType.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv")
  ) {
    return buffer.toString("utf8");
  }

  throw new Error(`Unsupported file type: ${mimeType || fileName}`);
}

export async function ingestDocument(params: {
  organizationId: string;
  documentId: string;
  text: string;
}): Promise<{ chunks: number }> {
  const { organizationId, documentId } = params;
  const pieces = chunkText(params.text);

  if (pieces.length === 0) {
    await db
      .update(knowledgeDocuments)
      .set({
        status: "failed",
        error: "No readable text found in this document.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeDocuments.id, documentId),
          eq(knowledgeDocuments.organizationId, organizationId),
        ),
      );
    return { chunks: 0 };
  }

  try {
    const embeddings: number[][] = [];
    const batchSize = 64;
    for (let i = 0; i < pieces.length; i += batchSize) {
      const batch = pieces.slice(i, i + batchSize);
      const result = await embedTexts(batch);
      embeddings.push(...result);
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.documentId, documentId),
            eq(knowledgeChunks.organizationId, organizationId),
          ),
        );

      const rows = pieces.map((content, index) => ({
        organizationId,
        documentId,
        chunkIndex: index,
        content,
        tokenCount: Math.ceil(content.length / 4),
        embedding: embeddings[index] ?? null,
      }));

      for (let i = 0; i < rows.length; i += 100) {
        await tx.insert(knowledgeChunks).values(rows.slice(i, i + 100));
      }

      await tx
        .update(knowledgeDocuments)
        .set({
          status: "ready",
          error: null,
          charCount: params.text.length,
          chunkCount: rows.length,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(knowledgeDocuments.id, documentId),
            eq(knowledgeDocuments.organizationId, organizationId),
          ),
        );
    });

    return { chunks: pieces.length };
  } catch (error) {
    const message =
      error instanceof AiUnavailableError
        ? "Embeddings require an OpenAI API key. Configure OPENAI_API_KEY to enable knowledge search."
        : error instanceof Error
          ? error.message
          : "Document processing failed";
    logger.warn({ documentId, organizationId, err: message }, "Ingestion failed");
    await db
      .update(knowledgeDocuments)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(
        and(
          eq(knowledgeDocuments.id, documentId),
          eq(knowledgeDocuments.organizationId, organizationId),
        ),
      );
    return { chunks: 0 };
  }
}

export type RetrievedChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  similarity: number;
};

export async function retrieveContext(params: {
  organizationId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
}): Promise<RetrievedChunk[]> {
  const { organizationId, query } = params;
  const limit = params.limit ?? 5;
  const minSimilarity = params.minSimilarity ?? 0.2;

  if (!query.trim()) return [];

  let embedding: number[];
  try {
    const [vec] = await embedTexts([query]);
    if (!vec) return [];
    embedding = vec;
  } catch (error) {
    logger.warn({ err: String(error) }, "RAG embedding unavailable");
    return [];
  }

  const vectorLiteral = `[${embedding.join(",")}]`;

  // Tenant isolation is enforced in the SQL WHERE clause itself.
  const result = await pool.query<{
    id: string;
    document_id: string;
    title: string;
    content: string;
    similarity: number;
  }>(
    `SELECT kc.id, kc.document_id, kd.title, kc.content,
            1 - (kc.embedding <=> $1::vector) AS similarity
     FROM knowledge_chunks kc
     JOIN knowledge_documents kd ON kd.id = kc.document_id
     WHERE kc.organization_id = $2
       AND kd.organization_id = $2
       AND kd.status = 'ready'
       AND kc.embedding IS NOT NULL
     ORDER BY kc.embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, organizationId, limit],
  );

  return result.rows
    .filter((r) => Number(r.similarity) >= minSimilarity)
    .map((r) => ({
      id: r.id,
      documentId: r.document_id,
      documentTitle: r.title,
      content: r.content,
      similarity: Number(r.similarity),
    }));
}

export async function listDocuments(organizationId: string) {
  return db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId))
    .orderBy(desc(knowledgeDocuments.createdAt));
}

export async function knowledgeStorageUsed(organizationId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${knowledgeDocuments.sizeBytes}), 0)::bigint`,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId));
  return Number(row?.total ?? 0);
}
