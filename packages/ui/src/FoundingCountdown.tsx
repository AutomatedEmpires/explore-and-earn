export interface FoundingCountdownProps {
  readonly label?: string;
}

export function FoundingCountdown({
  label = "Founding program countdown placeholder"
}: FoundingCountdownProps) {
  return <span className="ui-countdown">{label}</span>;
}