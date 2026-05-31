import type { PropsWithChildren } from "react";

export interface ModalProps extends PropsWithChildren {
  readonly heading: string;
}

export function Modal({ children, heading }: ModalProps) {
  return (
    <div aria-modal="true" className="ui-modal" role="dialog">
      <div className="ui-modal__surface">
        <h2>{heading}</h2>
        <div>{children}</div>
      </div>
    </div>
  );
}