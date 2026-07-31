export function isInstalledApp() {
  if (typeof window === 'undefined') return false
  if (window.__DREAMYCAFE_DESKTOP__) return true
  if (window.navigator.standalone === true) return true
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
  )
}
