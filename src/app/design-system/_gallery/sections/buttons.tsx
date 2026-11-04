import type { ReactNode } from 'react';
import { Button, IconButton, Img, type IconButtonProps } from '@/ui/components';
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronRight,
  Info,
  MessageSquare,
  Plus,
  Send,
  X,
  type IconComponent,
} from '@/ui/icons';
import { seekerNavIcons as seeker } from '@/ui/nav-icons';
import { img } from '../samples';
import { ForceFocus, Section, Specimen, States } from '../Specimen';
import { hoverLook, type ButtonVariant, type IconButtonVariant } from '../states';

const buttonCopy: Record<ButtonVariant, { label: string; use: string }> = {
  primary: {
    label: 'Apply',
    use: 'The one main action on a screen or card. Near-black, never colored.',
  },
  secondary: { label: 'Message host', use: 'Every other action beside a primary one.' },
  ghost: { label: 'Cancel', use: 'Low-emphasis actions in toolbars and dialogs.' },
  danger: { label: 'Withdraw', use: 'Destructive actions, after a confirmation dialog.' },
};

function buttonStates(variant: ButtonVariant) {
  const { label } = buttonCopy[variant];
  return [
    { label: 'Default', node: <Button variant={variant}>{label}</Button> },
    {
      label: 'Hover',
      node: (
        <Button variant={variant} className={hoverLook.button[variant]}>
          {label}
        </Button>
      ),
    },
    {
      label: 'Focus',
      node: (
        <ForceFocus>
          <Button variant={variant}>{label}</Button>
        </ForceFocus>
      ),
    },
    {
      label: 'Disabled',
      node: (
        <Button variant={variant} disabled>
          {label}
        </Button>
      ),
    },
    {
      label: 'Loading',
      node: (
        <Button variant={variant} loading>
          {label}
        </Button>
      ),
    },
  ];
}

const iconCopy: Record<IconButtonVariant, { icon: IconComponent; label: string; use: string }> = {
  ghost: { icon: Bell, label: 'Notifications', use: 'Top bars and toolbars.' },
  outline: { icon: Bookmark, label: 'Save', use: 'Card actions (Skip, Save, Pass, Shortlist).' },
  subtle: { icon: X, label: 'Close', use: 'Closing sheets and dialogs.' },
  primary: { icon: Plus, label: 'Add', use: 'A compact primary action.' },
  overlay: { icon: Info, label: 'Details', use: 'On top of a photo (the Swipe info button).' },
};

/** The overlay variant sits on a photo, as it does on a card cover. */
function OnPhoto({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg">
      <Img src={img.lake} alt="" className="absolute inset-0 size-full object-cover" />
      <span className="relative">{children}</span>
    </span>
  );
}

function iconStates(variant: IconButtonVariant) {
  const { icon, label } = iconCopy[variant];
  const wrap = (node: ReactNode) => (variant === 'overlay' ? <OnPhoto>{node}</OnPhoto> : node);
  const base: IconButtonProps = { icon, label, variant };
  return [
    { label: 'Default', node: wrap(<IconButton {...base} />) },
    {
      label: 'Hover',
      node: wrap(<IconButton {...base} className={hoverLook.iconButton[variant]} />),
    },
    {
      label: 'Focus',
      node: wrap(
        <ForceFocus>
          <IconButton {...base} />
        </ForceFocus>,
      ),
    },
    { label: 'Disabled', node: wrap(<IconButton {...base} disabled />) },
    ...(variant === 'outline'
      ? [{ label: 'Pressed', node: <IconButton {...base} aria-pressed /> }]
      : []),
  ];
}

export function ButtonsSection() {
  const variants = Object.keys(buttonCopy) as ButtonVariant[];
  const iconVariants = Object.keys(iconCopy) as IconButtonVariant[];
  return (
    <>
      <Section
        id="button"
        title="Button"
        description="Pill-shaped, bold labels, 44 px (md) or 48 px (lg) tall. Loading shows a spinner, sets aria-busy and blocks a second press."
      >
        {variants.map((variant) => (
          <Specimen
            key={variant}
            title={variant[0]?.toUpperCase() + variant.slice(1)}
            note={buttonCopy[variant].use}
          >
            {() => <States items={buttonStates(variant)} />}
          </Specimen>
        ))}
        <Specimen
          title="Sizes, icons and links"
          note="lg is used for card actions. A Button can render a link (asChild) with the same look."
        >
          {() => (
            <States
              items={[
                { label: 'md · 44 px', node: <Button>Apply</Button> },
                { label: 'lg · 48 px', node: <Button size="lg">Apply</Button> },
                {
                  label: 'With icon',
                  node: (
                    <Button size="lg" icon={CalendarDays}>
                      Interview
                    </Button>
                  ),
                },
                {
                  label: 'Secondary with icon',
                  node: (
                    <Button variant="secondary" icon={MessageSquare}>
                      Message
                    </Button>
                  ),
                },
                {
                  label: 'Link (asChild)',
                  node: (
                    <Button asChild variant="secondary">
                      <a href="#listing">
                        All housing details on the listing
                        <ChevronRight className="size-4" />
                      </a>
                    </Button>
                  ),
                },
                {
                  label: 'Full width',
                  wide: true,
                  node: (
                    <Button size="lg" fullWidth icon={Send}>
                      Invite to apply
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="icon-button"
        title="IconButton"
        description="A 44 px square or circle with one icon. Its label is required and becomes the accessible name."
      >
        {iconVariants.map((variant) => (
          <Specimen
            key={variant}
            title={variant[0]?.toUpperCase() + variant.slice(1)}
            note={iconCopy[variant].use}
          >
            {() => <States items={iconStates(variant)} />}
          </Specimen>
        ))}
        <Specimen
          title="Sizes and badges"
          note="The count shown goes in the label too, e.g. “Inbox, 2 unread” or “Inbox, 99+ unread”."
        >
          {() => (
            <States
              items={[
                {
                  label: 'md · 44 px',
                  node: <IconButton icon={Bookmark} label="Save" variant="outline" />,
                },
                {
                  label: 'lg · 48 px',
                  node: <IconButton icon={Bookmark} label="Save" variant="outline" size="lg" />,
                },
                {
                  label: 'Count',
                  node: <IconButton icon={seeker.inbox} label="Inbox, 2 unread" badge={2} />,
                },
                {
                  label: 'Over 99',
                  node: <IconButton icon={seeker.inbox} label="Inbox, 99+ unread" badge={120} />,
                },
                {
                  label: 'Dot',
                  node: <IconButton icon={Bell} label="Notifications, new" badge />,
                },
              ]}
            />
          )}
        </Specimen>
      </Section>
    </>
  );
}
