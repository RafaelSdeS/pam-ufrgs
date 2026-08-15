<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { dataService, escapeHtml } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import { getCourseDifficulty, getDifficultyLabel, getDifficultyColor } from './data/courseDifficulty'

const emit = defineEmits(['change-page'])

const ELECTIVE_CODE_RE = /^ELETIVA-(\d+)$/

const savedPlans = ref([])
const collapsedPlans = reactive({})

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

const loadSavedPlans = () => {
  savedPlans.value = dataService.getSavedGraduationPlans()
}

onMounted(loadSavedPlans)
watch(() => curriculumService.selectedCourseRef.value, loadSavedPlans)

function resolveSubject(courseCode, code) {
  const subjectsMap = {}
  curriculumService.getCurriculumSubjects(courseCode).forEach(s => { subjectsMap[s.code] = s })
  if (subjectsMap[code]) return subjectsMap[code]
  const m = ELECTIVE_CODE_RE.exec(code)
  if (m) return { code, name: 'Eletiva (a escolher)', credits: parseInt(m[1]), isElective: true, isPlaceholder: true }
  const real = dataService.getCourseByCode(code, courseCode)
  if (real) return { ...real, isElective: true }
  return { code, name: code, credits: 0 }
}

function semesterCardsFor(plan) {
  return plan.semesters.map((codes, index) => {
    const subjects = codes.map(code => resolveSubject(plan.courseCode, code))
    const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0)
    return { index, subjects, totalCredits }
  })
}

function courseLabel(courseCode) {
  return curriculumService.normalizeCurriculumCode(courseCode) === 'ECP' ? 'Engenharia de Computação' : 'Ciência da Computação'
}

const deleteSavedPlan = (id) => {
  savedPlans.value = savedPlans.value.filter(p => p.id !== id)
  dataService.saveSavedGraduationPlans(savedPlans.value)
  showSnackbar('Previsão excluída das Previsões Salvas.', 'info')
}

const clearAllSavedPlans = () => {
  savedPlans.value = []
  dataService.saveSavedGraduationPlans([])
  showSnackbar('Todas as previsões salvas foram excluídas.', 'info')
}

const renamingPlan = ref(null)
const newPlanName = ref('')

const startRenaming = (plan) => {
  renamingPlan.value = plan
  newPlanName.value = plan.name
}

const saveRenaming = () => {
  if (!renamingPlan.value || !newPlanName.value.trim()) return
  renamingPlan.value.name = newPlanName.value.trim()
  dataService.saveSavedGraduationPlans(savedPlans.value)
  renamingPlan.value = null
  showSnackbar('Nome da previsão atualizado!', 'success')
}

function loadPlan(plan) {
  if (curriculumService.getSelectedCourse() !== plan.courseCode) {
    curriculumService.setSelectedCourse(plan.courseCode)
  }
  dataService.saveGraduationPlan(plan.semesters)
  dataService.saveCreditLimit(plan.creditLimit)
  dataService.saveSemesterCreditLimits(plan.semesterCreditLimits || {})
  emit('change-page', 'graduation_plan')
}

