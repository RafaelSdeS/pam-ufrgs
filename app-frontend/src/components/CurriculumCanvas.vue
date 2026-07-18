<script setup>
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useTheme, useDisplay } from 'vuetify'
import { dataService } from '../services/dataService'
import { pdfParserService } from '../services/pdfParserService'
import { curriculumService } from '../services/curriculumService'

import { calculateSubjectStatuses } from '../composables/useCurriculumStatus'

const props = defineProps({
  studentId: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['change-page'])
const { mobile } = useDisplay()

const canvasViewMode = ref(mobile.value ? 'list' : 'canvas')
const selectedSemesterTab = ref('1')

watch(() => mobile.value, (val) => {
  canvasViewMode.value = val ? 'list' : 'canvas'
})

// Reactive States
const rawSubjects = ref([])
const completedSubjectIds = ref([])
const loading = ref(false)
const usingFallback = ref(false)
const searchQuery = ref('')
const selectedSubjectId = ref(null)

// Edit Mode States
const isEditMode = ref(false)
const tempCompletedSubjectIds = ref([])
const pdfInputRef = ref(null)
const uploadingPdf = ref(false)
const showPdfModal = ref(false)

const snackbar = reactive({
  show: false,
  text: '',
  color: 'success',
  timeout: 5000
})

const theme = useTheme()

// Viewport and Canvas Elements
const viewportRef = ref(null)
const panX = ref(10)
const panY = ref(10)
const zoom = ref(0.7)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// Deterministic Grid Dimensions
const cardWidth = 260
const cardHeight = 115
const cardGap = 25
const cardStride = cardHeight + cardGap // 140px

const columnWidth = 260
const columnGap = 60
const columnStride = columnWidth + columnGap // 320px

const marginX = 50
const marginY = 80

const selectedCourse = curriculumService.selectedCourseRef

// Academic status colors (hoisted function)
function getStatusConfig(status) {
  switch (status) {
    case 'completed':
      return { color: 'success', icon: 'mdi-check-circle', border: 'rgba(76, 175, 80, 0.6)', bg: 'bg-emerald', badge: 'Concluída', borderClass: '' }
    case 'available':
      return { color: 'warning', icon: 'mdi-star-circle', border: 'rgba(251, 192, 45, 0.7)', bg: 'bg-amber', badge: 'Disponível', borderClass: '' }
    case 'blocked':
    default:
      return { color: 'error', icon: 'mdi-lock-outline', border: 'rgba(244, 67, 54, 0.5)', bg: 'bg-error-suttle', badge: 'Bloqueada', borderClass: '' }
  }
}

// 1. Process local data from selected curriculum
const localSubjectsMap = computed(() => {
  const subjects = curriculumService.getCurriculumSubjects(selectedCourse.value)
  const map = {}
  subjects.forEach(item => {
    map[item.code] = item
  })
  return map
})

// 2. Load Local Data
const loadData = async () => {
  loading.value = true
  usingFallback.value = false
  try {
    rawSubjects.value = Object.values(localSubjectsMap.value)
    completedSubjectIds.value = dataService.getCompletedCourses()
  } catch (err) {
    console.warn('Erro ao carregar dados:', err)
  } finally {
    loading.value = false
    setupLayout()
  }
}

// Edit Mode control functions
const startEditing = () => {
  isEditMode.value = true
  tempCompletedSubjectIds.value = [...completedSubjectIds.value]
}

const cancelEditing = () => {
  isEditMode.value = false
  tempCompletedSubjectIds.value = []
  updateGridStatuses(completedSubjectIds.value)
}

const saveCompletions = async () => {
  loading.value = true
  try {
    dataService.saveCompletedCourses(tempCompletedSubjectIds.value)
    completedSubjectIds.value = [...tempCompletedSubjectIds.value]
    isEditMode.value = false
  } catch (error) {
    console.error('Erro ao salvar conclusões:', error)
    snackbar.text = 'Erro ao salvar as disciplinas concluídas.'
    snackbar.color = 'error'
    snackbar.show = true
  } finally {
    loading.value = false
  }
}

const triggerPdfUpload = () => {
  showPdfModal.value = true
}

const handlePdfUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  event.target.value = ''

  uploadingPdf.value = true
  loading.value = true
  try {
    const result = await pdfParserService.parseTranscript(file)
    if (result.error === 'empty_pdf') {
      snackbar.text = 'O arquivo PDF não possui texto selecionável (é uma imagem ou escaneado). Por favor, salve o Histórico como HTML (Ctrl+S) ou gere um PDF com texto.'
      snackbar.color = 'warning'
      snackbar.show = true
      return
    }
    if (result.error === 'session_expired') {
      snackbar.text = 'O arquivo HTML indica que sua sessão expirou no Portal antes do salvamento ("Sua sessão expirou"). Faça login e salve a página novamente.'
      snackbar.color = 'warning'
      snackbar.show = true
      return
    }
    if (result.totalFound === 0) {
      snackbar.text = 'Nenhuma disciplina aprovada foi encontrada no arquivo. Verifique se carregou o Histórico do Curso correto.'
      snackbar.color = 'warning'
      snackbar.show = true
      return
    }

    const newCodes = result.courses.map(c => c.code)
    completedSubjectIds.value = dataService.saveCompletedCourses(newCodes)

    updateGridStatuses(completedSubjectIds.value)
    snackbar.text = `Histórico processado com sucesso! Foram identificadas ${result.totalFound} disciplinas aprovadas no seu arquivo.`
    snackbar.color = 'success'
    snackbar.show = true
  } catch (error) {
    console.error('Erro ao processar o arquivo:', error)
    snackbar.text = 'Erro ao processar o arquivo. Verifique se é um PDF ou HTML válido.'
    snackbar.color = 'error'
    snackbar.show = true
  } finally {
    uploadingPdf.value = false
    loading.value = false
  }
}

