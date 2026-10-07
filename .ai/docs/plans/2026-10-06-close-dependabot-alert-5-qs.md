# Close Dependabot alert #5 (`qs`)

## Goal
Close Dependabot alert #5 by forcing the `qs` package to version 6.16.0 or newer.

## Background
`qs` is not a direct dependency. It comes in through another package, so the fix is a pnpm override, not a version bump in `package.json`.

The safe-pnpm install wrapper blocks packages that were published recently (an age gate). The fixed `qs` release is blocked until after 2026-10-06 09:45 UTC.

## Steps
1. Wait until the age gate allows the fixed `qs` release (after 2026-10-06 09:45 UTC).
2. Check the pnpm 10 override syntax in `pnpm-workspace.yaml` (it currently only has `allowBuilds`). Add `overrides: qs: ^6.16.0`.
3. Run the install through the safe-pnpm wrapper to update `pnpm-lock.yaml`. Confirm the lockfile resolves `qs` to 6.16.0 or newer, and nothing else changed unexpectedly.
4. Run `command pnpm build` and `command pnpm test`.
5. Open a PR against `main`. After merge, confirm that Dependabot alert #5 closes.

## Risks
- If the wrapper still blocks the release, do not bypass it. Wait and retry.
- A major-version jump in `qs` could break the package that uses it. The test run in step 4 checks this.
