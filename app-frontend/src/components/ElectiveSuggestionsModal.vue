<script setup>
import { ref, computed } from 'vue'
import { dataService } from '../services/dataService'
import { curriculumService } from '../services/curriculumService'
import { scheduleGeneratorService } from '../services/scheduleGeneratorService'
import { matchCourse } from '../utils/searchUtils'

const emit = defineEmits(['add-section'])

const isOpen = ref(false)
const targetGradeObj = ref(null)
const isSavedGrade = ref(false)
const compatibleCoursesList = ref([])
const searchQuery = ref('')
const selectedCreditsFilter = ref('all')

const open = (gradeObj, turmasList = null, restrictionsList = null, options = {}) => {
  targetGradeObj.value = gradeObj
  isSavedGrade.value = Boolean(options.isSaved)
  searchQuery.value = ''
  selectedCreditsFilter.value = 'all'

  const turmas = turmasList || dataService.getTurmas()
  const restrictions = restrictionsList || dataService.getRestrictions()
  const hardBlocks = (restrictions || []).filter(r => r.restriction_type === 'hard_block' || !r.restriction_type)

  // 1. Get current mandatory course codes to exclude them
  const currSubjects = curriculumService.getCurriculumSubjects(curriculumService.selectedCourseRef.value)
  const mandatoryCodes = new Set(currSubjects.map(s => (s.code || s.id || '').toUpperCase()))

  // 2. Get completed course codes
  const completedCodes = new Set(dataService.getCompletedCourses().map(c => c.toUpperCase()))

  const allCoursesMap = {}
  dataService.getAllCourses().forEach(c => {
    if (c.code) allCoursesMap[c.code.toUpperCase()] = c
    if (c.id) allCoursesMap[c.id.toUpperCase()] = c
  })

  const { mandatory: totalCompletedCredits, elective: totalCompletedElectiveCredits } = dataService.getCompletedCreditsByType(curriculumService.selectedCourseRef.value)

  // 3. Get course codes already in targetGradeObj
  const existingItems = targetGradeObj.value?.items || []
  const existingCodes = new Set(existingItems.map(i => (i.course_code || i.course_id || '').toUpperCase()))

  // 4. Test all sections for candidate electives
  const courseSectionsMap = {}

  const selectedCourseCode = curriculumService.getSelectedCourse()
  turmas.forEach(t => {
    if (!curriculumService.matchesSelectedCurriculum(t.curriculums, selectedCourseCode)) {
      return
    }
    const code = (t.course_code || t.course_id || '').toUpperCase()
    if (!code) return
    if (mandatoryCodes.has(code) || completedCodes.has(code) || existingCodes.has(code)) {
      return
    }

    const courseInfo = allCoursesMap[code] || dataService.getCourseByCode(code) || {}
    if ((courseInfo.min_credits_required || 0) > totalCompletedCredits) {
      return
    }
    if ((courseInfo.min_elective_credits_required || 0) > totalCompletedElectiveCredits) {
      return
    }
    const prereqs = courseInfo.prerequisites || []
    if (prereqs.length > 0 && !prereqs.every(p => {
      const upper = (p || '').toUpperCase()
      if (completedCodes.has(upper)) return true
      // Só ignora o pré-requisito se ele nem existir no catálogo do curso atual (obrigatória ou
      // eletiva) - mesma correção aplicada em dataService.getEligibleCourses e
      // GraduationPlan.isElectiveEligible. Antes só olhava mandatoryCodes, deixando pré-requisito
      // eletiva->eletiva passar batido mesmo sem a eletiva-base cursada.
      if (!mandatoryCodes.has(upper) && !allCoursesMap[upper]) return true
      return false
    })) {
      return
    }

    // Check conflict with hard blocks
    if (scheduleGeneratorService.sectionViolatesHardBlock(t, hardBlocks)) {
      return
    }

    // Check conflict with existing items in the schedule
    let hasConflict = false
    for (const existingItem of existingItems) {
      // Reconstruct a section-like structure for existingItem to test conflict
      const dummyExisting = {
        schedules: existingItem.all_schedules || [{
          day_of_week: existingItem.day_of_week,
          start_time: existingItem.start_time,
          end_time: existingItem.end_time
        }]
      }
      if (scheduleGeneratorService.sectionsConflict(t, dummyExisting)) {
        hasConflict = true
        break
      }
    }

    if (!hasConflict) {
      if (!courseSectionsMap[code]) {
        courseSectionsMap[code] = {
          code,
          name: t.course_name || courseInfo.name || code,
          credits: courseInfo.credits || t.credits || 4,
          sections: []
        }
      }
      courseSectionsMap[code].sections.push(t)
    }
  })

  compatibleCoursesList.value = Object.values(courseSectionsMap).sort((a, b) => a.name.localeCompare(b.name))
  isOpen.value = true
}

