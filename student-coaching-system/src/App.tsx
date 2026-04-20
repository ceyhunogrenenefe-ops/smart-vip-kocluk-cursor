// Türkçe: Ana Uygulama Dosyası - SaaS Çoklu Kiracı Desteği ile
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Coaches from './pages/Coaches';
import Tracking from './pages/Tracking';
import Topics from './pages/Topics';
import TopicTracking from './pages/TopicTracking';
import ExamTracking from './pages/ExamTracking';
import PDFImport from './pages/PDFImport';
import Analytics from './pages/Analytics';
import AICoach from './pages/AICoach';
import WhatsApp from './pages/WhatsApp';
import Webhooks from './pages/Webhooks';
import Settings from './pages/Settings';
import StudentDashboard from './pages/StudentDashboard';
import StudentReports from './pages/StudentReports';
import CoachDashboard from './pages/CoachDashboard';
import CoachReports from './pages/CoachReports';
import AdminPanel from './pages/AdminPanel';
import BookTracking from './pages/BookTracking';
import WrittenExamTracking from './components/WrittenExamTracking';
import Marketing from './pages/Marketing';
import UserManagement from './pages/UserManagement';
import Subscription from './pages/Subscription';
import SystemManagement from './pages/SystemManagement';

// Yönlendirme bileşeni
function HomeRedirect() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'super_admin':
    case 'admin':
      return <Navigate to="/dashboard" replace />;
    case 'coach':
      return <Navigate to="/coach-dashboard" replace />;
    case 'student':
      return <Navigate to="/student-dashboard" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <AppProvider>
          <Router>
            <Routes>
              {/* Public Pages */}
              <Route path="/marketing" element={<Marketing />} />
              <Route path="/hakkimizda" element={<Marketing />} />
              <Route path="/fiyat" element={<Marketing />} />

              {/* Auth Sayfaları */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

            {/* Ana sayfa yönlendirmesi */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Admin Rotaları - Super Admin ve Admin */}
            <Route path="/dashboard" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/students" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Students />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/coaches" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Coaches />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/topics" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Topics />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/topic-tracking" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <TopicTracking />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/exam-tracking" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <ExamTracking />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/book-tracking" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <BookTracking />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/written-exam" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <WrittenExamTracking />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/pdf-import" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <PDFImport />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <Analytics />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/ai-coach" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <AICoach />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/whatsapp" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <WhatsApp />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/webhooks" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Webhooks />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Takip Sayfası - Super Admin, Admin ve Koç için */}
            <Route path="/tracking" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'coach']}>
                <Layout>
                  <Tracking />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Super Admin Paneli */}
            <Route path="/super-admin" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <AdminPanel />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Kullanıcı Yönetimi */}
            <Route path="/user-management" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <UserManagement />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Abonelik/Ödeme Sayfası */}
            <Route path="/subscription" element={
              <Subscription />
            } />

            <Route path="/system-management" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <Layout>
                  <SystemManagement />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Öğrenci Dashboard - Sadece Öğrenciler için */}
            <Route path="/student-dashboard" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <StudentDashboard />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Öğrenci Raporları - Sadece Öğrenciler için */}
            <Route path="/student-reports" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <StudentReports />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Öğrenci Analitikleri - Sadece Öğrenciler için */}
            <Route path="/student-analytics" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <StudentDashboard />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Koç Dashboard - Sadece Koçlar için */}
            <Route path="/coach-dashboard" element={
              <ProtectedRoute allowedRoles={['coach']}>
                <Layout>
                  <CoachDashboard />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Koç Deneme Raporları - Sadece Koçlar için */}
            <Route path="/coach-reports" element={
              <ProtectedRoute allowedRoles={['coach']}>
                <Layout>
                  <CoachReports />
                </Layout>
              </ProtectedRoute>
            } />

            {/* Bulunamadı sayfası */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </AppProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default App;
