// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';
import { Input } from './Input';
import { Radio, RadioGroup } from './Radio';
import { SegmentedControl } from './SegmentedControl';
import { Switch } from './Switch';
import { Textarea } from './Textarea';

describe('Input', () => {
  it('is labelled and describes its hint', () => {
    render(<Input label="Organization name" hint="2 to 80 characters" />);
    const input = screen.getByRole('textbox', { name: 'Organization name' });
    expect(input).toHaveAccessibleDescription('2 to 80 characters');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks an error with aria-invalid, an icon and text', () => {
    render(<Input label="Email" error="Enter an email address" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter an email address');
    const message = screen.getByText('Enter an email address');
    expect(message.parentElement?.querySelector('svg')).not.toBeNull();
  });
});

describe('Textarea', () => {
  it('is labelled', () => {
    render(<Textarea label="Note" />);
    expect(screen.getByRole('textbox', { name: 'Note' }).tagName).toBe('TEXTAREA');
  });
});

describe('Checkbox', () => {
  it('is a native checkbox with its label', () => {
    const onChange = vi.fn();
    render(<Checkbox label="I'm 18 or older" required onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: "I'm 18 or older" });
    expect(box).toBeRequired();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledOnce();
    expect(box).toBeChecked();
  });
});

describe('RadioGroup', () => {
  it('groups native radios under a legend', () => {
    render(
      <RadioGroup legend="I'm here to">
        <Radio name="type" value="seeker" label="Find work" />
        <Radio name="type" value="host" label="Hire" />
      </RadioGroup>,
    );
    expect(screen.getByRole('group', { name: "I'm here to" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Hire' }));
    expect(screen.getByRole('radio', { name: 'Hire' })).toBeChecked();
  });
});

function Segmented() {
  const [value, setValue] = useState<'chart' | 'table'>('chart');
  return (
    <SegmentedControl
      label="View"
      value={value}
      onValueChange={setValue}
      options={[
        { value: 'chart', label: 'Chart' },
        { value: 'table', label: 'Table' },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radio group with one checked option', () => {
    render(<Segmented />);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chart' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getByRole('radio', { name: 'Table' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Chart' })).not.toBeChecked();
  });
});

describe('Switch', () => {
  it('has role switch and its label', () => {
    const onCheckedChange = vi.fn();
    render(<Switch label="Visible to hosts" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch', { name: 'Visible to hosts' });
    expect(control).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
