import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const webhookEvent = vi.hoisted(() => ({
  current: {
    type: "user.created",
    data: {
      id: "user_webhook_retry",
      email_addresses: [
        { id: "email-1", email_address: "retry@example.test" },
      ],
      primary_email_address_id: "email-1",
      public_metadata: { role: "seeker" },
    },
  },
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("svix", () => ({
  Webhook: class {
    verify() {
      return webhookEvent.current;
    }
  },
}));
vi.mock("../../lib/email", () => ({
  absoluteUrl: (path: string) => `https://example.test${path}`,
  sendEmail: sendEmailMock,
}));
vi.mock("../../lib/emails", () => ({
  welcomeHostEmail: vi.fn(() => "host welcome"),
  welcomeSeekerEmail: vi.fn(() => "seeker welcome"),
}));

import { POST } from "../../app/api/webhooks/clerk/route";

type InsertResult = {
  error: { code: string; message: string } | null;
};

function installInserts(results: Record<string, InsertResult>) {
  const inserts = new Map<string, ReturnType<typeof vi.fn>>();
  const from = vi.fn((table: string) => {
    const insert = vi.fn().mockResolvedValue(results[table]);
    inserts.set(table, insert);
    return { insert };
  });
  createClientMock.mockReturnValue({ from });
  return { from, inserts };
}

function request() {
  return new Request("https://example.test/api/webhooks/clerk", {
    method: "POST",
    body: JSON.stringify(webhookEvent.current),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
  headersMock.mockResolvedValue({ get: vi.fn(() => "test-header") });
  sendEmailMock.mockResolvedValue(undefined);
});

describe("Clerk user.created retry handling", () => {
  it("continues to repair seeker_profiles when the shadow row already exists", async () => {
    const { from } = installInserts({
      users_profile_shadow: {
        error: { code: "23505", message: "duplicate shadow" },
      },
      seeker_profiles: { error: null },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "users_profile_shadow",
      "seeker_profiles",
    ]);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "clerk:user.created:user_webhook_retry:welcome",
      }),
    );
  });

  it("uses one provider idempotency key when concurrent deliveries split the inserts", async () => {
    const attempts = new Map<string, number>();
    const from = vi.fn((table: string) => ({
      insert: vi.fn().mockImplementation(async () => {
        const attempt = attempts.get(table) ?? 0;
        attempts.set(table, attempt + 1);
        if (table === "users_profile_shadow") {
          return attempt === 0
            ? { error: null }
            : { error: { code: "23505", message: "duplicate shadow" } };
        }
        return attempt === 0
          ? { error: { code: "23505", message: "duplicate seeker" } }
          : { error: null };
      }),
    }));
    createClientMock.mockReturnValue({ from });

    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(
      sendEmailMock.mock.calls.map(([options]) => options.idempotencyKey),
    ).toEqual([
      "clerk:user.created:user_webhook_retry:welcome",
      "clerk:user.created:user_webhook_retry:welcome",
    ]);
  });

  it("acknowledges a fully duplicated retry without sending another welcome", async () => {
    installInserts({
      users_profile_shadow: {
        error: { code: "23505", message: "duplicate shadow" },
      },
      seeker_profiles: {
        error: { code: "23505", message: "duplicate seeker" },
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("keeps non-unique database failures fatal", async () => {
    const { from } = installInserts({
      users_profile_shadow: {
        error: { code: "42501", message: "permission denied" },
      },
      seeker_profiles: { error: null },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(from).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
