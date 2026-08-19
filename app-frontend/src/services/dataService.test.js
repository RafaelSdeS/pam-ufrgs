import { describe, it, expect, beforeEach } from 'vitest'

// dataService imports curriculumService, which reads localStorage at module load time,
// so it must be stubbed before the dynamic import below runs (static imports are hoisted).
// Real in-memory store (not a no-op stub) so round-trip tests below can actually persist.
const store = new Map()
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
}
const { dataService } = await import('./dataService.js')

describe('parseTurmasCsv', () => {
  it('parses a well-formed CSV row into a turma with normalized schedule', () => {
    const csv = [
      'course_code,section_code,semester,capacity,professor_name,schedules',
      'INF01202,A,2026/1,50,João Silva,"Segunda das 8:00 - 10:00 (SALA 101); Quarta das 8:00 as 10:00 (SALA 101)"'
    ].join('\n')

    const turmas = dataService.parseTurmasCsv(csv)
    expect(turmas).toHaveLength(1)
    expect(turmas[0].course_code).toBe('INF01202')
    expect(turmas[0].schedules).toEqual([
      { day_of_week: 'Segunda-feira', start_time: '08:00:00', end_time: '10:00:00', room: 'SALA 101' },
      { day_of_week: 'Quarta-feira', start_time: '08:00:00', end_time: '10:00:00', room: 'SALA 101' }
    ])
  })

  it('returns an empty array when there is only a header row', () => {
    expect(dataService.parseTurmasCsv('course_code,section_code,semester,capacity,professor_name,schedules')).toEqual([])
  })

  it('skips rows with fewer than the required columns', () => {
    const csv = 'a,b,c,d,e,f\nonly,two,cols'
    expect(dataService.parseTurmasCsv(csv)).toEqual([])
  })
})

describe('current semester', () => {
  beforeEach(() => store.clear())

  it('falls back to the default when nothing is stored', () => {
    expect(dataService.getCurrentSemester()).toBe('2026/2')
  })

  it('round-trips a chosen semester through localStorage', () => {
    dataService.setCurrentSemester('2027/1')
    expect(dataService.getCurrentSemester()).toBe('2027/1')
  })
})

describe('completed courses', () => {
  beforeEach(() => store.clear())

  it('toggles a course on and off', () => {
    expect(dataService.toggleCompletedCourse('inf01202')).toEqual(['INF01202'])
    expect(dataService.toggleCompletedCourse('INF01202')).toEqual([])
  })

  it('expands equivalent courses (MAT02219 <-> MAT02050) when reading back', () => {
    dataService.saveCompletedCourses(['MAT02219'])
    const completed = dataService.getCompletedCourses()
    expect(completed).toContain('MAT02219')
    expect(completed).toContain('MAT02050')
  })
})

describe('desired courses', () => {
  beforeEach(() => store.clear())

  it('round-trips the desired course list', () => {
    dataService.saveDesiredCourses([{ code: 'INF01202' }])
    expect(dataService.getDesiredCourses()).toEqual([{ code: 'INF01202' }])
  })

  it('backs up the desired list only on the first preview, and restores it', () => {
    dataService.saveDesiredCourses([{ code: 'INF01202' }])
    dataService.previewDesiredCourses([{ code: 'INF01203' }])
    dataService.previewDesiredCourses([{ code: 'INF01120' }]) // second call must not overwrite the backup
    expect(dataService.hasDesiredCoursesBackup()).toBe(true)

    dataService.restoreDesiredCoursesBackup()
    expect(dataService.getDesiredCourses()).toEqual([{ code: 'INF01202' }])
    expect(dataService.hasDesiredCoursesBackup()).toBe(false)
  })
})

describe('restrictions', () => {
  beforeEach(() => store.clear())

  it('keeps a well-formed time restriction and a well-formed professor preference', () => {
    const list = [
      { dia: 'Segunda', horario_inicio: '08:00', horario_fim: '10:00' },
      { restriction_type: 'professor_preference', course_id: 'INF01202', preferred_professor: 'João' }
    ]
    dataService.saveRestrictions(list)
    expect(dataService.getRestrictions()).toEqual(list)
  })

  it('drops incomplete time restrictions and professor preferences missing a name', () => {
    const list = [
      { dia: 'Segunda', horario_inicio: '', horario_fim: '10:00' },
      { restriction_type: 'professor_preference', course_id: 'INF01202' }
    ]
    dataService.saveRestrictions(list)
    expect(dataService.getRestrictions()).toEqual([])
  })
})
