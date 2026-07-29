import path from "node:path";
import { defineConfig } from "prisma/config";

const dbUrl =
  process.env.DATABASE_URL ??
  `file:${path.join(__dirname, "prisma", "dev.db")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbUrl,
  },
});
