import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../src/adminClient", () => ({
  adminClient: mocks.adminClient,
}));

import {
  adminRequeueDelivery,
  beginInviteNotificationDelivery,
  getInviteNotificationState,
  releaseInviteNotificationClaimKnownUnsent,
  settleDelivery,
  settleInviteNotificationDelivery,
} from "../src/queries/notificationEngine";

const DELIVERY_ID = "9400d000-0000-4000-8000-000000000001";
const INVITE_ID = "94007000-0000-4000-8000-000000000001";
const DELIVERED_AT = "2026-08-09T19:00:00.000Z";
const INVITE_STATE_ARGS = {
  inviteId: INVITE_ID,
  deliveryId: DELIVERY_ID,
  workerId: "worker-a",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
});

describe("settleInviteNotificationDelivery", () => {
  it.each(["delivered", "cancelled"] as const)(
    "uses the 094 authority RPC and returns %s",
    async (status) => {
      mocks.rpc.mockResolvedValue({
        data: { ok: true, status, invite_id: INVITE_ID },
        error: null,
      });

      await expect(
        settleInviteNotificationDelivery({
          id: DELIVERY_ID,
          workerId: "worker-a",
          deliveredAt: DELIVERED_AT,
          providerMessageId: "provider-1",
        }),
      ).resolves.toBe(status);

      expect(mocks.rpc).toHaveBeenCalledWith(
        "settle_invite_notification_delivery",
        {
          p_delivery_id: DELIVERY_ID,
          p_worker_id: "worker-a",
          p_provider_message_id: "provider-1",
          p_delivered_at: DELIVERED_AT,
        },
      );
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it.each(["PGRST202", "42883"])(
    "fails closed when the atomic authority RPC is missing (%s)",
    async (code) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "function missing" },
      });
      await expect(
        settleInviteNotificationDelivery({
          id: DELIVERY_ID,
          workerId: "worker-a",
          deliveredAt: DELIVERED_AT,
        }),
      ).rejects.toThrow("function missing");

      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("fails closed on permission/database faults and malformed results", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    await expect(
      settleInviteNotificationDelivery({
        id: DELIVERY_ID,
        workerId: "worker-a",
        deliveredAt: DELIVERED_AT,
      }),
    ).rejects.toThrow("permission denied");
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, error: "delivery_not_settleable" },
      error: null,
    });
    await expect(
      settleInviteNotificationDelivery({
        id: DELIVERY_ID,
        workerId: "worker-a",
        deliveredAt: DELIVERED_AT,
      }),
    ).rejects.toThrow("invalid result");
  });
});

describe("settleDelivery invitation claim fencing", () => {
  it("requires the exact processing worker and 094 claim authority", async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: DELIVERY_ID }],
      error: null,
    });
    const eqAuthority = vi.fn().mockReturnValue({ select });
    const eqWorker = vi.fn().mockReturnValue({ eq: eqAuthority });
    const eqStatus = vi.fn().mockReturnValue({ eq: eqWorker });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mocks.from.mockReturnValue({ update });

    await expect(
      settleDelivery({
        id: DELIVERY_ID,
        workerId: "worker-a",
        status: "cancelled",
        suppressionReason: "no longer actionable",
      }),
    ).resolves.toBeUndefined();

    expect(eqId).toHaveBeenCalledWith("id", DELIVERY_ID);
    expect(eqStatus).toHaveBeenCalledWith("status", "processing");
    expect(eqWorker).toHaveBeenCalledWith("worker_id", "worker-a");
    expect(eqAuthority).toHaveBeenCalledWith(
      "claim_authority_version",
      "094",
    );
  });

  it("fails closed when a newer worker owns the invitation delivery", async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqAuthority = vi.fn().mockReturnValue({ select });
    const eqWorker = vi.fn().mockReturnValue({ eq: eqAuthority });
    const eqStatus = vi.fn().mockReturnValue({ eq: eqWorker });
    const eqId = vi.fn().mockReturnValue({ eq: eqStatus });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mocks.from.mockReturnValue({ update });

    await expect(
      settleDelivery({
        id: DELIVERY_ID,
        workerId: "stale-worker",
        status: "failed_retryable",
      }),
    ).rejects.toThrow("delivery lease lost");
  });
});

