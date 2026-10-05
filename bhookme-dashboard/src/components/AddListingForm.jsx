import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PhotoUploader from './PhotoUploader';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const inputClass =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500';

function initialForm(listing) {
  if (!listing) {
    return {
      title: '',
      description: '',
      propertyType: 'ENTIRE_PLACE',
      category: 'HOME',
      addressLine1: '',
      city: '',
      state: '',
      zipCode: '',
      latitude: '',
      longitude: '',
      bedrooms: 1,
      bathrooms: 1,
      maxGuests: 2,
      basePricePerNight: '',
      cleaningFee: '',
    };
  }
  const v = (x, fallback = '') => (x === null || x === undefined ? fallback : String(x));
  return {
    title: v(listing.title),
    description: v(listing.description),
    propertyType: v(listing.propertyType, 'ENTIRE_PLACE'),
    category: v(listing.category, 'HOME'),
    addressLine1: v(listing.addressLine1),
    city: v(listing.city),
    state: v(listing.state),
    zipCode: v(listing.zipCode),
    latitude: v(listing.latitude),
    longitude: v(listing.longitude),
    bedrooms: v(listing.bedrooms, '1'),
    bathrooms: v(listing.bathrooms, '1'),
    maxGuests: v(listing.maxGuests, '2'),
    basePricePerNight: v(listing.basePricePerNight),
    cleaningFee: v(listing.cleaningFee),
  };
}

// Used for both "Add listing" and "Edit listing".
// Pass `listing` to edit an existing one; leave it out to create a new one.
export default function AddListingForm({ listing = null, onSuccess, onCancel }) {
  const isEdit = !!listing;
  const { token } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState(() => (listing?.imageUrls ? [...listing.imageUrls] : []));
  const [photosUploading, setPhotosUploading] = useState(false);
  // If a new listing was created but attaching photos failed, retrying
  // only re-attaches the photos instead of creating a duplicate listing.
  const [createdProperty, setCreatedProperty] = useState(null);

  const [formData, setFormData] = useState(() => initialForm(listing));

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const payload = () => ({
    ...formData,
    latitude: parseFloat(formData.latitude),
    longitude: parseFloat(formData.longitude),
    bedrooms: parseInt(formData.bedrooms),
    bathrooms: parseFloat(formData.bathrooms),
    maxGuests: parseInt(formData.maxGuests),
    basePricePerNight: parseFloat(formData.basePricePerNight),
    cleaningFee: parseFloat(formData.cleaningFee || 0),
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (photosUploading) {
      setError('Please wait for your photos to finish uploading.');
      return;
    }
    if (photos.length === 0) {
      setError(isEdit ? 'Keep at least one photo of your place.' : 'Add at least one photo of your place.');
      return;
    }

    setLoading(true);

    try {
      if (isEdit) {
        // 1. Save the details.
        const response = await fetch(`${API_BASE_URL}/properties/${listing.id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload()),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError((data && data.message) || 'Could not save your changes.');
          return;
        }

        // 2. Replace the photos with the current list (order = display order).
        const photoResponse = await fetch(`${API_BASE_URL}/properties/${listing.id}/image-urls`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ imageUrls: photos }),
        });
        const photoData = await photoResponse.json().catch(() => null);
        if (!photoResponse.ok) {
          setError(
            `Your details were saved, but the photos couldn't be updated: ${
              (photoData && photoData.message) || 'unknown error'
            }. Click Save changes again to retry.`
          );
          return;
        }

        onSuccess(photoData || data);
        return;
      }

      let property = createdProperty;

      if (!property) {
        const response = await fetch(`${API_BASE_URL}/properties`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload()),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError((data && data.message) || 'Failed to create listing');
          return;
        }
        property = data;
        setCreatedProperty(data);
      }

      // Attach the uploaded photos in the chosen order (first = cover).
      const photoResponse = await fetch(`${API_BASE_URL}/properties/${property.id}/image-urls`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ imageUrls: photos }),
      });
      const photoData = await photoResponse.json().catch(() => null);

      if (!photoResponse.ok) {
        setError(
          `Your listing was created, but the photos couldn't be attached: ${
            (photoData && photoData.message) || 'unknown error'
          }. Click Publish again to retry.`
        );
        return;
      }

      onSuccess(photoData || property);
    } catch (err) {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input type="text" name="title" required value={formData.title} onChange={handleChange} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea name="description" rows={4} value={formData.description} onChange={handleChange} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Photos</label>
        <PhotoUploader
          value={photos}
          onChange={setPhotos}
          folder="properties"
          max={30}
          onUploadingChange={setPhotosUploading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Property type</label>
          <select
            name="propertyType"
            value={formData.propertyType}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="ENTIRE_PLACE">Entire place</option>
            <option value="PRIVATE_ROOM">Private room</option>
            <option value="SHARED_ROOM">Shared room</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="HOME">Home</option>
            <option value="EXPERIENCE">Experience</option>
            <option value="SERVICE">Service</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Street address</label>
        <input type="text" name="addressLine1" required value={formData.addressLine1} onChange={handleChange} className={inputClass} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <input type="text" name="city" required value={formData.city} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">State</label>
          <input type="text" name="state" required value={formData.state} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ZIP code</label>
          <input type="text" name="zipCode" required value={formData.zipCode} onChange={handleChange} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Latitude</label>
          <input
            type="text"
            name="latitude"
            required
            placeholder="e.g. 29.7604"
            value={formData.latitude}
            onChange={handleChange}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Longitude</label>
          <input
            type="text"
            name="longitude"
            required
            placeholder="e.g. -95.3698"
            value={formData.longitude}
            onChange={handleChange}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Bedrooms</label>
          <input type="number" name="bedrooms" min="0" value={formData.bedrooms} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bathrooms</label>
          <input type="number" step="0.5" name="bathrooms" min="0" value={formData.bathrooms} onChange={handleChange} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max guests</label>
          <input type="number" name="maxGuests" min="1" value={formData.maxGuests} onChange={handleChange} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Price per night ($)</label>
          <input
            type="number"
            step="0.01"
            name="basePricePerNight"
            required
            value={formData.basePricePerNight}
            onChange={handleChange}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cleaning fee ($)</label>
          <input type="number" step="0.01" name="cleaningFee" value={formData.cleaningFee} onChange={handleChange} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="submit"
          disabled={loading || photosUploading}
          className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {photosUploading
            ? 'Uploading photos...'
            : loading
            ? isEdit
              ? 'Saving...'
              : 'Publishing...'
            : isEdit
            ? 'Save changes'
            : 'Publish listing'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}