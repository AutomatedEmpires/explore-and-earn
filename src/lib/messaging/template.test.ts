import { describe, expect, it } from 'vitest';
import { fillTemplate } from './template';

describe('fillTemplate', () => {
  it('replaces the four fill-ins and leaves unknown braces', () => {
    expect(
      fillTemplate('Hi {first_name}, {position} at {org_name}. {my_first_name} {unknown}', {
        first_name: 'Maya',
        position: 'Deckhand',
        org_name: 'Kettle Ridge Lodge',
        my_first_name: 'Sam',
      }),
    ).toBe('Hi Maya, Deckhand at Kettle Ridge Lodge. Sam {unknown}');
  });
});
