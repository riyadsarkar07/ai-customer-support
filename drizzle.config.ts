import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://saas:saas_dev_password@127.0.0.1:5432/saasdb",
  },
  verbose: true,
  strict: false,
});
