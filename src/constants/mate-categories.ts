export type MateCategory = {
  id: string;
  label: string;
};

/** Canonical mate categories (ids stored during onboarding). */
export const MATE_CATEGORIES: MateCategory[] = [
  { id: 'request', label: 'Support Based on Request' },
  { id: 'hospital', label: 'Hospital Support' },
  { id: 'shopping', label: 'Shopping Support' },
  { id: 'day', label: 'Day Activity Support' },
  { id: 'fitness', label: 'Gym, Yoga & Jogging Support' },
  { id: 'events', label: 'Pub, Party & Event Support' },
  { id: 'emotional', label: 'Friendly & Emotional Support' },
  { id: 'newcomer', label: 'Tourist Guide Support' },
  { id: 'tech-education', label: 'Tech & Education Support' },
  { id: 'driving', label: 'Driving Support' },
  { id: 'sports', label: 'Sports Support' },
  { id: 'travel', label: 'Travel Support' },
  { id: 'home', label: 'Clean-up Support' },
];

/** Legacy / profile-editor labels mapped to canonical category ids. */
const CATEGORY_ALIASES: Record<string, string> = {
  'open to any': 'request',
  'open to any support request': 'request',
  'travel buddy': 'travel',
  'shopping mate': 'shopping',
  'shopping support': 'shopping',
  'tech & education support': 'tech-education',
  'technology support': 'tech-education',
  'education support': 'tech-education',
  'workout mate': 'fitness',
  'workout support': 'fitness',
  'gym support': 'fitness',
  'hospital mate': 'hospital',
  'hospital support': 'hospital',
  'home clean-up support': 'home',
  'clean-up support': 'home',
  'driving support': 'driving',
  'sports support': 'sports',
  'pub/party/event support': 'events',
  'holiday/travel support': 'travel',
  'holiday & travel support': 'travel',
  'travel support': 'travel',
  'friendly/emotional support': 'emotional',
  'newcomer/orientation support': 'newcomer',
  'newcomer & consultant support': 'newcomer',
  'consultant support': 'newcomer',
  'tourist guide support': 'newcomer',
  'city walk': 'day',
  events: 'events',
};

function findCategory(filterValue: string): MateCategory | null {
  const trimmed = filterValue.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const byIdOrLabel = MATE_CATEGORIES.find(
    (category) => category.id === lower || category.label.toLowerCase() === lower,
  );
  if (byIdOrLabel) {
    return byIdOrLabel;
  }

  const aliasId = CATEGORY_ALIASES[lower];
  if (aliasId) {
    return MATE_CATEGORIES.find((category) => category.id === aliasId) ?? null;
  }

  return (
    MATE_CATEGORIES.find(
      (category) =>
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

/**
 * Returns the current display label for a known category while preserving
 * unknown values. API responses use this so clients never need to understand
 * legacy profile labels.
 */
export function canonicalCategoryLabel(value: string): string {
  return findCategory(value)?.label ?? value.trim();
}

export function profileMatchesCategory(
  profileCategories: string[],
  filterValue: string | null | undefined,
): boolean {
  if (!filterValue || filterValue === 'all') {
    return true;
  }

  const variants = new Set(
    getCategoryMatchVariants(filterValue).map((value) => value.toLowerCase()),
  );
  if (!variants.size) {
    return true;
  }

  const acceptsAnySpecificRequest = profileCategories.some((category) => {
    const normalized = category.trim().toLowerCase();
    return (
      normalized === 'request' ||
      normalized === 'support based on request' ||
      normalized === 'open to any' ||
      normalized === 'open to any support request'
    );
  });
  if (acceptsAnySpecificRequest) {
    return true;
  }

  return profileCategories.some((category) => variants.has(category.trim().toLowerCase()));
}

/** Whether a profile explicitly accepts custom, request-based support work. */
export function profileAcceptsSupportBasedRequests(profileCategories: string[]): boolean {
  const requestVariants = new Set(
    getCategoryMatchVariants('Support Based on Request').map((value) => value.toLowerCase()),
  );
  return profileCategories.some((category) =>
    requestVariants.has(category.trim().toLowerCase()),
  );
}
