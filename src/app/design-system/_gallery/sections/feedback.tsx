'use client';

import {
  Button,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Skeleton,
  Toast,
  ToastProvider,
  useToast,
} from '@/ui/components';
import { Bookmark, Briefcase, Search } from '@/ui/icons';
import { Section, Specimen, States } from '../Specimen';

const noop = () => {};

function ShowToast() {
  const { toast } = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => toast({ title: 'Job skipped', action: { label: 'Undo', onAction: noop } })}
    >
      Show a toast
    </Button>
  );
}

export function FeedbackSection() {
  return (
    <>
      <Section
        id="toast"
        title="Toast"
        description="Short confirmations at the bottom of the screen, announced politely. Five seconds, or ten with an action such as Undo; hovering or focusing pauses it."
      >
        <Specimen title="Tones and actions">
          {() => (
            <States
              className="flex-col"
              items={[
                {
                  label: 'With Undo',
                  wide: true,
                  node: (
                    <Toast
                      title="Job skipped"
                      action={{ label: 'Undo', onAction: noop }}
                      onDismiss={noop}
                      className="max-w-sm motion-safe:animate-none"
                    />
                  ),
                },
                {
                  label: 'Success',
                  wide: true,
                  node: (
                    <Toast
                      tone="success"
                      title="Application sent"
                      description="Kettle Ridge Lodge usually replies within a day."
                      onDismiss={noop}
                      className="max-w-sm motion-safe:animate-none"
                    />
                  ),
                },
                {
                  label: 'Danger',
                  wide: true,
                  node: (
                    <Toast
                      tone="danger"
                      title="Your message wasn’t sent"
                      description="Check your connection and try again."
                      action={{ label: 'Retry', onAction: noop }}
                      className="max-w-sm motion-safe:animate-none"
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
        <Specimen
          title="Live"
          note="Shows a real toast at the bottom of the screen, in this frame’s theme."
        >
          {() => (
            <ToastProvider>
              <ShowToast />
            </ToastProvider>
          )}
        </Specimen>
      </Section>

      <Section
        id="empty"
        title="EmptyState"
        description="Nothing here yet, with the one next step. Placeholder screens use it too, naming the sub-project that builds them; they are hidden in production."
      >
        <Specimen title="Empty list">
          {() => (
            <EmptyState
              icon={Bookmark}
              titleAs="h3"
              title="No saved jobs yet"
              description="Tap Save on any job card and it will wait for you here."
              action={
                <Button variant="secondary" icon={Search}>
                  Browse jobs
                </Button>
              }
            />
          )}
        </Specimen>
        <Specimen title="Placeholder screen">
          {() => (
            <EmptyState
              icon={Briefcase}
              titleAs="h3"
              title="Coming in sub-project 2: Listings"
              description="Create, publish and manage job listings."
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="error"
        title="ErrorState"
        description="An icon plus text, never color alone, with a way to recover. Errors that appear after an action are announced."
      >
        <Specimen title="With retry">
          {() => (
            <ErrorState
              announce="none"
              titleAs="h3"
              title="Couldn’t load applicants"
              description="Check your connection, then try again."
              action={<Button variant="secondary">Try again</Button>}
            />
          )}
        </Specimen>
        <Specimen title="Default">{() => <ErrorState announce="none" titleAs="h3" />}</Specimen>
      </Section>

      <Section
        id="skeleton"
        title="Skeleton"
        description="Loading placeholders in the shape of what is coming. They pulse only when motion is allowed and are hidden from screen readers."
      >
        <Specimen title="Shapes">
          {() => (
            <States
              items={[
                { label: 'Text', node: <Skeleton shape="text" className="w-48" /> },
                { label: 'Rect', node: <Skeleton className="h-16 w-28" /> },
                { label: 'Circle', node: <Skeleton shape="circle" className="size-12" /> },
                {
                  label: 'List row',
                  node: (
                    <div className="flex w-64 items-center gap-3">
                      <Skeleton shape="circle" className="size-10 shrink-0" />
                      <div className="flex flex-1 flex-col gap-2">
                        <Skeleton shape="text" className="w-3/4" />
                        <Skeleton shape="text" className="w-1/2" />
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Specimen>
        <Specimen title="Card">{() => <CardSkeleton className="max-w-sm" />}</Specimen>
      </Section>
    </>
  );
}
