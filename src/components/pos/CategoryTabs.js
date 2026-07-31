'use client'

export default function CategoryTabs({ categories, activeId, onSelect }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain pos-category-scroll">
        <button
          onClick={() => onSelect(null)}
          aria-label="Show all items"
          aria-pressed={activeId === null}
          className={`w-full flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-xl text-sm font-semibold transition-all ${
            activeId === null
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <span className="text-xl" aria-hidden="true">🍽️</span>
          <span>All</span>
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            aria-label={`Show ${cat.name} items`}
            aria-pressed={activeId === cat.id}
            className={`w-full flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-xl text-sm font-semibold transition-all ${
              activeId === cat.id
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="text-xl" aria-hidden="true">{cat.emoji}</span>
            <span className="text-center leading-tight">{cat.name}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
