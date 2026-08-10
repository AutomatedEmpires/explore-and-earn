import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const adminSchedulingContext = vi.fn();
const beginInviteNotificationDelivery = vi.fn();
const getInviteNotificationState = vi.fn();
vi.mock("@explore-and-earn/db", () => ({
  adminSchedulingContext,
  beginInviteNotificationDelivery,
  getApplicationOfferState: vi.fn(),
  getInviteNotificationState,
  getListingLiveState: vi.fn(),
  getResumeCompletionByProfileId: vi.fn(),
}));

const { recheckIntent } = await import("../../services/notifications/recheck");

const NOW = Date.parse("2026-08-05T18:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scheduling notification send-time recheck", () => {
	it("keeps a current invite notification actionable", async () => {
		getInviteNotificationState.mockResolvedValue({
			status: "created",
			expiresAt: "2026-08-06T18:00:00.000Z",
		});
		await expect(
			recheckIntent(
				{
					type: "invite_received",
					entity: { type: "invite", id: "invite-1" },
				},
				NOW,
				{ deliveryId: "delivery-1", workerId: "worker-1" },
			),
		).resolves.toEqual({ actionable: true });
		expect(getInviteNotificationState).toHaveBeenCalledWith({
			inviteId: "invite-1",
			deliveryId: "delivery-1",
			workerId: "worker-1",
		});
	});

	it("uses the durable begin authority only at the provider boundary", async () => {
		beginInviteNotificationDelivery.mockResolvedValue({
			status: "created",
			expiresAt: "2026-08-06T18:00:00.000Z",
		});
		await expect(
			recheckIntent(
				{
					type: "invite_received",
					entity: { type: "invite", id: "invite-1" },
				},
				NOW,
				{
					deliveryId: "delivery-1",
					workerId: "worker-1",
					providerBoundary: true,
				},
			),
		).resolves.toEqual({ actionable: true });
		expect(beginInviteNotificationDelivery).toHaveBeenCalledWith({
			inviteId: "invite-1",
			deliveryId: "delivery-1",
			workerId: "worker-1",
		});
		expect(getInviteNotificationState).not.toHaveBeenCalled();
	});

	it("cancels an invitation materialized after withdrawal or expiry", async () => {
		getInviteNotificationState.mockResolvedValueOnce({
			status: "withdrawn",
			expiresAt: "2026-08-06T18:00:00.000Z",
		});
		await expect(
			recheckIntent(
				{
					type: "invite_received",
					entity: { type: "invite", id: "invite-1" },
				},
				NOW,
				{ deliveryId: "delivery-1", workerId: "worker-1" },
			),
		).resolves.toEqual({
			actionable: false,
			reason: "invite no longer actionable",
		});

		getInviteNotificationState.mockResolvedValueOnce({
			status: "created",
			expiresAt: "2026-08-05T18:00:00.000Z",
		});
		await expect(
			recheckIntent(
				{
					type: "invite_received",
					entity: { type: "invite", id: "invite-1" },
				},
				NOW,
				{ deliveryId: "delivery-1", workerId: "worker-1" },
			),
		).resolves.toEqual({
			actionable: false,
			reason: "invite already expired",
		});
	});

	it("fails before provider work when an invitation lacks a worker lease context", async () => {
		await expect(
			recheckIntent(
				{
					type: "invite_received",
					entity: { type: "invite", id: "invite-1" },
				},
				NOW,
			),
		).rejects.toThrow("invite delivery recheck context required");
		expect(getInviteNotificationState).not.toHaveBeenCalled();
	});

  it("keeps a still-proposed interview actionable", async () => {
    adminSchedulingContext.mockResolvedValue({ status: "proposed" });
    await expect(
      recheckIntent(
        {
          type: "interview_proposed",
          entity: { type: "scheduling_request", id: "schedule-1" },
          expiresAt: "2026-08-05T19:00:00.000Z",
        },
        NOW,
      ),
    ).resolves.toEqual({ actionable: true });
  });

  it("cancels a proposal after its response clock without reading stale state", async () => {
    await expect(
      recheckIntent(
        {
          type: "interview_proposed",
          entity: { type: "scheduling_request", id: "schedule-1" },
          expiresAt: "2026-08-05T18:00:00.000Z",
        },
        NOW,
      ),
    ).resolves.toEqual({
      actionable: false,
      reason: "intent expired before delivery",
    });
    expect(adminSchedulingContext).not.toHaveBeenCalled();
  });

  it("cancels alternate-request copy once the host has already re-proposed", async () => {
    adminSchedulingContext.mockResolvedValue({ status: "proposed" });
    const result = await recheckIntent(
      {
        type: "interview_alternate_requested",
        entity: { type: "scheduling_request", id: "schedule-1" },
        expiresAt: "2026-08-05T19:00:00.000Z",
      },
      NOW,
    );
    expect(result).toEqual({
      actionable: false,
      reason: "interview state already changed",
    });
  });

  it("cancels a deferred confirmation after the interview is cancelled", async () => {
    adminSchedulingContext.mockResolvedValue({ status: "cancelled" });
    await expect(
      recheckIntent(
        {
          type: "interview_confirmed",
          entity: { type: "scheduling_request", id: "schedule-1" },
        },
        NOW,
      ),
    ).resolves.toEqual({
      actionable: false,
      reason: "interview state already changed",
    });
  });
});
