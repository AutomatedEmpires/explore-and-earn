"use client";

import { useState, useTransition } from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import { INVITE_CREDIT_PACKS } from "@explore-and-earn/contracts";

import { purchaseInviteCreditsAction } from "../../app/actions/hostSourcing";
import { PopupShell } from "../overlay/PopupShell";
import styles from "./BuyMoreInvitesPopup.module.css";

export interface BuyMoreInvitesPopupProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function priceLabel(priceCents: number): string {
  return `$${(priceCents / 100).toLocaleString("en-US")}`;
}

/**
 * Buy-more invite-credit packs. Wires the founder-locked packs (5/10/25 —
 * ADR-028) to the EXISTING dormant purchase path (purchaseInviteCreditsAction →
 * services/stripe, self-gated on hasStripeCheckoutConfig). No Stripe wiring is
 * added here: when checkout is not configured the action returns
 * `billing_unavailable` and we show an honest "not live yet" note rather than a
 * fake success. When it IS configured the action returns a hosted checkout URL
 * and we hand off to it. The credit LEDGER is real; only the paid top-up is
 * dormant.
 */
export function BuyMoreInvitesPopup({ isOpen, onClose }: BuyMoreInvitesPopupProps) {
  const [pending, startPurchase] = useTransition();
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleBuy(credits: number) {
    setSelected(credits);
    setNotice(null);
    startPurchase(async () => {
      try {
        const result = await purchaseInviteCreditsAction(credits);
        if (result.ok && result.url) {
          window.location.href = result.url;
          return;
        }
        if (
          result.error === "billing_unavailable" ||
          result.error === "checkout_unavailable"
        ) {
          setNotice(
            "Invite-credit checkout isn't live yet — packs will be purchasable here soon. No purchase was completed and no charge was made.",
          );
        } else if (result.error === "rate_limit_exceeded") {
          setNotice("Too many attempts just now — please try again in a few minutes.");
        } else {
          setNotice("Couldn't start checkout. Please try again.");
        }
      } catch {
        setNotice("Couldn't start checkout. Please try again.");
      } finally {
        setSelected(null);
      }
    });
  }

  function handleClose() {
    if (pending) return;
    setNotice(null);
    setSelected(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <PopupShell
      open={isOpen}
      onClose={handleClose}
      title="Buy more invites"
      eyebrow={
        <>
          <Icon name="status.boosted" size={16} aria-hidden />
          <span>Invite credits</span>
        </>
      }
      headerMeta={<span>Invite-credit pack balances carry over month to month.</span>}
      size="compact"
      closeLabel="Close buy invites popup"
      closeDisabled={pending}
    >
      <ul className={styles.packs} aria-label="Invite credit packs">
        {INVITE_CREDIT_PACKS.map((pack) => {
          const isBusy = pending && selected === pack.credits;
          return (
            <li key={pack.credits} className={styles.pack}>
              <div className={styles.packText}>
                <span className={styles.packCredits}>{pack.credits} invites</span>
                <span className={styles.packPrice}>{priceLabel(pack.priceCents)}</span>
              </div>
              <Button
                variant="secondary"
                onClick={() => handleBuy(pack.credits)}
                disabled={pending}
              >
                {isBusy ? "Starting…" : "Buy"}
              </Button>
            </li>
          );
        })}
      </ul>

      {notice ? (
        <p className={styles.notice} role="status">
          <Icon name="system.info" size={16} aria-hidden />
          {notice}
        </p>
      ) : null}

      <p className={styles.finePrint}>Invite credits are non-refundable (ADR-028).</p>
    </PopupShell>
  );
}
