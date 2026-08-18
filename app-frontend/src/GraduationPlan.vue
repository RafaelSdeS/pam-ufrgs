<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { dataService, escapeHtml } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import { predictionService } from './services/predictionService'
import { scheduleGeneratorService } from './services/scheduleGeneratorService'
import { calculateSubjectStatuses } from './composables/useCurriculumStatus'
import { matchCourse } from './utils/searchUtils'
import { getCourseDifficulty, getDifficultyLabel, getDifficultyColor } from './data/courseDifficulty'
import { getCourseCampus } from './data/courseCampus'
import { parsePlano, ICON_BY_CATEGORY } from './utils/planoParser'

const emit = defineEmits(['change-page'])

const ELECTIVE_CODE_RE = /^ELETIVA-(\d+)$/

const selectedCourse = curriculumService.selectedCourseRef
const creditLimit = ref(24)
const semesters = ref([]) // array of arrays of course codes (or "ELETIVA-<credits>" placeholders)
const semesterCreditLimits = ref({}) // mapa esparso { semIndex: limite } para semestres com limite customizado
const unscheduled = ref([])
const staleNotice = ref(false)
const postponedBySemester = ref([]) // paralelo a semesters.value - só preenchido pelo próprio recálculo, não persistido

const planPrefs = reactive({ avoidScheduleConflicts: false, groupByCampus: false, limitHardSubjects: false })
const MAX_HARD_PER_SEMESTER = 2 // ponytail: teto fixo, virar configurável se pedirem ajuste fino

function loadPlanPrefs() {
  Object.assign(planPrefs, dataService.getPlanPreferences())
}
watch(planPrefs, () => dataService.savePlanPreferences({ ...planPrefs }), { deep: true })

function effectiveLimit(semIndex) {
  const override = semesterCreditLimits.value[semIndex]
  return override !== undefined ? override : creditLimit.value
}

const subjectsMap = computed(() => {
  const map = {}
  curriculumService.getCurriculumSubjects(selectedCourse.value).forEach(s => { map[s.code] = s })
  return map
})

const graduationRequirements = computed(() => curriculumService.getGraduationRequirements(selectedCourse.value))

const pendingSubjectCodes = computed(() => {
  const completed = new Set(dataService.getCompletedCourses().map(c => c.toUpperCase()))
  return Object.keys(subjectsMap.value).filter(code => !completed.has(code.toUpperCase()))
})

const completedElectiveCredits = computed(() => {
  const mandatoryCodes = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  let total = 0
  dataService.getCompletedCourses().forEach(code => {
    if (!mandatoryCodes.has(code.toUpperCase())) {
      total += dataService.getCourseCredits(code, selectedCourse.value)
    }
  })
  return total
})

const electiveCreditsRemaining = computed(() => Math.max(0, graduationRequirements.value.elective - completedElectiveCredits.value))

const completedMandatoryCredits = computed(() => {
  const mandatoryCodes = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  let total = 0
  dataService.getCompletedCourses().forEach(code => {
    if (mandatoryCodes.has(code.toUpperCase())) total += dataService.getCourseCredits(code, selectedCourse.value)
  })
  return total
})

// Explica por que o predictionService não conseguiu encaixar cada disciplina - sem isso o
// usuário só via "verifique os pré-requisitos", o que não cobre o caso (raro, mas real p/ ex.
// em ECP99001/TG-I-ECP) de bloqueio por limiar de créditos já cursados.
const unscheduledDetails = computed(() => {
  const completedSet = new Set(dataService.getCompletedCourses().map(c => String(c).toUpperCase()))
  return unscheduled.value.map(s => {
    const missingPrereqs = (s.prerequisites || []).filter(p => !completedSet.has(String(p).toUpperCase()))
    const parts = []
    if (missingPrereqs.length) parts.push(`pré-requisito(s) pendente(s): ${missingPrereqs.join(', ')}`)
    if (s.min_credits_required && completedMandatoryCredits.value < s.min_credits_required) {
      parts.push(`exige ${s.min_credits_required} créditos obrigatórios cursados (você tem ${completedMandatoryCredits.value})`)
    }
    if (s.min_elective_credits_required && completedElectiveCredits.value < s.min_elective_credits_required) {
      parts.push(`exige ${s.min_elective_credits_required} créditos eletivos cursados (você tem ${completedElectiveCredits.value})`)
    }
    return { code: s.code, name: s.name, reason: parts.length ? parts.join('; ') : 'pré-requisitos ainda não atendidos dentro do horizonte de planejamento' }
  })
})

const electiveCatalog = computed(() => dataService.getElectiveCatalog(selectedCourse.value))
const electiveCatalogCodes = computed(() => new Set(electiveCatalog.value.map(c => (c.code || '').toUpperCase())))

const usedElectiveCodes = computed(() => {
  const mandatorySet = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  const used = new Set()
  semesters.value.flat().forEach(code => {
    const upper = code.toUpperCase()
    if (!ELECTIVE_CODE_RE.test(code) && !mandatorySet.has(upper)) used.add(upper)
  })
  return used
})

function cumulativeCompletedBefore(semIndex) {
  const set = new Set(dataService.getCompletedCourses().map(c => c.toUpperCase()))
  for (let i = 0; i < semIndex; i++) {
    semesters.value[i].forEach(code => {
      if (!ELECTIVE_CODE_RE.test(code)) set.add(code.toUpperCase())
    })
  }
  return set
}

function isElectiveEligible(course, cumulativeSet, cumulativeCredits) {
  if ((course.min_credits_required || 0) > cumulativeCredits) return false
  const prereqs = course.prerequisites || []
  return prereqs.every(p => {
    const upper = (p || '').toUpperCase()
    if (cumulativeSet.has(upper)) return true
    // Só ignora o pré-requisito se ele nem existir no catálogo do curso atual (obrigatória ou
    // eletiva) - ex.: código de grade obrigatória de outro currículo. Se for uma eletiva real
    // ainda não concluída/planejada, bloqueia (antes só considerava a grade obrigatória, deixando
    // pré-requisito eletiva->eletiva passar batido - ver dataService.getEligibleCourses).
    if (!subjectsMap.value[upper] && !electiveCatalogCodes.value.has(upper)) return true
    return false
  })
}

