// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Send } from '@/ui/icons';
import { Badge, type BadgeProps } from './Badge';
import { TopBar } from './TopBar';

type Tone = NonNullable<BadgeProps['tone']>;

function badgeIcon(name: string) {
  return screen.getByText(name).querySelector('svg');
}

describe('Badge (#155 D3-1)', () => {
  it.each<[Tone, string]>([
    ['neutral', 'lucide-info'],
    ['surface', 'lucide-info'],
    ['inverse', 'lucide-info'],
    ['success', 'lucide-circle-check'],
    ['warning', 'lucide-triangle-alert'],
    ['danger', 'lucide-circle-alert'],
  ])('shows an icon by default: %s shows %s', (tone, iconClass) => {
    render(<Badge tone={tone}>Status</Badge>);
    const icon = badgeIcon('Status');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass(iconClass);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the icon it is given instead of the tone icon', () => {
    render(
      <Badge tone="success" icon={Send}>
        Sent
      </Badge>,
    );
    expect(badgeIcon('Sent')).toHaveClass('lucide-send');
    expect(screen.getByText('Sent').querySelectorAll('svg')).toHaveLength(1);
  });

  it('hides the icon only when asked', () => {
    render(<Badge showIcon={false}>Plain</Badge>);
    expect(badgeIcon('Plain')).toBeNull();
  });

  it('uses a 14 px icon and 14 px caps at size sm', () => {
    render(<Badge size="sm">Seeker</Badge>);
    const badge = screen.getByText('Seeker');
    expect(badge.className).toContain('text-14');
    expect(badge.className).not.toContain('text-12');
    expect(badgeIcon('Seeker')).toHaveClass('size-3.5');
  });

  it('gives the TopBar role badges their own icons', () => {
    const { rerender } = render(<TopBar role="seeker" />);
    expect(badgeIcon('Seeker')).toHaveClass('lucide-user');
    rerender(<TopBar role="host" />);
    expect(badgeIcon('Host')).toHaveClass('lucide-store');
    rerender(<TopBar role="operator" />);
    expect(badgeIcon('Operator')).toHaveClass('lucide-shield-check');
  });
});
