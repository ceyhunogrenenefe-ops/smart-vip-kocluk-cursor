import { useApp } from '../context/AppContext';
import { AttendanceReportHub } from '../components/attendance/AttendanceReportHub';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import { cn } from '../lib/utils';

export default function AttendanceReportPage() {
  const { institutions, activeInstitutionId } = useApp();
  const mobileAppShell = useMobileAppShell();

  return (
    <div
      className={cn(
        'mx-auto space-y-4',
        mobileAppShell ? 'max-w-none' : 'max-w-[1600px] p-4 md:p-6'
      )}
    >
      <AttendanceReportHub institutions={institutions} activeInstitutionId={activeInstitutionId} />
    </div>
  );
}
