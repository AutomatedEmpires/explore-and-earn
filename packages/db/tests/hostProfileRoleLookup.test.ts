import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authedClientMock = vi.hoisted(() => vi.fn());
vi.mock("../src/client.js", () => ({
  anonClient: vi.fn(),
  authedClient: authedClientMock,
}));

import { hasHostProfile } from "../src/queries/hostProfiles.js";

function hostProfileLookup(result: {
  data: { id: string } | null;
  error: { message: string } | null;
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.limit.mockReturnValue(query);

  const client = { from: vi.fn().mockReturnValue(query) };
  authedClientMock.mockReturnValue(client);
  return { client, query };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasHostProfile", () => {
  it("checks only an active caller-owned profile id", async () => {
    const { client, query } = hostProfileLookup({
      data: { id: "host-profile-1" },
      error: null,
    });

    await expect(
      hasHostProfile("clerk-token", "user_host"),
    ).resolves.toBe(true);

    expect(authedClientMock).toHaveBeenCalledWith("clerk-token");
    expect(client.from).toHaveBeenCalledWith("host_profiles");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.eq).toHaveBeenCalledWith("clerk_user_id", "user_host");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns false when no active owned host profile exists", async () => {
    hostProfileLookup({ data: null, error: null });

    await expect(
      hasHostProfile("clerk-token", "user_seeker"),
    ).resolves.toBe(false);
  });

  it("rethrows database and client failures without provider details", async () => {
    hostProfileLookup({
      data: null,
      error: { message: "failure containing fake-database-secret" },
    });

    await expect(
      hasHostProfile("clerk-token", "user_host"),
    ).rejects.toMatchObject({
      name: "HostProfileLookupError",
      message: "Host profile lookup failed.",
    });

    authedClientMock.mockImplementationOnce(() => {
      throw new Error("configuration contains fake-provider-key");
    });

    await expect(
      hasHostProfile("clerk-token", "user_host"),
    ).rejects.toMatchObject({
      name: "HostProfileLookupError",
      message: "Host profile lookup failed.",
    });
  });
});
