import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'

const FLUSH_DELAY_MS = 600

const cacheKey = (sessionId) => `stocking.counts.${sessionId}`

function readLocal(sessionId) {
  try {
    const raw = localStorage.getItem(cacheKey(sessionId))
    if (!raw) return { counts: {}, dirty: [] }
    const parsed = JSON.parse(raw)
    return { counts: parsed.counts || {}, dirty: parsed.dirty || [] }
  } catch {
    return { counts: {}, dirty: [] }
  }
}

function writeLocal(sessionId, counts, dirty) {
  try {
    localStorage.setItem(cacheKey(sessionId), JSON.stringify({ counts, dirty }))
  } catch {
    // Quota or private mode. The server copy is still authoritative.
  }
}

export function clearLocalCounts(sessionId) {
  try {
    localStorage.removeItem(cacheKey(sessionId))
  } catch {
    // Nothing to do.
  }
}

/**
 * Counts for one inventory, keyed by item id.
 *
 * A missing key means "not counted yet"; 0 means "counted, none on shelf".
 * Every keystroke lands in state and localStorage immediately, then a debounced
 * flush pushes only the changed rows to Supabase. Anything that fails to send
 * stays marked dirty and retries on the next edit, when the tab is hidden, and
 * when the network comes back — so a dead signal in the back of a store never
 * loses a count.
 */
export function useStockingCounts(sessionId) {
  const [counts, setCounts] = useState({})
  const [saveState, setSaveState] = useState('idle')
  const [loading, setLoading] = useState(false)

  const countsRef = useRef({})
  const dirtyRef = useRef(new Set())
  const timerRef = useRef(null)

  const flush = useCallback(async () => {
    if (!sessionId) return
    const pending = [...dirtyRef.current]
    if (pending.length === 0) return

    setSaveState('saving')
    try {
      const current = countsRef.current
      const rows = pending
        .filter((id) => current[id] !== undefined)
        .map((id) => ({ session_id: sessionId, item_id: id, quantity: current[id] }))
      const cleared = pending.filter((id) => current[id] === undefined)

      if (rows.length > 0) {
        const { error } = await supabase
          .from('stocking_entries')
          .upsert(rows, { onConflict: 'session_id,item_id' })
        if (error) throw error
      }
      if (cleared.length > 0) {
        const { error } = await supabase
          .from('stocking_entries')
          .delete()
          .eq('session_id', sessionId)
          .in('item_id', cleared)
        if (error) throw error
      }

      pending.forEach((id) => dirtyRef.current.delete(id))
      writeLocal(sessionId, countsRef.current, [...dirtyRef.current])
      setSaveState(dirtyRef.current.size > 0 ? 'pending' : 'saved')
    } catch {
      setSaveState('error')
    }
  }, [sessionId])

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { flush() }, FLUSH_DELAY_MS)
  }, [flush])

  // Load: cached copy first so the list is usable instantly, then the server.
  useEffect(() => {
    if (!sessionId) {
      countsRef.current = {}
      dirtyRef.current = new Set()
      setCounts({})
      setSaveState('idle')
      return
    }

    let cancelled = false
    const cached = readLocal(sessionId)
    countsRef.current = cached.counts
    dirtyRef.current = new Set(cached.dirty)
    setCounts(cached.counts)
    setSaveState(cached.dirty.length > 0 ? 'pending' : 'idle')
    setLoading(true)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('stocking_entries')
          .select('item_id, quantity')
          .eq('session_id', sessionId)
        if (error) throw error
        if (cancelled) return

        // Unsent local edits win; everything else comes from the server.
        const merged = {}
        for (const row of data || []) merged[row.item_id] = row.quantity
        for (const id of dirtyRef.current) {
          const local = countsRef.current[id]
          if (local === undefined) delete merged[id]
          else merged[id] = local
        }

        countsRef.current = merged
        setCounts(merged)
        writeLocal(sessionId, merged, [...dirtyRef.current])
      } catch {
        if (!cancelled) setSaveState((s) => (s === 'pending' ? 'pending' : 'error'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [sessionId])

  // Retry pending writes when the tab goes away or the network returns.
  useEffect(() => {
    const retry = () => { flush() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('online', retry)
    window.addEventListener('pagehide', retry)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', retry)
      window.removeEventListener('pagehide', retry)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  const setCount = useCallback((itemId, value) => {
    if (!sessionId) return
    const next = { ...countsRef.current }
    if (value === null) delete next[itemId]
    else next[itemId] = value

    countsRef.current = next
    dirtyRef.current.add(itemId)
    setCounts(next)
    setSaveState('pending')
    writeLocal(sessionId, next, [...dirtyRef.current])
    scheduleFlush()
  }, [sessionId, scheduleFlush])

  return { counts, setCount, saveState, loading, flush }
}
