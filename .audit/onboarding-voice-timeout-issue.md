# Onboarding voice timeout offers an unavailable action

Status is open. Found during documentation research on 2026-10-11. UI changes are outside this task's scope.

## Evidence

Static inspection confirms that `expire()` in `apps/web/src/lib/onboarding-live.ts:806-809` tells the person to "choose your skills".

The error-state controls in `apps/web/src/components/onboarding/onboarding-conversation.tsx:293-316` offer restart and a mode switch, not a skills action. The research worker also inspected the existing no-skills-button assertion in `apps/web/src/components/onboarding/onboarding.test.tsx:522-538`. That test was not run.

`replaceAttempt()` and `switchMode()` in `apps/web/src/components/onboarding/onboarding.tsx:317-344` clear conversation history and goal details. Recovery copy must not imply continuation of those answers.

## Follow-up acceptance criteria

- Every recovery action named by the timeout message is available on that screen.
- Restart and mode-switch consequences are clear before activation.
- Copy, visual urgency, and announcements match the actual timeout state.
- Verify the timeout screen and recovery paths in the running app. No runtime reproduction or WCAG conformance assessment was performed during this research.
