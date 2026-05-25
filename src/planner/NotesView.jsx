import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../Toast'
import { PRESET_COLORS } from '../constants'
import { EditIcon } from '../icons'
import RichTextEditor from './RichTextEditor'

export default function NotesView() {
  const toast = useToast()
  const [topics, setTopics] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')

  // topic form
  const [topicForm, setTopicForm] = useState(null)
  const [topicName, setTopicName] = useState('')
  const [topicColor, setTopicColor] = useState('#60a5fa')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorRef = useRef(null)

  // note form
  const [noteForm, setNoteForm] = useState(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteTopicId, setNoteTopicId] = useState('')

  // expanded state
  const [expandedTopicIds, setExpandedTopicIds] = useState(new Set())
  const [expandedNoteId, setExpandedNoteId] = useState(null)

  // delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    function handleClick(e) {
      if (colorRef.current && !colorRef.current.contains(e.target)) setShowColorPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: t, error: e1 }, { data: n, error: e2 }] = await Promise.all([
      supabase.from('note_topics').select('*').order('sort_order').order('created_at'),
      supabase.from('notes').select('*').order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }),
    ])
    if (e1 || e2) toast.error('Failed to load notes')
    if (t) setTopics(t)
    if (n) setNotes(n)
    setLoading(false)
  }

  // ── Topic CRUD ──
  async function saveTopic() {
    if (!topicName.trim()) return
    setSaving(true)
    if (topicForm?.id) {
      const { error } = await supabase.from('note_topics').update({ name: topicName.trim(), color: topicColor, updated_at: new Date().toISOString() }).eq('id', topicForm.id)
      if (error) toast.error('Failed to update topic')
      else {
        setTopics(prev => prev.map(t => t.id === topicForm.id ? { ...t, name: topicName.trim(), color: topicColor } : t))
        toast.success('Topic updated')
      }
    } else {
      const maxOrder = topics.reduce((m, t) => Math.max(m, t.sort_order || 0), 0)
      const { data, error } = await supabase.from('note_topics').insert({ name: topicName.trim(), color: topicColor, sort_order: maxOrder + 1 }).select().single()
      if (error) toast.error('Failed to create topic')
      else {
        setTopics(prev => [...prev, data])
        setExpandedTopicIds(prev => new Set(prev).add(data.id))
        toast.success('Topic created')
      }
    }
    setSaving(false)
    setTopicForm(null)
    setTopicName('')
    setTopicColor('#60a5fa')
  }

  async function deleteTopic(id) {
    const { error } = await supabase.from('note_topics').delete().eq('id', id)
    if (error) toast.error('Failed to delete topic')
    else {
      setTopics(prev => prev.filter(t => t.id !== id))
      setNotes(prev => prev.filter(n => n.topic_id !== id))
      toast.success('Topic deleted')
    }
  }

  // ── Note CRUD ──
  function openNewNote(preselectedTopicId) {
    setNoteForm({ mode: 'create' })
    setNoteTitle('')
    setNoteContent('')
    setNoteTopicId(preselectedTopicId || topics[0]?.id || '')
  }

  function openEditNote(note) {
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setNoteTopicId(note.topic_id)
    setNoteForm({ mode: 'edit', id: note.id })
  }

  async function saveNote() {
    if (!noteTitle.trim() && !noteContent.trim()) return
    if (!noteTopicId) { toast.error('Select a topic'); return }
    setSaving(true)
    const now = new Date().toISOString()
    if (noteForm?.mode === 'edit') {
      const { error } = await supabase.from('notes').update({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        topic_id: noteTopicId,
        updated_at: now,
      }).eq('id', noteForm.id)
      if (error) toast.error('Failed to update note')
      else {
        setNotes(prev => prev.map(n => n.id === noteForm.id ? { ...n, title: noteTitle.trim(), content: noteContent.trim(), topic_id: noteTopicId, updated_at: now } : n))
        toast.success('Note updated')
      }
    } else {
      const { data, error } = await supabase.from('notes').insert({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        topic_id: noteTopicId,
      }).select().single()
      if (error) toast.error('Failed to create note')
      else {
        setNotes(prev => [data, ...prev])
        setExpandedTopicIds(prev => new Set(prev).add(noteTopicId))
        toast.success('Note created')
      }
    }
    setSaving(false)
    setNoteForm(null)
  }

  async function confirmDeleteNote() {
    if (!deleteConfirm) return
    const { error } = await supabase.from('notes').delete().eq('id', deleteConfirm.id)
    if (error) toast.error('Failed to delete note')
    else {
      setNotes(prev => prev.filter(n => n.id !== deleteConfirm.id))
      toast.success('Note deleted')
    }
    setDeleteConfirm(null)
  }

  async function togglePin(note) {
    const pinned = !note.is_pinned
    const { error } = await supabase.from('notes').update({ is_pinned: pinned, updated_at: new Date().toISOString() }).eq('id', note.id)
    if (error) toast.error('Failed to update note')
    else setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: pinned } : n))
  }

  function toggleTopic(id) {
    setExpandedTopicIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Derived ──
  const topicMap = useMemo(() => Object.fromEntries(topics.map(t => [t.id, t])), [topics])

  const noteCounts = useMemo(() => {
    const counts = {}
    notes.forEach(n => { counts[n.topic_id] = (counts[n.topic_id] || 0) + 1 })
    return counts
  }, [notes])

  const notesByTopic = useMemo(() => {
    const map = {}
    let list = notes
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.updated_at) - new Date(a.updated_at)
    })
    list.forEach(n => {
      if (!map[n.topic_id]) map[n.topic_id] = []
      map[n.topic_id].push(n)
    })
    return map
  }, [notes, search])

  function formatDate(iso) {
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  function renderNoteCard(note) {
    const topic = topicMap[note.topic_id]
    const isExpanded = expandedNoteId === note.id
    return (
      <div key={note.id} className={`notes-card ${isExpanded ? 'expanded' : ''} ${note.is_pinned ? 'pinned' : ''}`} onClick={() => setExpandedNoteId(isExpanded ? null : note.id)} style={{ cursor: 'pointer' }}>
        <div className="notes-card-head">
          <div className="notes-card-head-left">
            {note.is_pinned && <span className="notes-pin-badge">📌</span>}
            <h3 className="notes-card-title">{note.title || 'Untitled'}</h3>
          </div>
        </div>
        <div className={`notes-card-preview ${isExpanded ? 'expanded' : ''}`} dangerouslySetInnerHTML={{ __html: note.content || '<p>No content</p>' }} />
        <div className="notes-card-footer">
          <span className="notes-card-date">{formatDate(note.updated_at)}</span>
          <div className="notes-card-actions" onClick={e => e.stopPropagation()}>
            <button className="icon-btn" onClick={() => togglePin(note)} aria-label={note.is_pinned ? 'Unpin' : 'Pin'} title={note.is_pinned ? 'Unpin' : 'Pin'}>
              {note.is_pinned ? '📌' : '📍'}
            </button>
            <button className="icon-btn" onClick={() => openEditNote(note)} aria-label="Edit note"><EditIcon /></button>
            <button className="icon-btn" onClick={() => setDeleteConfirm(note)} aria-label="Delete note">🗑</button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="notes-view"><p className="notes-loading">Loading notes…</p></div>

  return (
    <div className="notes-view">
      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="notes-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="notes-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="notes-confirm-title">Delete note?</p>
            <p className="notes-confirm-msg">Are you sure you want to delete &ldquo;{deleteConfirm.title || 'Untitled'}&rdquo;? This action cannot be undone.</p>
            <div className="notes-confirm-actions">
              <button className="cancel-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm-btn notes-confirm-delete" onClick={confirmDeleteNote}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="notes-main-head">
        <div className="notes-main-head-left">
          <h2 className="notes-main-title">Notes</h2>
          <span className="notes-main-count">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span>
        </div>
        <div className="notes-main-head-right">
          <input className="input notes-search" placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="confirm-btn notes-new-btn" onClick={() => openNewNote()} disabled={topics.length === 0}>+ New Note</button>
          <button className="add-btn notes-add-topic-btn" onClick={() => {
            setTopicForm({ id: null })
            setTopicName('')
            setTopicColor('#60a5fa')
          }}>+ Topic</button>
        </div>
      </div>

      {/* Topic Form */}
      {topicForm && (
        <div className="notes-topic-form">
          <input className="input" placeholder="Topic name" value={topicName} onChange={e => setTopicName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTopic()} autoFocus />
          <div className="notes-topic-form-row">
            <div className="color-picker-wrap" ref={colorRef}>
              <button className="color-swatch-btn" style={{ background: topicColor }} onClick={() => setShowColorPicker(v => !v)} />
              {showColorPicker && (
                <div className="color-popover">
                  <div className="color-presets">{PRESET_COLORS.map(c => <button key={c} className={`preset-swatch ${topicColor === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => { setTopicColor(c); setShowColorPicker(false) }} />)}</div>
                </div>
              )}
            </div>
            <button className="confirm-btn notes-topic-save" onClick={saveTopic} disabled={!topicName.trim() || saving}>{saving ? '…' : topicForm.id ? 'Save' : 'Add'}</button>
            <button className="cancel-btn" onClick={() => setTopicForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Note Form */}
      {noteForm && (
        <div className="notes-form-card">
          <input className="input notes-form-title" placeholder="Note title" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} autoFocus />
          <RichTextEditor content={noteContent} onChange={setNoteContent} />
          <div className="notes-form-footer">
            <select className="input notes-form-topic-select" value={noteTopicId} onChange={e => setNoteTopicId(e.target.value)}>
              <option value="">Select topic…</option>
              {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="notes-form-actions">
              <button className="confirm-btn" onClick={saveNote} disabled={(!noteTitle.trim() && !noteContent.trim()) || !noteTopicId || saving}>{saving ? 'Saving…' : noteForm.mode === 'edit' ? 'Save Changes' : 'Create Note'}</button>
              <button className="cancel-btn" onClick={() => setNoteForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Forum-style topic sections */}
      {topics.length === 0 && !topicForm ? (
        <div className="notes-empty">
          <p className="notes-empty-title">Create a topic first</p>
          <p className="notes-empty-sub">Add a topic to start organizing your notes.</p>
        </div>
      ) : (
        <div className="notes-forum">
          {topics.map(topic => {
            const topicNotes = notesByTopic[topic.id] || []
            const isOpen = expandedTopicIds.has(topic.id)
            if (search.trim() && topicNotes.length === 0) return null
            return (
              <div key={topic.id} className="notes-forum-group">
                <div className={`notes-forum-section ${isOpen ? 'open' : ''}`}>
                  <div className="notes-forum-header" onClick={() => toggleTopic(topic.id)}>
                    <div className="notes-forum-header-left">
                      <span className="notes-forum-chevron">{isOpen ? '▾' : '▸'}</span>
                      <svg className="notes-forum-folder" viewBox="0 0 24 24" fill={topic.color}><path d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4z"/></svg>
                      <h3 className="notes-forum-topic-name">{topic.name}</h3>
                      <span className="notes-forum-count">{noteCounts[topic.id] || 0}</span>
                    </div>
                    <div className="notes-forum-header-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" onClick={() => openNewNote(topic.id)} aria-label="Add note to topic" title="Add note">+</button>
                      <button className="icon-btn" onClick={() => { setTopicForm({ id: topic.id }); setTopicName(topic.name); setTopicColor(topic.color || '#60a5fa') }} aria-label="Edit topic"><EditIcon /></button>
                      <button className="icon-btn" onClick={() => deleteTopic(topic.id)} aria-label="Delete topic">🗑</button>
                    </div>
                  </div>
                </div>
                <div className={`notes-forum-body ${isOpen ? 'open' : ''}`}>
                  {topicNotes.length === 0 ? (
                    <p className="notes-forum-empty">No notes in this topic yet</p>
                  ) : (
                    <div className="notes-grid">
                      {topicNotes.map(note => renderNoteCard(note))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
