/** BBB otomatik yoklama kapalı (varsayılan). Açmak için BBB_AUTO_ATTENDANCE_ENABLED=true */
export function isBbbAutoAttendanceEnabled() {
  const v = String(process.env.BBB_AUTO_ATTENDANCE_ENABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
