import { Navigate } from 'react-router-dom';

/** Eski yol — Akademik Merkez Deneme / Optik sekmesine yönlendirir. */
export default function StudentEdesisReportsPage() {
  return <Navigate to="/academic-center?tab=exam" replace />;
}
