import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useToast } from '../../Toast'
import { EditIcon } from '../../icons'

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * The item catalog: every product that can be counted in an inventory.
 *
 * Deleting is deliberately awkward for items that already appear in recorded
 * counts, because stocking_entries cascades from stocking_items -- a hard
 * delete would quietly rewrite past inventories. Retiring keeps the history
 * and just drops the item off future checklists.
 */
export default function StockingGlossary({
  categories,
  companies,
  items,
  formOpen,
  onFormOpenChange,
  onCatalogChange,
}) {
  const toast = useToast()

  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [subgroup, setSubgroup] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [usage, setUsage] = useState(null) // recorded counts referencing the item
  const [busy, setBusy] = useState(false)
  const [viewCategoryId, setViewCategoryId] = useState('')

  // Derived rather than synced into state: the categories arrive a tick after
  // first render, and seeding state from an effect just causes a second pass.
  const activeCompanyId = companyId || companies[0]?.id || ''

  /**
   * Types belonging to the chosen company. Picking a company narrows what the
   * Type dropdown offers, so an item can only land under a type that company
   * actually makes.
   */
  const typeOptions = useMemo(
    () => categories.filter((c) => c.company_id === activeCompanyId),
    [categories, activeCompanyId],
  )

  // Derived, so switching company re-points the type without an effect pass.
  const activeCategoryId = typeOptions.some((c) => c.id === categoryId)
    ? categoryId
    : (typeOptions[0]?.id || '')

  const companyName = (id) => companies.find((co) => co.id === id)?.name || null

  // Existing subgroups for the chosen category, offered as suggestions.
  const subgroupOptions = useMemo(() => {
    const seen = []
    for (const i of items) {
      if (i.category_id === activeCategoryId && i.subgroup && !seen.includes(i.subgroup)) {
        seen.push(i.subgroup)
      }
    }
    return seen
  }, [items, activeCategoryId])

  /**
   * The usual company for each category. Most categories are single-brand, so
   * printing "Pepperidge Farm" on all 37 Goldfish rows would be noise; the tag
   * only appears on items that break their category's pattern, which is
   * exactly when it is worth seeing.
   */
  const usualCompany = useMemo(() => {
    const byCategory = new Map()
    for (const c of categories) {
      const tally = new Map()
      for (const i of items) {
        if (i.category_id !== c.id || !i.company_id) continue
        tally.set(i.company_id, (tally.get(i.company_id) || 0) + 1)
      }
      let best = null
      let bestCount = 0
      for (const [id, n] of tally) {
        if (n > bestCount) { best = id; bestCount = n }
      }
      byCategory.set(c.id, best)
    }
    return byCategory
  }, [categories, items])

  /**
   * Categories, each split into its subgroups. Unlike the checklist -- which
   * keeps catalog order so the rows match the shelf -- this is a reference
   * list, so both the subgroups and the items inside them are alphabetical.
   */
  const grouped = useMemo(
    () =>
      categories
        .map((c) => {
          const rows = items.filter((i) => i.category_id === c.id)

          const buckets = new Map()
          for (const item of rows) {
            const key = item.subgroup || ''
            if (!buckets.has(key)) buckets.set(key, [])
            buckets.get(key).push(item)
          }

          const groups = [...buckets.entries()]
            .map(([label, list]) => ({
              label: label || null,
              items: list.sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => {
              // Ungrouped items have no header, so they lead.
              if (a.label === null) return -1
              if (b.label === null) return 1
              return a.label.localeCompare(b.label)
            })

          return { category: c, rows, groups }
        })
        .filter((g) => g.rows.length > 0)
        .filter((g) => !viewCategoryId || g.category.id === viewCategoryId),
    [categories, items, viewCategoryId],
  )

  function resetForm() {
    setEditingId(null)
    setName('')
    setSubgroup('')
    setCategoryId(categories[0]?.id || '')
    setCompanyId(companies[0]?.id || '')
    onFormOpenChange(false)
  }

  function startEdit(item) {
    // Take the company from the item's type rather than the item itself, so
    // the Type dropdown is guaranteed to contain the type being edited and
    // opening the form can never silently reassign it.
    const type = categories.find((c) => c.id === item.category_id)
    setEditingId(item.id)
    setName(item.name)
    setCategoryId(item.category_id)
    setCompanyId(type?.company_id || item.company_id || '')
    setSubgroup(item.subgroup || '')
    onFormOpenChange(true)
  }

  async function save() {
    const label = name.trim()
    if (!label || !activeCategoryId || saving) return
    setSaving(true)

    const type = categories.find((c) => c.id === activeCategoryId)
    const patch = {
      name: label,
      category_id: activeCategoryId,
      // Follows the type, so an item's company can never disagree with the
      // company that owns its type.
      company_id: type?.company_id || null,
      subgroup: subgroup.trim() || null,
    }

    if (editingId) {
      const { error } = await supabase.from('stocking_items').update(patch).eq('id', editingId)
      setSaving(false)
      if (error) { toast.error('Could not save that item'); return }
      toast.success('Item updated')
    } else {
      // Slot new items at the end of their category, and keep the slug unique
      // by suffixing on collision rather than failing the save.
      const siblings = items.filter((i) => i.category_id === activeCategoryId)
      const nextOrder = siblings.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) + 1
      const catSlug = categories.find((c) => c.id === activeCategoryId)?.slug || 'item'
      const base = `${catSlug}-${slugify(label)}`

      let saved = false
      for (let attempt = 0; attempt < 5 && !saved; attempt++) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
        const { error } = await supabase
          .from('stocking_items')
          .insert({ ...patch, slug, sort_order: nextOrder, is_active: true })
        if (!error) { saved = true; break }
        if (error.code !== '23505') {
          setSaving(false)
          toast.error('Could not add that item')
          return
        }
      }
      setSaving(false)
      if (!saved) { toast.error('That item already exists'); return }
      toast.success('Item added')
    }

    await onCatalogChange()
    resetForm()
  }

  async function openDelete(item) {
    setDeleteTarget(item)
    setUsage(null)
    const { count, error } = await supabase
      .from('stocking_entries')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', item.id)
    // -1 means "could not tell". Never report zero on a failed check: that
    // would promise a clean delete right before it silently eats history.
    setUsage(error ? -1 : (count || 0))
  }

  async function retireItem() {
    if (!deleteTarget) return
    setBusy(true)
    const { error } = await supabase
      .from('stocking_items')
      .update({ is_active: !deleteTarget.is_active })
      .eq('id', deleteTarget.id)
    setBusy(false)
    if (error) { toast.error('Could not update that item'); return }
    await onCatalogChange()
    toast.success(deleteTarget.is_active ? 'Item retired' : 'Item restored')
    setDeleteTarget(null)
  }

  async function deleteItem() {
    if (!deleteTarget) return
    setBusy(true)
    const { error } = await supabase.from('stocking_items').delete().eq('id', deleteTarget.id)
    setBusy(false)
    if (error) { toast.error('Could not delete that item'); return }
    await onCatalogChange()
    if (editingId === deleteTarget.id) resetForm()
    toast.success('Item deleted')
    setDeleteTarget(null)
  }

  async function toggleActive(item) {
    const { error } = await supabase
      .from('stocking_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)
    if (error) { toast.error('Could not update that item'); return }
    await onCatalogChange()
    toast.success(item.is_active ? 'Item retired' : 'Item restored')
  }

  return (
    <div className="stk-glossary">
      {deleteTarget && (
        <div className="notes-confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="notes-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="notes-confirm-title">Delete item?</p>
            <p className="notes-confirm-msg">
              {usage === null && <>Checking whether &ldquo;{deleteTarget.name}&rdquo; is used…</>}
              {usage === -1 && (
                <>
                  Could not check whether &ldquo;{deleteTarget.name}&rdquo; has been counted. If it
                  has, deleting also removes it from those past inventories. Retiring is the safe
                  option.
                </>
              )}
              {usage === 0 && (
                <>&ldquo;{deleteTarget.name}&rdquo; has never been counted, so deleting it is clean.</>
              )}
              {usage > 0 && (
                <>
                  &ldquo;{deleteTarget.name}&rdquo; appears in <strong>{usage}</strong> recorded{' '}
                  {usage === 1 ? 'count' : 'counts'}. Deleting it removes those from past
                  inventories too. Retiring keeps the history and only hides it from future
                  checklists.
                </>
              )}
            </p>
            <div className="notes-confirm-actions stk-delete-actions">
              <button className="cancel-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              {usage !== null && usage !== 0 && deleteTarget.is_active && (
                <button className="confirm-btn" onClick={retireItem} disabled={busy}>
                  {busy ? '…' : 'Retire'}
                </button>
              )}
              <button
                className="confirm-btn notes-confirm-delete"
                onClick={deleteItem}
                disabled={busy || usage === null}
              >
                {busy ? '…' : usage === 0 ? 'Delete' : 'Delete anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="stk-term-form">
          <input
            className="input stk-term-input"
            placeholder="Item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            autoFocus
          />
          <select
            className="input stk-term-cat"
            value={activeCompanyId}
            onChange={(e) => setCompanyId(e.target.value)}
            aria-label="Company"
          >
            {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
          </select>
          <select
            className="input stk-term-cat"
            value={activeCategoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Type"
            disabled={typeOptions.length === 0}
          >
            {typeOptions.length === 0
              ? <option value="">No types for this company</option>
              : typeOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            className="input"
            placeholder="Group (optional)"
            value={subgroup}
            onChange={(e) => setSubgroup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            list="stk-subgroups"
            maxLength={80}
          />
          <datalist id="stk-subgroups">
            {subgroupOptions.map((s) => <option key={s} value={s} />)}
          </datalist>
          <div className="stk-term-form-actions">
            <button className="confirm-btn" onClick={save} disabled={!name.trim() || !activeCategoryId || saving}>
              {saving ? '…' : editingId ? 'Save' : 'Add'}
            </button>
            <button className="cancel-btn" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="stk-gloss-filter">
        <select
          className="input stk-gloss-select"
          value={viewCategoryId}
          onChange={(e) => setViewCategoryId(e.target.value)}
          aria-label="Show category"
        >
          <option value="">All types ({items.length})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({items.filter((i) => i.category_id === c.id).length})
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 && !formOpen && (
        <p className="empty-msg stk-idle">No items yet. Add the first one to start counting.</p>
      )}

      {grouped.map(({ category, rows, groups }) => (
        <section key={category.id} className="stk-cat-block">
          <h3 className="stk-section-head">
            <span>{category.name}</span>
            <span className="stk-section-count">{rows.filter((r) => r.is_active).length}/{rows.length}</span>
          </h3>

          {groups.map((group, i) => (
            <div key={group.label || `ungrouped-${i}`} className="stk-cat-group">
              {group.label && <h4 className="stk-group-head">{group.label}</h4>}
              <ul className="stk-term-list">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className={`stk-term-row ${editingId === item.id ? 'editing' : ''} ${item.is_active ? '' : 'retired'}`}
                  >
                    <span className="stk-term-name">
                      {item.name}
                      {item.company_id && item.company_id !== usualCompany.get(item.category_id) && (
                        <span className="stk-term-company">{companyName(item.company_id)}</span>
                      )}
                      {!item.is_active && <span className="stk-badge open stk-retired-tag">Retired</span>}
                    </span>
                    <div className="stk-term-actions">
                      <button
                        className="icon-btn"
                        onClick={() => toggleActive(item)}
                        title={item.is_active ? 'Retire (hide from checklists)' : 'Restore to checklists'}
                        aria-label={item.is_active ? `Retire ${item.name}` : `Restore ${item.name}`}
                      >
                        {item.is_active ? '👁' : '＋'}
                      </button>
                      <button className="icon-btn" onClick={() => startEdit(item)} aria-label={`Edit ${item.name}`}>
                        <EditIcon />
                      </button>
                      <button
                        className="icon-btn stk-del"
                        onClick={() => openDelete(item)}
                        aria-label={`Delete ${item.name}`}
                      >
                        🗑
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
