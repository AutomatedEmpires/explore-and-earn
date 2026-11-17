import { describe, expect, it } from 'vitest';
import { displayHost, findLinks } from './links';

describe('findLinks', () => {
  it('links only http(s) and drops trailing punctuation', () => {
    const parts = findLinks('see https://Example.COM/a, and javascript:alert(1) or data:text/html,x');
    const linked = parts.filter((part) => part.href !== null);
    expect(linked).toEqual([{ text: 'https://Example.COM/a', href: 'https://example.com/a' }]);
  });
});

describe('displayHost', () => {
  it('shows the punycode host, without a userinfo', () => {
    expect(displayHost('https://bücher.example/x')).toBe('xn--bcher-kva.example');
    expect(displayHost('https://user@evil.test/')).toBe('evil.test');
  });
});
