import { createHash, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config.js';

export function hashUhid(uhid: string, cfg: AppConfig): string {
  return createHash('sha256')
    .update(`${cfg.PATIENT_HASH_SECRET}|${uhid.trim().toLowerCase()}`)
    .digest('hex');
}

function normalizeDob(dob: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (iso.test(dob.trim())) {
    return dob.trim();
  }
  const m = dob.trim().match(dmy);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

/**
 * Verifies format only (no PHI logging). FHIR-backed verification can replace internals later.
 */
export function verifyPatientCredentials(
  uhid: string,
  dob: string,
  cfg: AppConfig,
  expectedHash: string | null | undefined
): { ok: boolean; uhidHash: string } {
  const uhidHash = hashUhid(uhid, cfg);
  const dobOk = normalizeDob(dob) !== null;
  if (!dobOk || uhid.trim().length < 4) {
    return { ok: false, uhidHash };
  }
  if (expectedHash) {
    const a = Buffer.from(uhidHash, 'utf8');
    const b = Buffer.from(expectedHash, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, uhidHash };
    }
  }
  return { ok: true, uhidHash };
}