const pickerOpen = ref(false)
const pickerTarget = ref(null) // { semIndex, subjectIndex }
const pickerSearch = ref('')
const pickerCreditsFilter = ref('all')

const pickerCandidates = computed(() => {
  if (!pickerTarget.value) return []
  const cumulative = cumulativeCompletedBefore(pickerTarget.value.semIndex)
  const cumulativeCredits = [...cumulative].reduce((sum, code) => sum + dataService.getCourseCredits(code, selectedCourse.value), 0)
  const used = usedElectiveCodes.value
  return electiveCatalog.value.filter(c => {
    const code = c.code.toUpperCase()
    if (cumulative.has(code) || used.has(code)) return false
    if (!isElectiveEligible(c, cumulative, cumulativeCredits)) return false
    if (pickerCreditsFilter.value !== 'all' && c.credits !== Number(pickerCreditsFilter.value)) return false
    if (pickerSearch.value.trim() && !matchCourse(c, pickerSearch.value)) return false
    return true
  })
})

function openPicker(semIndex, subjectIndex) {
  pickerTarget.value = { semIndex, subjectIndex }
  pickerSearch.value = ''
  pickerCreditsFilter.value = 'all'
  pickerOpen.value = true
}

function selectElective(course) {
  const { semIndex, subjectIndex } = pickerTarget.value
  const next = semesters.value.map(sem => [...sem])
  next[semIndex][subjectIndex] = course.code
  semesters.value = next
  persist()
  clearScheduleChecks()
  pickerOpen.value = false
}

function resolveSubject(code) {
  if (subjectsMap.value[code]) return subjectsMap.value[code]
  const m = ELECTIVE_CODE_RE.exec(code)
  if (m) return { code, name: 'Eletiva (a escolher)', credits: parseInt(m[1]), isElective: true, isPlaceholder: true }
  const real = dataService.getCourseByCode(code, selectedCourse.value)
  if (real) return { ...real, isElective: true }
  return null
}

function persist() {
  dataService.saveGraduationPlan(semesters.value)
  dataService.saveCreditLimit(creditLimit.value)
  dataService.saveSemesterCreditLimits(semesterCreditLimits.value)
}

function checkStale() {
  const plannedCodes = new Set(semesters.value.flat().map(c => c.toUpperCase()))
  staleNotice.value = pendingSubjectCodes.value.some(code => !plannedCodes.has(code.toUpperCase()))
}

// Cruza a previsão com as turmas realmente oferecidas hoje - a previsão em si só sabe de
// pré-requisitos/créditos, não de conflito de horário. Só é fidedigno para os semestres mais
// próximos, já que a oferta de turmas muda a cada semestre; por isso é uma checagem sob demanda
// (manual), não recalculada automaticamente a cada mudança do plano.
const scheduleChecks = reactive({})
const checkingSemIndex = ref(null)

function clearScheduleChecks() {
  Object.keys(scheduleChecks).forEach(k => delete scheduleChecks[k])
}

function getTurmasForCodes(codes) {
  const codesSet = new Set(codes.map(c => c.toUpperCase()))
  return dataService.getTurmas().filter(t => {
    const code = (t.course_code || t.course_id || '').toUpperCase()
    return codesSet.has(code) && t.semester === '2026/2' && curriculumService.matchesSelectedCurriculum(t.curriculums, selectedCourse.value)
  })
}

// Predicado injetado no predictionService pra ele adiar disciplinas que colidem entre si nas
// turmas de hoje. Memoiza por combinação de códigos e tem orçamento próprio de tempo -
// generateRankedSchedules já tem budget de 1.5s por chamada, mas um recálculo de plano faz
// várias chamadas (uma por candidato por semestre); sem teto agregado o pior caso trava a UI
// por minutos. Ao estourar o orçamento, libera sem checar - o efeito é só perder um adiamento,
// nunca travar o plano.
function makeCanAdd() {
  const memo = new Map()
  const budgetStart = performance.now()
  const BUDGET_MS = 2000
  return (chosen, candidate) => {
    if (performance.now() - budgetStart > BUDGET_MS) return null

    const codes = [...chosen.map(c => c.code), candidate.code].sort()
    const key = codes.join(',')
    if (memo.has(key)) return memo.get(key)

    const turmas = getTurmasForCodes(codes)
    const offeredCodes = new Set(turmas.map(t => (t.course_code || t.course_id || '').toUpperCase()))
    // Sem turma conhecida pra ela em 2026/2 - neutro, nunca bloqueia (senão disciplina de
    // oferta alternada seria adiada pra sempre até MAX_SEMESTERS).
    if (!offeredCodes.has(candidate.code.toUpperCase())) {
      memo.set(key, null)
      return null
    }

    const chosenOffered = chosen.filter(c => offeredCodes.has(c.code.toUpperCase()))
    const results = scheduleGeneratorService.generateRankedSchedules({
      selectedCourses: [...chosenOffered, candidate],
      restrictions: dataService.getRestrictions(),
      turmas,
      limit: 1
    })
    const reason = results.length > 0 ? null : `conflita com as turmas atuais de ${chosenOffered.map(c => c.code).join(', ')}`
    memo.set(key, reason)
    return reason
  }
}

