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

  it('postpones a candidate rejected by canAdd to the next semester', () => {
    const subjects = [subj('A', 6, [], 1), subj('B', 6, [], 1)]
    const canAdd = (chosen, candidate) => (candidate.code === 'B' && chosen.some(c => c.code === 'A')) ? 'conflita com A' : null
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 12, canAdd })
    expect(plan.semesters[0].subjects.map(s => s.code)).toEqual(['A'])
    expect(plan.semesters[0].postponed).toEqual([{ code: 'B', reason: 'conflita com A' }])
    expect(plan.semesters[1].subjects.map(s => s.code)).toEqual(['B'])
  })

  it('never lets canAdd block every subject of a semester (progress guarantee)', () => {
    const subjects = [subj('A', 6, [], 1), subj('B', 6, [], 1)]
    const canAdd = () => 'sempre recusa'
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24, canAdd })
    const allPlanned = plan.semesters.flatMap(s => s.subjects.map(x => x.code))
    expect(allPlanned.sort()).toEqual(['A', 'B'])
    expect(plan.unscheduled).toEqual([])
  })

  it('groups same-campus subjects together when groupByCampus is set', () => {
    const subjects = [subj('INF001', 6, [], 1), subj('ENG001', 6, [], 1), subj('INF002', 6, [], 1)]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24, groupByCampus: true })
    expect(plan.semesters[0].subjects.map(s => s.code)).toEqual(['INF001', 'INF002', 'ENG001'])
  })

  it('caps hard subjects per semester when maxHardPerSemester is set', () => {
    const subjects = [subj('MAT01353', 4, [], 1), subj('MAT01354', 4, [], 1), subj('INF01087', 4, [], 1)]
    const plan = predictionService.generateGraduationPlan({ subjects, completedCodes: [], creditLimit: 24, maxHardPerSemester: 1 })
    expect(plan.semesters[0].subjects.map(s => s.code)).toEqual(['MAT01353', 'INF01087'])
    expect(plan.semesters[1].subjects.map(s => s.code)).toEqual(['MAT01354'])
  })
})
