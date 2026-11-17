import { prisma } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Health-Check für Docker/Kubernetes */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'ok' });
  } catch {
    return Response.json({ status: 'degraded', db: 'unreachable' }, { status: 503 });
  }
}
