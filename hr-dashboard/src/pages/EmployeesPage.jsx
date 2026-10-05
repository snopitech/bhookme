import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 7;

// Every account in the admins table can sign in to the admin-dashboard.
// HR-role accounts can additionally sign in to the HR dashboard.
function AccessBadges({ role }) {
  return (
    <div className="flex flex-wrap gap-1">
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Admin</span>
      {role === 'HR' && (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">HR</span>
      )}
    </div>
  );
}

const EDITABLE_FIELDS = [
  'firstName', 'lastName', 'role', 'phone', 'dateOfBirth', 'address', 'city', 'state',
  'zipCode', 'jobTitle', 'department', 'hireDate', 'emergencyContactName',
  'emergencyContactPhone', 'notes',
];

function isActiveValue(value) {
  return value === true || value === 1 || value === '1';
}

function formatDate(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-50 disabled:text-gray-500';

function EmployeeDrawer({ employee, token, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const initial = {};
    EDITABLE_FIELDS.forEach((f) => {
      initial[f] = employee[f] ?? '';
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setSavedMessage('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSavedMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/hr/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || 'Could not save changes.');
        return;
      }
      onSaved(data);
      setSavedMessage('Changes saved.');
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const age = ageFrom(form.dateOfBirth);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-gray-50 shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <h2 className="text-lg font-semibold">
              {employee.firstName} {employee.lastName}
            </h2>
            <p className="text-sm text-gray-500">{employee.email}</p>
            <p className="text-xs text-gray-400 mt-1">
              Account created {formatDate(employee.createdAt) || '—'}
              {employee.updatedAt && `, last updated ${formatDate(employee.updatedAt)}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Personal details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="First name">
                <input className={inputClass} value={form.firstName} onChange={set('firstName')} />
              </Field>
              <Field label="Last name">
                <input className={inputClass} value={form.lastName} onChange={set('lastName')} />
              </Field>
              <Field label={`Date of birth${age !== null ? ` (age ${age})` : ''}`}>
                <input type="date" className={inputClass} value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              </Field>
              <Field label="Phone">
                <input type="tel" className={inputClass} value={form.phone} onChange={set('phone')} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Street address">
                  <input className={inputClass} value={form.address} onChange={set('address')} />
                </Field>
              </div>
              <Field label="City">
                <input className={inputClass} value={form.city} onChange={set('city')} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State">
                  <input className={inputClass} value={form.state} onChange={set('state')} />
                </Field>
                <Field label="ZIP">
                  <input className={inputClass} value={form.zipCode} onChange={set('zipCode')} />
                </Field>
              </div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Job details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Dashboard access">
                <select className={inputClass} value={form.role} onChange={set('role')}>
                  <option value="ADMIN">Admin only</option>
                  <option value="HR">Admin + HR</option>
                </select>
              </Field>
              <Field label="Job title">
                <input className={inputClass} value={form.jobTitle} onChange={set('jobTitle')} />
              </Field>
              <Field label="Department">
                <input className={inputClass} value={form.department} onChange={set('department')} />
              </Field>
              <Field label="Hire date">
                <input type="date" className={inputClass} value={form.hireDate} onChange={set('hireDate')} />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold mb-3">Emergency contact</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input className={inputClass} value={form.emergencyContactName} onChange={set('emergencyContactName')} />
              </Field>
              <Field label="Phone">
                <input type="tel" className={inputClass} value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
              </Field>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-semibold mb-3">HR notes</h3>
            <textarea
              rows={4}
              className={inputClass}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Private notes, visible only in the HR dashboard"
            />
          </section>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          {savedMessage && <p className="text-green-600 text-sm">{savedMessage}</p>}

          <div className="flex gap-2 justify-end pb-6">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50">
              Close
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-yellow-500 hover:bg-yellow-600 text-gray-900 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function EmployeesPage() {
  const { token } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/hr/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load employees (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load employees.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (roleFilter !== 'ALL' && e.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !isActiveValue(e.isActive)) return false;
      if (statusFilter === 'DISABLED' && isActiveValue(e.isActive)) return false;
      if (!term) return true;
      return [e.firstName, e.lastName, `${e.firstName} ${e.lastName}`, e.email, e.jobTitle, e.department]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [employees, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const stats = {
    total: employees.length,
    active: employees.filter((e) => isActiveValue(e.isActive)).length,
    adminAccess: employees.length,
    hrAccess: employees.filter((e) => e.role === 'HR').length,
  };

  const replaceEmployee = (updated) => {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
    setSelected((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const toggleActive = async (employee) => {
    setActingId(employee.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/hr/employees/${employee.id}/toggle-active`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || `Could not update ${employee.firstName}'s account.`);
        return;
      }
      if (data && data.id === employee.id) {
        replaceEmployee(data);
      } else {
        replaceEmployee({ id: employee.id, isActive: !isActiveValue(employee.isActive) });
      }
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const resetPage = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          ['Employees', stats.total],
          ['Active', stats.active],
          ['Admin access', stats.adminAccess],
          ['HR access', stats.hrAccess],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{loading ? '...' : value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={resetPage(setSearch)}
          placeholder="Search by name, email, job title, or department"
          className="w-full sm:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <select
          value={roleFilter}
          onChange={resetPage(setRoleFilter)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="ALL">All access levels</option>
          <option value="ADMIN">Admin only</option>
          <option value="HR">Admin + HR</option>
        </select>
        <select
          value={statusFilter}
          onChange={resetPage(setStatusFilter)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </select>
        {!loading && (
          <p className="text-sm text-gray-500 sm:ml-auto">
            {filtered.length} {filtered.length === 1 ? 'employee' : 'employees'}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && employees.length === 0 && (
        <p className="text-gray-500">No employees yet. Create an admin or HR account to see it here.</p>
      )}
      {!loading && employees.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No employees match your search or filters.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Access</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Hired</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((e) => {
                const active = isActiveValue(e.isActive);
                return (
                  <tr key={e.id} className={active ? '' : 'bg-gray-50'}>
                    <td className="px-4 py-3">
                      <p className="font-semibold whitespace-nowrap">
                        {e.firstName} {e.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{e.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <AccessBadges role={e.role} />
                    </td>
                    <td className="px-4 py-3">
                      {e.jobTitle || e.department ? (
                        <>
                          <p className="whitespace-nowrap">{e.jobTitle || '—'}</p>
                          {e.department && <p className="text-xs text-gray-500">{e.department}</p>}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.phone || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(e.hireDate) || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelected(e)}
                        className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 mr-2"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => toggleActive(e)}
                        disabled={actingId === e.id}
                        className={`text-white text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                          active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {actingId === e.id ? 'Saving...' : active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {selected && (
        <EmployeeDrawer
          key={selected.id}
          employee={selected}
          token={token}
          onClose={() => setSelected(null)}
          onSaved={replaceEmployee}
        />
      )}
    </div>
  );
}