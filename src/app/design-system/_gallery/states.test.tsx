// @vitest-environment jsdom
// The gallery's forced hover states must match what the components really do on hover.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, Chip, IconButton, Pill, Tabs, TabsList, TabsTrigger } from '@/ui/components';
import { Plus } from '@/ui/icons';
import { buttonVariantNames, hoverLook, iconButtonVariantNames } from './states';

describe('hoverLook', () => {
  it.each(buttonVariantNames)('matches Button %s', (variant) => {
    render(<Button variant={variant}>Apply</Button>);
    expect(screen.getByRole('button').className).toContain(`hover:${hoverLook.button[variant]}`);
  });

  it.each(iconButtonVariantNames)('matches IconButton %s', (variant) => {
    render(<IconButton icon={Plus} label="Add" variant={variant} />);
    expect(screen.getByRole('button').className).toContain(
      `hover:${hoverLook.iconButton[variant]}`,
    );
  });

  it('matches an unselected Pill', () => {
    render(<Pill selected={false}>All</Pill>);
    expect(screen.getByRole('button').className).toContain(`hover:${hoverLook.pill}`);
  });

  it('matches a Chip that opens a sheet', () => {
    render(<Chip label="Housing" value="Provided" onOpen={() => {}} />);
    expect(screen.getByRole('button').className).toContain(`hover:${hoverLook.chip}`);
  });

  it('matches a tab', () => {
    render(
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Feed</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole('tab').className).toContain(`hover:${hoverLook.tab}`);
  });
});
