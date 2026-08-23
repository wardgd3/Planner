import { memo, useMemo, useRef, useState } from 'react'

const MAX_QTY = 999

/**
 * One checklist line. Once a number is entered the row fades back so your eye
 * skips it, but it stays in place and stays fully editable.
 */
const StockingRow = memo(function StockingRow({ item, value, onChange }) {
  const counted = value !== undefined

  function commit(raw) {
    const digits = String(raw).replace(/\D/g, '').slice(0, 3)
    onChange(item.id, digits === '' ? null : Number(digits))
  }

  function bump(delta) {
    onChange(item.id, Math.min(MAX_QTY, Math.max(0, (value ?? 0) + delta)))
  }

  return (
    <li className={`stk-row ${counted ? 'counted' : ''}`}>
      <span className="stk-row-tick" aria-hidden="true" />
      <span className="stk-row-name">{item.name}</span>
      <div className="stk-stepper">
        {counted && (
          <button
            type="button"
            className="stk-clear"
            onClick={() => onChange(item.id, null)}
            aria-label={`Clear ${item.name}`}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="stk-step"
          onClick={() => bump(-1)}
          aria-label={`Decrease ${item.name}`}
        >
          −
        </button>
        <input
          className="stk-qty"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="–"
          value={counted ? String(value) : ''}
          onChange={(e) => commit(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`${item.name} count`}
        />
        <button
          type="button"
          className="stk-step"
          onClick={() => bump(1)}
          aria-label={`Increase ${item.name}`}
        >
          +
        </button>
      </div>
    </li>
  )
})

/**
 * One section per subgroup, ordered by where that subgroup first appears so the
 * list still follows the shelf.
 *
 * Deliberately not grouping by consecutive runs: sort_order is not guaranteed
 * to keep a subgroup contiguous once items are added or moved between groups,
 * and a run-based grouping silently splits a subgroup into repeated sections
 * scattered down the page.
 */
function groupBySubgroup(items) {
  const buckets = new Map()
  for (const item of items) {
    const label = item.subgroup || ''
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push(item)
  }
  return [...buckets.entries()].map(([label, list]) => ({ label: label || null, items: list }))
}

export default function StockingChecklist({ categories, companies, items, counts, onChange }) {
  const [query, setQuery] = useState('')
  const [companyId, setCompanyId] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const sectionRefs = useRef({})

  const needle = query.trim().toLowerCase()
  const activeCompany = companies.find((co) => co.id === companyId) || null

  const sections = useMemo(() => {
    return categories
      .map((category) => {
        const inCategory = items.filter((i) => i.category_id === category.id)
        // The company filter narrows the totals too, so a category reads
        // "4/9 of this brand" rather than against items it is hiding.
        const scoped = companyId
          ? inCategory.filter((i) => i.company_id === companyId)
          : inCategory
        const visible = needle
          ? scoped.filter((i) => i.name.toLowerCase().includes(needle))
          : scoped
        return {
          category,
          total: scoped.length,
          counted: scoped.filter((i) => counts[i.id] !== undefined).length,
          groups: groupBySubgroup(visible),
        }
      })
      .filter((s) => s.groups.length > 0)
  }, [categories, items, counts, needle, companyId])

  function jumpTo(categoryId) {
    const el = sectionRefs.current[categoryId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="stk-checklist">
      <div className="stk-tools">
        <div className="stk-tools-row">
          <input
            className="input stk-search"
            type="search"
            placeholder="Find an item…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter items"
          />
          <button
            type="button"
            className={`stk-filter-btn ${companyId ? 'active' : ''}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
          >
            {activeCompany ? activeCompany.name : 'Filter'}
          </button>
        </div>

        {filterOpen && (
          <div className="stk-filter-row" role="group" aria-label="Filter by company">
            <button
              type="button"
              className={`stk-chip ${companyId === null ? 'on' : ''}`}
              onClick={() => setCompanyId(null)}
            >
              All
            </button>
            {companies.map((co) => (
              <button
                key={co.id}
                type="button"
                className={`stk-chip ${companyId === co.id ? 'on' : ''}`}
                onClick={() => setCompanyId(co.id)}
              >
                {co.name}
              </button>
            ))}
          </div>
        )}

        <nav className="stk-chips" aria-label="Jump to category">
          {sections.map(({ category, counted, total }) => (
            <button
              key={category.id}
              type="button"
              className={`stk-chip ${counted === total ? 'done' : ''}`}
              onClick={() => jumpTo(category.id)}
            >
              {category.name}
              <span className="stk-chip-count">{counted}/{total}</span>
            </button>
          ))}
        </nav>
      </div>

      {sections.map(({ category, counted, total, groups }) => (
        <section
          key={category.id}
          className="stk-section"
          ref={(el) => { sectionRefs.current[category.id] = el }}
        >
          <h3 className="stk-section-head">
            <span>{category.name}</span>
            <span className="stk-section-count">{counted}/{total}</span>
          </h3>

          {groups.map((group, i) => (
            <div key={group.label || `g${i}`} className="stk-group">
              {group.label && <h4 className="stk-group-head">{group.label}</h4>}
              <ul className="stk-rows">
                {group.items.map((item) => (
                  <StockingRow
                    key={item.id}
                    item={item}
                    value={counts[item.id]}
                    onChange={onChange}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {sections.length === 0 && (
        <p className="empty-msg stk-empty">
          {activeCompany && !needle
            ? `No ${activeCompany.name} items.`
            : <>No items match &ldquo;{query}&rdquo;{activeCompany ? ` in ${activeCompany.name}` : ''}.</>}
        </p>
      )}
    </div>
  )
}
