'use client';

import { useState } from 'react';
import {
  Checkbox,
  Input,
  Radio,
  RadioGroup,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  type ChartView,
} from '@/ui/components';
import { Search } from '@/ui/icons';
import type { Theme } from '@/ui/tokens';
import { ForceFocus, Section, Specimen, States } from '../Specimen';
import { hoverLook } from '../states';

const field = 'w-full sm:w-64';

const roles = [
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'deckhand', label: 'Deckhand' },
  { value: 'guide', label: 'Guide', disabled: true },
] as const;

type Role = (typeof roles)[number]['value'];

function ViewToggle({ focus = false }: { focus?: boolean }) {
  const [view, setView] = useState<ChartView>('chart');
  const control = (
    <SegmentedControl
      label="View"
      value={view}
      onValueChange={setView}
      options={[
        { value: 'chart', label: 'Chart' },
        { value: 'table', label: 'Table' },
      ]}
    />
  );
  return focus ? <ForceFocus current>{control}</ForceFocus> : control;
}

function CommunityTabs({ variant }: { variant: 'default' | 'hover' | 'focus' }) {
  const tabs = (
    <Tabs defaultValue="feed" className="w-full">
      <TabsList aria-label="Community sections">
        <TabsTrigger value="feed">Feed</TabsTrigger>
        <TabsTrigger value="photos" className={variant === 'hover' ? hoverLook.tab : undefined}>
          Photos
        </TabsTrigger>
        <TabsTrigger value="announcements">Announcements</TabsTrigger>
        <TabsTrigger value="stories" disabled>
          Stories
        </TabsTrigger>
      </TabsList>
      <TabsContent value="feed" className="text-14 text-ink-2">
        Seeker photos, newest first.
      </TabsContent>
      <TabsContent value="photos" className="text-14 text-ink-2">
        Every photo, in a grid.
      </TabsContent>
      <TabsContent value="announcements" className="text-14 text-ink-2">
        Paid host announcements.
      </TabsContent>
    </Tabs>
  );
  return variant === 'focus' ? <ForceFocus current>{tabs}</ForceFocus> : tabs;
}

function WorkAuthorization({ theme, error }: { theme: Theme; error?: boolean }) {
  const name = `work-authorization-${theme}${error ? '-error' : ''}`;
  return (
    <RadioGroup
      legend="Work authorization"
      error={error ? 'Choose one so hosts know whether you need sponsorship.' : undefined}
      className="w-full sm:w-80"
    >
      <Radio
        name={name}
        value="authorized"
        label="Authorized to work in the US"
        defaultChecked={!error}
      />
      <Radio
        name={name}
        value="sponsorship"
        label="I’ll need visa sponsorship"
        description="J-1, H-2A, H-2B or other"
      />
      <Radio name={name} value="visa" label="I already have a visa" disabled />
    </RadioGroup>
  );
}

