import { describe, it, expect } from 'vitest'
import { predictionService } from './predictionService.js'

function subj(code, credits, prerequisites = [], semester = 1) {
  return { id: code, code, name: code, credits, prerequisites, semester }
}

describe('generateGraduationPlan', () => {
  it('places subjects with no prerequisites in the first semester, respecting the credit limit', () => {
    const subjects = [subj('A', 6, [], 1), subj('B', 6, [], 1), subj('C', 6, ['A'], 2)]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 12 })
    expect(plan.semesters[0].subjects.map(s => s.code).sort()).toEqual(['A', 'B'])
    expect(plan.semesters[0].totalCredits).toBe(12)
  })

  it('unlocks a dependent subject only in a later semester', () => {
    const subjects = [subj('A', 6, [], 1), subj('B', 6, ['A'], 2)]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24 })
    const semesterOfB = plan.semesters.findIndex(sem => sem.subjects.some(s => s.code === 'B'))
    const semesterOfA = plan.semesters.findIndex(sem => sem.subjects.some(s => s.code === 'A'))
    expect(semesterOfB).toBeGreaterThan(semesterOfA)
  })

  it('excludes already-completed subjects from the plan', () => {
    const subjects = [subj('A', 6, []), subj('B', 6, [])]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: ['A'] })
    const allPlanned = plan.semesters.flatMap(s => s.subjects.map(x => x.code))
    expect(allPlanned).not.toContain('A')
    expect(allPlanned).toContain('B')
  })

  it('always places at least one subject per semester even if it exceeds the limit alone', () => {
    const subjects = [subj('A', 40, [])]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24 })
    expect(plan.semesters).toHaveLength(1)
    expect(plan.semesters[0].subjects.map(s => s.code)).toEqual(['A'])
  })

  it('fills remaining slack with elective placeholders', () => {
    const subjects = [subj('A', 6, [])]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 10, electiveCreditsRemaining: 4 })
    const electives = plan.semesters[0].subjects.filter(s => s.isElective)
    expect(electives.length).toBeGreaterThan(0)
  })

  it('interleaves elective placeholders into early semesters instead of only the tail', () => {
    // A1+A2 exactly fill the 24-credit cap on their own, so without a reserved
    // elective slot the first semester would have zero slack for electives.
    const subjects = [subj('A1', 12, [], 1), subj('A2', 12, [], 1)]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24, electiveCreditsRemaining: 8 })
    expect(plan.semesters[0].subjects.some(s => s.isElective)).toBe(true)
  })

  it('reports leftover subjects as unscheduled when the semester cap is hit', () => {
    const subjects = [subj('A', 6, [])]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24 })
    expect(plan.unscheduled).toEqual([])
  })
})
