'use client';

import { useState } from 'react';
import {
  BarChart,
  DonutChart,
  SegmentedControl,
  StackedBar,
  StatTile,
  type BarDatum,
  type ChartView,
  type DonutSlice,
  type StackedDatum,
  type StackedSeries,
} from '@/ui/components';
import { CalendarDays, Clock, Inbox, Store } from '@/ui/icons';
import { Section, Specimen } from '../Specimen';

const applicantsPerWeek: BarDatum[] = [
  { label: 'Apr 6', value: 9 },
  { label: 'Apr 13', value: 14 },
  { label: 'Apr 20', value: 11 },
  { label: 'Apr 27', value: 18 },
  { label: 'May 4', value: 21 },
  { label: 'May 11', value: 24 },
];

const byCategory: DonutSlice[] = [
  { label: 'Seasonal', value: 14, color: 'seasonal' },
  { label: 'Maritime', value: 6, color: 'maritime' },
  { label: 'Farm', value: 3, color: 'farm' },
  { label: 'Remote', value: 1, color: 'remote' },
];

const stages: StackedSeries[] = [
  { key: 'new', label: 'New', color: 'muted' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'ink' },
  { key: 'hired', label: 'Hired', color: 'success' },
];

const pipeline: StackedDatum[] = [
  { label: 'Housekeeper', values: { new: 8, shortlisted: 5, hired: 1 } },
  { label: 'Line Cook', values: { new: 4, shortlisted: 2, hired: 2 } },
  { label: 'Deckhand', values: { new: 6, shortlisted: 3, hired: 0 } },
];

function ViewToggle({ value, onChange }: { value: ChartView; onChange: (v: ChartView) => void }) {
  return (
    <SegmentedControl
      label="View"
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'chart', label: 'Chart' },
        { value: 'table', label: 'Table' },
      ]}
    />
  );
}

function Live() {
  const [view, setView] = useState<ChartView>('chart');
  return (
    <div className="flex flex-col gap-4">
      <ViewToggle value={view} onChange={setView} />
      <BarChart
        title="Applicants per week"
        description="Lodge Housekeeper, last six weeks"
        data={applicantsPerWeek}
        view={view}
        labelHeader="Week"
        valueLabel="Applicants"
      />
    </div>
  );
}

export function ChartsSection() {
  return (
    <>
      <Section
        id="stat-tile"
        title="StatTile"
        description="One number and its label. A trend says whether the change is good news; only good news is green."
      >
        <Specimen title="Host Home">
          {() => (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                label="Applicants this week"
                icon={Inbox}
                value="24"
                trend={{ label: '+14% vs last week', direction: 'up', positive: true }}
              />
              <StatTile
                label="Interviews today"
                icon={CalendarDays}
                value="3"
                trend={{ label: 'Same as yesterday', direction: 'flat' }}
              />
              <StatTile
                label="Time to first reply"
                icon={Clock}
                value="6 h"
                trend={{ label: '2 h faster', direction: 'down', positive: true }}
              />
              <StatTile
                label="Host page views"
                icon={Store}
                value="312"
                trend={{ label: '−8% vs last week', direction: 'down' }}
                hint="Views come mostly from Seek."
              />
            </div>
          )}
        </Specimen>
      </Section>

      <Section
        id="charts"
        title="Charts"
        description="Recharts, wrapped so they take token colors only. Every chart has a table view with the same numbers, for screen readers and for reading exact values."
      >
        <Specimen title="Bar chart">
          {() => (
            <BarChart
              title="Applicants per week"
              description="Lodge Housekeeper, last six weeks"
              data={applicantsPerWeek}
              labelHeader="Week"
              valueLabel="Applicants"
            />
          )}
        </Specimen>
        <Specimen title="Bar chart, table view">
          {() => (
            <BarChart
              title="Applicants per week"
              description="Lodge Housekeeper, last six weeks"
              data={applicantsPerWeek}
              view="table"
              labelHeader="Week"
              valueLabel="Applicants"
            />
          )}
        </Specimen>
        <Specimen
          title="Stacked bar"
          note="Status colors only where they mean something: Hired is green."
        >
          {() => (
            <StackedBar
              title="Applicants by stage"
              description="Open listings at Kettle Ridge Lodge"
              series={stages}
              data={pipeline}
              orientation="rows"
              labelHeader="Listing"
              height={200}
            />
          )}
        </Specimen>
        <Specimen title="Stacked bar, table view">
          {() => (
            <StackedBar
              title="Applicants by stage"
              description="Open listings at Kettle Ridge Lodge"
              series={stages}
              data={pipeline}
              view="table"
              labelHeader="Listing"
            />
          )}
        </Specimen>
        <Specimen title="Donut chart" note="Category colors where the slices are categories.">
          {() => (
            <DonutChart
              title="Applicants by category"
              description="This season"
              data={byCategory}
              centerLabel="applicants"
              labelHeader="Category"
              valueLabel="Applicants"
            />
          )}
        </Specimen>
        <Specimen title="Donut chart, table view">
          {() => (
            <DonutChart
              title="Applicants by category"
              description="This season"
              data={byCategory}
              view="table"
              labelHeader="Category"
              valueLabel="Applicants"
            />
          )}
        </Specimen>
        <Specimen
          title="Chart and table toggle"
          note="The SegmentedControl switches views in place."
        >
          {() => <Live />}
        </Specimen>
      </Section>
    </>
  );
}
