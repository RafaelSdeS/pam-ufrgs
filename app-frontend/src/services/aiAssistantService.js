import { dataService } from './dataService'
import { curriculumService } from './curriculumService'

const WORKER_URL = import.meta.env.VITE_AI_WORKER_URL

export const aiAssistantService = {
  async askAssistant(question) {
    if (!WORKER_URL) {
      throw new Error('Assistente de IA não configurado (VITE_AI_WORKER_URL ausente).')
    }

    const courseCode = curriculumService.getSelectedCourse() || 'CIC'
    const context = {
      curso: courseCode,
      disciplinas_curriculo: curriculumService.getCurriculumSubjects(courseCode)
        .map(s => ({
          codigo: s.code, nome: s.name, semestre: s.semester, creditos: s.credits, pre_requisitos: s.prerequisites,
          ...(s.min_credits_required ? { min_creditos_obrigatorios_requeridos: s.min_credits_required } : {}),
          ...(s.min_elective_credits_required ? { min_creditos_eletivos_requeridos: s.min_elective_credits_required } : {})
        })),
      disciplinas_eletivas: dataService.getElectiveCatalog(courseCode)
        .map(c => ({ codigo: c.code, nome: c.name, creditos: c.credits, pre_requisitos: c.prerequisites })),
      disciplinas_concluidas: dataService.getCompletedCourses(),
      disciplinas_desejadas: dataService.getDesiredCourses(),
      disciplinas_elegiveis: dataService.getEligibleCourses(courseCode).map(c => c.code)
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
