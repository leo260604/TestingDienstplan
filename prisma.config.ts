import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Für "prisma generate" im Build reicht ein Platzhalter – Migrationen laufen zur Laufzeit mit der echten URL.
    url: process.env.DATABASE_URL ?? 'postgresql://build:build@localhost:5432/build',
  },
});
