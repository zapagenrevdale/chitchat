# OpenAI models for pstack: evidence and role recommendations

**Research date / source access date:** 2026-10-11  
**Scope:** Recommendations for the six OpenAI IDs confirmed in this session's OpenCode catalog, for a user with a Codex subscription. Primary sources only: OpenAI announcements, developer documentation, and system cards. This is research, not a configuration change or a pstack execution.

## Executive conclusion

**Use GPT-6.1 Sol for most substantive work, GPT-6 Luna for bounded exploration and repeatable tooling, and GPT-6 Astra for the hardest judgment and escalation.** This capability split is supported by both published evaluations and OpenAI's current [Codex model guidance][models]. The exact pstack role assignments below remain **provisional workflow recommendations**, not benchmark-proven pstack winners.

- **Sol, Luna, Astra, and Terra are publicly corroborated**, not unknown aliases: OpenAI documents `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-astra`, and the GPT-5.6 Terra tier in its own announcements/docs. No inference from private labels to unrelated public models is needed. [S1][S2][S3][S4]
- **Do not recommend Spark for subscription-backed dispatch:** current docs say GPT-5.3-Codex-Spark retired on **September 14, 2026**, despite the runtime catalog still listing it active. [models]
- **Do not build a durable role policy around GPT-5.5:** it retires from ChatGPT-sign-in Codex on **October 14, 2026**; the API is unaffected. [models]
- **Catalog presence is not entitlement.** Confirm the subscription tier, authentication route, actual model access, and dispatch/effort support before adopting any assignment. Empty catalog cost arrays do not mean free usage. [models][pricing]
- **Do not rank current models solely by SWE-bench:** OpenAI stopped reporting Verified after contamination/test issues, then retracted its recommendation of Pro after finding approximately 30% of Pro tasks broken. Prefer a bundle of newer coding, terminal, debugging, and alignment evidence, followed by repository-specific trials. [verified][pro-audit]

## Repository context and scope boundaries

Read root `AGENTS.md`, `.opencode/pstack-models.md`, `.opencode/skills/setup-pstack/SKILL.md`, and the nearby research note's conventions. No nested `AGENTS.md` was found under `docs/`. No private scratchpad was accessed.

Current project policy: every role is `inherit-parent`; arena, architect, and interrogate each use three independent attempts; default effort is `session`; hook is off; there are no per-role effort overrides. The setup skill defines the role rows and explains that panel list length controls fan-out; aliases still count as attempts. A same-model panel is not a multi-model review. Project-local OpenCode adaptations override the bundled skill's generic global configuration instructions. **None of these files or settings was changed.**

## Catalog versus public evidence

The IDs/variants below are supplied runtime facts, not a fresh entitlement test. The `openai/` prefix belongs to the harness; public OpenAI model names omit it.

| Runtime ID | Catalog effort variants | Primary-source corroboration and recommendation status |
|---|---|---|
| `openai/gpt-6.1-sol` | low, medium, high, xhigh, max | Exact public API slug documented; current recommended model for complex coding/agentic workflows. Main default candidate. [S1][models] |
| `openai/gpt-6-luna` | none, low, medium, high, xhigh, max | Exact public API slug documented; recommended for focused, repeatable/high-volume work. [S2][models] |
| `openai/gpt-6-astra` | low, medium, high, xhigh, max | Exact public API slug documented; strongest-capability escalation candidate. [S3][models] |
| `openai/gpt-5.6-terra` | none, low, medium, high, xhigh, max | Public model tier and continued Codex rollout availability documented; useful optional comparison arm, not preferred general default. [S4][models] |
| `openai/gpt-5.5` | none, low, medium, high, xhigh | Public model with extensive scores; subscription retirement imminent. Historical comparator or independently authorized API fallback only. [S5][models] |
| `openai/gpt-5.3-codex-spark` | none, low, medium, high, xhigh | Public model, but retired from subscription Codex; catalog listing conflicts with current service docs. Exclude from practical subscription recommendations. [S6][models] |

**Evidence limitation:** These sources corroborate model identity, not that OpenCode's provider currently routes each ID to the same snapshot, exposes every listed effort correctly, or grants this user's account access. No authenticated model calls were made. Do not replace missing future evidence with name-based assumptions.

