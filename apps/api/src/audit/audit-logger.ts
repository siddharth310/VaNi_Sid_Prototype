import type { PrismaClient } from '@prisma/client';

export type AuditPayload = Record<string, unknown>;

/**
 * Persists audit rows with no raw PHI — only event types and redacted metadata.
 */
export async function writeAuditEvent(
  prisma: PrismaClient,
  sessionId: string,
  eventType: string,
  detail: AuditPayload
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      sessionId,
      eventType,
      detail: {
        ...detail,
        phi: '[REDACTED]',
      },
    },
  });
}
