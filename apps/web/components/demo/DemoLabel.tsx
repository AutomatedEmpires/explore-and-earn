import type { DemoLabel as DemoLabelText } from "./enterpriseDemo";
import styles from "./demoChrome.module.css";

/**
 * The demo disclosure pill.
 *
 * Takes its text from the fixture item it labels — never a literal typed at the
 * call site — so a surface cannot render demo content with a label that drifted
 * away from the data, and cannot render it with no label at all.
 */
export function DemoLabel({
  text,
  className,
}: {
  readonly text: DemoLabelText;
  readonly className?: string;
}) {
  return (
    <span className={[styles.label, className].filter(Boolean).join(" ")}>
      {text}
    </span>
  );
}
