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
 *
 * WHAT ACCEPTANCE CURRENTLY GRANTS: nothing. No policy admits a team membership
 * to a host's listings, applicants, messages or analytics, and a member holds no
 * host_profiles row — so /host would bounce them to onboarding. This screen
 * therefore records the link and says so, instead of offering a dashboard button
 * that goes nowhere. No seat exists to issue an invitation against either
 * (TEAM_SEATS_BY_TIER is 0 for every tier), so in practice this page is only
 * ever reached with a token that no longer resolves.
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
              : "Invitation accepted.",
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
          <p>
            Team access itself isn&rsquo;t switched on yet, so this doesn&rsquo;t give
            you the host&rsquo;s listings or applicants — the account owner still does
            that work. We&rsquo;ve recorded the link and will tell you when it does
            something.
          </p>
          <Link href="/">Back to Explore &amp; Earn</Link>
        </>
      ) : (
        <>
          <p>
            You&rsquo;ve been invited to help manage a host account on Explore &amp; Earn.
            Accepting records this signed-in account against their team. It does not
            yet grant access to their listings or applicants.
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
