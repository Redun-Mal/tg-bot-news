// Telegram's hard limit is 4096 chars per message. Reserve room for a
// "(2/3)"-style continuation header we may prepend after packing, so packing
// itself never has to know how many chunks it'll end up producing.
const TELEGRAM_MAX_LEN = 4096;
const HEADER_SAFETY_MARGIN = 100;
const EFFECTIVE_MAX = TELEGRAM_MAX_LEN - HEADER_SAFETY_MARGIN;

/**
 * Greedily packs atomic text blocks into chunks, never splitting a single
 * block across chunks. Caller guarantees each block is itself well under
 * the limit — a pathologically long single block is still placed alone in
 * its own chunk rather than dropped.
 */
export function packBlocks(blocks: string[]): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > EFFECTIVE_MAX && current !== '') {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Packs blocks and prepends a title — a plain title on a single message, or
 * a "(n/total)" continuation header on each message when it had to split.
 */
export function splitIntoTelegramMessages(title: string, blocks: string[]): string[] {
  const chunks = packBlocks(blocks);

  if (chunks.length === 0) {
    return [];
  }
  if (chunks.length === 1) {
    return [`${title}\n\n${chunks[0]}`];
  }
  return chunks.map((chunk, i) => `${title} (${i + 1}/${chunks.length})\n\n${chunk}`);
}
