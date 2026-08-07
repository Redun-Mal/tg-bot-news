import { describe, expect, it } from 'vitest';
import { validateInterest } from '../src/lib/interests.js';

describe('validateInterest', () => {
  it('accepts a normal short interest', () => {
    const result = validateInterest('TypeScript');
    expect(result).toEqual({ valid: true, interest: 'TypeScript', error: null });
  });

  it('trims leading/trailing whitespace', () => {
    const result = validateInterest('   Next.js   ');
    expect(result.interest).toBe('Next.js');
  });

  it('collapses internal whitespace runs to a single space', () => {
    const result = validateInterest('разработка    игр');
    expect(result.interest).toBe('разработка игр');
  });

  it('rejects an empty string', () => {
    const result = validateInterest('');
    expect(result.valid).toBe(false);
    expect(result.interest).toBeNull();
  });

  it('rejects a whitespace-only string', () => {
    const result = validateInterest('   \n\t  ');
    expect(result.valid).toBe(false);
  });

  it('accepts a string right at the length cap (60 chars)', () => {
    const result = validateInterest('x'.repeat(60));
    expect(result.valid).toBe(true);
  });

  it('rejects a string over the length cap', () => {
    const result = validateInterest('x'.repeat(61));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('60');
  });

  it('preserves case (dedup-by-case-insensitivity is a DB-layer concern, not this function)', () => {
    const result = validateInterest('typescript');
    expect(result.interest).toBe('typescript');
  });
});