The parent session independently verified that OpenCode stores **OpenAI OAuth** credentials. That supports a subscription-authentication route, not a particular subscription tier or entitlement to every catalog entry. It also verified OpenCode V2's per-agent model references use **`provider/model#variant`**: for example, `openai/gpt-6-luna#high` or `openai/gpt-6-astra#low`. These are recommendation examples, not configuration changes. Do not translate the bundled Claude `@effort` syntax into an OpenCode recommendation.

## Benchmark evidence

### Current coding and reasoning signals

| Source / evaluation | Published result | What it supports; limitations |
|---|---|---|
| GPT-6.1 Sol launch: DeepSWE v1.1 | OpenAI says Sol matches Astra at roughly one-fifth the cost, and exceeds GPT-6 Sol's best score by **6.4 percentage points** at lower effort/cost. | Strong general engineering-default evidence. The fetched prose does not give Sol's absolute score or the exact matching effort: neither is invented here. [S1] |
| Sol/Luna launch: DeepSWE v1.1 | GPT-6 Luna **66.6% at max**; GPT-6 Sol **68.8% at max**. | Luna is credible for scoped engineering, not only clerical work. Does not demonstrate Luna-high parity or superiority to GPT-6.1 Sol. [S2] |
| Astra launch: coding table | Astra **74.1% DeepSWE v1.1**, **57.9% Terminal-Bench 4.0**, **64.5% FrontierCode 1.1 Extended**, **53.3% FrontierCode 1.1 Main**. | Broad high-end engineering signal. Table scores are the maximum observed at any effort, not a single uniform effort run. FrontierCode includes mergeability concerns; Astra's Main result is not highest against every comparator in that table. [S3] |
| GPT-6.1 Sol system card: Internal Research Debugging | Sol **75.52% mean rubric score**, Astra **78.05%**, GPT-6 Sol **64.20%**, GPT-5.6 Sol **68.32%**. | Particularly relevant to hard bug-fix/investigation roles. Internal research debugging is not a direct Chitchat application-debugging benchmark. [card] |
| GPT-6.1 Sol launch: Terminal-Bench Science 0.1 | Sol at max more than doubles GPT-6 Sol's score; average task cost **$5.47** versus Astra **$23.80**. Astra has highest score, **68.1% at max**. | Supports Sol for repeated technical investigation and Astra for hardest science-like tasks. Science 0.1 is not Terminal-Bench 2.0/2.1/4.0; do not compare these versions as one scale. [S1] |
| Astra launch: reasoning | **96.0% GPQA Diamond**, **97.6% FrontierMath Tier 4 v2**, **99.9% ARC-AGI-3**, **95.0% ARC-AGI-2**. | Supports strongest-judgment escalation, not proof of best architectural taste or review precision. ARC-AGI-3 uses OpenAI's specified Responses harness settings. [S3] |
| GPT-5.6 launch: Terra versus GPT-5.5, same table | Terra **63.4% versus 59.4% SWE-Bench Pro**, **69.6% versus 67.0% DeepSWE v1.1**, **87.4% versus 85.6% Terminal-Bench 2.1**. GPQA **92.9% versus 93.6%**; FrontierMath Tier 4 v2 **68.3% versus 72.5%**. | Terra is a defensible legacy balanced coding/comparison option, but not uniformly better at reasoning. Pro is weak evidence given the audit; no direct Terra versus GPT-6.1 Sol comparison is established here. [S4][pro-audit] |

The Astra launch reports **64.6%** Terminal-Bench Science 0.1 in its own table, whereas the later Sol announcement reports Astra **68.1% at max**. Retain the source/version/effort distinction; do not silently merge them. The Sol system card explicitly says comparison models can be later versions and therefore differ from launch scores. [S1][S3][card]

### Requested SWE-bench and historical Terminal-Bench comparisons

- **GPT-5.5 launch:** SWE-Bench Pro Public **58.6%**, Terminal-Bench **2.0 82.7%**, Expert-SWE Internal **73.1%**, GPQA Diamond **93.6%**, HLE **41.4% without tools / 52.2% with tools**, at **xhigh**. Its later comparison score of **59.4%** in the GPT-5.6 announcement is not the same launch result. [S5][S4]
- **Spark launch:** OpenAI reports strong SWE-Bench Pro and Terminal-Bench 2.0 performance at a fraction of GPT-5.3-Codex's task duration, but the fetched text does **not** expose numeric chart scores. No scores are guessed, and full GPT-5.3-Codex results must not be attributed to Spark. [S6]
- **Verified:** No current Verified score was established for these six models in the reviewed sources. OpenAI's February audit found **59.4% of the audited 138-task hard subset**, not 59.4% of the entire dataset, had material issues; it also found evidence of contamination. [verified]
- **Pro:** The July audit flags **200/731 (27.4%)** tasks through its pipeline and **249/731 (34.1%)** through human annotation, estimates about 30% broken, and retracts its earlier recommendation to adopt Pro. Historical Pro scores belong in the record, but should not drive the role split alone. [pro-audit]

