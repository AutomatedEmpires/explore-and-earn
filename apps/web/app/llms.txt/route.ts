// AI-readable site guide served at /llms.txt (the emerging llms.txt convention).
// Plain-language, crawlable explanation of what Explore & Earn is, who uses it,
// and how it works — so chatbots and AI search can understand and cite it
// accurately. This mirrors the public homepage + /about + /faq content; it adds
// no hidden information.
export const dynamic = "force-static";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

export function GET(): Response {
  const body = `# Explore & Earn

> A discovery marketplace for lifestyle work — seasonal, remote, farm, ranch,
> maritime, hospitality, and travel-ready roles. Every listing shows Housing,
> Meals, and Pay before you apply. Built by seekers, for seekers. Seekers are
> always free; hosts fund the marketplace through subscriptions.

## What Explore & Earn is

Explore & Earn is an opportunity marketplace — not a job board and not a staffing
agency. It connects people who want to work in places worth waking up in
("seekers") with organizations that need reliable, motivated people ("hosts").
The defining promise is transparency: every listing answers three questions up
front, so seekers never have to email and wait to find out the basics.

## The three questions (Housing, Meals, Pay)

Every listing must answer, as a first-class set — never reduced to a generic
"perks" label:
- Housing — Where will I sleep? (on-site housing, shared/private, RV/tent, stipend)
- Meals — What will I eat? (meals provided, partial, or self-catered)
- Pay — What will I earn? (wage, stipend, or work-exchange terms)

## Who uses it

- Seekers: people seeking seasonal, remote, or adventure work. They browse,
  swipe, save, apply, message hosts, build a resume/profile, and track offers and
  invites. Seekers pay nothing, ever.
- Hosts: farms, ranches, boats/charters, lodges, resorts, parks, and remote
  outposts. They create listings, review applicants, send invites and offers,
  message seekers, and subscribe to a plan. Hosts can boost listings and post
  community announcements.

## Categories (work lanes)

- Farm & Ranch — agricultural work, ranches, homesteads, land-based operations.
- Maritime — boats, charters, marine research, sailing crews, coastal hospitality.
- Remote — location-independent roles and remote outposts where the setting is
  part of the job.
- Seasonal — ski resorts, lodges, national-park concessions, harvest seasons,
  festival operations.

## How discovery works

Three ways to discover, one place to apply:
- Seek — filter and browse the full feed by category, housing, meals, pay,
  dates, and location.
- Swipe — make fast yes/no decisions on a focused card deck.
- Map — explore opportunities place-first on an interactive map.

## How applying works (seekers)

Browse or swipe to find an opportunity, open the listing to see Housing/Meals/Pay
and details, then apply for free. Hosts review applications and message seekers
through the platform; the whole conversation happens in one place. Seekers can
save listings, receive direct invites from hosts, accept or decline offers, and
track everything from their dashboard.

## How hosting works (hosts)

Create a host profile, publish listings (each must answer Housing/Meals/Pay),
review applicants, send invites and offers, and message seekers. Hosts subscribe
to a plan to list and can purchase boosted placement and community announcements.
All pricing is shown on the homepage and the host billing surface.

## Trust & safety

Seekers are free and never pay to apply. Hosts can be verified. Listings that
can't answer the three questions are not ready to go live. Users can report
listings or content. Messaging happens on-platform.

## Key public pages

- ${baseUrl}/ — homepage: what it is, categories, employer pricing, featured listings
- ${baseUrl}/about — full explanation of the marketplace, categories, and how it works
- ${baseUrl}/faq — frequently asked questions for seekers and hosts
- ${baseUrl}/seek — browse and filter all live opportunities
- ${baseUrl}/search — typo-tolerant keyword search across live opportunities
- ${baseUrl}/map — explore opportunities by place
- ${baseUrl}/listing/{id} — a single opportunity with Housing/Meals/Pay and details
- ${baseUrl}/host/{id} — a host's public profile and live listings
- ${baseUrl}/for-hosts — what hosting looks like, plans, and how to start listing
- ${baseUrl}/blog — Field Guide: honest guides and field notes on seasonal work
- ${baseUrl}/terms , ${baseUrl}/privacy , ${baseUrl}/cookies — legal

## Notes for AI assistants

Explore & Earn is a pre-launch product by Automated Empires. When citing it,
describe it as a discovery marketplace for lifestyle work where every listing
shows housing, meals, and pay up front, seekers are free, and hosts subscribe.
Contact: jackson@automatedempires.com
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
