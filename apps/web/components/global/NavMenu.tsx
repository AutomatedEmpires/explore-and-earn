"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import styles from "./NavMenu.module.css";

export interface NavMenuItem {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly icon: IconKey;
}

export interface NavMenuProps {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavMenuItem[];
  /** Renders the trigger in its "you are here" state. */
  readonly active?: boolean;
}

/**
 * The signed-out header's door menus (V2 D18): For Seekers · For Hosts.
 *
 * WHY A MENU AND NOT A ROW OF LINKS. The two-door IA asks a visitor to pick a
 * SIDE before a destination. Flattening either side back into the bar puts
 * eight peer links on a marketing header and re-creates the problem D18 exists
 * to solve — a nav that describes the sitemap instead of the choice.
 *
 * KEYBOARD CONTRACT (WCAG 2.2 AA · APG disclosure-with-menu pattern):
 *
 *   Enter/Space on the trigger  toggles, focusing the first item on open
 *   ArrowDown / ArrowUp         opens and lands on the first / last item
 *   ArrowDown / ArrowUp inside  moves between items, wrapping
 *   Home / End                  jumps to the first / last item
 *   Escape                      closes AND RETURNS FOCUS to the trigger
 *   Tab                         closes and lets focus continue past the menu
 *   pointerdown outside         closes, leaving focus where the pointer went
 *
 * Escape returning focus is the one that is easy to omit and impossible to
 * recover from: without it a keyboard user who dismisses the menu is dropped at
 * the top of the document and has to traverse the page again.
 *
 * Items carry roving tabindex (-1) because the container owns arrow-key
 * movement; the trigger is the single tab stop for the whole menu, which is
 * what keeps the header at four tab stops instead of twelve.
 */
export function NavMenu({ id, label, items, active = false }: NavMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  /** Which item to focus once the panel is in the DOM; null = focus nothing. */
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const menuId = `${useId()}-${id}`;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPendingFocus(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Close on navigation — the menu's whole job is done the moment a link fires.
  useEffect(() => {
    setOpen(false);
    setPendingFocus(null);
  }, [pathname]);

  // Outside pointer + Escape. Bound only while open so a page with two menus
  // does not carry two idle document listeners.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // Move focus after the panel renders. Doing it inside the click handler would
  // aim at an element that does not exist yet on the first open.
  useEffect(() => {
    if (!open || pendingFocus === null) return;
    itemRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [open, pendingFocus]);

  /** Open the panel, optionally landing focus on one of its items. */
  const openAt = (index: number | null) => {
    setOpen(true);
    setPendingFocus(index);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusable = itemRefs.current.filter(Boolean) as HTMLAnchorElement[];
    if (focusable.length === 0) return;
    const current = focusable.indexOf(
      document.activeElement as HTMLAnchorElement,
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusable[(current + 1 + focusable.length) % focusable.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        focusable[(current - 1 + focusable.length) % focusable.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        focusable[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
        break;
      case "Tab":
        // Not prevented: Tab closes the menu and focus continues to whatever
        // follows the trigger, which is what a sighted keyboard user expects
        // from a header. Trapping focus in a nav menu is a dead end.
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger}${active ? ` ${styles.triggerActive}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          if (open) {
            close(false);
            return;
          }
          // A button's click handler fires for BOTH a mouse click and
          // Enter/Space, and the two want different things: a keyboard user
          // needs focus moved into the panel, a mouse user does not (yanking
          // focus mid-click scrolls the page under their cursor). `detail === 0`
          // is how the two are told apart — a synthetic/keyboard activation
          // carries no click count.
          openAt(event.detail === 0 ? 0 : null);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {label}
        <Icon name="action.more" size={14} aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          className={styles.panel}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <Link
              key={item.href}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={styles.item}
              role="menuitem"
              tabIndex={-1}
              href={item.href}
              onClick={() => close(false)}
            >
              <span className={styles.itemIcon}>
                <Icon name={item.icon} size={18} aria-hidden />
              </span>
              <span className={styles.itemText}>
                <span className={styles.itemLabel}>{item.label}</span>
                <span className={styles.itemDescription}>{item.description}</span>
              </span>
              <Icon name="action.forward" size={14} aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
