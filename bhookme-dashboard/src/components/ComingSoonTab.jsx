import React from 'react';

export default function ComingSoonTab({ label }) {
  return (
    <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
      <p className="text-4xl mb-4">🚧</p>
      <h2 className="text-lg font-semibold mb-1">{label} is coming soon</h2>
      <p className="text-gray-500">We're still building this part of the host dashboard.</p>
    </div>
  );
}