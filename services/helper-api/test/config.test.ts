import { describe, expect, it } from 'vitest';
import { config } from '../src/config.js';

describe('config', () => {
  it('defaults port to 3000 when HELPER_API_PORT is unset', () => {
    expect(config.port).toBe(3000);
  });
});
