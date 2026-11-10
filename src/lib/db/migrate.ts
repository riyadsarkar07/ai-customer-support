import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgres://saas:saas_dev_password@127.0.0.1:5432/saasdb",
  });
  const db = drizzle(pool);
  console.log("Enabling pgvector extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
