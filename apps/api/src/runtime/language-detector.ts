import { franc } from 'franc';

/** Map franc ISO 639-3 → ISO 639-1 (fallback en) */
const ISO3_TO_1: Record<string, string> = {
  eng: 'en',
  hin: 'hi',
  tam: 'ta',
  tel: 'te',
  mar: 'mr',
  ben: 'bn',
  urd: 'ur',
  kan: 'kn',
  mal: 'ml',
  guj: 'gu',
  pan: 'pa',
  fra: 'fr',
  spa: 'es',
  deu: 'de',
  arb: 'ar',
};

/**
 * Detect language from text (chat). Returns ISO 639-1 code.
 */
export function detectLanguageCode(text: string): string {
  if (!text.trim()) {
    return 'en';
  }
  const code3 = franc(text);
  if (code3 === 'und') {
    return 'en';
  }
  return ISO3_TO_1[code3] ?? 'en';
}
