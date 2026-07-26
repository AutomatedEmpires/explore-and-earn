"use client";

import { useState } from "react";
import Link from "next/link";

import { acceptTeamInvitationAction } from "../../app/actions/hostTeam";

const ACCEPT_ERROR: Record<string, string> = {
  invalid_token: "This invitation link isn't valid. Ask for a fresh one.",
  invitation_expired: "This invitation has expired. Ask for a fresh one.",
  invitation_revoked: "This invitation was withdrawn.",
  already_member: "You're already on this team.",
  no_account:
    "We couldn't find your account yet. Sign out, sign in again, and reopen this link.",
  unavailable: "Team seats aren't switched on for this environment yet.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  unauthenticated: "Sign in to accept this invitation.",
  failed: "We couldn't accept this invitation.",
};

/**
 * Accept a host team invitation.
 *
 * Acceptance is an explicit button, not an on-load effect: a link preview
 * fetcher or an email scanner must not be able to consume a single-use token by
 * merely opening the URL.
 */
export function AcceptTeamInvitation({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function handleAccept() {
    setState("working");
    setMessage(null);
    void acceptTeamInvitationAction(token)
      .then((result) => {
        if (result.ok) {
          setState("done");
          setMessage(
            result.alreadyAccepted
              ? "You had already accepted this invitation."
              : "You're on the team.",
          );
          return;
        }
        setState("error");
        setMessage(ACCEPT_ERROR[result.reason] ?? ACCEPT_ERROR.failed);
      })
      .catch(() => {
        setState("error");
        setMessage(ACCEPT_ERROR.failed);
      });
  }

  return (
    <main>
      <h1>Join a host team</h1>
      {state === "done" ? (
        <>
          <p>{message}</p>
          <Link href="/host">Go to the host dashboard</Link>
        </>
      ) : (
        <>
          <p>
            You&rsquo;ve been invited to help manage a host account on Explore &amp; Earn.
            Accepting links this signed-in account to their team.
          </p>
          <button type="button" onClick={handleAccept} disabled={state === "working"}>
            {state === "working" ? "Accepting…" : "Accept invitation"}
          </button>
          {state === "error" && message ? <p role="alert">{message}</p> : null}
        </>
      )}
    </main>
  );
}
