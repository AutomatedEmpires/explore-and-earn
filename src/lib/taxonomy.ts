// Listing taxonomy code lists (product spec section 3; SP2 spec sections 3 and 8). Genres are
// also the default of the `listings.genres` setting, where operators can deactivate them;
// occupations and destinations live in the database.

export const CATEGORIES = ['maritime', 'seasonal', 'farm', 'remote'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Genres are the setting (Ski resorts); occupations are the role (Lift operator). */
export const GENRES: readonly { code: string; label: string; category: Category }[] = [
  { code: 'commercial_fishing', label: 'Commercial fishing', category: 'maritime' },
  { code: 'seafood_processing', label: 'Seafood processing', category: 'maritime' },
  { code: 'yachts', label: 'Yachts', category: 'maritime' },
  { code: 'ferries_and_tours', label: 'Ferries and tours', category: 'maritime' },
  { code: 'expedition_cruises', label: 'Expedition cruises', category: 'maritime' },
  { code: 'tugs_and_barges', label: 'Tugs and barges', category: 'maritime' },
  { code: 'national_parks', label: 'National parks', category: 'seasonal' },
  { code: 'ski_resorts', label: 'Ski resorts', category: 'seasonal' },
  { code: 'summer_camps', label: 'Summer camps', category: 'seasonal' },
  { code: 'guest_ranches_and_lodges', label: 'Guest ranches and lodges', category: 'seasonal' },
  { code: 'festivals_and_events', label: 'Festivals and events', category: 'seasonal' },
  { code: 'adventure_guiding', label: 'Adventure guiding', category: 'seasonal' },
  { code: 'harvest', label: 'Harvest', category: 'farm' },
  { code: 'orchards_and_vineyards', label: 'Orchards and vineyards', category: 'farm' },
  { code: 'livestock_and_ranch', label: 'Livestock and ranch', category: 'farm' },
  { code: 'dairy', label: 'Dairy', category: 'farm' },
  { code: 'greenhouse_and_nursery', label: 'Greenhouse and nursery', category: 'farm' },
  { code: 'organic', label: 'Organic', category: 'farm' },
  { code: 'customer_support', label: 'Customer support', category: 'remote' },
  { code: 'sales', label: 'Sales', category: 'remote' },
  { code: 'software_and_it', label: 'Software and IT', category: 'remote' },
  { code: 'design_and_creative', label: 'Design and creative', category: 'remote' },
  { code: 'writing', label: 'Writing', category: 'remote' },
  { code: 'virtual_assistant', label: 'Virtual assistant', category: 'remote' },
  { code: 'teaching', label: 'Teaching', category: 'remote' },
];

/** Perks a listing can name (`job.perks`). */
export const PERKS: readonly { code: string; label: string }[] = [
  { code: 'ski_pass', label: 'Ski pass' },
  { code: 'park_pass', label: 'Park pass' },
  { code: 'employee_discounts', label: 'Employee discounts' },
  { code: 'shuttle', label: 'Shuttle' },
  { code: 'laundry', label: 'Laundry' },
  { code: 'wifi', label: 'Wi-Fi' },
  { code: 'gym', label: 'Gym' },
  { code: 'end_of_season_bonus', label: 'End-of-season bonus' },
  { code: 'travel_reimbursement', label: 'Travel reimbursement' },
  { code: 'relocation_help', label: 'Relocation help' },
  { code: 'health_insurance', label: 'Health insurance' },
  { code: 'paid_time_off', label: 'Paid time off' },
  { code: 'retirement_plan', label: 'Retirement plan' },
  { code: 'equipment_provided', label: 'Equipment provided' },
  { code: 'uniform_provided', label: 'Uniform provided' },
  { code: 'training_provided', label: 'Training provided' },
];
