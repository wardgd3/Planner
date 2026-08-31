import { useCallback, useEffect, useRef, useState } from 'react'
import { parseUtterance, voiceSupported } from './voiceParsing'

const SpeechRecognitionCtor =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

const REASON_TEXT = {
  empty: 'Did not catch that',
  'no-number': 'No number heard',
  'no-item': 'No item heard',
  'out-of-range': 'That number is too large',
  'no-match': 'No item matches',
  ambiguous: 'Could be more than one item',
}

/**
 * Hands-free counting: say "12 10pk variety blue" and that item is set to 12.
 *
 * Recognition runs continuously and restarts itself, because browsers end the
 * session on every pause. Each final phrase is parsed independently, so you can
 * keep reeling off counts without waiting for the UI.
 */
export default function StockingVoice({ items, onApply, onLocate }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [log, setLog] = useState([]) // newest first, capped

  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const itemsRef = useRef(items)
  const failuresRef = useRef(0)

  // Keep the catalog current without tearing down the recognition session.
  useEffect(() => { itemsRef.current = items }, [items])

  const push = useCallback((entry) => {
    setLog((prev) => [{ ...entry, at: Date.now() }, ...prev].slice(0, 4))
  }, [])

  const handlePhrase = useCallback((text) => {
    const result = parseUtterance(text, itemsRef.current)
    if (result.ok) {
      onApply(result.item.id, result.quantity)
      onLocate?.(result.item.id)
      push({ kind: 'ok', heard: text, label: `${result.item.name} → ${result.quantity}` })
    } else {
      push({
        kind: 'err',
        heard: text,
        label: result.reason === 'ambiguous'
          ? `${REASON_TEXT.ambiguous}: ${result.candidates.join(' / ')}`
          : REASON_TEXT[result.reason] || 'Not understood',
      })
    }
  }, [onApply, onLocate, push])

  const stop = useCallback(() => {
    listeningRef.current = false
    setListening(false)
    setInterim('')
    const r = recognitionRef.current
    recognitionRef.current = null
    if (r) { try { r.stop() } catch { /* already stopped */ } }
  }, [])

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor || listeningRef.current) return
    failuresRef.current = 0

    const build = () => {
      const rec = new SpeechRecognitionCtor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'

      rec.onresult = (event) => {
        let pending = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = result[0]?.transcript ?? ''
          if (result.isFinal) handlePhrase(text)
          else pending += text
        }
        setInterim(pending.trim())
      }

      rec.onerror = (event) => {
        // A pause between counts surfaces as no-speech; that is normal and the
        // session just restarts. A denied mic is terminal.
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          push({ kind: 'err', heard: '', label: 'Microphone blocked. Allow access to use voice.' })
          stop()
          return
        }
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          failuresRef.current += 1
          if (failuresRef.current >= 4) {
            push({ kind: 'err', heard: '', label: 'Voice input stopped after repeated errors.' })
            stop()
          }
        }
      }

      rec.onend = () => {
        // Browsers close the session on silence; reopen while still toggled on.
        if (!listeningRef.current) return
        try { rec.start() } catch { /* restart races with a pending stop */ }
      }

      return rec
    }

    const rec = build()
    recognitionRef.current = rec
    listeningRef.current = true
    setListening(true)
    try {
      rec.start()
    } catch {
      listeningRef.current = false
      setListening(false)
      push({ kind: 'err', heard: '', label: 'Could not start the microphone.' })
    }
  }, [handlePhrase, push, stop])

  // Always release the mic when the inventory closes or the tab unmounts.
  useEffect(() => () => {
    listeningRef.current = false
    const r = recognitionRef.current
    if (r) { try { r.stop() } catch { /* nothing to stop */ } }
  }, [])

  if (!voiceSupported) return null

  return (
    <div className="stk-voice">
      {(listening || log.length > 0) && (
        <div className="stk-voice-panel" aria-live="polite">
          {listening && (
            <div className="stk-voice-interim">
              {interim || 'Listening… say a number, then the item'}
            </div>
          )}
          {log.map((entry) => (
            <div key={entry.at} className={`stk-voice-line ${entry.kind}`}>
              <span className="stk-voice-label">{entry.label}</span>
              {entry.heard && <span className="stk-voice-heard">“{entry.heard.trim()}”</span>}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={`stk-mic ${listening ? 'on' : ''}`}
        onClick={() => (listening ? stop() : start())}
        aria-pressed={listening}
        aria-label={listening ? 'Stop voice input' : 'Start voice input'}
        title={listening ? 'Stop voice input' : 'Voice input'}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
          />
          <path
            fill="currentColor"
            d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z"
          />
        </svg>
      </button>
    </div>
  )
}
