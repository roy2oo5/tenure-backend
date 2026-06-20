export type MateCategory = {
  id: string;
  label: string;
};

/** Canonical mate categories (ids stored during onboarding). */
export const MATE_CATEGORIES: MateCategory[] = [
  { id: 'shopping', label: 'Shopping Mate' },
  { id: 'movie', label: 'Movie Mate' },
  { id: 'timepass', label: 'Time Pass Mate' },
  { id: 'hospital', label: 'Hospital Mate' },
  { id: 'talking', label: 'Talking Mate' },
  { id: 'travel', label: 'Travel Mate' },
  { id: 'home', label: 'Home Mate' },
  { id: 'children', label: 'Children Care Mate' },
  { id: 'food', label: 'Food Mate' },
  { id: 'pub', label: 'Pub Mate' },
  { id: 'vlog', label: 'Vlog Mate' },
  { id: 'language', label: 'Language Mate' },
  { id: 'day', label: 'Day Mate' },
  { id: 'other', label: 'Other' },
];

/** Legacy / profile-editor labels mapped to canonical category ids. */
const CATEGORY_ALIASES: Record<string, string> = {
  'travel buddy': 'travel',
  'study partner': 'other',
  'shopping mate': 'shopping',
  'workout mate': 'other',
  'movie mate': 'movie',
  'hospital mate': 'hospital',
  'local guide': 'language',
  'food buddy': 'food',
  'language partner': 'language',
  'project partner': 'other',
  'photography buddy': 'vlog',
  'pet care buddy': 'children',
  'gaming buddy': 'other',
  'coffee mate': 'talking',
  'food partner': 'food',
  'city walk': 'day',
  'events': 'day',
};

function findCategory(filterValue: string): MateCategory | null {
  const trimmed = filterValue.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const byIdOrLabel = MATE_CATEGORIES.find(
    category => category.id === lower || category.label.toLowerCase() === lower,
  );
  if (byIdOrLabel) {
    return byIdOrLabel;
  }

  const aliasId = CATEGORY_ALIASES[lower];
  if (aliasId) {
    return MATE_CATEGORIES.find(category => category.id === aliasId) ?? null;
  }

  return (
    MATE_CATEGORIES.find(
      category =>
        category.label.toLowerCase().includes(lower) ||
        lower.includes(category.label.toLowerCase()),
    ) ?? null
  );
}

/** All strings that should count as a match for a category filter. */
export function getCategoryMatchVariants(filterValue: string): string[] {
  const trimmed = filterValue.trim();
  if (!trimmed || trimmed === 'all') {
    return [];
  }

  const category = findCategory(trimmed);
  if (!category) {
    return [trimmed];
  }

  const variants = new Set<string>([category.id, category.label]);
  for (const [alias, id] of Object.entries(CATEGORY_ALIASES)) {
    if (id === category.id) {
      variants.add(alias);
    }
  }

  return [...variants];
}

export function profileMatchesCategory(
  profileCategories: string[],
  filterValue: string | null | undefined,
): boolean {
  if (!filterValue || filterValue === 'all') {
    return true;
  }

  const variants = new Set(
    getCategoryMatchVariants(filterValue).map(value => value.toLowerCase()),
  );
  if (!variants.size) {
    return true;
  }

  return profileCategories.some(category =>
    variants.has(category.trim().toLowerCase()),
  );
}
