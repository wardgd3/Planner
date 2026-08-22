import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useToast } from '../../Toast'
import { todayStr } from '../../utils'
import StockingChecklist from './StockingChecklist'
import { useStockingCounts, clearLocalCounts } from './useStockingCounts'
import { exportCsv, exportPdf } from './stockingExport'

const SESSION_LIMIT = 50

const SAVE_LABEL = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  pending: 'Unsaved',
  error: 'Offline — kept on phone',
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export default function StockingView({ user }) {
  const toast = useToast()

  const [stores, setStores] = useState([])
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  const [activeId, setActiveId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [newForm, setNewForm] = useState(false)
  const [newStoreId, setNewStoreId] = useState('')
  const [newDate, setNewDate] = useState(todayStr())
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [exportTarget, setExportTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const { counts, setCount, saveState, flush } = useStockingCounts(activeId)

  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('stocking_sessions')
      .select('id, store_id, session_date, closed_at, created_at, stocking_entries(item_id, quantity)')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SESSION_LIMIT)
    if (error) { toast.error('Failed to load inventories'); return }
    setSessions(data || [])
  }, [toast])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: st, error: e1 },
      { data: cat, error: e2 },
      { data: it, error: e3 },
    ] = await Promise.all([
      supabase.from('stocking_stores').select('*').eq('has_shane', true).order('sort_order'),
      supabase.from('stocking_categories').select('*').eq('route', 'shane').order('sort_order'),
      supabase.from('stocking_items').select('*').eq('is_active', true).order('sort_order'),
    ])
    if (e1 || e2 || e3) toast.error('Failed to load the item list')
    if (st) { setStores(st); setNewStoreId((prev) => prev || st[0]?.id || '') }
    if (cat) setCategories(cat)
    if (it) setItems(it)
    await fetchSessions()
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  const storeName = useCallback(
    (id) => stores.find((s) => s.id === id)?.name || 'Unknown store',
    [stores],
  )

  /** The open inventory's live counts beat the snapshot fetched with the list. */
  const countsFor = useCallback(
    (session) => {
      if (session.id === activeId) return counts
      const map = {}
      for (const row of session.stocking_entries || []) map[row.item_id] = row.quantity
      return map
    },
    [activeId, counts],
  )

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  )

  const countedTotal = items.filter((i) => counts[i.id] !== undefined).length
  const percent = items.length === 0 ? 0 : Math.round((countedTotal / items.length) * 100)

  async function startInventory() {
    if (!newStoreId) { toast.error('Pick a store first'); return }
    setBusy(true)
    // Re-opens an existing inventory for the same store and date rather than
    // creating a duplicate; the unique index makes that the natural behaviour.
    const { data, error } = await supabase
      .from('stocking_sessions')
      .upsert(
        { user_id: user?.id, store_id: newStoreId, session_date: newDate, closed_at: null },
        { onConflict: 'user_id,store_id,session_date' },
      )
      .select('id, store_id, session_date, closed_at, created_at, stocking_entries(item_id, quantity)')
      .single()
    setBusy(false)

    if (error || !data) { toast.error('Could not start the inventory'); return }

    setSessions((prev) => [data, ...prev.filter((s) => s.id !== data.id)])
    setActiveId(data.id)
    setNewForm(false)
    setShowHistory(false)
    toast.success(`Inventory started — ${storeName(newStoreId)}`)
  }

  async function closeInventory() {
    if (!activeId) return
    setBusy(true)
    await flush() // land any pending keystrokes before closing
    const { error } = await supabase
      .from('stocking_sessions')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', activeId)
    setBusy(false)
    if (error) { toast.error('Could not close the inventory'); return }
    setActiveId(null)
    await fetchSessions()
    toast.success('Inventory closed')
  }

  async function reopenSession(session) {
    const { error } = await supabase
      .from('stocking_sessions')
      .update({ closed_at: null })
      .eq('id', session.id)
    if (error) { toast.error('Could not open that inventory'); return }
    setActiveId(session.id)
    setShowHistory(false)
  }

  async function confirmDelete() {
    const target = deleteConfirm
    if (!target) return
    setBusy(true)
    // stocking_entries cascade on the session foreign key.
    const { error } = await supabase.from('stocking_sessions').delete().eq('id', target.id)
    setBusy(false)
    if (error) { toast.error('Could not delete the inventory'); return }
    clearLocalCounts(target.id)
    if (activeId === target.id) setActiveId(null)
    setSessions((prev) => prev.filter((s) => s.id !== target.id))
    setDeleteConfirm(null)
    toast.success('Inventory deleted')
  }

  function runExport(kind) {
    const session = exportTarget
    if (!session) return
    const payload = {
      storeName: storeName(session.store_id),
      session_date: session.session_date,
    }
    try {
      const n = kind === 'pdf'
        ? exportPdf(payload, categories, items, countsFor(session))
        : exportCsv(payload, categories, items, countsFor(session))
      toast.success(`Exported ${n} ${n === 1 ? 'item' : 'items'} as ${kind.toUpperCase()}`)
    } catch {
      toast.error(`Could not build the ${kind.toUpperCase()}`)
    }
    setExportTarget(null)
  }

  if (loading) return <div className="stk-view"><p className="stk-loading">Loading stocking…</p></div>

  return (
    <div className="stk-view">
      {/* ── Delete confirmation ── */}
      {deleteConfirm && (
        <div className="notes-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="notes-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="notes-confirm-title">Delete inventory?</p>
            <p className="notes-confirm-msg">
              {storeName(deleteConfirm.store_id)} on {formatDate(deleteConfirm.session_date)} — {(deleteConfirm.stocking_entries || []).length} items counted.
              This permanently deletes the counts and cannot be undone.
            </p>
            <div className="notes-confirm-actions">
              <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-btn notes-confirm-delete" onClick={confirmDelete} disabled={busy}>
                {busy ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export format prompt ── */}
      {exportTarget && (
        <div className="notes-confirm-overlay" onClick={() => setExportTarget(null)}>
          <div className="notes-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="notes-confirm-title">Export inventory</p>
            <p className="notes-confirm-msg">
              {storeName(exportTarget.store_id)} — {formatDate(exportTarget.session_date)}
            </p>
            <div className="stk-export-choices">
              <button className="confirm-btn stk-export-btn" onClick={() => runExport('pdf')}>
                <span className="stk-export-kind">PDF</span>
                <span className="stk-export-desc">Organized by category</span>
              </button>
              <button className="confirm-btn stk-export-btn" onClick={() => runExport('csv')}>
                <span className="stk-export-kind">CSV</span>
                <span className="stk-export-desc">One row per item</span>
              </button>
            </div>
            <div className="notes-confirm-actions">
              <button className="cancel-btn" onClick={() => setExportTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="notes-main-head">
        <div className="notes-main-head-left">
          <h2 className="notes-main-title">Stocking</h2>
          <span className="notes-main-count">
            {sessions.length} {sessions.length === 1 ? 'inventory' : 'inventories'}
          </span>
        </div>
        <div className="notes-main-head-right">
          <button
            className={`add-btn stk-history-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory((v) => !v)}
          >
            History
          </button>
          <button className="confirm-btn" onClick={() => setNewForm((v) => !v)}>
            {newForm ? 'Cancel' : '+ New Inventory'}
          </button>
        </div>
      </div>

      {/* ── New inventory form ── */}
      {newForm && (
        <div className="stk-new-form">
          <select
            className="input"
            value={newStoreId}
            onChange={(e) => setNewStoreId(e.target.value)}
            aria-label="Store"
          >
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input
            className="input"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value || todayStr())}
            aria-label="Date"
          />
          <button className="confirm-btn" onClick={startInventory} disabled={busy}>
            {busy ? '…' : 'Start'}
          </button>
        </div>
      )}

      {/* ── History ── */}
      {showHistory && (
        <div className="stk-history">
          {sessions.length === 0 && <p className="empty-msg">No inventories yet</p>}
          {sessions.map((session) => {
            const sessionCounts = countsFor(session)
            const counted = Object.keys(sessionCounts).length
            const units = Object.values(sessionCounts).reduce((a, b) => a + b, 0)
            const isOpen = !session.closed_at
            return (
              <div key={session.id} className={`stk-history-row ${session.id === activeId ? 'current' : ''}`}>
                <div className="stk-history-main">
                  <div className="stk-history-top">
                    <span className="stk-history-store">{storeName(session.store_id)}</span>
                    {session.id === activeId
                      ? <span className="stk-badge current">Current</span>
                      : isOpen && <span className="stk-badge open">Open</span>}
                  </div>
                  <span className="stk-history-meta">
                    {formatDate(session.session_date)} · {counted} items · {units} units
                  </span>
                </div>
                <div className="stk-history-actions">
                  {session.id !== activeId && (
                    <button className="icon-btn" onClick={() => reopenSession(session)} title="Open inventory">
                      Open
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setExportTarget(session)} title="Export">
                    Export
                  </button>
                  <button className="icon-btn stk-del" onClick={() => setDeleteConfirm(session)} title="Delete">
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Active inventory ── */}
      {activeSession ? (
        <>
          <div className="stk-active-head">
            <div className="stk-active-id">
              <span className="stk-active-store">{storeName(activeSession.store_id)}</span>
              <span className="stk-active-date">{formatDate(activeSession.session_date)}</span>
            </div>
            <div className="stk-active-right">
              <span className={`stk-save stk-save-${saveState}`}>{SAVE_LABEL[saveState]}</span>
              <button className="cancel-btn stk-close-btn" onClick={closeInventory} disabled={busy}>
                Close
              </button>
            </div>
          </div>

          <div className="stk-progress">
            <div className="stk-bar"><div className="stk-bar-fill" style={{ width: `${percent}%` }} /></div>
            <span className="stk-progress-count">{countedTotal}/{items.length}</span>
          </div>

          <StockingChecklist
            categories={categories}
            items={items}
            counts={counts}
            onChange={setCount}
          />
        </>
      ) : (
        !showHistory && !newForm && (
          <p className="empty-msg stk-idle">
            Start a new inventory to begin counting, or open a past one from History.
          </p>
        )
      )}
    </div>
  )
}
