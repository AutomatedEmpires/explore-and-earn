'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Pill, Select, type SelectOption } from '@/ui/components';
import { User } from '@/ui/icons';

/** Queue, status and "Mine" filters for the review queue list; each change reloads the list. */
export function QueueFilters({
  queues,
  statuses,
  queue,
  status,
  mine,
}: {
  queues: readonly SelectOption<string>[];
  statuses: readonly SelectOption<string>[];
  queue: string;
  status: string;
  mine: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: 'queue' | 'status' | 'mine', value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
      aria-busy={pending || undefined}
    >
      <Select
        label="Queue"
        options={queues}
        value={queue}
        onValueChange={(v) => update('queue', v === 'all' ? null : v)}
        className="sm:w-56"
      />
      <Select
        label="Status"
        options={statuses}
        value={status}
        onValueChange={(v) => update('status', v === 'unresolved' ? null : v)}
        className="sm:w-56"
      />
      <div className="flex h-12 items-center">
        <Pill icon={User} selected={mine} onClick={() => update('mine', mine ? null : '1')}>
          Assigned to me
        </Pill>
      </div>
    </div>
  );
}
