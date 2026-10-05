import React from 'react';
import { useParams, Link } from 'react-router-dom';

const LABELS = {
  experiences: 'Experiences',
  services: 'Services',
  'car-rental': 'Car rental',
};

export default function ComingSoonPage() {
  const { category } = useParams();
  const label = LABELS[category] || 'This feature';

  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <p className="text-5xl mb-4">🚧</p>
      <h1 className="text-2xl font-bold mb-2">{label} is coming soon</h1>
      <p className="text-gray-500 mb-6">We're still building this part of bhookme. Check back soon!</p>
      <Link to="/" className="text-rose-500 font-medium hover:underline">
        Back to homes
      </Link>
    </div>
  );
}