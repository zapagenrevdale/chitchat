import { afterEach, beforeEach, vi } from "../apps/backend/node_modules/vitest/dist/index.js";

beforeEach(() => {
  const any = AbortSignal.any.bind(AbortSignal);
  let calls = 0;
  vi.spyOn(AbortSignal, "any").mockImplementation((signals) => {
    calls += 1;
    return calls === 2 ? new AbortController().signal : any(signals);
  });
});

afterEach(() => vi.restoreAllMocks());
