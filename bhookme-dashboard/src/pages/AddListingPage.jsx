import React from 'react';
import { useNavigate } from 'react-router-dom';
import AddListingForm from '../components/AddListingForm';

// Full-page version of the host's "add a house listing" form.
// Uses the same AddListingForm as the host dashboard, so both get
// photo upload and stay identical from now on.
export default function AddListingPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">List your place</h1>
      <AddListingForm onSuccess={(property) => navigate(`/property/${property.id}`)} />
    </div>
  );
}