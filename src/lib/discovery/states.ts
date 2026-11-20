// US states for discovery (SP3 spec 8.1 and 8.11): filter codes, landing page slugs and the
// centroids the distance sort uses for a single-state filter. The 50 states and DC have landing
// pages; the five inhabited territories don't, but their listings can still be filtered.
//
// Centroids are the 2020 Census centers of population (CenPop2020_Mean_ST). The Census
// publishes none for the island areas other than Puerto Rico, so VI, GU, AS and MP use the
// point between their main population centers.

export type UsState = {
  code: string;
  name: string;
  slug: string;
  centroid: { lat: number; lng: number };
  landing: boolean;
};

function s(
  code: string,
  name: string,
  lat: number,
  lng: number,
  landing = true,
  slug = name.toLowerCase().replace(/ /g, '-'),
): UsState {
  return { code, name, slug, centroid: { lat, lng }, landing };
}

export const US_STATES: readonly UsState[] = [
  s('AL', 'Alabama', 33.016191, -86.753353),
  s('AK', 'Alaska', 61.408891, -148.961508),
  s('AZ', 'Arizona', 33.371388, -111.882468),
  s('AR', 'Arkansas', 35.199251, -92.713212),
  s('CA', 'California', 35.491035, -119.347852),
  s('CO', 'Colorado', 39.534747, -105.185361),
  s('CT', 'Connecticut', 41.492835, -72.878714),
  s('DE', 'Delaware', 39.333614, -75.547709),
  s('DC', 'District of Columbia', 38.910168, -77.013993),
  s('FL', 'Florida', 27.839295, -81.636016),
  s('GA', 'Georgia', 33.410677, -83.891248),
  s('HI', 'Hawaii', 21.112376, -157.485304),
  s('ID', 'Idaho', 44.220476, -115.22461),
  s('IL', 'Illinois', 41.312077, -88.372974),
  s('IN', 'Indiana', 40.144178, -86.251589),
  s('IA', 'Iowa', 41.93663, -93.037218),
  s('KS', 'Kansas', 38.480984, -96.409286),
  s('KY', 'Kentucky', 37.838308, -85.261296),
  s('LA', 'Louisiana', 30.696198, -91.474266),
  s('ME', 'Maine', 44.267404, -69.764596),
  s('MD', 'Maryland', 39.136636, -76.802227),
  s('MA', 'Massachusetts', 42.273659, -71.350366),
  s('MI', 'Michigan', 42.864675, -84.213172),
  s('MN', 'Minnesota', 45.18999, -93.558751),
  s('MS', 'Mississippi', 32.575361, -89.566275),
  s('MO', 'Missouri', 38.432921, -92.234929),
  s('MT', 'Montana', 46.760509, -111.318567),
  s('NE', 'Nebraska', 41.167883, -97.222143),
  s('NV', 'Nevada', 37.015907, -116.173753),
  s('NH', 'New Hampshire', 43.149147, -71.455608),
  s('NJ', 'New Jersey', 40.438248, -74.424465),
  s('NM', 'New Mexico', 34.607808, -106.332167),
  s('NY', 'New York', 41.471783, -74.590827),
  s('NC', 'North Carolina', 35.538715, -79.675021),
  s('ND', 'North Dakota', 47.33954, -99.444952),
  s('OH', 'Ohio', 40.438553, -82.796902),
  s('OK', 'Oklahoma', 35.606866, -96.854171),
  s('OR', 'Oregon', 44.753509, -122.588257),
  s('PA', 'Pennsylvania', 40.443486, -76.965232),
  s('RI', 'Rhode Island', 41.755677, -71.450484),
  s('SC', 'South Carolina', 34.022471, -80.996482),
  s('SD', 'South Dakota', 43.986511, -98.922285),
  s('TN', 'Tennessee', 35.821189, -86.332487),
  s('TX', 'Texas', 30.909581, -97.328656),
  s('UT', 'Utah', 40.385835, -111.948021),
  s('VT', 'Vermont', 44.101952, -72.82424),
  s('VA', 'Virginia', 37.850195, -77.765608),
  s('WA', 'Washington', 47.329504, -121.63262),
  s('WV', 'West Virginia', 38.823276, -80.671314),
  s('WI', 'Wisconsin', 43.723662, -89.031445),
  s('WY', 'Wyoming', 42.694801, -106.984779),
  // Territories: filterable, no landing page.
  s('PR', 'Puerto Rico', 18.282916, -66.348925, false),
  s('VI', 'U.S. Virgin Islands', 18.03, -64.84, false, 'us-virgin-islands'),
  s('GU', 'Guam', 13.47, 144.78, false),
  s('AS', 'American Samoa', -14.3, -170.7, false),
  s('MP', 'Northern Mariana Islands', 15.19, 145.75, false),
];

const byCode = new Map(US_STATES.map((st) => [st.code, st]));
const bySlug = new Map(US_STATES.map((st) => [st.slug, st]));

/** The state with this USPS code ('CO'), or undefined. */
export function stateByCode(code: string): UsState | undefined {
  return byCode.get(code);
}

/** The state with this landing slug ('district-of-columbia'), or undefined. */
export function stateBySlug(slug: string): UsState | undefined {
  return bySlug.get(slug);
}