function exportToPDF(plan) {
  const cards = semesterCardsFor(plan)
  const semestersHtml = cards.map(sem => `
    <div class="semester-block">
      <div class="semester-title">${sem.index + 1}º Semestre <span class="credits-badge">${sem.totalCredits} créditos</span></div>
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
      <title>${escapeHtml(plan.name)}</title>
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
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div>
          <h1>${escapeHtml(plan.name)}</h1>
          <div class="subtitle">${courseLabel(plan.courseCode)}</div>
        </div>
        <button class="print-btn no-print" onclick="window.print()">Imprimir PDF</button>
      </div>

      ${semestersHtml}
    </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(htmlContent.normalize('NFC'))
  printWindow.document.close()

  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
}
</script>

<template>
  <v-container fluid class="pa-0">
    <v-card class="mb-6 rounded-xl border-thin shadow-premium bg-surface" elevation="1">
      <v-card-text class="pa-6 d-flex justify-space-between align-center flex-wrap ga-4">
        <div>
          <div class="d-flex align-center ga-3 mb-1">
            <v-icon icon="mdi-bookmark-multiple-outline" color="primary" size="x-large"></v-icon>
            <span class="text-h4 font-weight-bold">Previsões Salvas</span>
            <v-chip color="primary" variant="tonal" class="font-weight-bold ml-2">
              {{ savedPlans.length }} previsão(ões)
            </v-chip>
          </div>
          <div class="text-body-1 text-medium-emphasis">
            Acesse e gerencie suas versões salvas de previsão de formatura.
          </div>
        </div>

        <div class="d-flex ga-3 align-center">
          <v-btn
            v-if="savedPlans.length > 0"
            color="error"
            variant="tonal"
            prepend-icon="mdi-delete-sweep-outline"
            class="rounded-lg font-weight-bold"
            @click="clearAllSavedPlans"
          >
            Excluir Todas
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-calendar-check-outline"
            class="rounded-lg font-weight-bold"
            @click="emit('change-page', 'graduation_plan')"
          >
            Ir para Previsão Atual
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card v-if="savedPlans.length === 0" class="rounded-xl pa-10 text-center border-thin bg-surface mb-6">
      <v-icon icon="mdi-bookmark-off-outline" size="64" color="medium-emphasis" class="mb-4"></v-icon>
      <div class="text-h5 font-weight-bold mb-2">Nenhuma previsão salva ainda</div>
      <div class="text-body-1 text-medium-emphasis mb-6 max-width-600 mx-auto">
        Você ainda não salvou nenhuma previsão de formatura no seu navegador. Vá até a tela de Previsão de Formatura e clique em "Salvar Previsão".
      </div>
      <v-btn
        color="primary"
        variant="elevated"
        size="large"
        prepend-icon="mdi-calendar-check-outline"
        class="rounded-lg font-weight-bold px-8"
        @click="emit('change-page', 'graduation_plan')"
      >
        Ir para Previsão de Formatura
      </v-btn>
    </v-card>

    <div v-else class="d-flex flex-column ga-6">
      <v-card
        v-for="(plan, idx) in savedPlans"
        :key="plan.id"
        variant="outlined"
        class="rounded-xl border-thin shadow-premium bg-surface"
      >
        <v-card-title class="pa-5 bg-surface-light border-bottom d-flex justify-space-between align-center flex-wrap ga-3">
          <div class="d-flex align-center ga-3">
            <v-avatar color="primary" variant="tonal" size="42" class="font-weight-bold">
              #{{ idx + 1 }}
            </v-avatar>

            <div>
              <div v-if="renamingPlan?.id === plan.id" class="d-flex align-center ga-2">
                <v-text-field
                  v-model="newPlanName"
                  density="compact"
                  variant="outlined"
                  hide-details
                  auto-select-first
                  class="font-weight-bold"
                  style="min-width: 280px;"
                  @keyup.enter="saveRenaming"
                ></v-text-field>
                <v-btn icon="mdi-check" color="success" size="small" variant="flat" @click="saveRenaming"></v-btn>
                <v-btn icon="mdi-close" size="small" variant="text" @click="renamingPlan = null"></v-btn>
              </div>

              <div v-else class="d-flex align-center ga-2">
                <span class="text-h6 font-weight-bold">{{ plan.name }}</span>
                <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" title="Renomear previsão" @click="startRenaming(plan)"></v-btn>
              </div>

              <div class="text-caption text-medium-emphasis d-flex align-center ga-3 mt-1">
                <span>Salva em: {{ new Date(plan.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
                <span>•</span>
                <span class="font-weight-bold text-primary">{{ courseLabel(plan.courseCode) }}</span>
                <span>•</span>
                <span class="font-weight-bold text-success">{{ plan.semesters.length }} semestre(s)</span>
              </div>
            </div>
          </div>

          <div class="d-flex align-center ga-2 flex-wrap">
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-tray-arrow-up"
              class="rounded-lg font-weight-bold"
              @click="loadPlan(plan)"
            >
              Carregar
            </v-btn>
            <v-btn
              variant="tonal"
              size="small"
              prepend-icon="mdi-file-pdf-box"
              class="rounded-lg font-weight-bold"
              @click="exportToPDF(plan)"
            >
              Exportar PDF
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              class="rounded-lg font-weight-bold"
              @click="deleteSavedPlan(plan.id)"
            >
              Excluir
            </v-btn>
            <v-btn
              :icon="collapsedPlans[plan.id] ? 'mdi-chevron-down' : 'mdi-chevron-up'"
              variant="text"
              size="small"
              :title="collapsedPlans[plan.id] ? 'Expandir previsão' : 'Recolher previsão'"
              @click="collapsedPlans[plan.id] = !collapsedPlans[plan.id]"
            ></v-btn>
          </div>
        </v-card-title>

        <v-expand-transition>
          <v-card-text v-show="!collapsedPlans[plan.id]" class="pa-3">
            <div class="semester-row">
              <v-card v-for="sem in semesterCardsFor(plan)" :key="sem.index" class="semester-card rounded-xl border-thin" variant="outlined">
                <v-card-title class="pa-3 border-bottom bg-surface-light d-flex align-center ga-2">
                  <v-avatar color="primary" variant="tonal" size="30" class="font-weight-bold flex-shrink-0">
                    {{ sem.index + 1 }}
                  </v-avatar>
                  <div class="d-flex flex-column">
                    <span class="text-subtitle-2 font-weight-bold">{{ sem.index + 1 }}º Semestre</span>
                    <v-chip size="x-small" variant="tonal" color="primary" class="font-weight-bold mt-1">{{ sem.totalCredits }} créditos</v-chip>
                  </div>
                </v-card-title>
                <v-card-text class="pa-2">
                  <div v-for="(subj, sIdx) in sem.subjects" :key="sIdx" class="subject-item rounded-lg pa-2 mb-1">
                    <div class="text-body-2 font-weight-bold">
                      <span v-if="subj.isPlaceholder" class="text-medium-emphasis font-italic">Eletiva</span>
                      <span v-else>{{ subj.code }}</span>
                    </div>
                    <div class="text-caption text-medium-emphasis mb-1">{{ subj.name }}</div>
                    <v-chip size="x-small" color="secondary" variant="tonal" class="font-weight-bold">{{ subj.credits }}cr</v-chip>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </v-card-text>
        </v-expand-transition>
      </v-card>
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
.shadow-premium {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
}
.border-bottom {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08) !important;
}
.border-thin {
  border: 1px solid rgba(var(--v-border-color), 0.08) !important;
}
.semester-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.semester-card {
  min-width: 260px;
  flex: 0 0 260px;
}
.subject-item {
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  border: 1px solid rgba(var(--v-border-color), 0.06);
}
</style>
