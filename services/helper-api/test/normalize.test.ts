import { describe, expect, it } from 'vitest';
import { computeContentHash, normalizeText } from '../src/lib/normalize.js';

describe('normalizeText', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeText('  Hello   World  \n\n')).toBe('hello world');
  });

  it('strips URLs', () => {
    expect(normalizeText('Check this out: https://example.com/foo?bar=1 amazing')).toBe(
      'check this out: amazing',
    );
  });

  it('strips emoji', () => {
    expect(normalizeText('Breaking news 🚨🔥 read now')).toBe('breaking news read now');
  });

  it('produces the same normalized text for re-posts with different formatting', () => {
    const a = normalizeText('  Big   News!!  🎉');
    const b = normalizeText('BIG NEWS!!');
    expect(a).toBe(b);
  });
});

describe('computeContentHash', () => {
  it('is deterministic for identical input', () => {
    expect(computeContentHash('same text')).toBe(computeContentHash('same text'));
  });

  it('differs for different input', () => {
    expect(computeContentHash('text a')).not.toBe(computeContentHash('text b'));
  });

  it('returns a 64-char hex sha256 digest', () => {
    expect(computeContentHash('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});