export function FormsSection() {
  return (
    <>
      <Section
        id="input"
        title="Input"
        description="48 px tall with a 3:1 outline. Errors show an icon and text and set aria-invalid; hints are read with the field."
      >
        <Specimen title="States">
          {() => (
            <States
              items={[
                {
                  label: 'Default',
                  node: (
                    <Input
                      label="Email"
                      type="email"
                      placeholder="you@example.com"
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Filled',
                  node: <Input label="First name" defaultValue="Maya" fieldClassName={field} />,
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Input label="First name" defaultValue="Maya" fieldClassName={field} />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'Hint and required',
                  node: (
                    <Input
                      label="Organization name"
                      required
                      defaultValue="Kettle Ridge Lodge"
                      hint="Shown on your host page and every listing."
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Error',
                  node: (
                    <Input
                      label="Email"
                      type="email"
                      defaultValue="maya@"
                      error="Enter a full email address, like maya@example.com."
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Disabled',
                  node: (
                    <Input
                      label="Account type"
                      defaultValue="Seeker"
                      disabled
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Leading icon, hidden label',
                  node: (
                    <Input
                      label="Search jobs"
                      hideLabel
                      type="search"
                      leadingIcon={Search}
                      placeholder="Search jobs, places, employers"
                      fieldClassName={field}
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section id="textarea" title="Textarea">
        <Specimen title="States">
          {() => (
            <States
              items={[
                {
                  label: 'Default',
                  node: (
                    <Textarea
                      label="About you"
                      placeholder="A few lines hosts read first"
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Textarea
                        label="About you"
                        defaultValue="Three summers in Alaska, two as housekeeping lead."
                        fieldClassName={field}
                      />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'Error',
                  node: (
                    <Textarea
                      label="Message"
                      defaultValue=""
                      required
                      error="Write a message before sending."
                      fieldClassName={field}
                    />
                  ),
                },
                {
                  label: 'Disabled',
                  node: (
                    <Textarea
                      label="Note"
                      defaultValue="Locked after the offer was sent."
                      disabled
                      fieldClassName={field}
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="select"
        title="Select"
        description="One choice from a list. Opens a menu; arrow keys move through it."
      >
        <Specimen title="States">
          {() => (
            <States
              items={[
                {
                  label: 'Placeholder',
                  node: <Select<Role> label="Role" options={roles} className={field} />,
                },
                {
                  label: 'Selected',
                  node: (
                    <Select<Role>
                      label="Role"
                      options={roles}
                      defaultValue="housekeeping"
                      className={field}
                    />
                  ),
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Select<Role>
                        label="Role"
                        options={roles}
                        defaultValue="kitchen"
                        className={field}
                      />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'Error',
                  node: (
                    <Select<Role>
                      label="Role"
                      options={roles}
                      required
                      error="Choose a role."
                      className={field}
                    />
                  ),
                },
                {
                  label: 'Disabled',
                  node: (
                    <Select<Role>
                      label="Role"
                      options={roles}
                      defaultValue="deckhand"
                      disabled
                      className={field}
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="checkbox"
        title="Checkbox and Radio"
        description="Native controls with a 44 px row as the target."
      >
        <Specimen title="Checkbox">
          {() => (
            <States
              items={[
                { label: 'Unchecked', node: <Checkbox label="Housing provided" /> },
                { label: 'Checked', node: <Checkbox label="Housing provided" defaultChecked /> },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Checkbox label="Housing provided" defaultChecked />
                    </ForceFocus>
                  ),
                },
                { label: 'Disabled', node: <Checkbox label="Meals provided" disabled /> },
                {
                  label: 'Description and error',
                  node: (
                    <Checkbox
                      label="I’m 18 or older"
                      description="You must be 18 to use Explore&Earn."
                      required
                      error="Confirm you’re 18 or older to continue."
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
        <Specimen title="Radio">
          {(theme) => (
            <States
              items={[
                { label: 'Group', node: <WorkAuthorization theme={theme} /> },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Radio
                        name={`radio-focus-${theme}`}
                        label="Authorized to work in the US"
                        defaultChecked
                      />
                    </ForceFocus>
                  ),
                },
                { label: 'Error', node: <WorkAuthorization theme={theme} error /> },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="switch"
        title="Switch"
        description="An on/off setting that takes effect at once (role=switch)."
      >
        <Specimen title="States">
          {() => (
            <States
              className="flex-col"
              items={[
                {
                  label: 'Off',
                  wide: true,
                  node: <Switch label="Show my photo to hosts" className="w-full max-w-sm" />,
                },
                {
                  label: 'On',
                  wide: true,
                  node: (
                    <Switch label="Visible to hosts" defaultChecked className="w-full max-w-sm" />
                  ),
                },
                {
                  label: 'Focus',
                  wide: true,
                  node: (
                    <ForceFocus>
                      <Switch label="Visible to hosts" defaultChecked className="w-full max-w-sm" />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'With description',
                  wide: true,
                  node: (
                    <Switch
                      label="Show my photo to hosts"
                      description="Off shows your initials instead"
                      className="w-full max-w-sm"
                    />
                  ),
                },
                {
                  label: 'Disabled',
                  wide: true,
                  node: (
                    <Switch
                      label="Security emails"
                      description="Required for your account"
                      defaultChecked
                      disabled
                      className="w-full max-w-sm"
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section
        id="slider"
        title="Slider"
        description="One value or a range. Each thumb names its value for screen readers."
      >
        <Specimen title="States">
          {() => (
            <States
              items={[
                {
                  label: 'Single',
                  node: (
                    <Slider
                      label="Distance"
                      defaultValue={[50]}
                      max={250}
                      step={10}
                      formatValue={(v) => `${v} mi`}
                      className={field}
                    />
                  ),
                },
                {
                  label: 'Range',
                  node: (
                    <Slider
                      label="Pay"
                      defaultValue={[18, 24]}
                      min={10}
                      max={40}
                      formatValue={(v) => `$${v}/hr`}
                      thumbLabels={['Minimum pay', 'Maximum pay']}
                      className={field}
                    />
                  ),
                },
                {
                  label: 'Focus',
                  node: (
                    <ForceFocus>
                      <Slider
                        label="Distance"
                        defaultValue={[50]}
                        max={250}
                        step={10}
                        formatValue={(v) => `${v} mi`}
                        className={field}
                      />
                    </ForceFocus>
                  ),
                },
                {
                  label: 'Disabled',
                  node: (
                    <Slider
                      label="Distance"
                      defaultValue={[120]}
                      max={250}
                      disabled
                      formatValue={(v) => `${v} mi`}
                      className={field}
                    />
                  ),
                },
              ]}
            />
          )}
        </Specimen>
      </Section>

      <Section id="segmented" title="SegmentedControl and Tabs">
        <Specimen
          title="SegmentedControl"
          note="One of a few views, such as Chart and Table. Native radios underneath."
        >
          {() => (
            <States
              items={[
                { label: 'Default', node: <ViewToggle /> },
                { label: 'Focus', node: <ViewToggle focus /> },
              ]}
            />
          )}
        </Specimen>
        <Specimen title="Tabs" note="Arrow keys move between tabs. The last tab is disabled.">
          {() => (
            <States
              className="flex-col"
              items={[
                { label: 'Default', wide: true, node: <CommunityTabs variant="default" /> },
                { label: 'Hover (Photos)', wide: true, node: <CommunityTabs variant="hover" /> },
                { label: 'Focus', wide: true, node: <CommunityTabs variant="focus" /> },
              ]}
            />
          )}
        </Specimen>
      </Section>
    </>
  );
}
