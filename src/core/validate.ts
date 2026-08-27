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
/**
 * Charset guards mirroring the Rust launch builder (is_safe_worktree_name / is_safe_output_style
 * / is_safe_thinking_budget): a branch-like worktree name with no leading `-`; an output-style
 * name safe inside the `--settings` JSON; a decimal-only thinking budget. Each allows empty
 * (the field is optional), so callers guard with `if (value && !RE.test(value))`.
 */
export const WORKTREE_NAME_RE = /^(?!-)[A-Za-z0-9._/-]*$/;
export const OUTPUT_STYLE_RE = /^[A-Za-z0-9 _-]*$/;
export const THINKING_BUDGET_RE = /^[0-9]*$/;

export function validatePreset(preset: Preset): ValidationResult {
  const errors: string[] = [];
  if (!preset.name.trim()) errors.push("Name is required.");
  if (preset.mode && !values(MODES).includes(preset.mode)) errors.push(`Unknown mode: ${preset.mode}`);
  if (preset.effort && !values(EFFORTS).includes(preset.effort)) errors.push(`Unknown effort: ${preset.effort}`);
  if (preset.worktreeName && !WORKTREE_NAME_RE.test(preset.worktreeName))
    errors.push(`Invalid worktree name: ${preset.worktreeName}`);
  if (preset.outputStyle && !OUTPUT_STYLE_RE.test(preset.outputStyle))
    errors.push(`Invalid output style: ${preset.outputStyle}`);
  if (preset.thinkingBudget && !THINKING_BUDGET_RE.test(preset.thinkingBudget))
    errors.push(`Invalid thinking budget: ${preset.thinkingBudget}`);
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
