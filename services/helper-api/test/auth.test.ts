import { describe, expect, it } from 'vitest';
import { isAllowedUser } from '../src/lib/auth.js';

describe('isAllowedUser', () => {
  it('allows a matching numeric id', () => {
    expect(isAllowedUser(123456789, 123456789)).toBe(true);
  });

  it('allows a matching id across string/number types', () => {
    expect(isAllowedUser('123456789', 123456789)).toBe(true);
    expect(isAllowedUser(123456789, '123456789')).toBe(true);
  });

  it('rejects a different id', () => {
    expect(isAllowedUser(111111111, 123456789)).toBe(false);
  });

  it('rejects near-miss ids (no prefix/substring matching)', () => {
    expect(isAllowedUser(1234567890, 123456789)).toBe(false);
    expect(isAllowedUser('', 123456789)).toBe(false);
  });
});