function checkSemesterSchedule(sem) {
  const courses = sem.subjects.filter(s => !s.isPlaceholder)
  if (courses.length === 0) return
  checkingSemIndex.value = sem.index
  // Adia o trabalho síncrono (pode levar até ~1.5s) um tick, só pra o spinner do botão pintar antes.
  setTimeout(() => {
    const turmas = getTurmasForCodes(courses.map(c => c.code))
    const offeredCodes = new Set(turmas.map(t => (t.course_code || t.course_id || '').toUpperCase()))
    const missing = courses.filter(c => !offeredCodes.has(c.code.toUpperCase()))
    if (missing.length > 0) {
      scheduleChecks[sem.index] = { status: 'unavailable', detail: `Sem turma oferecida no semestre atual: ${missing.map(c => c.code).join(', ')}.` }
    } else {
      const results = scheduleGeneratorService.generateRankedSchedules({
        selectedCourses: courses,
        restrictions: dataService.getRestrictions(),
        turmas,
        limit: 1
      })
      scheduleChecks[sem.index] = results.length > 0
        ? { status: 'ok', detail: '' }
        : { status: 'conflict', detail: 'As turmas oferecidas colidem entre si ou com suas restrições de horário salvas.' }
    }
    checkingSemIndex.value = null
  }, 0)
}

function scheduleCheckLabel(semIndex) {
  const check = scheduleChecks[semIndex]
  if (!check) return 'Verificar disponibilidade de horário'
  if (check.status === 'ok') return 'Compatível com as turmas atuais'
  if (check.status === 'unavailable') return 'Disciplina sem turma oferecida'
  return 'Conflito de horário nas turmas atuais'
}

function scheduleCheckColor(semIndex) {
  const check = scheduleChecks[semIndex]
  if (!check) return 'secondary'
  return check.status === 'ok' ? 'success' : 'error'
}

function recalculate() {
  if (!creditLimit.value || creditLimit.value < 1) {
    showSnackbar('Informe um limite de créditos válido (mínimo 1) antes de recalcular.', 'error')
    return
  }
  const subjects = Object.values(subjectsMap.value)
  const completed = dataService.getCompletedCourses()
  const result = predictionService.generateGraduationPlan({
    subjects,
    completedCodes: completed,
    creditLimit: creditLimit.value,
    electiveCreditsRemaining: electiveCreditsRemaining.value,
    electiveCreditsAlreadyPlaced: completedElectiveCredits.value,
    canAdd: planPrefs.avoidScheduleConflicts ? makeCanAdd() : null,
    groupByCampus: planPrefs.groupByCampus,
    maxHardPerSemester: planPrefs.limitHardSubjects ? MAX_HARD_PER_SEMESTER : null
  })
  semesters.value = result.semesters.map(sem => sem.subjects.map(s => s.code))
  postponedBySemester.value = result.semesters.map(sem => sem.postponed)
  semesterCreditLimits.value = {}
  unscheduled.value = result.unscheduled
  persist()
  staleNotice.value = false
  clearScheduleChecks()
}

// Recalcula só a partir de semIndex (inclusive) com um novo limite de créditos para esse
// semestre; os semestres anteriores ficam como estão, os seguintes usam o limite padrão.
function recalculateFrom(semIndex, newLimit) {
  const prefix = semesters.value.slice(0, semIndex)
  const prefixCodes = []
  let prefixElectiveCredits = 0
  prefix.flat().forEach(code => {
    const m = ELECTIVE_CODE_RE.exec(code)
    if (m) {
      prefixElectiveCredits += parseInt(m[1])
      return
    }
    prefixCodes.push(code)
    if (!subjectsMap.value[code]) {
      prefixElectiveCredits += dataService.getCourseCredits(code, selectedCourse.value)
    }
  })

  const subjects = Object.values(subjectsMap.value)
  const completed = [...dataService.getCompletedCourses(), ...prefixCodes]
  const remainingElectiveCredits = Math.max(0, electiveCreditsRemaining.value - prefixElectiveCredits)

  const result = predictionService.generateGraduationPlan({
    subjects,
    completedCodes: completed,
    creditLimit: creditLimit.value,
    electiveCreditsRemaining: remainingElectiveCredits,
    firstSemesterCreditLimit: newLimit,
    electiveCreditsAlreadyPlaced: completedElectiveCredits.value + prefixElectiveCredits,
    canAdd: planPrefs.avoidScheduleConflicts ? makeCanAdd() : null,
    groupByCampus: planPrefs.groupByCampus,
    maxHardPerSemester: planPrefs.limitHardSubjects ? MAX_HARD_PER_SEMESTER : null
  })

  const tail = result.semesters.map(sem => sem.subjects.map(s => s.code))
  semesters.value = [...prefix, ...tail]
  postponedBySemester.value = [...postponedBySemester.value.slice(0, semIndex), ...result.semesters.map(sem => sem.postponed)]

  const nextLimits = {}
  Object.entries(semesterCreditLimits.value).forEach(([idx, val]) => {
    if (Number(idx) < semIndex) nextLimits[idx] = val
  })
  nextLimits[semIndex] = newLimit
  semesterCreditLimits.value = nextLimits

  unscheduled.value = result.unscheduled
  persist()
  checkStale()
  clearScheduleChecks()
}

function autoCompleteElectives() {
  const catalog = electiveCatalog.value
  const mandatoryCodes = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  const usedElectiveCodes = new Set()
  let placeholdersFound = 0
  let placeholdersReplaced = 0

  const newSemesters = semesters.value.map((semesterCodes, semIndex) => {
    const cumulative = cumulativeCompletedBefore(semIndex)
    return semesterCodes.map(code => {
      const m = ELECTIVE_CODE_RE.exec(code)
      if (!m) return code

      placeholdersFound++
      const requiredCredits = parseInt(m[1])

      const eligible = catalog.filter(c => {
        const codeUpper = c.code.toUpperCase()
        if (cumulative.has(codeUpper) || usedElectiveCodes.has(codeUpper)) return false
        if (c.credits !== requiredCredits) return false
        const prereqs = c.prerequisites || []
        return prereqs.every(p => {
          const upper = (p || '').toUpperCase()
          if (cumulative.has(upper)) return true
          if (!subjectsMap.value[upper] && !mandatoryCodes.has(upper)) return true
          return false
        })
      })

      if (eligible.length > 0) {
        const chosen = eligible[0]
        usedElectiveCodes.add(chosen.code.toUpperCase())
        cumulative.add(chosen.code.toUpperCase())
        placeholdersReplaced++
        return chosen.code
      }
      return code
    })
  })

  if (placeholdersFound === 0) {
    showSnackbar('Nenhuma eletiva a completar nesta previsão.', 'info')
    return
  }

  semesters.value = newSemesters
  persist()
  clearScheduleChecks()
  showSnackbar(`${placeholdersReplaced} de ${placeholdersFound} eletiva(s) completada(s) com sucesso!`, 'success')
}

