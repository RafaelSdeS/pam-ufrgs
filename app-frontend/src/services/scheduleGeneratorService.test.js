import { describe, it, expect } from 'vitest'
import { scheduleGeneratorService as sgs } from './scheduleGeneratorService.js'

function sched(day, start, end, room = 'A1') {
  return { day_of_week: day, start_time: start, end_time: end, room }
}

function section(course_code, section_code, schedules, extra = {}) {
  return { course_code, section_code, schedules, professor_name: '', ministrantes: [], ...extra }
}

describe('normalizeDay', () => {
  it('expands abbreviated portuguese weekday names', () => {
    expect(sgs.normalizeDay('Seg')).toBe('Segunda-feira')
    expect(sgs.normalizeDay('Ter')).toBe('Terça-feira')
    expect(sgs.normalizeDay('Sab')).toBe('Sábado')
  })

  it('passes through unrecognized values', () => {
    expect(sgs.normalizeDay('')).toBe('')
    expect(sgs.normalizeDay('Feriado')).toBe('Feriado')
  })
})

describe('schedulesConflict', () => {
  it('detects overlap on the same day', () => {
    const a = sched('Segunda-feira', '10:00', '12:00')
    const b = sched('Segunda-feira', '11:00', '13:00')
    expect(sgs.schedulesConflict(a, b)).toBe(true)
  })

  it('does not conflict on different days', () => {
    const a = sched('Segunda-feira', '10:00', '12:00')
    const b = sched('Terça-feira', '10:00', '12:00')
    expect(sgs.schedulesConflict(a, b)).toBe(false)
  })

  it('treats back-to-back slots (end == start) as non-conflicting', () => {
    const a = sched('Segunda-feira', '10:00', '12:00')
    const b = sched('Segunda-feira', '12:00', '14:00')
    expect(sgs.schedulesConflict(a, b)).toBe(false)
  })
})

describe('sectionViolatesHardBlock', () => {
  it('flags a section overlapping a hard block', () => {
    const s = section('INF01202', 'A', [sched('Segunda-feira', '10:00', '12:00')])
    const hardBlocks = [{ day_of_week: 'Segunda-feira', start_time: '11:00', end_time: '13:00' }]
    expect(sgs.sectionViolatesHardBlock(s, hardBlocks)).toBe(true)
  })

  it('allows a section outside all hard blocks', () => {
    const s = section('INF01202', 'A', [sched('Segunda-feira', '10:00', '12:00')])
    const hardBlocks = [{ day_of_week: 'Terça-feira', start_time: '11:00', end_time: '13:00' }]
    expect(sgs.sectionViolatesHardBlock(s, hardBlocks)).toBe(false)
  })
})

describe('generateRankedSchedules', () => {
  const courseA = { code: 'INF01202', name: 'Algoritmos' }
  const courseB = { code: 'MAT01353', name: 'Cálculo I' }

  it('returns [] when no courses are selected', () => {
    expect(sgs.generateRankedSchedules({ selectedCourses: [], turmas: [] })).toEqual([])
  })

  it('returns [] when a selected course has no offered sections', () => {
    const turmas = [section('MAT01353', 'A', [sched('Segunda-feira', '10:00', '12:00')])]
    const result = sgs.generateRankedSchedules({ selectedCourses: [{ course: courseA }, { course: courseB }], turmas })
    expect(result).toEqual([])
  })

  it('combines non-conflicting sections from different courses', () => {
    const turmas = [
      section('INF01202', 'A', [sched('Segunda-feira', '08:00', '10:00')]),
      section('MAT01353', 'B', [sched('Terça-feira', '08:00', '10:00')])
    ]
    const result = sgs.generateRankedSchedules({ selectedCourses: [{ course: courseA }, { course: courseB }], turmas })
    expect(result).toHaveLength(1)
    expect(result[0].schedule.map(s => s.course_code).sort()).toEqual(['INF01202', 'MAT01353'])
  })

  it('excludes combinations whose only sections conflict with each other', () => {
    const turmas = [
      section('INF01202', 'A', [sched('Segunda-feira', '08:00', '10:00')]),
      section('MAT01353', 'B', [sched('Segunda-feira', '09:00', '11:00')])
    ]
    const result = sgs.generateRankedSchedules({ selectedCourses: [{ course: courseA }, { course: courseB }], turmas })
    expect(result).toEqual([])
  })

  it('drops sections that fall inside a hard_block restriction', () => {
    const turmas = [section('INF01202', 'A', [sched('Segunda-feira', '08:00', '10:00')])]
    const restrictions = [{ restriction_type: 'hard_block', day_of_week: 'Segunda-feira', start_time: '07:00', end_time: '11:00' }]
    const result = sgs.generateRankedSchedules({ selectedCourses: [{ course: courseA }], turmas, restrictions })
    expect(result).toEqual([])
  })

  it('ranks the higher-priority course combination first', () => {
    const turmas = [
      section('INF01202', 'A', [sched('Segunda-feira', '08:00', '10:00')]),
      section('MAT01353', 'B', [sched('Terça-feira', '08:00', '10:00')])
    ]
    const result = sgs.generateRankedSchedules({
      selectedCourses: [{ course: { ...courseA, importanceLevel: 'high' } }, { course: courseB }],
      turmas
    })
    expect(result[0].score).toBeGreaterThan(0)
  })
})

describe('diagnoseConflicts', () => {
  it('reports when no course is selected', () => {
    const { reasons } = sgs.diagnoseConflicts([], [])
    expect(reasons[0]).toMatch(/Nenhuma disciplina/)
  })

  it('reports when a course has no turmas at all', () => {
    const { reasons } = sgs.diagnoseConflicts([{ code: 'INF01202', name: 'Algoritmos' }], [])
    expect(reasons[0]).toMatch(/não possui turmas/)
  })

  it('reports a direct conflict between two courses whose only sections overlap', () => {
    const turmas = [
      section('INF01202', 'A', [sched('Segunda-feira', '08:00', '10:00')]),
      section('MAT01353', 'B', [sched('Segunda-feira', '09:00', '11:00')])
    ]
    const { reasons } = sgs.diagnoseConflicts(
      [{ code: 'INF01202', name: 'Algoritmos' }, { code: 'MAT01353', name: 'Cálculo I' }],
      turmas
    )
    expect(reasons.some(r => r.includes('Coincidência direta'))).toBe(true)
  })
})
