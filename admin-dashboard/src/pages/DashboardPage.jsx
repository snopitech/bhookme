import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UsersTab from '../components/UsersTab';
import HostsTab from '../components/HostsTab';
import ListingsTab from '../components/ListingsTab';
import SubscribersTab from '../components/SubscribersTab';
import MessagesTab from '../components/MessagesTab';
import BookingsTab from '../components/BookingsTab';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'applications', label: 'Host Applications', icon: '📋' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'hosts', label: 'Hosts', icon: '🔑' },
  { id: 'houses', label: 'House Listings', icon: '🏠' },
  { id: 'cars', label: 'Car Listings', icon: '🚗' },
  { id: 'subscribers', label: 'Subscribers', icon: '📬' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'bookings', label: 'Bookings', icon: '📅' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
];

function ComingSoon({ label }) {
  return (
    <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl bg-white">
      <p className="text-4xl mb-4">🚧</p>
      <h2 className="text-lg font-semibold mb-1">{label} is coming soon</h2>
      <p className="text-gray-500">We'll wire this tab up to real data as bhookme grows.</p>
    </div>
  );
}

export default function DashboardPage() {
  const { admin, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/host-applications/admin`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setApplications(data);
        setAppsLoading(false);
      })
      .catch(() => {
        setError('Could not load applications.');
        setAppsLoading(false);
      });
  }, [token]);

  const act = async (id, action) => {
    setActingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/host-applications/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setApplications((prev) => prev.map((a) => (a.id === id ? data : a)));
      } else {
        setError(data.message || `Could not ${action} this application.`);
      }
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const pendingCount = applications.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="font-bold text-lg">bhookme Admin</h1>
        </div>
        <nav className="py-4">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-6 py-3 text-sm text-left transition ${
                activeTab === item.id ? 'bg-gray-800 border-l-4 border-rose-500 font-semibold' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'applications' && pendingCount > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-xs rounded-full px-2 py-0.5">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-xl" onClick={() => setSidebarOpen(true)}>☰</button>
            <h2 className="font-semibold text-lg capitalize">{NAV_ITEMS.find((n) => n.id === activeTab)?.label}</h2>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 hidden sm:inline">{admin?.firstName} {admin?.lastName}</span>
            <button onClick={logout} className="text-rose-500 font-medium hover:underline">
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {error && (activeTab === 'overview' || activeTab === 'applications') && <p className="text-red-500 mb-4">{error}</p>}

          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm text-gray-500">Pending applications</p>
                <p className="text-2xl font-bold">{appsLoading ? '...' : pendingCount}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-sm text-gray-500">Total applications</p>
                <p className="text-2xl font-bold">{appsLoading ? '...' : applications.length}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 opacity-50">
                <p className="text-sm text-gray-500">Total users</p>
                <p className="text-2xl font-bold">—</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 opacity-50">
                <p className="text-sm text-gray-500">Total listings</p>
                <p className="text-2xl font-bold">—</p>
              </div>
            </div>
          )}

          {activeTab === 'applications' && (
            <div>
              {appsLoading && <p className="text-gray-500">Loading...</p>}
              {!appsLoading && applications.length === 0 && <p className="text-gray-500">No applications yet.</p>}

              <div className="space-y-4">
                {applications.map((app) => (
                  <div key={app.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{app.applicantFirstName} {app.applicantLastName}</p>
                        <p className="text-sm text-gray-500">{app.applicantEmail}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[app.status] || 'bg-gray-100 text-gray-700'}`}>
                        {app.status}
                      </span>
                    </div>

                    {app.message && <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{app.message}</p>}

                    <p className="mt-2 text-xs text-gray-400">
                      Submitted {new Date(app.createdAt).toLocaleDateString()}
                    </p>

                    {app.status === 'PENDING' && (
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => act(app.id, 'approve')}
                          disabled={actingId === app.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => act(app.id, 'reject')}
                          disabled={actingId === app.id}
                          className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'hosts' && <HostsTab />}
          {activeTab === 'houses' && <ListingsTab type="houses" />}
          {activeTab === 'cars' && <ListingsTab type="cars" />}
          {activeTab === 'subscribers' && <SubscribersTab />}
          {activeTab === 'messages' && <MessagesTab />}
          {activeTab === 'bookings' && <BookingsTab />}
          {activeTab === 'reviews' && <ComingSoon label="Reviews moderation" />}
        </main>

        <footer className="bg-white border-t border-gray-200 px-6 py-4 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} bhookme Admin. Internal use only.
        </footer>
      </div>
    </div>
  );
}