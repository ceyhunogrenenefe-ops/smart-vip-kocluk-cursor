import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';
import MeetingTrackerPage from '../MeetingTrackerPage';

/** /crm index: ajan → inbox; admin → pipeline (MeetingTracker) */
export default function CrmHome() {
  const { effectiveUser } = useAuth();
  const tags = userRoleTags(effectiveUser);
  const agentOnly =
    tags.includes('crm_agent') &&
    !tags.some((t) =>
      ['super_admin', 'admin', 'coach', 'teacher', 'student', 'vendor_admin'].includes(t)
    );
  if (agentOnly) return <Navigate to="/crm/inbox" replace />;
  return <MeetingTrackerPage />;
}
