# Tooling receipt

Changed only `turbo.json` and `apps/web/package.json` as source files. Saved their dirty baseline copies and the baseline Git diff before editing. `repository-improvement-tooling.scoped.diff` contains only this worker's changes.

- Added root `@chitchat/db#build` with `dependsOn: ["^build"]` and `outputs: ["src/generated/prisma/**"]`.
- Added `@chitchat/backend#test` with `dependsOn: ["^build"]` and inputs `$TURBO_DEFAULT$` and `$TURBO_ROOT$/apps/web/public/images/personas/**`.
- Changed the web test command to `vitest run`.

## Verification

Installed Turbo 2.10.12 accepted both task definitions in `bun run build --filter=@chitchat/db --dry=json` and `bun run test --filter=@chitchat/backend --dry=json`. Before and after JSON snapshots are retained under this audit prefix.

`python3 .audit/repository-improvement-tooling.verify-cache.py` passed. It first copied the original generated directory, ran `bun run build --filter=@chitchat/db --force --ui=stream`, moved the generated directory to a unique audit backup, and ran `bun run build --filter=@chitchat/db --ui=stream`. The second build reported a cache hit. All 12 files were restored byte-for-byte, including `client.ts`. The original and generated backups remain in `.audit/repository-improvement-tooling.cache-91c5ca0f36c84f078151c4c2185e0779.original` and `.backup`. No generated user files were deleted. The experiment is complete, with no background process running.

`python3 .audit/repository-improvement-tooling.verify-inputs.py` passed. It compared dry-run hashes for every one of the 30 SVG files to each file's Git blob hash. None appeared in the baseline backend inputs. All appear after the change. Default backend inputs and all four build dependencies remain. The attribution file is also included by the configured glob. No asset was mutated.

`bun run test --filter=@chitchat/web --ui=stream` passed with 29 test files and 331 tests. Its log confirms `$ vitest run` without the permissive flag. The suite emitted canvas and React act warnings; these did not fail the run.

`git diff --check -- turbo.json apps/web/package.json` passed. Inspected the scoped diff against saved baseline copies.

## Caveats

The existing `packages/db/turbo.json` declares `build.outputs: ["src/generated/**"]`. It overrides the new root package-specific output declaration. Both baseline and final dry JSON therefore already show generated outputs. The restoration experiment proves the effective configuration restores generated files; it does not prove the root addition repaired a reproducible baseline defect. That package-local file is outside this worker's write scope and was preserved.

The parent owns full root typecheck, lint, test, and build after all writers finish. This worker did not run those four full checks or an independent review. No commits, dependency changes, or nested agents.

The Prove It Works principle led to actual cache restoration and content-hash verification rather than relying on the JSON edit alone.

## Scoped correction

Removed only the newly added root `@chitchat/db#build` block from `turbo.json`. The existing package-local `packages/db/turbo.json` already supplies the effective generated outputs. Backend test inputs and all saved dirty baseline work are preserved. The earlier entries and experiment artifacts remain as historical evidence.

`bun run build --filter=@chitchat/db --dry=json` passed with Turbo 2.10.12. The corrected snapshot is `.audit/repository-improvement-tooling.corrected-build.json`. Its `@chitchat/db#build` task resolves to `outputs: ["src/generated/**"]`, `dependsOn: ["^build"]`, and `cache: true`.

Recomputed and inspected the scoped diff against `.audit/repository-improvement-tooling.baseline.turbo.json` and `.audit/repository-improvement-tooling.baseline.web-package.json`. It matches the previous scoped diff exactly after removing the root DB build addition. The remaining changes are backend test inputs and the original web test command correction. No restoration experiment or full checks were rerun for this correction.

`git diff --check -- turbo.json apps/web/package.json` passed after the correction.
