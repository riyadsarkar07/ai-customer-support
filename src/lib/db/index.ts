import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://saas:saas_dev_password@127.0.0.1:5432/saasdb";

const globalForDb = globalThis as unknown as {
  pool?: Pool;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 20 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db =
  globalForDb.db ??
  drizzle(pool, {
    schema,
    logger: process.env.DB_LOGGING === "true",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
