import { CATEGORIES, classificationSchema, type Classification } from './classification-schema.js';
import { URGENCY_PATTERN } from './filter.js';

export interface HeuristicClassifyInput {
  title: string;
  rawText: string;
  interests: string[];
}

// Order matters: checked top to bottom, but every match is kept (a post can
// have multiple categories) — `roblox` is listed before the broader `gaming`
// so a Roblox post picking up both isn't surprising, it's expected per the
// spec ("Одна новость может иметь несколько категорий").
const CATEGORY_PATTERNS: Array<[(typeof CATEGORIES)[number], RegExp]> = [
  ['roblox', /roblox/iu],
  [
    'programming',
    /javascript|typescript|python|программирован|github|git\b|npm\b|api\b|framework|фреймворк|библиотек|разработчик|prisma|nest\.?js|next\.?js/iu,
  ],
  [
    'technology',
    /\bai\b|искусственный интеллект|нейросет|technology|технологи|gadget|apple|google|microsoft|neural|chatgpt|claude\b|llm\b/iu,
  ],
  ['gaming', /\bgame\b|игра|игров|steam|playstation|xbox|nintendo/iu],
  ['business', /startup|стартап|business|бизнес|инвестици|funding|ipo\b/iu],
  [
    'central_asia',
    /кыргызст|киргизи|бишкек|central asia|центральной азии|казахст|узбекист|таджикист/iu,
  ],
  ['world', /\bworld\b|international|международн/iu],
];

function detectCategories(text: string): Array<(typeof CATEGORIES)[number]> {
  const matched = CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([category]) => category,
  );
  return matched.length > 0 ? matched : ['other'];
}

function detectLanguage(text: string): string {
  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  return cyrillic >= latin ? 'ru' : 'en';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not substring — a naive `includes()` matches short
// interests like "UI" or "Git" inside unrelated text (URLs, HTML attributes,
// random word fragments) far too often to be a meaningful relevance signal.
function matchedInterests(text: string, interests: string[]): string[] {
  return interests.filter((interest) => {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(interest)}(?![\\p{L}\\p{N}])`,
      'iu',
    );
    return pattern.test(text);
  });
}

function truncateSummary(text: string, maxLength = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  const cut = trimmed.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  return lastSentenceEnd > maxLength * 0.5 ? cut.slice(0, lastSentenceEnd + 1) : `${cut}…`;
}

/**
 * Free, non-AI stand-in for classify_with_claude's Claude call — keyword
 * matching instead of understanding. Deliberately honest about its own
 * limits: fixed low-medium confidence, importance only ever 2 or 3 (never
 * assumes something is critical, never buries it as trivial), summary is
 * truncated raw text rather than written. Good enough to unblock instant
 * alerts/digest without any API cost; upgrade path to classify_with_claude
 * stays available once a Claude key exists — same output contract either way.
 */
export function heuristicClassify(input: HeuristicClassifyInput): Classification {
  const categories = detectCategories(`${input.title} ${input.rawText}`);
  const hits = matchedInterests(`${input.title} ${input.rawText}`, input.interests);
  const importance = URGENCY_PATTERN.test(input.rawText) ? 3 : 2;
  const relevance = hits.length > 0 ? 0.8 : 0.4;

  const result = {
    title: input.title || truncateSummary(input.rawText, 80),
    summary: truncateSummary(input.rawText),
    why_it_matters:
      hits.length > 0
        ? `Совпадает с вашими интересами: ${hits.join(', ')}.`
        : `Категория: ${categories.join(', ')}.`,
    categories,
    importance,
    relevance,
    is_advertisement: false,
    is_duplicate: false,
    language: detectLanguage(input.rawText),
    confidence: 0.5,
    keywords: hits.length > 0 ? hits : categories,
  };

  // Guards against a bug in this function producing something that would
  // silently violate the same contract classify_with_claude's real output
  // must satisfy — fail loud here rather than let a malformed row through.
  return classificationSchema.parse(result);
}
