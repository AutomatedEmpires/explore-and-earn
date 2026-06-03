import { DiscoveryFeed, DISCOVERY_FIXTURES } from "../components/discovery";

export default function HomePage() {
  return (
    <main>
      <DiscoveryFeed listings={DISCOVERY_FIXTURES} />
    </main>
  );
}
