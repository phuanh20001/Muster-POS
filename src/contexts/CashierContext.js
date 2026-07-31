'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const CashierContext = createContext(null)

export function CashierProvider({ children }) {
  const [cashier, setCashierState] = useState(null)
  const [switchUserOpen, setSwitchUserOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('dreamycafe_cashier')
      if (!stored) return
      const parsed = JSON.parse(stored)
      fetch('/api/users/list?clockedIn=1')
        .then((r) => r.json())
        .then((users) => {
          if (Array.isArray(users) && users.some((u) => u.id === parsed.id)) {
            setCashierState(parsed)
          } else {
            localStorage.removeItem('dreamycafe_cashier')
          }
        })
        .catch(() => setCashierState(parsed))
    } catch {}
  }, [])

  function setCashier(user) {
    setCashierState(user)
    if (user) {
      localStorage.setItem('dreamycafe_cashier', JSON.stringify(user))
    } else {
      localStorage.removeItem('dreamycafe_cashier')
    }
  }

  return (
    <CashierContext.Provider value={{
      cashier,
      setCashier,
      switchUserOpen,
      openSwitchUser: () => setSwitchUserOpen(true),
      closeSwitchUser: () => setSwitchUserOpen(false),
    }}>
      {children}
    </CashierContext.Provider>
  )
}

export function useCashier() {
  return useContext(CashierContext)
}
