import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevBenchEnabled } from "../../lib/devBench";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the local dev-bench gate", () => {
  it.each([
    { nodeEnv: "development", flag: undefined, expected: false },
    { nodeEnv: "development", flag: "0", expected: false },
    { nodeEnv: "development", flag: "1", expected: true },
    { nodeEnv: "production", flag: "1", expected: false },
  ])(
    "is $expected for NODE_ENV=$nodeEnv and NEXT_PUBLIC_DEV_BENCH=$flag",
    ({ nodeEnv, flag, expected }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("NEXT_PUBLIC_DEV_BENCH", flag);

      expect(isDevBenchEnabled()).toBe(expected);
    },
  );
});
