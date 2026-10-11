# RI-005/006 implementation proof

RI-005 was a coverage gap. Existing abortable listeners and identity guards pass late ended/error events and resolved/rejected play promises after stop, replacement and unmount. Tests now hold replacement playback pending so a stale resolution would incorrectly change loading to playing. Unmount assertions verify audio release and no subsequent media side effects; React's ignored state updates on unmounted consumers are not treated as observable proof.

RI-006 reproduced an idle drawing loop, an unowned fade callback and missing final redraw after clearing data. The renderer now owns one nullable drawing handle and a coalesced wakeup. Its active path recurs. The existing producer effect owns one nullable handle for processing or fading. Every producer update, final fade clear, resize and data reset invalidates drawing. Cleanup cancels the latest handles, including handle zero. Existing effects, formulas and borrowed-analyser behavior remain intact.

## Exact checks

`bun run test --filter=@chitchat/web -- src/components/practice/use-persona-preview.test.ts src/components/practice/live-waveform.test.tsx`

- Before production edits, 8 failed and 10 passed. Fresh idle had one queued frame instead of zero. Both static and scrolling fade tests had 50 visible bars instead of zero. Fade unmount retained one queued frame. Restart retained frame 20 instead of an empty old-frame set. StrictMode cleanup also retained one frame. `.audit/repository-followups-waveform.red.log` retains the assertions.
- After production edits and stronger preview coverage, 20 passed across two files. `.audit/repository-followups-waveform.green.log` retains the uncached test result.

`bun run typecheck --filter=@chitchat/web` passed. `.audit/repository-followups-waveform.typecheck.log` retains the result. The route generator emitted its circular-dependency warning.

`bun run lint --filter=@chitchat/web -- src/components/ui/live-waveform.tsx src/components/practice/live-waveform.test.tsx src/components/practice/use-persona-preview.test.ts` passed with zero warnings and zero errors. `.audit/repository-followups-waveform.lint.log` retains the result. The existing lint configuration excludes the vendored UI source from semantic lint; formatting checked all three files and typecheck covered the source.

`git diff --check -- apps/web/src/components/ui/live-waveform.tsx apps/web/src/components/practice/live-waveform.test.tsx apps/web/src/components/practice/use-persona-preview.test.ts` passed.

## Attributable diff

- `.audit/repository-followups-waveform.baseline.diff` captures the dirty scoped baseline against git.
- `.audit/repository-followups-waveform.before.live-waveform.tsx` preserves the production source before editing.
- `.audit/repository-followups-waveform.before.live-waveform.test.tsx` preserves the waveform test before editing.
- `.audit/repository-followups-waveform.before.use-persona-preview.test.ts` preserves the preview test before editing.
- `.audit/repository-followups-waveform.scoped.diff` compares those exact copies against this unit's final three source files.

## Tradeoffs and principles

Laziness Protocol kept the existing effects and visual formulas and removed the dead animationRef. Model the Domain made handle ownership local to each producer/renderer effect and encoded no scheduled work as null. Test Behavior, Not Implementation replaced the onended-null assertion with dispatched events, state transitions, visible bars and live resource queues. Prove It Works required the observed red disagreements and green rerun rather than treating compilation as lifecycle proof.

The RAF fixture snapshots pending IDs per frame, removes a callback before invoking it, respects cancellations within the frame, and defers newly scheduled callbacks to the next frame. Its first handle is zero. Canvas geometry is 200 by 64 and resize changes it to 320 by 64. The canvas tracks visible bars between clears and distinguishes edge-mask drawing from bars.

The two test files locally exempt max-expects because each lifecycle scenario checks both state/output and resource ownership across transitions. Assertions remain outside callbacks caught by production. This is lifecycle verification with a controlled canvas, not a benchmark or pixel-rendering claim. Parent owns real-browser checks, independent review and repository-wide validation.