const updateGridStatuses = (completedList) => {
  const statuses = calculateSubjectStatuses(rawSubjects.value, completedList)
  subjectsWithCoords.value = subjectsWithCoords.value.map(s => {
    const st = statuses[s.id] || 'blocked'
    return {
      ...s,
      status: st,
      statusConfig: getStatusConfig(st)
    }
  })
}

const toggleSubjectCompletion = (subject) => {
  const code = subject.code
  const isCompleted = tempCompletedSubjectIds.value.includes(code)

  if (isCompleted) {
    // Just unmark the clicked course
    tempCompletedSubjectIds.value = tempCompletedSubjectIds.value.filter(c => c !== code)
  } else {
    // Just mark the clicked course as completed
    tempCompletedSubjectIds.value.push(code)
  }
  updateGridStatuses(tempCompletedSubjectIds.value)
}

// 3. Setup Grid Coordinates and Layout
const maxRowsCount = ref(1)
const maxSemester = ref(10)
const subjectsWithCoords = ref([])

const setupLayout = () => {
  const semestersGroups = {}
  let maxSem = 10

  rawSubjects.value.forEach(subject => {
    const sem = subject.semester || 1
    if (sem > maxSem) maxSem = sem
    if (!semestersGroups[sem]) semestersGroups[sem] = []
    semestersGroups[sem].push(subject)
  })

  const statuses = calculateSubjectStatuses(rawSubjects.value, completedSubjectIds.value)
  maxSemester.value = maxSem

  let maxRows = 0
  const tempSubjects = []

  // Calculate deterministic mathematical coordinates for each subject
  Object.keys(semestersGroups).forEach(semKey => {
    const sem = parseInt(semKey)
    const list = semestersGroups[sem]
    if (list.length > maxRows) maxRows = list.length

    list.forEach((subject, rowIndex) => {
      const x = (sem - 1) * columnStride + marginX
      const y = rowIndex * cardStride + marginY
      const st = statuses[subject.id] || 'blocked'

      tempSubjects.push({
        ...subject,
        status: st,
        statusConfig: getStatusConfig(st),
        x,
        y,
        col: sem - 1,
        row: rowIndex,
        isHighlighted: false,
        isDimmed: false
      })
    })
  })

  maxRowsCount.value = maxRows
  subjectsWithCoords.value = tempSubjects

  // Center the graph at start
  setTimeout(() => {
    handleFitView()
  }, 150)
}

// Virtual total dimensions of canvas
const canvasWidth = computed(() => maxSemester.value * columnStride + marginX + 100)
const canvasHeight = computed(() => maxRowsCount.value * cardStride + marginY + 50)

const subjectsBySemester = computed(() => {
  const map = {}
  subjectsWithCoords.value.forEach(s => {
    const sem = s.semester || 1
    if (!map[sem]) map[sem] = []
    map[sem].push(s)
  })
  return map
})

const getSubjectStatus = (item) => {
  if (tempCompletedSubjectIds.value.includes(item.code)) return 'completed'
  return item.status || 'blocked'
}

