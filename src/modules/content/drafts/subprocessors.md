---
title: Subprocessors
counselQuestions: |
  - Which transfer mechanism (Standard Contractual Clauses or another) applies to each vendor below, for EU and UK personal data (SP8 spec 8.5; legal review §4.6 and §13 question 11)?
  - Is each vendor a service provider or processor under the CCPA and the GDPR on its current terms (legal review §4.5)?
---

Draft for counsel review, not legal advice. This draft stays a draft until a lawyer signs it. It is not published. The founder confirms each vendor's region and accepts each data processing agreement (DPA) before launch; the `legal.gdpr` launch gate checks them. A cell marked "To confirm" is not yet confirmed, and no DPA here is marked accepted until the founder accepts it.

These are the service providers that process personal information for Explore&Earn, what they do, and what data they receive.

| Vendor | Purpose | Data | Region | DPA status |
|---|---|---|---|---|
| Clerk | Sign-in, accounts and organizations | Name, email address, sign-in methods, session and device data | United States (to confirm) | To confirm |
| Supabase | Database, file storage and scheduled jobs | Everything stored in Explore&Earn: profiles, listings, applications, messages, files | To confirm | To confirm |
| Vercel | Hosting | Every request, including IP address and the country it reports | United States (to confirm) | To confirm |
| Stripe | Host subscriptions and payments | Host organization billing details and payment information | United States (to confirm) | To confirm |
| Resend | Sending and receiving email | Email addresses and the content of the emails we send and receive | United States (to confirm) | To confirm |
| PostHog | Product analytics | Product events with an internal user id; no names, email addresses, messages or resume text | United States | To confirm |
| Sentry | Error monitoring | Error reports with personal data removed; no session recordings | United States (to confirm) | To confirm |
| Mapbox | Maps | The map area being viewed, and the request's IP address | United States (to confirm) | To confirm |
| Anthropic | AI for moderation, resume import, writing help and support replies | The text or image being checked, imported or answered; Anthropic does not train on it | United States (to confirm) | To confirm |
| Cloudmersive | Malware scanning of resumes and attachments | The uploaded file | To confirm | To confirm |
| Microsoft PhotoDNA | Child-safety image matching | Uploaded images, or their hashes | To confirm | To confirm |
| Doppler | Storing the service's own secrets | No user data | United States (to confirm) | To confirm |
| GitHub | Source code and automated tests | No user data | United States (to confirm) | To confirm |

We update this page before a new vendor receives personal information.