**Interpretation:** These are first-party reported measurements, not independent replication in OpenCode. Effort, snapshots, prompts, tools, scaffolding, benchmark versions, and task sets differ. An internal research debugging rubric, academic reasoning test, and repository issue-resolution pass rate cannot be averaged into a defensible universal ranking.

The parent session separately checked the benchmark owner's [Terminal-Bench 4.0 announcement](https://www.tbench.ai/news/terminal-bench-4-0), dated August 28, 2026: 4.0 is the latest major version, and changes to datasets/resources mean major versions require fresh trials rather than score comparisons across versions. SWE-bench Verified primarily covers Python, whereas Chitchat is TypeScript; even a clean score would not directly validate this app's stack. [verified]

### Alignment matters for reviewers and tool-owning agents

GPT-6.1 Sol's system card reports coding misrepresentation **1.50%**, versus Astra **0.51%** and GPT-6 Sol **1.30%**, on deliberately challenging tasks; Sol is not uniformly best on every behavior metric. Broken-search non-disclosure is **2.08%** for GPT-6.1 Sol versus **4.92%** for GPT-6 Sol. GPT-6.1 Sol and Astra made no attempts to bypass the tested Auto-review monitor. Internal deployment simulation reports severity-3-or-higher flags on **0.056%** of matched tasks for GPT-6.1 Sol and **0.054%** for Astra. These are evaluation-specific observations, not production guarantees or evidence that review findings are correct. Keep tool permissions, evidence requirements, and human control regardless of model. [card]

## Latency, access, and usage accounting

### What is actually documented

- **Spark's historical speed:** over **1,000 tokens/second**, text-only **128k context**, lightweight targeted edits and no automatic test runs unless requested. Launch Pro preview usage had separate rate limits and did not count toward standard limits. This is historical, not a current-access promise: later retirement documentation takes precedence. [S6][models]
- **GPT-5.5 historical speed:** matched GPT-5.4 per-token latency and used fewer tokens on Codex tasks. Launch Fast mode claimed **1.5x generation speed for 2.5x cost**. Not a current policy for newer models. [S5]
- **Astra:** launch OSWorld simulations report about **47% less task time** than GPT-5.6 Sol at higher performance; this does not prove Astra is faster on repository coding. [S3]
- **Current model guidance:** start GPT-6.1 Sol at the client's default, **Luna at high**, **Astra at low**; higher effort takes longer and uses more tokens. Max is for hardest single tasks; Ultra is a separate multi-agent mode, not another spelling of max, and is not among the provided catalog variants. Efforts do not map exactly across generations. [models]
- **Current speed billing:** Fast consumes **2.5x included subscription usage**, or **2x purchased credits**; Sol/Astra Ultrafast consumes **8x included usage**, or **6x purchased credits**. Ultrafast eligibility includes Pro $500 and eligible Enterprise/Edu, not every paid plan. Do not equate an effort variant with a speed service tier. [pricing]

There is no verified current absolute tokens/second or end-to-end pstack latency comparison for Sol, Luna, Astra, and Terra here. OpenAI's speed icons are qualitative. Benchmark cost/latency plots and launch announcements cannot establish this user's OpenCode performance.

### Subscription is not an unlimited/free API budget

OpenAI distinguishes ChatGPT sign-in (subscription allowance) from API-key usage (separate API billing). Work and Codex share usage. Context, reasoning, tools, retrieval, caching, model, and task complexity all affect consumption. Local pstack-style review is **general usage**, not the separate GitHub Code Review category. Verify the OpenCode authentication route rather than assuming the subscription pays for every provider request. [pricing]