// 4. SVG Prerequisite Connections
const connections = computed(() => {
  const list = []
  const map = new Map()
  subjectsWithCoords.value.forEach(s => {
    map.set(s.id, s)
    if (s.code) map.set(s.code, s)
  })

  subjectsWithCoords.value.forEach(target => {
    const prereqs = target.prerequisites || []
    prereqs.forEach(prereqId => {
      const source = map.get(prereqId)
      if (source) {
        const x1 = source.x + cardWidth
        const y1 = source.y + cardHeight / 2
        const x2 = target.x
        const y2 = target.y + cardHeight / 2

        let path = ''
        const deltaCol = target.col - source.col
        
        if (deltaCol > 1) {
          const x_chan1 = x1 + 30
          const x_chan2 = x2 - 30
          const gapIndex = source.row > target.row ? source.row - 1 : source.row
          const y_chan = gapIndex * cardStride + marginY + cardHeight + cardGap / 2
          const R = 12
          const dirY = y_chan > y1 ? 1 : -1
          const dirY2 = y2 > y_chan ? 1 : -1
          
          path = `M ${x1} ${y1} ` +
                 `L ${x_chan1 - R} ${y1} ` +
                 `Q ${x_chan1} ${y1}, ${x_chan1} ${y1 + dirY * R} ` +
                 `L ${x_chan1} ${y_chan - dirY * R} ` +
                 `Q ${x_chan1} ${y_chan}, ${x_chan1 + R} ${y_chan} ` +
                 `L ${x_chan2 - R} ${y_chan} ` +
                 `Q ${x_chan2} ${y_chan}, ${x_chan2} ${y_chan + dirY2 * R} ` +
                 `L ${x_chan2} ${y2 - dirY2 * R} ` +
                 `Q ${x_chan2} ${y2}, ${x_chan2 + R} ${y2} ` +
                 `L ${x2} ${y2}`
        } else {
          const controlOffset = 50
          path = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`
        }

        list.push({
          id: `${source.id}-${target.id}`,
          sourceId: source.id,
          targetId: target.id,
          path
        })
      }
    })
  })
  return list
})

const getPredecessors = (subjectId, visited = new Set()) => {
  const current = subjectsWithCoords.value.find(s => s.id === subjectId)
  if (!current) return visited

  const prereqs = current.prerequisites || []
  prereqs.forEach(pid => {
    const parent = subjectsWithCoords.value.find(s => s.code === pid || s.id === pid)
    if (parent && !visited.has(parent.id)) {
      visited.add(parent.id)
      getPredecessors(parent.id, visited)
    }
  })
  return visited
}

const getSuccessors = (subjectId, visited = new Set()) => {
  subjectsWithCoords.value.forEach(candidate => {
    const prereqs = candidate.prerequisites || []
    const isDependent = prereqs.some(pid => pid === subjectId || (subjectsWithCoords.value.find(s => s.id === subjectId)?.code === pid))
    
    if (isDependent && !visited.has(candidate.id)) {
      visited.add(candidate.id)
      getSuccessors(candidate.id, visited)
    }
  })
  return visited
}

const activeConnections = ref(new Set())

const activeConnectionPaths = computed(() => {
  const activeSet = activeConnections.value
  if (!activeSet || activeSet.size === 0) return []
  return connections.value.filter(c => activeSet.has(c.id))
})

const updateHighlights = () => {
  const search = searchQuery.value.trim().toLowerCase()
  const selectedId = selectedSubjectId.value

  const newActive = new Set()

  if (!search && !selectedId) {
    subjectsWithCoords.value.forEach(s => {
      if (s.isHighlighted) s.isHighlighted = false
      if (s.isDimmed) s.isDimmed = false
    })
    activeConnections.value = newActive
    return
  }

  const prereqCodes = new Set()
  if (selectedId) {
    const selectedSubject = subjectsWithCoords.value.find(s => s.id === selectedId)
    if (selectedSubject && selectedSubject.prerequisites) {
      selectedSubject.prerequisites.forEach(code => {
        prereqCodes.add(code.toLowerCase())
      })
    }
  }

  subjectsWithCoords.value.forEach(s => {
    const matchesSearch = !search || s.code.toLowerCase().includes(search) || s.name.toLowerCase().includes(search)
    let newHighlighted = false
    let newDimmed = false

    if (selectedId) {
      const isPrereq = prereqCodes.has(s.code.toLowerCase()) || prereqCodes.has(s.id.toLowerCase())
      const isSelected = s.id === selectedId
      const isRelated = isSelected || isPrereq
      newHighlighted = isRelated && matchesSearch
      newDimmed = !isRelated || !matchesSearch
    } else {
      newHighlighted = matchesSearch
      newDimmed = !matchesSearch
    }

    if (s.isHighlighted !== newHighlighted) s.isHighlighted = newHighlighted
    if (s.isDimmed !== newDimmed) s.isDimmed = newDimmed
  })

  if (selectedId) {
    connections.value.forEach(conn => {
      if (conn.targetId === selectedId) {
        newActive.add(conn.id)
      }
    })
  }
  activeConnections.value = newActive
}

let rafId = null
const onMouseDown = (e) => {
  if (e.button !== 0) return
  isDragging.value = true
  dragStart.value = { x: e.clientX - panX.value, y: e.clientY - panY.value }
  viewportRef.value.style.cursor = 'grabbing'
}

const onMouseMove = (e) => {
  if (!isDragging.value) return
  if (rafId) return
  rafId = requestAnimationFrame(() => {
    panX.value = e.clientX - dragStart.value.x
    panY.value = e.clientY - dragStart.value.y
    rafId = null
  })
}

const onMouseUp = () => {
  isDragging.value = false
  if (viewportRef.value) {
    viewportRef.value.style.cursor = 'grab'
  }
}

let initialPinchDistance = 0
let initialPinchZoom = 0.7

const onTouchStart = (e) => {
  if (e.touches.length === 1) {
    isDragging.value = true
    const touch = e.touches[0]
    dragStart.value = { x: touch.clientX - panX.value, y: touch.clientY - panY.value }
  } else if (e.touches.length === 2) {
    isDragging.value = false
    const [t1, t2] = [e.touches[0], e.touches[1]]
    initialPinchDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    initialPinchZoom = zoom.value
  }
}

const onTouchMove = (e) => {
  if (e.touches.length === 1 && isDragging.value) {
    if (rafId) return
    const touch = e.touches[0]
    rafId = requestAnimationFrame(() => {
      panX.value = touch.clientX - dragStart.value.x
      panY.value = touch.clientY - dragStart.value.y
      rafId = null
    })
  } else if (e.touches.length === 2 && initialPinchDistance > 0) {
    if (rafId) return
    const [t1, t2] = [e.touches[0], e.touches[1]]
    const currentDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
    rafId = requestAnimationFrame(() => {
      const scale = currentDistance / initialPinchDistance
      zoom.value = Math.min(Math.max(initialPinchZoom * scale, 0.3), 2.0)
      rafId = null
    })
  }
}

const onTouchEnd = (e) => {
  if (e.touches.length === 0) {
    isDragging.value = false
    initialPinchDistance = 0
  }
}

const onWheel = (e) => {
  e.preventDefault()
  const zoomFactor = 1.08
  let newZoom = zoom.value
  
  if (e.deltaY < 0) {
    newZoom = Math.min(newZoom * zoomFactor, 2.0)
  } else {
    newZoom = Math.max(newZoom / zoomFactor, 0.3)
  }

  // Zoom centralizado aproximado
  const rect = viewportRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  const canvasMouseX = (mouseX - panX.value) / zoom.value
  const canvasMouseY = (mouseY - panY.value) / zoom.value

  zoom.value = newZoom
  panX.value = mouseX - canvasMouseX * newZoom
  panY.value = mouseY - canvasMouseY * newZoom
}

// Zoom and Center buttons
const handleZoomIn = () => {
  zoom.value = Math.min(zoom.value * 1.2, 2.0)
}

const handleZoomOut = () => {
  zoom.value = Math.max(zoom.value / 1.2, 0.3)
}

const handleFitView = () => {
  if (!viewportRef.value) return
  const vWidth = viewportRef.value.clientWidth
  const vHeight = viewportRef.value.clientHeight

  const scaleX = vWidth / canvasWidth.value
  const scaleY = vHeight / canvasHeight.value
  const newZoom = Math.max(0.3, Math.min(scaleX, scaleY) * 0.9)

  zoom.value = newZoom
  panX.value = (vWidth - canvasWidth.value * newZoom) / 2
  panY.value = (vHeight - canvasHeight.value * newZoom) / 2
}

const selectSubject = (id) => {
  if (selectedSubjectId.value === id) {
    selectedSubjectId.value = null // Deseleciona
  } else {
    selectedSubjectId.value = id
  }
}

const clearSelection = (e) => {
  // Clear only if clicking on empty canvas background
  if (e.target.classList.contains('canvas-background') || e.target.classList.contains('canvas-grid')) {
    selectedSubjectId.value = null
  }
}

// Watchers
watch([searchQuery, selectedSubjectId], () => {
  updateHighlights()
})

watch(() => props.studentId, () => {
  loadData()
})

watch(() => selectedCourse.value, () => {
  isEditMode.value = false
  tempCompletedSubjectIds.value = []
  searchQuery.value = ''
  selectedSubjectId.value = null
  selectedSemester.value = null
  loadData()
})

onMounted(() => {
  loadData()
})

// Carga horária
const getWorkload = (s) => {
  return s.carga_horaria ? `${s.carga_horaria}h` : `${(s.credits || 4) * 15}h`
}

const miniViewportRect = computed(() => {
  if (!viewportRef.value) return { x: 0, y: 0, w: 0, h: 0 }
  const vWidth = viewportRef.value.clientWidth
  const vHeight = viewportRef.value.clientHeight
  
  return {
    x: Math.max(0, -panX.value / zoom.value),
    y: Math.max(0, -panY.value / zoom.value),
    w: Math.min(canvasWidth.value, vWidth / zoom.value),
    h: Math.min(canvasHeight.value, vHeight / zoom.value)
  }
})
</script>

<template>
  <v-container fluid class="pa-0 fill-height d-flex flex-column">
    <!-- Toolbar -->
    <v-card class="mx-4 mt-2 mb-4 pa-4 rounded-xl shadow-premium" elevation="2">
      <v-row align="center" class="mb-2" no-gutters>
        <!-- Legenda -->
        <v-col cols="12" md="5" class="d-flex flex-wrap align-center justify-start gap-4 mb-2 mb-md-0">
          <div class="d-flex align-center mr-4">
            <span class="legend-color legend-completed mr-2"></span>
            <span class="text-caption font-weight-medium">Concluída</span>
          </div>
          <div class="d-flex align-center mr-4">
            <span class="legend-color legend-available mr-2"></span>
            <span class="text-caption font-weight-medium">Disponível</span>
          </div>
          <div class="d-flex align-center mr-4">
            <span class="legend-color legend-blocked mr-2"></span>
            <span class="text-caption font-weight-medium">Bloqueada</span>
          </div>
        </v-col>

        <!-- Ações do Aluno e Edição -->
        <v-col cols="12" md="7" class="d-flex justify-md-end justify-start align-center gap-2 flex-wrap">
          <input
            type="file"
            ref="pdfInputRef"
            accept=".pdf,.html,.htm"
            class="d-none"
            @change="handlePdfUpload"
          />
          <v-btn
            v-if="!isEditMode"
            color="red-darken-2"
            variant="flat"
            prepend-icon="mdi-file-document-outline"
            class="rounded-lg font-weight-medium text-none"
            :size="mobile ? 'small' : 'default'"
            @click="triggerPdfUpload"
            :loading="uploadingPdf"
          >
            {{ mobile ? 'Carregar Histórico' : 'Carregar Histórico (PDF / HTML)' }}
          </v-btn>
          <v-btn
            v-if="!isEditMode"
            color="primary"
            variant="flat"
            prepend-icon="mdi-pencil"
            class="rounded-lg font-weight-medium text-none"
            :size="mobile ? 'small' : 'default'"
            @click="startEditing"
          >
            Editar
          </v-btn>
          <v-btn
            v-if="!isEditMode"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-calendar-check"
            class="rounded-lg font-weight-medium text-none"
            :size="mobile ? 'small' : 'default'"
            @click="emit('change-page', 'generate_schedules')"
          >
            {{ mobile ? 'Gerar Grade' : 'Selecionar disciplinas para o próximo semestre' }}
          </v-btn>
          <template v-else>
            <v-btn
              color="success"
              variant="flat"
              prepend-icon="mdi-check"
              class="rounded-lg font-weight-medium mr-1"
              :size="mobile ? 'small' : 'default'"
              @click="saveCompletions"
            >
              Salvar
            </v-btn>
            <v-btn
              color="grey"
              variant="outlined"
              prepend-icon="mdi-close"
              class="rounded-lg font-weight-medium"
              :size="mobile ? 'small' : 'default'"
              @click="cancelEditing"
            >
              Cancelar
            </v-btn>
          </template>
        </v-col>
      </v-row>

      <!-- Linha Inferior: Controles de Visualização (a mais próxima do gráfico) -->
      <v-divider class="my-2"></v-divider>
      <v-row align="center" no-gutters>
        <v-col cols="12" class="d-flex justify-end align-center gap-2 flex-wrap">
          <v-btn-group variant="outlined" density="compact" color="primary" class="rounded-lg mr-2">
            <v-btn
              :variant="canvasViewMode === 'canvas' ? 'flat' : 'outlined'"
              prepend-icon="mdi-image-filter-center-focus"
              class="text-none font-weight-bold text-caption"
              @click="canvasViewMode = 'canvas'"
            >
              Grade 2D
            </v-btn>
            <v-btn
              :variant="canvasViewMode === 'list' ? 'flat' : 'outlined'"
              prepend-icon="mdi-view-list"
              class="text-none font-weight-bold text-caption"
              @click="canvasViewMode = 'list'"
            >
              Lista por Semestre
            </v-btn>
          </v-btn-group>

          <v-btn-group v-if="canvasViewMode === 'canvas'" variant="outlined" density="compact" class="rounded-lg mr-2">
            <v-btn icon="mdi-plus" @click="handleZoomIn" title="Aumentar Zoom"></v-btn>
            <v-btn icon="mdi-minus" @click="handleZoomOut" title="Diminuir Zoom"></v-btn>
          </v-btn-group>
          <v-btn
            v-if="canvasViewMode === 'canvas'"
            color="secondary"
            variant="outlined"
            prepend-icon="mdi-image-filter-center-focus"
            class="rounded-lg font-weight-medium"
            @click="handleFitView"
          >
            Ajustar
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Main Viewport Container -->
    <v-row class="flex-grow-1 mx-4 mb-4 fill-height relative" no-gutters>
      <!-- Loading Overlay -->
      <v-overlay
        :model-value="loading"
        class="align-center justify-center rounded-xl"
        contained
        persistent
      >
        <v-progress-circular color="primary" indeterminate size="64"></v-progress-circular>
      </v-overlay>

      <v-col cols="12" class="fill-height">
        <!-- Modo Lista por Semestre (Otimizado para Mobile e Acessibilidade) -->
        <v-card v-if="canvasViewMode === 'list'" class="fill-height rounded-xl overflow-y-auto pa-4 pa-md-6 d-flex flex-column" elevation="2">
          <!-- Banner se estiver em modo edição -->
          <v-alert
            v-if="isEditMode"
            type="warning"
            variant="tonal"
            border="start"
            class="mb-4 font-weight-medium"
          >
            <strong>Modo Edição Ativo:</strong> Clique em qualquer disciplina abaixo para marcar ou desmarcar como concluída. Depois clique em <strong>Salvar</strong> no topo!
          </v-alert>
          <v-alert
            v-else
            type="info"
            variant="tonal"
            border="start"
            class="mb-4 text-caption"
          >
            Navegue pelos semestres abaixo. Clique em uma disciplina para ver seus pré-requisitos e detalhes. Clique em <strong>Editar</strong> no topo para marcar disciplinas como concluídas.
          </v-alert>

          <v-tabs v-model="selectedSemesterTab" color="primary" density="compact" show-arrows class="mb-4 border-b">
            <v-tab v-for="s in maxSemester" :key="String(s)" :value="String(s)" class="font-weight-bold text-none">
              {{ s }}º Semestre
              <v-chip size="x-small" color="primary" class="ml-1 font-weight-bold">
                {{ subjectsBySemester[s]?.length || 0 }}
              </v-chip>
            </v-tab>
          </v-tabs>

          <div v-if="subjectsBySemester[Number(selectedSemesterTab)] && subjectsBySemester[Number(selectedSemesterTab)].length > 0" class="d-flex flex-column gap-3">
            <v-card
              v-for="item in subjectsBySemester[Number(selectedSemesterTab)]"
              :key="item.id || item.code"
              variant="outlined"
              class="pa-4 rounded-xl d-flex flex-column gap-2 transition-swing cursor-pointer"
              :class="[
                isEditMode && tempCompletedSubjectIds.includes(item.code) ? 'border-success bg-emerald' : '',
                !isEditMode && selectedSubjectId === item.code ? 'border-primary bg-surface-light' : ''
              ]"
              @click="isEditMode ? toggleSubjectCompletion(item) : selectSubject(item.id)"
            >
              <div class="d-flex justify-space-between align-center flex-wrap gap-2">
                <div class="d-flex align-center gap-2">
                  <v-chip size="small" :color="getStatusConfig(getSubjectStatus(item)).color" variant="flat" class="font-weight-bold">
                    <v-icon :icon="getStatusConfig(getSubjectStatus(item)).icon" start size="14"></v-icon>
                    {{ getStatusConfig(getSubjectStatus(item)).badge }}
                  </v-chip>
                  <span class="font-weight-bold text-subtitle-1 text-primary">{{ item.code }}</span>
                </div>
                <v-chip size="small" variant="tonal" color="secondary" class="font-weight-bold">
                  {{ item.credits }} créditos
                </v-chip>
              </div>

              <div class="font-weight-bold text-h6">{{ item.name }}</div>

              <div v-if="item.prerequisites && item.prerequisites.length > 0" class="text-caption text-medium-emphasis d-flex align-center flex-wrap gap-1 mt-1">
                <v-icon size="14" class="mr-1">mdi-link</v-icon>
                <strong>Pré-requisitos:</strong>
                <v-chip v-for="req in item.prerequisites" :key="req" size="x-small" variant="outlined" class="font-weight-medium">
                  {{ req }}
                </v-chip>
              </div>

              <!-- Indicador visual de clique no Modo Edição -->
              <div v-if="isEditMode" class="d-flex align-center justify-end mt-2">
                <v-btn
                  size="small"
                  :color="tempCompletedSubjectIds.includes(item.code) ? 'error' : 'success'"
                  variant="tonal"
                  class="font-weight-bold text-none"
                  :prepend-icon="tempCompletedSubjectIds.includes(item.code) ? 'mdi-close' : 'mdi-check'"
                >
                  {{ tempCompletedSubjectIds.includes(item.code) ? 'Desmarcar Conclusão' : 'Marcar como Concluída' }}
                </v-btn>
              </div>
            </v-card>
          </div>
          <div v-else class="text-center pa-8 border rounded-xl bg-surface-light text-medium-emphasis">
            <v-icon icon="mdi-school-outline" size="40" class="mb-2"></v-icon>
            <div class="font-weight-bold text-body-1">Nenhuma disciplina cadastrada para o {{ selectedSemesterTab }}º semestre.</div>
          </div>
        </v-card>

        <!-- Viewport 2D (Grade Canvas Original) -->
        <v-card v-else class="canvas-viewport fill-height rounded-xl overflow-hidden d-flex" elevation="2">
          
          <!-- Viewport (Área visível) -->
          <div 
            ref="viewportRef"
            class="viewport-container flex-grow-1 relative"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseUp"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @wheel="onWheel"
            @click="clearSelection"
          >
            <!-- Dica flutuante -->
            <div 
              v-if="!isEditMode" 
              class="floating-tip px-3 py-1.5 rounded-lg text-caption font-weight-medium shadow-premium"
            >
              <v-icon size="14" class="mr-1">mdi-gesture-tap</v-icon>
              Dica: Clique em uma disciplina para ver conexões. Arraste para mover, scroll para Zoom.
            </div>

            <!-- Active Edit Mode Banner -->
            <div 
              v-else 
              class="floating-edit-banner px-4 py-2 rounded-lg text-caption font-weight-bold shadow-premium bg-warning-suttle border-warning"
            >
              <v-icon size="16" color="warning" class="mr-2 animate-pulse">mdi-pencil-circle</v-icon>
              Modo Edição Ativo: Clique nas disciplinas para marcar/desmarcar como concluídas. Não esqueça de Salvar!
            </div>


            <!-- Canvas (Infinite Surface with Transform) -->
            <div 
              class="canvas-background"
              :style="{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`
              }"
            >
              <!-- Background Dotted Grid -->
              <div class="canvas-grid"></div>

              <!-- Connections Layer (SVG) -->
              <svg class="svg-connections-layer" :width="canvasWidth" :height="canvasHeight">
                <defs>
                  <!-- Seta direcional padrão -->
                  <marker
                    id="arrow-default"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#9E9E9E" />
                  </marker>
                  <!-- Seta direcional destacada (Active) -->
                  <marker
                    id="arrow-active"
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--v-theme-primary))" />
                  </marker>
                </defs>

                <!-- Linhas ativas (Destaques ao selecionar) -->
                <path
                  v-for="conn in activeConnectionPaths"
                  :key="`fg-${conn.id}`"
                  :d="conn.path"
                  fill="none"
                  stroke="rgb(var(--v-theme-primary))"
                  stroke-width="3"
                  class="active-path"
                  marker-end="url(#arrow-active)"
                />
              </svg>

              <!-- Semester Column Headers -->
              <div
                v-for="s in maxSemester"
                :key="`head-${s}`"
                class="semester-header text-uppercase font-weight-bold text-primary"
                :style="{
                  left: `${(s - 1) * columnStride + marginX}px`,
                  top: `${marginY - 50}px`,
                  width: `${columnWidth}px`
                }"
              >
                {{ s }}º Semestre
              </div>

              <!-- Subject Cards (Grid Nodes) -->
              <div
                v-for="s in subjectsWithCoords"
                :key="s.id"
                class="subject-card-wrapper"
                :class="{
                  'is-dimmed': s.isDimmed,
                  'is-highlighted': s.isHighlighted || selectedSubjectId === s.id
                }"
                :style="{
                  left: `${s.x}px`,
                  top: `${s.y}px`,
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`
                }"
                @click.stop="isEditMode ? toggleSubjectCompletion(s) : selectSubject(s.id)"
              >
                <!-- Vuetify Card -->
                <v-card
                  variant="outlined"
                  class="subject-inner-card d-flex flex-column justify-space-between text-left fill-height"
                  :class="[
                    (s.statusConfig || getStatusConfig(s.status)).borderClass, 
                    (s.statusConfig || getStatusConfig(s.status)).bg,
                    selectedSubjectId === s.id ? 'active-border' : ''
                  ]"
                  :style="{
                    borderColor: selectedSubjectId === s.id ? 'rgb(var(--v-theme-primary))' : (s.statusConfig || getStatusConfig(s.status)).border,
                    borderWidth: selectedSubjectId === s.id ? '3px' : '2px'
                  }"
                  elevation="0"
                >
                  <div class="px-3 pt-2 d-flex justify-space-between align-center">
                    <span class="text-caption font-weight-bold text-mono subject-code">{{ s.code }}</span>
                    <v-chip
                      size="x-small"
                      variant="flat"
                      :color="(s.statusConfig || getStatusConfig(s.status)).color"
                      class="font-weight-bold"
                    >
                      {{ (s.statusConfig || getStatusConfig(s.status)).badge }}
                    </v-chip>
                  </div>

                  <div class="px-3 py-1 flex-grow-1 d-flex align-center">
                    <span class="text-body-2 font-weight-medium line-clamp-2 leading-tight w-100 subject-title">
                      {{ s.name }}
                    </span>
                  </div>

                  <div class="px-3 pb-2 d-flex justify-space-between align-center border-top-thin">
                    <div class="d-flex align-center">
                      <v-icon size="14" class="mr-1 text-medium-emphasis subject-workload-icon">mdi-clock-outline</v-icon>
                      <span class="text-caption text-medium-emphasis subject-workload">{{ getWorkload(s) }}</span>
                    </div>
                    <div class="d-flex align-center">
                      <v-icon size="14" :color="(s.statusConfig || getStatusConfig(s.status)).color" class="mr-1">
                        {{ (s.statusConfig || getStatusConfig(s.status)).icon }}
                      </v-icon>
                      <span class="text-caption font-weight-bold subject-semester">{{ s.semester }}º Sem.</span>
                    </div>
                  </div>
                </v-card>

                <!-- Tooltip Interativa -->
                <v-tooltip
                  activator="parent"
                  location="top"
                  open-delay="200"
                  max-width="320"
                  :content-class="theme.global.name.value === 'dark' ? 'custom-node-tooltip tooltip-theme-dark' : 'custom-node-tooltip tooltip-theme-light'"
                  :theme="theme.global.name.value"
                >
                  <div class="pa-2">
                    <div class="text-subtitle-2 font-weight-bold border-bottom pb-1 mb-1">
                      {{ s.name }}
                    </div>
                    <div class="text-caption mb-1">
                      <strong>Código:</strong> {{ s.code }}
                    </div>
                    <div class="text-caption mb-1">
                      <strong>Semestre Recomendado:</strong> {{ s.semester }}º
                    </div>
                    <div class="text-caption mb-1">
                      <strong>Créditos:</strong> {{ s.credits || 4 }}
                    </div>
                    <div class="text-caption mb-1">
                      <strong>Carga Horária:</strong> {{ getWorkload(s) }}
                    </div>
                    <div class="text-caption">
                      <strong>Situação:</strong> 
                      <span :class="`text-${getStatusConfig(s.status).color} font-weight-bold`">&nbsp;{{ getStatusConfig(s.status).badge }}</span>
                    </div>

                    <div v-if="s.prerequisites && s.prerequisites.length" class="mt-2 pt-1 border-top-thin">
                      <div class="text-caption font-weight-bold mb-1">Pré-requisitos:</div>
                      <ul class="pl-4 text-caption">
                        <li v-for="prereq in s.prerequisites" :key="prereq">
                          {{ prereq }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </v-tooltip>
              </div>

            </div>

            <!-- MINI MAP CUSTOMIZADO (SVG Reativo) -->
            <div class="minimap-container shadow-premium d-none d-sm-block">
              <svg :width="180" :height="110" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`">
                <!-- Mini Rows (Displayed only under selection) -->
                <path
                  v-for="conn in activeConnectionPaths"
                  :key="`mini-${conn.id}`"
                  :d="conn.path"
                  fill="none"
                  stroke="rgb(var(--v-theme-primary))"
                  stroke-width="15"
                  opacity="1.0"
                />

                <!-- Mini Cards -->
                <rect
                  v-for="s in subjectsWithCoords"
                  :key="`mini-${s.id}`"
                  :x="s.x"
                  :y="s.y"
                  :width="cardWidth"
                  :height="cardHeight"
                  rx="20"
                  ry="20"
                  :fill="s.status === 'completed' ? '#4CAF50' : s.status === 'available' ? '#FBC02D' : '#F44336'"
                  :opacity="s.isDimmed ? 0.3 : 0.8"
                  :stroke="selectedSubjectId === s.id ? 'rgb(var(--v-theme-primary))' : 'none'"
                  :stroke-width="selectedSubjectId === s.id ? 20 : 0"
                />

                <!-- Visible Viewport Border -->
                <rect
                  :x="miniViewportRect.x"
                  :y="miniViewportRect.y"
                  :width="miniViewportRect.w"
                  :height="miniViewportRect.h"
                  fill="rgba(var(--v-theme-primary), 0.08)"
                  stroke="rgb(var(--v-theme-primary))"
                  stroke-width="12"
                  rx="10"
                  ry="10"
                />
              </svg>
            </div>

          </div>
        </v-card>
      </v-col>
    </v-row>
    <!-- Modal de Instruções para Importação do PDF / HTML -->
    <v-dialog v-model="showPdfModal" max-width="620">
      <v-card class="rounded-xl pa-6" elevation="10">
        <div class="d-flex align-center justify-space-between mb-4">
          <div class="d-flex align-center gap-3">
            <v-avatar color="red-darken-2" size="44">
              <v-icon color="white">mdi-file-document-outline</v-icon>
            </v-avatar>
            <div>
              <h3 class="text-h6 font-weight-bold mb-0">Importar Histórico do Curso</h3>
              <p class="text-caption text-medium-emphasis mb-0">Leitura automática de arquivo PDF ou HTML do Portal</p>
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="showPdfModal = false" />
        </div>

        <v-card variant="tonal" color="primary" class="pa-4 rounded-xl mb-4">
          <div class="text-caption font-weight-bold mb-1">QUAL ARQUIVO VOCÊ DEVE CARREGAR:</div>
          <p class="text-body-2 mb-2">
            Acesse o Portal de Serviços da UFRGS e vá na opção <strong>"Histórico do Curso"</strong>:
          </p>
          <div class="text-caption bg-surface pa-2 rounded mb-3 border font-weight-medium">
            <v-icon size="small" color="primary" class="mr-1">mdi-navigation</v-icon>
            Informações do aluno → Histórico do Curso
          </div>
          <div class="text-caption font-weight-bold mb-1">Você pode escolher qualquer uma de 2 opções:</div>
          <ul class="text-caption pl-4 mb-1">
            <li class="mb-1"><strong>Opção 1 (HTML - Recomendado):</strong> Na página aberta do Histórico do Curso, pressione <kbd>Ctrl + S</kbd> (ou <kbd>Cmd + S</kbd> no Mac) no seu navegador e salve no formato <em>"Página da Web, apenas HTML"</em> (ou <em>"Página da Web simples"</em>).</li>
            <li><strong>Opção 2 (PDF):</strong> Clique em Imprimir e salve como PDF. <em>Atenção: certifique-se de que o PDF gerado possui texto selecionável (PDFs salvos como imagem/digitalizados não funcionam)</em>.</li>
          </ul>
        </v-card>

        <v-alert type="info" variant="tonal" icon="mdi-shield-check-outline" class="mb-6 rounded-xl text-caption">
          <strong>Regras de Validação:</strong> O sistema considerará como concluídas as disciplinas com situação <em>"Aprovado"</em>, <em>"Liberação com crédito"</em> ou <em>"Liberação sem crédito"</em>. Disciplinas matriculadas, trancadas ou reprovadas serão ignoradas.
        </v-alert>

        <v-btn
          color="red-darken-2"
          variant="flat"
          size="large"
          rounded="xl"
          prepend-icon="mdi-upload"
          block
          @click="pdfInputRef.click(); showPdfModal = false"
        >
          Selecionar Arquivo (.html ou .pdf)
        </v-btn>
      </v-card>
    </v-dialog>

    <!-- Snackbar de Notificação nativo da UI -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="snackbar.timeout"
      location="bottom right"
      variant="flat"
      elevation="8"
      class="rounded-xl"
    >
      <div class="d-flex align-center font-weight-medium text-body-2">
        <v-icon :icon="snackbar.color === 'success' ? 'mdi-check-circle' : 'mdi-alert-circle'" class="mr-2" size="large"></v-icon>
        {{ snackbar.text }}
      </div>
      <template v-slot:actions>
        <v-btn variant="text" size="small" class="font-weight-bold" @click="snackbar.show = false">Fechar</v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.fill-height {
  height: 100% !important;
}

.relative {
  position: relative;
}

.shadow-premium {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05) !important;
}

.gap-4 {
  gap: 16px;
}

/* Viewport and Canvas Styles */
.canvas-viewport {
  border: 1px solid rgba(var(--v-border-color), 0.1);
  height: 650px !important;
  min-height: 500px;
}

.viewport-container {
  width: 100%;
  height: 100%;
  background-color: rgb(var(--v-theme-background));
  overflow: hidden;
  cursor: grab;
}

.canvas-background {
  position: absolute;
  transform-origin: 0 0;
  will-change: transform;
  contain: layout style;
}

/* Dotted Grid in CSS */
.canvas-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: radial-gradient(rgba(var(--v-border-color), 0.15) 1.5px, transparent 1.5px);
  background-size: 24px 24px;
  pointer-events: none;
}

.svg-connections-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

/* Estilo dos cabeçalhos dos semestres */
.semester-header {
  position: absolute;
  text-align: center;
  font-size: 1.1rem;
  letter-spacing: 1px;
  border-bottom: 2px solid rgba(var(--v-theme-primary), 0.2);
  padding-bottom: 8px;
  pointer-events: none;
  color: rgb(var(--v-theme-primary)) !important;
}

/* Posicionamento Absoluto dos Cards */
.subject-card-wrapper {
  position: absolute;
  z-index: 2;
  will-change: transform, opacity;
  transition: opacity 0.3s ease, transform 0.2s ease, filter 0.3s ease;
}

.subject-card-wrapper:hover {
  transform: scale(1.03);
  z-index: 10 !important;
}

.subject-inner-card {
  border-radius: 12px !important;
  background-color: rgb(var(--v-theme-surface)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  border-width: 2px !important;
  transition: all 0.25s ease;
  overflow: hidden;
}

/* Status and Highlight Modifiers */
.is-dimmed {
  opacity: 0.35;
  filter: grayscale(40%) blur(0.2px);
}

.is-highlighted {
  transform: scale(1.02);
  z-index: 8 !important;
}

/* Subtle Background Modifiers */
.bg-emerald {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, rgba(76, 175, 80, 0.02) 100%) !important;
}
.bg-amber {
  background: linear-gradient(135deg, rgba(251, 192, 45, 0.05) 0%, rgba(251, 192, 45, 0.02) 100%) !important;
}
.bg-error-suttle {
  background: linear-gradient(135deg, rgba(244, 67, 54, 0.05) 0%, rgba(244, 67, 54, 0.02) 100%) !important;
}

/* Glow effect for active elements */
.active-border {
  box-shadow: 0 0 12px rgba(var(--v-theme-primary), 0.4) !important;
}

.is-highlighted .subject-inner-card {
  box-shadow: 0 4px 15px rgba(var(--v-theme-primary), 0.1) !important;
}

/* Active Arrow with Dashed Animation */
.active-path {
  stroke-dasharray: 8;
  animation: dash 20s linear infinite;
  filter: drop-shadow(0px 0px 3px rgba(var(--v-theme-primary), 0.5));
}

@keyframes dash {
  to {
    stroke-dashoffset: -1000;
  }
}

/* Legend elements */
.legend-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 4px;
}

