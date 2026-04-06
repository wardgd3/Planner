import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

export default function AiChat({ todayBlocks, todayTasks, dateLabel }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  function buildContext() {
    const lines = [`Today: ${dateLabel}`]

    if (todayBlocks.length > 0) {
      lines.push('\nSchedule:')
      todayBlocks.forEach(b => {
        lines.push(`  ${b.start_time.slice(0, 5)} - ${b.end_time.slice(0, 5)}  ${b.title}`)
      })
    } else {
      lines.push('\nSchedule: (empty)')
    }

    if (todayTasks.length > 0) {
      lines.push('\nTasks:')
      todayTasks.forEach(t => {
        lines.push(`  [${t.priority}] ${t.title}${t.status === 'done' ? ' (done)' : ''}`)
      })
    } else {
      lines.push('\nTasks: (none)')
    }

    return lines.join('\n')
  }

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context: buildContext(),
        },
      })

      if (error) throw error

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading, todayBlocks, todayTasks, dateLabel])

  function handleFetchSchedule() {
    const context = buildContext()
    sendMessage(`Here is my schedule and tasks for today. Summarize what I have planned and suggest how to make the most of my day:\n\n${context}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      sendMessage(input)
    }
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-actions">
        <button className="add-btn ai-chat-action" onClick={handleFetchSchedule} disabled={loading}>
          Fetch Schedule
        </button>
      </div>

      <div className="ai-chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="empty-msg" style={{ padding: '12px 0' }}>Ask me anything about your schedule</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`ai-chat-msg ai-chat-${msg.role}`}>
            <p className="ai-chat-msg-text">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="ai-chat-msg ai-chat-assistant">
            <p className="ai-chat-msg-text ai-chat-typing">Thinking...</p>
          </div>
        )}
      </div>

      <div className="ai-chat-input-row">
        <input
          className="input"
          placeholder="Ask Claude..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="add-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
