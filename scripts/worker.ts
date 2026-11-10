import { pool } from "../src/lib/db";
import { runOnce, recoverStaleJobs } from "../src/lib/jobs";
import { expireLapsedSubscriptions } from "../src/lib/billing/service";
import { logger } from "../src/lib/logger";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const BILLING_MS = Number(process.env.WORKER_BILLING_MS ?? 60 * 60 * 1000);

let stopping = false;

async function tickJobs() {
  try {
    await runOnce(20);
  } catch (err) {
    logger.error({ err }, "Job tick failed");
  }
}

async function tickBilling() {
  try {
    const expired = await expireLapsedSubscriptions();
    if (expired > 0) {
      logger.info({ expired }, "Expired lapsed subscriptions");
    }
  } catch (err) {
    logger.error({ err }, "Billing tick failed");
  }
}

async function main() {
  logger.info({ pollMs: POLL_MS }, "SupportPilot worker starting");

  const recovered = await recoverStaleJobs();
  if (recovered > 0) logger.info({ recovered }, "Recovered stale jobs");

  let lastBilling = 0;

  while (!stopping) {
    await tickJobs();

    if (Date.now() - lastBilling > BILLING_MS) {
      await tickBilling();
      lastBilling = Date.now();
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  logger.info("Worker stopped");
  await pool.end();
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Worker shutting down");
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch(async (err) => {
  logger.error({ err }, "Worker crashed");
  await pool.end();
  process.exit(1);
});
