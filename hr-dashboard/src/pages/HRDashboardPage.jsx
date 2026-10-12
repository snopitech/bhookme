import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import EmployeesPage from './EmployeesPage';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const ACCOUNTS_PER_PAGE = 5;

const ROLE_STYLES = {
  HR: 'bg-yellow-100 text-yellow-800',
  ADMIN: 'bg-blue-100 text-blue-800',
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'create-account', label: 'Create Account', icon: '➕' },
  { id: 'accounts', label: 'Accounts', icon: '👥' },
  { id: 'employees', label: 'Employees', icon: '🧑‍💼' },
  { id: 'job-postings', label: 'Job Postings', icon: '📋' },
  { id: 'job-applications', label: 'Job Applications', icon: '📨' },
  { id: 'activity', label: 'Activity', icon: '🕒' },
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

function TwoStepBadge({ enabled }) {
  return enabled ? (
    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">2-step on</span>
  ) : (
    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">2-step not set up</span>
  );
}

export default function HRDashboardPage() {
  const { admin, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('ADMIN');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [resettingId, setResettingId] = useState(null);
  const [accountsNotice, setAccountsNotice] = useState(null); // { ok, text }

  // Accounts tab: search + pagination
  const [accountSearch, setAccountSearch] = useState('');
  const [accountPage, setAccountPage] = useState(1);

  const fetchAccounts = () => {
    setAccountsLoading(true);
    fetch(`${API_BASE_URL}/admin-auth/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setAccounts(data);
        setAccountsLoading(false);
      })
      .catch(() => {
        setError('Could not load accounts.');
        setAccountsLoading(false);
      });
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setRole('ADMIN');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin-auth/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ firstName, lastName, email, password, role }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess(
          `${role === 'HR' ? 'HR' : 'Admin'} account created for ${data.email}. They'll set up two-step sign-in (authenticator app) the first time they sign in.`
        );
        resetForm();
        fetchAccounts();
      } else {
        setError(data.message || 'Could not create the account.');
      }
    } catch (err) {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  // Lost phone: clear the account's authenticator app so they scan a new QR code.
  const resetTwoStep = async (account) => {
    const self = account.email === admin?.email;
    const ok = window.confirm(
      `Reset two-step sign-in for ${account.email}?\n\n` +
        (self
          ? 'This is YOUR account. You will scan a new QR code the next time you sign in.'
          : 'They will scan a new QR code with their authenticator app the next time they sign in.')
    );
    if (!ok) return;
    setResettingId(account.id);
    setAccountsNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin-auth/accounts/${account.id}/reset-2fa`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not reset two-step sign-in.');
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, totpEnabled: false } : a)));
      setAccountsNotice({ ok: true, text: `Two-step sign-in reset for ${account.email}.` });
    } catch (err) {
      setAccountsNotice({ ok: false, text: err.message });
    } finally {
      setResettingId(null);
    }
  };

  const hrCount = accounts.filter((a) => a.role === 'HR').length;
  const adminCount = accounts.filter((a) => a.role === 'ADMIN').length;

  // Search by name, email or role; 5 accounts per page.
  const searchTerm = accountSearch.trim().toLowerCase();
  const filteredAccounts = searchTerm
    ? accounts.filter((a) =>
        [a.firstName, a.lastName, `${a.firstName || ''} ${a.lastName || ''}`, a.email, a.role]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(searchTerm))
      )
    : accounts;
  const accountPages = Math.max(1, Math.ceil(filteredAccounts.length / ACCOUNTS_PER_PAGE));
  const currentAccountPage = Math.min(accountPage, accountPages);
  const pagedAccounts = filteredAccounts.slice(
    (currentAccountPage - 1) * ACCOUNTS_PER_PAGE,
    currentAccountPage * ACCOUNTS_PER_PAGE
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-5 border-b border-gray-800">
          <h1 className="font-bold text-lg text-yellow-400">bhookme HR</h1>
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
                activeTab === item.id ? 'bg-gray-800 border-l-4 border-yellow-500 font-semibold' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
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
            <button onClick={logout} className="text-yellow-600 font-medium hover:underline">
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {error && activeTab !== 'employees' && <p className="text-red-500 mb-4">{error}</p>}

          {activeTab === 'overview' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Total accounts</p>
                  <p className="text-2xl font-bold">{accountsLoading ? '...' : accounts.length}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">HR accounts</p>
                  <p className="text-2xl font-bold">{accountsLoading ? '...' : hrCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Admin accounts</p>
                  <p className="text-2xl font-bold">{accountsLoading ? '...' : adminCount}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 opacity-50">
                  <p className="text-sm text-gray-500">Open job postings</p>
                  <p className="text-2xl font-bold">—</p>
                </div>
              </div>

              <h2 className="text-lg font-semibold mb-3">Recent accounts</h2>
              {accountsLoading ? (
                <p className="text-gray-500">Loading...</p>
              ) : accounts.length === 0 ? (
                <p className="text-gray-500">No accounts yet.</p>
              ) : (
                <div className="space-y-2">
                  {accounts.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-white">
                      <div>
                        <p className="font-medium">{a.firstName} {a.lastName}</p>
                        <p className="text-sm text-gray-500">{a.email}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[a.role] || 'bg-gray-100 text-gray-700'}`}>
                        {a.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'create-account' && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Create admin or HR account</h2>
              <p className="text-gray-500 mb-4 text-sm">
                New accounts are completely separate from tenant and host accounts, even if they share the same email.
              </p>

              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">First name</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last name</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                  >
                    <option value="ADMIN">Admin - reviews and manages the platform</option>
                    <option value="HR">HR - can also create admin/HR accounts</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create account'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div>
              {accountsNotice && (
                <div
                  className={`mb-4 p-3 rounded-lg text-sm border ${
                    accountsNotice.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                  role="status"
                >
                  {accountsNotice.text}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <input
                  type="search"
                  value={accountSearch}
                  onChange={(e) => {
                    setAccountSearch(e.target.value);
                    setAccountPage(1);
                  }}
                  placeholder="Search by name, email or role"
                  aria-label="Search accounts"
                  className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                {!accountsLoading && (
                  <p className="text-sm text-gray-500 sm:ml-auto">
                    {filteredAccounts.length} {filteredAccounts.length === 1 ? 'account' : 'accounts'}
                    {searchTerm && ` matching "${accountSearch.trim()}"`}
                  </p>
                )}
              </div>

              {accountsLoading ? (
                <p className="text-gray-500">Loading...</p>
              ) : accounts.length === 0 ? (
                <p className="text-gray-500">No accounts yet.</p>
              ) : filteredAccounts.length === 0 ? (
                <p className="text-gray-500">No accounts match your search.</p>
              ) : (
                <div className="space-y-2">
                  {pagedAccounts.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-200 rounded-lg p-4 bg-white"
                    >
                      <div>
                        <p className="font-medium">{a.firstName} {a.lastName}</p>
                        <p className="text-sm text-gray-500">{a.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <TwoStepBadge enabled={!!a.totpEnabled} />
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[a.role] || 'bg-gray-100 text-gray-700'}`}>
                          {a.role}
                        </span>
                        {a.totpEnabled && (
                          <button
                            type="button"
                            onClick={() => resetTwoStep(a)}
                            disabled={resettingId === a.id}
                            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 ml-1"
                          >
                            {resettingId === a.id ? 'Resetting...' : 'Reset 2-step'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!accountsLoading && filteredAccounts.length > ACCOUNTS_PER_PAGE && (
                <div className="flex items-center justify-center gap-1.5 mt-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setAccountPage(currentAccountPage - 1)}
                    disabled={currentAccountPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: accountPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAccountPage(n)}
                      aria-current={n === currentAccountPage ? 'page' : undefined}
                      className={`min-w-[36px] px-3 py-1.5 rounded-lg ${
                        n === currentAccountPage
                          ? 'bg-yellow-500 text-gray-900 font-semibold'
                          : 'border border-gray-300 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAccountPage(currentAccountPage + 1)}
                    disabled={currentAccountPage === accountPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'employees' && <EmployeesPage />}
          {activeTab === 'job-postings' && <ComingSoon label="Job postings" />}
          {activeTab === 'job-applications' && <ComingSoon label="Job applications" />}
          {activeTab === 'activity' && <ComingSoon label="Activity log" />}
        </main>

        <footer className="bg-white border-t border-gray-200 px-6 py-4 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} bhookme HR. Internal use only.
        </footer>
      </div>
    </div>
  );
}