The current pricing page estimates the following **local messages per five-hour period for Plus and Standard Business**, not fixed or guaranteed counts: Astra **5–45**, GPT-6.1 Sol **15–160**, GPT-6 Sol **15–150**, Luna **350–3,000**. Cloud work can consume more; weekly limits may also apply. Pro currently has no five-hour limit per that page, which does not mean unlimited weekly usage. Check the actual [usage dashboard](https://chatgpt.com/codex/settings/usage) and, in Codex CLI, `/status`. [pricing]

| Catalog candidate | Standard credits per 1M input / cached input / output tokens |
|---|---|
| GPT-6.1 Sol | 50 / 2.5 / 250 |
| GPT-6 Luna | 2.5 / 0.25 / 12.5 |
| GPT-6 Astra | 250 / 25 / 1,250 |
| GPT-5.6 Terra | 50 / 5 / 300 |
| GPT-5.5 | 125 / 12.5 / 750 |

These are **credit billing rates**, not a formula for converting included subscription allowances into tasks; Codex credit billing has no separate cache-write charge. Current API prices documented for Sol, Luna, and Astra are respectively **$2/$10**, **$0.10/$0.50**, and **$10/$50** per 1M standard input/output tokens. API prices and task-cost benchmarks must not be substituted for subscription usage accounting. Spark has no current subscription credit recommendation here. [pricing][S1][S2][S3]

## Suggested pstack assignments — recommendations only

**Evidence-based tier selection, provisional role allocation.** OpenAI directly recommends Sol for complex coding, Luna for repeatable tasks, and Astra for the hardest sustained reasoning. No reviewed source compares pstack roles. Every exact role choice is an engineering inference; any named effort below is a starting point to validate, not an implemented override. Use the exact runtime IDs from the catalog table.

| Project role | Suggested model / effort starting point | Reason and escalation boundary |
|---|---|---|
| feature, refactoring | GPT-6.1 Sol / session default | Strong long-horizon engineering evidence; use high for cross-cutting work, Astra for especially consequential ambiguity. [S1][models] |
| bug-fix | GPT-6.1 Sol / session default | Internal research-debugging improvement supports investigation; escalate difficult failures to Astra after evidence gathering. [card] |
| perf-issue | GPT-6.1 Sol / high, provisional | Debugging/kernel-optimization evidence is relevant, but not direct Bun/Hono/React performance evidence. Require measured baselines; Astra for stubborn optimization problems. [card] |
| hillclimb | GPT-6.1 Sol / session default | Repeated technical iteration favors capable, efficient runs. Luna only for narrow, mechanically scored iterations; Astra when search depth is the bottleneck. [S1][models] |
| judgment and prose | GPT-6.1 Sol / session default | Professional-work and communication evidence; no dedicated pstack prose benchmark. [S1][models] |
| strongest judgment | GPT-6 Astra / low initially | Published reasoning and alignment support this tier; increase to high/xhigh on consequential tradeoffs rather than assuming max is always best. [S3][card][models] |
| how explorer | GPT-6 Luna / high | Good for bounded file discovery and structured evidence gathering; Sol for large ambiguous codepaths or subtle invariants. [models] |
| how explainer | GPT-6.1 Sol / session default | Synthesis requires connecting evidence, not merely locating it. [S1][models] |
| why investigators | GPT-6.1 Sol / session default | Causal investigation benefits from debugging capability; Luna may gather a narrowly specified history/source slice. [card][models] |
| why synthesizer | GPT-6.1 Sol / high, provisional | Resolve competing causal explanations; Astra for high-doubt/high-impact conclusions. [card][S3] |
| reflect tooling | GPT-6 Luna / high | Appropriate for bounded transformations and extraction; Sol if tool changes require design or broader code changes. [models] |
| reflect judgment, divergent, synthesizer | GPT-6.1 Sol / session default | Reflection is synthesis/judgment; Astra escalation rather than routinely paying for it on every attempt. [S1][models] |
| arena runners | Three attempts: Sol, Luna, Astra | Preserve the existing count; evaluate capability/usage tradeoffs. Luna only if the shared task is suitably bounded; otherwise Sol, Sol, Astra. [models] |
| arena cross-judge pool | Astra, Sol | Prefer the other model than the runner when possible; require evidence-based judgments. Distinct models are not independent provider families. [S3][card] |
| swarm workers | GPT-6.1 Sol / session default | Safe general baseline because worker scope varies; assign Luna explicitly to bounded repeatable arms. Do not silently assume every worker is trivial. [models] |
| architect runners | Three attempts: Sol, Sol, Astra | Keep all arms capable on architectural ambiguity. The two Sol runs are independent attempts, not distinct models. Optional Terra arm only to test a genuinely different candidate. [S1][S3][S4] |
| interrogate reviewers | Three attempts: Sol, Sol, Astra | Review requires judgment/evidence; no public finding-precision benchmark establishes Luna as a default reviewer. Optional Terra comparison, not a guaranteed quality improvement. [S3][card] |

**Why not Terra everywhere?** It is a viable legacy balanced model and can outperform GPT-5.5 on several coding evaluations. But current guidance favors GPT-6.1 Sol, and Terra has higher published output-credit rates than Sol with no established current advantage over Sol in these roles. Retain it as an access fallback or controlled comparison candidate, not a compulsory arm for cosmetic diversity. [S4][models][pricing]

**Panel caution:** All candidates are OpenAI models. Different IDs offer model diversity, not cross-provider independence. A three-attempt panel repeats context and consumes allowance for each runner plus judging/synthesis; do not claim an exact 3x usage multiplier without measurement. Do not silently increase the count, enable hooks, or enable native Ultra under the guise of model selection.

## Validation needed before any later configuration decision

1. Confirm actual plan (Plus or which Pro tier), OpenCode authentication mode, enabled model access, and retirement behavior. A small successful request proves access at that time, not perpetual entitlement.
2. Confirm the harness can dispatch the exact ID and apply effort independently per role. OpenCode V2 references use `provider/model#variant`, not Claude `@effort`. Parent verification of this format does not establish that every workflow dispatches it correctly. The project explicitly warns that unavailable tooling should be reported, not imagined.
3. Run user-authorized, scoped comparisons on familiar Chitchat tasks: a bounded feature, causal bug diagnosis, measured performance improvement, architecture tradeoff, and review with known issues. Hold prompts, tools, context, checks, and acceptance criteria constant.
4. Record accepted correctness, unsupported findings, missed issues, scope violations, retries, end-to-end latency, and actual usage changes. Tune effort only where it improves outcomes; reserve max for demonstrated need.
5. Keep manual invocation, hook off, and the existing three-attempt counts unless the user separately chooses otherwise. If future setup is approved, project rules require edits to `.opencode/pstack-models.md` only, never global configuration.

## Sources

All accessed 2026-10-11. Newer operational docs take precedence over historical launch access claims.

- [S1 — Introducing GPT-6.1 Sol][S1]: https://openai.com/index/introducing-gpt-6-1-sol/
- [S2 — Introducing GPT-6 Sol and Luna][S2]: https://openai.com/index/introducing-gpt-6-sol-and-luna/
- [S3 — GPT-6 Astra][S3]: https://openai.com/index/gpt-6-astra/
- [S4 — GPT-5.6 family][S4]: https://openai.com/index/gpt-5-6/
- [S5 — Introducing GPT-5.5][S5]: https://openai.com/index/introducing-gpt-5-5/
- [S6 — Introducing GPT-5.3-Codex-Spark][S6]: https://openai.com/index/introducing-gpt-5-3-codex-spark/
- [Current Codex models, efforts, and retirements][models]: https://developers.openai.com/codex/models (Markdown source: https://developers.openai.com/codex/models.md)
- [Current Codex pricing and usage][pricing]: https://developers.openai.com/codex/pricing
- [GPT-6.1 Sol system card addendum][card]: https://deploymentsafety.openai.com/gpt-6-1-sol
- [SWE-bench Verified audit][verified]: https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
- [SWE-Bench Pro audit and recommendation retraction][pro-audit]: https://openai.com/index/separating-signal-from-noise-coding-evaluations/
- Terminal-Bench owner's 4.0 methodology/release notice (checked by parent session): https://www.tbench.ai/news/terminal-bench-4-0

**Checks:** Documentation-only change. No typecheck, lint, tests, or build required or run; document/diff inspection only. No model access or performance trials performed.

[S1]: https://openai.com/index/introducing-gpt-6-1-sol/
[S2]: https://openai.com/index/introducing-gpt-6-sol-and-luna/
[S3]: https://openai.com/index/gpt-6-astra/
[S4]: https://openai.com/index/gpt-5-6/
[S5]: https://openai.com/index/introducing-gpt-5-5/
[S6]: https://openai.com/index/introducing-gpt-5-3-codex-spark/
[models]: https://developers.openai.com/codex/models
[pricing]: https://developers.openai.com/codex/pricing
[card]: https://deploymentsafety.openai.com/gpt-6-1-sol
[verified]: https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
[pro-audit]: https://openai.com/index/separating-signal-from-noise-coding-evaluations/
