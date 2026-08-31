import { useEffect, useState } from 'react'

const QUERY = '(max-width: 768px)'

/**
 * Matches the breakpoint the stocking CSS uses. Read as state rather than
 * inferred from CSS because the mobile toolbar does not just look different,
 * it filters differently: one type at a time instead of search across all.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const handler = (event) => setIsMobile(event.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
