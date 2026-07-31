'use client'

import { useState, useEffect } from 'react'

export function usePublicMenu() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch('/api/categories'),
          fetch('/api/products'),
        ])
        const cats = await catRes.json()
        const prods = await prodRes.json()
        setCategories(Array.isArray(cats) ? cats : [])
        // Combos are POS-only — never surface them on the public/online menu.
        setProducts(Array.isArray(prods) ? prods.filter((p) => p.available && !p.isCombo) : [])
      } catch {
        setCategories([])
        setProducts([])
      }
      setLoading(false)
    }
    load()
  }, [])

  return { categories, products, loading }
}
