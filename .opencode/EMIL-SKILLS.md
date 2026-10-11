# Emil Kowalski skills

All 14 skills from [emilkowalski/skills](https://github.com/emilkowalski/skills) are installed locally in `.opencode/skills/`, including their supporting Markdown files.

The source revision is [`e8a175de22ae1e49370fc144c1f3bb9aeedf988d`](https://github.com/emilkowalski/skills/tree/e8a175de22ae1e49370fc144c1f3bb9aeedf988d). Upstream files are unchanged. The MIT license is retained in `EMIL-SKILLS-LICENSE` beside this file. No global configuration or workspace dependencies were changed.

## Available skills

- `emil-design-eng` guides UI polish, component design, and motion decisions.
- `animate` builds web animations.
- `animate-expo` builds React Native and Expo animations.
- `review-animations` reviews existing motion.
- `improve-animations` audits motion and writes implementation plans.
- `find-animation-opportunities` proposes useful motion without implementing it.
- `animation-vocabulary` names animation effects.
- `apple-design` covers interface design and physical motion principles.
- `write-swift` guides modern Swift development.
- `pick-ui-library` recommends libraries.
- `prototype` builds UI variants with a visual picker.
- `mobile-native` improves mobile web interactions.
- `break-ui` stress-tests UI with worst-case data.
- `ask-sonner` guides Sonner toast usage.

## Invocation and repository rules

OpenCode discovers `.opencode/skills/` automatically. `opencode.jsonc` allows each installed skill by exact ID while retaining the default denial for other skills.

Mention a skill with `@emil-design-eng`, `@animate`, or another ID to load it explicitly. Upstream marks `pick-ui-library`, `prototype`, and `review-animations` as explicit-only; their `disable-model-invocation` settings are preserved. The other skills can be discovered by the agent when relevant.

The root `AGENTS.md` directs UI work to Emil's design guidance. Chitchat's existing theme, ReUI-first policy, accessibility requirements, and user-requested scope still take precedence. Native and Swift skills are available for explicit future tasks, not permission to expand the product.

## Updating

Compare a new upstream revision with this pinned source before replacing installed files. Preserve all supporting files and the license. Check for skill-ID collisions, update the exact-ID allowlist if the inventory changes, and record the new revision here. Keep upstream skill content unchanged so future comparisons remain direct.
