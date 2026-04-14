import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../Toast'
import { todayStr } from '../utils'
import { MONTHS_FULL } from '../constants'
import DashboardView from './DashboardView'
import WeeklyView from './WeeklyView'
import ProjectsView from './ProjectsView'
import WeatherWidget from './WeatherWidget'
import BlockForm from './BlockForm'

const PLANNER_TABS = ['Today', 'Week', 'Month', 'Projects']
const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startDow = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  return cells
}

function useIsDesktop(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= breakpoint)
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const handler = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])
  return isDesktop
}

export default function Planner({ habits }) {
  const toast = useToast()
  const [tab, setTab] = useState('Today')
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [blocks, setBlocks] = useState([])
  const [glossaryItems, setGlossaryItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [{ data: proj, error: e1 }, { data: tsk, error: e2 }, { data: blk, error: e3 }, { data: gloss, error: e4 }] = await Promise.all([
        supabase.from('planner_projects').select('*').order('sort_order'),
        supabase.from('planner_tasks').select('*').order('sort_order'),
        supabase.from('planner_blocks').select('*').order('date').order('start_time'),
        supabase.from('glossary_items').select('*').order('name')
      ])
      if (e1 || e2 || e3 || e4) toast.error('Failed to load some planner data')
      if (proj) setProjects(proj)
      if (tsk) setTasks(tsk)
      if (blk) setBlocks(blk)
      if (gloss) setGlossaryItems(gloss)
    } catch {
      toast.error('Network error loading planner')
    }
    setLoading(false)
  }

  // ---- Tasks ----
  const addTask = useCallback(async (data) => {
    try {
      const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)
      const { data: t, error } = await supabase.from('planner_tasks').insert({ ...data, sort_order: maxOrder + 1, status: 'todo' }).select().single()
      if (error) { toast.error('Failed to add task'); return }
      setTasks(prev => [...prev, t])
    } catch { toast.error('Network error') }
  }, [tasks, toast])

  const editTask = useCallback(async (id, data) => {
    try {
      const { data: t, error } = await supabase.from('planner_tasks').update(data).eq('id', id).select().single()
      if (error) { toast.error('Failed to update task'); return }
      setTasks(prev => prev.map(x => x.id === id ? t : x))
    } catch { toast.error('Network error') }
  }, [toast])

  const deleteTask = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_tasks').delete().eq('id', id)
      if (error) { toast.error('Failed to delete task'); return }
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

  const completeTask = useCallback(async (task) => {
    try {
      const now = new Date().toISOString()
      const { data: t, error } = await supabase.from('planner_tasks')
        .update({ status: 'done', completed_at: now }).eq('id', task.id).select().single()
      if (error) { toast.error('Failed to complete task'); return }
      setTasks(prev => prev.map(x => x.id === task.id ? t : x))
      if (task.habit_id) {
        const { error: e2 } = await supabase.from('habit_logs').insert({ habit_id: task.habit_id })
        if (e2) toast.error('Failed to log linked habit')
      }
      toast.success('Task completed')
    } catch { toast.error('Network error') }
  }, [toast])

  // ---- Blocks ----
  const addBlock = useCallback(async (data) => {
    try {
      const { data: b, error } = await supabase.from('planner_blocks').insert(data).select().single()
      if (error) { toast.error('Failed to add block'); return }
      setBlocks(prev => [...prev, b])
    } catch { toast.error('Network error') }
  }, [toast])

  const editBlock = useCallback(async (id, data) => {
    try {
      const { data: b, error } = await supabase.from('planner_blocks').update(data).eq('id', id).select().single()
      if (error) { toast.error('Failed to update block'); return }
      setBlocks(prev => prev.map(x => x.id === id ? b : x))
    } catch { toast.error('Network error') }
  }, [toast])

  const deleteBlock = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_blocks').delete().eq('id', id)
      if (error) { toast.error('Failed to delete block'); return }
      setBlocks(prev => prev.filter(b => b.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

  const completeBlock = useCallback(async (block) => {
    try {
      const done = !block.completed
      const { data: b, error } = await supabase.from('planner_blocks')
        .update({ completed: done }).eq('id', block.id).select().single()
      if (error) { toast.error('Failed to update block'); return }
      setBlocks(prev => prev.map(x => x.id === block.id ? b : x))
      if (done && block.habit_id) {
        const { error: e2 } = await supabase.from('habit_logs').insert({ habit_id: block.habit_id })
        if (e2) toast.error('Failed to log linked habit')
      }
      toast.success(done ? 'Block completed' : 'Block unchecked')
    } catch { toast.error('Network error') }
  }, [toast])

  // ---- Projects ----
  const addProject = useCallback(async (data) => {
    try {
      const maxOrder = projects.reduce((m, p) => Math.max(m, p.sort_order || 0), 0)
      const { data: p, error } = await supabase.from('planner_projects').insert({ ...data, sort_order: maxOrder + 1 }).select().single()
      if (error) { toast.error('Failed to create project'); return }
      setProjects(prev => [...prev, p])
      toast.success('Project created')
    } catch { toast.error('Network error') }
  }, [projects, toast])

  const editProject = useCallback(async (id, data) => {
    try {
      const { data: p, error } = await supabase.from('planner_projects').update(data).eq('id', id).select().single()
      if (error) { toast.error('Failed to update project'); return }
      setProjects(prev => prev.map(x => x.id === id ? p : x))
    } catch { toast.error('Network error') }
  }, [toast])

  const deleteProject = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_projects').delete().eq('id', id)
      if (error) { toast.error('Failed to delete project'); return }
      setProjects(prev => prev.filter(p => p.id !== id))
      setTasks(prev => prev.map(t => t.project_id === id ? { ...t, project_id: null } : t))
      toast.success('Project deleted')
    } catch { toast.error('Network error') }
  }, [toast])

  // ---- Glossary ----
  const addGlossaryItem = useCallback(async (data) => {
    try {
      const { data: g, error } = await supabase.from('glossary_items').insert(data).select().single()
      if (error) { toast.error('Failed to add glossary item'); return }
      setGlossaryItems(prev => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)))
    } catch { toast.error('Network error') }
  }, [toast])

  const editGlossaryItem = useCallback(async (id, data) => {
    try {
      const { data: g, error } = await supabase.from('glossary_items').update(data).eq('id', id).select().single()
      if (error) { toast.error('Failed to update glossary item'); return }
      setGlossaryItems(prev => prev.map(x => x.id === id ? g : x))
    } catch { toast.error('Network error') }
  }, [toast])

  const deleteGlossaryItem = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('glossary_items').delete().eq('id', id)
      if (error) { toast.error('Failed to delete glossary item'); return }
      setGlossaryItems(prev => prev.filter(g => g.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

  // Schedule a glossary item as a planner block
  const scheduleGlossaryItem = useCallback(async (item, { date, start_time, end_time }) => {
    const habitId = item.source === 'habit' ? item.habit_id : null
    const color = item.source === 'habit'
      ? (habits.find(h => h.id === item.habit_id)?.color || '#60a5fa')
      : '#60a5fa'
    await addBlock({
      title: item.name,
      date,
      start_time,
      end_time,
      color,
      habit_id: habitId,
      notes: item.description || null,
    })
    setTab(date === todayStr() ? 'Today' : 'Week')
  }, [habits, addBlock])

  const today = todayStr()
  const isDesktop = useIsDesktop()

  const habitGlossaryEntries = habits.map(h => ({
    id: `habit-${h.id}`, name: h.name, source: 'habit', habit_id: h.id,
    color: h.color, default_duration_minutes: null, default_time: null
  }))

  const allGlossary = [...glossaryItems, ...habitGlossaryEntries]

  if (loading) {
    return <div className="planner"><div className="loading" style={{ padding: '60px 0' }}>Loading…</div></div>
  }

  // Desktop: bento dashboard
  if (isDesktop) {
    return (
      <div className="planner">
        <div className="planner-content">
          <DashboardView
            tasks={tasks} blocks={blocks} projects={projects} habits={habits}
            glossaryItems={allGlossary}
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock} onCompleteBlock={completeBlock}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        </div>
      </div>
    )
  }

  // Mobile: tabbed navigation
  return (
    <MobilePlanner
      tab={tab} setTab={setTab}
      tasks={tasks} blocks={blocks} projects={projects} habits={habits}
      allGlossary={allGlossary}
      addBlock={addBlock} editBlock={editBlock} deleteBlock={deleteBlock} completeBlock={completeBlock}
      addTask={addTask} editTask={editTask} deleteTask={deleteTask} completeTask={completeTask}
      addProject={addProject} editProject={editProject} deleteProject={deleteProject}
    />
  )
}

