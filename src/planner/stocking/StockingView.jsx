import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { useToast } from '../../Toast'
import { todayStr } from '../../utils'
import StockingChecklist from './StockingChecklist'
import { buildSections } from './stockingSections'
import StockingGlossary from './StockingGlossary'
import StockingVoice from './StockingVoice'
import { useStockingCounts, clearLocalCounts } from './useStockingCounts'
import { exportCsv, exportPdf } from './stockingExport'

const INVENTORY_LIMIT = 50

// Height of the app tab bar, which the toolbar sticks beneath. Mirrors
// --stk-tabs-h in App.css.
const TAB_BAR_H = 50

const SAVE_LABEL = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  pending: 'Unsaved',
  error: 'Offline — kept on phone',
}

const INVENTORY_SELECT =
  'id, inventory_date, closed_at, created_at, stocking_sessions(id, store_id, stocking_entries(item_id, quantity))'

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

function countsFromEntries(entries) {
  const map = {}
  for (const row of entries || []) map[row.item_id] = row.quantity
  return map
}

export default function StockingView({ user }) {
  const toast = useToast()

  const [stores, setStores] = useState([])
  const [categories, setCategories] = useState([])
  const [companies, setCompanies] = useState([])
  const [allItems, setAllItems] = useState([])
  const [inventories, setInventories] = useState([])
  const [loading, setLoading] = useState(true)

  const [activeInvId, setActiveInvId] = useState(null)
  const [activeStoreId, setActiveStoreId] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [switching, setSwitching] = useState(false)

  const [section, setSection] = useState('inventories')
  const [termFormOpen, setTermFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const sectionRefs = useRef({})
  const [newForm, setNewForm] = useState(false)
  const [newDate, setNewDate] = useState(todayStr())
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [exportTarget, setExportTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const { counts, setCount, saveState, flush } = useStockingCounts(sessionId)

  const fetchInventories = useCallback(async () => {
    const { data, error } = await supabase
      .from('stocking_inventories')
      .select(INVENTORY_SELECT)
      .order('inventory_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(INVENTORY_LIMIT)
    if (error) { toast.error('Failed to load inventories'); return }
    setInventories(data || [])
  }, [toast])

  async function fetchAll() {
    setLoading(true)
    const [
      { data: st, error: e1 },
      { data: cat, error: e2 },
      { data: it, error: e3 },
      { data: co, error: e4 },
    ] = await Promise.all([
      supabase.from('stocking_stores').select('*').eq('has_shane', true).order('sort_order'),
      supabase.from('stocking_categories').select('*').eq('route', 'shane').order('sort_order'),
      supabase.from('stocking_items').select('*').order('sort_order'),
      supabase.from('stocking_companies').select('*').order('sort_order'),
    ])
    if (e1 || e2 || e3 || e4) toast.error('Failed to load the item list')
    if (st) setStores(st)
    if (cat) setCategories(cat)
    if (it) setAllItems(it)
    if (co) setCompanies(co)
    await fetchInventories()
    setLoading(false)
  }

  /** Re-read the catalog after the Glossary edits it. */
  const refetchItems = useCallback(async () => {
    const { data, error } = await supabase.from('stocking_items').select('*').order('sort_order')
    if (error) { toast.error('Could not reload the item list'); return }
    setAllItems(data || [])
  }, [toast])

  // Retired items stay out of checklists but remain in exports, so past
  // inventories still show everything that was counted at the time.
  const items = useMemo(() => allItems.filter((i) => i.is_active), [allItems])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  const storeName = useCallback(
    (id) => stores.find((s) => s.id === id)?.name || 'Unknown store',
    [stores],
  )

  const activeInv = useMemo(
    () => inventories.find((i) => i.id === activeInvId) || null,
    [inventories, activeInvId],
  )

  /**
   * Counts per store for one inventory. The leg being edited right now reads
   * from live state so History totals and exports stay current as you type.
   */
  const legsFor = useCallback(
    (inv) =>
      (inv.stocking_sessions || []).map((leg) => ({
        storeId: leg.store_id,
        storeName: storeName(leg.store_id),
        counts: leg.id === sessionId ? counts : countsFromEntries(leg.stocking_entries),
      })),
    [storeName, sessionId, counts],
  )

  const invTotals = useCallback(
    (inv) => {
      const legs = legsFor(inv)
      let itemsCounted = 0
      let units = 0
      let locations = 0
      for (const leg of legs) {
        const n = Object.keys(leg.counts).length
        if (n > 0) locations++
        itemsCounted += n
        units += Object.values(leg.counts).reduce((a, b) => a + b, 0)
      }
      return { locations, itemsCounted, units }
    },
    [legsFor],
  )

  /**
   * Collapse the toolbar once it pins. Driven off a sentinel sitting where the
   * toolbar starts in flow, compared against the same offset the toolbar
   * sticks at, so the collapse lands on the frame it actually pins.
   */
  const sentinelRef = useRef(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) { setPinned(false); return }
    // Read straight from the scroll handler rather than deferring to rAF: it
    // is a read with no interleaved writes, so it hits cached layout, and
    // setting the same boolean again is a no-op React bails out of.
    const check = () => setPinned(el.getBoundingClientRect().top < TAB_BAR_H)
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [activeInvId, section])

  /** Re-read one inventory with all its legs and entries. */
  const refreshInventory = useCallback(async (invId) => {
    const { data, error } = await supabase
      .from('stocking_inventories')
      .select(INVENTORY_SELECT)
      .eq('id', invId)
      .maybeSingle()
    if (error || !data) return null
    setInventories((prev) => prev.map((i) => (i.id === invId ? data : i)))
    return data
  }, [])

  // Opening a location inside the active inventory creates its leg on demand.
  useEffect(() => {
    if (!activeInvId || !activeStoreId) { setSessionId(null); return }

    let cancelled = false
    setSwitching(true)
    ;(async () => {
      // Land counts from the location we are leaving, then re-read the
      // inventory so that leg's saved entries replace its stale snapshot.
      // Without this, History totals and exports would miss everything
      // counted at a location before switching away from it.
      await flush()

      const { data, error } = await supabase
        .from('stocking_sessions')
        .upsert(
          { user_id: user?.id, inventory_id: activeInvId, store_id: activeStoreId },
          { onConflict: 'inventory_id,store_id' },
        )
        .select('id')
        .single()
      if (cancelled) return
      if (error || !data) {
        setSwitching(false)
        toast.error('Could not open that location')
        return
      }

      await refreshInventory(activeInvId)
      if (cancelled) return
      setSessionId(data.id)
      setSwitching(false)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInvId, activeStoreId])

  const countedTotal = items.filter((i) => counts[i.id] !== undefined).length
  const percent = items.length === 0 ? 0 : Math.round((countedTotal / items.length) * 100)

  // Built here so the toolbar chips and the list below share one set of counts.
  const sections = useMemo(
    () => buildSections({ categories, items, counts, query, companyId: companyFilter }),
    [categories, items, counts, query, companyFilter],
  )
  const activeCompany = companies.find((co) => co.id === companyFilter) || null

  function jumpTo(categoryId) {
    const el = sectionRefs.current[categoryId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Bring a voice-matched row into view and flash it, so you can see the hit. */
  const locateItem = useCallback((itemId) => {
    const row = document.querySelector(`[data-item-id="${itemId}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.classList.add('flash')
    setTimeout(() => row.classList.remove('flash'), 1200)
  }, [])

  async function startInventory() {
    setBusy(true)
    const { data, error } = await supabase
      .from('stocking_inventories')
      .insert({ user_id: user?.id, inventory_date: newDate })
      .select(INVENTORY_SELECT)
      .single()
    setBusy(false)
    if (error || !data) { toast.error('Could not start the inventory'); return }

    setInventories((prev) => [data, ...prev])
    setActiveInvId(data.id)
    setActiveStoreId(stores[0]?.id || '')
    setNewForm(false)
    setSection('inventories')
    toast.success('Inventory started')
  }

  async function closeInventory() {
    if (!activeInvId) return
    setBusy(true)
    await flush() // land any pending keystrokes before closing
    const { error } = await supabase
      .from('stocking_inventories')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', activeInvId)
    setBusy(false)
    if (error) { toast.error('Could not close the inventory'); return }
    setActiveInvId(null)
    setActiveStoreId('')
    setSessionId(null)
    await fetchInventories()
    toast.success('Inventory closed')
  }

  async function openInventory(inv) {
    const { error } = await supabase
      .from('stocking_inventories')
      .update({ closed_at: null })
      .eq('id', inv.id)
    if (error) { toast.error('Could not open that inventory'); return }
    setInventories((prev) => prev.map((i) => (i.id === inv.id ? { ...i, closed_at: null } : i)))
    setActiveInvId(inv.id)
    setActiveStoreId(inv.stocking_sessions?.[0]?.store_id || stores[0]?.id || '')
    setSection('inventories')
  }

  async function confirmDelete() {
    const target = deleteConfirm
    if (!target) return
    setBusy(true)
    // Legs and entries cascade from the inventory.
    const { error } = await supabase.from('stocking_inventories').delete().eq('id', target.id)
    setBusy(false)
    if (error) { toast.error('Could not delete the inventory'); return }

    for (const leg of target.stocking_sessions || []) clearLocalCounts(leg.id)
    if (activeInvId === target.id) {
      setActiveInvId(null)
      setActiveStoreId('')
      setSessionId(null)
    }
    setInventories((prev) => prev.filter((i) => i.id !== target.id))
    setDeleteConfirm(null)
    toast.success('Inventory deleted')
  }

  async function runExport(kind) {
    const inv = exportTarget
    if (!inv) return
    setExportTarget(null)

    // Export from server truth: flush anything still pending, then re-read the
    // inventory so every location is represented, not just the one on screen.
    if (inv.id === activeInvId) await flush()
    const fresh = (await refreshInventory(inv.id)) || inv

    const payload = { date: fresh.inventory_date, legs: legsFor(fresh) }
    try {
      const n = kind === 'pdf'
        ? exportPdf(payload, categories, allItems)
        : exportCsv(payload, categories, allItems)
      toast.success(`Exported ${n} ${n === 1 ? 'item' : 'items'} as ${kind.toUpperCase()}`)
    } catch {
      toast.error(`Could not build the ${kind.toUpperCase()}`)
    }
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
              {formatDate(deleteConfirm.inventory_date)} — {invTotals(deleteConfirm).itemsCounted} items
              across {invTotals(deleteConfirm).locations} {invTotals(deleteConfirm).locations === 1 ? 'location' : 'locations'}.
              This permanently deletes every count in it and cannot be undone.
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
              {formatDate(exportTarget.inventory_date)} — all locations
            </p>
            <div className="stk-export-choices">
              <button className="confirm-btn stk-export-btn" onClick={() => { runExport("pdf") }}>
                <span className="stk-export-kind">PDF</span>
                <span className="stk-export-desc">Grouped by location</span>
              </button>
              <button className="confirm-btn stk-export-btn" onClick={() => { runExport("csv") }}>
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
      <div className="notes-main-head stk-head">
        <div className="notes-main-head-left">
          <h2 className="notes-main-title">Stocking</h2>
          <span className="notes-main-count">
            {inventories.length} {inventories.length === 1 ? 'inventory' : 'inventories'}
          </span>
        </div>
        <div className="notes-main-head-right">
          {section === 'inventories' ? (
            <button className="confirm-btn" onClick={() => setNewForm((v) => !v)}>
              {newForm ? 'Cancel' : '+ New Inventory'}
            </button>
          ) : (
            <button className="confirm-btn" onClick={() => setTermFormOpen((v) => !v)}>
              {termFormOpen ? "Cancel" : "+ Add Item"}
            </button>
          )}
        </div>
      </div>

      {/* ── Section nav ── */}
      <nav className="stk-nav" aria-label="Stocking sections">
        <button
          type="button"
          className={`stk-nav-btn ${section === 'inventories' ? 'active' : ''}`}
          onClick={() => setSection('inventories')}
        >
          Inventories
        </button>
        <button
          type="button"
          className={`stk-nav-btn ${section === 'glossary' ? 'active' : ''}`}
          onClick={() => setSection('glossary')}
        >
          Glossary
        </button>
      </nav>

      {section === 'glossary' && (
        <StockingGlossary
          categories={categories}
          companies={companies}
          items={allItems}
          formOpen={termFormOpen}
          onFormOpenChange={setTermFormOpen}
          onCatalogChange={refetchItems}
        />
      )}

      {/* ── New inventory form ── */}
      {section === 'inventories' && newForm && (
        <div className="stk-new-form">
          <input
            className="input"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value || todayStr())}
            aria-label="Inventory date"
          />
          <button className="confirm-btn" onClick={startInventory} disabled={busy}>
            {busy ? '…' : 'Start'}
          </button>
        </div>
      )}

      {/* ── Inventories ── */}
      {/* Hidden while one is open: the checklist is the whole screen then, and
          the list underneath it was just something to scroll past. */}
      {section === 'inventories' && !activeInv && (
        <div className="stk-history">
          {inventories.length === 0 && <p className="empty-msg">No inventories yet</p>}
          {inventories.map((inv) => {
            const { locations, itemsCounted, units } = invTotals(inv)
            const isOpen = !inv.closed_at
            return (
              <div key={inv.id} className={`stk-history-row ${inv.id === activeInvId ? 'current' : ''}`}>
                <div className="stk-history-main">
                  <div className="stk-history-top">
                    <span className="stk-history-store">{formatDate(inv.inventory_date)}</span>
                    {inv.id === activeInvId
                      ? <span className="stk-badge current">Current</span>
                      : isOpen && <span className="stk-badge open">Open</span>}
                  </div>
                  <span className="stk-history-meta">
                    {locations} {locations === 1 ? 'location' : 'locations'} · {itemsCounted} items · {units} units
                  </span>
                </div>
                <div className="stk-history-actions">
                  {inv.id !== activeInvId && (
                    <button className="icon-btn" onClick={() => openInventory(inv)} title="Open inventory">
                      Open
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setExportTarget(inv)} title="Export">
                    Export
                  </button>
                  <button className="icon-btn stk-del" onClick={() => setDeleteConfirm(inv)} title="Delete">
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Active inventory ── */}
      {section === 'inventories' && activeInv && (
        <>
          <div className="stk-active-head">
            <div className="stk-active-id">
              <span className="stk-active-store">Inventory</span>
              <span className="stk-active-date">{formatDate(activeInv.inventory_date)}</span>
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

          {/* Marks where the toolbar sits in flow; once it scrolls past the tab
              bar the toolbar is pinned and collapses to a single row. */}
          <div ref={sentinelRef} className="stk-toolbar-sentinel" aria-hidden="true" />

          <div className={`stk-toolbar ${pinned ? 'pinned' : ''}`}>
            <div className="stk-toolbar-controls">
              <select
                className="input stk-location-select"
                value={activeStoreId}
                onChange={(e) => setActiveStoreId(e.target.value)}
                aria-label="Location"
              >
                {stores.map((s) => {
                  const leg = activeInv.stocking_sessions?.find((l) => l.store_id === s.id)
                  const n = leg
                    ? Object.keys(leg.id === sessionId ? counts : countsFromEntries(leg.stocking_entries)).length
                    : 0
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name}{n > 0 ? ` — ${n} counted` : ''}
                    </option>
                  )
                })}
              </select>
              <input
                className="input stk-search"
                type="search"
                placeholder="Find an item…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find an item"
              />
              <button
                type="button"
                className={`stk-filter-btn ${companyFilter ? 'active' : ''}`}
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
              >
                {activeCompany ? activeCompany.name : 'Filter'}
              </button>
            </div>

            {filterOpen && (
              <div className="stk-filter-row" role="group" aria-label="Filter by company">
                <button
                  type="button"
                  className={`stk-chip ${companyFilter === null ? 'on' : ''}`}
                  onClick={() => setCompanyFilter(null)}
                >
                  All
                </button>
                {companies.map((co) => (
                  <button
                    key={co.id}
                    type="button"
                    className={`stk-chip ${companyFilter === co.id ? 'on' : ''}`}
                    onClick={() => setCompanyFilter(co.id)}
                  >
                    {co.name}
                  </button>
                ))}
              </div>
            )}

            <nav className="stk-chips" aria-label="Jump to category">
              {sections.map(({ category, counted, total }) => (
                <button
                  key={category.id}
                  type="button"
                  className={`stk-chip ${counted === total ? 'done' : ''}`}
                  onClick={() => jumpTo(category.id)}
                >
                  {category.name}
                  <span className="stk-chip-count">{counted}/{total}</span>
                </button>
              ))}
            </nav>
          </div>

          <StockingVoice items={items} onApply={setCount} onLocate={locateItem} />

          {switching
            ? <p className="stk-loading">Opening location…</p>
            : (
              <StockingChecklist
                sections={sections}
                counts={counts}
                onChange={setCount}
                sectionRefs={sectionRefs}
                emptyMessage={
                  activeCompany && !query.trim()
                    ? `No ${activeCompany.name} items.`
                    : `No items match “${query}”${activeCompany ? ` in ${activeCompany.name}` : ''}.`
                }
              />
            )}
        </>
      )}
    </div>
  )
}
