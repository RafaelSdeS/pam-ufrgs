import { describe, it, expect } from 'vitest'
import { calculateSubjectStatuses } from './useCurriculumStatus.js'

const subjects = [
  { id: 'A', code: 'A', credits: 4, prerequisites: [] },
  { id: 'B', code: 'B', credits: 4, prerequisites: ['A'] },
  { id: 'C', code: 'C', credits: 4, prerequisites: ['A'], min_credits_required: 8 }
]

describe('calculateSubjectStatuses', () => {
  it('marks completed subjects as completed', () => {
    const statuses = calculateSubjectStatuses(subjects, ['A'])
    expect(statuses.A).toBe('completed')
  })

  it('makes a subject available once its prerequisite is completed', () => {
    const statuses = calculateSubjectStatuses(subjects, ['A'])
    expect(statuses.B).toBe('available')
  })

  it('blocks a subject whose prerequisite is not completed', () => {
    const statuses = calculateSubjectStatuses(subjects, [])
    expect(statuses.B).toBe('blocked')
  })

  it('blocks a subject that meets prerequisites but not the credit threshold', () => {
    const statuses = calculateSubjectStatuses(subjects, ['A'])
    expect(statuses.C).toBe('blocked')
  })

  it('unblocks once both prerequisites and credit threshold are met', () => {
    const withMore = [...subjects, { id: 'D', code: 'D', credits: 6, prerequisites: [] }]
    const statuses = calculateSubjectStatuses(withMore, ['A', 'B', 'D'])
    expect(statuses.C).toBe('available')
  })

  it('is case/whitespace-insensitive when matching completed ids', () => {
    const statuses = calculateSubjectStatuses(subjects, [' a '])
    expect(statuses.A).toBe('completed')
  })
})
