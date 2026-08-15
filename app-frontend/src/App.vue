<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { dataService } from './services/dataService'
import { curriculumService } from './services/curriculumService'

import SideBar from './components/SideBar.vue'
import Home from './Home.vue'
import GenerateSchedules from './GenerateSchedules.vue'
import GeneratedSchedule from './GeneratedSchedule.vue'
import CurriculumCanvas from './components/CurriculumCanvas.vue'
import TurmasModal from './components/TurmasModal.vue'
import ElectivesModal from './components/ElectivesModal.vue'
import AiAssistantModal from './components/AiAssistantModal.vue'
import SavedSchedules from './SavedSchedules.vue'
import GraduationPlan from './GraduationPlan.vue'
import SavedGraduationPlans from './SavedGraduationPlans.vue'

const { mobile } = useDisplay()
const showMobileWarning = ref(true)

const drawer = ref(!mobile.value)

watch(() => mobile.value, (isMobile) => {
  drawer.value = !isMobile
})

const currentPage = ref('home')
const showTurmasModal = ref(false)
const showElectivesModal = ref(false)
const showAiModal = ref(false)
const graduationPlanKey = ref(0)
const showCourseModal = ref(false)
const isChangingCourse = ref(false)
const turmasUpdateTrigger = ref(0)
const turmasInfo = computed(() => {
  turmasUpdateTrigger.value
  return dataService.getTurmasSourceInfo(curriculumService.selectedCourseRef.value)
})

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

watch(() => curriculumService.selectedCourseRef.value, () => {
  turmasUpdateTrigger.value++
  if (currentPage.value === 'generated_schedule') {
    currentPage.value = 'generate_schedules'
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
  if (pageName === 'graduation_plan') graduationPlanKey.value++
  currentPage.value = pageName
}

const refreshTurmasInfo = () => {
  turmasUpdateTrigger.value++
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
      :current-course-name="currentCourseName"
      @change-page="navigateTo"
      @open-turmas-modal="showTurmasModal = true"
      @open-electives-modal="showElectivesModal = true"
      @open-ai-modal="showAiModal = true"
      @open-course-modal="openCourseModal"
      @clear-browser-data="clearAllBrowserData"
    />

    <!-- Barra Superior Global -->
    <v-app-bar elevation="1" class="px-2 px-md-3" height="68">
      <v-app-bar-nav-icon
        v-if="mobile"
        @click="drawer = !drawer"
      ></v-app-bar-nav-icon>

      <v-toolbar-title class="font-weight-bold d-flex align-center ga-2 mr-2 mr-md-4" :class="mobile ? 'text-subtitle-1' : 'text-h6'" style="flex: 0 1 auto;">
        <span>PAM - UFRGS</span>
      </v-toolbar-title>

      <!-- Botão para Trocar Curso no Topo (Desktop) -->
      <div v-if="!mobile" class="d-flex align-center">
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
      <!-- Botão para Trocar Curso no Topo (Mobile Compacto) -->
      <div v-else class="d-flex align-center">
        <v-btn
          variant="outlined"
          color="primary"
          rounded="lg"
          size="small"
          class="font-weight-bold px-2"
          @click="openCourseModal"
        >
          <v-icon icon="mdi-school-outline" size="small" class="mr-1"></v-icon>
          {{ selectedCourse || 'CIC' }}
        </v-btn>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center ga-1 ga-md-2">
        <v-btn
          v-if="!mobile"
          variant="tonal"
          color="primary"
          rounded="lg"
          size="small"
          prepend-icon="mdi-calendar-sync"
          @click="showTurmasModal = true"
        >
          Última atualização das turmas {{ turmasInfo.courseCode }}: {{ turmasInfo.date }}
        </v-btn>
        <v-btn
          v-else
          variant="tonal"
          color="primary"
          icon="mdi-calendar-sync"
          size="small"
          @click="showTurmasModal = true"
          title="Status das turmas"
        ></v-btn>

        <!-- Botão Limpar Dados do Navegador -->
        <v-btn
          variant="outlined"
          color="error"
          rounded="lg"
          size="small"
          :icon="mobile"
          :prepend-icon="!mobile ? 'mdi-delete-sweep-outline' : undefined"
          @click="clearAllBrowserData"
          title="Limpar todos os dados salvos no navegador"
        >
          <v-icon v-if="mobile" icon="mdi-delete-sweep-outline" size="small"></v-icon>
          <span v-else>Limpar Dados</span>
        </v-btn>
      </div>
    </v-app-bar>

    <!-- Conteúdo Principal -->
    <v-main>
      <v-container fluid class="pa-4 pa-md-6">
        <!-- Aviso de Site Desktop-First para usuários mobile -->
        <v-alert
          v-if="mobile && showMobileWarning"
          type="info"
          variant="tonal"
          color="primary"
          icon="mdi-monitor-cellphone"
          closable
          class="mb-4 rounded-xl border-thin shadow-premium"
          @click:close="showMobileWarning = false"
        >
          <div class="font-weight-bold mb-1">Aviso: Site Desktop-First</div>
          <div class="text-caption">
            Este site foi projetado idealmente para uso em computadores (desktop-first). O acesso via celular conta com adaptações e otimizações, mas para a melhor experiência visual ao explorar fluxogramas e grades completas, recomenda-se o acesso por um computador.
          </div>
        </v-alert>

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

        <GraduationPlan
          v-else-if="currentPage === 'graduation_plan'"
          :key="graduationPlanKey"
          @change-page="navigateTo"
        />

        <SavedGraduationPlans
          v-else-if="currentPage === 'saved_graduation_plans'"
          @change-page="navigateTo"
        />
      </v-container>
    </v-main>

    <!-- Modal de Seleção de Curso -->
    <v-dialog v-model="showCourseModal" persistent max-width="480">
      <v-card class="rounded-xl p-4">
        <v-card-title class="text-h6 font-weight-bold d-flex align-center ga-2 pt-4 px-6">
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

    <!-- Modal de Gerenciamento de Eletivas -->
    <ElectivesModal
      v-model="showElectivesModal"
      @updated="graduationPlanKey++"
    />

    <!-- Modal do Assistente de IA -->
    <AiAssistantModal v-model="showAiModal" />
  </v-app>
</template>

<style>
.app-background {
  background: var(--v-theme-background) !important;
  min-height: 100vh;
}
</style>