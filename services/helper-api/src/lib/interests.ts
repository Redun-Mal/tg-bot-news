const MAX_INTEREST_LENGTH = 60;

export interface InterestValidationResult {
  valid: boolean;
  interest: string | null;
  error: string | null;
}

/**
 * Format-only validation for /set_interest input — trims, collapses
 * internal whitespace, and caps length. Case-insensitive duplicate
 * checking against existing interests is a DB-side concern for the
 * calling workflow (manage_interests.md), not this function's job.
 */
export function validateInterest(raw: string): InterestValidationResult {
  const trimmed = raw.replace(/\s+/g, ' ').trim();

  if (trimmed.length === 0) {
    return { valid: false, interest: null, error: 'Интерес не может быть пустым.' };
  }

  if (trimmed.length > MAX_INTEREST_LENGTH) {
    return {
      valid: false,
      interest: null,
      error: `Слишком длинно (максимум ${MAX_INTEREST_LENGTH} символов).`,
    };
  }

  return { valid: true, interest: trimmed, error: null };
}
