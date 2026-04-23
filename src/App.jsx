import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { supabase } from './supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Planner from './planner/Planner.jsx'
import ProjectsDashboard from './planner/ProjectsDashboard.jsx'
import HabitStats from './HabitStats.jsx'
import { ToastProvider, useToast } from './Toast.jsx'
import { PRESET_COLORS, PERIODS } from './constants'
import { getPeriodLabel, getPeriodRange } from './utils'
import './App.css'

// ── Sortable Habit Row ──
const SortableHabitRow = memo(function SortableHabitRow({ habit, count, bumping, editingId, habitCategoryIds, categories, onIncrement, onDecrement, onEdit, onDelete, onSelect, selected, mutating }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const catIds = habitCategoryIds[habit.id] || []
  const catNames = categories.filter(c => catIds.includes(c.id)).map(c => c.name)
  const isMutating = mutating === habit.id
  return (
    <li ref={setNodeRef} style={style} className={`habit-row ${editingId === habit.id ? 'editing' : ''} ${isDragging ? 'dragging' : ''} ${selected ? 'selected' : ''}`}>
      <div className="drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder"><span className="drag-dots">⠿</span></div>
      <button type="button" className="habit-info habit-info-btn" onClick={() => onSelect?.(habit.id)} aria-label={`View stats for ${habit.name}`}>
        <span className="habit-dot" style={{ background: habit.color || '#60a5fa' }} />
        <div>
          <p className="habit-name">{habit.name}</p>
          {catNames.length > 0 && <div className="habit-cats">{catNames.map(n => <span key={n} className="habit-cat-tag">{n}</span>)}</div>}
        </div>
      </button>
      <div className="habit-controls">
        <button className="ctrl-btn minus" onClick={() => onDecrement(habit)} disabled={isMutating || count <= 0} aria-label="Decrement">−</button>
        <span className={`habit-count ${bumping === habit.id ? 'bump' : ''}`}>{count}</span>
        <button className="ctrl-btn plus" onClick={() => onIncrement(habit)} disabled={isMutating} aria-label="Increment">+</button>
        <button className="icon-btn" onClick={() => onEdit(habit)} aria-label="Edit habit">✏️</button>
        <button className="icon-btn" onClick={() => onDelete(habit.id)} aria-label="Delete habit">🗑</button>
      </div>
    </li>
  )
})

