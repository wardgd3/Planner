import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { MONTHS_FULL, DAY_NAMES } from '../constants'
import { todayStr, toDateStr, priorityColor } from '../utils'
import { useToast } from '../Toast'
import BlockForm from './BlockForm'
import TaskForm from './TaskForm'
import WeatherWidget from './WeatherWidget'
import AiChat from './AiChat'
import ProjectsView from './ProjectsView'
import { fetchWeather, weatherEmoji, parseCondition } from './weatherService'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Moon phase calculator ──
function getMoonPhase(date = new Date()) {
  const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate()
  let c = 0, e = 0, jd = 0, b = 0
  if (month < 3) { c = year - 1; e = month + 12 } else { c = year; e = month }
  jd = Math.floor(365.25 * (c + 4716)) + Math.floor(30.6001 * (e + 1)) + day - 1524.5
  b = 2 - Math.floor(c / 100) + Math.floor(c / 400)
  jd += b
  const daysSinceNew = (jd - 2451550.1) % 29.530588853
  const phase = ((daysSinceNew < 0 ? daysSinceNew + 29.530588853 : daysSinceNew) / 29.530588853)
  const idx = Math.round(phase * 8) % 8
  const icons = ['\uD83C\uDF11', '\uD83C\uDF12', '\uD83C\uDF13', '\uD83C\uDF14', '\uD83C\uDF15', '\uD83C\uDF16', '\uD83C\uDF17', '\uD83C\uDF18']
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent']
  return { icon: icons[idx], name: names[idx] }
}


