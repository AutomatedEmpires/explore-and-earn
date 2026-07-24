"use client";

import { useId, useState } from "react";

import { Icon } from "@explore-and-earn/ui";

import styles from "./TrueValue.module.css";

export interface TrueValueProps {
  /** Real flag from the listing — housing is provided. */
  readonly housingIncluded: boolean;
  /** Real flag from the listing — meals are provided. */
  readonly mealsIncluded: boolean;
  /** Human pay summary already computed by the page (e.g. "$18/hr"). */
  readonly paySummary: string;
}

const RENT_DEFAULT = 1200;
const FOOD_DEFAULT = 420;

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * TrueValue — Explore&Earn's signature decision tool, and the thing no other job
 * board can honestly show: for seasonal/outdoor roles, covered HOUSING + MEALS
 * make the pay worth far more than its sticker number, because it's money you
 * never spend.
 *
 * Honesty is the whole point: we do NOT fabricate a dollar value for the
 * housing/meals (the data layer doesn't carry one). Instead the SEEKER supplies
 * what they'd otherwise pay for rent + groceries, and we simply add up what
 * stays in their pocket. Gated by the real housingIncluded / mealsIncluded flags
 * — if neither is covered there's no value story, so we render nothing.
 */
export function TrueValue({ housingIncluded, mealsIncluded, paySummary }: TrueValueProps) {
  const rentId = useId();
  const foodId = useId();
  const [rent, setRent] = useState(RENT_DEFAULT);
  const [food, setFood] = useState(FOOD_DEFAULT);

  if (!housingIncluded && !mealsIncluded) {
    return null;
  }

  const keptMonthly = (housingIncluded ? rent : 0) + (mealsIncluded ? food : 0);
  const keptYearly = keptMonthly * 12;
  // Only append the "on top of <pay>" clause when pay is a real figure — a vague
  // "See listing" would read awkwardly.
  const hasPayFigure = paySummary.includes("$");

  const coveredWord =
    housingIncluded && mealsIncluded
      ? "Housing and meals are covered"
      : housingIncluded
        ? "Housing is covered"
        : "Meals are covered";
  const eatsWord =
    housingIncluded && mealsIncluded
      ? "rent and groceries"
      : housingIncluded
        ? "rent"
        : "groceries";

  return (
    <section className={styles.root} aria-labelledby={`${rentId}-title`}>
      <div className={styles.head}>
        <span className={styles.kicker}>
          <Icon name="benefit.pay" size={16} aria-hidden />
          True value
        </span>
        {/* h3, not h2: TrueValue renders INSIDE DealUpfront's section, whose
            own heading is the h2 "The deal, upfront". An h2 here sent the
            outline h2 -> h3 ("Housing evidence") -> h2 within one section. */}
        <h3 id={`${rentId}-title`} className={styles.title}>
          Your pay is what you <em>keep</em>.
        </h3>
        <p className={styles.sub}>
          {coveredWord} here — so the {eatsWord} a city job quietly takes out of your
          paycheck stays in your pocket
          {hasPayFigure ? (
            <>
              , on top of <strong>{paySummary}</strong>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className={styles.calc}>
        {housingIncluded ? (
          <div className={styles.field}>
            <label className={styles.fieldTop} htmlFor={rentId}>
              <span>Rent you’d pay elsewhere</span>
              <b>{money(rent)}/mo</b>
            </label>
            <input
              id={rentId}
              className={styles.slider}
              type="range"
              min={400}
              max={3000}
              step={50}
              value={rent}
              onChange={(e) => setRent(Number(e.target.value))}
            />
          </div>
        ) : null}
        {mealsIncluded ? (
          <div className={styles.field}>
            <label className={styles.fieldTop} htmlFor={foodId}>
              <span>Groceries you’d buy elsewhere</span>
              <b>{money(food)}/mo</b>
            </label>
            <input
              id={foodId}
              className={styles.slider}
              type="range"
              min={150}
              max={1200}
              step={20}
              value={food}
              onChange={(e) => setFood(Number(e.target.value))}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.result}>
        <span className={styles.resultLabel}>You keep about</span>
        <span className={styles.resultValue} aria-live="polite">
          {money(keptMonthly)}
          <small>/mo</small>
        </span>
        <span className={styles.resultSub}>
          that a role without {eatsWord} covered would eat — roughly{" "}
          <strong>{money(keptYearly)}</strong> over a year.
        </span>
      </div>

      <p className={styles.honest}>
        <Icon name="system.info" size={16} aria-hidden />
        Your numbers, not our estimate — drag the sliders to match your real cost of
        living.
      </p>
    </section>
  );
}
