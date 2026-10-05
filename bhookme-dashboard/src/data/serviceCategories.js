// Service categories shown on the Services page and in the
// header search's "Type of service" picker.
//
//   live: true      -> has real listings on bhookme today
//   external: url   -> opens a partner website in a new tab
//   neither         -> "coming soon", hosts can offer it via Become a host

export const SERVICE_CATEGORIES = [
  { id: 'car-rentals', label: 'Car rentals', icon: '🚗', live: true, blurb: 'Rent a car from local hosts' },
  {
    id: 'it-services',
    label: 'IT services',
    icon: '💻',
    external: 'https://progressiveconsults.com',
    partner: 'Progressive Consults',
    blurb: 'IT support, networks, and tech consulting',
  },
  { id: 'photography', label: 'Photography', icon: '📷', blurb: 'Portraits, events, and travel shoots' },
  { id: 'chefs', label: 'Chefs', icon: '🧑‍🍳', blurb: 'Private chefs cooking where you stay' },
  { id: 'massage', label: 'Massage', icon: '💆', blurb: 'In-home and on-site massage' },
  { id: 'training', label: 'Training', icon: '🏋️', blurb: 'Personal trainers and fitness classes' },
  { id: 'spa', label: 'Spa treatments', icon: '🧖', blurb: 'Facials, nails, and wellness' },
  { id: 'catering', label: 'Catering', icon: '🍱', blurb: 'Food for parties and events' },
  { id: 'cleaning', label: 'Cleaning', icon: '🧹', blurb: 'Home and move-out cleaning' },
  { id: 'moving', label: 'Moving help', icon: '📦', blurb: 'Movers, packing, and hauling' },
  { id: 'airport-transfer', label: 'Airport transfers', icon: '✈️', blurb: 'Rides to and from the airport' },
  { id: 'hair-makeup', label: 'Hair & makeup', icon: '💄', blurb: 'Styling for events and shoots' },
];

export function findServiceCategory(id) {
  return SERVICE_CATEGORIES.find((c) => c.id === id) || null;
}