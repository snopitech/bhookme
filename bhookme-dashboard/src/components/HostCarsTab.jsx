import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PhotoUploader from './PhotoUploader';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const CARS_PER_PAGE = 5;

const CATEGORIES = ['Economy', 'Compact', 'Sedan', 'SUV', 'Luxury', 'Sports', 'Truck', 'Van', 'Convertible', 'Electric'];

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
};

const EMPTY_FORM = {
  make: '',
  model: '',
  year: String(new Date().getFullYear()),
  category: '',
  city: '',
  state: '',
  dailyRate: '',
};

const inputClass =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white';

// Used for both "Add a car" and "Edit car". Pass `car` to edit it.
function CarForm({ token, car, onSaved, onCancel }) {
  const isEdit = Boolean(car);
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          make: car.make || '',
          model: car.model || '',
          year: String(car.year || new Date().getFullYear()),
          category: car.category || '',
          city: car.city || '',
          state: car.state || '',
          dailyRate: car.dailyRate != null ? String(car.dailyRate) : '',
        }
      : EMPTY_FORM
  );
  const [photos, setPhotos] = useState(() =>
    isEdit ? (car.imageUrls && car.imageUrls.length ? car.imageUrls : car.imageUrl ? [car.imageUrl] : []) : []
  );
  const [photosUploading, setPhotosUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (photosUploading) {
      setError('Please wait for your photos to finish uploading.');
      return;
    }
    if (photos.length === 0) {
      setError('Add at least one photo of the car.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `${API_BASE_URL}/cars/${car.id}` : `${API_BASE_URL}/cars`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, imageUrls: photos }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || (isEdit ? 'Could not save your changes.' : 'Could not create the car listing.'));
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Make</label>
          <input className={inputClass} value={form.make} onChange={set('make')} placeholder="Toyota" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <input className={inputClass} value={form.model} onChange={set('model')} placeholder="Camry" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Year</label>
          <input
            type="number"
            min="1980"
            max={new Date().getFullYear() + 1}
            className={inputClass}
            value={form.year}
            onChange={set('year')}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Photos</label>
        <PhotoUploader value={photos} onChange={setPhotos} folder="cars" max={30} onUploadingChange={setPhotosUploading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <select className={inputClass} value={form.category} onChange={set('category')} required>
            <option value="">Pick a category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Price per day ($)</label>
          <input
            type="number"
            min="1"
            step="0.01"
            className={inputClass}
            value={form.dailyRate}
            onChange={set('dailyRate')}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Pick-up city</label>
          <input className={inputClass} value={form.city} onChange={set('city')} placeholder="Houston" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">State</label>
          <input className={inputClass} value={form.state} onChange={set('state')} placeholder="TX" required />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || photosUploading}
          className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50"
        >
          {photosUploading ? 'Uploading photos...' : saving ? 'Saving...' : isEdit ? 'Save changes' : 'Publish car'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function HostCarsTab() {
  const { token } = useAuth();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch(`${API_BASE_URL}/cars/mine`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || 'Could not load your cars.');
        return Array.isArray(data) ? data : [];
      })
      .then(setCars)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Keep the current page in range when cars are added or removed.
  const pageCount = Math.max(1, Math.ceil(cars.length / CARS_PER_PAGE));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paginatedCars = cars.slice((page - 1) * CARS_PER_PAGE, page * CARS_PER_PAGE);

  const toggleStatus = async (car) => {
    setActingId(car.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/cars/${car.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: car.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not update this car.');
      setCars((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setActingId(null);
    }
  };

  const deleteCar = async (car) => {
    const name = `${car.year} ${car.make} ${car.model}`;
    if (!window.confirm(`Delete ${name}? Guests will no longer see it. This can't be undone.`)) return;
    setActingId(car.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/cars/${car.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not delete this car.');
      setCars((prev) => prev.filter((c) => c.id !== car.id));
      if (editingCar && editingCar.id === car.id) setEditingCar(null);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setActingId(null);
    }
  };

  const activeCount = cars.filter((c) => c.status === 'ACTIVE').length;

  return (
    <div>
      {editingCar ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Edit {editingCar.year} {editingCar.make} {editingCar.model}
          </h2>
          <CarForm
            key={editingCar.id}
            token={token}
            car={editingCar}
            onSaved={(saved) => {
              setCars((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
              setEditingCar(null);
            }}
            onCancel={() => setEditingCar(null)}
          />
        </div>
      ) : showForm ? (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Add a car listing</h2>
          <CarForm
            token={token}
            onSaved={(car) => {
              setCars((prev) => [car, ...prev]);
              setShowForm(false);
              setPage(1);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowForm(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2.5 rounded-lg transition"
          >
            + Add car listing
          </button>
        </div>
      )}

      {loading && <p className="text-gray-500">Loading your cars...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {!loading && !error && cars.length === 0 && !showForm && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-4xl mb-3" aria-hidden="true">🚗</p>
          <p className="text-gray-500 mb-4">You haven't listed any cars yet.</p>
          <button onClick={() => setShowForm(true)} className="text-rose-500 font-medium hover:underline">
            List your first car
          </button>
        </div>
      )}

      {!loading && cars.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Total cars</p>
              <p className="text-2xl font-bold">{cars.length}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Active cars</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Car</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Price/day</th>
                  <th className="px-4 py-3 font-medium">Photos</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCars.map((car) => {
                  const cover = car.imageUrls?.[0] || car.imageUrl;
                  return (
                    <tr key={car.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {cover ? (
                            <img src={cover} alt="" className="w-14 h-10 object-cover rounded-md bg-gray-100 shrink-0" />
                          ) : (
                            <span className="w-14 h-10 rounded-md bg-gray-100 flex items-center justify-center shrink-0" aria-hidden="true">
                              🚗
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {car.year} {car.make} {car.model}
                            </p>
                            <p className="text-xs text-gray-500">{car.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {car.city}, {car.state}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">${Number(car.dailyRate).toFixed(0)}</td>
                      <td className="px-4 py-3 text-gray-600">{car.imageUrls?.length || (car.imageUrl ? 1 : 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[car.status] || 'bg-gray-100 text-gray-700'}`}>
                          {car.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleStatus(car)}
                          disabled={actingId === car.id}
                          className="text-gray-700 font-medium hover:underline mr-4 disabled:opacity-50"
                        >
                          {actingId === car.id ? 'Saving...' : car.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() => {
                            setShowForm(false);
                            setEditingCar(car);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-gray-700 font-medium hover:underline mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCar(car)}
                          disabled={actingId === car.id}
                          className="text-red-600 font-medium hover:underline mr-4 disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <Link to={`/car/${car.id}`} className="text-rose-500 font-medium hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-gray-500">
                Showing {(page - 1) * CARS_PER_PAGE + 1}
                {'\u2013'}
                {Math.min(page * CARS_PER_PAGE, cars.length)} of {cars.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                <span className="text-gray-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}