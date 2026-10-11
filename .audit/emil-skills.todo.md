# Emil Kowalski skill installation

- [x] Use the **plugin-dev:skill-development** skill (Claude Code's authoring guidance for SKILL.md files).
  - skip: Installing unchanged upstream skills, not authoring skills. The named authoring skill is unavailable.
- [x] Validate the skill: frontmatter has `name` and `description`, referenced files exist, cross-skill links resolve.
  - All 22 installed files match upstream bytes. All 14 local Markdown links resolve. Frontmatter and the three explicit-only flags are preserved.
- [x] Test cases if structural. Skip if subjective.
  - Bun parsed the project config and verified that all 14 IDs are allowed while the default denial remains. OpenCode successfully loaded the installed `animate` skill.
- [x] Run **Opening a PR**.
  - skip: The user requested a repo-local installation, not a PR.

- [x] Identify the official source, pinned revision, license, and existing skill permissions.
- [x] Install all 14 skills and supporting files without replacing existing skills.
- [x] Allow the new skill IDs and document repo-local usage and precedence.
- [x] Verify installed files against upstream and check the permission rules.
  - License matches upstream. Scoped `git diff --check` passed. App typecheck, lint, tests, and build were not run for this skill-only installation.
