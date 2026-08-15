import { describe, it, expect } from 'vitest'

// curriculumService reads localStorage at module load time (ref(localStorage.getItem(...))),
// so it must be stubbed before the dynamic import below runs (static imports are hoisted).
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { findMentionedCourseCodes } = await import('./aiAssistantService.js')

const courses = [
  { codigo: 'ENG10001', nome: 'CIRCUITOS ELÉTRICOS I - C' },
  { codigo: 'MAT01353', nome: 'CÁLCULO E GEOMETRIA ANALÍTICA I - A' },
  { codigo: 'INF01202', nome: 'ALGORÍTMOS E PROGRAMAÇÃO - CIC' }
]

describe('findMentionedCourseCodes', () => {
  it('matches subject name even with UFRGS turno/campus suffix ("- C") stripped', () => {
    const codes = findMentionedCourseCodes('Quem são os professores de Circuitos Elétricos I?', courses)
    expect(codes.has('ENG10001')).toBe(true)
  })

  it('matches by course code', () => {
    const codes = findMentionedCourseCodes('horário da MAT01353', courses)
    expect(codes.has('MAT01353')).toBe(true)
  })

  it('is accent/case insensitive', () => {
    const codes = findMentionedCourseCodes('calculo e geometria analitica i', courses)
    expect(codes.has('MAT01353')).toBe(true)
  })

  it('does not match unrelated questions', () => {
    const codes = findMentionedCourseCodes('qual o horário de Cálculo Numérico?', courses)
    expect(codes.size).toBe(0)
  })
})
