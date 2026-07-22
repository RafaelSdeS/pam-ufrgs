/**
 * Normalizes text by removing accents/diacritics, converting to lower case and trimming.
 */
export function normalizeText(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Computes Levenshtein distance between two strings.
 */
export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Performs accent-insensitive, multi-word, out-of-order, and slightly fuzzy matching on discipline names or professor names.
 */
export function fuzzyMatchName(name, query) {
  const normName = normalizeText(name)
  const normQuery = normalizeText(query)
  if (!normQuery) return true
  if (!normName) return false

  // 1. Direct normalized substring match (e.g. "num" inside "calculo numerico")
  if (normName.includes(normQuery)) return true

  // 2. Multi-token check: split both by spaces
  const queryTokens = normQuery.split(/\s+/).filter(Boolean)
  const nameWords = normName.split(/\s+/).filter(Boolean)

  if (queryTokens.length === 0) return true

  // Check if every query token matches at least one name word (or normalized substring/prefix/slight typo)
  const allTokensMatch = queryTokens.every(qToken => {
    // If token is directly inside normName
    if (normName.includes(qToken)) return true

    // For very short tokens (<= 2 chars), require exact substring match to prevent false positives
    if (qToken.length <= 2) return false

    // Allow 1 typo for tokens 3-6 chars, 2 typos for >= 7 chars
    const maxDist = qToken.length >= 7 ? 2 : 1

    return nameWords.some(nWord => {
      // Check full word distance if lengths are close
      if (Math.abs(nWord.length - qToken.length) <= maxDist) {
        if (levenshtein(nWord, qToken) <= maxDist) return true
      }
      // Check prefix distance if name word is longer than query token
      if (nWord.length > qToken.length) {
        const prefix = nWord.slice(0, qToken.length)
        if (levenshtein(prefix, qToken) <= maxDist) return true
      }
      return false
    })
  })

  if (allTokensMatch) return true

  // 3. Whole query slight typo check against name prefix or entire name
  if (normQuery.length >= 4) {
    const maxDist = normQuery.length >= 8 ? 2 : 1
    if (Math.abs(normName.length - normQuery.length) <= maxDist + 1) {
      if (levenshtein(normName, normQuery) <= maxDist) return true
    }
    if (normName.length > normQuery.length) {
      const namePrefix = normName.slice(0, normQuery.length)
      if (levenshtein(namePrefix, normQuery) <= maxDist) return true
    }
  }

  return false
}

/**
 * Checks if a course matches the search query.
 * - For course code: exact or normalized substring/prefix matching WITHOUT fuzzy matching.
 * - For course name: accent-insensitive, token-aware, out-of-order, slightly fuzzy matching.
 */
export function matchCourse(course, query) {
  if (!course || !query) return true
  const q = normalizeText(query)
  if (!q) return true

  const code = course.code || course.id || ''
  const name = course.name || course.title || ''

  // Exact normalized check on code (NO fuzzy matching on codes as requested)
  if (normalizeText(code).includes(q)) return true

  // Fuzzy match on name
  return fuzzyMatchName(name, q)
}
