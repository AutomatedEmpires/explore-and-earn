import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authedClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../src/client.js", () => ({ authedClient: mocks.authedClient }));

import {
  getSeekerHostDiscoverySetting,
  setSeekerHostDiscoverySetting,
} from "../src/queries/seekerProfiles.js";

function profileChain(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: "10000000-0000-0000-0000-000000000001",
    error: null,
  });
  mocks.authedClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
});

describe("seeker host-discovery consent", () => {
  it("preserves the explicit database false value", async () => {
    const chain = profileChain({
      data: { host_discovery_enabled: false },
      error: null,
    });
    mocks.from.mockReturnValue(chain);

    await expect(
      getSeekerHostDiscoverySetting("token", "user_seeker"),
    ).resolves.toEqual({ ok: true, enabled: false });
    expect(mocks.from).toHaveBeenCalledWith("seeker_profiles");
    expect(chain.select).toHaveBeenCalledWith("host_discovery_enabled");
    expect(chain.eq).toHaveBeenCalledWith("clerk_user_id", "user_seeker");
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("treats a confirmed missing profile as off, not as a load outage", async () => {
    mocks.from.mockReturnValue(profileChain({ data: null, error: null }));

    await expect(
      getSeekerHostDiscoverySetting("token", "user_seeker"),
    ).resolves.toEqual({ ok: true, enabled: false });
  });

  it("rejects a non-boolean write before creating a database client", async () => {
    await expect(
      setSeekerHostDiscoverySetting("token", "user_seeker", "true"),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_host_discovery_setting",
    });
    expect(mocks.authedClient).not.toHaveBeenCalled();
  });

  it("updates only the consent column and verifies the returned value", async () => {
    const chain = profileChain({
      data: { host_discovery_enabled: true },
      error: null,
    });
    mocks.from.mockReturnValue(chain);

    await expect(
      setSeekerHostDiscoverySetting("token", "user_seeker", true),
    ).resolves.toEqual({ ok: true, enabled: true });
    expect(chain.update).toHaveBeenCalledWith({ host_discovery_enabled: true });
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_my_seeker_profile");
    expect(chain.select).toHaveBeenCalledWith("host_discovery_enabled");
    expect(chain.eq).toHaveBeenCalledWith(
      "id",
      "10000000-0000-0000-0000-000000000001",
    );
    expect(chain.eq).toHaveBeenCalledWith("clerk_user_id", "user_seeker");
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("does not claim success when the owned row is absent or the echo differs", async () => {
    mocks.from.mockReturnValueOnce(profileChain({ data: null, error: null }));
    await expect(
      setSeekerHostDiscoverySetting("token", "user_seeker", true),
    ).resolves.toEqual({ ok: false, error: "profile_not_found" });

    mocks.from.mockReturnValueOnce(
      profileChain({ data: { host_discovery_enabled: false }, error: null }),
    );
    await expect(
      setSeekerHostDiscoverySetting("token", "user_seeker", true),
    ).resolves.toEqual({
      ok: false,
      error: "host_discovery_update_not_confirmed",
    });
  });
});
