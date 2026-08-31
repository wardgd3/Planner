/**
 * Turning a spoken phrase like "12 10pk variety blue" into a count.
 *
 * Kept pure and separate from the microphone so the parsing can be tested
 * without a browser: speech recognition is the part that cannot be exercised
 * offline, and it is also the part with no logic in it.
 */

/** Whether this browser can do speech recognition at all. */
export const voiceSupported =
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

const ONES = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
}
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

/** "twenty five" -> 25, "twelve" -> 12, leaving everything else alone. */
function digitsFromWords(tokens) {
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t in TENS) {
      const next = tokens[i + 1]
      if (next && next in ONES && ONES[next] > 0 && ONES[next] < 10) {
        out.push(String(TENS[t] + ONES[next]))
        i++
        continue
      }
      out.push(String(TENS[t]))
      continue
    }
    if (t in ONES) { out.push(String(ONES[t])); continue }
    out.push(t)
  }
  return out
}

/**
 * Fold a phrase into the shape item names use: lowercase, no punctuation,
 * number words as digits, and pack sizes spoken as "10pk" or "10 pack"
 * written the way the catalog writes them, "10ct".
 */
export function normalizePhrase(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  const withDigits = digitsFromWords(cleaned.split(' ')).join(' ')
  return withDigits
    .replace(/\b(\d+)\s*(pks|pk|packs|pack|counts|count|cts|ct)\b/g, '$1ct')
    .replace(/\s+/g, ' ')
    .trim()
}

const isDigits = (t) => /^\d+$/.test(t)

/** How well a phrase matches one item name, 0..1. */
export function scoreItem(queryTokens, itemName) {
  const nameTokens = normalizePhrase(itemName).split(' ').filter(Boolean)
  if (nameTokens.length === 0 || queryTokens.length === 0) return 0
  if (queryTokens.join(' ') === nameTokens.join(' ')) return 1

  let hits = 0
  const used = new Set()
  for (const q of queryTokens) {
    const idx = nameTokens.findIndex(
      (n, i) => !used.has(i) && (n === q || n.startsWith(q) || q.startsWith(n)),
    )
    if (idx !== -1) { hits++; used.add(idx) }
  }
  // Both directions matter: "blue" alone should not beat a full name, and a
  // long ramble should not match a short name just by containing it.
  const queryCoverage = hits / queryTokens.length
  const nameCoverage = hits / nameTokens.length
  return queryCoverage * 0.6 + nameCoverage * 0.4
}

export const MIN_SCORE = 0.55
const MIN_MARGIN = 0.08

/**
 * Parse one utterance against the catalog.
 *
 * Returns { ok: true, item, quantity } or { ok: false, reason, ... } so the
 * caller can say what went wrong rather than silently doing nothing.
 */
export function parseUtterance(text, items) {
  const phrase = normalizePhrase(text)
  if (!phrase) return { ok: false, reason: 'empty', phrase: '' }

  let tokens = phrase.split(' ').filter(Boolean)
  let quantity = null

  // The quantity leads, as in "12 10ct variety blue". A bare number at the
  // end is accepted too, for "10ct variety blue 12".
  if (isDigits(tokens[0])) {
    quantity = Number(tokens[0])
    tokens = tokens.slice(1)
  } else if (tokens.length > 1 && isDigits(tokens[tokens.length - 1])) {
    quantity = Number(tokens[tokens.length - 1])
    tokens = tokens.slice(0, -1)
  }

  if (quantity === null) return { ok: false, reason: 'no-number', phrase }
  if (quantity > 999) return { ok: false, reason: 'out-of-range', phrase, quantity }
  if (tokens.length === 0) return { ok: false, reason: 'no-item', phrase, quantity }

  const ranked = items
    .map((item) => ({ item, score: scoreItem(tokens, item.name) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]
  if (!best || best.score < MIN_SCORE) {
    return { ok: false, reason: 'no-match', phrase, quantity, query: tokens.join(' ') }
  }
  // A near-tie means two items are plausible; guessing would put a number on
  // the wrong row, which is worse than asking for the name again.
  if (second && best.score - second.score < MIN_MARGIN && best.score < 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      phrase,
      quantity,
      query: tokens.join(' '),
      candidates: [best.item.name, second.item.name],
    }
  }

  return { ok: true, item: best.item, quantity, phrase, score: best.score }
}
