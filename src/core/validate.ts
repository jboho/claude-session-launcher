import { EFFORTS, MODES, type Preset } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const values = (options: { value: string }[]): string[] => options.map((o) => o.value);

/**
 * Deterministic, fs-free validation. Model is intentionally NOT restricted
 * (aliases + arbitrary future ids are allowed); mode/effort must match a known
 * value when set, to catch corruption in a hand-edited presets.json.
 */
export function validatePreset(preset: Preset): ValidationResult {
  const errors: string[] = [];
  if (!preset.name.trim()) errors.push("Name is required.");
  if (preset.mode && !values(MODES).includes(preset.mode)) errors.push(`Unknown mode: ${preset.mode}`);
  if (preset.effort && !values(EFFORTS).includes(preset.effort)) errors.push(`Unknown effort: ${preset.effort}`);
  return { valid: errors.length === 0, errors };
}