// ── Category Manager ──
function CategoryManager({ categories, onAdd, onSave, onDelete }) {
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingCatName, setEditingCatName] = useState('')

  return (
    <div className="cat-manager">
      <p className="section-label" style={{ marginBottom: 12 }}>Manage Categories</p>
      <ul className="cat-list">
        {categories.map(c => (
          <li key={c.id} className="cat-row">
            {editingCatId === c.id ? (
              <>
                <input className="input cat-input" value={editingCatName} onChange={e => setEditingCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave(editingCatId, editingCatName).then(() => { setEditingCatId(null); setEditingCatName('') })} autoFocus />
                <button className="cat-action-btn save" onClick={() => onSave(editingCatId, editingCatName).then(() => { setEditingCatId(null); setEditingCatName('') })}>✓</button>
                <button className="cat-action-btn cancel" onClick={() => { setEditingCatId(null); setEditingCatName('') }}>✕</button>
              </>
            ) : (
              <>
                <span className="cat-name">{c.name}</span>
                <button className="cat-action-btn" onClick={() => { setEditingCatId(c.id); setEditingCatName(c.name) }} aria-label="Edit category">✏️</button>
                <button className="cat-action-btn" onClick={() => onDelete(c.id)} aria-label="Delete category">🗑</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="cat-add-row">
        <input className="input cat-input" placeholder="New category name" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd(newCatName).then(() => setNewCatName(''))} />
        <button className="confirm-btn" style={{ padding: '8px 14px', whiteSpace: 'nowrap' }} onClick={() => onAdd(newCatName).then(() => setNewCatName(''))}>+ Add</button>
      </div>
    </div>
  )
}

// ── Habit Form ──
function HabitForm({ editingId, newName, setNewName, newCategoryIds, categories, toggleNewCategory, newColor, setNewColor, showColorPicker, setShowColorPicker, colorRef, onSave, onCancel, saving }) {
  return (
    <div className="add-form">
      <input className="input" placeholder="Habit name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSave()} autoFocus />
      <div className="field-wrap">
        <p className="color-label" style={{ marginBottom: 8 }}>Categories <span className="required-star">*</span></p>
        {categories.length === 0 ? <p className="field-hint">No categories yet — create one using ⚙️ above</p> : (
          <div className="cat-checkboxes">
            {categories.map(c => (
              <button key={c.id} type="button" className={`cat-checkbox-btn ${newCategoryIds.includes(c.id) ? 'selected' : ''}`} onClick={() => toggleNewCategory(c.id)}>
                {newCategoryIds.includes(c.id) && <span className="check-icon">✓</span>}{c.name}
              </button>
            ))}
          </div>
        )}
        {categories.length > 0 && newCategoryIds.length === 0 && <p className="field-hint">Select at least one category</p>}
      </div>
      <div className="color-row">
        <span className="color-label">Color</span>
        <div className="color-picker-wrap" ref={colorRef}>
          <button className="color-swatch-btn" style={{ background: newColor }} onClick={() => setShowColorPicker(v => !v)} />
          {showColorPicker && (
            <div className="color-popover">
              <div className="color-presets">{PRESET_COLORS.map(c => <button key={c} className={`preset-swatch ${newColor === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => { setNewColor(c); setShowColorPicker(false) }} />)}</div>
              <input type="color" className="color-input-native" value={newColor} onChange={e => setNewColor(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      <div className="form-actions">
        <button className={`confirm-btn ${saving ? 'loading' : ''}`} onClick={onSave} disabled={!newName.trim() || newCategoryIds.length === 0 || saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Habit'}</button>
        <button className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main App ──
function AppInner({ user, onLogout }) {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('planner')
  const [showAccount, setShowAccount] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'slate-arrow')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('app-theme', theme)
  }, [theme])
  const [habits, setHabits] = useState([])
  const [logs, setLogs] = useState([])
  const [categories, setCategories] = useState([])
  const [habitCategoryIds, setHabitCategoryIds] = useState({})
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('Month')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [newName, setNewName] = useState('')
  const [newCategoryIds, setNewCategoryIds] = useState([])
  const [newColor, setNewColor] = useState('#60a5fa')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showCatManager, setShowCatManager] = useState(false)
  const [bumping, setBumping] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [selectedHabitId, setSelectedHabitId] = useState(null)
  const [mutating, setMutating] = useState(null)
  const [saving, setSaving] = useState(false)
  const colorRef = useRef(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { fetchAll() }, [period])
  useEffect(() => {
    const handler = (e) => { if (colorRef.current && !colorRef.current.contains(e.target)) setShowColorPicker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [{ data: habitsData, error: e1 }, { data: logsData, error: e2 }, { data: catsData, error: e3 }, { data: hcData, error: e4 }] = await Promise.all([
        supabase.from('habits').select('*').order('sort_order', { ascending: true }),
        supabase.from('habit_logs').select('id, habit_id, logged_at'),
        supabase.from('categories').select('*').order('name', { ascending: true }),
        supabase.from('habit_categories').select('habit_id, category_id')
      ])
      if (e1 || e2 || e3 || e4) toast.error('Failed to load some data')
      if (habitsData) setHabits(habitsData)
      if (logsData) setLogs(logsData)
      if (catsData) {
        setCategories(catsData)
        setSelectedCategoryId(prev => prev || catsData[0]?.id || '')
      }
      if (hcData) {
        const map = {}
        hcData.forEach(({ habit_id, category_id }) => { if (!map[habit_id]) map[habit_id] = []; map[habit_id].push(category_id) })
        setHabitCategoryIds(map)
      }
    } catch {
      toast.error('Network error loading data')
    }
    setLoading(false)
  }

  const periodRange = useMemo(() => getPeriodRange(period), [period])
  const getCount = useCallback((habitId) => logs.filter(l => l.habit_id === habitId && l.logged_at >= periodRange.start && l.logged_at <= periodRange.end).length, [logs, periodRange])
  const toggleNewCategory = useCallback((catId) => setNewCategoryIds(prev => prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]), [])

  const filteredHabits = useMemo(
    () => selectedCategoryId ? habits.filter(h => (habitCategoryIds[h.id] || []).includes(selectedCategoryId)) : habits,
    [selectedCategoryId, habits, habitCategoryIds]
  )

  const chartData = useMemo(
    () => filteredHabits.map(h => ({ name: h.name, count: getCount(h.id), color: h.color || '#60a5fa' })),
    [filteredHabits, getCount]
  )

  const selectedHabit = useMemo(
    () => selectedHabitId ? habits.find(h => h.id === selectedHabitId) : null,
    [selectedHabitId, habits]
  )
  // Clear selection if the habit was deleted
  useEffect(() => {
    if (selectedHabitId && habits.length > 0 && !habits.some(h => h.id === selectedHabitId)) {
      setSelectedHabitId(null)
    }
  }, [habits, selectedHabitId])

  const increment = useCallback(async (habit) => {
    if (mutating) return
    setMutating(habit.id)
    setBumping(habit.id)
    try {
      const { data, error } = await supabase.from('habit_logs').insert({ habit_id: habit.id }).select().single()
      if (error) { toast.error('Failed to log habit'); return }
      setLogs(prev => [...prev, data])
      const { error: e2 } = await supabase.from('habits').update({ count: habit.count + 1 }).eq('id', habit.id)
      if (e2) toast.error('Failed to update count')
      setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, count: h.count + 1 } : h))
    } catch {
      toast.error('Network error')
    } finally {
      setTimeout(() => setBumping(null), 300)
      setMutating(null)
    }
  }, [mutating, toast])

  const decrement = useCallback(async (habit) => {
    if (mutating || getCount(habit.id) <= 0) return
    setMutating(habit.id)
    try {
      const { start, end } = getPeriodRange(period)
      const { data: recentLog, error: e1 } = await supabase.from('habit_logs').select('id').eq('habit_id', habit.id).gte('logged_at', start).lte('logged_at', end).order('logged_at', { ascending: false }).limit(1).single()
      if (e1 || !recentLog) { toast.error('No log found to remove'); return }
      const { error: e2 } = await supabase.from('habit_logs').delete().eq('id', recentLog.id)
      if (e2) { toast.error('Failed to remove log'); return }
      setLogs(prev => prev.filter(l => l.id !== recentLog.id))
      const { error: e3 } = await supabase.from('habits').update({ count: Math.max(0, habit.count - 1) }).eq('id', habit.id)
      if (e3) toast.error('Failed to update count')
      setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, count: Math.max(0, h.count - 1) } : h))
    } catch {
      toast.error('Network error')
    } finally {
      setMutating(null)
    }
  }, [mutating, period, getCount, toast])

  const saveHabit = useCallback(async () => {
    if (!newName.trim() || newCategoryIds.length === 0 || saving) return
    setSaving(true)
    try {
      if (editingId) {
        const { data, error } = await supabase.from('habits').update({ name: newName.trim(), color: newColor }).eq('id', editingId).select().single()
        if (error) { toast.error('Failed to update habit'); return }
        await supabase.from('habit_categories').delete().eq('habit_id', editingId)
        const { error: e2 } = await supabase.from('habit_categories').insert(newCategoryIds.map(cid => ({ habit_id: editingId, category_id: cid })))
        if (e2) toast.error('Failed to update categories')
        setHabits(prev => prev.map(h => h.id === editingId ? data : h))
        setHabitCategoryIds(prev => ({ ...prev, [editingId]: newCategoryIds }))
        setEditingId(null)
        toast.success('Habit updated')
      } else {
        const maxOrder = habits.reduce((m, h) => Math.max(m, h.sort_order || 0), 0)
        const { data, error } = await supabase.from('habits').insert({ name: newName.trim(), color: newColor, count: 0, sort_order: maxOrder + 1 }).select().single()
        if (error) { toast.error('Failed to create habit'); return }
        const { error: e2 } = await supabase.from('habit_categories').insert(newCategoryIds.map(cid => ({ habit_id: data.id, category_id: cid })))
        if (e2) toast.error('Failed to assign categories')
        setHabits(prev => [...prev, data])
        setHabitCategoryIds(prev => ({ ...prev, [data.id]: newCategoryIds }))
        setAdding(false)
        toast.success('Habit created')
      }
      setNewName(''); setNewCategoryIds([]); setNewColor('#60a5fa')
    } catch {
      toast.error('Network error saving habit')
    } finally {
      setSaving(false)
    }
  }, [newName, newCategoryIds, newColor, editingId, saving, habits, toast])

  function startEdit(habit) { setEditingId(habit.id); setNewName(habit.name); setNewCategoryIds(habitCategoryIds[habit.id] || []); setNewColor(habit.color || '#60a5fa'); setAdding(false) }
  function cancelForm() { setAdding(false); setEditingId(null); setNewName(''); setNewCategoryIds([]); setNewColor('#60a5fa') }

  const deleteHabit = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('habits').delete().eq('id', id)
      if (error) { toast.error('Failed to delete habit'); return }
      setHabits(prev => prev.filter(h => h.id !== id))
      setLogs(prev => prev.filter(l => l.habit_id !== id))
      setHabitCategoryIds(prev => { const n = { ...prev }; delete n[id]; return n })
      toast.success('Habit deleted')
    } catch {
      toast.error('Network error')
    }
  }, [toast])

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    const oldIndex = filteredHabits.findIndex(h => h.id === active.id)
    const newIndex = filteredHabits.findIndex(h => h.id === over.id)
    const reordered = arrayMove(filteredHabits, oldIndex, newIndex)
    const otherHabits = habits.filter(h => !filteredHabits.find(f => f.id === h.id))
    setHabits([...reordered, ...otherHabits])
    try {
      await Promise.all(reordered.map((h, i) => supabase.from('habits').update({ sort_order: i + 1 }).eq('id', h.id)))
    } catch {
      toast.error('Failed to save new order')
    }
  }, [filteredHabits, habits, toast])

  // ── Category CRUD with error handling ──
  const addCategory = useCallback(async (name) => {
    if (!name.trim()) return
    try {
      const { data, error } = await supabase.from('categories').insert({ name: name.trim() }).select().single()
      if (error) { toast.error('Failed to create category'); return }
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      toast.error('Network error')
    }
  }, [toast])

  const saveCategory = useCallback(async (id, name) => {
    if (!name.trim()) return
    try {
      const { data, error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id).select().single()
      if (error) { toast.error('Failed to update category'); return }
      setCategories(prev => prev.map(c => c.id === id ? data : c).sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      toast.error('Network error')
    }
  }, [toast])

  const deleteCategory = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) { toast.error('Failed to delete category'); return }
      let nextFallback = ''
      setCategories(prev => {
        const next = prev.filter(c => c.id !== id)
        nextFallback = next[0]?.id || ''
        return next
      })
      setHabitCategoryIds(prev => { const n = {}; Object.keys(prev).forEach(hid => { n[hid] = prev[hid].filter(cid => cid !== id) }); return n })
      if (selectedCategoryId === id) setSelectedCategoryId(nextFallback)
    } catch {
      toast.error('Network error')
    }
  }, [selectedCategoryId, toast])

  const activeHabit = activeId ? filteredHabits.find(h => h.id === activeId) : null
  const isFormOpen = adding || !!editingId
  const selectedCatLabel = categories.find(c => c.id === selectedCategoryId)?.name || 'Habits'

  return (
    <div className={`app ${activeTab === "planner" || activeTab === "projects" ? "app-wide" : ""}`}>
      <div className="app-tabs">
        <button className={`app-tab ${activeTab === 'planner' ? 'active' : ''}`} onClick={() => setActiveTab('planner')}>Planner</button>
        <button className={`app-tab ${activeTab === 'tracker' ? 'active' : ''}`} onClick={() => setActiveTab('tracker')}>Habits</button>
        <button className={`app-tab desktop-only ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>Projects</button>
        <div className="settings-wrap">
          <button className="settings-btn settings-btn-text account-btn" onClick={() => setShowAccount(s => !s)} title="Account">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="account-btn-avatar" />
            ) : (
              <span className="account-btn-initial">{(user?.email?.[0] || 'A').toUpperCase()}</span>
            )}
            <span className="account-btn-label">Account</span>
          </button>
          {showAccount && (
            <div className="settings-popup account-popup">
              <div className="account-popup-profile">
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="" className="account-popup-avatar" />
                ) : (
                  <div className="account-popup-avatar account-popup-avatar-fallback">
                    {(user?.email?.[0] || 'A').toUpperCase()}
                  </div>
                )}
                <div className="account-popup-profile-info">
                  <p className="account-popup-name">
                    {user?.user_metadata?.full_name || user?.user_metadata?.name || 'Signed in'}
                  </p>
                  {user?.email && <p className="account-popup-email">{user.email}</p>}
                </div>
                <button className="logout-btn account-popup-signout" onClick={onLogout}>Sign out</button>
              </div>
              <div className="account-popup-section-title">Themes</div>
              {[
                {
                  label: 'Dark',
                  themes: [
                    ['warm', 'Warm'],
                    ['midnight-scholar', 'Midnight Scholar'],
                    ['great-wave', 'Great Wave Night'],
                    ['synthwave-night', 'Synthwave Night'],
                    ['neon-magenta', 'Neon Magenta'],
                    ['neon-rose', 'Neon Rose'],
                    ['neon-lime', 'Neon Lime'],
                    ['neon-cyan', 'Neon Cyan'],
                    ['neon-ice', 'Neon Ice'],
                    ['stone-clay', 'Stone Clay'],
                    ['redwood', 'Redwood'],
                    ['iron-ember', 'Iron Ember'],
                    ['slate-arrow', 'Slate Arrow'],
                    ['walnut-gold', 'Walnut Gold'],
                    ['void-crimson', 'Void Crimson'],
                    ['charcoal-citron', 'Charcoal Citron'],
                    ['ink-jade', 'Ink Jade'],
                    ['forest-dark', 'Forest Dark'],
                  ],
                },
                {
                  label: 'Light',
                  themes: [
                    ['william-morris', 'William Morris Garden'],
                    ['seventies-warm-retro', '70s Warm Retro'],
                    ['sand-coral', 'Sand Coral'],
                    ['studio-white', 'Studio White'],
                    ['linen-jade', 'Linen Jade'],
                    ['chalk-violet', 'Chalk Violet'],
                    ['neon-magenta-light', 'Pastel Magenta'],
                    ['neon-rose-light', 'Pastel Rose'],
                    ['neon-lime-light', 'Pastel Lime'],
                    ['neon-cyan-light', 'Pastel Cyan'],
                    ['neon-ice-light', 'Pastel Ice'],
                    ['blueprint', 'Blueprint'],
                    ['field-tan', 'Field Tan'],
                    ['carbon', 'Carbon'],
                    ['newspaper', 'Newspaper'],
                    ['alpine', 'Alpine'],
                    ['forest-light', 'Forest Light'],
                  ],
                },
                {
                  label: 'Other',
                  themes: [
                    ['wes-anderson', 'Wes Anderson'],
                    ['solitaire', 'Windows Solitaire'],
                    ['catan', 'Settlers of Catan'],
                    ['clue', 'Clue'],
                    ['chess', 'Chess'],
                    ['das-boot', 'Das Boot'],
                    ['nat-parks', 'National Parks'],
                    ['c64', 'Commodore 64'],
                    ['risograph', 'Risograph'],
                    ['aquarium', 'Deep Aquarium'],
                  ],
                },
              ].map(group => (
                <div key={group.label} className="settings-section">
                  <span className="settings-label">{group.label}</span>
                  <div className="settings-theme-options">
                    {group.themes.map(([key, label]) => (
                      <button key={key} className={`settings-theme-btn${theme === key ? ' active' : ''}`} onClick={() => setTheme(key)}>
                        <span className={`settings-theme-swatch ${key}`} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'planner' && <Planner habits={habits} />}

      {activeTab === 'projects' && <ProjectsDashboard habits={habits} />}

      {activeTab === 'tracker' && (
        <div className="tracker-wrap">
          <div className="bento-grid">
            {/* Header tile */}
            <div className="bento-tile bento-header">
              <div className="header-inner">
                <span className="logo-mark">◆</span>
                <div><h1>Habit Tracking</h1><p className="subtitle">{getPeriodLabel(period)}</p></div>
              </div>
              <div className="period-tabs">
                {PERIODS.map(p => (<button key={p} className={`period-tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>))}
              </div>
            </div>

            {/* Chart / Stats tile */}
            <div className="bento-tile bento-chart">
              {selectedHabit ? (
                <HabitStats habit={selectedHabit} logs={logs} onClose={() => setSelectedHabitId(null)} />
              ) : (
                <>
                  <h2 className="section-label">Overview — {selectedCatLabel}</h2>
                  {!loading && filteredHabits.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 70 }}>
                        <XAxis dataKey="name" tick={{ fill: '#8a8578', fontSize: 11, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={80} interval={0} />
                        <YAxis tick={{ fill: '#8a8578', fontSize: 11, fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: '#1c1b19', border: '1px solid #2e2c28', borderRadius: 10, color: '#f5f0e8', fontFamily: 'Outfit' }} cursor={{ fill: 'rgba(212,175,55,0.06)' }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>{chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : !loading ? (
                    <div className="empty-chart">No habits{selectedCategoryId ? ' in this category' : ''}</div>
                  ) : <div className="empty-chart">Loading…</div>}
                  {!loading && filteredHabits.length > 0 && (
                    <p className="chart-hint">Tap a habit below for detailed stats</p>
                  )}
                </>
              )}
            </div>

            {/* Category filter tile */}
            <div className="bento-tile bento-filter">
              <h2 className="section-label">Categories</h2>
              <div className="cat-bar">
                <div className="cat-dropdown-wrap">
                  <select className="cat-dropdown" value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} aria-label="Filter by category">
                    {categories.length === 0 && <option value="">No categories</option>}
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="cat-dropdown-arrow">▾</span>
                </div>
                <button className="manage-cats-btn" onClick={() => setShowCatManager(v => !v)} aria-label="Manage categories">⚙️</button>
              </div>
              {showCatManager && (
                <CategoryManager categories={categories} onAdd={addCategory} onSave={saveCategory} onDelete={deleteCategory} />
              )}
            </div>

            {/* Habits tile */}
            <div className="bento-tile bento-habits">
              <div className="section-header">
                <h2 className="section-label">Habits</h2>
                <button className="add-btn" onClick={() => { setAdding(v => !v); setEditingId(null); setNewName(''); setNewCategoryIds([]); setNewColor('#60a5fa') }}>{adding ? '✕' : '+ Add'}</button>
              </div>

              {isFormOpen && (
                <HabitForm
                  editingId={editingId} newName={newName} setNewName={setNewName}
                  newCategoryIds={newCategoryIds} categories={categories} toggleNewCategory={toggleNewCategory}
                  newColor={newColor} setNewColor={setNewColor}
                  showColorPicker={showColorPicker} setShowColorPicker={setShowColorPicker} colorRef={colorRef}
                  onSave={saveHabit} onCancel={cancelForm} saving={saving}
                />
              )}

              {loading ? <div className="loading">Loading…</div> : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(active.id)} onDragEnd={handleDragEnd}>
                  <SortableContext items={filteredHabits.map(h => h.id)} strategy={verticalListSortingStrategy}>
                    <ul className="habit-list">
                      {filteredHabits.map(habit => (
                        <SortableHabitRow key={habit.id} habit={habit} count={getCount(habit.id)} bumping={bumping} editingId={editingId} habitCategoryIds={habitCategoryIds} categories={categories}
                          onIncrement={increment} onDecrement={decrement}
                          onEdit={(h) => editingId === h.id ? cancelForm() : startEdit(h)}
                          onDelete={deleteHabit}
                          onSelect={id => setSelectedHabitId(curr => curr === id ? null : id)}
                          selected={selectedHabitId === habit.id}
                          mutating={mutating}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                  <DragOverlay>
                    {activeHabit && (
                      <div className="habit-row drag-overlay-row">
                        <div className="drag-handle"><span className="drag-dots">⠿</span></div>
                        <div className="habit-info"><span className="habit-dot" style={{ background: activeHabit.color || '#60a5fa' }} /><p className="habit-name">{activeHabit.name}</p></div>
                        <div className="habit-controls">
                          <button className="ctrl-btn minus">−</button>
                          <span className="habit-count">{getCount(activeHabit.id)}</span>
                          <button className="ctrl-btn plus">+</button>
                        </div>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App({ user, onLogout }) {
  return (
    <ToastProvider>
      <AppInner user={user} onLogout={onLogout} />
    </ToastProvider>
  )
}
