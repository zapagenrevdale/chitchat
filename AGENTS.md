# Chitchat

- `THOUGHTS.md` is a private, human-only scratchpad. Agents must not open, read, search, summarize, quote, interpret, or use it as context. Ignore it completely, including when exploring the repository or determining product direction.
- Use Bun and the pinned workspace dependencies. Root commands run through Turborepo.
- Hono owns authentication, database access, and shared product logic. TanStack Start owns web rendering. Never import `@chitchat/db` into the web app.
- ReUI is the primary UI source: https://reui.io/components. Check its registry before building custom components. Use ElevenLabs UI for voice/audio and shadcn primitives where ReUI depends on them.
- Keep Gemini credentials on the backend. Practice uses Gemini 3.1 Flash Live Preview for continuous voice. Hono issues constrained ephemeral tokens; browsers stream audio directly to Gemini. Prefer GEMINI_API_KEY, falling back to GEMINI_API_KEY_LIVE only when missing.
- Use Portless for development. Keep app ports dynamic and origins aligned with the active proxy configuration.
- Run `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run build` before finishing implementation.

## Worktrees

- In a new linked worktree, run `bun install --frozen-lockfile`, then `bun run worktree:setup` before `bun run dev`. Setup assigns isolated PostgreSQL resources and stable color-based Portless URLs.
- Read `docs/worktrees.md` for the lifecycle. Use `bun run worktree:status --output .worktree/status.json` to discover URLs and resource status; read the JSON file rather than parsing Turbo logs.
- Run `bun run worktree:check` with the development servers running to execute the standard checks plus database, web, API, CORS, and email smoke checks.
- Before deleting a worktree or removing it after a merge, run `bun run worktree:teardown` while the directory still exists. From another checkout, use `bun run worktree:teardown --directory <path>`.
- Keep `.worktree/` and generated `.env` files local. Reuse the assigned identity; stop development servers before rerunning setup. Copy backend integration settings only when requested, using `--copy-secrets-from <main-checkout>`.

## Agent skills

### Issue tracker

Issues and specs are tracked locally as Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles as local issue status values. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
