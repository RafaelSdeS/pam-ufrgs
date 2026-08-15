import { describe, it, expect } from 'vitest'

// dataService imports curriculumService, which reads localStorage at module load time,
// so it must be stubbed before the dynamic import below runs (static imports are hoisted).
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
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
