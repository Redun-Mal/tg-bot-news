import { describe, expect, it } from 'vitest';
import { filterCheck } from '../src/lib/filter.js';
import { normalizeText } from '../src/lib/normalize.js';

describe('filterCheck', () => {
  it('drops empty text', () => {
    expect(filterCheck(normalizeText('   '))).toEqual({ keep: false, reason: 'empty' });
  });

  it('drops text with no actual letters/digits (just punctuation/emoji)', () => {
    expect(filterCheck(normalizeText('🔥🔥🔥 !!! ...'))).toEqual({
      keep: false,
      reason: 'empty',
    });
  });

  it('drops a short, non-urgent post', () => {
    const result = filterCheck(normalizeText('Смотрите это видео, очень интересно'.slice(0, 20)));
    expect(result.keep).toBe(false);
    expect(result.reason).toBe('too_short');
  });

  it('keeps a short but urgent one-liner (does not drop just for length)', () => {
    const result = filterCheck(normalizeText('Срочно: в Бишкеке произошло землетрясение!'));
    expect(result).toEqual({ keep: true, reason: null });
  });

  it('drops promo-code posts', () => {
    const result = filterCheck(
      normalizeText('Успей купить со скидкой по промокоду SALE2026, действует до конца недели!'),
    );
    expect(result).toEqual({ keep: false, reason: 'promo_code' });
  });

  it('drops giveaway posts', () => {
    const result = filterCheck(
      normalizeText('Розыгрыш! Подпишись и выиграй новый iPhone, подробности в комментариях!'),
    );
    expect(result).toEqual({ keep: false, reason: 'giveaway' });
  });

  it('drops marked advertisement posts', () => {
    const result = filterCheck(
      normalizeText('#реклама Лучшие курсы по программированию, запишись прямо сейчас!'),
    );
    expect(result).toEqual({ keep: false, reason: 'advertisement' });
  });

  it('keeps a normal, sufficiently long news post', () => {
    const result = filterCheck(
      normalizeText(
        'Сегодня разработчики TypeScript анонсировали новую версию языка с улучшенной поддержкой типов и производительностью компилятора.',
      ),
    );
    expect(result).toEqual({ keep: true, reason: null });
  });

  it('does not flag legitimate news mentioning a protest ("акция") as advertisement', () => {
    const result = filterCheck(
      normalizeText(
        'В центре города прошла акция протеста, в которой приняли участие несколько сотен человек.',
      ),
    );
    expect(result).toEqual({ keep: true, reason: null });
  });
});
