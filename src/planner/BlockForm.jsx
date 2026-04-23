import { useState, useMemo } from 'react'
import { timeToMinutes, computeEndTime, timeRangesOverlap } from '../utils'

export default function BlockForm({
  block, date, startTime, projects, tasks, habits,
  glossaryItems = [], existingBlocks = [],
  linkedTaskIds = [],
  onSave, onCancel, centered = false,
}) {
  const [title, setTitle] = useState(block?.title || '')
  const [blockDate, setBlockDate] = useState(block?.date || date || '')
  const [noTime, setNoTime] = useState(block ? (!block.start_time && !block.end_time) : false)
  const [start, setStart] = useState(block?.start_time?.slice(0, 5) || startTime || '09:00')
  const [end, setEnd] = useState(block?.end_time?.slice(0, 5) || '')
  const [projectId, setProjectId] = useState(block?.project_id || '')
  const [habitId, setHabitId] = useState(block?.habit_id || '')
  const [notes, setNotes] = useState(block?.notes || '')
  const [glossarySearch, setGlossarySearch] = useState('')
  const [showGlossary, setShowGlossary] = useState(false)
  const [saving, setSaving] = useState(false)

  // Linked tasks state: existing task IDs + draft new tasks (strings)
  const [selectedTaskIds, setSelectedTaskIds] = useState(linkedTaskIds)
  const [newTaskDrafts, setNewTaskDrafts] = useState([])
  const [newTaskInput, setNewTaskInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const activeProjects = useMemo(() => projects.filter(p => p.status !== 'completed'), [projects])

  const selectableTasks = useMemo(() => {
    // Prefer tasks from active projects; if projectId set, filter further
    const base = projectId
      ? tasks.filter(t => t.project_id === projectId)
      : tasks.filter(t => {
          if (!t.project_id) return true
          const p = activeProjects.find(p => p.id === t.project_id)
          return !!p
        })
    return base
      .filter(t => t.status !== 'done')
      .filter(t => !selectedTaskIds.includes(t.id))
  }, [tasks, projectId, activeProjects, selectedTaskIds])

  const selectedTaskObjs = useMemo(
    () => selectedTaskIds.map(id => tasks.find(t => t.id === id)).filter(Boolean),
    [selectedTaskIds, tasks]
  )

  const glossaryResults = useMemo(
    () => glossarySearch.length > 0
      ? glossaryItems.filter(g => g.name.toLowerCase().includes(glossarySearch.toLowerCase())).slice(0, 6)
      : [],
    [glossarySearch, glossaryItems]
  )

  // Validation
  const timeError = useMemo(() => {
    if (noTime) return null
    if (!start || !end) return null
    if (timeToMinutes(end) <= timeToMinutes(start)) return 'End time must be after start time'
    const otherBlocks = existingBlocks.filter(b => (!block || b.id !== block.id) && b.start_time && b.end_time)
    const conflict = otherBlocks.find(b => timeRangesOverlap(start, end, b.start_time.slice(0, 5), b.end_time.slice(0, 5)))
    if (conflict) return `Overlaps with "${conflict.title}" (${conflict.start_time.slice(0, 5)}–${conflict.end_time.slice(0, 5)})`
    return null
  }, [noTime, start, end, existingBlocks, block])

  function applyGlossaryItem(item) {
    setTitle(item.name)
    const baseStart = item.default_time ? item.default_time.slice(0, 5) : start
    if (item.default_time) setStart(baseStart)
    if (item.default_duration_minutes) setEnd(computeEndTime(baseStart, item.default_duration_minutes))
    if (item.source === 'habit' && item.habit_id) setHabitId(item.habit_id)
    if (item.description) setNotes(item.description)
    setGlossarySearch('')
    setShowGlossary(false)
  }

  function addExistingTask(tid) {
    if (!tid) return
    setSelectedTaskIds(prev => prev.includes(tid) ? prev : [...prev, tid])
    setPickerOpen(false)
  }

  function removeSelectedTask(tid) {
    setSelectedTaskIds(prev => prev.filter(id => id !== tid))
  }

  function addNewDraft() {
    const t = newTaskInput.trim()
    if (!t) return
    setNewTaskDrafts(prev => [...prev, t])
    setNewTaskInput('')
  }

  function removeNewDraft(i) {
    setNewTaskDrafts(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleProjectChange(id) {
    setProjectId(id)
    if (id) {
      const proj = projects.find(p => p.id === id)
      if (proj) setTitle(proj.name)
    }
  }

  async function handleSave() {
    if (!title.trim() || !blockDate || timeError || saving) return
    if (!noTime && (!start || !end)) return
    // Commit any pending typed draft
    const pendingDrafts = newTaskInput.trim() ? [...newTaskDrafts, newTaskInput.trim()] : newTaskDrafts
    setSaving(true)
    try {
      await onSave({
        title: title.trim(), date: blockDate,
        start_time: noTime ? null : start,
        end_time: noTime ? null : end,
        project_id: projectId || null,
        task_id: null, // legacy single-task field — cleared in favor of join table
        habit_id: habitId || null,
        color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4981a',
        notes,
        block_task_ids: selectedTaskIds,
        new_task_titles: pendingDrafts,
      })
    } finally {
      setSaving(false)
    }
  }

  const canSave = title.trim() && blockDate && (noTime || (start && end)) && !timeError && !saving

  return (
    <div className={`drawer-overlay${centered ? ' drawer-overlay-centered' : ''}`} onClick={e => e.target === e.currentTarget && onCancel()}>
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

          <label className="field-label">Project</label>
          <select className="input select-input" value={projectId} onChange={e => handleProjectChange(e.target.value)}>
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <input className="input" placeholder="Block title (required)" value={title} onChange={e => setTitle(e.target.value)} autoFocus={!!block} maxLength={200} />

          <label className="field-label">Date</label>
          <input className="input" type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} />

          <label className="field-label-row">
            <input type="checkbox" checked={noTime} onChange={e => setNoTime(e.target.checked)} />
            <span>No specific time (N/A)</span>
          </label>
          {!noTime && (
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
          )}
          {timeError && <p className="field-hint" style={{ color: '#fb7185' }}>{timeError}</p>}

          {/* ── Tasks within block ── */}
          <label className="field-label">Tasks in this block</label>
          <div className="bf-tasks">
            {selectedTaskObjs.length === 0 && newTaskDrafts.length === 0 && (
              <p className="empty-msg" style={{ padding: '4px 0', fontSize: 12 }}>No tasks linked yet</p>
            )}
            {selectedTaskObjs.map(t => {
              const proj = projects.find(p => p.id === t.project_id)
              return (
                <div key={t.id} className="bf-task-chip">
                  <span className="bf-task-title">{t.title}</span>
                  {proj && <span className="bf-task-proj" style={{ color: proj.color }}>● {proj.name}</span>}
                  <button type="button" className="bf-task-remove" onClick={() => removeSelectedTask(t.id)} aria-label="Remove task">✕</button>
                </div>
              )
            })}
            {newTaskDrafts.map((t, i) => (
              <div key={`draft-${i}`} className="bf-task-chip bf-task-chip-new">
                <span className="bf-task-title">{t}</span>
                <span className="bf-task-proj">new</span>
                <button type="button" className="bf-task-remove" onClick={() => removeNewDraft(i)} aria-label="Remove new task">✕</button>
              </div>
            ))}

            {/* New task inline input */}
            <div className="bf-task-add-row">
              <input
                className="input bf-task-input"
                placeholder="Type a new task and press Enter…"
                value={newTaskInput}
                onChange={e => setNewTaskInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewDraft() } }}
                maxLength={200}
              />
              <button type="button" className="add-btn bf-task-add-btn" onClick={addNewDraft} disabled={!newTaskInput.trim()}>+ Add</button>
            </div>

            {/* Pick from existing tasks */}
            <div className="bf-task-pick-row">
              {!pickerOpen ? (
                <button type="button" className="bf-task-pick-btn" onClick={() => setPickerOpen(true)}>
                  + Pick from existing tasks
                </button>
              ) : (
                <div className="bf-task-picker">
                  <div className="bf-task-picker-header">
                    <span className="bf-task-picker-title">
                      {selectableTasks.length === 0 ? 'No eligible tasks' : 'Select a task to add'}
                    </span>
                    <button type="button" className="icon-btn" onClick={() => setPickerOpen(false)} aria-label="Close picker">✕</button>
                  </div>
                  {selectableTasks.length > 0 && (
                    <ul className="bf-task-picker-list">
                      {selectableTasks.map(t => {
                        const proj = projects.find(p => p.id === t.project_id)
                        return (
                          <li key={t.id}>
                            <button type="button" className="bf-task-picker-item" onClick={() => addExistingTask(t.id)}>
                              <span className="bf-task-picker-item-title">{t.title}</span>
                              {proj && <span className="bf-task-picker-item-proj" style={{ color: proj.color }}>● {proj.name}</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

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
