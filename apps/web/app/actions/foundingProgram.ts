"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  upsertFoundingHostProgram,
  type FoundingProgramStatus,
} from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { reportError } from "../../lib/sentry";

/**
 * THE SWITCH. This action is how the early-host programme turns on.
 *
 * Everything else about the programme is built and dark: the table exists, the
 * claim function exists and refuses, the public section renders one qualitative
 * sentence, and the checkout path refuses a founding rate. Nothing changes until
 * a founder sets a capacity, a deadline and a status here — which is the point.
 * A programme that switched itself on would be a programme whose numbers nobody
 * chose.
 *
 * WHAT AN ADMIN MAY SET, and what they may not. capacity, enrollment_deadline
 * and status are configuration. `claimed` is EVIDENCE — it is maintained only by
 * claim_founding_host_seat, one increment per paid seat, and it is deliberately
 * absent from this shape. An admin who could type a claimed count could publish
 * "97 of 100 taken" with three real claims behind it, which is precisely the
 * fabricated scarcity this whole phase exists to make impossible.
 *
 * Authorization is checked HERE and not only by the page gate: a server action
 * is a separately invocable endpoint. Migration 087 also withholds every write
 * privilege from anon and authenticated, so the service-role path this uses is
 * the only one that exists.
 */

const VALID_STATUSES: readonly FoundingProgramStatus[] = [
  "draft",
  "open",
  "full",
  "ended",
];

export interface SaveFoundingProgramResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function saveFoundingProgramAction(
  input: {
    readonly capacity: number;
    /** ISO instant, or null to clear it. A cleared deadline cannot be claimed. */
    readonly enrollmentDeadline: string | null;
    readonly status: string;
  },
): Promise<SaveFoundingProgramResult> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "unauthenticated" };
    if (!isAdminUserId(userId)) return { ok: false, error: "forbidden" };

    if (!Number.isInteger(input.capacity) || input.capacity < 0) {
      return { ok: false, error: "invalid_capacity" };
    }
    if (!(VALID_STATUSES as readonly string[]).includes(input.status)) {
      return { ok: false, error: "invalid_status" };
    }

    let deadline: string | null = null;
    if (input.enrollmentDeadline) {
      const parsed = new Date(input.enrollmentDeadline);
      if (!Number.isFinite(parsed.getTime())) {
        return { ok: false, error: "invalid_deadline" };
      }
      deadline = parsed.toISOString();
    }

    // OPENING THE PROGRAMME REQUIRES BOTH TERMS. A row that says 'open' with no
    // deadline, or with capacity zero, would be claimed against by nobody — the
    // claim function refuses both — while the admin who saved it believes the
    // programme is live. Refusing here is how that misunderstanding is caught at
    // the moment it is made rather than a week later.
    if (input.status === "open" && (!deadline || input.capacity <= 0)) {
      return { ok: false, error: "open_requires_capacity_and_deadline" };
    }

    const result = await upsertFoundingHostProgram({
      capacity: input.capacity,
      enrollmentDeadline: deadline,
      status: input.status as FoundingProgramStatus,
    });

    if (!result.ok) return { ok: false, error: "save_failed" };

    revalidatePath("/admin/founding");
    revalidatePath("/for-hosts");
    revalidatePath("/host/plans/activate");
    return { ok: true };
  } catch (error) {
    reportError(error, { action: "saveFoundingProgramAction" });
    return { ok: false, error: "failed" };
  }
}
