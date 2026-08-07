import { z } from 'zod';

export const CATEGORIES = [
  'world',
  'technology',
  'programming',
  'gaming',
  'roblox',
  'business',
  'central_asia',
  'other',
] as const;

/**
 * Contract Claude must return: valid JSON only, no markdown, no extra prose.
 * Mirrors the exact shape/rules from the project spec (importance 1-4,
 * relevance/confidence 0-1, at least one category).
 */
export const classificationSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  why_it_matters: z.string().min(1),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  importance: z.number().int().min(1).max(4),
  relevance: z.number().min(0).max(1),
  is_advertisement: z.boolean(),
  is_duplicate: z.boolean(),
  language: z.string().min(1),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});

export type Classification = z.infer<typeof classificationSchema>;

export interface ValidationResult {
  valid: boolean;
  data: Classification | null;
  errors: string[] | null;
}

/**
 * Accepts the raw string Claude returned (not pre-parsed JSON) — a model
 * that ignores the "no markdown" instruction and wraps the JSON in a code
 * fence is a real, common failure mode this must not choke on before even
 * getting to schema validation.
 */
export function validateClassification(rawResponse: string): ValidationResult {
  const stripped = rawResponse
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripped);
  } catch {
    return { valid: false, data: null, errors: ['Response is not valid JSON'] };
  }

  const result = classificationSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      valid: false,
      data: null,
      errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  return { valid: true, data: result.data, errors: null };
}
