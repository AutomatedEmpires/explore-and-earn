import { Icon } from "./icons";

export function VerifiedHostBadge() {
  return (
    <span className="ui-badge ui-badge--verified" data-icon="trust.verified_host">
      <Icon aria-hidden name="trust.verified_host" size={16} />
      <span>Verified Host</span>
    </span>
  );
}