const filteredCourses = computed(() => {
  return compatibleCoursesList.value.filter(c => {
    if (selectedCreditsFilter.value !== 'all') {
      const cr = Number(selectedCreditsFilter.value)
      if (c.credits !== cr) return false
    }
    if (searchQuery.value.trim()) {
      if (!matchCourse(c, searchQuery.value)) return false
    }
    return true
  })
})

const formatSectionTimes = (section) => {
  if (!section.schedules || section.schedules.length === 0) return 'Horário a definir'
  return section.schedules.map(s => {
    const day = s.day_of_week?.slice(0, 3) || s.day_of_week || ''
    return `${day} ${s.start_time?.slice(0, 5)} - ${s.end_time?.slice(0, 5)}`
  }).join(' | ')
}

const handleAddSection = (course, section) => {
  emit('add-section', {
    gradeObj: targetGradeObj.value,
    section,
    course
  })
  // Close after selection
  isOpen.value = false
}

defineExpose({
  open,
  close: () => { isOpen.value = false }
})
</script>

<template>
  <v-dialog v-model="isOpen" max-width="850" scrollable>
    <v-card class="rounded-xl border-thin">
      <v-card-title class="pa-5 bg-surface-light border-bottom d-flex align-center justify-space-between flex-wrap ga-2">
        <div class="d-flex align-center ga-3">
          <v-icon icon="mdi-star-plus-outline" color="warning" size="large"></v-icon>
          <div>
            <div class="text-h6 font-weight-bold">Sugestões de Eletivas Compatíveis</div>
            <div class="text-caption text-medium-emphasis">
              Disciplinas que cabem perfeitamente nos horários livres desta grade
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" @click="isOpen = false"></v-btn>
      </v-card-title>

      <v-card-text class="pa-5">
        <!-- Filtros e Busca -->
        <div class="d-flex flex-column flex-md-row ga-3 mb-5 align-center justify-space-between">
          <v-text-field
            v-model="searchQuery"
            placeholder="Buscar eletiva pelo nome ou código..."
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            clearable
            density="comfortable"
            hide-details
            class="flex-grow-1 w-100"
          ></v-text-field>

          <v-chip-group v-model="selectedCreditsFilter" mandatory class="flex-shrink-0">
            <v-chip value="all" color="primary" variant="elevated" class="font-weight-bold">
              Todas ({{ compatibleCoursesList.length }})
            </v-chip>
            <v-chip value="2" color="primary" variant="tonal" class="font-weight-medium">
              2 Créditos
            </v-chip>
            <v-chip value="4" color="primary" variant="tonal" class="font-weight-medium">
              4 Créditos
            </v-chip>
            <v-chip value="6" color="primary" variant="tonal" class="font-weight-medium">
              6 Créditos
            </v-chip>
          </v-chip-group>
        </div>

        <v-divider class="mb-5"></v-divider>

        <!-- Lista de Eletivas Compatíveis -->
        <div v-if="filteredCourses.length === 0" class="py-10 text-center">
          <v-icon icon="mdi-calendar-remove" size="56" color="medium-emphasis" class="mb-3"></v-icon>
          <div class="text-h6 font-weight-bold mb-1">Nenhuma eletiva compatível encontrada</div>
          <div class="text-body-2 text-medium-emphasis">
            Nenhuma turma eletiva se encaixa sem colisão de horários ou nos filtros selecionados.
          </div>
        </div>

        <div v-else class="d-flex flex-column ga-4">
          <v-card
            v-for="course in filteredCourses"
            :key="course.code"
            variant="outlined"
            class="rounded-xl border-thin bg-surface transition-swing"
          >
            <v-card-item class="pa-4 pb-2">
              <template v-slot:title>
                <div class="d-flex align-center justify-space-between flex-wrap ga-2">
                  <span class="text-subtitle-1 font-weight-bold d-inline-flex align-center">
                    {{ course.code }} - {{ course.name }}
                    <v-icon
                      v-if="dataService.getCourseObservation(course.code)"
                      size="small"
                      color="warning"
                      class="ml-1"
                      @click.stop
                    >
                      mdi-information-outline
                      <v-tooltip activator="parent" location="top" max-width="450">
                        <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ dataService.getCourseObservation(course.code) }}</div>
                      </v-tooltip>
                    </v-icon>
                  </span>
                  <v-chip size="small" color="warning" variant="flat" class="font-weight-bold">
                    {{ course.credits }} créditos
                  </v-chip>
                </div>
              </template>
            </v-card-item>

            <v-card-text class="px-4 pb-4 pt-2">
              <div class="text-caption text-medium-emphasis mb-2 font-weight-medium">
                Turmas disponíveis compatíveis com a grade:
              </div>
              <div class="d-flex flex-column ga-2">
                <div
                  v-for="section in course.sections"
                  :key="section.id"
                  class="d-flex align-center justify-space-between flex-wrap ga-3 pa-3 rounded-lg border bg-surface-light"
                >
                  <div>
                    <div class="font-weight-bold text-body-2 d-flex align-center flex-wrap ga-1">
                      <span>Turma {{ section.section_code || section.section_id }}</span>
                      <v-icon
                        v-if="section.observacao || dataService.getSectionObservation(course.code, section.section_code)"
                        size="small"
                        color="warning"
                        class="ml-1"
                        @click.stop
                      >
                        mdi-information-outline
                        <v-tooltip activator="parent" location="top" max-width="450">
                          <div class="text-caption font-weight-regular" style="white-space: pre-line;">{{ section.observacao || dataService.getSectionObservation(course.code, section.section_code) }}</div>
                        </v-tooltip>
                      </v-icon>
                      <span v-if="dataService.getSectionCapacity(section, curriculumService.getSelectedCourse()) !== null" class="text-caption opacity-90 d-inline-flex align-center ml-1" :title="`Vagas oferecidas para veteranos: ${dataService.getSectionCapacity(section, curriculumService.getSelectedCourse())}`">
                        <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(section, curriculumService.getSelectedCourse()) }}
                      </span>
                      <span class="text-caption font-weight-regular text-medium-emphasis ml-1">
                        (Prof. {{ section.professor_name || 'A definir' }})
                      </span>
                    </div>
                    <div class="text-caption text-primary font-weight-medium d-flex align-center ga-1 mt-1">
                      <v-icon icon="mdi-clock-outline" size="small"></v-icon>
                      {{ formatSectionTimes(section) }}
                    </div>
                    <div v-if="section.observacao || dataService.getSectionObservation(course.code, section.section_code)" class="text-caption text-warning font-weight-medium d-flex align-start ga-1 mt-1" style="white-space: pre-line;">
                      <v-icon icon="mdi-information-outline" size="small" class="mr-1 mt-1"></v-icon>
                      <span><strong>Observações:</strong><br>{{ section.observacao || dataService.getSectionObservation(course.code, section.section_code) }}</span>
                    </div>
                  </div>

                  <v-btn
                    color="primary"
                    variant="elevated"
                    size="small"
                    prepend-icon="mdi-bookmark-plus-outline"
                    class="rounded-lg font-weight-bold text-none"
                    @click="handleAddSection(course, section)"
                  >
                    {{ isSavedGrade ? 'Adicionar à Grade Salva' : 'Salvar grade e adicionar eletiva' }}
                  </v-btn>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 bg-surface-light border-top justify-end">
        <v-btn color="primary" variant="flat" class="px-6 font-weight-bold rounded-lg" @click="isOpen = false">
          Fechar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
