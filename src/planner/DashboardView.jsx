import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabase'
import { DAY_SHORT, MONTHS, MONTHS_FULL, DAY_NAMES, HOURS } from '../constants'
import { todayStr, toDateStr, fmt12, timeToMinutes, priorityColor } from '../utils'
import BlockForm from './BlockForm'
import TaskForm from './TaskForm'

const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDays() {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  // Monday = 0, Sunday = 6
  let startDow = (first.getDay() + 6) % 7
  const cells = []
  // leading blanks
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) cells.push(d)
  return cells
}

// Tiny SVG sparkline component
function Sparkline({ data, color }) {
  const max = Math.max(...data, 1)
  const w = 120
  const h = 24
  const step = w / (data.length - 1 || 1)
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} className="sparkline-svg" viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {data[data.length - 1] > 0 && (
        <circle cx={(data.length - 1) * step} cy={h - (data[data.length - 1] / max) * (h - 4) - 2} r="2.5" fill={color} />
      )}
    </svg>
  )
}

export default function DashboardView({
  tasks, blocks, projects, habits,
  glossaryItems,
  onAddBlock, onEditBlock, onDeleteBlock,
  onAddTask, onEditTask, onDeleteTask, onCompleteTask,
}) {
  const today = todayStr()
  const now = new Date()
  const [blockForm, setBlockForm] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const [quickAdd, setQuickAdd] = useState('')
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [habitLogs, setHabitLogs] = useState([])

  // Fetch habit logs for sparkline (last 30 days)
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

  // ── Today's data ──
  const todayBlocks = useMemo(
    () => blocks.filter(b => b.date === today).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [blocks, today]
  )
  const todayTasks = useMemo(
    () => tasks.filter(t => t.due_date === today && t.status !== 'done')
      .sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority] }),
    [tasks, today]
  )
  const doneTasks = useMemo(
    () => tasks.filter(t => t.due_date === today && t.status === 'done'),
    [tasks, today]
  )

  // ── Week data ──
  const weekDays = useMemo(() => getWeekDays(), [])

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

  // ── Quick add handler ──
  async function handleQuickAdd(e) {
    if (e.key === 'Enter' && quickAdd.trim()) {
      await onAddTask({ title: quickAdd.trim(), due_date: today, priority: 'medium', status: 'todo' })
      setQuickAdd('')
    }
  }

  // ── Calendar nav ──
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
    <div className="dash">
      {/* ══ Row 1 — Today's Focus ══ */}
      <div className="dash-card dash-today">
        <div className="dash-card-header">
          <div>
            <h2 className="dash-card-title">Today's Focus</h2>
            <p className="dash-date-label">{dateLabel}</p>
          </div>
          <div className="dash-today-actions">
            <button className="add-btn" onClick={() => setBlockForm({ date: today })}>+ Block</button>
            <button className="add-btn" onClick={() => setTaskForm({})}>+ Task</button>
          </div>
        </div>

        <div className="dash-today-body">
          {/* Mini timeline */}
          <div className="dash-timeline">
            <p className="dash-sublabel">Schedule</p>
            {todayBlocks.length === 0 ? (
              <p className="empty-msg" style={{ padding: '12px 0' }}>No blocks today</p>
            ) : (
              <div className="dash-timeline-list">
                {todayBlocks.map(block => (
                  <div
                    key={block.id}
                    className="dash-tl-block"
                    style={{ borderLeftColor: block.color, background: block.color + '18' }}
                    onClick={() => setBlockForm({ block, date: today })}
                  >
                    <span className="dash-tl-time">{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</span>
                    <span className="dash-tl-title">{block.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks checklist */}
          <div className="dash-tasks">
            <p className="dash-sublabel">
              Tasks {todayTasks.length > 0 && <span className="count-badge">{todayTasks.length}</span>}
            </p>
            {todayTasks.length === 0 && doneTasks.length === 0 && (
              <p className="empty-msg" style={{ padding: '12px 0' }}>No tasks due today</p>
            )}
            <ul className="task-list">
              {todayTasks.map(task => (
                <li key={task.id} className="task-row compact">
                  <button className="task-check small" onClick={() => onCompleteTask(task)} aria-label="Complete task" />
                  <div className="task-info">
                    <p className="task-title">{task.title}</p>
                  </div>
                  <span className="priority-dot" style={{ background: priorityColor(task.priority) }} />
                </li>
              ))}
              {doneTasks.map(task => (
                <li key={task.id} className="task-row compact done">
                  <span className="task-check small done">✓</span>
                  <p className="task-title done-title">{task.title}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Quick add */}
        <div className="dash-quick-add">
          <input
            className="input"
            placeholder="Quick add task… (Enter)"
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={handleQuickAdd}
          />
        </div>
      </div>

      {/* ══ Row 2 — Week + Habits ══ */}
      <div className="dash-card dash-week">
        <h2 className="dash-card-title">This Week</h2>
        <div className="dash-week-grid">
          {weekDays.map((day, i) => {
            const ds = toDateStr(day)
            const dayBlocks = blocks.filter(b => b.date === ds)
            const isToday = ds === today
            return (
              <div
                key={ds}
                className={`dash-week-day ${isToday ? 'dash-week-today' : ''}`}
                onClick={() => setBlockForm({ date: ds })}
              >
                <span className="dash-week-name">{WEEK_HEADERS[i]}</span>
                <span className={`dash-week-num ${isToday ? 'accent' : ''}`}>{day.getDate()}</span>
                <div className="dash-week-chips">
                  {dayBlocks.slice(0, 3).map(b => (
                    <div key={b.id} className="dash-week-chip" style={{ background: b.color }} onClick={e => { e.stopPropagation(); setBlockForm({ block: b, date: ds }) }} />
                  ))}
                  {dayBlocks.length > 3 && <span className="dash-week-more">+{dayBlocks.length - 3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="dash-card dash-habits">
        <h2 className="dash-card-title">Habit Streaks</h2>
        {habits.length === 0 ? (
          <p className="empty-msg">No habits tracked yet</p>
        ) : (
          <div className="dash-habit-list">
            {habits.map(h => {
              const spark = habitSparkData[h.id] || { daily: Array(30).fill(0), monthCount: 0 }
              return (
                <div key={h.id} className="dash-habit-row">
                  <span className="dash-habit-dot" style={{ background: h.color }} />
                  <span className="dash-habit-name">{h.name}</span>
                  <Sparkline data={spark.daily} color={h.color} />
                  <span className="dash-habit-count">{spark.monthCount}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ Row 3 — Monthly Calendar ══ */}
      <div className="dash-card dash-calendar">
        <div className="dash-cal-header">
          <h2 className="dash-card-title">{MONTHS_FULL[calMonth]} {calYear}</h2>
          <div className="dash-cal-nav">
            {(calMonth !== now.getMonth() || calYear !== now.getFullYear()) && (
              <button className="add-btn" onClick={goToday}>Today</button>
            )}
            <button className="nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
            <button className="nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
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
                      <span key={b.id} className="dash-cal-dot" style={{ background: b.color }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
          onSave={async (data) => { blockForm.block ? await onEditBlock(blockForm.block.id, data) : await onAddBlock(data); setBlockForm(null) }}
          onCancel={() => setBlockForm(null)}
        />
      )}
      {taskForm !== null && (
        <TaskForm
          task={taskForm.task}
          projects={projects}
          habits={habits}
          onSave={async (data) => { taskForm.task ? await onEditTask(taskForm.task.id, data) : await onAddTask({ ...data, due_date: data.due_date || today }); setTaskForm(null) }}
          onCancel={() => setTaskForm(null)}
        />
      )}
    </div>
  )
}
