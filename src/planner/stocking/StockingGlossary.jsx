import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { useToast } from '../../Toast'
import { EditIcon } from '../../icons'

/**
 * Route shorthand reference. The item names are full of abbreviations that only
 * make sense once someone tells you, so this is a plain term/definition list.
 */
export default function StockingGlossary({ user, formOpen, onFormOpenChange }) {
  const toast = useToast()
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [term, setTerm] = useState('')
  const [definition, setDefinition] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('stocking_glossary')
        .select('*')
        .order('term')
      if (cancelled) return
      if (error) toast.error('Failed to load the glossary')
      else setTerms(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetForm() {
    setEditingId(null)
    setTerm('')
    setDefinition('')
    onFormOpenChange(false)
  }

  function startEdit(row) {
    setEditingId(row.id)
    setTerm(row.term)
    setDefinition(row.definition || '')
    onFormOpenChange(true)
  }

  async function save() {
    const name = term.trim()
    if (!name || saving) return
    setSaving(true)
    const payload = { term: name, definition: definition.trim() || null }

    if (editingId) {
      const { data, error } = await supabase
        .from('stocking_glossary')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()
      setSaving(false)
      if (error) { toast.error('Could not save that term'); return }
      setTerms((prev) =>
        prev.map((t) => (t.id === editingId ? data : t)).sort((a, b) => a.term.localeCompare(b.term)),
      )
      toast.success('Term updated')
    } else {
      const { data, error } = await supabase
        .from('stocking_glossary')
        .insert({ ...payload, user_id: user?.id })
        .select()
        .single()
      setSaving(false)
      if (error) {
        // The unique index is on (user_id, term).
        toast.error(error.code === '23505' ? 'That term is already in the glossary' : 'Could not add that term')
        return
      }
      setTerms((prev) => [...prev, data].sort((a, b) => a.term.localeCompare(b.term)))
      toast.success('Term added')
    }
    resetForm()
  }

  async function confirmDelete() {
    const target = deleteConfirm
    if (!target) return
    const { error } = await supabase.from('stocking_glossary').delete().eq('id', target.id)
    if (error) { toast.error('Could not delete that term'); return }
    setTerms((prev) => prev.filter((t) => t.id !== target.id))
    if (editingId === target.id) resetForm()
    setDeleteConfirm(null)
    toast.success('Term deleted')
  }

  if (loading) return <p className="stk-loading">Loading glossary…</p>

  return (
    <div className="stk-glossary">
      {deleteConfirm && (
        <div className="notes-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="notes-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="notes-confirm-title">Delete term?</p>
            <p className="notes-confirm-msg">
              &ldquo;{deleteConfirm.term}&rdquo; will be removed from the glossary. This cannot be undone.
            </p>
            <div className="notes-confirm-actions">
              <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-btn notes-confirm-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="stk-term-form">
          <input
            className="input stk-term-input"
            placeholder="Term (e.g. HMO)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={80}
            autoFocus
          />
          <input
            className="input"
            placeholder="What it means"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            maxLength={400}
          />
          <div className="stk-term-form-actions">
            <button className="confirm-btn" onClick={save} disabled={!term.trim() || saving}>
              {saving ? '…' : editingId ? 'Save' : 'Add'}
            </button>
            <button className="cancel-btn" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {terms.length === 0 && !formOpen && (
        <p className="empty-msg stk-idle">
          No terms yet. Add the shorthand you keep having to decode.
        </p>
      )}

      <ul className="stk-term-list">
        {terms.map((row) => (
          <li key={row.id} className={`stk-term-row ${editingId === row.id ? 'editing' : ''}`}>
            <div className="stk-term-main">
              <span className="stk-term-name">{row.term}</span>
              <span className="stk-term-def">{row.definition || <em>No definition yet</em>}</span>
            </div>
            <div className="stk-term-actions">
              <button className="icon-btn" onClick={() => startEdit(row)} aria-label={`Edit ${row.term}`}>
                <EditIcon />
              </button>
              <button
                className="icon-btn stk-del"
                onClick={() => setDeleteConfirm(row)}
                aria-label={`Delete ${row.term}`}
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