function loadOrGenerate() {
  clearScheduleChecks()
  creditLimit.value = dataService.getCreditLimit()
  semesterCreditLimits.value = dataService.getSemesterCreditLimits()
  loadPlanPrefs()
  const saved = dataService.getGraduationPlan()
  if (saved && saved.length) {
    semesters.value = saved
    unscheduled.value = []
    postponedBySemester.value = []
    checkStale()
  } else {
    recalculate()
  }
}

onMounted(loadOrGenerate)
watch(selectedCourse, loadOrGenerate)

const semesterCards = computed(() => semesters.value.map((codes, index) => {
  const subjects = codes.map(code => resolveSubject(code)).filter(Boolean)
  const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0)
  const difficultyCounts = { medio: 0, dificil: 0 }
  subjects.forEach(s => {
    if (s.isPlaceholder) return
    const level = getCourseDifficulty(s.code)
    if (level === 'medio' || level === 'dificil') difficultyCounts[level]++
  })
  return { index, subjects, totalCredits, difficultyCounts }
}))

const totalMandatoryRemaining = computed(() => semesterCards.value.reduce(
  (sum, sem) => sum + sem.subjects.filter(s => !s.isElective).reduce((a, s) => a + (s.credits || 0), 0), 0
))
const totalElectiveRemaining = computed(() => semesterCards.value.reduce(
  (sum, sem) => sum + sem.subjects.filter(s => s.isElective).reduce((a, s) => a + (s.credits || 0), 0), 0
))

// Percorre o plano em ordem, acumulando o que já teria sido "concluído" até cada semestre,
// e sinaliza disciplinas que não estariam disponíveis ali - útil depois de mover algo manualmente.
const violationSet = computed(() => {
  const violations = new Set()
  const subjects = Object.values(subjectsMap.value)
  const mandatoryCodes = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  const cumulative = [...dataService.getCompletedCourses()]
  let cumulativeElectiveCredits = completedElectiveCredits.value
  semesters.value.forEach((codes, semIndex) => {
    const statuses = calculateSubjectStatuses(subjects, cumulative, cumulativeElectiveCredits)
    codes.forEach(code => {
      if (ELECTIVE_CODE_RE.test(code)) return
      const subj = subjectsMap.value[code]
      if (subj && statuses[subj.id] !== 'available') {
        violations.add(`${semIndex}:${code}`)
      }
    })
    codes.forEach(code => {
      const m = ELECTIVE_CODE_RE.exec(code)
      if (m) {
        cumulativeElectiveCredits += parseInt(m[1])
        return
      }
      cumulative.push(code)
      if (!mandatoryCodes.has(code.toUpperCase())) cumulativeElectiveCredits += dataService.getCourseCredits(code, selectedCourse.value)
    })
  })
  return violations
})

const snackbar = reactive({
  show: false,
  text: '',
  color: 'success',
  timeout: 4000
})

const showSnackbar = (text, color = 'success') => {
  snackbar.text = text
  snackbar.color = color
  snackbar.show = true
}

function saveCurrentPlan() {
  const saved = dataService.getSavedGraduationPlans()
  const name = `Previsão (${semesterCards.value.length} semestres) - ${new Date().toLocaleDateString('pt-BR')}`
  saved.push({
    id: Date.now() + Math.random(),
    name,
    createdAt: new Date().toISOString(),
    courseCode: selectedCourse.value,
    semesters: JSON.parse(JSON.stringify(semesters.value)),
    creditLimit: creditLimit.value,
    semesterCreditLimits: JSON.parse(JSON.stringify(semesterCreditLimits.value)),
    preferenceTags: { ...planPrefs }
  })
  dataService.saveSavedGraduationPlans(saved)
  showSnackbar(`Previsão "${name}" salva com sucesso em 'Previsões Salvas'!`, 'success')
}

