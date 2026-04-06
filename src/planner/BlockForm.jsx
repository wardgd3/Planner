import { useState, useRef, useMemo } from 'react'
import { PRESET_COLORS } from '../constants'
import { timeToMinutes, computeEndTime, timeRangesOverlap } from '../utils'

export default function BlockForm({ block, date, startTime, projects, tasks, habits, glossaryItems = [], existingBlocks = [], onSave, onCancel }) {
  const [title, setTitle] = useState(block?.title || '')
  const [blockDate, setBlockDate] = useState(block?.date || date || '')
  const [start, setStart] = useState(block?.start_time?.slice(0, 5) || startTime || '09:00')
  const [end, setEnd] = useState(block?.end_time?.slice(0, 5) || '')
  const [projectId, setProjectId] = useState(block?.project_id || '')
  const [taskId, setTaskId] = useState(block?.task_id || '')
  const [habitId, setHabitId] = useState(block?.habit_id || '')
  const [color, setColor] = useState(block?.color || '#60a5fa')
  const [notes, setNotes] = useState(block?.notes || '')
  const [showPicker, setShowPicker] = useState(false)
  const [glossarySearch, setGlossarySearch] = useState('')
  const [showGlossary, setShowGlossary] = useState(false)
  const [saving, setSaving] = useState(false)
  const colorRef = useRef(null)

  const filteredTasks = projectId ? tasks.filter(t => t.project_id === projectId) : tasks

  const glossaryResults = useMemo(
    () => glossarySearch.length > 0
      ? glossaryItems.filter(g => g.name.toLowerCase().includes(glossarySearch.toLowerCase())).slice(0, 6)
      : [],
    [glossarySearch, glossaryItems]
  )

  // Validation
  const timeError = useMemo(() => {
    if (!start || !end) return null
    if (timeToMinutes(end) <= timeToMinutes(start)) return 'End time must be after start time'
    // Check for conflicts with existing blocks (exclude current block if editing)
    const otherBlocks = existingBlocks.filter(b => !block || b.id !== block.id)
    const conflict = otherBlocks.find(b => timeRangesOverlap(start, end, b.start_time.slice(0, 5), b.end_time.slice(0, 5)))
    if (conflict) return `Overlaps with "${conflict.title}" (${conflict.start_time.slice(0, 5)}–${conflict.end_time.slice(0, 5)})`
    return null
  }, [start, end, existingBlocks, block])

  function applyGlossaryItem(item) {
    setTitle(item.name)
    const baseStart = item.default_time ? item.default_time.slice(0, 5) : start
    if (item.default_time) setStart(baseStart)
    if (item.default_duration_minutes) {
      setEnd(computeEndTime(baseStart, item.default_duration_minutes))
    }
    if (item.source === 'habit' && item.habit_id) setHabitId(item.habit_id)
    if (item.color) setColor(item.color)
    if (item.description) setNotes(item.description)
    setGlossarySearch('')
    setShowGlossary(false)
  }

  async function handleSave() {
    if (!title.trim() || !blockDate || !start || !end || timeError || saving) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), date: blockDate, start_time: start, end_time: end, project_id: projectId || null, task_id: taskId || null, habit_id: habitId || null, color, notes })
    } finally {
      setSaving(false)
    }
  }

  const canSave = title.trim() && start && end && !timeError && !saving

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">{block ? 'Edit Block' : 'New Time Block'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">

          {!block && (
            <div className="glossary-search-wrap" style={{ position: 'relative' }}>
              <span className="search-icon">🔍</span>
              <input
                className="input glossary-search"
                placeholder="Search glossary to prefill…"
                value={glossarySearch}
                onChange={e => { setGlossarySearch(e.target.value); setShowGlossary(true) }}
                onFocus={() => setShowGlossary(true)}
              />
              {glossarySearch && <button className="search-clear" onClick={() => { setGlossarySearch(''); setShowGlossary(false) }}>✕</button>}
              {showGlossary && glossaryResults.length > 0 && (
                <div className="glossary-dropdown">
                  {glossaryResults.map(item => (
                    <button key={item.id} className="glossary-dropdown-item" onClick={() => applyGlossaryItem(item)}>
                      <span className="gdi-name">{item.name}</span>
                      <span className={`glossary-source-badge ${item.source}`}>{item.source}</span>
                      {item.default_duration_minutes && <span className="gdi-meta">{item.default_duration_minutes}m</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <input className="input" placeholder="Block title (required)" value={title} onChange={e => setTitle(e.target.value)} autoFocus={!!block} maxLength={200} />

          <label className="field-label">Date</label>
          <input className="input" type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} />

          <div className="two-col">
            <div>
              <label className="field-label">Start Time</label>
              <input className="input" type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label">End Time</label>
              <input className="input" type="time" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          {timeError && <p className="field-hint" style={{ color: '#fb7185' }}>{timeError}</p>}

          <label className="field-label">Color</label>
          <div className="color-picker-wrap" ref={colorRef}>
            <button className="color-swatch-btn" style={{ background: color }} onClick={() => setShowPicker(v => !v)} />
            {showPicker && (
              <div className="color-popover">
                <div className="color-presets">
                  {PRESET_COLORS.map(c => (
                    <button key={c} className={`preset-swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setShowPicker(false) }} />
                  ))}
                </div>
                <input type="color" className="color-input-native" value={color} onChange={e => setColor(e.target.value)} />
              </div>
            )}
          </div>

          <label className="field-label">Project</label>
          <select className="input select-input" value={projectId} onChange={e => { setProjectId(e.target.value); setTaskId('') }}>
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="field-label">Task</label>
          <select className="input select-input" value={taskId} onChange={e => setTaskId(e.target.value)}>
            <option value="">No task</option>
            {filteredTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>

          <label className="field-label">Habit</label>
          <select className="input select-input" value={habitId} onChange={e => setHabitId(e.target.value)}>
            <option value="">No habit</option>
            {habits.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>

          <label className="field-label">Notes</label>
          <textarea className="input textarea" placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} maxLength={2000} />
        </div>
        <div className="drawer-footer">
          <button className={`confirm-btn ${saving ? 'loading' : ''}`} onClick={handleSave} disabled={!canSave}>
            {saving ? 'Saving…' : block ? 'Save Changes' : 'Add Block'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
