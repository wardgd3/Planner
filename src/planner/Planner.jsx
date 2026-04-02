import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import TodayView from './TodayView'
import WeeklyView from './WeeklyView'
import ProjectsView from './ProjectsView'
import GlossaryView from './GlossaryView'

const PLANNER_TABS = ['Today', 'Week', 'Projects', 'Glossary']

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Planner({ habits }) {
  const [tab, setTab] = useState('Today')
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [blocks, setBlocks] = useState([])
  const [glossaryItems, setGlossaryItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: proj }, { data: tsk }, { data: blk }, { data: gloss }] = await Promise.all([
      supabase.from('planner_projects').select('*').order('sort_order'),
      supabase.from('planner_tasks').select('*').order('sort_order'),
      supabase.from('planner_blocks').select('*').order('date').order('start_time'),
      supabase.from('glossary_items').select('*').order('name')
    ])
    if (proj) setProjects(proj)
    if (tsk) setTasks(tsk)
    if (blk) setBlocks(blk)
    if (gloss) setGlossaryItems(gloss)
    setLoading(false)
  }

  // ---- Tasks ----
  async function addTask(data) {
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)
    const { data: t, error } = await supabase.from('planner_tasks').insert({ ...data, sort_order: maxOrder + 1, status: 'todo' }).select().single()
    if (!error) setTasks(prev => [...prev, t])
  }

  async function editTask(id, data) {
    const { data: t, error } = await supabase.from('planner_tasks').update(data).eq('id', id).select().single()
    if (!error) setTasks(prev => prev.map(x => x.id === id ? t : x))
  }

  async function deleteTask(id) {
    await supabase.from('planner_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function completeTask(task) {
    const now = new Date().toISOString()
    const { data: t, error } = await supabase.from('planner_tasks')
      .update({ status: 'done', completed_at: now }).eq('id', task.id).select().single()
    if (!error) {
      setTasks(prev => prev.map(x => x.id === task.id ? t : x))
      if (task.habit_id) {
        await supabase.from('habit_logs').insert({ habit_id: task.habit_id })
      }
    }
  }

  // ---- Blocks ----
  async function addBlock(data) {
    const { data: b, error } = await supabase.from('planner_blocks').insert(data).select().single()
    if (!error) setBlocks(prev => [...prev, b])
  }

  async function editBlock(id, data) {
    const { data: b, error } = await supabase.from('planner_blocks').update(data).eq('id', id).select().single()
    if (!error) setBlocks(prev => prev.map(x => x.id === id ? b : x))
  }

  async function deleteBlock(id) {
    await supabase.from('planner_blocks').delete().eq('id', id)
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  // ---- Projects ----
  async function addProject(data) {
    const maxOrder = projects.reduce((m, p) => Math.max(m, p.sort_order || 0), 0)
    const { data: p, error } = await supabase.from('planner_projects').insert({ ...data, sort_order: maxOrder + 1 }).select().single()
    if (!error) setProjects(prev => [...prev, p])
  }

  async function editProject(id, data) {
    const { data: p, error } = await supabase.from('planner_projects').update(data).eq('id', id).select().single()
    if (!error) setProjects(prev => prev.map(x => x.id === id ? p : x))
  }

  async function deleteProject(id) {
    await supabase.from('planner_projects').delete().eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setTasks(prev => prev.map(t => t.project_id === id ? { ...t, project_id: null } : t))
  }

  // ---- Glossary ----
  async function addGlossaryItem(data) {
    const { data: g, error } = await supabase.from('glossary_items').insert(data).select().single()
    if (!error) setGlossaryItems(prev => [...prev, g].sort((a,b) => a.name.localeCompare(b.name)))
  }

  async function editGlossaryItem(id, data) {
    const { data: g, error } = await supabase.from('glossary_items').update(data).eq('id', id).select().single()
    if (!error) setGlossaryItems(prev => prev.map(x => x.id === id ? g : x))
  }

  async function deleteGlossaryItem(id) {
    await supabase.from('glossary_items').delete().eq('id', id)
    setGlossaryItems(prev => prev.filter(g => g.id !== id))
  }

  // Schedule a glossary item as a planner block
  async function scheduleGlossaryItem(item, { date, start_time, end_time }) {
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
    // Switch to Today or Week so user sees the result
    setTab(date === todayStr() ? 'Today' : 'Week')
  }

  const today = todayStr()

  return (
    <div className="planner">
      <div className="planner-tabs">
        {PLANNER_TABS.map(t => (
          <button key={t} className={`planner-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="loading" style={{ padding: '60px 0' }}>Loading…</div>
      ) : (
        <div className="planner-content">
          {tab === 'Today' && (
            <TodayView
              tasks={tasks} blocks={blocks} projects={projects} habits={habits}
              glossaryItems={[...glossaryItems, ...habits.map(h => ({ id: `habit-${h.id}`, name: h.name, source: 'habit', habit_id: h.id, color: h.color, default_duration_minutes: null, default_time: null }))]}
              todayStr={today}
              onAddBlock={addBlock} onEditBlock={editBlock} onDeleteBlock={deleteBlock}
              onAddTask={addTask} onEditTask={editTask} onDeleteTask={deleteTask} onCompleteTask={completeTask}
            />
          )}
          {tab === 'Week' && (
            <WeeklyView
              tasks={tasks} blocks={blocks} projects={projects} habits={habits}
              glossaryItems={[...glossaryItems, ...habits.map(h => ({ id: `habit-${h.id}`, name: h.name, source: 'habit', habit_id: h.id, color: h.color, default_duration_minutes: null, default_time: null }))]}
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
      )}
    </div>
  )
}
