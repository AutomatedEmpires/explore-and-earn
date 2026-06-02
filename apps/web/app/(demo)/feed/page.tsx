import { DiscoveryCard } from "@explore-and-earn/ui";

import { DISCOVERY_FIXTURES, FEED_LANES } from "../../../lib/discovery-fixtures";

export default function DiscoveryFeedPage() {
  return (
    <main className="discovery-feed">
      <header className="discovery-feed__header">
        <h1 className="discovery-feed__title">Explore &amp; Earn</h1>
        <p className="discovery-feed__tagline">
          Housing, meals, and pay — everything you need to know, at a glance.
        </p>
      </header>

      {FEED_LANES.map((lane) => {
        const items = DISCOVERY_FIXTURES.filter(
          (opportunity) => opportunity.category === lane.category
        );
        if (items.length === 0) {
          return null;
        }
        return (
          <section key={lane.category} className="discovery-feed__section">
            <h2 className="discovery-feed__lane-title">{lane.title}</h2>
            <div className="discovery-feed__grid">
              {items.map((opportunity) => (
                <DiscoveryCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  surface="discovery_feed"
                />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
