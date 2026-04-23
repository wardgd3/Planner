import { supabase } from '../supabase'

const DAY_MS = 86400000

function addDays(date, n) {
  const out = new Date(date)
  out.setDate(out.getDate() + n)
  return out
}

export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(s) {
  return new Date(s + 'T00:00:00')
}

/**
 * Produce all Date objects matching the series rule between `startDate` and `throughDate` (inclusive).
 * `series` is a row from planner_task_series.
 */
export function generateOccurrenceDates(series, startDate, throughDate) {
  const results = []
  const seriesStart = parseISODate(series.start_date)
  const from = startDate > seriesStart ? new Date(startDate) : new Date(seriesStart)
  from.setHours(0, 0, 0, 0)
  let to = new Date(throughDate)
  to.setHours(0, 0, 0, 0)
  if (series.end_date) {
    const e = parseISODate(series.end_date)
    if (e < to) to = e
  }
  if (from > to) return results

  if (series.recurrence_type === 'daily') {
    const interval = series.recurrence_interval || 1
    const startOffset = Math.max(0, Math.round((from - seriesStart) / DAY_MS))
    const firstOffset = Math.ceil(startOffset / interval) * interval
    for (let offset = firstOffset; ; offset += interval) {
      const d = addDays(seriesStart, offset)
      if (d > to) break
      if (d >= from) results.push(d)
      if (offset > 365 * 5) break
    }
  } else if (series.recurrence_type === 'weekly') {
    const interval = series.recurrence_interval || 1
    const weekdays = (Array.isArray(series.recurrence_weekdays) && series.recurrence_weekdays.length > 0)
      ? new Set(series.recurrence_weekdays)
      : new Set([seriesStart.getDay()])
    const startWeekSunday = addDays(seriesStart, -seriesStart.getDay())
    for (let week = 0; week < 52 * 5; week++) {
      const weekSunday = addDays(startWeekSunday, week * 7)
      if (weekSunday > to) break
      if (week % interval !== 0) continue
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekSunday, i)
        if (d < seriesStart) continue
        if (d < from) continue
        if (d > to) break
        if (weekdays.has(d.getDay())) results.push(d)
      }
    }
  } else if (series.recurrence_type === 'monthly') {
    const interval = series.recurrence_interval || 1
    const dom = series.recurrence_day_of_month || seriesStart.getDate()
    let y = seriesStart.getFullYear()
    let m = seriesStart.getMonth()
    for (let monthsElapsed = 0; monthsElapsed < 12 * 5; monthsElapsed++) {
      if (monthsElapsed % interval === 0) {
        const lastDay = new Date(y, m + 1, 0).getDate()
        const actualDom = Math.min(dom, lastDay)
        const d = new Date(y, m, actualDom)
        if (d > to) break
        if (d >= from && d >= seriesStart) results.push(d)
      }
      m++
      if (m > 11) { m = 0; y++ }
    }
  }

  return results
}

/**
 * Ensure all active series have task instances created up to `throughDate`.
 * Idempotent: uses a unique index on (series_id, occurrence_date) so re-runs are safe.
 * Default horizon: today + 35 days (~one month ahead).
 */
export async function ensureSeriesScheduled({ throughDate } = {}) {
  const horizon = throughDate ? new Date(throughDate) : addDays(new Date(), 35)
  horizon.setHours(0, 0, 0, 0)

  const { data: seriesList, error } = await supabase
    .from('planner_task_series')
    .select('*')
    .eq('is_active', true)
  if (error || !seriesList || seriesList.length === 0) return { created: 0 }

  let totalCreated = 0
  for (const series of seriesList) {
    const startFrom = series.last_scheduled_through
      ? addDays(parseISODate(series.last_scheduled_through), 1)
      : parseISODate(series.start_date)
    if (startFrom > horizon) continue

    const dates = generateOccurrenceDates(series, startFrom, horizon)
    if (dates.length > 0) {
      // Fetch existing occurrences in the date range so we skip duplicates (index would also catch this, but this avoids error noise)
      const { data: existing } = await supabase
        .from('planner_tasks')
        .select('occurrence_date')
        .eq('series_id', series.id)
        .gte('occurrence_date', toISODate(dates[0]))
        .lte('occurrence_date', toISODate(dates[dates.length - 1]))
      const existingSet = new Set((existing || []).map(r => r.occurrence_date))
      const missing = dates.filter(d => !existingSet.has(toISODate(d)))
      if (missing.length > 0) {
        const rows = missing.map(d => ({
          title: series.title,
          notes: series.notes,
          priority: series.priority,
          project_id: series.project_id,
          habit_id: series.habit_id,
          due_date: toISODate(d),
          due_time: series.due_time,
          status: 'todo',
          series_id: series.id,
          occurrence_date: toISODate(d),
        }))
        const { error: insErr } = await supabase.from('planner_tasks').insert(rows)
        if (!insErr) totalCreated += rows.length
      }
    }

    await supabase.from('planner_task_series')
      .update({ last_scheduled_through: toISODate(horizon) })
      .eq('id', series.id)
  }

  return { created: totalCreated }
}

/**
 * Create a recurring series plus its instances up to the horizon.
 * `taskFields` is the base task (title, notes, priority, project_id, habit_id, due_time).
 * `recurrence` is { recurrence_type, recurrence_interval, recurrence_weekdays, recurrence_day_of_month, start_date, end_date }.
 */
export async function createSeries(taskFields, recurrence) {
  const seriesRow = {
    title: taskFields.title,
    notes: taskFields.notes,
    priority: taskFields.priority || 'medium',
    project_id: taskFields.project_id || null,
    habit_id: taskFields.habit_id || null,
    due_time: taskFields.due_time || null,
    recurrence_type: recurrence.recurrence_type,
    recurrence_interval: recurrence.recurrence_interval || 1,
    recurrence_weekdays: recurrence.recurrence_weekdays || null,
    recurrence_day_of_month: recurrence.recurrence_day_of_month || null,
    start_date: recurrence.start_date,
    end_date: recurrence.end_date || null,
    is_active: true,
  }
  const { data: series, error } = await supabase
    .from('planner_task_series')
    .insert(seriesRow)
    .select()
    .single()
  if (error) return { error }
  const result = await ensureSeriesScheduled({})
  return { series, created: result.created }
}

/**
 * Update a series rule and regenerate its future (incomplete) occurrences.
 * Deletes future un-completed instances for this series, then re-runs the scheduler.
 */
export async function updateSeriesRule(seriesId, updates) {
  const { data: series, error: e1 } = await supabase
    .from('planner_task_series')
    .update({ ...updates, last_scheduled_through: null, updated_at: new Date().toISOString() })
    .eq('id', seriesId)
    .select()
    .single()
  if (e1) return { error: e1 }
  const today = toISODate(new Date())
  // Delete future incomplete occurrences (completed ones remain as historical record)
  await supabase
    .from('planner_tasks')
    .delete()
    .eq('series_id', seriesId)
    .gte('occurrence_date', today)
    .is('completed_at', null)
  const result = await ensureSeriesScheduled({})
  return { series, created: result.created }
}

/**
 * Upsert a template title into the user's library. Safe to call repeatedly;
 * duplicates are ignored via the (user_id, title) unique constraint.
 */
export async function upsertTemplate(title) {
  const clean = (title || '').trim()
  if (!clean) return
  await supabase
    .from('planner_task_templates')
    .upsert({ title: clean }, { onConflict: 'user_id,title', ignoreDuplicates: true })
}
