import { useState, useMemo } from 'react'
import BlockForm from './BlockForm'
import TaskForm from './TaskForm'
import { HOURS, DAY_NAMES, MONTHS_FULL } from '../constants'
import { fmt12, timeToMinutes, priorityColor } from '../utils'

export default function TodayView({ tasks, blocks, projects, habits, glossaryItems = [], onAddBlock, onEditBlock, onDeleteBlock, onAddTask, onEditTask, onDeleteTask, onCompleteTask, todayStr }) {
  const [blockForm, setBlockForm] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const [quickAdd, setQuickAdd] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  const todayBlocks = useMemo(
    () => blocks.filter(b => b.date === todayStr).sort((a, b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99')),
    [blocks, todayStr]
  )
  const todayTasks = useMemo(
    () => tasks.filter(t => t.due_date === todayStr && t.status !== 'done')
      .sort((a, b) => { const order = { high: 0, medium: 1, low: 2 }; return order[a.priority] - order[b.priority] }),
    [tasks, todayStr]
  )
  const doneTasks = useMemo(
    () => tasks.filter(t => t.due_date === todayStr && t.status === 'done'),
    [tasks, todayStr]
  )

  function getBlockStyle(block) {
    const start = timeToMinutes(block.start_time.slice(0, 5))
    const end = timeToMinutes(block.end_time.slice(0, 5))
    const top = ((start - 6 * 60) / 60) * 64
    const height = Math.max(((end - start) / 60) * 64, 28)
    return { top, height }
  }

  async function handleQuickAdd(e) {
    if (e.key === 'Enter' && quickAdd.trim()) {
      await onAddTask({ title: quickAdd.trim(), due_date: todayStr, priority: 'medium', status: 'todo' })
      setQuickAdd('')
    }
  }

  const now = new Date()
  const dateLabel = `${DAY_NAMES[now.getDay()]}, ${MONTHS_FULL[now.getMonth()]} ${now.getDate()}`

  return (
    <div className="today-view">
      <div className="today-date-header">
        <span className="today-date-label">{dateLabel}</span>
        <div className="today-actions">
          <button className="add-btn" onClick={() => setBlockForm({})}>+ Block</button>
          <button className="add-btn" onClick={() => setTaskForm({})}>+ Task</button>
        </div>
      </div>

      {/* Timeline */}
      <div className="timeline-wrap">
        <div className="timeline">
          {HOURS.map(h => (
            <div key={h} className="timeline-row" onClick={() => setBlockForm({ startTime: `${String(h).padStart(2, '0')}:00` })}>
              <span className="timeline-hour">{fmt12(h)}</span>
              <div className="timeline-slot" />
            </div>
          ))}
          <div className="timeline-blocks">
            {todayBlocks.filter(b => b.start_time && b.end_time).map(block => {
              const { top, height } = getBlockStyle(block)
              const proj = projects.find(p => p.id === block.project_id)
              return (
                <div key={block.id} className="timeline-block" style={{ top, height, background: 'var(--block-bg)', borderLeft: '3px solid var(--block-border)' }}>
                  <div className="block-header">
                    <p className="block-title" onClick={e => { e.stopPropagation(); setBlockForm({ block }) }}>{block.title}</p>
                    <button className="block-delete-btn" onClick={e => { e.stopPropagation(); onDeleteBlock(block.id) }} aria-label="Delete block">✕</button>
                  </div>
                  <p className="block-meta" onClick={e => { e.stopPropagation(); setBlockForm({ block }) }}>{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}{proj ? ` · ${proj.name}` : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="today-tasks">
        <p className="section-label" style={{ marginBottom: 12 }}>Tasks Due Today {todayTasks.length > 0 && <span className="count-badge">{todayTasks.length}</span>}</p>
        {todayTasks.length === 0 && <p className="empty-msg">No tasks due today</p>}
        <ul className="task-list">
          {todayTasks.map(task => {
            const proj = projects.find(p => p.id === task.project_id)
            const isExpanded = expandedTaskId === task.id
            const hasNotes = !!(task.notes && task.notes.trim())
            return (
              <li key={task.id} className={`task-row ${isExpanded ? 'expanded' : ''}`}>
                <button className="task-check" onClick={() => onCompleteTask(task)} aria-label="Complete task" />
                <div className="task-info" onClick={() => setExpandedTaskId(isExpanded ? null : task.id)} style={{ cursor: 'pointer' }}>
                  <p className="task-title">
                    {task.title}
                    {hasNotes && <span className="task-notes-indicator" aria-label="Has notes">📝</span>}
                  </p>
                  <div className="task-meta">
                    <span className="priority-badge" style={{ color: priorityColor(task.priority) }}>● {task.priority}</span>
                    {proj && <span className="task-proj-tag">{proj.name}</span>}
                    {task.due_time && <span className="task-time">{task.due_time.slice(0, 5)}</span>}
                  </div>
                  {isExpanded && hasNotes && (
                    <p className="task-notes-expanded">{task.notes}</p>
                  )}
                </div>
                <div className="task-actions">
                  <button className="icon-btn" onClick={() => setTaskForm({ task })} aria-label="Edit task">✏️</button>
                  <button className="icon-btn" onClick={() => onDeleteTask(task.id)} aria-label="Delete task">🗑</button>
                </div>
              </li>
            )
          })}
        </ul>

        {doneTasks.length > 0 && (
          <details className="done-tasks">
            <summary className="done-summary">Completed ({doneTasks.length})</summary>
            <ul className="task-list">
              {doneTasks.map(task => (
                <li key={task.id} className="task-row done">
                  <span className="task-check done">✓</span>
                  <p className="task-title done-title">{task.title}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Quick add */}
      <div className="quick-add-bar">
        <input className="input quick-add-input" placeholder="Quick add task for today… (Enter to save)" value={quickAdd} onChange={e => setQuickAdd(e.target.value)} onKeyDown={handleQuickAdd} />
      </div>

      {blockForm !== null && (
        <BlockForm
          block={blockForm.block}
          date={todayStr}
          startTime={blockForm.startTime}
          projects={projects}
          tasks={tasks}
          habits={habits}
          glossaryItems={glossaryItems}
          existingBlocks={todayBlocks}
          onSave={async (data) => { blockForm.block ? await onEditBlock(blockForm.block.id, data) : await onAddBlock(data); setBlockForm(null) }}
          onCancel={() => setBlockForm(null)}
        />
      )}
      {taskForm !== null && (
        <TaskForm
          task={taskForm.task}
          projects={projects}
          habits={habits}
          onSave={async (data) => { taskForm.task ? await onEditTask(taskForm.task.id, data) : await onAddTask({ ...data, due_date: data.due_date || todayStr }); setTaskForm(null) }}
          onCancel={() => setTaskForm(null)}
        />
      )}
    </div>
  )
}
