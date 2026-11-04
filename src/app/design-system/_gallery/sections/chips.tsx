'use client';

import { useState } from 'react';
import { categories } from '@/ui/categories';
import {
  Badge,
  CategoryBadge,
  CategoryListBadge,
  Chip,
  Pill,
  type BadgeProps,
} from '@/ui/components';
import {
  Banknote,
  BedDouble,
  Check,
  CircleAlert,
  Clock,
  FileText,
  ListChecks,
  Sparkles,
  Target,
  TriangleAlert,
  Utensils,
} from '@/ui/icons';
import { ForceFocus, Section, Specimen, States } from '../Specimen';
import { hoverLook } from '../states';

const open = () => {};

function PillFilters() {
  const [selected, setSelected] = useState<string>('all');
  return (
    <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
      <Pill selected={selected === 'all'} onClick={() => setSelected('all')}>
        All
      </Pill>
      {categories.map((c) => (
        <Pill key={c} category={c} selected={selected === c} onClick={() => setSelected(c)}>
          {c[0]?.toUpperCase() + c.slice(1)}
        </Pill>
      ))}
    </div>
  );
}

const badgeTones: {
  tone: NonNullable<BadgeProps['tone']>;
  label: string;
  icon?: BadgeProps['icon'];
}[] = [
  { tone: 'neutral', label: 'Draft' },
  { tone: 'surface', label: 'Boosted', icon: Sparkles },
  { tone: 'inverse', label: 'Applied 2 days ago' },
  { tone: 'success', label: 'Provided', icon: Check },
  { tone: 'warning', label: 'Expires in 2 days', icon: Clock },
  { tone: 'danger', label: 'Rejected', icon: CircleAlert },
];

export function ChipsSection() {
  return (
    <>
      <Section
        id="chip"
        title="Chip"
        description="The card’s pop-up chip: a small upper-case label above a bold value. “Provided” is green and always carries a check, so it never relies on color. A chip with a pop-up is a button; without one it is plain text."
      >
        <Specimen
          title="Tones"
          note="default for values, success for Provided, muted for what is not offered."
        >
          {() => (
            <div className="grid max-w-md grid-cols-3 gap-2">
              <Chip
                label="Housing"
                icon={BedDouble}
                value="Provided"
                tone="success"
                onOpen={open}
              />
              <Chip label="Meals" icon={Utensils} value="No meals" tone="muted" onOpen={open} />
              <Chip label="Pay" icon={Banknote} value="$19/hr" onOpen={open} />
            </div>
          )}
        </Specimen>
        <Specimen
          title="Candidate chips"
          note="The same chip on the candidate card: Resume, Fit and Skills."
        >
          {() => (
            <div className="grid max-w-md grid-cols-3 gap-2">
              <Chip label="Resume" icon={FileText} value="3 seasons" onOpen={open} />
              <Chip
                label="Fit"
                icon={Target}
                value={
                  <>
                    86<span className="font-semibold text-muted"> · Strong</span>
                  </>
                }
                onOpen={open}
              />
              <Chip label="Skills" icon={ListChecks} value="12 listed" onOpen={open} />
            </div>
          )}
        </Specimen>
        <Specimen title="States">
          {() => (
            <States
              items={[
                {
                  label: 'Default',
                  node: (
                    <Chip
                      label="Housing"
                      icon={BedDouble}
                      value="Provided"
                      tone="success"
                      onOpen={open}
                      className="w-36"
                    />
                  ),
                },
                {
                  label: 'Hover',
                  node: (
                    <Chip
                      label="Housing"
                      icon={BedDouble}
                      value="Provided"
                      tone="success"
                      onOpen={open}
                      className={`w-36 ${hoverLook.chip}`}
                    />
                  ),
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Chip
                        label="Housing"
                        icon={BedDouble}
                        value="Provided"
                        tone="success"
                        onOpen={open}
                        className="w-36"
                      />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'Static (no pop-up)',
                  node: <Chip label="Pay" icon={Banknote} value="$19/hr" className="w-36" />,
                },
                {
                  label: 'Long value',
                  node: (
                    <Chip
                      label="Pay"
                      icon={Banknote}
                      value="$18.50–22/hr"
                      onOpen={open}
                      className="w-36"
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="pill"
        title="Pill"
        description="Filters and pipeline stages. 36 px to look at, 44 px to touch. Selected pills are near-black and announced as pressed."
      >
        <Specimen title="Category filters" note="Try them: one is selected at a time.">
          {() => <PillFilters />}
        </Specimen>
        <Specimen title="States">
          {() => (
            <States
              items={[
                { label: 'Default', node: <Pill selected={false}>Shortlisted</Pill> },
                {
                  label: 'Hover',
                  node: (
                    <Pill selected={false} className={hoverLook.pill}>
                      Shortlisted
                    </Pill>
                  ),
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Pill selected={false}>Shortlisted</Pill>
                    </ForceFocus>
                  ),
                },
                { label: 'Selected', node: <Pill selected>Shortlisted</Pill> },
                {
                  label: 'Disabled',
                  node: (
                    <Pill selected={false} disabled>
                      Shortlisted
                    </Pill>
                  ),
                },
                {
                  label: 'With count',
                  node: (
                    <Pill selected count={8}>
                      New
                    </Pill>
                  ),
                },
                {
                  label: 'Count, unselected',
                  node: (
                    <Pill selected={false} count={5}>
                      Shortlisted
                    </Pill>
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="badge"
        title="Badge"
        description="Read-only labels. Warning and danger badges always carry an icon."
      >
        <Specimen title="Tones">
          {() => (
            <States
              items={badgeTones.map((b) => ({
                label: b.tone,
                node: (
                  <Badge tone={b.tone} icon={b.icon}>
                    {b.label}
                  </Badge>
                ),
              }))}
            />
          )}
        </Specimen>
        <Specimen
          title="Small"
          note="Upper-case, for the Seeker and Host role badge in the top bar."
        >
          {() => (
            <States
              items={[
                { label: 'Seeker', node: <Badge size="sm">Seeker</Badge> },
                {
                  label: 'Host',
                  node: (
                    <Badge size="sm" tone="inverse">
                      Host
                    </Badge>
                  ),
                },
                {
                  label: 'Operator',
                  node: (
                    <Badge size="sm" tone="inverse">
                      Operator
                    </Badge>
                  ),
                },
                {
                  label: 'With icon',
                  node: (
                    <Badge size="sm" tone="warning" icon={TriangleAlert}>
                      Overdue
                    </Badge>
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="category-badge"
        title="CategoryBadge"
        description="The category tint with its icon and label, on card covers and host pages. Several categories share one neutral badge, each icon in its color."
      >
        <Specimen title="Categories">
          {() => (
            <States
              items={[
                ...categories.map((c) => ({ label: c, node: <CategoryBadge category={c} /> })),
                {
                  label: 'Several (candidate interests)',
                  node: <CategoryListBadge categories={['seasonal', 'maritime']} />,
                },
              ]}
            />
          )}
        </Specimen>
      </Section>
    </>
  );
}