// ── Sortable block row (with expand-to-show-tasks) ──
function SortableBlock({ block, isActive, onEdit, onComplete, onDelete, today, linkedTasks = [], onCompleteTask, onEditTask, onDeleteTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const [expanded, setExpanded] = useState(false)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'var(--accent-dim)',
  }
  const hasTasks = linkedTasks.length > 0
  return (
    <div
      ref={setNodeRef}
      className={`dash-tl-block ${isActive ? 'dash-tl-active' : ''} ${block.completed ? 'dash-tl-done' : ''} ${isDragging ? 'dragging' : ''} ${expanded ? 'dash-tl-expanded' : ''}`}
      style={style}
    >
      <div className="dash-tl-row" onClick={() => setExpanded(v => !v)}>
        <span className="dash-tl-drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>⠿</span>
        <button
          className={`task-check small ${block.completed ? 'done' : ''}`}
          onClick={e => { e.stopPropagation(); onComplete(block) }}
          aria-label={block.completed ? 'Uncheck block' : 'Complete block'}
        >{block.completed ? '✓' : ''}</button>
        <span className="dash-tl-title">{block.title}</span>
        {hasTasks && (
          <span className="dash-tl-task-count" aria-label={`${linkedTasks.length} tasks`}>
            {linkedTasks.filter(t => t.status === 'done').length}/{linkedTasks.length}
          </span>
        )}
        {block.start_time && block.end_time
          ? <span className="dash-tl-time">{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</span>
          : <span className="dash-tl-time">N/A</span>}
        {isActive && !block.completed && <span className="dash-tl-live">NOW</span>}
        <button
          className="dash-tl-edit"
          onClick={e => { e.stopPropagation(); onEdit({ block, date: today }) }}
          aria-label="Edit block"
        >✏️</button>
        <button
          className="dash-tl-delete"
          onClick={e => { e.stopPropagation(); onDelete(block.id) }}
          aria-label="Delete block"
        >✕</button>
        <span
          className={`dash-tl-caret ${expanded ? 'open' : ''}`}
          aria-hidden="true"
        >▾</span>
      </div>

      {expanded && (
        <div className="dash-tl-tasks" onClick={e => e.stopPropagation()}>
          {linkedTasks.length === 0 ? (
            <p className="dash-tl-empty" onClick={() => onEdit({ block, date: today })}>
              No tasks yet — tap to edit block and add some
            </p>
          ) : (
            <ul className="dash-tl-task-list">
              {linkedTasks.map(t => (
                <li key={t.id} className={`dash-tl-task-row ${t.status === 'done' ? 'done' : ''}`}>
                  <button
                    className={`task-check small ${t.status === 'done' ? 'done' : ''}`}
                    onClick={() => onCompleteTask && onCompleteTask(t)}
                    aria-label={t.status === 'done' ? 'Task done' : 'Complete task'}
                  >{t.status === 'done' ? '✓' : ''}</button>
                  <span className="dash-tl-task-title" onClick={() => onEditTask && onEditTask(t)}>
                    {t.title}
                  </span>
                  {t.priority && (
                    <span className="priority-dot" style={{ background: priorityColor(t.priority) }} />
                  )}
                  <button
                    className="dash-tl-task-delete"
                    onClick={e => { e.stopPropagation(); onDeleteTask && onDeleteTask(t.id) }}
                    aria-label="Delete task"
                  >🗑</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isActive && !block.completed && block.start_time && block.end_time && (() => {
        const now = new Date()
        const [sh, sm] = block.start_time.split(':').map(Number)
        const [eh, em] = block.end_time.split(':').map(Number)
        const startMin = sh * 60 + sm
        const endMin = eh * 60 + em
        const nowMin = now.getHours() * 60 + now.getMinutes()
        const pct = Math.max(0, Math.min(100, ((nowMin - startMin) / (endMin - startMin)) * 100))
        return <div className="dash-tl-progress"><div className="dash-tl-progress-bar" style={{ width: `${pct}%` }} /></div>
      })()}
    </div>
  )
}

function SortableCard({ id, span, order, className = '', children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    gridColumn: `span ${span}`,
    order,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <div ref={setNodeRef} className={`dash-card ${className} sortable-card${isDragging ? ' dragging' : ''}`} style={style}>
      <button className="dash-card-drag" {...attributes} {...listeners} aria-label="Drag to reorder" onClick={e => e.preventDefault()}>⠿</button>
      {children}
    </div>
  )
}

const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDays(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function weekLabel(days) {
  const mon = days[0]
  const sun = days[6]
  const sameMonth = mon.getMonth() === sun.getMonth()
  const mStr = MONTHS_FULL[mon.getMonth()]
  if (sameMonth) return `${mStr} ${mon.getDate()} – ${sun.getDate()}`
  return `${mStr.slice(0, 3)} ${mon.getDate()} – ${MONTHS_FULL[sun.getMonth()].slice(0, 3)} ${sun.getDate()}`
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  let startDow = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  return cells
}

// Tiny SVG sparkline
function Sparkline({ data, color }) {
  const max = Math.max(...data, 1)
  const w = 120, h = 24
  const step = w / (data.length - 1 || 1)
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} className="sparkline-svg" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {data[data.length - 1] > 0 && (
        <circle cx={(data.length - 1) * step} cy={h - (data[data.length - 1] / max) * (h - 4) - 2} r="2.5" fill={color} />
      )}
    </svg>
  )
}


export default function DashboardView({
  tasks, blocks, projects, habits,
  blockTaskLinks = [],
  glossaryItems,
  taskTemplates = [],
  taskSeries = [],
  onAddBlock, onEditBlock, onDeleteBlock, onCompleteBlock,
  onAddTask, onEditTask, onDeleteTask, onCompleteTask,
  onAddProject, onEditProject, onDeleteProject,
  mobileWeekFocus = false,
}) {
  const toast = useToast()
  const today = todayStr()
  const now = new Date()
  const [blockForm, setBlockForm] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  // Spacebar toggles expanded state, scroll-down expands
  useEffect(() => {
    function handleKey(e) {
      // Ignore if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        setExpanded(prev => {
          if (prev) window.scrollTo({ top: 0, behavior: 'smooth' })
          return !prev
        })
      }
    }
    function handleWheel(e) {
      if (!expanded && e.deltaY > 0) {
        setExpanded(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [expanded])
  const [quickAdd, setQuickAdd] = useState('')
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [habitLogs, setHabitLogs] = useState([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState(today)
  const [showWeatherPopup, setShowWeatherPopup] = useState(false)

  // ── Widget visibility ──
  const WIDGET_REGISTRY = [
    { key: 'week', name: 'This Week' },
    { key: 'calendar', name: 'Calendar' },
    { key: 'projects', name: 'Projects' },
    { key: 'notes', name: 'Notes' },
    { key: 'not_to_do', name: 'Not To Do' },
    { key: 'timer', name: 'Timer' },
    { key: 'ai_chat', name: 'Assistant' },
    { key: 'inspiration', name: 'Inspiration' },
  ]
  const ALL_WIDGET_KEYS = WIDGET_REGISTRY.map(w => w.key)
  const [enabledWidgets, setEnabledWidgets] = useState(() => {
    try {
      const stored = localStorage.getItem('dashboard_widgets')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed.filter(k => ALL_WIDGET_KEYS.includes(k))
      }
    } catch {}
    return ALL_WIDGET_KEYS
  })
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const toggleWidget = (key) => {
    setEnabledWidgets(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem('dashboard_widgets', JSON.stringify(next))
      return next
    })
  }

  // Widget ordering (drag-to-reorder)
  const DEFAULT_WIDGET_ORDER = ['week', 'calendar', 'projects', 'notes', 'not_to_do', 'timer', 'ai_chat', 'inspiration']
  const [widgetOrder, setWidgetOrder] = useState(() => {
    try {
      const stored = localStorage.getItem('dashboard_widget_order')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(k => ALL_WIDGET_KEYS.includes(k))
          const missing = ALL_WIDGET_KEYS.filter(k => !filtered.includes(k))
          return [...filtered, ...missing]
        }
      }
    } catch {}
    return DEFAULT_WIDGET_ORDER
  })

  const widgetSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const handleWidgetDragEnd = useCallback((event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setWidgetOrder(prev => {
      const oldIdx = prev.indexOf(active.id)
      const newIdx = prev.indexOf(over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      const next = arrayMove(prev, oldIdx, newIdx)
      localStorage.setItem('dashboard_widget_order', JSON.stringify(next))
      return next
    })
  }, [])

  // Fixed alternating 2:1 / 1:2 ratio — two widgets per row on a 3-col grid
  const widgetSpans = useMemo(() => {
    const enabled = widgetOrder.filter(k => enabledWidgets.includes(k))
    const spans = {}
    for (let i = 0; i < enabled.length; i += 2) {
      const a = enabled[i]
      const b = enabled[i + 1]
      const rowIdx = i / 2
      if (!b) { spans[a] = 3; continue }
      if (rowIdx % 2 === 0) { spans[a] = 2; spans[b] = 1 }
      else { spans[a] = 1; spans[b] = 2 }
    }
    return spans
  }, [enabledWidgets, widgetOrder])


  // Weather glance for hero — refresh every 30 minutes
  const [weatherGlance, setWeatherGlance] = useState(null)
  useEffect(() => {
    const load = () => fetchWeather().then(data => setWeatherGlance(data)).catch(() => {})
    load()
    const id = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Live clock
  const [clockTime, setClockTime] = useState(new Date())
  useEffect(() => {
    const tick = setInterval(() => setClockTime(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])
  const timeStr = clockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  // ── Moon phase ──
  const moonPhase = useMemo(() => getMoonPhase(), [])


  // ── Pomodoro focus timer ──
  const [pomoWorkMin, setPomoWorkMin] = useState(() => Number(localStorage.getItem('pomo_work_min')) || 25)
  const [pomoBreakMin, setPomoBreakMin] = useState(() => Number(localStorage.getItem('pomo_break_min')) || 5)
  useEffect(() => { localStorage.setItem('pomo_work_min', String(pomoWorkMin)) }, [pomoWorkMin])
  useEffect(() => { localStorage.setItem('pomo_break_min', String(pomoBreakMin)) }, [pomoBreakMin])
  const POMO_WORK = pomoWorkMin * 60
  const POMO_BREAK = pomoBreakMin * 60
  const [pomoSeconds, setPomoSeconds] = useState(POMO_WORK)
  const [pomoRunning, setPomoRunning] = useState(false)
  const [pomoOnBreak, setPomoOnBreak] = useState(false)
  const [editingPomoTimes, setEditingPomoTimes] = useState(false)
  const pomoRef = useRef(null)

  useEffect(() => {
    if (pomoRunning) {
      document.body.classList.add('pomo-focus-active')
      pomoRef.current = setInterval(() => {
        setPomoSeconds(prev => {
          if (prev <= 1) {
            // Auto-switch phase and continue running
            setPomoOnBreak(ob => {
              const next = !ob
              setPomoSeconds(next ? POMO_BREAK : POMO_WORK)
              return next
            })
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      document.body.classList.remove('pomo-focus-active')
      if (pomoRef.current) clearInterval(pomoRef.current)
    }
    return () => { if (pomoRef.current) clearInterval(pomoRef.current) }
  }, [pomoRunning, POMO_WORK, POMO_BREAK])

  // If user edits durations while idle (not running) and not currently in a session, reflect new work time
  useEffect(() => {
    if (!pomoRunning && !pomoOnBreak && pomoSeconds !== POMO_WORK) {
      // Only reset to new work time if the current value matches any previous full work state (i.e., not mid-session)
      // Simpler: when editing opens, we keep display synced
    }
  }, [POMO_WORK])

  const pomoDisplay = `${Math.floor(pomoSeconds / 60)}:${String(pomoSeconds % 60).padStart(2, '0')}`
  const pomoTotal = pomoOnBreak ? POMO_BREAK : POMO_WORK
  const pomoPct = ((pomoTotal - pomoSeconds) / pomoTotal) * 100

  // ── Timer card state (mode: pomo | stopwatch | clock | countdown) ──
  const [timerMode, setTimerMode] = useState(() => localStorage.getItem('timer_mode') || 'pomo')
  useEffect(() => { localStorage.setItem('timer_mode', timerMode) }, [timerMode])

  // Stopwatch
  const [swSeconds, setSwSeconds] = useState(0)
  const [swRunning, setSwRunning] = useState(false)
  const swRef = useRef(null)
  useEffect(() => {
    if (swRunning) {
      swRef.current = setInterval(() => setSwSeconds(s => s + 1), 1000)
    } else if (swRef.current) { clearInterval(swRef.current); swRef.current = null }
    return () => { if (swRef.current) clearInterval(swRef.current) }
  }, [swRunning])
  const swDisplay = `${String(Math.floor(swSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((swSeconds % 3600) / 60)).padStart(2, '0')}:${String(swSeconds % 60).padStart(2, '0')}`

  // Countdown (user-set minutes)
  const [cdInput, setCdInput] = useState(10)
  const [cdSeconds, setCdSeconds] = useState(0)
  const [cdRunning, setCdRunning] = useState(false)
  const cdRef = useRef(null)
  useEffect(() => {
    if (cdRunning) {
      cdRef.current = setInterval(() => {
        setCdSeconds(s => {
          if (s <= 1) { clearInterval(cdRef.current); setCdRunning(false); return 0 }
          return s - 1
        })
      }, 1000)
    } else if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null }
    return () => { if (cdRef.current) clearInterval(cdRef.current) }
  }, [cdRunning])
  const cdDisplay = `${String(Math.floor(cdSeconds / 60)).padStart(2, '0')}:${String(cdSeconds % 60).padStart(2, '0')}`

  // ── Drag-to-reorder blocks ──
  const blockSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )
  const [dragActiveBlock, setDragActiveBlock] = useState(null)

  // Notes state
  const [notes, setNotes] = useState([])
  const [noteInput, setNoteInput] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [notToDos, setNotToDos] = useState([])
  const [notToDoInput, setNotToDoInput] = useState('')
  const [editingNotToDo, setEditingNotToDo] = useState(null)
  const [editingNotToDoText, setEditingNotToDoText] = useState('')
  const [dailyInspiration, setDailyInspiration] = useState({ quote: null, tip: null })
  const [favoriteIds, setFavoriteIds] = useState(new Set())
  const [favorites, setFavorites] = useState([])
  const [showFavorites, setShowFavorites] = useState(false)

  // Fetch habit logs
  useEffect(() => {
    async function fetchLogs() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data } = await supabase
        .from('habit_logs')
        .select('habit_id, logged_at')
        .gte('logged_at', since.toISOString())
      if (data) setHabitLogs(data)
    }
    fetchLogs()
  }, [])

  // Fetch notes
  useEffect(() => {
    async function fetchNotes() {
      const { data } = await supabase
        .from('planner_notes')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setNotes(data)
    }
    fetchNotes()
  }, [])

  // Fetch not-to-dos
  useEffect(() => {
    async function fetchNotToDos() {
      const { data } = await supabase
        .from('planner_not_to_dos')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) setNotToDos(data)
    }
    fetchNotToDos()
  }, [])

  // Fetch daily inspiration (one random quote + one random tip)
  useEffect(() => {
    async function fetchInspiration() {
      const { data, error } = await supabase
        .from('daily_inspiration')
        .select('*')
      if (error) { console.error('Inspiration fetch error:', error); return }
      if (!data || data.length === 0) return

      const quotes = data.filter(d => d.type === 'quote')
      const tips = data.filter(d => d.type === 'tip')

      // Pick a deterministic daily random using the date as seed
      const dayNum = new Date().getDate() + (new Date().getMonth() + 1) * 31
      const pick = (arr) => arr.length > 0 ? arr[dayNum % arr.length] : null
      setDailyInspiration({ quote: pick(quotes), tip: pick(tips) })
    }
    fetchInspiration()
  }, [])

  // Fetch favorites
  const loadFavorites = useCallback(async () => {
    const { data } = await supabase
      .from('favorite_tips')
      .select('inspiration_id, type, daily_inspiration(content, author)')
      .order('created_at', { ascending: false })
    if (data) {
      setFavoriteIds(new Set(data.map(d => d.inspiration_id)))
      setFavorites(data)
    }
  }, [])

  useEffect(() => { loadFavorites() }, [loadFavorites])

  const toggleFavorite = useCallback(async (item) => {
    const isFav = favoriteIds.has(item.id)
    if (isFav) {
      await supabase.from('favorite_tips').delete().eq('inspiration_id', item.id)
      setFavoriteIds(prev => { const next = new Set(prev); next.delete(item.id); return next })
      setFavorites(prev => prev.filter(f => f.inspiration_id !== item.id))
    } else {
      await supabase.from('favorite_tips').insert({ inspiration_id: item.id, type: item.type })
      setFavoriteIds(prev => new Set(prev).add(item.id))
      setFavorites(prev => [{ inspiration_id: item.id, type: item.type, daily_inspiration: { content: item.content, author: item.author } }, ...prev])
    }
  }, [favoriteIds])

  // Notes CRUD
  const addNote = useCallback(async () => {
    if (!noteInput.trim()) return
    try {
      const { data, error } = await supabase
        .from('planner_notes')
        .insert({ content: noteInput.trim() })
        .select().single()
      if (error) { toast.error('Failed to add note'); return }
      setNotes(prev => [data, ...prev])
      setNoteInput('')
    } catch { toast.error('Network error') }
  }, [noteInput, toast])

  const updateNote = useCallback(async (id) => {
    if (!editingText.trim()) return
    try {
      const { data, error } = await supabase
        .from('planner_notes')
        .update({ content: editingText.trim(), updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) { toast.error('Failed to update note'); return }
      setNotes(prev => prev.map(n => n.id === id ? data : n))
      setEditingNote(null)
      setEditingText('')
    } catch { toast.error('Network error') }
  }, [editingText, toast])

  const deleteNote = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_notes').delete().eq('id', id)
      if (error) { toast.error('Failed to delete note'); return }
      setNotes(prev => prev.filter(n => n.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

  // Not To Do CRUD
  const addNotToDo = useCallback(async () => {
    if (!notToDoInput.trim()) return
    try {
      const { data, error } = await supabase
        .from('planner_not_to_dos')
        .insert({ content: notToDoInput.trim() })
        .select().single()
      if (error) { toast.error('Failed to add item'); return }
      setNotToDos(prev => [data, ...prev])
      setNotToDoInput('')
    } catch { toast.error('Network error') }
  }, [notToDoInput, toast])

  const updateNotToDo = useCallback(async (id) => {
    if (!editingNotToDoText.trim()) return
    try {
      const { data, error } = await supabase
        .from('planner_not_to_dos')
        .update({ content: editingNotToDoText.trim(), updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) { toast.error('Failed to update item'); return }
      setNotToDos(prev => prev.map(n => n.id === id ? data : n))
      setEditingNotToDo(null)
      setEditingNotToDoText('')
    } catch { toast.error('Network error') }
  }, [editingNotToDoText, toast])

  const deleteNotToDo = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_not_to_dos').delete().eq('id', id)
      if (error) { toast.error('Failed to delete item'); return }
      setNotToDos(prev => prev.filter(n => n.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

  // ── Today's data ──
  const todayBlocks = useMemo(
    () => blocks.filter(b => b.date === today).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.start_time || '99:99').localeCompare(b.start_time || '99:99')),
    [blocks, today]
  )

  // Lookup: block_id → [task objects] (sorted by link sort_order)
  const tasksByBlock = useMemo(() => {
    const map = {}
    blockTaskLinks.forEach(link => {
      if (!map[link.block_id]) map[link.block_id] = []
      const task = tasks.find(t => t.id === link.task_id)
      if (task) map[link.block_id].push({ ...task, _linkOrder: link.sort_order })
    })
    Object.keys(map).forEach(k => map[k].sort((a, b) => (a._linkOrder || 0) - (b._linkOrder || 0)))
    return map
  }, [blockTaskLinks, tasks])

  const handleBlockDragEnd = useCallback(async (event) => {
    setDragActiveBlock(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = todayBlocks.findIndex(b => b.id === active.id)
    const newIdx = todayBlocks.findIndex(b => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(todayBlocks, oldIdx, newIdx)
    // Optimistic update via onEditBlock
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sort_order !== i) {
        onEditBlock(reordered[i].id, { sort_order: i })
      }
    }
  }, [todayBlocks, onEditBlock])
  const linkedTaskIdSet = useMemo(
    () => new Set(blockTaskLinks.map(l => l.task_id)),
    [blockTaskLinks]
  )
  const todayTasks = useMemo(
    () => tasks.filter(t => t.due_date === today && t.status !== 'done' && !linkedTaskIdSet.has(t.id))
      .sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority] }),
    [tasks, today, linkedTaskIdSet]
  )
  const doneTasks = useMemo(
    () => tasks.filter(t => t.due_date === today && t.status === 'done' && !linkedTaskIdSet.has(t.id)),
    [tasks, today, linkedTaskIdSet]
  )

  // ── Week data ──
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // ── Weather by date lookup ──
  const weatherByDate = useMemo(() => {
    if (!weatherGlance?.days) return {}
    const map = {}
    weatherGlance.days.forEach(d => { map[d.date] = d })
    return map
  }, [weatherGlance])

  // ── Selected day data (for week detail) ──
  const selectedBlocks = useMemo(
    () => blocks.filter(b => b.date === selectedDay).sort((a, b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99')),
    [blocks, selectedDay]
  )
  const selectedTasks = useMemo(
    () => tasks.filter(t => t.due_date === selectedDay && t.status !== 'done' && !linkedTaskIdSet.has(t.id))
      .sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority] }),
    [tasks, selectedDay, linkedTaskIdSet]
  )

  // ── Next-up block with live countdown ──
  const [nowTime, setNowTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setNowTime(new Date()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const nextUpBlock = useMemo(() => {
    const currentTime = nowTime.toTimeString().slice(0, 5)
    const timedBlocks = todayBlocks.filter(b => b.start_time && b.end_time)
    // Find the block currently in progress
    const activeBlock = timedBlocks.find(b =>
      b.start_time.slice(0, 5) <= currentTime && b.end_time.slice(0, 5) > currentTime
    )
    // Find the next upcoming block
    const upcoming = timedBlocks.find(b => b.start_time.slice(0, 5) > currentTime)
    return { active: activeBlock || null, next: upcoming || null }
  }, [todayBlocks, nowTime])

  const nextUpHint = useMemo(() => {
    const block = nextUpBlock.next
    if (!block) return null
    const [h, m] = block.start_time.split(':').map(Number)
    const blockStart = new Date(nowTime)
    blockStart.setHours(h, m, 0, 0)
    const diffMs = blockStart - nowTime
    if (diffMs <= 0) return null
    const diffMin = Math.round(diffMs / 60_000)
    if (diffMin < 60) return `in ${diffMin} min`
    const hrs = Math.floor(diffMin / 60)
    const mins = diffMin % 60
    return mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`
  }, [nextUpBlock.next, nowTime])

  const activeTimeLeft = useMemo(() => {
    const block = nextUpBlock.active
    if (!block) return null
    const [h, m] = block.end_time.split(':').map(Number)
    const blockEnd = new Date(nowTime)
    blockEnd.setHours(h, m, 0, 0)
    const diffMs = blockEnd - nowTime
    if (diffMs <= 0) return null
    const diffMin = Math.round(diffMs / 60_000)
    if (diffMin < 60) return `${diffMin} min left`
    const hrs = Math.floor(diffMin / 60)
    const mins = diffMin % 60
    return mins > 0 ? `${hrs}h ${mins}m left` : `${hrs}h left`
  }, [nextUpBlock.active, nowTime])

  // ── Calendar data ──
  const calCells = useMemo(() => getMonthGrid(calYear, calMonth), [calYear, calMonth])
  const calBlocksByDay = useMemo(() => {
    const map = {}
    blocks.forEach(b => {
      const d = new Date(b.date + 'T00:00:00')
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(b)
      }
    })
    return map
  }, [blocks, calYear, calMonth])

  // ── Habit sparkline data ──
  const habitSparkData = useMemo(() => {
    const result = {}
    const todayDate = new Date()
    habits.forEach(h => {
      const daily = Array(30).fill(0)
      let monthCount = 0
      const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
      habitLogs.filter(l => l.habit_id === h.id).forEach(l => {
        const ld = new Date(l.logged_at)
        const daysAgo = Math.floor((todayDate - ld) / (1000 * 60 * 60 * 24))
        if (daysAgo >= 0 && daysAgo < 30) daily[29 - daysAgo]++
        if (ld >= monthStart) monthCount++
      })
      result[h.id] = { daily, monthCount }
    })
    return result
  }, [habits, habitLogs])

  // ── Handlers ──
  async function handleQuickAdd(e) {
    if (e.key === 'Enter' && quickAdd.trim()) {
      await onAddTask({ title: quickAdd.trim(), due_date: today, priority: 'medium', status: 'todo' })
      setQuickAdd('')
    }
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }
  function goToday() { setCalMonth(now.getMonth()); setCalYear(now.getFullYear()) }

  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${MONTHS_FULL[now.getMonth()]} ${now.getDate()}`

  return (
    <div className={`dash ${expanded ? 'dash-expanded' : 'dash-focused'} ${mobileWeekFocus ? 'dash-mobile-week-focus' : ''}`}>
      {/* ══ Row 1 — Today's Focus (full-width hero banner) ══ */}
      <div className="dash-card dash-today">
        <div className="dash-card-header">
          <div>
            <h2 className="dash-card-title"><span className="dash-title-desktop">{dateLabel}</span><span className="dash-title-mobile">{`${DAY_NAMES[now.getDay()]}, ${MONTHS_FULL[now.getMonth()].slice(0, 3)} ${now.getDate()}`}</span></h2>
            <p className="dash-date-label"><span className="dash-date-mobile">{todayTasks.length + doneTasks.length} task{todayTasks.length + doneTasks.length !== 1 ? 's' : ''} · {todayBlocks.length} block{todayBlocks.length !== 1 ? 's' : ''}</span></p>
          </div>
          <div className="dash-header-right-mobile">
            <span className="dash-mobile-time">{timeStr}</span>
            {weatherGlance && <span className="dash-mobile-weather">{Math.round(weatherGlance.current_temp_f)}° {parseCondition(weatherGlance.current_code)}</span>}
          </div>
          <div className="dash-today-actions">
            <button className="add-btn dash-block-btn" onClick={() => setBlockForm({ date: today })}>+ Block</button>
            <button className="add-btn" onClick={() => setTaskForm({})}>+ Task</button>
          </div>
        </div>

        <div className="dash-today-body">
          <div className="dash-timeline">
            <p className="dash-sublabel">Schedule</p>
            {todayBlocks.length === 0 ? (
              <p className="empty-msg" style={{ padding: '12px 0' }}>No blocks today</p>
            ) : (
              <DndContext sensors={blockSensors} collisionDetection={closestCenter} onDragStart={e => setDragActiveBlock(todayBlocks.find(b => b.id === e.active.id) || null)} onDragEnd={handleBlockDragEnd}>
                <SortableContext items={todayBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="dash-timeline-list">
                    {todayBlocks.map(block => (
                      <SortableBlock
                        key={block.id}
                        block={block}
                        isActive={nextUpBlock.active && nextUpBlock.active.id === block.id}
                        onEdit={setBlockForm}
                        onComplete={onCompleteBlock}
                        onDelete={onDeleteBlock}
                        today={today}
                        linkedTasks={tasksByBlock[block.id] || []}
                        onCompleteTask={onCompleteTask}
                        onEditTask={(t) => setTaskForm({ task: t })}
                        onDeleteTask={onDeleteTask}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {dragActiveBlock && (
                    <div className="dash-tl-drag-overlay">
                      <span className="dash-tl-drag-handle">⠿</span>
                      {dragActiveBlock.start_time && dragActiveBlock.end_time
                        ? <span className="dash-tl-time">{dragActiveBlock.start_time.slice(0, 5)} – {dragActiveBlock.end_time.slice(0, 5)}</span>
                        : <span className="dash-tl-time">N/A</span>}
                      <span className="dash-tl-title">{dragActiveBlock.title}</span>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          <div className="dash-tasks">
            <p className="dash-sublabel">
              Tasks {todayTasks.length > 0 && <span className="count-badge">{todayTasks.length}</span>}
            </p>
            {todayTasks.length === 0 && doneTasks.length === 0 && (
              <p className="empty-msg" style={{ padding: '12px 0' }}>No tasks due today</p>
            )}
            <ul className="task-list">
              {todayTasks.map(task => {
                const isTaskExpanded = expandedTaskId === task.id
                const hasNotes = !!(task.notes && task.notes.trim())
                return (
                  <li key={task.id} className={`task-row compact ${isTaskExpanded ? 'expanded' : ''}`}>
                    <button className="task-check small" onClick={() => onCompleteTask(task)} aria-label="Complete task" />
                    <div className="task-info" onClick={() => setExpandedTaskId(isTaskExpanded ? null : task.id)} style={{ cursor: 'pointer' }}>
                      <p className="task-title">
                        {task.title}
                        {hasNotes && <span className="task-notes-indicator" aria-label="Has notes">📝</span>}
                      </p>
                      {isTaskExpanded && hasNotes && (
                        <p className="task-notes-expanded">{task.notes}</p>
                      )}
                    </div>
                    {task.due_time && <span className="task-time">{task.due_time.slice(0, 5)}</span>}
                    <span className="priority-dot" style={{ background: priorityColor(task.priority) }} />
                    <div className="task-actions">
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); setTaskForm({ task }) }} aria-label="Edit task">✏️</button>
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); onDeleteTask(task.id) }} aria-label="Delete task">🗑</button>
                    </div>
                  </li>
                )
              })}
              {doneTasks.map(task => (
                <li key={task.id} className="task-row compact done">
                  <span className="task-check small done">✓</span>
                  <p className="task-title done-title">{task.title}</p>
                  <div className="task-actions">
                    <button className="icon-btn" onClick={() => setTaskForm({ task })} aria-label="Edit task">✏️</button>
                    <button className="icon-btn" onClick={() => onDeleteTask(task.id)} aria-label="Delete task">🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="dash-hero-right">
            {/* Weather & Time glance */}
            <div className="dash-glance">
              <div className="dash-glance-time">{timeStr}</div>
              {weatherGlance && (
                <div className="dash-glance-weather">
                  <span className="dash-glance-emoji">{weatherEmoji(weatherGlance.current_code)}</span>
                  <span className="dash-glance-temp">{Math.round(weatherGlance.current_temp_f)}°</span>
                  <span className="dash-glance-cond">{parseCondition(weatherGlance.current_code)}</span>
                  {weatherByDate[today] && (
                    <span className="dash-glance-hilo">H: {Math.round(weatherByDate[today].temp_high_f)}° L: {Math.round(weatherByDate[today].temp_low_f)}°</span>
                  )}
                </div>
              )}
              <div className="dash-glance-moon">
                <span className="dash-glance-moon-icon">{moonPhase.icon}</span>
                <span>{moonPhase.name}</span>
              </div>
            </div>

            {/* Next Up */}
            <div className="dash-next-up">
              <p className="dash-next-up-label">Next Up</p>
              {nextUpBlock.active && (
                <div className="dash-next-up-active">
                  <div className="dash-next-up-pulse" />
                  <div>
                    <p className="dash-next-up-title">{nextUpBlock.active.title}</p>
                    <p className="dash-next-up-time">{activeTimeLeft}</p>
                  </div>
                </div>
              )}
              {nextUpBlock.next ? (
                <div className="dash-next-up-upcoming">
                  <p className="dash-next-up-title">{nextUpBlock.next.title}</p>
                  <p className="dash-next-up-time">
                    {nextUpBlock.next.start_time.slice(0, 5)} — {nextUpHint}
                  </p>
                </div>
              ) : !nextUpBlock.active ? (
                <p className="dash-next-up-empty">Nothing else today</p>
              ) : null}
            </div>

            {/* Mobile-only: time & weather card (replaces pomo on mobile) */}
            <div className="dash-mobile-glance">
              <div className="dash-mobile-glance-time">{timeStr}</div>
              {weatherGlance && (
                <div className="dash-mobile-glance-wx">
                  <span>{weatherEmoji(weatherGlance.current_code)}</span>
                  <span>{Math.round(weatherGlance.current_temp_f)}° {parseCondition(weatherGlance.current_code)}</span>
                </div>
              )}
              {weatherByDate[today] && (
                <div className="dash-mobile-glance-hilo">
                  H: {Math.round(weatherByDate[today].temp_high_f)}° L: {Math.round(weatherByDate[today].temp_low_f)}°
                </div>
              )}
              <div className="dash-mobile-glance-moon">
                {moonPhase.icon} {moonPhase.name}
              </div>
            </div>
          </div>
        </div>

        <div className="dash-quick-add">
          <input
            className="input"
            placeholder="Quick add task... (Enter)"
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={handleQuickAdd}
          />
        </div>
      </div>

      {/* ══ Expandable content ══ */}
      <div className="dash-rest">

      {/* Widget picker gear */}
      <div className="dash-widget-picker-wrap">
        <button className="dash-widget-gear" onClick={() => setShowWidgetPicker(v => !v)} aria-label="Customize widgets" title="Customize widgets">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        {showWidgetPicker && (
          <div className="dash-widget-picker">
            {WIDGET_REGISTRY.map(w => (
              <button
                key={w.key}
                className={`dash-widget-chip ${enabledWidgets.includes(w.key) ? 'active' : ''}`}
                onClick={() => toggleWidget(w.key)}
              >
                {enabledWidgets.includes(w.key) && <span className="dash-widget-check">✓</span>}
                {w.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ Row 2 — This Week (left) | Calendar (right) ══ */}
      <DndContext sensors={widgetSensors} collisionDetection={closestCenter} onDragEnd={handleWidgetDragEnd}>
        <SortableContext items={widgetOrder.filter(k => enabledWidgets.includes(k))} strategy={rectSortingStrategy}>
      {enabledWidgets.includes('week') && <SortableCard id="week" span={widgetSpans.week} order={widgetOrder.indexOf('week')} className="dash-week">
        <div className="dash-week-header">
          <div className="dash-week-header-left">
            <h2 className="dash-card-title">This Week</h2>
            <div className="dash-wx-btn-wrap">
              <button
                className={`dash-wx-btn ${showWeatherPopup ? 'active' : ''}`}
                onClick={() => setShowWeatherPopup(v => !v)}
                aria-label="Weather"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              </button>
              {showWeatherPopup && (
                <>
                  <div className="dash-wx-backdrop" onClick={() => setShowWeatherPopup(false)} />
                  <div className="dash-wx-popup">
                    <WeatherWidget supabase={supabase} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="dash-week-nav">
            {weekOffset !== 0 && (
              <button className="add-btn" onClick={() => { setWeekOffset(0); setSelectedDay(today) }}>Today</button>
            )}
            <button className="nav-btn" onClick={() => setWeekOffset(o => o - 1)} aria-label="Previous week">&#8249;</button>
            <span className="dash-week-range">{weekLabel(weekDays)}</span>
            <button className="nav-btn" onClick={() => setWeekOffset(o => o + 1)} aria-label="Next week">&#8250;</button>
          </div>
        </div>
        <div className="dash-week-grid">
          {weekDays.map((day, i) => {
            const ds = toDateStr(day)
            const dayBlocks = blocks.filter(b => b.date === ds)
            const isToday = ds === today
            const isSelected = ds === selectedDay
            const wx = weatherByDate[ds]
            return (
              <div
                key={ds}
                className={`dash-week-day ${isToday ? 'dash-week-today' : ''} ${isSelected ? 'dash-week-selected' : ''}`}
                onClick={() => setSelectedDay(ds)}
              >
                <span className="dash-week-name">{WEEK_HEADERS[i]}</span>
                <span className={`dash-week-num ${isToday ? 'accent' : ''}`}>{day.getDate()}</span>
                {wx && (
                  <>
                    <span className="dash-week-wx-icon">{weatherEmoji(wx.weathercode)}</span>
                    <span className="dash-week-wx-temps">
                      {Math.round(wx.temp_high_f)}° / {Math.round(wx.temp_low_f)}°
                    </span>
                  </>
                )}
                <div className="dash-week-chips">
                  {dayBlocks.slice(0, 4).map(b => (
                    <div key={b.id} className="dash-week-chip" style={{ background: 'var(--block-bg)' }} title={b.title} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected day detail */}
        <div className="dash-week-detail">
          <div className="dash-week-detail-header">
            <p className="dash-week-detail-label">
              {(() => {
                const d = new Date(selectedDay + 'T00:00:00')
                return `${DAY_NAMES[d.getDay()]}, ${MONTHS_FULL[d.getMonth()]} ${d.getDate()}`
              })()}
            </p>
            <div className="dash-today-actions">
              <button className="add-btn" onClick={() => setBlockForm({ date: selectedDay })}>+ Block</button>
              <button className="add-btn" onClick={() => setTaskForm({ prefillDate: selectedDay })}>+ Task</button>
            </div>
          </div>

          {/* Weather detail for selected day */}
          {weatherByDate[selectedDay] && (() => {
            const wx = weatherByDate[selectedDay]
            const isCurrentDay = selectedDay === today
            return (
              <div className="dash-week-wx-detail">
                <div className="dash-week-wx-main">
                  <span className="dash-week-wx-emoji">{weatherEmoji(wx.weathercode)}</span>
                  <span className="dash-week-wx-temp-lg">
                    {isCurrentDay && weatherGlance ? Math.round(weatherGlance.current_temp_f) : Math.round(wx.temp_high_f)}°
                  </span>
                  <span className="dash-week-wx-cond">{parseCondition(wx.weathercode)}</span>
                </div>
                <div className="dash-week-wx-stats">
                  <span className="dash-week-wx-stat">H: {Math.round(wx.temp_high_f)}°</span>
                  <span className="dash-week-wx-stat">L: {Math.round(wx.temp_low_f)}°</span>
                  <span className="dash-week-wx-stat">{wx.precipitation_in}" rain</span>
                  <span className="dash-week-wx-stat">{Math.round(wx.wind_speed_mph)} mph</span>
                  {wx.humidity != null && <span className="dash-week-wx-stat">{Math.round(wx.humidity)}% hum</span>}
                  <span className="dash-week-wx-stat">UV {Math.round(wx.uv_index)}</span>
                </div>
              </div>
            )
          })()}

          {/* Schedule + Tasks side by side */}
          <div className="dash-week-detail-row">
            <div className="dash-week-detail-schedule">
              {selectedBlocks.length === 0 ? (
                <p className="empty-msg">No blocks</p>
              ) : (
                <div className="dash-week-detail-list">
                  {selectedBlocks.map(block => {
                    const bTasks = tasksByBlock[block.id] || []
                    return (
                      <div
                        key={block.id}
                        className={`dash-tl-block ${block.completed ? 'dash-tl-done' : ''}`}
                        style={{ background: 'var(--accent-dim)' }}
                      >
                        <div className="dash-tl-row" onClick={() => setBlockForm({ block, date: selectedDay })}>
                          <button
                            className={`task-check small ${block.completed ? 'done' : ''}`}
                            onClick={e => { e.stopPropagation(); onCompleteBlock(block) }}
                            aria-label={block.completed ? 'Uncheck block' : 'Complete block'}
                          >{block.completed ? '✓' : ''}</button>
                          {block.start_time && block.end_time
                            ? <span className="dash-tl-time">{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</span>
                            : <span className="dash-tl-time">N/A</span>}
                          <span className="dash-tl-title">{block.title}</span>
                          {bTasks.length > 0 && (
                            <span className="dash-tl-task-count">{bTasks.filter(t => t.status === 'done').length}/{bTasks.length}</span>
                          )}
                          <button className="dash-tl-delete" onClick={e => { e.stopPropagation(); onDeleteBlock(block.id) }} aria-label="Delete block">✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="dash-week-detail-tasks">
              {selectedTasks.length === 0 ? (
                <p className="empty-msg">No tasks</p>
              ) : (
                <div className="dash-week-detail-list">
                  {selectedTasks.map(task => (
                    <div key={task.id} className="dash-week-detail-task">
                      <span className="priority-dot" style={{ background: priorityColor(task.priority) }} />
                      <span className="dash-tl-title">{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SortableCard>}

      {/* Calendar (replaces Habit Streaks) */}
      {enabledWidgets.includes('calendar') && <SortableCard id="calendar" span={widgetSpans.calendar} order={widgetOrder.indexOf('calendar')} className="dash-calendar">
        <div className="dash-cal-header">
          <h2 className="dash-card-title">{MONTHS_FULL[calMonth]} {calYear}</h2>
          <div className="dash-cal-nav">
            {(calMonth !== now.getMonth() || calYear !== now.getFullYear()) && (
              <button className="add-btn" onClick={goToday}>Today</button>
            )}
            <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
            <button className="nav-btn" onClick={nextMonth} aria-label="Next month">&#8250;</button>
          </div>
        </div>
        <div className="dash-cal-grid">
          {WEEK_HEADERS.map(d => (
            <div key={d} className="dash-cal-dow">{d}</div>
          ))}
          {calCells.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} className="dash-cal-cell dash-cal-blank" />
            const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayBlocks = calBlocksByDay[day] || []
            const isToday = ds === today
            return (
              <div
                key={ds}
                className={`dash-cal-cell ${isToday ? 'dash-cal-today' : ''} ${dayBlocks.length > 0 ? 'dash-cal-has' : ''}`}
                onClick={() => {
                  if (dayBlocks.length === 1) setBlockForm({ block: dayBlocks[0], date: ds })
                  else setBlockForm({ date: ds })
                }}
              >
                <span className="dash-cal-num">{day}</span>
                {dayBlocks.length > 0 && (
                  <div className="dash-cal-dots">
                    {dayBlocks.slice(0, 4).map(b => (
                      <span key={b.id} className="dash-cal-dot" style={{ background: 'var(--block-bg)' }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SortableCard>}

      {enabledWidgets.includes('projects') && <SortableCard id="projects" span={widgetSpans.projects} order={widgetOrder.indexOf('projects')} className="dash-projects-card">
        <h2 className="dash-card-title">Projects</h2>
        <div className="dash-projects-body">
          <ProjectsView
            projects={projects} tasks={tasks} habits={habits}
            onAddProject={onAddProject} onEditProject={onEditProject} onDeleteProject={onDeleteProject}
            onAddTask={onAddTask} onEditTask={onEditTask} onDeleteTask={onDeleteTask} onCompleteTask={onCompleteTask}
          />
        </div>
      </SortableCard>}

      {enabledWidgets.includes('notes') && <SortableCard id="notes" span={widgetSpans.notes} order={widgetOrder.indexOf('notes')} className="dash-notes">
        <h2 className="dash-card-title">Notes</h2>
        <div className="dash-notes-add">
          <input
            className="input"
            placeholder="Add a note…"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNote() }}
            maxLength={1000}
          />
          <button className="add-btn" onClick={addNote} disabled={!noteInput.trim()}>+</button>
        </div>
        <div className="dash-notes-list">
          {notes.length === 0 && (
            <p className="empty-msg" style={{ padding: '12px 0' }}>No notes yet</p>
          )}
          {notes.map(note => (
            <div key={note.id} className="dash-note-item">
              {editingNote === note.id ? (
                <div className="dash-note-edit">
                  <textarea
                    className="input textarea"
                    value={editingText}
                    onChange={e => setEditingText(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                  />
                  <div className="dash-note-edit-actions">
                    <button className="add-btn" onClick={() => updateNote(note.id)}>Save</button>
                    <button className="add-btn dash-note-cancel" onClick={() => { setEditingNote(null); setEditingText('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="dash-note-text">{note.content}</p>
                  <div className="dash-note-actions">
                    <button
                      className="icon-btn"
                      onClick={() => { setEditingNote(note.id); setEditingText(note.content) }}
                      aria-label="Edit note"
                    >✏️</button>
                    <button
                      className="icon-btn"
                      onClick={() => deleteNote(note.id)}
                      aria-label="Delete note"
                    >🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </SortableCard>}

      {enabledWidgets.includes('not_to_do') && <SortableCard id="not_to_do" span={widgetSpans.not_to_do} order={widgetOrder.indexOf('not_to_do')} className="dash-notodo">
        <h2 className="dash-card-title">Not To Do</h2>
        <div className="dash-notodo-add">
          <input
            className="input"
            placeholder="Add a bad habit to avoid…"
            value={notToDoInput}
            onChange={e => setNotToDoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNotToDo() }}
            maxLength={1000}
          />
          <button className="add-btn" onClick={addNotToDo} disabled={!notToDoInput.trim()}>+</button>
        </div>
        <div className="dash-notodo-list">
          {notToDos.length === 0 && (
            <p className="empty-msg" style={{ padding: '12px 0' }}>Nothing on the avoid list yet</p>
          )}
          {notToDos.map(item => (
            <div key={item.id} className="dash-notodo-item">
              {editingNotToDo === item.id ? (
                <div className="dash-notodo-edit">
                  <textarea
                    className="input textarea"
                    value={editingNotToDoText}
                    onChange={e => setEditingNotToDoText(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                  />
                  <div className="dash-notodo-edit-actions">
                    <button className="add-btn" onClick={() => updateNotToDo(item.id)}>Save</button>
                    <button className="add-btn dash-notodo-cancel" onClick={() => { setEditingNotToDo(null); setEditingNotToDoText('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="dash-notodo-text">{item.content}</p>
                  <div className="dash-notodo-actions">
                    <button
                      className="icon-btn"
                      onClick={() => { setEditingNotToDo(item.id); setEditingNotToDoText(item.content) }}
                      aria-label="Edit item"
                    >✏️</button>
                    <button
                      className="icon-btn"
                      onClick={() => deleteNotToDo(item.id)}
                      aria-label="Delete item"
                    >🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </SortableCard>}

      {enabledWidgets.includes('timer') && <SortableCard id="timer" span={widgetSpans.timer} order={widgetOrder.indexOf('timer')} className="dash-timer-card">
        <div className="dash-timer-head">
          <h2 className="dash-card-title">Timer</h2>
          <div className="dash-timer-tabs">
            {[
              { k: 'pomo', label: 'Pomo' },
              { k: 'stopwatch', label: 'Stopwatch' },
              { k: 'countdown', label: 'Countdown' },
              { k: 'clock', label: 'Clock' },
            ].map(t => (
              <button
                key={t.k}
                className={`dash-timer-tab${timerMode === t.k ? ' active' : ''}`}
                onClick={() => setTimerMode(t.k)}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {timerMode === 'pomo' && (
          <div className="dash-timer-body">
            <span className="dash-timer-sublabel">{pomoOnBreak ? 'Break' : 'Focus'}</span>
            <span className={`dash-timer-display${pomoOnBreak ? ' break' : ''}`}>{pomoDisplay}</span>
            <div className="dash-timer-controls">
              <button className={`pomo-btn${pomoRunning ? ' pomo-active' : ''}`} onClick={() => setPomoRunning(r => !r)}>
                {pomoRunning ? 'Pause' : 'Start'}
              </button>
              <button className="pomo-btn" onClick={() => { setPomoRunning(false); setPomoOnBreak(false); setPomoSeconds(POMO_WORK) }}>Reset</button>
              <button className="pomo-btn" onClick={() => setEditingPomoTimes(v => !v)} aria-label="Edit pomodoro durations" title="Edit durations">
                {editingPomoTimes ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingPomoTimes && (
              <div className="pomo-edit-row">
                <label className="pomo-edit-field">
                  <span>Focus</span>
                  <input
                    type="number" min={1} max={180}
                    value={pomoWorkMin}
                    onChange={e => {
                      const v = Math.max(1, Math.min(180, Number(e.target.value) || 1))
                      setPomoWorkMin(v)
                      if (!pomoRunning && !pomoOnBreak) setPomoSeconds(v * 60)
                    }}
                    className="input dash-timer-input"
                  />
                  <span className="pomo-edit-unit">min</span>
                </label>
                <label className="pomo-edit-field">
                  <span>Break</span>
                  <input
                    type="number" min={1} max={60}
                    value={pomoBreakMin}
                    onChange={e => {
                      const v = Math.max(1, Math.min(60, Number(e.target.value) || 1))
                      setPomoBreakMin(v)
                      if (!pomoRunning && pomoOnBreak) setPomoSeconds(v * 60)
                    }}
                    className="input dash-timer-input"
                  />
                  <span className="pomo-edit-unit">min</span>
                </label>
              </div>
            )}
            <div className="pomo-progress"><div className={`pomo-progress-bar${pomoOnBreak ? ' pomo-break' : ''}`} style={{ width: `${pomoPct}%` }} /></div>
          </div>
        )}

        {timerMode === 'stopwatch' && (
          <div className="dash-timer-body">
            <span className="dash-timer-sublabel">Elapsed</span>
            <span className="dash-timer-display">{swDisplay}</span>
            <div className="dash-timer-controls">
              <button className={`pomo-btn${swRunning ? ' pomo-active' : ''}`} onClick={() => setSwRunning(r => !r)}>
                {swRunning ? 'Pause' : 'Start'}
              </button>
              <button className="pomo-btn" onClick={() => { setSwRunning(false); setSwSeconds(0) }}>Reset</button>
            </div>
          </div>
        )}

        {timerMode === 'countdown' && (
          <div className="dash-timer-body">
            <span className="dash-timer-sublabel">Countdown</span>
            <span className="dash-timer-display">{cdDisplay}</span>
            {!cdRunning && cdSeconds === 0 && (
              <div className="dash-timer-controls">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={cdInput}
                  onChange={e => setCdInput(Math.max(1, Math.min(180, Number(e.target.value) || 0)))}
                  className="input dash-timer-input"
                />
                <span className="dash-timer-unit">min</span>
                <button className="pomo-btn pomo-active" onClick={() => { setCdSeconds(cdInput * 60); setCdRunning(true) }}>Start</button>
              </div>
            )}
            {(cdRunning || cdSeconds > 0) && (
              <div className="dash-timer-controls">
                <button className={`pomo-btn${cdRunning ? ' pomo-active' : ''}`} onClick={() => setCdRunning(r => !r)}>
                  {cdRunning ? 'Pause' : 'Resume'}
                </button>
                <button className="pomo-btn" onClick={() => { setCdRunning(false); setCdSeconds(0) }}>Reset</button>
              </div>
            )}
          </div>
        )}

        {timerMode === 'clock' && (
          <div className="dash-timer-body">
            <span className="dash-timer-sublabel">{DAY_NAMES[clockTime.getDay()]}, {MONTHS_FULL[clockTime.getMonth()]} {clockTime.getDate()}</span>
            <span className="dash-timer-display">{timeStr}</span>
            <span className="dash-timer-sublabel">{clockTime.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').slice(-1)[0]}</span>
          </div>
        )}
      </SortableCard>}

      {enabledWidgets.includes('ai_chat') && <SortableCard id="ai_chat" span={widgetSpans.ai_chat} order={widgetOrder.indexOf('ai_chat')} className="dash-ai-chat">
        <h2 className="dash-card-title">Assistant</h2>
        <AiChat todayBlocks={todayBlocks} todayTasks={[...todayTasks, ...doneTasks]} dateLabel={dateLabel} />
      </SortableCard>}

      {/* ── Daily Inspiration ── */}
      {enabledWidgets.includes('inspiration') && <SortableCard id="inspiration" span={widgetSpans.inspiration} order={widgetOrder.indexOf('inspiration')} className="dash-inspiration">
        <div className="dash-card-title-row">
          <h2 className="dash-card-title">Daily Inspiration</h2>
          <button className="inspiration-favs-btn" onClick={() => setShowFavorites(v => !v)}>&#9733; Favorites</button>
        </div>
        {showFavorites && (
          <div className="inspiration-favs-popup">
            <div className="inspiration-favs-popup-header">
              <span>Favorites</span>
              <button className="inspiration-favs-close" onClick={() => setShowFavorites(false)}>&times;</button>
            </div>
            {favorites.length === 0 && <p className="empty-msg">No favorites yet.</p>}
            {favorites.filter(f => f.type === 'tip').length > 0 && (
              <div className="favs-group">
                <span className="inspiration-label">Tips</span>
                {favorites.filter(f => f.type === 'tip').map(f => (
                  <p key={f.inspiration_id} className="inspiration-text">{f.daily_inspiration.content}</p>
                ))}
              </div>
            )}
            {favorites.filter(f => f.type === 'quote').length > 0 && (
              <div className="favs-group">
                <span className="inspiration-label">Quotes</span>
                {favorites.filter(f => f.type === 'quote').map(f => (
                  <blockquote key={f.inspiration_id} className="inspiration-quote">
                    "{f.daily_inspiration.content}"
                    {f.daily_inspiration.author && <cite className="inspiration-author">— {f.daily_inspiration.author}</cite>}
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="inspiration-content">
          {dailyInspiration.tip && (
            <div className="inspiration-section">
              <div className="inspiration-header">
                <span className="inspiration-label">Tip of the Day</span>
                <button className={`inspiration-fav${favoriteIds.has(dailyInspiration.tip.id) ? ' is-fav' : ''}`} onClick={() => toggleFavorite(dailyInspiration.tip)} title={favoriteIds.has(dailyInspiration.tip.id) ? 'Unfavorite' : 'Favorite'}>&#9733;</button>
              </div>
              <p className="inspiration-text">{dailyInspiration.tip.content}</p>
            </div>
          )}
          {dailyInspiration.quote && (
            <div className="inspiration-section">
              <div className="inspiration-header">
                <span className="inspiration-label">Quote of the Day</span>
                <button className={`inspiration-fav${favoriteIds.has(dailyInspiration.quote.id) ? ' is-fav' : ''}`} onClick={() => toggleFavorite(dailyInspiration.quote)} title={favoriteIds.has(dailyInspiration.quote.id) ? 'Unfavorite' : 'Favorite'}>&#9733;</button>
              </div>
              <blockquote className="inspiration-quote">
                "{dailyInspiration.quote.content}"
                {dailyInspiration.quote.author && (
                  <cite className="inspiration-author">— {dailyInspiration.quote.author}</cite>
                )}
              </blockquote>
            </div>
          )}
          {!dailyInspiration.tip && !dailyInspiration.quote && (
            <p className="empty-msg">No inspiration yet — add quotes and tips to the daily_inspiration table.</p>
          )}
        </div>
      </SortableCard>}

        </SortableContext>
      </DndContext>

      </div>{/* end dash-rest */}

      {/* ── Forms ── */}
      {blockForm !== null && (
        <BlockForm
          block={blockForm.block}
          date={blockForm.date}
          projects={projects}
          tasks={tasks}
          habits={habits}
          glossaryItems={glossaryItems}
          existingBlocks={blocks.filter(b => b.date === (blockForm.date || blockForm.block?.date))}
          linkedTaskIds={blockForm.block ? (tasksByBlock[blockForm.block.id] || []).map(t => t.id) : []}
          onSave={async (data) => { blockForm.block ? await onEditBlock(blockForm.block.id, data) : await onAddBlock(data); setBlockForm(null) }}
          onCancel={() => setBlockForm(null)}
        />
      )}
      {taskForm !== null && (
        <TaskForm
          task={taskForm.task}
          series={taskForm.task?.series_id ? taskSeries.find(s => s.id === taskForm.task.series_id) : null}
          projects={projects}
          habits={habits}
          templates={taskTemplates}
          onSave={async (data) => {
            const saveData = { ...data, due_date: data.due_date || taskForm.prefillDate || today }
            taskForm.task ? await onEditTask(taskForm.task.id, saveData) : await onAddTask(saveData)
            setTaskForm(null)
          }}
          onCancel={() => setTaskForm(null)}
        />
      )}

      {/* ── Pomodoro focus overlay ── */}
      {pomoRunning && (
        <div className="pomo-focus-overlay">
          <span className="pomo-focus-label">Pomodoro Timer{pomoOnBreak ? ' · Break' : ''}</span>
          <span className={`pomo-focus-time${pomoOnBreak ? ' break' : ''}`}>{pomoDisplay}</span>
          <div className="pomo-focus-controls">
            <button className="pomo-btn pomo-active" onClick={() => setPomoRunning(false)}>Pause</button>
            <button className="pomo-btn" onClick={() => { setPomoRunning(false); setPomoOnBreak(false); setPomoSeconds(POMO_WORK) }}>Reset</button>
          </div>
          <div className="pomo-focus-progress">
            <div className={`pomo-progress-bar${pomoOnBreak ? ' pomo-break' : ''}`} style={{ width: `${pomoPct}%` }} />
          </div>
          <span className="pomo-focus-percent">{Math.round(pomoPct)}% complete</span>
        </div>
      )}
    </div>
  )
}
