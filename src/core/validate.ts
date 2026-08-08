import { EFFORTS, MODES, type Preset } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const values = (options: { value: string }[]): string[] => options.map((o) => o.value);

/**
 * Save-time UI validation for the preset editor: name is required; mode/effort
 * must match a known dial value when set (catches a typo in the Save flow). Model
 * is intentionally unrestricted (aliases + future ids). NOTE: this is a UX check
 * in the renderer's Save path only — NOT the load-time/launch-time safety guard
 * (those are normalizePreset coercion + assertSafeDial in the launch dispatcher).
 */
export function validatePreset(preset: Preset): ValidationResult {
  const errors: string[] = [];
  if (!preset.name.trim()) errors.push("Name is required.");
  if (preset.mode && !values(MODES).includes(preset.mode)) errors.push(`Unknown mode: ${preset.mode}`);
  if (preset.effort && !values(EFFORTS).includes(preset.effort)) errors.push(`Unknown effort: ${preset.effort}`);
  return { valid: errors.length === 0, errors };
}

/**
 * A model value must stay within a shell-safe charset. Mirrors the launch dispatcher's
 * SAFE_MODEL but requires non-empty. Brackets are allowed for context-variant ids like
 * `claude-opus-4-8[1m]`; the launch-string builder quotes the token when it isn't bare-safe
 * (shellQuoteIfNeeded / psQuoteIfNeeded), so the brackets reach the shell literally. A leading
 * `-` is still rejected: an unquoted value starting with a dash would reach the CLI as a flag
 * rather than as `--model`'s value.
 */
export const MODEL_VALUE_RE = /^(?!-)[A-Za-z0-9._[\]-]+$/;

export function isValidModelValue(value: string): boolean {
  return MODEL_VALUE_RE.test(value.trim());
}
