import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { CATEGORY_LABEL, toDiscoveryCardData } from "../discovery";
import { HOST_LISTING_STATE_LABEL, type HostListingItem } from "./models";
import styles from "./HostListingForm.module.css";

export interface HostListingFormProps {
  readonly mode: "create" | "edit";
  readonly item?: HostListingItem;
}

/**
 * Shared create/edit listing form. UI-only and presentational: there is NO
 * submission, persistence, or backend wiring (the listings data layer is
 * founder-gated). Fields are uncontrolled with sensible defaults so the layout
 * and a11y can be reviewed ahead of the real save flow.
 */
export function HostListingForm({ mode, item }: HostListingFormProps) {
  const triad = item ? toDiscoveryCardData(item.listing).triad : undefined;
  const categoryOptions = Object.entries(CATEGORY_LABEL);
  const stateOptions = Object.entries(HOST_LISTING_STATE_LABEL);
  const submitLabel = mode === "create" ? "Publish listing" : "Save changes";
  const cancelHref = item ? `/host/listings/${item.listing.id}` : "/host/listings";

  return (
    <form className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-title">
          Title
        </label>
        <input
          className={styles.input}
          id="listing-title"
          name="title"
          type="text"
          defaultValue={item?.listing.title ?? ""}
          placeholder="Orchard Harvest Crew"
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-category">
            Category
          </label>
          <select
            className={styles.input}
            id="listing-category"
            name="category"
            defaultValue={item?.listing.category ?? "farm"}
          >
            {categoryOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-state">
            Status
          </label>
          <select
            className={styles.input}
            id="listing-state"
            name="state"
            defaultValue={item?.state ?? "draft"}
          >
            {stateOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-location">
          Location
        </label>
        <input
          className={styles.input}
          id="listing-location"
          name="location"
          type="text"
          defaultValue={item?.listing.location ?? ""}
          placeholder="Wenatchee, WA"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-window">
          Opportunity window
        </label>
        <input
          className={styles.input}
          id="listing-window"
          name="window"
          type="text"
          defaultValue={item?.listing.opportunityWindow ?? ""}
          placeholder="Aug–Oct 2026"
        />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Housing · Meals · Pay</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="listing-housing">
              Housing
            </label>
            <input
              className={styles.input}
              id="listing-housing"
              name="housing"
              type="text"
              defaultValue={triad?.housing ?? ""}
              placeholder="On-site housing"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="listing-meals">
              Meals
            </label>
            <input
              className={styles.input}
              id="listing-meals"
              name="meals"
              type="text"
              defaultValue={triad?.meals ?? ""}
              placeholder="Daily meals provided"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="listing-pay">
              Pay
            </label>
            <input
              className={styles.input}
              id="listing-pay"
              name="pay"
              type="text"
              defaultValue={triad?.pay ?? ""}
              placeholder="Hourly + tips"
            />
          </div>
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button className={styles.submit} type="button">
          <Icon name="action.forward" size={20} aria-hidden />
          <span>{submitLabel}</span>
        </button>
        <Link className={styles.cancel} href={cancelHref}>
          Cancel
        </Link>
      </div>

      <p className={styles.note}>
        This is a UI preview. Saving activates when the listings data layer lands.
      </p>
    </form>
  );
}
