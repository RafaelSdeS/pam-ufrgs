import { calculateSubjectStatuses } from '../composables/useCurriculumStatus'

const MAX_SEMESTERS = 40
const ELECTIVE_BLOCK_CREDITS = 4

function makeElectivePlaceholder(credits) {
  return {
    id: `ELETIVA-${credits}`,
    code: `ELETIVA-${credits}`,
    name: 'Eletiva (a escolher)',
    credits,
    prerequisites: [],
    semester: 0,
    isElective: true
  }
}

export const predictionService = {
  generateGraduationPlan({ subjects = [], completedCodes = [], creditLimit = 24, electiveCreditsRemaining = 0 }) {
    const completedSet = new Set(completedCodes.map(c => String(c).toUpperCase()))
    let remaining = subjects.filter(s => !completedSet.has(String(s.code).toUpperCase()))
    const simulatedCompleted = [...completedCodes]
    const semesters = []
    const initialElectiveCredits = Math.max(0, electiveCreditsRemaining)
    let electivesLeft = initialElectiveCredits

    while ((remaining.length > 0 || electivesLeft > 0) && semesters.length < MAX_SEMESTERS) {
      // Eletivas colocadas em semestres anteriores desta mesma simulação - usado só para o
      // limiar de "créditos eletivos" de algumas disciplinas (ex.: Trabalho de Graduação no ECP).
      // Não conta as eletivas do próprio semestre sendo montado agora.
      const electivesPlacedSoFar = initialElectiveCredits - electivesLeft

      // Status calculado sobre TODAS as disciplinas (não só as pendentes), para que
      // a soma de créditos concluídos usada nos pré-requisitos por crédito seja correta.
      const statuses = calculateSubjectStatuses(subjects, simulatedCompleted)
      const available = remaining
        .filter(s => statuses[s.id] === 'available')
        .filter(s => (s.min_elective_credits_required || 0) <= electivesPlacedSoFar)
        .sort((a, b) => (a.semester - b.semester) || ((b.credits || 0) - (a.credits || 0)))

      const chosen = []
      let totalCredits = 0

      for (const s of available) {
        const credits = s.credits || 0
        if (chosen.length === 0 || totalCredits + credits <= creditLimit) {
          chosen.push(s)
          totalCredits += credits
        }
      }

      if (chosen.length > 0) {
        chosen.forEach(s => simulatedCompleted.push(s.code))
        const chosenIds = new Set(chosen.map(s => s.id))
        remaining = remaining.filter(s => !chosenIds.has(s.id))
      }

      // Preenche a folga restante do semestre com blocos de eletiva até fechar a cota.
      while (electivesLeft > 0 && (chosen.length === 0 || totalCredits < creditLimit)) {
        const blockCredits = Math.min(ELECTIVE_BLOCK_CREDITS, electivesLeft)
        if (chosen.length > 0 && totalCredits + blockCredits > creditLimit) break
        chosen.push(makeElectivePlaceholder(blockCredits))
        totalCredits += blockCredits
        electivesLeft -= blockCredits
      }

      if (chosen.length === 0) break

      semesters.push({ subjects: chosen, totalCredits })
    }

    return { semesters, unscheduled: remaining }
  }
}
