import { useState } from 'react'
import ProjectForm from './ProjectForm'
import TaskForm from './TaskForm'

function statusColor(s) {
  return s === 'active' ? '#60a5fa' : s === 'paused' ? '#f7c948' : '#a0a0b0'
}

function priorityColor(p) {
  return p === 'high' ? '#fb7185' : p === 'medium' ? '#f7c948' : '#4ade80'
}

export default function ProjectsView({ projects, tasks, habits, onAddProject, onEditProject, onDeleteProject, onAddTask, onEditTask, onDeleteTask, onCompleteTask }) {
  const [projectForm, setProjectForm] = useState(null)
  const [taskForm, setTaskForm] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const activeProjects = projects.filter(p => p.status !== 'completed')
  const completedProjects = projects.filter(p => p.status === 'completed')

  function getProgress(projectId) {
    const pts = tasks.filter(t => t.project_id === projectId)
    if (pts.length === 0) return 0
    return Math.round((pts.filter(t => t.status === 'done').length / pts.length) * 100)
  }

  function getTaskCounts(projectId) {
    const pts = tasks.filter(t => t.project_id === projectId)
    return { total: pts.length, done: pts.filter(t => t.status === 'done').length, todo: pts.filter(t => t.status !== 'done').length }
  }

  function renderProjectCard(project) {
    const progress = getProgress(project.id)
    const counts = getTaskCounts(project.id)
    const isExpanded = expandedId === project.id
    const projectTasks = tasks.filter(t => t.project_id === project.id && t.status !== 'done')
      .sort((a,b) => { const o = {high:0,medium:1,low:2}; return o[a.priority]-o[b.priority] })
    const doneTasks = tasks.filter(t => t.project_id === project.id && t.status === 'done')

    return (
      <div key={project.id} className={`project-card ${isExpanded ? 'expanded' : ''}`}>
        <div className="project-card-header" onClick={() => setExpandedId(isExpanded ? null : project.id)}>
          <div className="project-card-left">
            <span className="project-color-dot" style={{ background: project.color }} />
            <div>
              <p className="project-name">{project.name}</p>
              {project.description && <p className="project-desc">{project.description}</p>}
            </div>
          </div>
          <div className="project-card-right">
            <span className="status-badge" style={{ color: statusColor(project.status) }}>● {project.status}</span>
            {project.due_date && <span className="project-due">Due {project.due_date}</span>}
            <div className="project-card-actions">
              <button className="icon-btn" onClick={e => { e.stopPropagation(); setProjectForm({ project }) }}>✏️</button>
              <button className="icon-btn" onClick={e => { e.stopPropagation(); onDeleteProject(project.id) }}>🗑</button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-bar-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: progress + '%', background: project.color }} />
          </div>
          <span className="progress-label">{progress}% · {counts.done}/{counts.total} tasks</span>
        </div>

        {/* Expanded task list */}
        {isExpanded && (
          <div className="project-tasks">
            <div className="project-tasks-header">
              <p className="section-label" style={{marginBottom:0}}>Tasks</p>
              <button className="add-btn" style={{fontSize:11, padding:'4px 10px'}} onClick={() => setTaskForm({ projectId: project.id })}>+ Task</button>
            </div>
            {projectTasks.length === 0 && counts.done === 0 && <p className="empty-msg">No tasks yet</p>}
            <ul className="task-list">
              {projectTasks.map(task => (
                <li key={task.id} className="task-row">
                  <button className="task-check" onClick={() => onCompleteTask(task)} />
                  <div className="task-info">
                    <p className="task-title">{task.title}</p>
                    <div className="task-meta">
                      <span className="priority-badge" style={{ color: priorityColor(task.priority) }}>● {task.priority}</span>
                      {task.due_date && <span className="task-time">{task.due_date}</span>}
                    </div>
                  </div>
                  <div className="task-actions">
                    <button className="icon-btn" onClick={() => setTaskForm({ task })}>✏️</button>
                    <button className="icon-btn" onClick={() => onDeleteTask(task.id)}>🗑</button>
                  </div>
                </li>
              ))}
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
        )}
      </div>
    )
  }

  return (
    <div className="projects-view">
      <div className="projects-header">
        <h2 className="section-label">Projects</h2>
        <button className="add-btn" onClick={() => setProjectForm({})}>+ New Project</button>
      </div>

      {activeProjects.length === 0 && <p className="empty-msg">No active projects yet</p>}
      <div className="projects-list">
        {activeProjects.map(renderProjectCard)}
      </div>

      {completedProjects.length > 0 && (
        <details className="completed-projects" open={showCompleted}>
          <summary className="done-summary" onClick={() => setShowCompleted(v => !v)}>
            Completed Projects ({completedProjects.length})
          </summary>
          <div className="projects-list" style={{marginTop:8}}>
            {completedProjects.map(renderProjectCard)}
          </div>
        </details>
      )}

      {projectForm !== null && (
        <ProjectForm
          project={projectForm.project}
          onSave={async (data) => { projectForm.project ? await onEditProject(projectForm.project.id, data) : await onAddProject(data); setProjectForm(null) }}
          onCancel={() => setProjectForm(null)}
        />
      )}
      {taskForm !== null && (
        <TaskForm
          task={taskForm.task}
          projects={projects}
          habits={habits}
          onSave={async (data) => {
            const payload = { ...data, project_id: data.project_id || taskForm.projectId || null }
            taskForm.task ? await onEditTask(taskForm.task.id, payload) : await onAddTask(payload)
            setTaskForm(null)
          }}
          onCancel={() => setTaskForm(null)}
        />
      )}
    </div>
  )
}
