export function isCustomerPath(pathname) {
  if (pathname === '/') return true
  if (pathname === '/loyalty' || pathname.startsWith('/loyalty/')) return true
  if (pathname === '/order' || pathname.startsWith('/order/')) return true
  if (pathname === '/onlineorder' || pathname.startsWith('/onlineorder/')) return true
  if (pathname === '/privacy' || pathname.startsWith('/privacy/')) return true
  return false
}

// A staff "surface": everything that isn't a public customer page or the login
// screen. The staff providers (feature settings, online orders, reservations)
// and the staff nav bars all key off this — keep the definition here so a new
// public route only has to be added to isCustomerPath above, in one place.
export function isStaffPath(pathname) {
  return !isCustomerPath(pathname) && pathname !== '/login'
}
