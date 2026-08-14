<script setup>
import { ref, computed } from 'vue'
import { dataService } from '../services/dataService'
import { curriculumService } from '../services/curriculumService'
import { matchCourse } from '../utils/searchUtils'
import { getCourseDifficulty, getDifficultyLabel, getDifficultyColor } from '../data/courseDifficulty'

const props = defineProps({
  modelValue: Boolean
})
const emit = defineEmits(['update:modelValue', 'updated'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const selectedCourse = curriculumService.selectedCourseRef
const searchQuery = ref('')
const creditsFilter = ref('all')
const dataVersion = ref(0)

const catalog = computed(() => dataService.getElectiveCatalog(selectedCourse.value))

const completedSet = computed(() => {
  dataVersion.value
  return new Set(dataService.getCompletedCourses().map(c => c.toUpperCase()))
})

const planSemesterByCode = computed(() => {
  dataVersion.value
  const map = {}
  const plan = dataService.getGraduationPlan() || []
  plan.forEach((sem, idx) => {
    sem.forEach(code => {
      if (!/^ELETIVA-\d+$/.test(code)) map[code.toUpperCase()] = idx
    })
  })
  return map
})

const semesterOptions = computed(() => {
  dataVersion.value
  const plan = dataService.getGraduationPlan() || []
  const opts = [{ title: 'Não planejada', value: null }]
  for (let i = 0; i < plan.length + 1; i++) opts.push({ title: `${i + 1}º Semestre`, value: i })
  return opts
})

const filteredCatalog = computed(() => catalog.value.filter(c => {
  if (creditsFilter.value !== 'all' && c.credits !== Number(creditsFilter.value)) return false
  if (searchQuery.value.trim() && !matchCourse(c, searchQuery.value)) return false
  return true
}))

function isCompleted(code) {
  return completedSet.value.has(code.toUpperCase())
}

function toggleCompleted(code) {
  dataService.toggleCompletedCourse(code)
  dataVersion.value++
  emit('updated')
}

function currentSemester(code) {
  const v = planSemesterByCode.value[code.toUpperCase()]
  return v === undefined ? null : v
}

function assignSemester(course, semIndex) {
  dataService.setElectiveSemester(course.code, course.credits, semIndex)
  dataVersion.value++
  emit('updated')
}
</script>

<template>
  <v-dialog v-model="isOpen" max-width="850" scrollable>
    <v-card class="rounded-xl border-thin">
      <v-card-title class="pa-5 bg-surface-light border-bottom d-flex align-center justify-space-between flex-wrap ga-2">
        <div class="d-flex align-center ga-3">
          <v-icon icon="mdi-star-check-outline" color="primary" size="large"></v-icon>
          <div>
            <div class="text-h6 font-weight-bold">Minhas Eletivas</div>
            <div class="text-caption text-medium-emphasis">
              Marque eletivas já concluídas e escolha em qual semestre pretende cursar as demais
            </div>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" @click="isOpen = false"></v-btn>
      </v-card-title>

      <v-card-text class="pa-5">
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

          <v-chip-group v-model="creditsFilter" mandatory class="flex-shrink-0">
            <v-chip value="all" color="primary" variant="elevated" class="font-weight-bold">Todas</v-chip>
            <v-chip value="2" color="primary" variant="tonal">2 Créditos</v-chip>
            <v-chip value="4" color="primary" variant="tonal">4 Créditos</v-chip>
            <v-chip value="6" color="primary" variant="tonal">6 Créditos</v-chip>
            <v-chip value="8" color="primary" variant="tonal">8 Créditos</v-chip>
          </v-chip-group>
        </div>

        <v-divider class="mb-4"></v-divider>

        <div v-if="filteredCatalog.length === 0" class="py-10 text-center text-medium-emphasis">
          Nenhuma eletiva encontrada para os filtros selecionados.
        </div>

        <v-list v-else density="comfortable">
          <v-list-item
            v-for="c in filteredCatalog"
            :key="c.code"
            class="rounded-lg mb-2 border-thin"
          >
            <div class="d-flex align-center flex-wrap ga-3 py-1">
              <v-checkbox
                :model-value="isCompleted(c.code)"
                @update:model-value="toggleCompleted(c.code)"
                density="compact"
                hide-details
                class="flex-shrink-0"
              ></v-checkbox>

              <div class="flex-grow-1" style="min-width: 220px;">
                <div class="font-weight-bold text-body-2">{{ c.code }} - {{ c.name }}</div>
                <div class="d-flex align-center ga-1 mt-1">
                  <v-chip size="x-small" color="secondary" variant="tonal" class="font-weight-bold">{{ c.credits }}cr</v-chip>
                  <v-chip size="x-small" :color="getDifficultyColor(getCourseDifficulty(c.code))" variant="tonal" class="font-weight-bold">
                    {{ getDifficultyLabel(getCourseDifficulty(c.code)) }}
                  </v-chip>
                  <v-chip v-if="isCompleted(c.code)" size="x-small" color="success" variant="flat" class="font-weight-bold">Concluída</v-chip>
                </div>
              </div>

              <v-select
                v-if="!isCompleted(c.code)"
                :model-value="currentSemester(c.code)"
                @update:model-value="assignSemester(c, $event)"
                :items="semesterOptions"
                label="Planejar para"
                variant="outlined"
                density="compact"
                hide-details
                style="max-width: 180px"
              ></v-select>
            </div>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="pa-4 bg-surface-light border-top justify-end">
        <v-btn color="primary" variant="flat" class="px-6 font-weight-bold rounded-lg" @click="isOpen = false">
          Fechar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
