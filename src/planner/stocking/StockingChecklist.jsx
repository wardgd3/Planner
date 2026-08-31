import { memo } from 'react'

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
    <li className={`stk-row ${counted ? 'counted' : ''}`} data-item-id={item.id}>
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

export default function StockingChecklist({ sections, counts, onChange, sectionRefs, emptyMessage }) {
  if (sections.length === 0) {
    return <p className="empty-msg stk-empty">{emptyMessage}</p>
  }

  return (
    <div className="stk-checklist">
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
    </div>
  )
}
