<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { dataService } from './services/dataService'
import { curriculumService } from './services/curriculumService'

import SideBar from './components/SideBar.vue'
import Home from './Home.vue'
import GenerateSchedules from './GenerateSchedules.vue'
import GeneratedSchedule from './GeneratedSchedule.vue'
import CurriculumCanvas from './components/CurriculumCanvas.vue'
import TurmasModal from './components/TurmasModal.vue'
import SavedSchedules from './SavedSchedules.vue'

const { mobile } = useDisplay()

const drawer = ref(true)
const currentPage = ref('home')
const showTurmasModal = ref(false)
const showCourseModal = ref(false)
const isChangingCourse = ref(false)
const turmasInfo = ref(dataService.getTurmasSourceInfo())

const selectedCourse = curriculumService.selectedCourseRef
const coursesList = curriculumService.getCoursesList()
const modalSelectedCourse = ref(selectedCourse.value || 'CIC')

const currentCourseName = computed(() => {
  const found = coursesList.find(c => c.code === selectedCourse.value)
  return found ? found.name : 'Ciência da Computação (CIC)'
})

onMounted(() => {
  const chosen = localStorage.getItem('ufrgs_course_chosen')
  if (!chosen) {
    isChangingCourse.value = false
    modalSelectedCourse.value = selectedCourse.value || 'CIC'
    showCourseModal.value = true
  }
})

const openCourseModal = () => {
  isChangingCourse.value = true
  modalSelectedCourse.value = selectedCourse.value || 'CIC'
  showCourseModal.value = true
}

const confirmCourseSelection = () => {
  curriculumService.setSelectedCourse(modalSelectedCourse.value)
  localStorage.setItem('ufrgs_course_chosen', 'true')
  showCourseModal.value = false
  if (isChangingCourse.value) {
    window.location.reload()
  }
}

const navigateTo = (pageName) => {
  currentPage.value = pageName
}

const refreshTurmasInfo = () => {
  turmasInfo.value = dataService.getTurmasSourceInfo()
}

const clearAllBrowserData = () => {
  if (confirm('Deseja realmente limpar todos os seus dados salvos no navegador (histórico de disciplinas concluídas, restrições, interesses e turmas personalizadas)?')) {
    localStorage.clear()
    window.location.reload()
  }
}
</script>

<template>
  <v-app class="app-background">
    <!-- Barra Lateral Original (SideBar) -->
    <SideBar
      v-model="drawer"
      :current-page="currentPage"
      @change-page="navigateTo"
      @open-turmas-modal="showTurmasModal = true"
    />

    <!-- Barra Superior Global -->
    <v-app-bar elevation="1" class="px-3" height="68">
      <v-app-bar-nav-icon
        v-if="mobile"
        @click="drawer = !drawer"
      ></v-app-bar-nav-icon>

      <v-toolbar-title class="font-weight-bold d-flex align-center gap-2 text-h6 mr-4" style="flex: 0 1 auto;">
        <span>Matrícula UFRGS</span>
      </v-toolbar-title>

      <!-- Botão para Trocar Curso no Topo -->
      <div class="d-flex align-center">
        <v-btn
          variant="outlined"
          color="primary"
          rounded="lg"
          size="small"
          prepend-icon="mdi-school-outline"
          class="font-weight-bold"
          @click="openCourseModal"
        >
          Curso: {{ currentCourseName }} (Trocar Curso)
        </v-btn>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center gap-2">
        <v-btn
          variant="tonal"
          color="primary"
          rounded="lg"
          size="small"
          prepend-icon="mdi-calendar-sync"
          @click="showTurmasModal = true"
        >
          Última atualização das turmas: {{ turmasInfo.date }}
        </v-btn>

        <!-- Botão Limpar Dados do Navegador -->
        <v-btn
          variant="outlined"
          color="error"
          rounded="lg"
          size="small"
          prepend-icon="mdi-delete-sweep-outline"
          @click="clearAllBrowserData"
          title="Limpar todos os dados salvos no navegador"
        >
          <span class="d-none d-sm-inline">Limpar Dados</span>
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Conteúdo Principal -->
    <v-main>
      <v-container fluid class="pa-4 pa-md-6">
        <Home
          v-if="currentPage === 'home'"
          @change-page="navigateTo"
        />

        <GenerateSchedules
          v-else-if="currentPage === 'generate_schedules'"
          @go-generate-schedule="currentPage = 'generated_schedule'"
        />

        <GeneratedSchedule
          v-else-if="currentPage === 'generated_schedule'"
          @back="currentPage = 'generate_schedules'"
        />

        <CurriculumCanvas
          v-else-if="currentPage === 'curriculum'"
          @change-page="currentPage = $event"
        />

        <SavedSchedules
          v-else-if="currentPage === 'saved_schedules'"
          @change-page="navigateTo"
        />
      </v-container>
    </v-main>

    <!-- Modal de Seleção de Curso -->
    <v-dialog v-model="showCourseModal" persistent max-width="480">
      <v-card class="rounded-xl p-4">
        <v-card-title class="text-h6 font-weight-bold d-flex align-center gap-2 pt-4 px-6">
          <v-icon color="primary">mdi-school</v-icon>
          Selecione o seu Curso
        </v-card-title>
        <v-card-subtitle class="px-6 pt-1 text-body-2">
          As disciplinas e turmas oferecidas serão filtradas para o curso escolhido.
        </v-card-subtitle>
        <v-card-text class="px-6 py-4">
          <v-radio-group v-model="modalSelectedCourse" class="mt-2">
            <v-card
              v-for="curso in coursesList"
              :key="curso.code"
              variant="outlined"
              :color="modalSelectedCourse === curso.code ? 'primary' : ''"
              class="mb-3 rounded-lg cursor-pointer transition-all"
              @click="modalSelectedCourse = curso.code"
            >
              <v-card-text class="d-flex align-center py-3">
                <v-radio :value="curso.code" color="primary" class="mr-2"></v-radio>
                <div class="font-weight-bold text-body-1">{{ curso.name }}</div>
              </v-card-text>
            </v-card>
          </v-radio-group>
        </v-card-text>
        <v-card-actions class="px-6 pb-5 pt-0 justify-end">
          <v-btn
            color="primary"
            variant="elevated"
            class="px-6 font-weight-bold rounded-lg text-none"
            @click="confirmCourseSelection"
          >
            Confirmar e Continuar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Modal para Atualização de Turmas .CSV -->
    <TurmasModal
      v-model="showTurmasModal"
      @turmas-updated="refreshTurmasInfo"
    />
  </v-app>
</template>

<style>
.app-background {
  background: var(--v-theme-background) !important;
  min-height: 100vh;
}
.gap-2 {
  gap: 8px;
}
</style>