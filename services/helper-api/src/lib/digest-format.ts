import { CATEGORIES } from './classification-schema.js';
import { splitIntoTelegramMessages } from './message-splitter.js';

const MAX_PER_CATEGORY = 5;
const MAX_TOTAL = 25;
const DIGEST_TITLE = '📰 Дайджест новостей';
const NO_NEWS_MESSAGE = '📰 Сегодня новостей нет.';

const CATEGORY_META: Record<(typeof CATEGORIES)[number], { emoji: string; label: string }> = {
  programming: { emoji: '💻', label: 'Программирование' },
  technology: { emoji: '🤖', label: 'Технологии и AI' },
  gaming: { emoji: '🎮', label: 'Игровая индустрия' },
  roblox: { emoji: '🕹️', label: 'Roblox' },
  business: { emoji: '💼', label: 'Бизнес и стартапы' },
  world: { emoji: '🌍', label: 'Мировые новости' },
  central_asia: { emoji: '🏔️', label: 'Кыргызстан и Центральная Азия' },
  other: { emoji: '📌', label: 'Другое' },
};

// Fixed, deterministic section order — dev/AI-relevant categories first,
// matching the user's stated default interests.
const CATEGORY_ORDER = [
  'programming',
  'technology',
  'gaming',
  'roblox',
  'business',
  'world',
  'central_asia',
  'other',
] as const;

export interface DigestNewsItem {
  title: string;
  summary: string;
  whyItMatters?: string | null | undefined;
  categories: string[];
  importance: number;
  relevance: number;
  sourceUrl: string;
}

function renderItem(index: number, item: DigestNewsItem): string {
  const lines = [`${index}. ${item.title}`, item.summary];
  if (item.whyItMatters) {
    lines.push(`Почему важно: ${item.whyItMatters}`);
  }
  lines.push(`Источник: ${item.sourceUrl}`);
  return lines.join('\n');
}

/**
 * An item with multiple categories is grouped once, under its first
 * (primary) category — avoids double-listing the same story and keeps the
 * "max 25 total" cap unambiguous.
 */
function primaryCategory(item: DigestNewsItem): string {
  return item.categories[0] ?? 'other';
}

export function formatDigest(items: DigestNewsItem[]): string[] {
  if (items.length === 0) {
    return [NO_NEWS_MESSAGE];
  }

  const byCategory = new Map<string, DigestNewsItem[]>();
  for (const item of items) {
    const category = primaryCategory(item);
    const group = byCategory.get(category) ?? [];
    group.push(item);
    byCategory.set(category, group);
  }

  for (const group of byCategory.values()) {
    group.sort((a, b) => b.importance - a.importance || b.relevance - a.relevance);
    group.length = Math.min(group.length, MAX_PER_CATEGORY);
  }

  const blocks: string[] = [];
  let totalCount = 0;

  for (const category of CATEGORY_ORDER) {
    const group = byCategory.get(category);
    if (!group || group.length === 0) {
      continue;
    }

    const meta = CATEGORY_META[category];
    const sectionHeader = `${meta.emoji} ${meta.label}`;

    for (let i = 0; i < group.length; i++) {
      if (totalCount >= MAX_TOTAL) {
        break;
      }
      const itemBlock = renderItem(i + 1, group[i]!);
      blocks.push(i === 0 ? `${sectionHeader}\n${itemBlock}` : itemBlock);
      totalCount++;
    }

    if (totalCount >= MAX_TOTAL) {
      break;
    }
  }

  return splitIntoTelegramMessages(DIGEST_TITLE, blocks);
}
