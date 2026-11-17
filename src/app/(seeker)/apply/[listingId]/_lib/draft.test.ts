// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, draftKey, emptyDraft, loadDraft, saveDraft, type Draft } from './draft';
import { LISTING_ID } from './sample';

const filled: Draft = {
  ...emptyDraft(),
  firstName: 'Maya',
  answers: { start: true },
};

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('apply drafts', () => {
  it('round-trips a draft under apply:<listingId>', () => {
    expect(loadDraft(LISTING_ID)).toBeNull();
    saveDraft(LISTING_ID, filled);
    expect(sessionStorage.getItem(draftKey(LISTING_ID))).toContain('Maya');
    expect(loadDraft(LISTING_ID)).toEqual(filled);
  });

  it('clears the draft after a send', () => {
    saveDraft(LISTING_ID, filled);
    clearDraft(LISTING_ID);
    expect(loadDraft(LISTING_ID)).toBeNull();
  });

  it('ignores a stored value that is not a draft', () => {
    sessionStorage.setItem(draftKey(LISTING_ID), '{"firstName":1}');
    expect(loadDraft(LISTING_ID)).toBeNull();
    sessionStorage.setItem(draftKey(LISTING_ID), 'not json');
    expect(loadDraft(LISTING_ID)).toBeNull();
  });

  it('does not throw when the phone refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveDraft(LISTING_ID, filled)).not.toThrow();
    expect(loadDraft(LISTING_ID)).toBeNull();
    expect(() => clearDraft(LISTING_ID)).not.toThrow();
  });
});
