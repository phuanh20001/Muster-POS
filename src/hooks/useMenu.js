'use client'

import { useState, useEffect } from 'react'

const MENU_CACHE_KEY = 'dc_menu_cache'

function readCache() {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.products)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(categories, products) {
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ categories, products, savedAt: Date.now() }))
  } catch {}
}

export function useMenu() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  // True when the menu shown is served from the offline cache (network unreachable).
  const [fromCache, setFromCache] = useState(false)

  async function load(setLoadingState = true) {
    if (setLoadingState) setLoading(true)
    try {
      // The menu GET routes send a cacheable Cache-Control (for the customer
      // edge/CDN), so the POS must bypass the browser HTTP cache or it keeps
      // showing a stale menu (e.g. a product under its old category) after a
      // manager edit — same fix the manager page's loadData already uses.
      const [catRes, prodRes] = await Promise.all([
        fetch('/api/categories', { cache: 'no-store' }),
        fetch('/api/products', { cache: 'no-store' }),
      ])
      const catData = await catRes.json()
      const prodData = await prodRes.json()
      const cats = Array.isArray(catData) ? catData : []
      const prods = Array.isArray(prodData) ? prodData : []
      setCategories(cats)
      setProducts(prods)
      setFromCache(false)
      writeCache(cats, prods)
    } catch {
      // Network unreachable — fall back to the last good menu so staff can still
      // browse and build an order during an outage.
      const cached = readCache()
      if (cached) {
        setCategories(cached.categories)
        setProducts(cached.products)
        setFromCache(true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent refresh (no loading flash) for background polling on the POS.
  function refresh() {
    load(false)
  }

  return { categories, products, loading, fromCache, refresh }
}
