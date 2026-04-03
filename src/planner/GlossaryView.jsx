import { useState, useMemo } from 'react'
import { computeEndTime } from '../utils'

function GlossaryForm({ item, onSave, onCancel }) {
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [duration, setDuration] = useState(item?.default_duration_minutes || '')
  const [defaultTime, setDefaultTime] = useState(item?.default_time?.slice(0, 5) || '')
  const [tags, setTags] = useState(item?.tags?.join(', ') || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description,
        default_duration_minutes: duration ? parseInt(duration) : null,
        default_time: defaultTime || null,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        source: 'custom'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">{item ? 'Edit Item' : 'New Glossary Item'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <input className="input" placeholder="Name (required)" value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={200} />
          <textarea className="input textarea" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={2000} />
          <div className="two-col">
            <div>
              <label className="field-label">Default Duration (mins)</label>
              <input className="input" type="number" placeholder="e.g. 60" value={duration} onChange={e => setDuration(e.target.value)} min="1" max="1440" />
            </div>
            <div>
              <label className="field-label">Default Time</label>
              <input className="input" type="time" value={defaultTime} onChange={e => setDefaultTime(e.target.value)} />
            </div>
          </div>
          <label className="field-label">Tags <span className="field-hint-inline">(comma separated)</span></label>
          <input className="input" placeholder="e.g. art, drawing, study" value={tags} onChange={e => setTags(e.target.value)} maxLength={500} />
        </div>
        <div className="drawer-footer">
          <button className={`confirm-btn ${saving ? 'loading' : ''}`} onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function ScheduleModal({ item, onSchedule, onCancel }) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [date, setDate] = useState(todayStr)
  const [startTime, setStartTime] = useState(item.default_time?.slice(0, 5) || '09:00')
  const endMins = item.default_duration_minutes
    ? computeEndTime(startTime, item.default_duration_minutes)
    : ''
  const [endTime, setEndTime] = useState(endMins)
  const [saving, setSaving] = useState(false)

  async function handleSchedule() {
    if (!date || !startTime || !endTime || saving) return
    setSaving(true)
    try {
      await onSchedule({ date, start_time: startTime, end_time: endTime })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">Schedule "{item.name}"</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <label className="field-label">Date</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div className="two-col">
            <div>
              <label className="field-label">Start Time</label>
              <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="field-label">End Time</label>
              <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          {item.description && <p className="glossary-desc-preview">{item.description}</p>}
        </div>
        <div className="drawer-footer">
          <button className={`confirm-btn ${saving ? 'loading' : ''}`} onClick={handleSchedule} disabled={!date || !startTime || !endTime || saving}>
            {saving ? 'Scheduling…' : 'Add to Planner'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function GlossaryView({ glossaryItems, habits, onAddItem, onEditItem, onDeleteItem, onScheduleItem }) {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [scheduling, setScheduling] = useState(null)
  const [filterTag, setFilterTag] = useState('all')

  const habitEntries = useMemo(() => habits.map(h => ({
    id: `habit-${h.id}`,
    name: h.name,
    description: null,
    source: 'habit',
    habit_id: h.id,
    color: h.color,
    tags: [],
    default_duration_minutes: null,
    default_time: null,
  })), [habits])

  const allItems = useMemo(
    () => [...glossaryItems, ...habitEntries]
      .filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
      .filter(item => filterTag === 'all' || (item.tags || []).includes(filterTag))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [glossaryItems, habitEntries, search, filterTag]
  )

  const allTags = useMemo(
    () => [...new Set(glossaryItems.flatMap(i => i.tags || []))].sort(),
    [glossaryItems]
  )

  async function handleSchedule(item, scheduleData) {
    await onScheduleItem(item, scheduleData)
    setScheduling(null)
  }

  return (
    <div className="glossary-view">
      <div className="glossary-header">
        <div>
          <h2 className="section-label" style={{ marginBottom: 4 }}>Glossary</h2>
          <p className="glossary-subtitle">{allItems.length} items · click + to schedule</p>
        </div>
        <button className="add-btn" onClick={() => setForm({})}>+ New Item</button>
      </div>

      <div className="glossary-controls">
        <div className="glossary-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="input glossary-search"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
        </div>
        {allTags.length > 0 && (
          <div className="glossary-tags">
            <button className={`gtag ${filterTag === 'all' ? 'active' : ''}`} onClick={() => setFilterTag('all')}>All</button>
            {allTags.map(t => (
              <button key={t} className={`gtag ${filterTag === t ? 'active' : ''}`} onClick={() => setFilterTag(t)}>{t}</button>
            ))}
          </div>
        )}
      </div>

      <ul className="glossary-list">
        {allItems.length === 0 && (
          <li className="glossary-empty">No items found{search ? ` for "${search}"` : ''}</li>
        )}
        {allItems.map(item => (
          <li key={item.id} className="glossary-row">
            <div className="glossary-row-left">
              {item.source === 'habit' ? (
                <span className="glossary-dot habit-dot-g" style={{ background: item.color || '#60a5fa' }} />
              ) : (
                <span className="glossary-dot custom-dot" />
              )}
              <div className="glossary-info">
                <div className="glossary-name-row">
                  <span className="glossary-name">{item.name}</span>
                  <span className={`glossary-source-badge ${item.source}`}>{item.source}</span>
                  {(item.tags || []).map(t => <span key={t} className="gtag-inline">{t}</span>)}
                </div>
                {item.description && <p className="glossary-desc">{item.description}</p>}
                <div className="glossary-meta">
                  {item.default_duration_minutes && <span className="gmeta">⏱ {item.default_duration_minutes}m</span>}
                  {item.default_time && <span className="gmeta">🕐 {item.default_time.slice(0, 5)}</span>}
                </div>
              </div>
            </div>
            <div className="glossary-actions">
              <button className="glossary-schedule-btn" title="Schedule" onClick={() => setScheduling(item)} aria-label="Schedule item">+</button>
              {item.source === 'custom' && (
                <>
                  <button className="icon-btn" onClick={() => setForm({ item })} aria-label="Edit item">✏️</button>
                  <button className="icon-btn" onClick={() => onDeleteItem(item.id)} aria-label="Delete item">🗑</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {form !== null && (
        <GlossaryForm
          item={form.item}
          onSave={async (data) => {
            form.item ? await onEditItem(form.item.id, data) : await onAddItem(data)
            setForm(null)
          }}
          onCancel={() => setForm(null)}
        />
      )}

      {scheduling && (
        <ScheduleModal
          item={scheduling}
          onSchedule={(data) => handleSchedule(scheduling, data)}
          onCancel={() => setScheduling(null)}
        />
      )}
    </div>
  )
}
