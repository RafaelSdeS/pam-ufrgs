<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { dataService } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import { predictionService } from './services/predictionService'
import { calculateSubjectStatuses } from './composables/useCurriculumStatus'
import { matchCourse } from './utils/searchUtils'
import { getCourseDifficulty, getDifficultyLabel, getDifficultyColor } from './data/courseDifficulty'

const emit = defineEmits(['change-page'])

const ELECTIVE_CODE_RE = /^ELETIVA-(\d+)$/

const selectedCourse = curriculumService.selectedCourseRef
const creditLimit = ref(24)
const semesters = ref([]) // array of arrays of course codes (or "ELETIVA-<credits>" placeholders)
const unscheduled = ref([])
const staleNotice = ref(false)

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
  unscheduled.value = result.unscheduled
  persist()
  staleNotice.value = false
}

function loadOrGenerate() {
  creditLimit.value = dataService.getCreditLimit()
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

function moveCourse(fromIndex, subjectIndex, direction) {
  const code = semesters.value[fromIndex][subjectIndex]
  const targetIndex = fromIndex + direction
  if (targetIndex < 0 || code === undefined) return
  const next = semesters.value.map(sem => [...sem])
  next[fromIndex].splice(subjectIndex, 1)
  if (targetIndex >= next.length) next.push([])
  next[targetIndex].push(code)
  semesters.value = next.filter(sem => sem.length > 0)
  persist()
  checkStale()
}
</script>

<template>
  <div>
    <div class="d-flex align-center flex-wrap gap-3 mb-4">
      <h2 class="text-h5 font-weight-bold mr-2">Previsão de Formatura</h2>
      <v-text-field
        v-model.number="creditLimit"
        type="number"
        min="1"
        label="Limite de créditos por semestre"
        density="compact"
        style="max-width: 240px"
        hide-details
      ></v-text-field>
      <v-btn color="primary" variant="elevated" @click="recalculate">Recalcular Previsão</v-btn>
      <v-btn variant="text" prepend-icon="mdi-sitemap" @click="emit('change-page', 'curriculum')">
        Atualizar disciplinas cursadas
      </v-btn>
    </div>

    <v-alert v-if="staleNotice" type="info" variant="tonal" class="mb-4" closable>
      Suas disciplinas cursadas mudaram desde a última previsão. Clique em "Recalcular Previsão" para atualizar.
    </v-alert>

    <v-alert v-if="unscheduled.length" type="warning" variant="tonal" class="mb-4">
      Não foi possível posicionar: {{ unscheduled.map(s => s.name).join(', ') }}. Verifique os pré-requisitos dessas disciplinas na Matriz Curricular.
    </v-alert>

    <div v-if="semesterCards.length === 0" class="text-body-1 text-medium-emphasis">
      Nenhuma disciplina obrigatória ou eletiva pendente — parabéns, sua grade está completa!
    </div>

    <div v-else class="semester-row">
      <v-card v-for="sem in semesterCards" :key="sem.index" class="semester-card" variant="outlined">
        <v-card-title class="text-subtitle-1 font-weight-bold d-flex flex-column align-start" style="white-space: normal; line-height: 1.4;">
          <span>{{ sem.index + 1 }}º Semestre</span>
          <span class="text-caption font-weight-regular" :class="sem.totalCredits > creditLimit ? 'text-error' : 'text-medium-emphasis'">
            {{ sem.totalCredits }}/{{ creditLimit }} créditos
          </span>
        </v-card-title>
        <v-card-text>
          <div v-for="(subj, idx) in sem.subjects" :key="idx" class="d-flex align-center subject-row mb-2">
            <v-btn icon size="x-small" variant="text" :disabled="sem.index === 0" @click="moveCourse(sem.index, idx, -1)">
              <v-icon size="small">mdi-chevron-left</v-icon>
            </v-btn>
            <div class="flex-grow-1 px-1">
              <div class="text-body-2 font-weight-bold d-flex align-center gap-1">
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
              <div class="text-caption d-flex align-center gap-1">
                <span>{{ subj.name }} ({{ subj.credits }}cr)</span>
                <v-chip
                  v-if="!subj.isPlaceholder"
                  size="x-small"
                  :color="getDifficultyColor(getCourseDifficulty(subj.code))"
                  variant="tonal"
                  class="font-weight-bold"
                >
                  {{ getDifficultyLabel(getCourseDifficulty(subj.code)) }}
                </v-chip>
              </div>
              <v-btn
                v-if="subj.isPlaceholder"
                size="x-small"
                variant="text"
                color="primary"
                class="px-0 text-none"
                @click="openPicker(sem.index, idx)"
              >
                Escolher eletiva
              </v-btn>
              <v-btn
                v-else-if="subj.isElective"
                size="x-small"
                variant="text"
                class="px-0 text-none"
                @click="clearElectiveChoice(sem.index, idx)"
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
                <div class="d-flex gap-1">
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

    <div v-if="semesterCards.length" class="mt-4 text-body-1">
      <strong>Resumo:</strong> {{ semesterCards.length }} semestre(s) restante(s), {{ totalMandatoryRemaining }} crédito(s) obrigatório(s) + {{ totalElectiveRemaining }} crédito(s) eletivo(s) no total.
      <div class="text-caption text-medium-emphasis mt-1">
        Além disso, o currículo exige {{ graduationRequirements.complementary }} créditos de atividades complementares, que não ocupam horário de aula e por isso não aparecem nos semestres acima.
      </div>
    </div>
  </div>
</template>

<style scoped>
.semester-row {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.semester-card {
  min-width: 260px;
  flex: 0 0 260px;
}
</style>
