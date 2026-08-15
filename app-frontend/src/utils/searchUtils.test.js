import { describe, it, expect } from 'vitest'
import { normalizeText, levenshtein, fuzzyMatchName, matchCourse } from './searchUtils.js'

describe('normalizeText', () => {
  it('strips accents, lowercases, and trims', () => {
    expect(normalizeText('  Cálculo Numérico  ')).toBe('calculo numerico')
  })

  it('handles empty input', () => {
    expect(normalizeText('')).toBe('')
    expect(normalizeText(null)).toBe('')
  })
})

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('counts a single substitution', () => {
    expect(levenshtein('calculo', 'calcolo')).toBe(1)
  })

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })
})

describe('fuzzyMatchName', () => {
  it('matches accent/case-insensitive substrings', () => {
    expect(fuzzyMatchName('Cálculo Numérico', 'calculo numerico')).toBe(true)
  })

  it('matches out-of-order multi-word queries', () => {
    expect(fuzzyMatchName('Cálculo e Geometria Analítica I', 'geometria calculo')).toBe(true)
  })

  it('tolerates a small typo on longer tokens', () => {
    expect(fuzzyMatchName('Circuitos Elétricos I', 'circutos eletricos')).toBe(true)
  })

  it('requires exact match for very short tokens', () => {
    expect(fuzzyMatchName('Álgebra Linear', 'xy')).toBe(false)
  })

  it('rejects unrelated names', () => {
    expect(fuzzyMatchName('Cálculo Numérico', 'engenharia de software')).toBe(false)
  })
})

describe('matchCourse', () => {
  const course = { code: 'MAT01353', name: 'CÁLCULO E GEOMETRIA ANALÍTICA I - A' }

  it('matches by course code without fuzziness', () => {
    expect(matchCourse(course, 'mat01353')).toBe(true)
    expect(matchCourse(course, 'mat01354')).toBe(false)
  })

  it('matches by fuzzy name', () => {
    expect(matchCourse(course, 'calculo geometria')).toBe(true)
  })

  it('treats empty query as a match-all', () => {
    expect(matchCourse(course, '')).toBe(true)
  })
})
