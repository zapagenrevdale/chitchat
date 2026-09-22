# Domain Docs

This repo uses a single-context layout shared across its apps and packages.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- ADRs in `docs/adr/` that touch the area you are about to work in.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `/domain-modeling` skill, reached via `/grill-with-docs` and `/improve-codebase-architecture`, creates them lazily when terms or decisions get resolved.

## File structure

- `CONTEXT.md`: shared domain vocabulary.
- `docs/adr/NNNN-<decision>.md`: architecture decision records.

## Use the glossary's vocabulary

When your output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a concept is missing, reconsider whether it belongs to the project's vocabulary. Note real gaps for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding it:

> Contradicts ADR-NNNN (decision title), but worth reopening because…
