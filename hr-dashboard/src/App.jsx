import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HRDashboardPage from './pages/HRDashboardPage';
import { useAuth } from './context/AuthContext';

function AppLayout({ children }) {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      {!isAuthenticated && <Header />}
      {children}
    </div>
  );
}

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <HRDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<ProtectedRoute><HRDashboardPage /></ProtectedRoute>} />
      </Routes>
    </AppLayout>
  );
}

export default App;