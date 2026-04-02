import { useState } from 'react'
import BlockForm from './BlockForm'
import TaskForm from './TaskForm'

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

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}

const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function priorityColor(p) {
  return p === 'high' ? '#fb7185' : p === 'medium' ? '#f7c948' : '#4ade80'
}

export default function WeeklyView({ tasks, blocks, projects, habits, glossaryItems = [], onAddBlock, onEditBlock, onDeleteBlock, onAddTask, onEditTask, onDeleteTask, onCompleteTask }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [blockForm, setBlockForm] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const days = getWeekDays(weekOffset)
  const todayStr = toDateStr(new Date())

  const unscheduled = tasks.filter(t => !t.due_date && t.status !== 'done')

  const weekStart = days[0]
  const weekEnd = days[6]
  const label = `${DAY_SHORT[0]} ${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} – ${DAY_SHORT[6]} ${weekEnd.getDate()} ${MONTHS_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`

  return (
    <div className="weekly-view">
      {/* Navigation */}
      <div className="weekly-nav">
        <button className="nav-btn" onClick={() => setWeekOffset(v => v - 1)}>‹</button>
        <span className="weekly-label">{label}</span>
        <button className="nav-btn" onClick={() => setWeekOffset(v => v + 1)}>›</button>
        {weekOffset !== 0 && (
          <button className="add-btn" style={{ marginLeft: 8 }} onClick={() => setWeekOffset(0)}>Today</button>
        )}
      </div>

      {/* Day columns grid */}
      <div className="weekly-grid">
        {days.map((day, i) => {
          const ds = toDateStr(day)
          const dayBlocks = blocks.filter(b => b.date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time))
          const dayTasks = tasks.filter(t => t.due_date === ds && t.status !== 'done')
          const isToday = ds === todayStr
          return (
            <div key={ds} className={`week-col ${isToday ? 'today-col' : ''}`}>
              {/* Header */}
              <div className="week-col-header">
                <span className="week-day-name">{DAY_SHORT[i]}</span>
                <span className={`week-day-num ${isToday ? 'today-num' : ''}`}>{day.getDate()}</span>
              </div>

              {/* Task chips */}
              {dayTasks.length > 0 && (
                <div className="week-task-chips">
                  {dayTasks.map(t => (
                    <div
                      key={t.id}
                      className="week-task-chip"
                      style={{ borderColor: priorityColor(t.priority) }}
                      onClick={() => setTaskForm({ task: t })}
                    >
                      {t.title}
                    </div>
                  ))}
                </div>
              )}

              {/* Time blocks */}
              <div className="week-blocks-area" onClick={() => setBlockForm({ date: ds })}>
                {dayBlocks.length === 0 ? (
                  <div className="week-empty-slot">+ add</div>
                ) : (
                  dayBlocks.map(block => {
                    const proj = projects.find(p => p.id === block.project_id)
                    return (
                      <div
                        key={block.id}
                        className="week-block"
                        style={{ background: block.color + '33', borderLeft: `3px solid ${block.color}` }}
                      >
                        <div className="block-header">
                          <p className="week-block-title" onClick={e => { e.stopPropagation(); setBlockForm({ block, date: ds }) }}>{block.title}</p>
                          <button className="block-delete-btn" onClick={e => { e.stopPropagation(); onDeleteBlock(block.id) }}>✕</button>
                        </div>
                        <p className="week-block-time" onClick={e => { e.stopPropagation(); setBlockForm({ block, date: ds }) }}>{block.start_time.slice(0,5)}–{block.end_time.slice(0,5)}</p>
                        {proj && <p className="week-block-proj">{proj.name}</p>}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unscheduled tasks — below the grid, full width */}
      <div className="unscheduled-section">
        <div className="unscheduled-header">
          <p className="section-label" style={{ marginBottom: 0 }}>Unscheduled Tasks</p>
          <button className="add-btn" onClick={() => setTaskForm({})}>+ Task</button>
        </div>
        {unscheduled.length === 0 ? (
          <p className="empty-msg">All tasks are scheduled 🎉</p>
        ) : (
          <ul className="task-list unscheduled-list">
            {unscheduled.map(task => {
              const proj = projects.find(p => p.id === task.project_id)
              return (
                <li key={task.id} className="task-row">
                  <button className="task-check" onClick={() => onCompleteTask(task)} />
                  <div className="task-info">
                    <p className="task-title">{task.title}</p>
                    <div className="task-meta">
                      <span className="priority-badge" style={{ color: priorityColor(task.priority) }}>● {task.priority}</span>
                      {proj && <span className="task-proj-tag">{proj.name}</span>}
                    </div>
                  </div>
                  <div className="task-actions">
                    <button className="icon-btn" onClick={() => setTaskForm({ task })}>✏️</button>
                    <button className="icon-btn" onClick={() => onDeleteTask(task.id)}>🗑</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {blockForm !== null && (
        <BlockForm
          block={blockForm.block}
          date={blockForm.date}
          projects={projects}
          tasks={tasks}
          habits={habits}
          onSave={async (data) => {
            blockForm.block ? await onEditBlock(blockForm.block.id, data) : await onAddBlock(data)
            setBlockForm(null)
          }}
          onCancel={() => setBlockForm(null)}
        />
      )}
      {taskForm !== null && (
        <TaskForm
          task={taskForm.task}
          projects={projects}
          habits={habits}
          onSave={async (data) => {
            taskForm.task ? await onEditTask(taskForm.task.id, data) : await onAddTask(data)
            setTaskForm(null)
          }}
          onCancel={() => setTaskForm(null)}
        />
      )}
    </div>
  )
}
