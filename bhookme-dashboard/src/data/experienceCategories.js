// Experience categories. The ids must match ExperienceController.CATEGORIES on the backend.
export const EXPERIENCE_CATEGORIES = [
  { id: 'food-drink', label: 'Food & drink', icon: '🍷' },
  { id: 'tours', label: 'Tours', icon: '🗺️' },
  { id: 'art-culture', label: 'Art & culture', icon: '🎨' },
  { id: 'nature-outdoors', label: 'Nature & outdoors', icon: '🏞️' },
  { id: 'wellness', label: 'Wellness', icon: '🧘' },
  { id: 'nightlife', label: 'Nightlife', icon: '🌃' },
  { id: 'sports', label: 'Sports', icon: '🏀' },
  { id: 'classes', label: 'Classes', icon: '🧑‍🏫' },
];

export function findExperienceCategory(id) {
  return EXPERIENCE_CATEGORIES.find((c) => c.id === id) || null;
}

export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} hr ${rest} min`;
  if (h) return `${h} hr${h === 1 ? '' : 's'}`;
  return `${rest} min`;
}