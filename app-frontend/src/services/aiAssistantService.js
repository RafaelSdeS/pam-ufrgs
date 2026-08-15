import { dataService } from './dataService'
import { curriculumService } from './curriculumService'
import { normalizeText } from '../utils/searchUtils'

const WORKER_URL = import.meta.env.VITE_AI_WORKER_URL

// ponytail: casamento por substring simples, não pega abreviações/typos - trocar por
// fuzzyMatchName (searchUtils.js) se isso se mostrar curto demais na prática
export function findMentionedCourseCodes(question, courses) {
  const normQuestion = normalizeText(question)
  const codes = new Set()
  courses.forEach(c => {
    const baseName = normalizeText(c.nome).split(' - ')[0]
    if (baseName.length > 3 && normQuestion.includes(baseName)) codes.add(c.codigo)
    else if (normalizeText(c.codigo) && normQuestion.includes(normalizeText(c.codigo))) codes.add(c.codigo)
  })
  return codes
}

export const aiAssistantService = {
  async askAssistant(question) {
    if (!WORKER_URL) {
      throw new Error('Assistente de IA não configurado (VITE_AI_WORKER_URL ausente).')
    }

    const courseCode = curriculumService.getSelectedCourse() || 'CIC'
    const disciplinasCurriculo = curriculumService.getCurriculumSubjects(courseCode)
      .map(s => ({
        codigo: s.code, nome: s.name, semestre: s.semester, creditos: s.credits, pre_requisitos: s.prerequisites,
        ...(s.min_credits_required ? { min_creditos_obrigatorios_requeridos: s.min_credits_required } : {}),
        ...(s.min_elective_credits_required ? { min_creditos_eletivos_requeridos: s.min_elective_credits_required } : {})
      }))
    const disciplinasEletivas = dataService.getElectiveCatalog(courseCode)
      .map(c => ({ codigo: c.code, nome: c.name, creditos: c.credits, pre_requisitos: c.prerequisites }))

    const context = {
      curso: courseCode,
      disciplinas_curriculo: disciplinasCurriculo,
      disciplinas_eletivas: disciplinasEletivas,
      disciplinas_concluidas: dataService.getCompletedCourses(),
      disciplinas_desejadas: dataService.getDesiredCourses(),
      disciplinas_elegiveis: dataService.getEligibleCourses(courseCode).map(c => c.code)
    }

    // Só inclui turmas das disciplinas que a pergunta parece mencionar - mandar todas as
    // turmas do curso estouraria o limite de tokens/min da Groq (ver ai-worker/index.js).
    const mentionedCodes = findMentionedCourseCodes(question, [...disciplinasCurriculo, ...disciplinasEletivas])
    if (mentionedCodes.size > 0) {
      context.turmas = dataService.getTurmas(courseCode)
        .filter(t => mentionedCodes.has(t.course_code || t.course_id))
        .map(t => ({
          codigo: t.course_code || t.course_id,
          turma: t.section_code,
          professor: (t.professor_name || '').trim() || (Array.isArray(t.ministrantes) ? t.ministrantes.join(', ') : ''),
          horarios: (t.schedules || []).map(s => ({
            dia: s.day_of_week, inicio: (s.start_time || '').slice(0, 5), fim: (s.end_time || '').slice(0, 5), sala: s.room
          }))
        }))
    }

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context })
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const err = new Error(data.error || 'Falha ao consultar o assistente de IA.')
      if (response.status === 429) {
        err.isRateLimit = true
        err.retryAfterSeconds = data.retryAfterSeconds || 20
      }
      throw err
    }

    return data.answer
  }
}