.legend-completed {
  background-color: #4CAF50;
  box-shadow: 0 0 5px rgba(76, 175, 80, 0.4);
}

.legend-available {
  background-color: #FBC02D;
  box-shadow: 0 0 5px rgba(251, 192, 45, 0.4);
}

.legend-blocked {
  background-color: #F44336;
  box-shadow: 0 0 5px rgba(244, 67, 54, 0.4);
}

/* Tipografia Monospace e Limitadores */
.text-mono {
  font-family: 'Courier New', Courier, monospace;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.leading-tight {
  line-height: 1.25;
}

.border-top-thin {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Dica flutuante */
.floating-tip {
  position: absolute;
  top: 16px;
  left: 16px;
  background-color: rgba(var(--v-theme-surface), 0.85);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--v-border-color), 0.15);
  z-index: 5;
  pointer-events: none;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.border-bottom {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.15);
}

/* MiniMap */
.minimap-container {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 180px;
  height: 110px;
  background-color: rgba(var(--v-theme-surface), 0.85) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--v-border-color), 0.15);
  border-radius: 12px;
  z-index: 10;
  overflow: hidden;
  pointer-events: none;
}
/* Edit Mode Banner */
.floating-edit-banner {
  position: absolute;
  top: 16px;
  left: 16px;
  background-color: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(10px);
  border: 2px solid rgb(var(--v-theme-warning));
  z-index: 5;
  color: rgb(var(--v-theme-on-surface));
  display: flex;
  align-items: center;
}

