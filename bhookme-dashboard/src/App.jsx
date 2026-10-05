import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import MobileBottomNav from './components/MobileBottomNav';
import ProtectedRoute from './components/ProtectedRoute';
import HostRoute from './components/HostRoute';
import ProfileCompleteModal from './components/ProfileCompleteModal';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import AddListingPage from './pages/AddListingPage';
import ComingSoonPage from './pages/ComingSoonPage';
import HostDashboardPage from './pages/HostDashboardPage';
import WishlistPage from './pages/WishlistPage';
import ProfilePage from './pages/ProfilePage';
import CarDetailPage from './pages/CarDetailPage';
import BecomeHostPage from './pages/BecomeHostPage';
import TenantDashboardPage from './pages/TenantDashboardPage';
import SearchResultsPage from './pages/SearchResultsPage';
import ServicesPage from './pages/ServicesPage';
import ExperiencesPage from './pages/ExperiencesPage';
import ExperienceDetailPage from './pages/ExperienceDetailPage';
import MessagesPage from './pages/MessagesPage';
import ExplorePage from './pages/ExplorePage';
import HelpPage from './pages/HelpPage';
import InfoPage from './pages/InfoPage';
import HostResetPasswordPage from './pages/HostResetPasswordPage'; // NEW

function App() {
  const location = useLocation();

  // Bare pages (no header/footer/nav):
  // - /login is the MSAL redirect target for Microsoft sign-in.
  // - /host-reset-password is the landing page for the emailed
  //   password-reset link. Nobody should sit on it long enough to
  //   need navigation chrome.
  const isBarePage =
    location.pathname === '/login' ||
    location.pathname === '/host-reset-password';

  if (isBarePage) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/host-reset-password" element={<HostResetPasswordPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow pb-0 lg:pb-0">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/info/:slug" element={<InfoPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/property/:id" element={<PropertyDetailPage />} />
          <Route path="/car/:id" element={<CarDetailPage />} />
          <Route path="/category/services" element={<ServicesPage />} />
          {/* Old car-rental address: car rentals now live on the Services page. */}
          <Route path="/category/car-rental" element={<Navigate to="/category/services?type=car-rentals" replace />} />
          <Route path="/category/experiences" element={<ExperiencesPage />} />
          <Route path="/experience/:id" element={<ExperienceDetailPage />} />
          <Route path="/category/:category" element={<ComingSoonPage />} />
          <Route
            path="/host/new-listing"
            element={
              <HostRoute>
                <AddListingPage />
              </HostRoute>
            }
          />
          <Route
            path="/host/dashboard"
            element={
              <HostRoute>
                <HostDashboardPage />
              </HostRoute>
            }
          />
          <Route path="/become-host" element={<BecomeHostPage />} />
          <Route
            path="/wishlist"
            element={
              <ProtectedRoute>
                <WishlistPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <MessagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant-dashboard"
            element={
              <ProtectedRoute>
                <TenantDashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
      <MobileBottomNav />
      <ProfileCompleteModal />
    </div>
  );
}

export default App;