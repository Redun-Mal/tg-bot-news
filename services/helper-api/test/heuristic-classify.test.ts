import { describe, expect, it } from 'vitest';
import { heuristicClassify } from '../src/lib/heuristic-classify.js';

const DEFAULT_INTERESTS = [
  'JavaScript',
  'TypeScript',
  'Next.js',
  'NestJS',
  'Prisma',
  'n8n',
  'Claude Code',
  'искусственный интеллект',
  'Git',
  'GitHub',
  'Roblox Studio',
  'разработка игр',
  'UI',
  'локализация',
  'CRM',
  'аналитика',
];

describe('heuristicClassify', () => {
  it('detects the programming category from keywords', () => {
    const result = heuristicClassify({
      title: 'Вышел TypeScript 6.0',
      rawText: 'Сегодня разработчики TypeScript анонсировали новую версию языка.',
      interests: DEFAULT_INTERESTS,
    });
    expect(result.categories).toContain('programming');
  });

  it('detects the roblox category and does not force gaming alongside it unless matched', () => {
    const result = heuristicClassify({
      title: 'Roblox Studio обновление',
      rawText: 'Roblox Studio получил новые инструменты для разработчиков.',
      interests: DEFAULT_INTERESTS,
    });
    expect(result.categories).toContain('roblox');
  });

  it('falls back to "other" when nothing matches', () => {
    const result = heuristicClassify({
      title: 'Погода в выходные',
      rawText: 'В эти выходные ожидается солнечная погода без осадков.',
      interests: DEFAULT_INTERESTS,
    });
    expect(result.categories).toEqual(['other']);
  });

  it('assigns importance 3 for urgency-flagged text, 2 otherwise', () => {
    const urgent = heuristicClassify({
      title: 'Срочно',
      rawText: 'Срочно: в городе произошла авария на дороге.',
      interests: [],
    });
    const normal = heuristicClassify({
      title: 'Новость',
      rawText: 'Компания выпустила квартальный отчёт о доходах.',
      interests: [],
    });
    expect(urgent.importance).toBe(3);
    expect(normal.importance).toBe(2);
  });

  it('does not match a short interest as a substring inside unrelated text (word-boundary only)', () => {
    // Real bug: a URL fragment like ".../file/BhofM9uh69Y..." contains the
    // literal substring "ui" by pure chance — naive includes() matched the
    // "UI" interest against random link text like this.
    const result = heuristicClassify({
      title: 'Новость',
      rawText: 'Смотрите фото: https://cdn.example.com/file/BhofM9uh69YGSrMeuupU.jpg',
      interests: ['UI'],
    });
    expect(result.relevance).toBe(0.4);
    expect(result.why_it_matters).not.toContain('UI');
  });

  it('boosts relevance when text matches a user interest', () => {
    const matching = heuristicClassify({
      title: 'Новость',
      rawText: 'Вышла новая версия TypeScript с улучшениями.',
      interests: DEFAULT_INTERESTS,
    });
    const notMatching = heuristicClassify({
      title: 'Новость',
      rawText: 'Открылся новый ресторан в центре города.',
      interests: DEFAULT_INTERESTS,
    });
    expect(matching.relevance).toBeGreaterThan(notMatching.relevance);
  });

  it('lists matched interests in why_it_matters when present', () => {
    const result = heuristicClassify({
      title: 'Новость',
      rawText: 'Обновление для TypeScript и Git вышло сегодня.',
      interests: DEFAULT_INTERESTS,
    });
    expect(result.why_it_matters).toContain('TypeScript');
  });

  it('truncates a long summary rather than including the full raw text', () => {
    const longText = 'Предложение номер один. '.repeat(50);
    const result = heuristicClassify({ title: 'Заголовок', rawText: longText, interests: [] });
    expect(result.summary.length).toBeLessThan(longText.length);
    expect(result.summary.length).toBeLessThanOrEqual(281);
  });

  it('detects Russian vs English language from script majority', () => {
    const ru = heuristicClassify({
      title: 'Заголовок',
      rawText: 'Это русский текст новости.',
      interests: [],
    });
    const en = heuristicClassify({
      title: 'Title',
      rawText: 'This is an English news article.',
      interests: [],
    });
    expect(ru.language).toBe('ru');
    expect(en.language).toBe('en');
  });

  it('always marks is_advertisement and is_duplicate false (handled upstream)', () => {
    const result = heuristicClassify({
      title: 'X',
      rawText: 'Обычная новость дня.',
      interests: [],
    });
    expect(result.is_advertisement).toBe(false);
    expect(result.is_duplicate).toBe(false);
  });

  it('uses a fixed, honest confidence score since this is not real classification', () => {
    const result = heuristicClassify({
      title: 'X',
      rawText: 'Обычная новость дня.',
      interests: [],
    });
    expect(result.confidence).toBe(0.5);
  });

  it('produces output that passes the same schema real Claude output must satisfy', () => {
    // heuristicClassify already self-validates internally; this just
    // confirms it doesn't throw for a range of realistic inputs.
    expect(() =>
      heuristicClassify({
        title: '',
        rawText: 'Короткая новость про Roblox и игры.',
        interests: [],
      }),
    ).not.toThrow();
  });
});
