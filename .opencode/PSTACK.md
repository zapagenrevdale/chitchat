# pstack installation

Installed for Chitchat only in `.opencode/skills/`, including supporting scripts, references, and license notices. Codex discovers the pstack skills through relative directory symlinks in `.agents/skills/`, as supported by [Codex skill discovery](https://developers.openai.com/codex/skills). No global settings or startup hooks were installed.

Source: https://github.com/michael-denyer/pstack-claude
Revision: `5f07f5e5fe5db545f2a8fb341a9f1c412b09aaa3`
Source directory: `plugins/pstack/skills/`

Root `AGENTS.md` enables poteto-mode by default in this repo. Explicit invocation is `@poteto-mode` in OpenCode or `$poteto-mode` in Codex. Model overrides and runtime adaptations are in `.opencode/pstack-models.md`. Roles inherit the session model unless the user explicitly adopts the configured role selections.

These project skills take precedence over globally installed skills with the same IDs, including `tdd` and `unslop`. The local frontmatter disables OpenCode automatic skill discovery; root `AGENTS.md` supplies default routing. That OpenCode metadata does not configure Codex.

To update, review a new source revision, copy its skills tree, reapply `metadata.opencode/autoinvoke: false` to each skill's frontmatter, and update the revision above. Preserve the project model overrides. Do not run the source's global installation commands.

After updating the skills tree, add or remove the corresponding relative links in `.agents/skills/`. Keep each link pointed at `../../.opencode/skills/<skill-name>` so linked worktrees remain self-contained. If Codex does not refresh its skill list, restart Codex in this repo.
