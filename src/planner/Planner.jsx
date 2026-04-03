import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../Toast'
import { todayStr } from '../utils'
import DashboardView from './DashboardView'
import TodayView from './TodayView'
import WeeklyView from './WeeklyView'
import ProjectsView from './ProjectsView'
import GlossaryView from './GlossaryView'

const PLANNER_TABS = ['Today', 'Week', 'Projects', 'Glossary']

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
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        </div>
      </div>
    )
  }

  // Mobile: tabbed navigation
  return (
    <div className="planner">
      <div className="planner-tabs">
        {PLANNER_TABS.map(t => (
          <button key={t} className={`planner-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="planner-content">
        {tab === 'Today' && (
          <TodayView
            tasks={tasks} blocks={blocks} projects={projects} habits={habits}
            glossaryItems={allGlossary}
            todayStr={today}
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock}
            onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
          />
        )}
        {tab === 'Week' && (
          <WeeklyView
            tasks={tasks} blocks={blocks} projects={projects} habits={habits}
            glossaryItems={allGlossary}
            onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock}
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
        {tab === 'Glossary' && (
          <GlossaryView
            glossaryItems={glossaryItems}
            habits={habits}
            onAddItem={addGlossaryItem}
            onEditItem={editGlossaryItem}
            onDeleteItem={deleteGlossaryItem}
            onScheduleItem={scheduleGlossaryItem}
          />
        )}
      </div>
    </div>
  )
}
