export type FilterReason = 'empty' | 'too_short' | 'advertisement' | 'giveaway' | 'promo_code';

export interface FilterResult {
  keep: boolean;
  reason: FilterReason | null;
}

const MIN_LENGTH = 30;

// Deliberately narrow/high-precision patterns — a false positive here drops
// a real news item before it ever reaches Claude, which is worse than a
// false negative (Claude's own is_advertisement flag catches those later).
const PROMO_CODE_PATTERN = /промо\s*код|промокод|coupon\s*code|discount\s*code/iu;
const GIVEAWAY_PATTERN = /розыгрыш|giveaway|подпишись\s+и\s+выиграй/iu;
const ADVERTISEMENT_PATTERN = /#реклама|#ad\b|реклама\s*\d{6,}|erid[:\s]/iu;

// Short posts aren't dropped if they carry an urgency signal — a one-line
// breaking-news alert can be more important than a long fluff post.
const URGENCY_PATTERN =
  /срочно|внимание|важно|breaking|только что|чп\b|чрезвычайн|эвакуац|взрыв|авари|погиб|атак|отключ|землетрясен/iu;

function isEffectivelyEmpty(normalizedText: string): boolean {
  return normalizedText.replace(/[^\p{L}\p{N}]/gu, '').length === 0;
}

/**
 * Cheap heuristic pass applied before the (paid, slower) Claude call.
 * Operates on the already-normalized text (see normalize.ts).
 */
export function filterCheck(normalizedText: string): FilterResult {
  if (isEffectivelyEmpty(normalizedText)) {
    return { keep: false, reason: 'empty' };
  }

  if (PROMO_CODE_PATTERN.test(normalizedText)) {
    return { keep: false, reason: 'promo_code' };
  }

  if (GIVEAWAY_PATTERN.test(normalizedText)) {
    return { keep: false, reason: 'giveaway' };
  }

  if (ADVERTISEMENT_PATTERN.test(normalizedText)) {
    return { keep: false, reason: 'advertisement' };
  }

  if (normalizedText.length < MIN_LENGTH && !URGENCY_PATTERN.test(normalizedText)) {
    return { keep: false, reason: 'too_short' };
  }

  return { keep: true, reason: null };
}
