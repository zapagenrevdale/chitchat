# Chitchat

Chitchat helps people get comfortable speaking in everyday, social, and professional situations through simulated conversations. The intended experience gives each practice session a setting, a short backstory, a concrete conversational goal, and a time limit. This timed simulation format is planned, not yet implemented. Keep product decisions focused on preparing people for real conversations, and lead product copy with what people can practice. See the [product overview](README.md#product-overview) for context and the distinction between the current experience and planned features.

- `THOUGHTS.md` is a private, human-only scratchpad. Agents must not open, read, search, summarize, quote, interpret, or use it as context. Ignore it completely, including when exploring the repository or determining product direction.
- Use Bun and the pinned workspace dependencies. Root commands run through Turborepo.
- Hono owns authentication, database access, and shared product logic. TanStack Start owns web rendering. Never import `@chitchat/db` into the web app.
- Use the vendored AI Elements primitives in `apps/web/src/components/ai-elements` and shared `chat` components for chat interfaces. Preserve the existing theme and typed streaming transports; see the vendored README for source provenance.
- ReUI is the primary UI source: https://reui.io/components. Check its registry before building custom components. Use ElevenLabs UI for voice/audio and shadcn primitives where ReUI depends on them.
- Follow the app’s existing theme for every UI change. Before editing UI, read `apps/web/src/routes/theme.tsx` and the `ThemeGallery` components it renders; use the `/theme` page as the visual source of truth. Reuse its shared components, semantic color tokens, typography, spacing, button variants, border radii, and shadows. Adapt reference screenshots to this theme rather than copying their styling or introducing a separate visual style, unless the user explicitly requests a theme change.
- Keep Gemini credentials on the backend. Practice uses Gemini 3.1 Flash Live Preview for continuous voice. Hono issues constrained ephemeral tokens; browsers stream audio directly to Gemini. Prefer GEMINI_API_KEY, falling back to GEMINI_API_KEY_LIVE only when missing.
- Onboarding uses Gemini 3.8 Live for native voice and Gemini 3.8 Flash for text. Its voice session is separate from practice and uses constrained `v1beta` tokens. Switching onboarding modes starts a fresh goal conversation; viewing a voice transcript does not switch modes. Do not use browser speech recognition.
- Use Portless for development. Keep app ports dynamic and origins aligned with the active proxy configuration.
- Match validation to the change. Small, low-risk tweaks (colors, typography, spacing, copy, or documentation) do not require typecheck, lint, tests, or a build; inspect the diff and check the affected UI when practical. For localized behavior changes, run relevant targeted checks through Turborepo. For substantial, cross-cutting, dependency, or build/config changes, run `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run build`. If unsure, run the checks relevant to the risk. State which checks ran; never imply skipped checks passed.

## Browser verification in OpenCode

- Use the installed `agent-browser` CLI through the shell for browser interaction and UI verification. Missing Playwright or Puppeteer workspace dependencies do not mean browser automation is unavailable. Check `command -v agent-browser` before reporting a browser-tool blocker.
- Read `agent-browser skills get core` before using it. Use a named, isolated `--session` for the task, snapshot before interacting, and close only that session when finished. Do not attach to the user's browser unless requested.
- Use the active Portless URLs from `.worktree/status.json`. Check changed interactions in the browser, including keyboard recovery, focus, and live-region behavior where relevant. Report mocked checks separately from live backend checks; an axe scan does not replace screen-reader or usability testing.

## Empathetic, plain-language UI

- Chitchat is a consumer product, not a developer tool. Design for people who are unfamiliar with voice apps, distracted, or low in digital confidence. Do not equate technical confidence with age, gender, or parenthood.
- Write like a calm, helpful person. Use familiar words, short sentences, and consistent names for actions. Be respectful, not childish, over-cheerful, or patronizing. Avoid "just", "simply", and "easy" when someone is stuck.
- Explain what happened and what the person can do next. Describe their task, not our implementation. Keep provider names, tokens, protocols, and internal state names out of customer-facing copy.
- Match urgency to the actual situation. Distinguish expected endings, input mistakes, microphone restrictions, and service failures. Use the existing theme's neutral styling for routine updates. Do not automatically turn a normal time limit into a red error. Prefer `role="status"` or a polite live region for routine dynamic feedback without a focus change. Reserve assertive alerts for important, time-sensitive information.
- Make the next step obvious with a clear primary action and visible alternatives where useful. Offer only actions available in the current state. Use labels that describe the result. Fix confusing controls or flows instead of adding paragraphs that explain them.
- Preserve answers where possible. Verify behavior before promising "saved", "continue", or "pick up where you left off". Explain resets before the person chooses them. In onboarding, restarting voice or switching modes starts a fresh goal conversation. Viewing the transcript does not pause the voice deadline. Never imply otherwise.
- Explain voice time limits and why microphone access is needed before starting. Keep a text alternative available. Assess the full timed journey against WCAG timing requirements rather than assuming a countdown or restart button makes it accessible. Do not blame the person for a permission or service failure.
- Reduce memory demands and distractions. Keep instructions near the relevant controls, use familiar patterns, and avoid unnecessary choices. Do not rely on color or icons alone to convey meaning.
- Review the whole interaction, not only the wording. Can a first-time user tell what happened, whether their work is safe, and what to do next without knowing how Chitchat works? Check the actual state, visible controls, and accessibility behavior before declaring the UI clear.
- For changed interactions, check keyboard recovery, focus, and screen reader announcements. For substantial flow changes, seek usability evidence from people with low digital confidence or cognitive access needs. Do not treat an agent's copy review as user testing.

These product rules draw on [GOV.UK interface writing](https://www.gov.uk/service-manual/design/writing-for-user-interfaces), [W3C cognitive accessibility guidance](https://www.w3.org/TR/coga-usable/), [W3C status message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), and [W3C timing guidance](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html). Cognitive accessibility guidance is supplemental advice, not a WCAG conformance checklist.

## Worktrees

- In a new linked worktree, run `bun install --frozen-lockfile`, then `bun run worktree:setup` before `bun run dev`. Setup assigns isolated PostgreSQL resources and stable color-based Portless URLs.
- Read `docs/worktrees.md` for the lifecycle. Use `bun run worktree:status --output .worktree/status.json` to discover URLs and resource status; read the JSON file rather than parsing Turbo logs.
- Run `bun run worktree:check` with the development servers running to execute the standard checks plus database, web, API, CORS, and email smoke checks.
- Before deleting a worktree or removing it after a merge, run `bun run worktree:teardown` while the directory still exists. From another checkout, use `bun run worktree:teardown --directory <path>`.
- Keep `.worktree/` and generated `.env` files local. Reuse the assigned identity; stop development servers before rerunning setup. Copy backend integration settings only when requested, using `--copy-secrets-from <main-checkout>`.

## Agent skills

### Emil Kowalski (project-local)

- All 14 upstream skills are installed under `.opencode/skills/`. For UI design and polish, read `.opencode/skills/emil-design-eng/SKILL.md`; load the relevant motion, mobile, or UI stress-testing skill for the task. See `.opencode/EMIL-SKILLS.md` for the inventory and pinned source.
- Preserve upstream's explicit-only invocation for `pick-ui-library`, `prototype`, and `review-animations`. Users can invoke them with `@pick-ui-library`, `@prototype`, or `@review-animations`.
- Chitchat's theme, ReUI-first component selection, accessibility rules, and task scope take precedence over these skills. Installing native and Swift skills does not authorize adding a native app or new dependencies.

### pstack (project-local)

- pstack is installed under `.opencode/skills/` for this project only. Codex discovers the same files through relative symlinks in `.agents/skills/`. Use `poteto-mode` by default for every task unless the user explicitly opts out. At the start of each session, read `.opencode/skills/poteto-mode/SKILL.md` and follow its routing; load supporting skills as needed.
- Before running a pstack workflow, read `.opencode/pstack-models.md` for project-local model overrides and runtime-specific tool adaptations. On Codex, follow its Codex adaptations section before the bundled tool mapping. When running `setup-pstack`, update that file only; never write global configuration.
- Repository rules, the user's scope, and harness permissions take precedence over pstack's autonomy defaults. Keep `THOUGHTS.md` excluded from every investigation and delegated task.
