import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../Toast'
import { todayStr } from '../utils'
import ProjectForm from './ProjectForm'
import TaskForm from './TaskForm'
import { createSeries, updateSeriesRule, ensureSeriesScheduled, upsertTemplate } from './taskRecurrence'

const STATUS_COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
]

function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')
  return Math.round(ms / 86400000)
}

export default function ProjectsDashboard({ habits }) {
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [taskTemplates, setTaskTemplates] = useState([])
  const [taskSeries, setTaskSeries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [projectForm, setProjectForm] = useState(null) // { project? } | null
  const [taskForm, setTaskForm] = useState(null) // { task?, status?, projectId? } | null

  // ── Fetch ──
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // Roll forward recurring occurrences before listing tasks
      await ensureSeriesScheduled({})
      const [
        { data: p, error: e1 },
        { data: t, error: e2 },
        { data: tpl, error: e3 },
        { data: ser, error: e4 },
      ] = await Promise.all([
        supabase.from('planner_projects').select('*').order('sort_order'),
        supabase.from('planner_tasks').select('*').order('sort_order'),
        supabase.from('planner_task_templates').select('*').order('usage_count', { ascending: false }).order('title'),
        supabase.from('planner_task_series').select('*').eq('is_active', true),
      ])
      if (e1 || e2 || e3 || e4) toast.error('Failed to load projects')
      if (p) setProjects(p)
      if (t) setTasks(t)
      if (tpl) setTaskTemplates(tpl)
      if (ser) setTaskSeries(ser)
      setLoading(false)
    })()
  }, [toast])

  // Auto-select first visible project when data loads
  useEffect(() => {
    if (!selectedId && projects.length > 0) {
      const active = projects.find(p => p.status === 'active') || projects[0]
      setSelectedId(active.id)
    }
  }, [projects, selectedId])

  // ── Project CRUD ──
  const addProject = useCallback(async (data) => {
    const maxOrder = projects.reduce((m, p) => Math.max(m, p.sort_order || 0), 0)
    const { data: p, error } = await supabase.from('planner_projects')
      .insert({ ...data, sort_order: maxOrder + 1 }).select().single()
    if (error) { toast.error('Failed to create project'); return }
    setProjects(prev => [...prev, p])
    setSelectedId(p.id)
    toast.success('Project created')
  }, [projects, toast])

  const editProject = useCallback(async (id, data) => {
    const { data: p, error } = await supabase.from('planner_projects')
      .update(data).eq('id', id).select().single()
    if (error) { toast.error('Failed to update project'); return }
    setProjects(prev => prev.map(x => x.id === id ? p : x))
  }, [toast])

  const deleteProject = useCallback(async (id) => {
    if (!confirm('Delete this project? Tasks will be kept and unlinked.')) return
    const { error } = await supabase.from('planner_projects').delete().eq('id', id)
    if (error) { toast.error('Failed to delete project'); return }
    setProjects(prev => prev.filter(p => p.id !== id))
    setTasks(prev => prev.map(t => t.project_id === id ? { ...t, project_id: null } : t))
    if (selectedId === id) setSelectedId(null)
    toast.success('Project deleted')
  }, [toast, selectedId])

  // ── Task CRUD ──
  const addTask = useCallback(async (data) => {
    const { recurrence, ...taskFields } = data
    if (taskFields.title) upsertTemplate(taskFields.title)
    if (recurrence) {
      const { series, error } = await createSeries(taskFields, recurrence)
      if (error) { toast.error('Failed to create recurring task'); return }
      setTaskSeries(prev => [...prev, series])
      const { data: tsk } = await supabase.from('planner_tasks').select('*').order('sort_order')
      if (tsk) setTasks(tsk)
      toast.success('Recurring task scheduled')
      return
    }
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)
    const { data: t, error } = await supabase.from('planner_tasks')
      .insert({ ...taskFields, sort_order: maxOrder + 1, status: taskFields.status || 'todo' }).select().single()
    if (error) { toast.error('Failed to add task'); return }
    setTasks(prev => [...prev, t])
  }, [tasks, toast])

  const editTask = useCallback(async (id, data) => {
    const { seriesUpdate, seriesId, recurrence, ...fields } = data
    if (fields.title) upsertTemplate(fields.title)
    if (seriesUpdate && seriesId) {
      const seriesFields = {
        title: fields.title,
        notes: fields.notes,
        priority: fields.priority,
        project_id: fields.project_id,
        habit_id: fields.habit_id,
        due_time: fields.due_time,
        ...seriesUpdate,
      }
      const { error } = await updateSeriesRule(seriesId, seriesFields)
      if (error) { toast.error('Failed to update series'); return }
      const [{ data: tsk }, { data: ser }] = await Promise.all([
        supabase.from('planner_tasks').select('*').order('sort_order'),
        supabase.from('planner_task_series').select('*').eq('is_active', true),
      ])
      if (tsk) setTasks(tsk)
      if (ser) setTaskSeries(ser)
      toast.success('Recurring series updated')
      return
    }
    const { data: t, error } = await supabase.from('planner_tasks')
      .update(fields).eq('id', id).select().single()
    if (error) { toast.error('Failed to update task'); return }
    setTasks(prev => prev.map(x => x.id === id ? t : x))
  }, [toast])

  const deleteTask = useCallback(async (id) => {
    const { error } = await supabase.from('planner_tasks').delete().eq('id', id)
    if (error) { toast.error('Failed to delete task'); return }
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [toast])

  const setTaskStatus = useCallback(async (task, status) => {
    const completed_at = status === 'done' ? new Date().toISOString() : null
    const { data, error } = await supabase.from('planner_tasks')
      .update({ status, completed_at }).eq('id', task.id).select().single()
    if (error) { toast.error('Failed to update task'); return }
    setTasks(prev => prev.map(x => x.id === task.id ? data : x))
    if (status === 'done' && task.habit_id && task.status !== 'done') {
      const { error: e2 } = await supabase.from('habit_logs').insert({ habit_id: task.habit_id })
      if (e2) toast.error('Failed to log linked habit')
    }
  }, [toast])

  // ── Derived ──
  const filteredProjects = useMemo(() => {
    return projects
      .filter(p => filter === 'all' || p.status === filter)
      .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()))
  }, [projects, filter, search])

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedId) || null,
    [projects, selectedId]
  )

  const selectedTasks = useMemo(
    () => tasks.filter(t => t.project_id === selectedId),
    [tasks, selectedId]
  )

  const tasksByStatus = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] }
    selectedTasks.forEach(t => {
      const s = t.status || 'todo'
      if (map[s]) map[s].push(t)
    })
    const prio = { high: 0, medium: 1, low: 2 }
    Object.keys(map).forEach(k => map[k].sort((a, b) =>
      (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1)
    ))
    return map
  }, [selectedTasks])

  const globalStats = useMemo(() => {
    const today = todayStr()
    const active = projects.filter(p => p.status === 'active').length
    const openTasks = tasks.filter(t => t.status !== 'done').length
    const overdueTasks = tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length
    const dueSoon = tasks.filter(t => {
      if (t.status === 'done' || !t.due_date) return false
      const d = daysBetween(today, t.due_date)
      return d >= 0 && d <= 7
    }).length
    return { active, openTasks, overdueTasks, dueSoon }
  }, [projects, tasks])

  function projectProgress(projectId) {
    const pts = tasks.filter(t => t.project_id === projectId)
    if (pts.length === 0) return { pct: 0, done: 0, total: 0 }
    const done = pts.filter(t => t.status === 'done').length
    return { pct: Math.round((done / pts.length) * 100), done, total: pts.length }
  }

  const habitMap = useMemo(() => {
    const m = {}
    habits?.forEach(h => { m[h.id] = h })
    return m
  }, [habits])

  if (loading) {
    return <div className="projects-dash"><div className="loading" style={{ padding: 60 }}>Loading…</div></div>
  }

  return (
    <div className="projects-dash">
      {/* ── Header stats ── */}
      <div className="pd-stats">
        <div className="pd-stat">
          <span className="pd-stat-val">{globalStats.active}</span>
          <span className="pd-stat-label">Active Projects</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-val">{globalStats.openTasks}</span>
          <span className="pd-stat-label">Open Tasks</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-val" style={{ color: globalStats.overdueTasks > 0 ? 'var(--danger)' : undefined }}>
            {globalStats.overdueTasks}
          </span>
          <span className="pd-stat-label">Overdue</span>
        </div>
        <div className="pd-stat">
          <span className="pd-stat-val">{globalStats.dueSoon}</span>
          <span className="pd-stat-label">Due in 7 Days</span>
        </div>
      </div>

      <div className="pd-layout">
        {/* ── Sidebar ── */}
        <aside className="pd-sidebar">
          <div className="pd-sidebar-head">
            <input
              className="input pd-search"
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button className="add-btn pd-new-btn" onClick={() => setProjectForm({})}>+ New</button>
          </div>
          <div className="pd-filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`pd-filter ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ul className="pd-project-list">
            {filteredProjects.length === 0 && (
              <li className="pd-empty">No projects match</li>
            )}
            {filteredProjects.map(p => {
              const prog = projectProgress(p.id)
              const isActive = p.id === selectedId
              return (
                <li
                  key={p.id}
                  className={`pd-project-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  <span className="pd-proj-dot" style={{ background: p.color }} />
                  <div className="pd-proj-info">
                    <p className="pd-proj-name">{p.name}</p>
                    <div className="pd-proj-meta">
                      <span className={`pd-proj-status pd-status-${p.status}`}>{p.status}</span>
                      <span className="pd-proj-progress">{prog.done}/{prog.total}</span>
                    </div>
                    <div className="pd-proj-bar">
                      <div className="pd-proj-bar-fill" style={{ width: prog.pct + '%', background: p.color }} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* ── Main ── */}
        <main className="pd-main">
          {!selectedProject && (
            <div className="pd-empty-main">
              <p>Select a project to view its board, or create a new one.</p>
              <button className="add-btn" onClick={() => setProjectForm({})}>+ New Project</button>
            </div>
          )}

          {selectedProject && (
            <ProjectBoard
              project={selectedProject}
              tasksByStatus={tasksByStatus}
              progress={projectProgress(selectedProject.id)}
              habitMap={habitMap}
              onEditProject={() => setProjectForm({ project: selectedProject })}
              onDeleteProject={() => deleteProject(selectedProject.id)}
              onNewTask={(status) => setTaskForm({ status, projectId: selectedProject.id })}
              onEditTask={(task) => setTaskForm({ task })}
              onDeleteTask={deleteTask}
              onSetTaskStatus={setTaskStatus}
            />
          )}
        </main>
      </div>

      {projectForm !== null && (
        <ProjectForm
          project={projectForm.project}
          onSave={async (data) => {
            if (projectForm.project) await editProject(projectForm.project.id, data)
            else await addProject(data)
            setProjectForm(null)
          }}
          onCancel={() => setProjectForm(null)}
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
            const payload = {
              ...data,
              project_id: data.project_id || taskForm.projectId || null,
              status: taskForm.task ? data.status : (taskForm.status || 'todo'),
            }
            if (taskForm.task) await editTask(taskForm.task.id, payload)
            else await addTask(payload)
            setTaskForm(null)
          }}
          onCancel={() => setTaskForm(null)}
        />
      )}
    </div>
  )
}

function ProjectBoard({
  project, tasksByStatus, progress, habitMap,
  onEditProject, onDeleteProject, onNewTask,
  onEditTask, onDeleteTask, onSetTaskStatus,
}) {
  const today = todayStr()
  const dueLabel = project.due_date
    ? (() => {
        const d = daysBetween(today, project.due_date)
        if (d < 0) return `${Math.abs(d)}d overdue`
        if (d === 0) return 'Due today'
        return `Due in ${d}d`
      })()
    : null

  return (
    <div className="pd-board">
      {/* Project header */}
      <div className="pd-board-head">
        <div className="pd-board-title-row">
          <span className="pd-board-dot" style={{ background: project.color }} />
          <h1 className="pd-board-title">{project.name}</h1>
          <span className={`pd-proj-status pd-status-${project.status}`}>{project.status}</span>
        </div>
        {project.description && <p className="pd-board-desc">{project.description}</p>}
        <div className="pd-board-sub">
          <div className="pd-board-progress">
            <div className="pd-board-bar">
              <div className="pd-board-bar-fill" style={{ width: progress.pct + '%', background: project.color }} />
            </div>
            <span className="pd-board-prog-label">{progress.pct}% · {progress.done}/{progress.total} tasks</span>
          </div>
          {project.due_date && (
            <span className={`pd-board-due ${daysBetween(today, project.due_date) < 0 ? 'overdue' : ''}`}>
              {dueLabel}
            </span>
          )}
          <div className="pd-board-actions">
            <button className="icon-btn" onClick={onEditProject} aria-label="Edit project">✏️</button>
            <button className="icon-btn" onClick={onDeleteProject} aria-label="Delete project">🗑</button>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="pd-kanban">
        {STATUS_COLUMNS.map(col => {
          const colTasks = tasksByStatus[col.key] || []
          return (
            <div key={col.key} className={`pd-col pd-col-${col.key}`}>
              <div className="pd-col-head">
                <span className="pd-col-label">{col.label}</span>
                <span className="pd-col-count">{colTasks.length}</span>
                <button className="pd-col-add" onClick={() => onNewTask(col.key)} aria-label={`Add task to ${col.label}`}>+</button>
              </div>
              <div className="pd-col-body">
                {colTasks.length === 0 && (
                  <div className="pd-col-empty" onClick={() => onNewTask(col.key)}>+ Add task</div>
                )}
                {colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    habit={task.habit_id ? habitMap[task.habit_id] : null}
                    onEdit={() => onEditTask(task)}
                    onDelete={() => onDeleteTask(task.id)}
                    onSetStatus={(s) => onSetTaskStatus(task, s)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskCard({ task, habit, onEdit, onDelete, onSetStatus }) {
  const today = todayStr()
  const overdue = task.due_date && task.due_date < today && task.status !== 'done'
  const prioLabel = task.priority || 'medium'

  return (
    <div className={`pd-task ${task.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <div className="pd-task-main" onClick={onEdit}>
        <p className="pd-task-title">{task.title}</p>
        {task.notes && <p className="pd-task-notes">{task.notes.split('\n')[0]}</p>}
        <div className="pd-task-meta">
          <span className={`pd-prio pd-prio-${prioLabel}`}>{prioLabel}</span>
          {task.due_date && <span className="pd-task-due">{task.due_date}</span>}
          {habit && (
            <span className="pd-task-habit" style={{ color: habit.color }}>● {habit.name}</span>
          )}
        </div>
      </div>
      <div className="pd-task-footer">
        <select
          className="pd-task-status"
          value={task.status || 'todo'}
          onChange={e => onSetStatus(e.target.value)}
          onClick={e => e.stopPropagation()}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete task">🗑</button>
      </div>
    </div>
  )
}
