import { describe, expect, it } from 'vitest';
import { packBlocks, splitIntoTelegramMessages } from '../src/lib/message-splitter.js';

describe('packBlocks', () => {
  it('packs small blocks into a single chunk', () => {
    const chunks = packBlocks(['one', 'two', 'three']);
    expect(chunks).toEqual(['one\n\ntwo\n\nthree']);
  });

  it('never splits a single block, even one at the size limit', () => {
    const bigBlock = 'x'.repeat(3990);
    const chunks = packBlocks([bigBlock, 'small']);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(bigBlock);
  });

  it('splits into multiple chunks once the effective limit is exceeded', () => {
    const block = 'x'.repeat(1500);
    const chunks = packBlocks([block, block, block, block]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('preserves every block across the resulting chunks', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => `block-${i}-`.repeat(100));
    const chunks = packBlocks(blocks);
    const rejoined = chunks.join('\n\n');
    for (const block of blocks) {
      expect(rejoined).toContain(block);
    }
  });
});

describe('splitIntoTelegramMessages', () => {
  it('returns nothing for no blocks', () => {
    expect(splitIntoTelegramMessages('Title', [])).toEqual([]);
  });

  it('uses a plain title when everything fits in one message', () => {
    const result = splitIntoTelegramMessages('📰 Title', ['content']);
    expect(result).toEqual(['📰 Title\n\ncontent']);
  });

  it('numbers messages as (n/total) when it had to split', () => {
    const block = 'x'.repeat(1500);
    const result = splitIntoTelegramMessages('📰 Title', [block, block, block, block]);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toMatch(/^📰 Title \(1\/\d+\)/);
    expect(result[result.length - 1]).toMatch(
      new RegExp(`\\(${result.length}/${result.length}\\)`),
    );
    for (const message of result) {
      expect(message.length).toBeLessThanOrEqual(4096);
    }
  });
});
