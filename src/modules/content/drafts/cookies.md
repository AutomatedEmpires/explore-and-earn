---
title: Cookie Policy
counselQuestions: |
  - Does this banner and policy meet the ePrivacy rules and UK PECR for EU and UK visitors, including asking again after a material change (SP8 spec 8.4)?
  - Is loading analytics for visitors outside the EU without asking, while honoring a refusal and Global Privacy Control, enough under the California Invasion of Privacy Act claims described in legal review §4.5?
---

Draft for counsel review, not legal advice. This draft stays a draft until a lawyer signs it. It is not published. It states SP8 spec 8.4 in full. Citations are to the November 2026 legal review unless a spec is named.

## 1. The cookies we use

We use two kinds of cookies, and no others:

- **Strictly necessary:** the sign-in session (Clerk), your cookie choice (`ee_consent`) and your theme. Explore&Earn does not work without them, so they are always on.
- **Analytics:** PostHog, which tells us how Explore&Earn is used so we can improve it. These are on only when the rules below allow them.

There are no advertising cookies. Our error monitoring (Sentry) sets no cookies.

## 2. If you are in the EU, the EEA, the UK or Switzerland

The EU region is the 27 EU countries, Iceland, Liechtenstein, Norway, the United Kingdom and Switzerland. We read your country from the network address our hosting provider reports (the `x-vercel-ip-country` header). If no country is reported, we treat you as being in the EU region.

On your first visit you see this banner:

> We use cookies to keep you signed in. With your OK, we also use analytics cookies to see how Explore&Earn is used so we can improve it. We never sell your data.

The banner has two buttons, "Accept analytics" and "Reject", which look the same, and a link, "Cookie settings". Until you choose "Accept analytics", the analytics script is not loaded in your browser and our servers drop analytics events about you.

## 3. If you are anywhere else

You see no banner, and analytics is on. You can turn it off at any time with the "Cookie settings" link in the footer, which opens the same switch on this page.

## 4. Global Privacy Control

If your browser sends a Global Privacy Control signal (`Sec-GPC: 1`), we treat it as "Reject" everywhere, not only in the EU region. When you are signed in, we also record that you opted out on your account, so analytics stays off for you on every device (legal review §4.5).

## 5. How your choice is stored

Your choice is kept in a cookie named `ee_consent`, in the form `1.<consent id>.<a or r>.<time>`: "a" means you accepted analytics, "r" that you rejected it. The cookie is sent only over secure connections, is not sent with requests from other sites (SameSite=Lax), and lasts one year (Max-Age 31,536,000 seconds).

Each choice also writes a record on our side: the consent id, your country, the region, the choice, the version of this policy and the date. It does not include your IP address. If you are signed in, the record is linked to your account until you delete it. Records of your cookie choices are deleted after 24 months.

Your choice applies to the device and browser you made it on.

## 6. When we ask again

We ask visitors in the EU region again when the cookie expires after a year, or when we publish a material change to this policy.

## 7. Cookie settings

Use the switch below to turn analytics cookies on or off. Saving records your choice the same way the banner does.
