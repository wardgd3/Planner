import { useState } from 'react'
import { toISODate } from './taskRecurrence'

const WEEKDAY_LABELS = [
  { d: 0, short: 'S', name: 'Sun' },
  { d: 1, short: 'M', name: 'Mon' },
  { d: 2, short: 'T', name: 'Tue' },
  { d: 3, short: 'W', name: 'Wed' },
  { d: 4, short: 'T', name: 'Thu' },
  { d: 5, short: 'F', name: 'Fri' },
  { d: 6, short: 'S', name: 'Sat' },
]

export default function TaskForm({ task, series, projects, habits, templates = [], onSave, onCancel, centered = false }) {
  const isEdit = !!task
  const backingSeries = series || null

  const [title, setTitle] = useState(task?.title || '')
  const [notes, setNotes] = useState(task?.notes || '')
  const [projectId, setProjectId] = useState(task?.project_id || '')
  const [habitId, setHabitId] = useState(task?.habit_id || '')
  const [priority, setPriority] = useState(task?.priority || 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date || '')
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0, 5) || '')

  // Recurrence form state — seeded from backing series if editing one
  const [isRecurring, setIsRecurring] = useState(!!backingSeries)
  const [recurType, setRecurType] = useState(backingSeries?.recurrence_type || 'weekly')
  const [recurInterval, setRecurInterval] = useState(backingSeries?.recurrence_interval || 1)
  const [recurWeekdays, setRecurWeekdays] = useState(backingSeries?.recurrence_weekdays || [])
  const [recurDayOfMonth, setRecurDayOfMonth] = useState(backingSeries?.recurrence_day_of_month || 1)
  const [recurEndDate, setRecurEndDate] = useState(backingSeries?.end_date || '')
  const [applyToSeries, setApplyToSeries] = useState(!!backingSeries)

  const [saving, setSaving] = useState(false)

  function toggleWeekday(d) {
    setRecurWeekdays(arr => arr.includes(d) ? arr.filter(x => x !== d) : [...arr, d].sort((a, b) => a - b))
  }

  function buildRecurrencePayload() {
    return {
      recurrence_type: recurType,
      recurrence_interval: Math.max(1, parseInt(recurInterval, 10) || 1),
      recurrence_weekdays: recurType === 'weekly'
        ? (recurWeekdays.length > 0 ? recurWeekdays : null)
        : null,
      recurrence_day_of_month: recurType === 'monthly'
        ? Math.min(31, Math.max(1, parseInt(recurDayOfMonth, 10) || 1))
        : null,
      start_date: dueDate || toISODate(new Date()),
      end_date: recurEndDate || null,
    }
  }

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        notes,
        project_id: projectId || null,
        habit_id: habitId || null,
        priority,
        due_date: dueDate || null,
        due_time: dueTime || null,
      }
      if (!isEdit && isRecurring) {
        payload.recurrence = buildRecurrencePayload()
      }
      if (isEdit && backingSeries && applyToSeries) {
        payload.seriesUpdate = {
          ...buildRecurrencePayload(),
          // Don't overwrite start_date on an existing series
          start_date: backingSeries.start_date,
        }
        payload.seriesId = backingSeries.id
      }
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`drawer-overlay${centered ? ' drawer-overlay-centered' : ''}`} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <input
            className="input"
            placeholder="Task title (required)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            maxLength={200}
            list="task-template-list"
          />
          {templates.length > 0 && (
            <datalist id="task-template-list">
              {templates.map(t => <option key={t.id} value={t.title} />)}
            </datalist>
          )}

          <textarea className="input textarea" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} />

          <label className="field-label">Priority</label>
          <div className="seg-btns">
            {['low', 'medium', 'high'].map(p => (
              <button key={p} className={`seg-btn ${priority === p ? 'active priority-' + p : ''}`} onClick={() => setPriority(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <label className="field-label">Project</label>
          <select className="input select-input" value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label className="field-label">Link to Habit <span className="field-hint-inline">(auto-increments on complete)</span></label>
          <select className="input select-input" value={habitId} onChange={e => setHabitId(e.target.value)}>
            <option value="">No habit</option>
            {habits.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>

          <div className="two-col">
            <div>
              <label className="field-label">{isRecurring && !isEdit ? 'Start Date' : 'Due Date'}</label>
              <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{isRecurring && !isEdit ? 'Time' : 'Due Time'}</label>
              <input className="input" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>

          {/* Recurrence — for new tasks: checkbox to enable. For existing series-backed: banner + opt-in */}
          {!isEdit && (
            <div className="recurrence-block">
              <label className="recurrence-toggle">
                <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
                <span>Make this recurring</span>
              </label>
              {isRecurring && (
                <RecurrenceFields
                  type={recurType} setType={setRecurType}
                  interval={recurInterval} setInterval={setRecurInterval}
                  weekdays={recurWeekdays} toggleWeekday={toggleWeekday}
                  dayOfMonth={recurDayOfMonth} setDayOfMonth={setRecurDayOfMonth}
                  endDate={recurEndDate} setEndDate={setRecurEndDate}
                />
              )}
            </div>
          )}
          {isEdit && backingSeries && (
            <div className="recurrence-block series-edit-block">
              <div className="series-badge">
                <span className="series-badge-icon">🔁</span>
                <span>Part of a recurring series</span>
              </div>
              <label className="recurrence-toggle">
                <input type="checkbox" checked={applyToSeries} onChange={e => setApplyToSeries(e.target.checked)} />
                <span>Apply changes to future occurrences</span>
              </label>
              {applyToSeries && (
                <RecurrenceFields
                  type={recurType} setType={setRecurType}
                  interval={recurInterval} setInterval={setRecurInterval}
                  weekdays={recurWeekdays} toggleWeekday={toggleWeekday}
                  dayOfMonth={recurDayOfMonth} setDayOfMonth={setRecurDayOfMonth}
                  endDate={recurEndDate} setEndDate={setRecurEndDate}
                />
              )}
            </div>
          )}
        </div>
        <div className="drawer-footer">
          <button className={`confirm-btn ${saving ? 'loading' : ''}`} onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? 'Saving…' : task ? 'Save Changes' : (isRecurring ? 'Create Recurring Task' : 'Add Task')}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function RecurrenceFields({ type, setType, interval, setInterval, weekdays, toggleWeekday, dayOfMonth, setDayOfMonth, endDate, setEndDate }) {
  const unitLabel = type === 'daily' ? 'day' : type === 'weekly' ? 'week' : 'month'
  return (
    <div className="recurrence-fields">
      <label className="field-label">Repeats</label>
      <div className="seg-btns">
        {['daily', 'weekly', 'monthly'].map(t => (
          <button key={t} className={`seg-btn ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <label className="field-label">Every</label>
      <div className="recurrence-interval-row">
        <input
          className="input recurrence-interval-input"
          type="number"
          min={1}
          max={99}
          value={interval}
          onChange={e => setInterval(e.target.value)}
        />
        <span className="recurrence-interval-unit">{unitLabel}{interval != 1 ? 's' : ''}</span>
      </div>

      {type === 'weekly' && (
        <>
          <label className="field-label">On weekdays</label>
          <div className="weekday-chips">
            {WEEKDAY_LABELS.map(w => (
              <button
                key={w.d}
                className={`weekday-chip ${weekdays.includes(w.d) ? 'active' : ''}`}
                onClick={() => toggleWeekday(w.d)}
                title={w.name}
                type="button"
              >
                {w.short}
              </button>
            ))}
          </div>
          <p className="field-hint">If no weekdays selected, defaults to the start date's weekday.</p>
        </>
      )}

      {type === 'monthly' && (
        <>
          <label className="field-label">Day of month</label>
          <input
            className="input"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={e => setDayOfMonth(e.target.value)}
          />
          <p className="field-hint">Months shorter than this day fall back to the last day of that month.</p>
        </>
      )}

      <label className="field-label">End date <span className="field-hint-inline">(optional)</span></label>
      <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
    </div>
  )
}
