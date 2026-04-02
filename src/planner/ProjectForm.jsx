import { useState, useRef } from 'react'

const PRESET_COLORS = ['#f4845f','#f7c948','#4ade80','#60a5fa','#a78bfa','#f472b6','#fb7185','#34d399','#38bdf8','#e879f9']

export default function ProjectForm({ project, onSave, onCancel }) {
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [color, setColor] = useState(project?.color || '#60a5fa')
  const [status, setStatus] = useState(project?.status || 'active')
  const [dueDate, setDueDate] = useState(project?.due_date || '')
  const [showPicker, setShowPicker] = useState(false)
  const colorRef = useRef(null)

  function handleSave() {
    if (!name.trim()) return
    onSave({ name: name.trim(), description, color, status, due_date: dueDate || null })
  }

  return (
    <div className="drawer-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2 className="drawer-title">{project ? 'Edit Project' : 'New Project'}</h2>
          <button className="icon-btn" onClick={onCancel}>✕</button>
        </div>
        <div className="drawer-body">
          <input className="input" placeholder="Project name (required)" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <textarea className="input textarea" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={3} />

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

          <label className="field-label">Status</label>
          <div className="seg-btns">
            {['active','paused','completed'].map(s => (
              <button key={s} className={`seg-btn ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <label className="field-label">Due Date</label>
          <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div className="drawer-footer">
          <button className="confirm-btn" onClick={handleSave} disabled={!name.trim()}>
            {project ? 'Save Changes' : 'Create Project'}
          </button>
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
