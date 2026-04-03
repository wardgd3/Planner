import { MONTHS } from './constants'

/** Format 24h hour to 12h string (e.g. 14 → "2 PM") */
export function fmt12(h) {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Convert "HH:MM" string to total minutes */
export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Convert total minutes to "HH:MM" string */
export function minutesToTime(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

/** Get priority color */
export function priorityColor(p) {
  return p === 'high' ? '#fb7185' : p === 'medium' ? '#f7c948' : '#4ade80'
}

/** Get status color */
export function statusColor(s) {
  return s === 'active' ? '#60a5fa' : s === 'paused' ? '#f7c948' : '#a0a0b0'
}

/** Get human-readable period label */
export function getPeriodLabel(period) {
  const now = new Date()
  if (period === 'Day') return `Today, ${MONTHS[now.getMonth()]} ${now.getDate()}`
  if (period === 'Week') return 'This Week'
  if (period === 'Month') return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`
  return `${now.getFullYear()}`
}

/** Get start/end ISO strings for a period */
export function getPeriodRange(period) {
  const now = new Date()
  const start = new Date()
  if (period === 'Day') { start.setHours(0, 0, 0, 0) }
  else if (period === 'Week') { start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0) }
  else if (period === 'Month') { start.setDate(1); start.setHours(0, 0, 0, 0) }
  else { start.setMonth(0, 1); start.setHours(0, 0, 0, 0) }
  return { start: start.toISOString(), end: now.toISOString() }
}

/** Today as YYYY-MM-DD (local timezone) */
export function todayStr() {
  return toDateStr(new Date())
}

/** Date object to YYYY-MM-DD (local timezone) */
export function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Get week days array starting from Monday, with optional week offset */
export function getWeekDays(offset = 0) {
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

/** Compute end time string given a start "HH:MM" and duration in minutes */
export function computeEndTime(startTime, durationMinutes) {
  const totalMinutes = timeToMinutes(startTime) + durationMinutes
  return minutesToTime(totalMinutes)
}

/** Check if two time ranges overlap */
export function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = timeToMinutes(start1), e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2), e2 = timeToMinutes(end2)
  return s1 < e2 && s2 < e1
}
