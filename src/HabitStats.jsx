import { useMemo } from 'react'

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MILESTONES = [3, 7, 14, 21, 30, 60, 100, 180, 365, 500, 730, 1000]
const HEATMAP_WEEKS = 17  // ~4 months — well above the 12-week minimum

function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function withAlpha(hex, alpha) {
  const h = (hex || '#60a5fa').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function heatLevel(count) {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

export default function HabitStats({ habit, logs, onClose }) {
  const stats = useMemo(() => {
    const habitLogs = logs.filter(l => l.habit_id === habit.id)

    // Map of date-key → count of completions on that day
    const countsByDate = new Map()
    for (const l of habitLogs) {
      const key = dateKey(new Date(l.logged_at))
      countsByDate.set(key, (countsByDate.get(key) || 0) + 1)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Current streak — walk backward from today
    let currentStreak = 0
    for (let i = 0; ; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (countsByDate.has(dateKey(d))) currentStreak++
      else break
    }

    // Longest streak — scan all completion dates
    const sortedKeys = Array.from(countsByDate.keys()).sort()
    let longestStreak = 0
    let running = 0
    let prev = null
    for (const key of sortedKeys) {
      const d = new Date(key + 'T00:00:00')
      if (prev) {
        const diff = Math.round((d - prev) / 86400000)
        running = diff === 1 ? running + 1 : 1
      } else {
        running = 1
      }
      if (running > longestStreak) longestStreak = running
      prev = d
    }

    // Weekly completion — last 7 days (including today)
    let weekCompleted = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (countsByDate.has(dateKey(d))) weekCompleted++
    }
    const weeklyRate = Math.round((weekCompleted / 7) * 100)

    // Overall completion rate — from habit creation (or first log) to today
    const habitStart = habit.created_at ? new Date(habit.created_at) : null
    let firstDay
    if (habitStart) {
      firstDay = new Date(habitStart.getFullYear(), habitStart.getMonth(), habitStart.getDate())
    } else if (sortedKeys.length) {
      firstDay = new Date(sortedKeys[0] + 'T00:00:00')
    } else {
      firstDay = new Date(today)
    }
    const totalTrackedDays = Math.max(1, Math.round((today - firstDay) / 86400000) + 1)
    const daysCompleted = countsByDate.size
    const overallRate = Math.round((daysCompleted / totalTrackedDays) * 100)

    // Best day of week — highest completion rate across the tracking window
    const dowCompleted = [0, 0, 0, 0, 0, 0, 0]
    const dowTotal = [0, 0, 0, 0, 0, 0, 0]
    for (let i = 0; i < totalTrackedDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dow = d.getDay()
      dowTotal[dow]++
      if (countsByDate.has(dateKey(d))) dowCompleted[dow]++
    }
    let bestDow = 0
    let bestDowRate = -1
    for (let i = 0; i < 7; i++) {
      if (dowTotal[i] > 0) {
        const rate = dowCompleted[i] / dowTotal[i]
        if (rate > bestDowRate) {
          bestDowRate = rate
          bestDow = i
        }
      }
    }

    // Heatmap cells — column-major: columns are weeks, rows are weekdays (Sun top)
    const cells = []
    const endDow = today.getDay()
    const firstSunday = new Date(today)
    firstSunday.setDate(firstSunday.getDate() - endDow - (HEATMAP_WEEKS - 1) * 7)
    for (let col = 0; col < HEATMAP_WEEKS; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(firstSunday)
        d.setDate(d.getDate() + col * 7 + row)
        const future = d > today
        cells.push({
          date: d,
          count: future ? 0 : (countsByDate.get(dateKey(d)) || 0),
          future,
        })
      }
    }

    // Next milestone — next streak threshold above current streak
    const nextMilestone = MILESTONES.find(m => m > currentStreak) ??
      (Math.ceil((currentStreak + 1) / 1000) * 1000)
    const daysToMilestone = nextMilestone - currentStreak

    // Total invested
    const totalLogs = habitLogs.length
    let totalMinutes = 0
    let hasDuration = false
    if (habit.start_time && habit.end_time) {
      const [sh, sm] = habit.start_time.split(':').map(Number)
      const [eh, em] = habit.end_time.split(':').map(Number)
      const perCompletion = (eh * 60 + em) - (sh * 60 + sm)
      if (perCompletion > 0) {
        hasDuration = true
        totalMinutes = perCompletion * totalLogs
      }
    }

    return {
      currentStreak,
      longestStreak,
      weeklyRate,
      overallRate,
      bestDow,
      bestDowRate: bestDowRate < 0 ? 0 : Math.round(bestDowRate * 100),
      cells,
      nextMilestone,
      daysToMilestone,
      totalLogs,
      totalMinutes,
      hasDuration,
    }
  }, [habit, logs])

  const invested = stats.hasDuration
    ? { value: (stats.totalMinutes / 60).toFixed(stats.totalMinutes >= 600 ? 0 : 1) + 'h', label: 'total invested' }
    : { value: stats.totalLogs, label: 'total completions' }

  const milestoneProgress = Math.min(100, (stats.currentStreak / stats.nextMilestone) * 100)
  const color = habit.color || '#60a5fa'

  return (
    <div className="habit-stats">
      <div className="habit-stats-header">
        <div className="habit-stats-title">
          <span className="habit-dot" style={{ background: color }} />
          <h2>{habit.name}</h2>
        </div>
        <button className="habit-stats-close" onClick={onClose} aria-label="Close stats">✕</button>
      </div>

      <div className="habit-stats-hero">
        <div className="habit-stat-hero-item">
          <div className="habit-stat-value-xl" style={{ color }}>{stats.currentStreak}</div>
          <div className="habit-stat-label">day streak</div>
        </div>
        <div className="habit-stat-hero-item">
          <div className="habit-stat-value-xl" style={{ color }}>{stats.overallRate}%</div>
          <div className="habit-stat-label">completion rate</div>
        </div>
      </div>

      <div className="habit-heatmap-wrap">
        <div className="habit-heatmap-legend">
          <span className="habit-stat-label">Activity — last {HEATMAP_WEEKS} weeks</span>
          <div className="heatmap-scale">
            <span>Less</span>
            <span className="heatmap-cell level-0" />
            <span className="heatmap-cell" style={{ background: withAlpha(color, 0.3) }} />
            <span className="heatmap-cell" style={{ background: withAlpha(color, 0.55) }} />
            <span className="heatmap-cell" style={{ background: withAlpha(color, 0.8) }} />
            <span className="heatmap-cell" style={{ background: color }} />
            <span>More</span>
          </div>
        </div>
        <div className="habit-heatmap" style={{ '--heatmap-cols': HEATMAP_WEEKS }}>
          {stats.cells.map((cell, i) => {
            const level = heatLevel(cell.count)
            const bg = level === 0
              ? undefined
              : withAlpha(color, 0.3 + (level - 1) * 0.25)
            return (
              <div
                key={i}
                className={`heatmap-cell level-${level}${cell.future ? ' future' : ''}`}
                style={bg ? { background: bg } : undefined}
                title={`${cell.date.toLocaleDateString()} — ${cell.count} ${cell.count === 1 ? 'completion' : 'completions'}`}
              />
            )
          })}
        </div>
      </div>

      <div className="habit-milestone">
        <div className="habit-milestone-label">
          <span className="habit-stat-label">Next milestone</span>
          <span className="habit-milestone-target">
            {stats.currentStreak === 0
              ? `Start today for a ${stats.nextMilestone}-day streak`
              : `${stats.daysToMilestone} more ${stats.daysToMilestone === 1 ? 'day' : 'days'} to ${stats.nextMilestone}-day streak`}
          </span>
        </div>
        <div className="habit-milestone-bar">
          <div
            className="habit-milestone-fill"
            style={{ width: `${milestoneProgress}%`, background: color }}
          />
        </div>
      </div>

      <div className="habit-stats-secondary">
        <div className="habit-stat-item">
          <div className="habit-stat-value">{stats.longestStreak}</div>
          <div className="habit-stat-label">longest streak</div>
        </div>
        <div className="habit-stat-item">
          <div className="habit-stat-value">{stats.weeklyRate}%</div>
          <div className="habit-stat-label">this week</div>
        </div>
        <div className="habit-stat-item">
          <div className="habit-stat-value" title={`${stats.bestDowRate}% completion`}>
            {DAY_NAMES_SHORT[stats.bestDow]}
          </div>
          <div className="habit-stat-label">best {DAY_NAMES_FULL[stats.bestDow].toLowerCase()}</div>
        </div>
        <div className="habit-stat-item">
          <div className="habit-stat-value">{invested.value}</div>
          <div className="habit-stat-label">{invested.label}</div>
        </div>
      </div>
    </div>
  )
}
