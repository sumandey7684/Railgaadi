/**
 * Strict train number validation for provider-facing paths.
 * Only 4–5 digit numeric IDs are accepted.
 */
export function isValidTrainId(raw: string): boolean {
  return /^\d{4,5}$/.test(raw.trim());
}

/** Normalize and validate a train ID. Returns null when malformed. */
export function parseTrainId(raw: string): string | null {
  const id = raw.trim();
  if (!isValidTrainId(id)) return null;
  return id;
}

export const INVALID_TRAIN_ID_ERROR =
  'Invalid train ID. Use a 4–5 digit train number.';