function exportToPDF() {
  const courseLabel = selectedCourse.value === 'ecp' ? 'Engenharia de Computação' : 'Ciência da Computação'

  const semestersHtml = semesterCards.value.map(sem => `
    <div class="semester-block">
      <div class="semester-title">${sem.index + 1}º Semestre <span class="credits-badge">${sem.totalCredits}/${effectiveLimit(sem.index)} créditos</span></div>
      <table class="summary-table">
        <thead>
          <tr><th>Código</th><th>Disciplina</th><th>Créditos</th><th>Dificuldade</th></tr>
        </thead>
        <tbody>
          ${sem.subjects.map(s => `
            <tr>
              <td>${s.isPlaceholder ? '—' : escapeHtml(s.code)}</td>
              <td>${escapeHtml(s.name)}</td>
              <td>${s.credits}cr</td>
              <td>${s.isPlaceholder ? '—' : escapeHtml(getDifficultyLabel(getCourseDifficulty(s.code)))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('')

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Previsão de Formatura - ${courseLabel}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm; }
        body {
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #333;
          margin: 0;
          background-color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          border-bottom: 2px solid #1976d2;
          padding-bottom: 8px;
        }
        .header-bar h1 { font-size: 20px; color: #1976d2; margin: 0; }
        .header-bar .subtitle { font-size: 12px; color: #666; margin-top: 2px; }
        .print-btn {
          padding: 8px 16px;
          background-color: #1976d2;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }
        .semester-block { break-inside: avoid; margin-bottom: 16px; }
        .semester-title {
          font-size: 13px;
          font-weight: bold;
          color: #1976d2;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .credits-badge {
          font-size: 10px;
          font-weight: bold;
          background-color: #e3f2fd !important;
          color: #0d47a1 !important;
          border-radius: 10px;
          padding: 2px 8px;
        }
        .summary-table { width: 100%; border-collapse: collapse; }
        .summary-table th, .summary-table td {
          border: 1px solid #e0e0e0;
          padding: 5px 8px;
          text-align: left;
          font-size: 11px;
        }
        .summary-table th { background-color: #f5f5f5 !important; font-weight: bold; }
        .footer-note { margin-top: 8px; font-size: 11px; color: #444; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <h1>Previsão de Formatura</h1>
          <div class="subtitle">${courseLabel}</div>
        </div>
        <button class="print-btn no-print" onclick="window.print()">Imprimir PDF</button>
      </div>

      ${semestersHtml}

      <div class="footer-note">
        <strong>Resumo:</strong> ${semesterCards.value.length} semestre(s) restante(s), ${totalMandatoryRemaining.value} crédito(s) obrigatório(s) + ${totalElectiveRemaining.value} crédito(s) eletivo(s) no total.
        Além disso, o currículo exige ${graduationRequirements.value.complementary} créditos de atividades complementares, que não ocupam horário de aula e por isso não aparecem nos semestres acima.
      </div>
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  printWindow.document.write(htmlContent.normalize('NFC'))
  printWindow.document.close()

  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
}

function moveCourse(fromIndex, subjectIndex, direction) {
  const code = semesters.value[fromIndex][subjectIndex]
  const targetIndex = fromIndex + direction
  if (targetIndex < 0 || code === undefined) return
  const next = semesters.value.map(sem => [...sem])
  next[fromIndex].splice(subjectIndex, 1)
  if (targetIndex >= next.length) next.push([])
  next[targetIndex].push(code)

  // Semestres vazios são removidos abaixo, o que desloca os índices dos seguintes -
  // remapeia os limites customizados para acompanhar seus semestres.
  const keptIndices = []
  next.forEach((sem, i) => { if (sem.length > 0) keptIndices.push(i) })
  const remappedLimits = {}
  keptIndices.forEach((oldIdx, newIdx) => {
    if (semesterCreditLimits.value[oldIdx] !== undefined) {
      remappedLimits[newIdx] = semesterCreditLimits.value[oldIdx]
    }
  })
  semesterCreditLimits.value = remappedLimits

  semesters.value = next.filter(sem => sem.length > 0)
  persist()
  checkStale()
  clearScheduleChecks()
}

const limitDialogOpen = ref(false)
const limitDialogSemIndex = ref(null)
const limitDialogValue = ref(24)

function openLimitDialog(semIndex) {
  limitDialogSemIndex.value = semIndex
  limitDialogValue.value = effectiveLimit(semIndex)
  limitDialogOpen.value = true
}

function applyLimitDialog() {
  if (limitDialogSemIndex.value === null || !limitDialogValue.value || limitDialogValue.value < 1) return
  recalculateFrom(limitDialogSemIndex.value, limitDialogValue.value)
  limitDialogOpen.value = false
}

const planoDialogOpen = ref(false)
const planoSubject = ref(null)
const planoText = ref('')
const planoLoading = ref(false)
const planoError = ref(false)
const planoSections = computed(() => parsePlano(planoText.value))

const DAY_ORDER = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']

const formatRoom = (room) => {
  if (!room) return ''
  let cleaned = room.normalize('NFC')
    .replace(/SALA DE AULA/gi, 'Sala')
    .replace(/\s*(?:-|-)?\s*Campus:\s*[^\s-].*$/i, '')
    .replace(/\s*(?:-|-)?\s*Campus\s+(?:do\s+Vale|Centro|da\s+Sa[uú]de|Litoral\s+Norte|Olhos\s+d['']?Água|EAD|Outros).*$/i, '')
    .trim()
  return cleaned.replace(/^[-\s]+|[-\s]+$/g, '')
}

const planoTurmas = computed(() => {
  if (!planoSubject.value) return []
  const code = planoSubject.value.code
  return dataService.getTurmas()
    .filter(t => (t.course_code || t.course_id) === code)
    .map(t => ({
      section_code: t.section_code,
      professor_name: (t.professor_name || '').trim() || (Array.isArray(t.ministrantes) ? t.ministrantes.join(', ') : ''),
      schedules: [...(t.schedules || [])].sort((a, b) => {
        const dayDiff = DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
        return dayDiff !== 0 ? dayDiff : (a.start_time || '').localeCompare(b.start_time || '')
      }).map(s => ({ ...s, room: formatRoom(s.room) }))
    }))
    .sort((a, b) => (a.section_code || '').localeCompare(b.section_code || ''))
})

async function openPlano(subj) {
  if (!subj || subj.isPlaceholder) return
  planoSubject.value = subj
  planoDialogOpen.value = true
  planoText.value = ''
  planoError.value = false
  planoLoading.value = true
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}planos_ensino/${encodeURIComponent(subj.code.toUpperCase())}.txt`)
    // Servidores com fallback de SPA (ex.: dev server do Vite) respondem 200 com o
    // próprio index.html para rotas inexistentes - checar o content-type evita exibir isso.
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !contentType.includes('text/plain')) throw new Error('plano indisponível')
    planoText.value = await res.text()
  } catch (e) {
    planoError.value = true
  } finally {
    planoLoading.value = false
  }
}

function previewSemesterSchedule(sem) {
  // getDesiredCourses/saveDesiredCourses guardam objetos de disciplina completos (ver
  // GenerateSchedules.vue: item.course), não só o código - GeneratedSchedule.vue lê
  // course.name/course.code direto, daí precisar resolver o objeto aqui também.
  const courses = sem.subjects
    .filter(s => !s.isPlaceholder)
    .map(s => dataService.getCourseByCode(s.code) || { code: s.code, name: s.name, credits: s.credits })
  if (courses.length === 0) return
  const confirmed = confirm(`Isso vai substituir temporariamente sua lista de "Disciplinas Desejadas" pelas ${courses.length} disciplina(s) do ${sem.index + 1}º Semestre, para gerar um preview de horário com as turmas do semestre atual. Sua lista atual será salva e pode ser restaurada depois na tela de Gerar Horários. Continuar?`)
  if (!confirmed) return
  dataService.previewDesiredCourses(courses)
  emit('change-page', 'generated_schedule')
}
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="mb-6 rounded-xl border-thin shadow-premium bg-surface" elevation="1">
      <v-card-text class="pa-6">
        <div class="d-flex align-center ga-3 mb-1">
          <v-icon icon="mdi-calendar-check-outline" color="primary" size="x-large"></v-icon>
          <span class="text-h4 font-weight-bold">Previsão de Formatura</span>
        </div>
        <div class="text-body-1 text-medium-emphasis mb-4">
          Planejamento semestre a semestre das disciplinas pendentes, respeitando pré-requisitos e limite de créditos.
        </div>

        <v-divider class="mb-4"></v-divider>

        <div class="d-flex align-center flex-wrap ga-4">
          <v-text-field
            v-model.number="creditLimit"
            type="number"
            min="1"
            label="Limite de créditos por semestre"
            density="compact"
            variant="outlined"
            style="max-width: 260px; min-width: 220px"
            hide-details
          ></v-text-field>
          <v-checkbox
            v-model="planPrefs.avoidScheduleConflicts"
            label="Evitar conflitos de horário"
            density="compact"
            hide-details
            class="flex-grow-0"
            title="Usa as turmas ofertadas hoje pra adiar disciplinas que colidiriam entre si"
          ></v-checkbox>
          <v-checkbox
            v-model="planPrefs.groupByCampus"
            label="Agrupar por câmpus"
            density="compact"
            hide-details
            class="flex-grow-0"
          ></v-checkbox>
          <v-checkbox
            v-model="planPrefs.limitHardSubjects"
            label="Equilibrar disciplinas difíceis"
            density="compact"
            hide-details
            class="flex-grow-0"
          ></v-checkbox>
          <v-btn color="primary" variant="flat" class="rounded-lg font-weight-bold" prepend-icon="mdi-refresh" @click="recalculate">
            Recalcular Previsão
          </v-btn>
          <v-btn
            color="success"
            variant="flat"
            class="rounded-lg font-weight-bold"
            prepend-icon="mdi-bookmark-plus-outline"
            :disabled="!semesterCards.length"
            @click="saveCurrentPlan"
          >
            Salvar Previsão
          </v-btn>
          <v-btn
            variant="tonal"
            class="rounded-lg font-weight-bold"
            prepend-icon="mdi-file-pdf-box"
            :disabled="!semesterCards.length"
            @click="exportToPDF"
          >
            Exportar PDF
          </v-btn>
          <v-btn
            color="info"
            variant="tonal"
            class="rounded-lg font-weight-bold"
            prepend-icon="mdi-auto-fix"
            :disabled="!semesterCards.length"
            title="Preencher automaticamente as eletivas com cursos elegíveis"
            @click="autoCompleteElectives"
          >
            Auto completar eletivas
          </v-btn>
          <v-btn variant="text" class="rounded-lg font-weight-bold" prepend-icon="mdi-bookmark-multiple-outline" @click="emit('change-page', 'saved_graduation_plans')">
            Previsões Salvas
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn variant="text" class="rounded-lg font-weight-bold" prepend-icon="mdi-sitemap" @click="emit('change-page', 'curriculum')">
            Atualizar disciplinas cursadas
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-alert v-if="planPrefs.avoidScheduleConflicts" type="info" variant="tonal" density="compact" class="mb-4">
      A checagem de conflito de horário usa a oferta de turmas do semestre atual (2026/2) e assume que ela se repete nos próximos semestres. Confirme sempre no Portal do Aluno antes de se matricular.
    </v-alert>

    <v-alert v-if="staleNotice" type="info" variant="tonal" class="mb-4" closable>
      Suas disciplinas cursadas mudaram desde a última previsão. Clique em "Recalcular Previsão" para atualizar.
    </v-alert>

    <v-alert v-if="unscheduled.length" type="warning" variant="tonal" class="mb-4">
      <div class="font-weight-bold mb-1">Não foi possível posicionar {{ unscheduled.length }} disciplina(s):</div>
      <ul class="pl-4">
        <li v-for="d in unscheduledDetails" :key="d.code">
          <strong>{{ d.code }}</strong> ({{ d.name }}) — {{ d.reason }}
        </li>
      </ul>
    </v-alert>

    <v-card v-if="semesterCards.length === 0" class="rounded-xl pa-10 text-center border-thin bg-surface mb-6">
      <v-icon icon="mdi-party-popper" size="64" color="success" class="mb-4"></v-icon>
      <div class="text-h5 font-weight-bold mb-2">Grade completa!</div>
      <div class="text-body-1 text-medium-emphasis">
        Nenhuma disciplina obrigatória ou eletiva pendente — parabéns, sua grade está completa!
      </div>
    </v-card>

    <div v-else class="semester-row">
      <v-card v-for="sem in semesterCards" :key="sem.index" class="semester-card rounded-xl border-thin shadow-premium bg-surface">
        <v-card-title class="pa-4 border-bottom bg-surface-light d-flex align-center ga-3" style="white-space: normal; line-height: 1.4;">
          <v-avatar color="primary" variant="tonal" size="36" class="font-weight-bold flex-shrink-0">
            {{ sem.index + 1 }}
          </v-avatar>
          <div class="d-flex flex-column align-start">
            <span class="text-subtitle-1 font-weight-bold">{{ sem.index + 1 }}º Semestre</span>
            <div class="d-flex flex-wrap ga-1 mt-1">
              <v-chip
                size="x-small"
                variant="tonal"
                class="font-weight-bold cursor-pointer"
                :color="sem.totalCredits > effectiveLimit(sem.index) ? 'error' : 'primary'"
                append-icon="mdi-pencil-outline"
                title="Ajustar limite de créditos deste semestre"
                @click="openLimitDialog(sem.index)"
              >
                {{ sem.totalCredits }}/{{ effectiveLimit(sem.index) }} créditos
              </v-chip>
              <v-chip
                v-if="sem.difficultyCounts.dificil > 0"
                size="x-small"
                variant="tonal"
                :color="getDifficultyColor('dificil')"
                class="font-weight-bold"
              >
                {{ sem.difficultyCounts.dificil }} {{ getDifficultyLabel('dificil') }}
              </v-chip>
              <v-chip
                v-if="sem.difficultyCounts.medio > 0"
                size="x-small"
                variant="tonal"
                :color="getDifficultyColor('medio')"
                class="font-weight-bold"
              >
                {{ sem.difficultyCounts.medio }} {{ getDifficultyLabel('medio') }}
              </v-chip>
            </div>
          </div>
        </v-card-title>
        <div v-if="postponedBySemester[sem.index]?.length" class="d-flex flex-wrap ga-1 px-3 pt-2">
          <v-chip
            v-for="p in postponedBySemester[sem.index]"
            :key="p.code"
            size="x-small"
            color="warning"
            variant="tonal"
            class="font-weight-bold"
            :title="`${p.code} adiada: ${p.reason}`"
          >
            {{ p.code }} adiada
          </v-chip>
        </div>
        <v-card-text class="pa-3">
          <div v-for="(subj, idx) in sem.subjects" :key="idx" class="subject-item d-flex align-center rounded-lg pa-2">
            <v-btn icon size="x-small" variant="text" :disabled="sem.index === 0" @click="moveCourse(sem.index, idx, -1)">
              <v-icon size="small">mdi-chevron-left</v-icon>
            </v-btn>
            <div
              class="flex-grow-1 px-1"
              :class="{ 'cursor-pointer': !subj.isPlaceholder }"
              :title="subj.isPlaceholder ? '' : 'Ver plano de ensino'"
              @click="openPlano(subj)"
            >
              <div class="text-body-2 font-weight-bold d-flex align-center ga-1">
                <span v-if="subj.isPlaceholder" class="text-medium-emphasis font-italic">Eletiva</span>
                <span v-else>{{ subj.code }}</span>
                <v-icon
                  v-if="violationSet.has(`${sem.index}:${subj.code}`)"
                  icon="mdi-alert-circle"
                  color="error"
                  size="16"
                  title="Pré-requisito não atendido neste semestre - mova a disciplina ou seus pré-requisitos, ou recalcule."
                ></v-icon>
              </div>
              <div class="text-caption text-medium-emphasis mb-1">{{ subj.name }}</div>
              <div class="d-flex align-center flex-wrap ga-1 mb-1">
                <v-chip size="x-small" color="secondary" variant="tonal" class="font-weight-bold">{{ subj.credits }}cr</v-chip>
                <v-chip
                  v-if="!subj.isPlaceholder"
                  size="x-small"
                  :color="getDifficultyColor(getCourseDifficulty(subj.code))"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  {{ getDifficultyLabel(getCourseDifficulty(subj.code)) }}
                </v-chip>
                <v-chip
                  v-if="!subj.isPlaceholder && getCourseCampus(subj.code)"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  prepend-icon="mdi-map-marker-outline"
                  class="font-weight-bold"
                  :title="`Câmpus ${getCourseCampus(subj.code)}`"
                >
                  {{ getCourseCampus(subj.code) }}
                </v-chip>
              </div>
              <v-btn
                v-if="subj.isPlaceholder"
                size="x-small"
                variant="text"
                color="primary"
                class="px-0 text-none"
                @click.stop="openPicker(sem.index, idx)"
              >
                Escolher eletiva
              </v-btn>
              <v-btn
                v-else-if="subj.isElective"
                size="x-small"
                variant="text"
                class="px-0 text-none"
                @click.stop="openPicker(sem.index, idx)"
              >
                Trocar
              </v-btn>
            </div>
            <v-btn icon size="x-small" variant="text" @click="moveCourse(sem.index, idx, 1)">
              <v-icon size="small">mdi-chevron-right</v-icon>
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions class="pa-3 pt-0 d-flex flex-column align-stretch ga-1">
          <v-btn
            block
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-calendar-clock-outline"
            class="text-none"
            @click="previewSemesterSchedule(sem)"
          >
            Gerar horário (preview)
          </v-btn>
          <v-btn
            block
            size="small"
            variant="tonal"
            :color="scheduleCheckColor(sem.index)"
            :loading="checkingSemIndex === sem.index"
            prepend-icon="mdi-calendar-search-outline"
            class="text-none"
            @click="checkSemesterSchedule(sem)"
          >
            {{ scheduleCheckLabel(sem.index) }}
          </v-btn>
          <div v-if="scheduleChecks[sem.index]?.detail" class="text-caption text-medium-emphasis px-1">
            {{ scheduleChecks[sem.index].detail }}
          </div>
        </v-card-actions>
      </v-card>
    </div>

    <v-dialog v-model="pickerOpen" max-width="700" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6 font-weight-bold">Escolher Eletiva</span>
          <v-btn icon="mdi-close" variant="text" @click="pickerOpen = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4 pt-0">
          <v-text-field
            v-model="pickerSearch"
            placeholder="Buscar eletiva pelo nome ou código..."
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            clearable
            density="comfortable"
            hide-details
            class="mb-3"
          ></v-text-field>
          <v-chip-group v-model="pickerCreditsFilter" mandatory class="mb-3">
            <v-chip value="all" color="primary" variant="elevated" class="font-weight-bold">Todas</v-chip>
            <v-chip value="2" color="primary" variant="tonal">2 Créditos</v-chip>
            <v-chip value="4" color="primary" variant="tonal">4 Créditos</v-chip>
            <v-chip value="6" color="primary" variant="tonal">6 Créditos</v-chip>
            <v-chip value="8" color="primary" variant="tonal">8 Créditos</v-chip>
          </v-chip-group>
          <div v-if="pickerCandidates.length === 0" class="py-8 text-center text-medium-emphasis">
            Nenhuma eletiva disponível encontrada para este semestre (pré-requisitos, créditos mínimos ou filtros).
          </div>
          <v-list v-else density="comfortable">
            <v-list-item
              v-for="c in pickerCandidates"
              :key="c.code"
              class="rounded-lg mb-1 border-thin"
              @click="selectElective(c)"
            >
              <v-list-item-title class="font-weight-bold">{{ c.code }} - {{ c.name }}</v-list-item-title>
              <template v-slot:append>
                <div class="d-flex ga-1">
                  <v-chip size="small" :color="getDifficultyColor(getCourseDifficulty(c.code))" variant="tonal" class="font-weight-bold">
                    {{ getDifficultyLabel(getCourseDifficulty(c.code)) }}
                  </v-chip>
                  <v-chip size="small" color="secondary" variant="tonal" class="font-weight-bold">{{ c.credits }}cr</v-chip>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="limitDialogOpen" max-width="420">
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6 font-weight-bold">Ajustar limite do {{ (limitDialogSemIndex ?? 0) + 1 }}º Semestre</span>
          <v-btn icon="mdi-close" variant="text" @click="limitDialogOpen = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4 pt-0">
          <v-text-field
            v-model.number="limitDialogValue"
            type="number"
            min="1"
            label="Limite de créditos para este semestre"
            variant="outlined"
            density="comfortable"
            hide-details
            autofocus
            @keyup.enter="applyLimitDialog"
          ></v-text-field>
          <div class="text-caption text-medium-emphasis mt-2">
            Os semestres anteriores permanecem como estão; a partir deste semestre, a previsão é recalculada com o novo limite.
          </div>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="limitDialogOpen = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" class="font-weight-bold rounded-lg" @click="applyLimitDialog">Recalcular</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="planoDialogOpen" max-width="700" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-bottom">
          <div>
            <div class="text-h6 font-weight-bold">{{ planoSubject?.code }}</div>
            <div class="text-caption text-medium-emphasis">{{ planoSubject?.name }}</div>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="planoDialogOpen = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <div v-if="planoTurmas.length" class="plano-section mb-5">
            <div class="d-flex align-center ga-2 mb-2">
              <v-icon icon="mdi-calendar-clock-outline" color="primary" size="20"></v-icon>
              <span class="text-subtitle-1 font-weight-bold">Turmas e Horários</span>
            </div>
            <v-divider class="mb-3"></v-divider>
            <div
              v-for="turma in planoTurmas"
              :key="turma.section_code"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>Turma {{ turma.section_code }}</strong>
                <span v-if="turma.professor_name"> — {{ turma.professor_name }}</span>
              </div>
              <div v-if="turma.schedules.length" class="text-body-2 text-medium-emphasis">
                <div v-for="(s, i) in turma.schedules" :key="i">
                  {{ s.day_of_week }}: {{ s.start_time?.slice(0, 5) }} às {{ s.end_time?.slice(0, 5) }}{{ s.room ? ` — ${s.room}` : '' }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="planoLoading" class="d-flex justify-center py-8">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
          </div>
          <div v-else-if="planoError" class="text-center text-medium-emphasis py-8">
            <v-icon icon="mdi-file-document-remove-outline" size="48" class="mb-2"></v-icon>
            <div>Plano de ensino ainda não disponível para esta disciplina.</div>
          </div>
          <div v-else>
            <div
              v-for="(section, idx) in planoSections"
              :key="idx"
              class="plano-section"
              :class="{ 'mt-5': idx > 0 }"
            >
              <div class="d-flex align-center ga-2 mb-2">
                <v-icon :icon="ICON_BY_CATEGORY[section.category] || ICON_BY_CATEGORY.generic" color="primary" size="20"></v-icon>
                <span class="text-subtitle-1 font-weight-bold">{{ section.title }}</span>
              </div>
              <v-divider class="mb-3"></v-divider>
              <pre class="plano-text">{{ section.text }}</pre>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <div v-if="semesterCards.length" class="mt-4 text-body-1">
      <strong>Resumo:</strong> {{ semesterCards.length }} semestre(s) restante(s), {{ totalMandatoryRemaining }} crédito(s) obrigatório(s) + {{ totalElectiveRemaining }} crédito(s) eletivo(s) no total.
      <div class="text-caption text-medium-emphasis mt-1">
        Além disso, o currículo exige {{ graduationRequirements.complementary }} créditos de atividades complementares, que não ocupam horário de aula e por isso não aparecem nos semestres acima.
      </div>
    </div>

    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="snackbar.timeout"
      location="bottom right"
      class="rounded-lg"
    >
      <div class="d-flex align-center font-weight-medium">
        <v-icon :icon="snackbar.color === 'success' ? 'mdi-check-circle' : 'mdi-alert'" class="mr-2" size="large"></v-icon>
        {{ snackbar.text }}
      </div>
      <template v-slot:actions>
        <v-btn variant="text" size="small" class="font-weight-bold" @click="snackbar.show = false">Fechar</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.semester-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.semester-card {
  min-width: 300px;
  flex: 0 0 300px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.semester-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12) !important;
}
.subject-item {
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  border: 1px solid rgba(var(--v-border-color), 0.06);
  margin-bottom: 8px;
  transition: background-color 0.15s ease;
}
.subject-item:last-child {
  margin-bottom: 0;
}
.subject-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}
.shadow-premium {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
}
.border-bottom {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08) !important;
}
.border-thin {
  border: 1px solid rgba(var(--v-border-color), 0.08) !important;
}
.plano-text {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 0;
}
</style>
