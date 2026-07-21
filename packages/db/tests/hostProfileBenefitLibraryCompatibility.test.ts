import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authedClientMock = vi.hoisted(() => vi.fn());
vi.mock("../src/client.js", () => ({
  anonClient: vi.fn(),
  authedClient: authedClientMock,
}));

import {
  getHostProfile,
  setMyHousingLibraryPhoto,
} from "../src/queries/hostProfiles.js";

const profileRow = {
  id: "host-1",
  company_name: "Orchard Co.",
  host_name: "Maya",
  tagline: null,
  about: null,
  primary_location_name: "Wenatchee, WA",
  photo_url: null,
  website_url: null,
  social_links: {},
  category_scopes: ["farm"],
  housing_offered_generally: true,
  meals_offered_generally: false,
  subscription_tier: "professional",
};

function installClient(rpcResult: {
  data: unknown;
  error: { code?: string; message: string } | null;
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  const client = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
  authedClientMock.mockReturnValue(client);
  return { client, query };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getHostProfile benefit-library rollout compatibility", () => {
  it("returns the base profile with the feature disabled when migration 072 is missing", async () => {
    const { client, query } = installClient({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_my_host_benefit_library",
      },
    });

    await expect(getHostProfile("token", "user-1")).resolves.toMatchObject({
      id: "host-1",
      benefitLibraryAvailable: false,
      benefitLibrary: {},
    });
    expect(query.select).toHaveBeenCalledOnce();
    expect(query.select.mock.calls[0]?.[0]).not.toContain("benefit_library");
    expect(client.rpc).toHaveBeenCalledWith("get_my_host_benefit_library");
  });

  it("enables and sanitizes the library when the migration 072 RPC succeeds", async () => {
    installClient({
      data: {
        housing: {
          photos: {
            sleeping_area: "  https://example.test/sleeping  ",
            bathroom: "https://example.test/bathroom",
            unknown_role: "https://example.test/not-allowed",
          },
        },
      },
      error: null,
    });

    await expect(getHostProfile("token", "user-1")).resolves.toMatchObject({
      benefitLibraryAvailable: true,
      benefitLibrary: {
        housing: {
          photos: {
            sleeping_area: "https://example.test/sleeping",
            bathroom: "https://example.test/bathroom",
          },
        },
      },
    });
  });

  it("does not hide unexpected RPC failures as an old-schema fallback", async () => {
    installClient({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(getHostProfile("token", "user-1")).rejects.toThrow(
      "getHostProfile: permission denied",
    );
  });

  it("does not hide missing dependencies inside an installed RPC", async () => {
    installClient({
      data: null,
      error: { code: "42P01", message: 'relation "housing_photo_roles" does not exist' },
    });

    await expect(getHostProfile("token", "user-1")).rejects.toThrow(
      'getHostProfile: relation "housing_photo_roles" does not exist',
    );
  });
});

describe("setMyHousingLibraryPhoto", () => {
  it("uses the role-scoped atomic RPC and returns the displaced URL", async () => {
    const { client } = installClient({
      data: [
        {
          host_profile_id: "host-1",
          previous_url: "https://example.test/old.webp",
          benefit_library: {
            housing: {
              photos: { kitchen: "https://example.test/new.webp" },
            },
          },
        },
      ],
      error: null,
    });

    await expect(
      setMyHousingLibraryPhoto(
        "token",
        "kitchen",
        "https://example.test/new.webp",
      ),
    ).resolves.toEqual({
      ok: true,
      hostProfileId: "host-1",
      previousUrl: "https://example.test/old.webp",
      benefitLibrary: {
        housing: { photos: { kitchen: "https://example.test/new.webp" } },
      },
    });
    expect(client.rpc).toHaveBeenCalledWith("set_my_housing_library_photo", {
      p_role: "kitchen",
      p_url: "https://example.test/new.webp",
    });
  });
});
