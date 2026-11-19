// @vitest-environment jsdom
// MuteToggle (SP4 plan Task 34): a Switch labeled "Mute [orgName]" that PUTs on and DELETEs off,
// says what a mute does and doesn't do, and goes back when the call fails.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiUrl, server, setupMswServer } from '@tests/msw/server';
import { seriousOrCritical } from './axe-test-helper';
import { MuteToggle } from './MuteToggle';

setupMswServer();

const ORG_ID = '019a4a3c-0000-7000-8000-0000000d0003';
const PATH = `/api/v1/me/mutes/${ORG_ID}`;

function capture() {
  const calls: string[] = [];
  server.use(
    http.put(apiUrl(PATH), () => {
      calls.push('PUT');
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(apiUrl(PATH), () => {
      calls.push('DELETE');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

describe('MuteToggle', () => {
  it('is a switch labeled with the host and says what a mute does', () => {
    render(<MuteToggle orgId={ORG_ID} orgName="Kettle Ridge Lodge" muted={false} />);
    const toggle = screen.getByRole('switch', { name: 'Mute Kettle Ridge Lodge' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription(
      "Kettle Ridge Lodge can't invite you, and you stop following them. You still see their jobs and can apply.",
    );
  });

  it('mutes with PUT and unmutes with DELETE, reporting each change', async () => {
    const calls = capture();
    const onChange = vi.fn();
    render(
      <MuteToggle orgId={ORG_ID} orgName="Kettle Ridge Lodge" muted={false} onChange={onChange} />,
    );
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true));
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(false));
    expect(calls).toEqual(['PUT', 'DELETE']);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('goes back and says so when the change fails', async () => {
    server.use(
      http.put(apiUrl(PATH), () =>
        HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 }),
      ),
    );
    const onChange = vi.fn();
    render(
      <MuteToggle orgId={ORG_ID} orgName="Kettle Ridge Lodge" muted={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't change this. Try again.",
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('MuteToggle accessibility', () => {
  it('has no serious or critical axe violations, with and without the error', async () => {
    server.use(
      http.put(apiUrl(PATH), () =>
        HttpResponse.json({ error: { code: 'internal', message: 'No' } }, { status: 500 }),
      ),
    );
    const { container } = render(
      <MuteToggle orgId={ORG_ID} orgName="Kettle Ridge Lodge" muted={false} />,
    );
    expect(await seriousOrCritical(container)).toEqual([]);
    fireEvent.click(screen.getByRole('switch'));
    await screen.findByRole('alert');
    expect(await seriousOrCritical(container)).toEqual([]);
  });
});
