import { calculateSubjectStatuses } from '../composables/useCurriculumStatus'
import { getCourseDifficulty } from '../data/courseDifficulty'
import { getCourseCampus } from '../data/courseCampus'

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
  generateGraduationPlan({ subjects = [], completedCodes = [], creditLimit = 24, electiveCreditsRemaining = 0, firstSemesterCreditLimit = null, electiveCreditsAlreadyPlaced = 0, canAdd = null, groupByCampus = false, maxHardPerSemester = null, frozenCourses = {} }) {
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
      const electivesPlacedSoFar = electiveCreditsAlreadyPlaced + (initialElectiveCredits - electivesLeft)
      // Só o primeiro semestre gerado nesta chamada usa o limite customizado - os demais
      // seguem o limite padrão, mesmo quando essa chamada está regerando só uma "cauda" do plano.
      const semesterLimit = (semesters.length === 0 && firstSemesterCreditLimit != null) ? firstSemesterCreditLimit : creditLimit

      // Status calculado sobre TODAS as disciplinas (não só as pendentes), para que
      // a soma de créditos concluídos usada nos pré-requisitos por crédito seja correta.
      const statuses = calculateSubjectStatuses(subjects, simulatedCompleted, electivesPlacedSoFar)
      const available = remaining
        .filter(s => statuses[s.id] === 'available')
        .sort((a, b) => (a.semester - b.semester) || ((b.credits || 0) - (a.credits || 0)))

      const chosen = []
      const postponed = []
      let totalCredits = 0

      // Adiciona cursos congelados para este semestre primeiro
      const frozenCodesThisSem = Object.entries(frozenCourses)
        .filter(([_, semIdx]) => semIdx === semesters.length)
        .map(([code, _]) => code.toUpperCase())

      if (frozenCodesThisSem.length > 0) {
        const availableByCode = new Map(available.map(s => [s.code.toUpperCase(), s]))
        frozenCodesThisSem.forEach(code => {
          const subject = availableByCode.get(code)
          if (subject) {
            chosen.push(subject)
            totalCredits += subject.credits || 0
          }
        })
      }

      // Reserva um bloco de eletiva antes de encaixar obrigatórias, pra elas não ficarem
      // só espremidas na folga do fim do semestre (o que empurra todas pro final do curso).
      // ponytail: reserva fixa de 1 bloco/semestre, não proporcional a quantos semestres faltam;
      // se ficar grosseiro demais, trocar por electivesLeft / semestres restantes estimados.
      const electiveReserve = electivesLeft > 0
        ? Math.min(ELECTIVE_BLOCK_CREDITS, electivesLeft, semesterLimit)
        : 0
      const mandatoryLimit = semesterLimit - electiveReserve

      // Lista mutável: quando groupByCampus está ligado, a "cauda" ainda não processada é
      // reordenada a cada aceite para priorizar o câmpus já escolhido neste semestre.
      const pool = [...available].filter(s => !chosen.includes(s))
      let i = 0
      while (i < pool.length) {
        const s = pool[i]
        const credits = s.credits || 0
        // O primeiro aceito do semestre nunca é recusado (nem por limite, nem por canAdd,
        // nem por dificuldade) - senão uma disciplina que colide com tudo travaria o plano
        // pra sempre. Virando "primeira" em algum semestre, o plano sempre avança.
        const isFirst = chosen.length === 0

        if (!isFirst && totalCredits + credits > mandatoryLimit) { i++; continue }

        if (!isFirst && maxHardPerSemester != null && getCourseDifficulty(s.code) === 'dificil') {
          const hardCount = chosen.filter(c => getCourseDifficulty(c.code) === 'dificil').length
          if (hardCount >= maxHardPerSemester) { i++; continue }
        }

        if (!isFirst && canAdd) {
          const reason = canAdd(chosen, s)
          if (reason) {
            postponed.push({ code: s.code, reason })
            i++
            continue
          }
        }

        chosen.push(s)
        totalCredits += credits
        i++

        if (groupByCampus) {
          const campus = getCourseCampus(s.code)
          if (campus) {
            const tail = pool.slice(i)
            tail.sort((a, b) => (getCourseCampus(a.code) === campus ? 0 : 1) - (getCourseCampus(b.code) === campus ? 0 : 1))
            pool.splice(i, tail.length, ...tail)
          }
        }
      }

      if (chosen.length > 0) {
        chosen.forEach(s => simulatedCompleted.push(s.code))
        const chosenIds = new Set(chosen.map(s => s.id))
        remaining = remaining.filter(s => !chosenIds.has(s.id))
      }

      // Preenche a folga restante do semestre com blocos de eletiva até fechar a cota.
      while (electivesLeft > 0 && (chosen.length === 0 || totalCredits < semesterLimit)) {
        const blockCredits = Math.min(ELECTIVE_BLOCK_CREDITS, electivesLeft)
        if (chosen.length > 0 && totalCredits + blockCredits > semesterLimit) break
        chosen.push(makeElectivePlaceholder(blockCredits))
        totalCredits += blockCredits
        electivesLeft -= blockCredits
      }

      if (chosen.length === 0) break

      semesters.push({ subjects: chosen, totalCredits, postponed })
    }

    return { semesters, unscheduled: remaining }
  }
}
