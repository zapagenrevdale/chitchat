# pstack model configuration

Project-local model preferences. Set the subagent tool's `model` parameter only when the user explicitly requests a particular model or variant, including an explicit request to use this file's configured role selections. Repository instructions alone do not satisfy that condition. Within the user's requested scope, resolve the configured models and variants with the models tool, then pass each role's full `provider/model#variant` reference. Do not guess unavailable model IDs or use the bundled Claude family names. Repeated panel entries are independent attempts using the same model.

Without an explicit model request, continue applicable pstack workflows with `model` omitted. Report unmet model-diversity requirements and keep any review gate that requires them closed. The model and variant rules below apply only within the user's explicit request.

## Session-opening request

The user can send or explicitly adopt this request for each new session. Its presence in this file does not activate it.

> Use pstack for all tasks in this session, including the specific role models and variants configured in `.opencode/pstack-models.md`. Delegate whenever its workflows require it.

## Role selections

feature, refactoring: openai/gpt-6.1-sol#high
bug-fix: openai/gpt-6.1-sol#high
perf-issue: openai/gpt-6.1-sol#xhigh
hillclimb: openai/gpt-6.1-sol#high
judgment and prose: openai/gpt-6.1-sol#high
strongest judgment: openai/gpt-6-astra#medium
how explorer: openai/gpt-6-luna#xhigh
how explainer: openai/gpt-6.1-sol#high
why investigators: openai/gpt-6.1-sol#xhigh
why synthesizer: openai/gpt-6.1-sol#xhigh
reflect tooling: openai/gpt-6-luna#xhigh
reflect judgment, divergent, synthesizer: openai/gpt-6.1-sol#high
arena runners: openai/gpt-6.1-sol#high, openai/gpt-6-luna#xhigh, openai/gpt-6-astra#medium
arena cross-judge pool: openai/gpt-6-astra#medium, openai/gpt-6.1-sol#xhigh
swarm workers: openai/gpt-6.1-sol#high
architect runners: openai/gpt-6.1-sol#xhigh, openai/gpt-6.1-sol#xhigh, openai/gpt-6-astra#medium
interrogate reviewers: openai/gpt-6.1-sol#xhigh, openai/gpt-6.1-sol#xhigh, openai/gpt-6-astra#medium

default effort: high
session hook: off

## OpenCode adaptations

- Default invocation: follow `poteto-mode` for every task unless the user explicitly opts out. Root `AGENTS.md` loads this policy and the workflow instructions; `@poteto-mode` is optional. No session hook is required.
- Map Claude `Skill` to `skill`, `Agent` to `subagent`, and `AskUserQuestion` to `question`. Use the available read, search, patch, and shell tools rather than Claude-specific tool names.
- Use the `general` subagent for workflow roles and `explore` for repository exploration. Include the relevant skill instructions, repository constraints, and this model policy in delegated prompts.
- Reasoning is encoded in each model's native `#variant`; preserve it when dispatching. Do not use Claude `@effort` suffixes or effort-agent wrappers. An explicit variant overrides `default effort`; use `#high` for an unqualified model reference whose role has no effort override.
- Keep Astra at medium or higher. Escalate its hardest tasks to `#high` or `#xhigh`. Escalate difficult Sol debugging and synthesis to `#xhigh`; do not default every task to max.
- Use Luna `#xhigh` only for bounded exploration, extraction, and repeatable tooling. Use Sol for ambiguous or cross-cutting work. For difficult arena tasks, replace the Luna seat with Sol `#xhigh`; keep three seats. Bounded swarm arms may explicitly use Luna `#xhigh`.
- Never claim repeated Sol seats are distinct models or that an all-OpenAI panel provides cross-provider diversity. Prefer a different model from the parent for cross-judging when possible.
- Keep Standard speed where supported; reasoning variants do not select Fast, Ultrafast, or native Ultra. Do not change speed modes as part of role dispatch.
- Tools, plugins, scheduling, or agent messaging unavailable in this harness are not installed by these skills. State limitations rather than claiming those steps ran.
- Setup changes stay in this file. OpenCode V2 does not load the config's `instructions` array; root `AGENTS.md` directs agents to read this file.

## Codex adaptations

- Use the same project-local skills and this model sheet. Root `AGENTS.md` enables `poteto-mode` by default. Explicit invocation is `$poteto-mode` in Codex.
- Keep all setup changes in this repository. Do not follow upstream instructions to write `~/.codex/config.toml`, install global skills, or install startup hooks. `setup-pstack` updates this sheet only.
- Read `.opencode/skills/poteto-mode/references/codex-tools.md` for workflow mappings, but use tools actually exposed by the current Codex session. Use `exec_command` for shell commands and `apply_patch` for edits. Use the available user-input tool for questions and the available collaboration tools for delegation.
- The explicit model-request policy above also applies to Codex. Otherwise omit both `model` and `reasoning_effort` and inherit the session settings. When explicitly authorized, translate `openai/<model>#<variant>` into the available Codex model ID and `reasoning_effort`. Never pass the OpenCode reference verbatim. Confirm model and effort availability from the current tool schema.
- If a model override requires a fresh context, use `fork_turns: "none"` and include the task brief and repository constraints. Do not invent unavailable agent types, tools, or models. Report unavailable required review capabilities.
- OpenCode's `metadata.opencode/autoinvoke` setting does not configure Codex. Repository instructions control default routing here.
