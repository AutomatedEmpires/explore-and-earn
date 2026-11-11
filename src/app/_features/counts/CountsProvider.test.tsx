// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountsProvider, useCounts } from './CountsProvider';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  emit(type: string, data: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }

  close(): void {
    this.closed = true;
  }
}

function Probe() {
  const { counts, refresh } = useCounts();
  return (
    <div>
      <span data-testid="counts">{counts ? JSON.stringify(counts) : 'none'}</span>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </div>
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CountsProvider', () => {
  it('reads counts from /api/v1/me/stream', () => {
    render(
      <CountsProvider enabled>
        <Probe />
      </CountsProvider>,
    );
    const [source] = FakeEventSource.instances;
    expect(source?.url).toBe('/api/v1/me/stream');
    act(() => source?.emit('counts', { inbox: 0, notifications: 2, profileDot: true }));
    expect(screen.getByTestId('counts').textContent).toBe(
      JSON.stringify({ inbox: 0, notifications: 2, profileDot: true }),
    );
  });

  it('reopens the stream on refresh', () => {
    render(
      <CountsProvider enabled>
        <Probe />
      </CountsProvider>,
    );
    act(() => screen.getByRole('button', { name: 'refresh' }).click());
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it('opens nothing for a guest and gives null counts outside a provider', () => {
    render(
      <CountsProvider enabled={false}>
        <Probe />
      </CountsProvider>,
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(screen.getByTestId('counts').textContent).toBe('none');
  });
});
