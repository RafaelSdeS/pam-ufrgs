<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { dataService, escapeHtml } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import { predictionService } from './services/predictionService'
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

const electiveCreditsRemaining = computed(() => {
  const mandatoryCodes = new Set(Object.keys(subjectsMap.value).map(c => c.toUpperCase()))
  let completedElectiveCredits = 0
  dataService.getCompletedCourses().forEach(code => {
    if (!mandatoryCodes.has(code.toUpperCase())) {
      completedElectiveCredits += dataService.getCourseCredits(code, selectedCourse.value)
    }
  })
  return Math.max(0, graduationRequirements.value.elective - completedElectiveCredits)
})

const electiveCatalog = computed(() => dataService.getElectiveCatalog(selectedCourse.value))

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
    // Pré-requisito fora da grade obrigatória do curso selecionado não bloqueia -
    // mesma regra que dataService.getEligibleCourses já usa.
    if (!subjectsMap.value[upper]) return true
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
  pickerOpen.value = false
}

function clearElectiveChoice(semIndex, subjectIndex) {
  const subj = resolveSubject(semesters.value[semIndex][subjectIndex])
  const next = semesters.value.map(sem => [...sem])
  next[semIndex][subjectIndex] = `ELETIVA-${subj?.credits || 4}`
  semesters.value = next
  persist()
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

function recalculate() {
  const subjects = Object.values(subjectsMap.value)
  const completed = dataService.getCompletedCourses()
  const result = predictionService.generateGraduationPlan({
    subjects,
    completedCodes: completed,
    creditLimit: creditLimit.value,
    electiveCreditsRemaining: electiveCreditsRemaining.value
  })
  semesters.value = result.semesters.map(sem => sem.subjects.map(s => s.code))
  semesterCreditLimits.value = {}
  unscheduled.value = result.unscheduled
  persist()
  staleNotice.value = false
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
    firstSemesterCreditLimit: newLimit
  })

  const tail = result.semesters.map(sem => sem.subjects.map(s => s.code))
  semesters.value = [...prefix, ...tail]

  const nextLimits = {}
  Object.entries(semesterCreditLimits.value).forEach(([idx, val]) => {
    if (Number(idx) < semIndex) nextLimits[idx] = val
  })
  nextLimits[semIndex] = newLimit
  semesterCreditLimits.value = nextLimits

  unscheduled.value = result.unscheduled
  persist()
  checkStale()
}

function loadOrGenerate() {
  creditLimit.value = dataService.getCreditLimit()
  semesterCreditLimits.value = dataService.getSemesterCreditLimits()
  const saved = dataService.getGraduationPlan()
  if (saved && saved.length) {
    semesters.value = saved
    unscheduled.value = []
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
  return { index, subjects, totalCredits }
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
  const cumulative = [...dataService.getCompletedCourses()]
  semesters.value.forEach((codes, semIndex) => {
    const statuses = calculateSubjectStatuses(subjects, cumulative)
    codes.forEach(code => {
      if (ELECTIVE_CODE_RE.test(code)) return
      const subj = subjectsMap.value[code]
      if (subj && statuses[subj.id] !== 'available') {
        violations.add(`${semIndex}:${code}`)
      }
    })
    codes.forEach(code => { if (!ELECTIVE_CODE_RE.test(code)) cumulative.push(code) })
  })
  return violations
})

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
          <v-btn color="primary" variant="flat" class="rounded-lg font-weight-bold" prepend-icon="mdi-refresh" @click="recalculate">
            Recalcular Previsão
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
          <v-spacer></v-spacer>
          <v-btn variant="text" class="rounded-lg font-weight-bold" prepend-icon="mdi-sitemap" @click="emit('change-page', 'curriculum')">
            Atualizar disciplinas cursadas
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-alert v-if="staleNotice" type="info" variant="tonal" class="mb-4" closable>
      Suas disciplinas cursadas mudaram desde a última previsão. Clique em "Recalcular Previsão" para atualizar.
    </v-alert>

    <v-alert v-if="unscheduled.length" type="warning" variant="tonal" class="mb-4">
      Não foi possível posicionar: {{ unscheduled.map(s => s.name).join(', ') }}. Verifique os pré-requisitos dessas disciplinas na Matriz Curricular.
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
            <v-chip
              size="x-small"
              variant="tonal"
              class="font-weight-bold mt-1 cursor-pointer"
              :color="sem.totalCredits > effectiveLimit(sem.index) ? 'error' : 'primary'"
              append-icon="mdi-pencil-outline"
              title="Ajustar limite de créditos deste semestre"
              @click="openLimitDialog(sem.index)"
            >
              {{ sem.totalCredits }}/{{ effectiveLimit(sem.index) }} créditos
            </v-chip>
          </div>
        </v-card-title>
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
                @click.stop="clearElectiveChoice(sem.index, idx)"
              >
                Trocar
              </v-btn>
            </div>
            <v-btn icon size="x-small" variant="text" @click="moveCourse(sem.index, idx, 1)">
              <v-icon size="small">mdi-chevron-right</v-icon>
            </v-btn>
          </div>
        </v-card-text>
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
