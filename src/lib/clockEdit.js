export function canEditClockTarget(editorRole, targetUserRole) {
  if (editorRole === 'ADMIN') return targetUserRole === 'STAFF' || targetUserRole === 'MANAGER'
  if (editorRole === 'MANAGER') return targetUserRole === 'STAFF'
  return false
}
