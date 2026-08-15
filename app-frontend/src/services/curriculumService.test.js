import { describe, it, expect } from 'vitest'

// curriculumService reads localStorage at module load time (ref(localStorage.getItem(...))),
// so it must be stubbed before the dynamic import below runs (static imports are hoisted).
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { curriculumService } = await import('./curriculumService.js')

describe('normalizeCurriculumCode', () => {
  it('normalizes CIC aliases', () => {
    expect(curriculumService.normalizeCurriculumCode('cc')).toBe('CIC')
    expect(curriculumService.normalizeCurriculumCode('Ciência da Computação')).toBe('CIC')
    expect(curriculumService.normalizeCurriculumCode('cic')).toBe('CIC')
  })

  it('normalizes ECP aliases', () => {
    expect(curriculumService.normalizeCurriculumCode('ec')).toBe('ECP')
    expect(curriculumService.normalizeCurriculumCode('Engenharia de Computação')).toBe('ECP')
    expect(curriculumService.normalizeCurriculumCode('engcomp')).toBe('ECP')
  })

  it('returns empty string for falsy input', () => {
    expect(curriculumService.normalizeCurriculumCode('')).toBe('')
    expect(curriculumService.normalizeCurriculumCode(null)).toBe('')
  })
})

describe('matchesSelectedCurriculum', () => {
  it('matches when the selected course is in the list, regardless of case/alias', () => {
    expect(curriculumService.matchesSelectedCurriculum(['cc', 'ecp'], 'CIC')).toBe(true)
  })

  it('does not match when absent from the list', () => {
    expect(curriculumService.matchesSelectedCurriculum(['ecp'], 'CIC')).toBe(false)
  })

  it('treats an empty/missing list as matching everything', () => {
    expect(curriculumService.matchesSelectedCurriculum([], 'CIC')).toBe(true)
    expect(curriculumService.matchesSelectedCurriculum(null, 'CIC')).toBe(true)
  })
})

describe('getGraduationRequirements', () => {
  it('returns CIC requirements by default/unknown code', () => {
    expect(curriculumService.getGraduationRequirements('bogus')).toEqual({ mandatory: 166, elective: 16, complementary: 6 })
  })

  it('returns ECP requirements', () => {
    expect(curriculumService.getGraduationRequirements('ec')).toEqual({ mandatory: 148, elective: 46, complementary: 6 })
  })
})