describe("getInviteNotificationState", () => {
  it("reads the locking 094 recheck RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ status: "created", expires_at: "2026-08-23T19:00:00.000Z" }],
      error: null,
    });

    await expect(getInviteNotificationState(INVITE_STATE_ARGS)).resolves.toEqual({
      status: "created",
      expiresAt: "2026-08-23T19:00:00.000Z",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_invite_notification_state", {
      p_invite_id: INVITE_ID,
      p_delivery_id: DELIVERY_ID,
      p_worker_id: "worker-a",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns null when the authority RPC filters a non-actionable invite", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getInviteNotificationState(INVITE_STATE_ARGS)).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed while the locking RPC is missing", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function missing" },
    });

    await expect(getInviteNotificationState(INVITE_STATE_ARGS)).rejects.toThrow(
      "function missing",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    { status: "created", expires_at: null },
    [{ status: "created", expires_at: "not-a-timestamp" }],
    [{ status: "withdrawn", expires_at: "2026-08-23T19:00:00.000Z" }],
    [
      { status: "created", expires_at: null },
      { status: "delivered", expires_at: null },
    ],
  ])("fails closed on malformed or non-unique RPC payload %#", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(getInviteNotificationState(INVITE_STATE_ARGS)).rejects.toThrow(
      "invalid result",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not hide a non-missing-RPC failure", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "database fault" },
    });
    await expect(getInviteNotificationState(INVITE_STATE_ARGS)).rejects.toThrow(
      "database fault",
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("beginInviteNotificationDelivery", () => {
  it("crosses the exact worker-bound provider authority RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ status: "created", expires_at: "2026-08-23T19:00:00.000Z" }],
      error: null,
    });

    await expect(beginInviteNotificationDelivery(INVITE_STATE_ARGS)).resolves.toEqual({
      status: "created",
      expiresAt: "2026-08-23T19:00:00.000Z",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("begin_invite_notification_delivery", {
      p_invite_id: INVITE_ID,
      p_delivery_id: DELIVERY_ID,
      p_worker_id: "worker-a",
    });
  });

  it("fails closed on missing authority or payload drift", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "function missing" },
    });
    await expect(beginInviteNotificationDelivery(INVITE_STATE_ARGS)).rejects.toThrow(
      "function missing",
    );

    mocks.rpc.mockResolvedValueOnce({ data: { status: "created" }, error: null });
    await expect(beginInviteNotificationDelivery(INVITE_STATE_ARGS)).rejects.toThrow(
      "invalid result",
    );

    mocks.rpc.mockResolvedValueOnce({
      data: [{ status: "created", expires_at: "not-a-timestamp" }],
      error: null,
    });
    await expect(beginInviteNotificationDelivery(INVITE_STATE_ARGS)).rejects.toThrow(
      "invalid result",
    );
  });
});

describe("releaseInviteNotificationClaimKnownUnsent", () => {
  it("uses exact invite, processing, and worker predicates before releasing", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: DELIVERY_ID },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const isProviderStarted = vi.fn().mockReturnValue({ select });
    const eqAuthority = vi.fn().mockReturnValue({ is: isProviderStarted });
    const eqWorker = vi.fn().mockReturnValue({ eq: eqAuthority });
    const eqStatus = vi.fn().mockReturnValue({ eq: eqWorker });
    const eqType = vi.fn().mockReturnValue({ eq: eqStatus });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    mocks.from.mockReturnValue({ update });

    await expect(
      releaseInviteNotificationClaimKnownUnsent({
        id: DELIVERY_ID,
        workerId: "worker-a",
        attemptCount: 3,
        nextAttemptAt: "2026-08-09T19:01:00.000Z",
      }),
    ).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed_retryable",
        attempt_count: 2,
        failure_class: "known_unsent",
        worker_id: null,
        lease_expires_at: null,
      }),
    );
    expect(eqId).toHaveBeenCalledWith("id", DELIVERY_ID);
    expect(eqType).toHaveBeenCalledWith("notification_type", "invite_received");
    expect(eqStatus).toHaveBeenCalledWith("status", "processing");
    expect(eqWorker).toHaveBeenCalledWith("worker_id", "worker-a");
    expect(eqAuthority).toHaveBeenCalledWith("claim_authority_version", "094");
    expect(isProviderStarted).toHaveBeenCalledWith("provider_started_at", null);
  });
});

describe("adminRequeueDelivery", () => {
  it("keeps only outcome-unknown invite dead letters immutable at the query boundary", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const or = vi.fn().mockReturnValue({ select });
    const inStatuses = vi.fn().mockReturnValue({ or });
    const eq = vi.fn().mockReturnValue({ in: inStatuses });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });

    await expect(adminRequeueDelivery(DELIVERY_ID)).resolves.toBe(false);

    expect(mocks.from).toHaveBeenCalledWith("notification_deliveries");
    expect(inStatuses).toHaveBeenCalledWith("status", [
      "dead_letter",
      "failed_terminal",
    ]);
    expect(or).toHaveBeenCalledWith(
      "notification_type.neq.invite_received,status.neq.dead_letter,failure_class.neq.outcome_unknown,failure_class.is.null",
    );
  });
});
