import { createHash } from 'node:crypto';

/**
 * Collapses formatting/whitespace/case differences so semantically identical
 * posts (re-posted with different spacing, emoji, or capitalization) hash
 * the same way for dedup purposes. Not meant for display — keep raw_text
 * for that.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function computeContentHash(normalizedText: string): string {
  return createHash('sha256').update(normalizedText, 'utf8').digest('hex');
}