function MobilePlanner({
  tab, setTab,
  tasks, blocks, projects, habits, allGlossary,
  addBlock, editBlock, deleteBlock, completeBlock,
  addTask, editTask, deleteTask, completeTask,
  addProject, editProject, deleteProject,
}) {
  const toast = useToast()
  const [showCalendar, setShowCalendar] = useState(false)
  const [showWeather, setShowWeather] = useState(false)
  const [blockForm, setBlockForm] = useState(null)
  const now = new Date()
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calYear, setCalYear] = useState(now.getFullYear())
  const today = todayStr()

  function goCalToday() { setCalMonth(new Date().getMonth()); setCalYear(new Date().getFullYear()) }

  // ── Notes ──
  const [notes, setNotes] = useState([])
  const [noteInput, setNoteInput] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [editingText, setEditingText] = useState('')

  useEffect(() => {
    supabase.from('planner_notes').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setNotes(data) })
  }, [])

  const addNote = useCallback(async () => {
    if (!noteInput.trim()) return
    try {
      const { data, error } = await supabase.from('planner_notes').insert({ content: noteInput.trim() }).select().single()
      if (error) { toast.error('Failed to add note'); return }
      setNotes(prev => [data, ...prev])
      setNoteInput('')
    } catch { toast.error('Network error') }
  }, [noteInput, toast])

  const updateNote = useCallback(async (id) => {
    if (!editingText.trim()) return
    try {
      const { data, error } = await supabase.from('planner_notes')
        .update({ content: editingText.trim(), updated_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) { toast.error('Failed to update note'); return }
      setNotes(prev => prev.map(n => n.id === id ? data : n))
      setEditingNote(null); setEditingText('')
    } catch { toast.error('Network error') }
  }, [editingText, toast])

  const deleteNote = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('planner_notes').delete().eq('id', id)
      if (error) { toast.error('Failed to delete note'); return }
      setNotes(prev => prev.filter(n => n.id !== id))
    } catch { toast.error('Network error') }
  }, [toast])

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

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="planner">
      <div className="planner-tabs">
        {PLANNER_TABS.map(t => (
          <button key={t} className={`planner-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
        <button
          className={`planner-wx-btn ${showWeather ? 'active' : ''}`}
          onClick={() => setShowWeather(v => !v)}
          aria-label="Weather"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </button>
        <button
          className={`planner-cal-btn ${showCalendar ? 'active' : ''}`}
          onClick={() => setShowCalendar(v => !v)}
          aria-label="Calendar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>

      {showWeather && (
        <>
          <div className="planner-wx-backdrop" onClick={() => setShowWeather(false)} />
          <div className="planner-wx-popup">
            <WeatherWidget supabase={supabase} />
          </div>
        </>
      )}

      {showCalendar && (
        <>
          <div className="planner-cal-backdrop" onClick={() => setShowCalendar(false)} />
          <div className="planner-cal-popup">
            <div className="dash-cal-header">
              <h2 className="dash-card-title">{MONTHS_FULL[calMonth]} {calYear}</h2>
              <div className="dash-cal-nav">
                <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
                <button className="nav-btn" onClick={nextMonth} aria-label="Next month">&#8250;</button>
              </div>
            </div>
            <div className="dash-cal-grid">
              {WEEK_HEADERS.map(d => <div key={d} className="dash-cal-dow">{d}</div>)}
              {calCells.map((day, i) => {
                if (day === null) return <div key={`blank-${i}`} className="dash-cal-cell dash-cal-blank" />
                const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayBlocks = calBlocksByDay[day] || []
                const isToday = ds === today
                return (
                  <div key={ds} className={`dash-cal-cell ${isToday ? 'dash-cal-today' : ''} ${dayBlocks.length > 0 ? 'dash-cal-has' : ''}`}>
                    <span className="dash-cal-num">{day}</span>
                    {dayBlocks.length > 0 && (
                      <div className="dash-cal-dots">
                        {dayBlocks.slice(0, 4).map(b => (
                          <span key={b.id} className="dash-cal-dot" style={{ background: 'var(--accent)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div className="planner-content">
        {tab === 'Today' && (
          <DashboardView
            tasks={tasks} blocks={blocks} projects={projects} habits={habits}
            glossaryItems={allGlossary}
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock} onCompleteBlock={completeBlock}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        )}
        {tab === 'Week' && (
          <DashboardView
            mobileWeekFocus
            tasks={tasks} blocks={blocks} projects={projects} habits={habits}
            glossaryItems={allGlossary}
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock} onCompleteBlock={completeBlock}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        )}
        {tab === 'Projects' && (
          <ProjectsView
            projects={projects} tasks={tasks} habits={habits}
            onAddProject={addProject} onEditProject={editProject} onDeleteProject={deleteProject}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        )}
        {tab === 'Month' && (
          <div className="mobile-month-view">
            <div className="dash-cal-header">
              <h2 className="dash-card-title">{MONTHS_FULL[calMonth]} {calYear}</h2>
              <div className="dash-cal-nav">
                {(calMonth !== now.getMonth() || calYear !== now.getFullYear()) && (
                  <button className="add-btn" onClick={goCalToday}>Today</button>
                )}
                <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">&#8249;</button>
                <button className="nav-btn" onClick={nextMonth} aria-label="Next month">&#8250;</button>
              </div>
            </div>
            <div className="dash-cal-grid">
              {WEEK_HEADERS.map(d => <div key={d} className="dash-cal-dow">{d}</div>)}
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
                          <span key={b.id} className="dash-cal-dot" style={{ background: 'var(--accent)' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {blockForm !== null && (
          <BlockForm
            block={blockForm.block}
            date={blockForm.date}
            projects={projects}
            tasks={tasks}
            habits={habits}
            glossaryItems={allGlossary}
            existingBlocks={blocks.filter(b => b.date === (blockForm.date || blockForm.block?.date))}
            onSave={async (data) => {
              if (blockForm.block) await editBlock(blockForm.block.id, data)
              else await addBlock(data)
              setBlockForm(null)
            }}
            onDelete={blockForm.block ? async () => { await deleteBlock(blockForm.block.id); setBlockForm(null) } : undefined}
            onClose={() => setBlockForm(null)}
          />
        )}
      </div>
    </div>
  )
}
