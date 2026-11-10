import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, knowledgeDocuments } from "@/lib/db/schema";
import { ingestDocument } from "@/lib/ai/knowledge";
import { logger } from "@/lib/logger";

export async function enqueueJob(params: {
  organizationId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<string> {
  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: params.organizationId ?? null,
      type: params.type,
      payload: params.payload ?? {},
      runAt: params.runAt ?? new Date(),
      maxAttempts: params.maxAttempts ?? 5,
    })
    .returning({ id: jobs.id });
  return job!.id;
}

async function claimJob(): Promise<typeof jobs.$inferSelect | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, now)))
    .orderBy(asc(jobs.runAt))
    .limit(1);

  const candidate = rows[0];
  if (!candidate) return null;

  const updated = await db
    .update(jobs)
    .set({
      status: "running",
      lockedAt: now,
      attempts: candidate.attempts + 1,
      updatedAt: now,
    })
    .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending")))
    .returning();

  return updated[0] ?? null;
}

async function handleJob(job: typeof jobs.$inferSelect): Promise<void> {
  switch (job.type) {
    case "knowledge.ingest": {
      const payload = job.payload as {
        organizationId?: string;
        documentId?: string;
        text?: string;
      };
      if (!payload.organizationId || !payload.documentId || !payload.text) {
        throw new Error("knowledge.ingest job is missing required payload");
      }
      await ingestDocument({
        organizationId: payload.organizationId,
        documentId: payload.documentId,
        text: payload.text,
      });
      return;
    }

    case "knowledge.reprocess": {
      const payload = job.payload as {
        organizationId?: string;
        documentId?: string;
      };
      if (!payload.organizationId || !payload.documentId) {
        throw new Error("knowledge.reprocess job is missing identifiers");
      }
      const [doc] = await db
        .select()
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.id, payload.documentId),
            eq(knowledgeDocuments.organizationId, payload.organizationId),
          ),
        )
        .limit(1);
      const text = (doc?.metadata as { text?: string } | null)?.text;
      if (!doc || !text) throw new Error("Document text is not available");
      await ingestDocument({
        organizationId: payload.organizationId,
        documentId: payload.documentId,
        text,
      });
      return;
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

export async function runOnce(limit = 10): Promise<number> {
  let processed = 0;
  for (let i = 0; i < limit; i += 1) {
    const job = await claimJob();
    if (!job) break;

    try {
      await handleJob(job);
      await db
        .update(jobs)
        .set({
          status: "completed",
          lockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const finalAttempt = job.attempts >= job.maxAttempts;
      await db
        .update(jobs)
        .set({
          status: finalAttempt ? "failed" : "pending",
          lastError: message,
          lockedAt: null,
          runAt: finalAttempt
            ? job.runAt
            : new Date(Date.now() + Math.min(60_000 * job.attempts, 15 * 60_000)),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      logger.error({ jobId: job.id, type: job.type, err }, "Job failed");
    }
    processed += 1;
  }
  return processed;
}

/**
 * Reclaims jobs that were locked but never finished (e.g. the worker crashed).
 */
export async function recoverStaleJobs(): Promise<number> {
  const staleCutoff = new Date(Date.now() - 10 * 60_000);
  const result = await db
    .update(jobs)
    .set({ status: "pending", lockedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(jobs.status, "running"),
        sql`${jobs.lockedAt} < ${staleCutoff}`,
      ),
    )
    .returning({ id: jobs.id });
  return result.length;
}
