import { describe, expect, it } from 'vitest';
import { validateClassification } from '../src/lib/classification-schema.js';

// Fixtures below stand in for real Claude API responses — no live API key is
// available in this environment (see docs/decisions/). Shapes mirror the
// spec's exact contract and known LLM failure modes (markdown-wrapped JSON,
// out-of-range numbers, invalid enum values).

const VALID_RESPONSE = JSON.stringify({
  title: 'Новая версия TypeScript',
  summary: 'Вышла новая версия TypeScript с улучшенной поддержкой типов.',
  why_it_matters: 'Актуально для разработчиков на TypeScript.',
  categories: ['programming'],
  importance: 3,
  relevance: 0.85,
  is_advertisement: false,
  is_duplicate: false,
  language: 'ru',
  confidence: 0.9,
  keywords: ['TypeScript', 'AI'],
});

describe('validateClassification', () => {
  it('accepts a well-formed response matching the spec contract', () => {
    const result = validateClassification(VALID_RESPONSE);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeNull();
    expect(result.data?.categories).toEqual(['programming']);
  });

  it('accepts a response wrapped in a markdown code fence despite the "no markdown" instruction', () => {
    const wrapped = '```json\n' + VALID_RESPONSE + '\n```';
    const result = validateClassification(wrapped);
    expect(result.valid).toBe(true);
  });

  it('accepts multiple categories', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.categories = ['programming', 'technology'];
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(true);
    expect(result.data?.categories).toEqual(['programming', 'technology']);
  });

  it('rejects non-JSON garbage', () => {
    const result = validateClassification('Sorry, I cannot help with that.');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Response is not valid JSON');
  });

  it('rejects a response missing a required field', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    delete parsed.why_it_matters;
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e) => e.startsWith('why_it_matters'))).toBe(true);
  });

  it('rejects importance out of range (0)', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.importance = 0;
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects importance out of range (5)', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.importance = 5;
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects relevance outside 0-1', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.relevance = 1.5;
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects confidence outside 0-1', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.confidence = -0.1;
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects an unknown category', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.categories = ['sports'];
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects an empty categories array', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.categories = [];
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('rejects wrong types (importance as a string)', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.importance = '3';
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(false);
  });

  it('tolerates unexpected extra fields rather than rejecting the whole response', () => {
    const parsed = JSON.parse(VALID_RESPONSE);
    parsed.extra_field_the_model_made_up = 'ignore me';
    const result = validateClassification(JSON.stringify(parsed));
    expect(result.valid).toBe(true);
  });
});
