import { describe, expect, it } from 'vitest';
import { formatDigest, type DigestNewsItem } from '../src/lib/digest-format.js';

function item(overrides: Partial<DigestNewsItem>): DigestNewsItem {
  return {
    title: 'Title',
    summary: 'Summary.',
    whyItMatters: 'Because reasons.',
    categories: ['programming'],
    importance: 2,
    relevance: 0.5,
    sourceUrl: 'https://t.me/example/1',
    ...overrides,
  };
}

describe('formatDigest', () => {
  it('sends a short no-news message when there is nothing to show', () => {
    expect(formatDigest([])).toEqual(['📰 Сегодня новостей нет.']);
  });

  it('skips empty sections — only categories with items appear', () => {
    const [message] = formatDigest([item({ categories: ['gaming'] })]);
    expect(message).toContain('🎮 Игровая индустрия');
    expect(message).not.toContain('Программирование');
    expect(message).not.toContain('Roblox');
  });

  it('orders items within a section by importance then relevance', () => {
    const items = [
      item({ title: 'Low', importance: 1, relevance: 0.9 }),
      item({ title: 'High', importance: 4, relevance: 0.1 }),
      item({ title: 'MidHighRel', importance: 2, relevance: 0.9 }),
      item({ title: 'MidLowRel', importance: 2, relevance: 0.1 }),
    ];
    const [message] = formatDigest(items);
    const order = ['High', 'MidHighRel', 'MidLowRel', 'Low'].map((t) => message!.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('caps each category at 5 items', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ title: `Item ${i}`, categories: ['technology'], importance: 4 - (i % 4) }),
    );
    const [message] = formatDigest(items);
    const numberedLines = message!.match(/^\d+\. /gm) ?? [];
    expect(numberedLines.length).toBe(5);
  });

  it('caps the whole digest at 25 items total across categories', () => {
    const items: DigestNewsItem[] = [];
    for (const category of ['programming', 'technology', 'gaming', 'roblox', 'business', 'world']) {
      for (let i = 0; i < 5; i++) {
        items.push(item({ title: `${category}-${i}`, categories: [category], importance: 3 }));
      }
    }
    // 6 categories * 5 items = 30 available, but only 25 should appear.
    const messages = formatDigest(items);
    const totalNumberedLines = messages
      .join('\n')
      .match(/^\d+\. /gm)?.length;
    expect(totalNumberedLines).toBe(25);
  });

  it('groups a multi-category item once, under its primary (first) category only', () => {
    const [message] = formatDigest([
      item({ title: 'Cross-cutting', categories: ['programming', 'technology'] }),
    ]);
    expect(message).toContain('💻 Программирование');
    expect(message).not.toContain('🤖 Технологии и AI');
  });

  it('restarts item numbering at 1 for each section', () => {
    const [message] = formatDigest([
      item({ title: 'A', categories: ['programming'] }),
      item({ title: 'B', categories: ['gaming'] }),
    ]);
    expect(message).toMatch(/💻 Программирование\n1\. A/);
    expect(message).toMatch(/🎮 Игровая индустрия\n1\. B/);
  });

  it('omits the "Почему важно" line when whyItMatters is absent', () => {
    const [message] = formatDigest([item({ whyItMatters: null })]);
    expect(message).not.toContain('Почему важно');
  });

  it('includes the source link for every item', () => {
    const [message] = formatDigest([item({ sourceUrl: 'https://t.me/example/42' })]);
    expect(message).toContain('Источник: https://t.me/example/42');
  });

  it('splits into multiple Telegram-safe messages for a large digest', () => {
    const items: DigestNewsItem[] = [];
    for (const category of ['programming', 'technology', 'gaming', 'roblox', 'business']) {
      for (let i = 0; i < 5; i++) {
        items.push(
          item({
            title: `${category}-${i}`,
            categories: [category],
            summary: 'x'.repeat(600),
            importance: 3,
          }),
        );
      }
    }
    const messages = formatDigest(items);
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(4096);
    }
  });
});
