import type { PropsWithChildren } from "react";

export interface CardProps extends PropsWithChildren {
  readonly title?: string;
}

export function Card({ children, title }: CardProps) {
  return (
    <section className="ui-card">
      {title ? <h2 className="ui-card__title">{title}</h2> : null}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}