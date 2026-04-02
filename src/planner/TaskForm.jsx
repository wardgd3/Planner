import { useState } from 'react'

export default function TaskForm({ task, projects, habits, onSave, onCancel }) {
  const [title, setTitle] = useState(task?.title || '')
  const [notes, setNotes] = useState(task?.notes || '')
  const [projectId, setProjectId] = useState(task?.project_id || '')
  const [habitId, setHabitId] = useState(task?.habit_id || '')
  const [priority, setPriority] = useState(task?.priority || 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date || '')
  const [dueTime, setDueTime] = useState(task?.due_time?.slice(0,5) || '')

  function handleSave() {
    if (!title.trim()) return
    onSave({ title: title.trim(), notes, project_id: projectId || null, habit_id: habitId || null, priority, due_date: dueDate || null, due_time: dueTime || null })
  }

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="icon-btn" onClick={onCancel}>✕</button>
        </div>
        <div className="drawer-body">
          <input className="input" placeholder="Task title (required)" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea className="input textarea" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />

          <label className="field-label">Priority</label>
          <div className="seg-btns">
            {['low','medium','high'].map(p => (
              <button key={p} className={`seg-btn ${priority === p ? 'active priority-'+p : ''}`} onClick={() => setPriority(p)}>
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
              <label className="field-label">Due Date</label>
              <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Due Time</label>
              <input className="input" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="confirm-btn" onClick={handleSave} disabled={!title.trim()}>
            {task ? 'Save Changes' : 'Add Task'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
