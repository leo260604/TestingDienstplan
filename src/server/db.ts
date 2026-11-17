import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/* Ein PrismaClient pro Prozess (im Dev-Modus über Hot-Reloads hinweg wiederverwendet) */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Ohne DATABASE_URL (z. B. beim Build) wird erst bei der ersten Abfrage ein Fehler gemeldet.
  const connectionString = process.env.DATABASE_URL || 'postgresql://missing-database-url@localhost:5432/missing';
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
