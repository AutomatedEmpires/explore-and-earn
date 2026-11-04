// The Additional step link rule (Review Focus 3): https only, no userinfo, port or IP literal,
// and never a blocked or shortener domain however it is written.
import { describe, expect, it } from 'vitest';
import { SETTING_DEFAULTS } from '@/modules/settings';
import { checkLinkSyntax } from './links';

const lists = { blocked: [] as string[], shorteners: SETTING_DEFAULTS['links.shortener_domains'] };

describe('checkLinkSyntax', () => {
  it.each([
    'http://a.com',
    'https://u:p@a.com',
    'https://1.2.3.4/',
    'https://[::1]/',
    'https://a.com:8443/',
    'https://bit.ly/x',
    'https://BIT.LY/x',
    'https://bit.ly./x',
    'https://go.bit.ly/x',
    'https://localhost/',
    'not a url',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(checkLinkSyntax(url, lists)).toEqual({ ok: false });
  });

  it('matches an IDN against its punycode list entry', () => {
    expect(
      checkLinkSyntax('https://bücher.example/', { ...lists, blocked: ['xn--bcher-kva.example'] }),
    ).toEqual({ ok: false });
    expect(checkLinkSyntax('https://bücher.example/', lists)).toEqual({
      ok: true,
      host: 'xn--bcher-kva.example',
    });
  });

  it('blocks a domain and its subdomains, not lookalikes', () => {
    const blocked = { ...lists, blocked: ['scam.example'] };
    expect(checkLinkSyntax('https://scam.example/apply', blocked)).toEqual({ ok: false });
    expect(checkLinkSyntax('https://jobs.scam.example/apply', blocked)).toEqual({ ok: false });
    expect(checkLinkSyntax('https://notscam.example/apply', blocked)).toEqual({
      ok: true,
      host: 'notscam.example',
    });
  });

  it('passes a plain https link', () => {
    expect(checkLinkSyntax('https://kettle.com/apply', lists)).toEqual({
      ok: true,
      host: 'kettle.com',
    });
    expect(checkLinkSyntax('https://Kettle.COM./apply', lists)).toEqual({
      ok: true,
      host: 'kettle.com',
    });
  });
});
