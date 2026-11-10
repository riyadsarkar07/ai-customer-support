import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversations,
  messages,
  workflows,
  workflowRuns,
  memberships,
} from "@/lib/db/schema";
import { publish } from "@/lib/realtime/bus";
import { logger } from "@/lib/logger";

export type WorkflowTrigger = {
  type: string;
  config: Record<string, unknown>;
};

export type WorkflowCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

export type WorkflowAction = {
  type: string;
  config?: Record<string, unknown>;
};

const MAX_ACTIONS = 20;

function matchesCondition(
  condition: WorkflowCondition,
  ctx: { text: string; channelType: string; conversationStatus: string; tags: string[] },
): boolean {
  const { field, operator = "equals", value } = condition;
  const target =
    field === "text"
      ? ctx.text
      : field === "channel"
        ? ctx.channelType
        : field === "status"
          ? ctx.conversationStatus
          : field === "tag"
            ? ctx.tags.join(",")
            : "";

  const v = String(value ?? "").toLowerCase();
  const t = String(target ?? "").toLowerCase();

  switch (operator) {
    case "contains":
      return t.includes(v);
    case "not_contains":
      return !t.includes(v);
    case "equals":
      return t === v;
    case "not_equals":
      return t !== v;
    case "starts_with":
      return t.startsWith(v);
    case "regex":
      try {
        return new RegExp(String(value ?? ""), "i").test(target);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function matchesTrigger(
  trigger: WorkflowTrigger,
  ctx: { text: string; channelType: string; isNewConversation: boolean },
): boolean {
  if (trigger.type === "message_received") return true;
  if (trigger.type === "conversation_created") return ctx.isNewConversation;
  if (trigger.type === "keyword_match") {
    const keywords = String(trigger.config.keywords ?? "")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    if (keywords.length === 0) return false;
    const lower = ctx.text.toLowerCase();
    return keywords.some((k) => lower.includes(k));
  }
  return false;
}

function withinBusinessHours(config: Record<string, unknown>): boolean {
  if (!config.enabled) return true;
  const timezone = String(config.timezone ?? "Asia/Dhaka");
  try {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);

    const weekday = formatted.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(formatted.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(formatted.find((p) => p.type === "minute")?.value ?? "0");
    const days = (config.days as string[]) ?? [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ];
    const start = String(config.start ?? "09:00").split(":").map(Number);
    const end = String(config.end ?? "18:00").split(":").map(Number);
    if (!days.includes(weekday)) return false;
    const mins = hour * 60 + minute;
    return mins >= (start[0] ?? 9) * 60 + (start[1] ?? 0) && mins <= (end[0] ?? 18) * 60 + (end[1] ?? 0);
  } catch {
    return true;
  }
}

export async function runWorkflowsForMessage(params: {
  organizationId: string;
  conversationId: string;
  text: string;
  channelType: string;
}): Promise<void> {
  const { organizationId, conversationId, text, channelType } = params;

  const list = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.organizationId, organizationId),
        eq(workflows.enabled, true),
      ),
    );

  if (list.length === 0) return;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!conv) return;

  for (const wf of list) {
    const trigger = wf.trigger as WorkflowTrigger;
    if (
      !matchesTrigger(trigger, {
        text,
        channelType,
        isNewConversation: false,
      })
    ) {
      continue;
    }

    const conditionsMatch = (wf.conditions as WorkflowCondition[]).every((c) =>
      matchesCondition(c, {
        text,
        channelType,
        conversationStatus: conv.status,
        tags: conv.tags,
      }),
    );
    if (!conditionsMatch) continue;

    const [run] = await db
      .insert(workflowRuns)
      .values({
        organizationId,
        workflowId: wf.id,
        conversationId,
        status: "running",
        steps: [],
      })
      .returning({ id: workflowRuns.id });

    const steps: Array<Record<string, unknown>> = [];
    try {
      const actions = (wf.actions as WorkflowAction[]).slice(0, MAX_ACTIONS);
      let stop = false;
      for (const action of actions) {
        if (stop) break;
        const config = action.config ?? {};
        switch (action.type) {
          case "assign_agent": {
            const agentId = config.agentId as string | undefined;
            if (agentId) {
              const [member] = await db
                .select({ userId: memberships.userId })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.organizationId, organizationId),
                    eq(memberships.userId, agentId),
                    eq(memberships.status, "active"),
                  ),
                )
                .limit(1);
              if (member) {
                await db
                  .update(conversations)
                  .set({ assigneeId: member.userId, updatedAt: new Date() })
                  .where(
                    and(
                      eq(conversations.id, conversationId),
                      eq(conversations.organizationId, organizationId),
                    ),
                  );
                steps.push({ action: "assign_agent", status: "ok", agentId });
              } else {
                steps.push({ action: "assign_agent", status: "skipped", reason: "agent_not_found" });
              }
            }
            break;
          }
          case "add_tag": {
            const tag = String(config.tag ?? "").trim();
            if (tag) {
              await db
                .update(conversations)
                .set({
                  tags: sql`(
                    SELECT COALESCE(jsonb_agg(DISTINCT v), '[]'::jsonb)
                    FROM jsonb_array_elements_text(${conversations.tags} || ${JSON.stringify([tag])}::jsonb) AS t(v)
                  )`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(conversations.id, conversationId),
                    eq(conversations.organizationId, organizationId),
                  ),
                );
              steps.push({ action: "add_tag", status: "ok", tag });
            }
            break;
          }
          case "set_priority": {
            const priority = String(config.priority ?? "normal");
            if (["low", "normal", "high", "urgent"].includes(priority)) {
              await db
                .update(conversations)
                .set({ priority: priority as "low", updatedAt: new Date() })
                .where(
                  and(
                    eq(conversations.id, conversationId),
                    eq(conversations.organizationId, organizationId),
                  ),
                );
              steps.push({ action: "set_priority", status: "ok", priority });
            }
            break;
          }
          case "set_status": {
            const status = String(config.status ?? "pending");
            if (["open", "pending", "resolved", "archived"].includes(status)) {
              await db
                .update(conversations)
                .set({ status: status as "open", updatedAt: new Date() })
                .where(
                  and(
                    eq(conversations.id, conversationId),
                    eq(conversations.organizationId, organizationId),
                  ),
                );
            }
            steps.push({ action: "set_status", status: "ok", value: config.status });
            break;
          }
          case "pause_ai": {
            await db
              .update(conversations)
              .set({ aiEnabled: false, updatedAt: new Date() })
              .where(
                and(
                  eq(conversations.id, conversationId),
                  eq(conversations.organizationId, organizationId),
                ),
              );
            steps.push({ action: "pause_ai", status: "ok" });
            break;
          }
          case "send_reply": {
            const body = String(config.message ?? "").trim();
            if (body) {
              await db.insert(messages).values({
                organizationId,
                conversationId,
                direction: "outbound",
                senderType: "system",
                body,
                status: "sent",
                metadata: { workflowId: wf.id },
              });
              await db
                .update(conversations)
                .set({
                  lastMessageAt: new Date(),
                  lastMessagePreview: body.slice(0, 160),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(conversations.id, conversationId),
                    eq(conversations.organizationId, organizationId),
                  ),
                );
              steps.push({ action: "send_reply", status: "ok" });
            }
            break;
          }
          case "business_hours_check": {
            const open = withinBusinessHours(config);
            steps.push({ action: "business_hours_check", status: "ok", open });
            if (!open && config.stopOutsideHours) stop = true;
            break;
          }
          default:
            steps.push({ action: action.type, status: "unknown_action" });
        }
      }

      await db
        .update(workflowRuns)
        .set({ status: "completed", steps, finishedAt: new Date() })
        .where(
          and(
            eq(workflowRuns.id, run!.id),
            eq(workflowRuns.organizationId, organizationId),
          ),
        );
      await db
        .update(workflows)
        .set({
          executionCount: sql`${workflows.executionCount} + 1`,
          lastRunAt: new Date(),
        })
        .where(
          and(
            eq(workflows.id, wf.id),
            eq(workflows.organizationId, organizationId),
          ),
        );

      publish({
        type: "conversation.updated",
        organizationId,
        conversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workflow failed";
      await db
        .update(workflowRuns)
        .set({
          status: "failed",
          steps,
          error: message,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(workflowRuns.id, run!.id),
            eq(workflowRuns.organizationId, organizationId),
          ),
        );
      logger.error({ err: error, workflowId: wf.id }, "Workflow execution failed");
    }
  }
}