.bg-warning-suttle {
  background: linear-gradient(135deg, rgba(var(--v-theme-warning), 0.1) 0%, rgba(var(--v-theme-warning), 0.05) 100%) !important;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>


<style>
/* Global Tooltip Styles (to work with Teleport/v-overlay) */
.tooltip-theme-dark {
  backdrop-filter: blur(8px) !important;
  background-color: rgba(30, 30, 30, 0.98) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
}

.tooltip-theme-dark *:not(.text-success):not(.text-warning):not(.text-error):not(.text-info):not(.text-grey) {
  color: #ffffff !important;
}

.tooltip-theme-light {
  backdrop-filter: blur(8px) !important;
  background-color: rgba(255, 255, 255, 0.98) !important;
  color: #000000 !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1) !important;
}

.tooltip-theme-light *:not(.text-success):not(.text-warning):not(.text-error):not(.text-info):not(.text-grey) {
  color: #000000 !important;
}

/* Theme-specific font colors for subjects */
.v-theme--dark .subject-inner-card .subject-code,
.v-theme--dark .subject-inner-card .subject-title,
.v-theme--dark .subject-inner-card .subject-semester {
  color: #ffffff !important;
}

.v-theme--dark .subject-inner-card .subject-workload,
.v-theme--dark .subject-inner-card .subject-workload-icon {
  color: rgba(255, 255, 255, 0.7) !important;
}

.v-theme--light .subject-inner-card .subject-code,
.v-theme--light .subject-inner-card .subject-title,
.v-theme--light .subject-inner-card .subject-semester {
  color: #000000 !important;
}

.v-theme--light .subject-inner-card .subject-workload,
.v-theme--light .subject-inner-card .subject-workload-icon {
  color: rgba(0, 0, 0, 0.6) !important;
}
</style>
