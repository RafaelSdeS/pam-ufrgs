<script setup>
import { onMounted, ref, computed, reactive, watch } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { dataService, escapeHtml } from './services/dataService'
import { scheduleGeneratorService } from './services/scheduleGeneratorService'
import { curriculumService } from './services/curriculumService'
import ElectiveSuggestionsModal from './components/ElectiveSuggestionsModal.vue'

const theme = useTheme()
const { mobile } = useDisplay()

const scheduleViewMode = ref(mobile.value ? 'timeline' : 'grid')
const selectedTimelineDay = ref(1) // Segunda

watch(() => mobile.value, (val) => {
  scheduleViewMode.value = val ? 'timeline' : 'grid'
})

const props = defineProps({
  studentId: {
    type: Number,
    required: true
  },
  semester: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['back'])

const allScheduleOptions = ref([])
const fixedSections = ref({})
const filterInterCampus = ref(true)
const loading = ref(false)
const error = ref('')
const conflictReasons = ref([])
const unavailableReasons = ref([])
const restrictedReasons = ref([])

const extractCampus = (roomStr) => {
  if (!roomStr || typeof roomStr !== 'string') return 'Não Informado'
  const match = roomStr.match(/Campus:\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)/i)
  if (match && match[1]) {
    const raw = match[1].trim()
    if (raw.toLowerCase().includes('centro')) return 'Centro'
    if (raw.toLowerCase().includes('vale')) return 'Vale'
    if (raw.toLowerCase().includes('saude') || raw.toLowerCase().includes('saúde')) return 'Saúde'
    return raw
  }
  return 'Não Informado'
}

const getCampusColor = (campus, isConflict) => {
  if (isConflict) return 'error'
  switch (campus) {
    case 'Centro': return 'primary'
    case 'Vale': return 'success'
    case 'Saúde': return 'purple'
    default: return 'warning'
  }
}

const hasInterCampusConflict = (items) => {
  if (!items || !Array.isArray(items)) return false
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      if (a.day_of_week === b.day_of_week) {
        const startA = convertTimeToMinutes(a.start_time)
        const endA = convertTimeToMinutes(a.end_time)
        const startB = convertTimeToMinutes(b.start_time)
        const endB = convertTimeToMinutes(b.end_time)
        
        let gap = Infinity
        if (endA <= startB) gap = startB - endA
        else if (endB <= startA) gap = startA - endB
        
        if (gap < 60 && a.campus && b.campus &&
            a.campus !== 'Não Informado' && b.campus !== 'Não Informado' &&
            a.campus !== b.campus) {
          return true
        }
      }
    }
  }
  return false
}

const hasCampusWarning = (items, targetItem) => {
  if (!targetItem || targetItem.campus !== 'Não Informado') return false
  return (items || []).some(other => {
    if (other === targetItem || other.day_of_week !== targetItem.day_of_week) return false
    const startTarget = convertTimeToMinutes(targetItem.start_time)
    const endTarget = convertTimeToMinutes(targetItem.end_time)
    const startOther = convertTimeToMinutes(other.start_time)
    const endOther = convertTimeToMinutes(other.end_time)
    let gap = Infinity
    if (endTarget <= startOther) gap = startOther - endTarget
    else if (endOther <= startTarget) gap = startTarget - endOther
    return gap < 60
  })
}

const scheduleOptions = computed(() => {
  const fixedEntries = Object.entries(fixedSections.value || {})
  let list = allScheduleOptions.value || []

  if (fixedEntries.length > 0) {
    list = list.filter(option => {
      return fixedEntries.every(([courseCode, secCode]) => {
        return option.items?.some(it => it.course_code === courseCode && it.section_code === secCode)
      })
    })
  }

  if (filterInterCampus.value) {
    list = list.filter(option => !hasInterCampusConflict(option.items))
  }

  return list
})

const availableCoursesInSchedules = computed(() => {
  const map = {}
  ;(allScheduleOptions.value || []).forEach(opt => {
    if (!opt || !opt.items) return
    opt.items.forEach(it => {
      if (!map[it.course_code]) {
        map[it.course_code] = {
          code: it.course_code,
          name: it.course_name
        }
      }
    })
  })
  return Object.values(map).sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code))
})

const getAvailableSectionsForCourse = (courseCode) => {
  const sectionsMap = {}
  ;(allScheduleOptions.value || []).forEach(opt => {
    if (!opt || !opt.items) return
    opt.items.forEach(it => {
      if (it.course_code === courseCode) {
        sectionsMap[it.section_code] = {
          section_code: it.section_code,
          professor_name: it.professor_name || 'Prof. Não informado',
          capacity: it.capacity,
          capacity_by_curriculum: it.capacity_by_curriculum
        }
      }
    })
  })
  return Object.values(sectionsMap).sort((a, b) => a.section_code.localeCompare(b.section_code))
}

const setFixedSection = (courseCode, sectionCode) => {
  if (!sectionCode) {
    delete fixedSections.value[courseCode]
  } else {
    fixedSections.value[courseCode] = sectionCode
  }
}

const clearFixedSections = () => {
  fixedSections.value = {}
}

const togglePinSection = (courseCode, sectionCode) => {
  if (fixedSections.value[courseCode] === sectionCode) {
    delete fixedSections.value[courseCode]
  } else {
    fixedSections.value[courseCode] = sectionCode
  }
}

// Calendar scale configurations (Google Calendar style)
const SCALE_Y = 1.2 // 1.2px per minute
const HOUR_HEIGHT = 60 * SCALE_Y // 72px per hour

const dayOrder = {
  'Segunda-feira': 1,
  'Terça-feira': 2,
  'Quarta-feira': 3,
  'Quinta-feira': 4,
  'Sexta-feira': 5,
  'Sábado': 6,
  'Domingo': 7,
}

const formatRoom = (room) => {
  if (!room) return ''
  let cleaned = room.normalize('NFC')
    .replace(/SALA DE AULA/gi, 'Sala')
    .replace(/\s*(?:-|-)?\s*Campus:\s*[^\s-].*$/i, '')
    .replace(/\s*(?:-|-)?\s*Campus\s+(?:do\s+Vale|Centro|da\s+Sa[uú]de|Litoral\s+Norte|Olhos\s+d['']?Água|EAD|Outros).*$/i, '')
    .trim()
  return cleaned.replace(/^[-\s]+|[-\s]+$/g, '')
}

const convertTimeToMinutes = (hora) => {
  if (!hora || typeof hora !== 'string') {
    return 0
  }
  const [horas, minutos] = hora.split(':').map(Number)
  return (horas * 60) + (minutos || 0)
}

const normalizeDay = (raw) => {
  if (raw === null || raw === undefined) return '—'
  if (typeof raw === 'number') {
    const num = raw
    const mapNum = {
      1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo', 0: 'Domingo'
    }
    return mapNum[num] || String(raw)
  }
  const s = String(raw).trim().toLowerCase()
  if (!s) return '—'
  if (/^mon|segunda/.test(s)) return 'Segunda-feira'
  if (/^tue|terc/.test(s)) return 'Terça-feira'
  if (/^wed|qua/.test(s)) return 'Quarta-feira'
  if (/^thu|qui/.test(s)) return 'Quinta-feira'
  if (/^fri|sex|sexta/.test(s)) return 'Sexta-feira'
  if (/^sat|sab/.test(s)) return 'Sábado'
  if (/^sun|dom/.test(s)) return 'Domingo'
  return String(raw)
}

const daysArray = Object.keys(dayOrder)
  .filter(d => d !== 'Domingo' && d !== 'Sábado')
  .map(d => ({ name: d, index: dayOrder[d] }))
  .sort((a, b) => a.index - b.index)

const sortSchedule = (schedule) => {
  return [...schedule].sort((a, b) => {
    const dayOrderA = dayOrder[a.day_of_week] || 999
    const dayOrderB = dayOrder[b.day_of_week] || 999

    if (dayOrderA !== dayOrderB) {
      return dayOrderA - dayOrderB
    }

    return convertTimeToMinutes(a.start_time) - convertTimeToMinutes(b.start_time)
  })
}

const isElectiveItem = (item) => {
  if (!item) return false
  if (item.is_elective !== undefined) return Boolean(item.is_elective)
  const selectedCourseCode = curriculumService.getSelectedCourse() || 'CIC'
  const courseSubjects = curriculumService.getCurriculumSubjects(selectedCourseCode)
  const courseCodesSet = new Set(courseSubjects.map(s => s.code))
  return !courseCodesSet.has(item.course_code)
}

// Returns absolute coordinates and dimensions in pixels for the card, using the option's dynamic startHour
const getCardStyle = (item, startHour) => {
  const start = convertTimeToMinutes(item.start_time)
  const end = convertTimeToMinutes(item.end_time)
  const duration = Math.max(0, end - start)
  
  const startMinutes = startHour * 60
  const top = (start - startMinutes) * SCALE_Y
  const height = (duration * SCALE_Y) - 6 // Small visual gap for consecutive cards
  
  return {
    top: `${top}px`,
    height: `${height}px`,
    position: 'absolute',
    left: '4px',
    right: '4px',
    zIndex: 10
  }
}

// Checks if the current class has a schedule conflict with any other class
const getCellConflict = (items, currentItem) => {
  const currentStart = convertTimeToMinutes(currentItem.start_time)
  const currentEnd = convertTimeToMinutes(currentItem.end_time)
  
  return items.some(other => {
    // Skip comparison with itself
    if (other.id === currentItem.id || (other.course_code === currentItem.course_code && other.start_time === currentItem.start_time)) {
      return false
    }
    
    // Same column/day of the week
    if (normalizeDay(other.day_of_week) !== normalizeDay(currentItem.day_of_week)) {
      return false
    }
    
    const otherStart = convertTimeToMinutes(other.start_time)
    const otherEnd = convertTimeToMinutes(other.end_time)
    
    // Check overlap
    return currentStart < otherEnd && otherStart < currentEnd
  })
}

const loadSchedules = async () => {
  loading.value = true
  error.value = ''
  conflictReasons.value = []
  unavailableReasons.value = []
  restrictedReasons.value = []
  compareSelection.value = []

  try {
    const selectedCourses = dataService.getDesiredCourses()
    const restrictions = dataService.getRestrictions()
    const selectedCourseCode = curriculumService.getSelectedCourse() || 'CIC'
    const courseSubjects = curriculumService.getCurriculumSubjects(selectedCourseCode)
    const courseCodesSet = new Set(courseSubjects.map(s => s.code))

    const selectedCourseCodesSet = new Set((selectedCourses || []).map(c => c.code || c.id || c))
    const allTurmas = dataService.getTurmas()
    const turmas = allTurmas.filter(t => {
      const semMatch = t.semester === '2026/2'
      const isSelected = selectedCourseCodesSet.has(t.course_code) || selectedCourseCodesSet.has(t.course_id)
      const disciplineMatch = isSelected || courseCodesSet.has(t.course_code) || courseCodesSet.has(t.course_id)
      const currMatch = curriculumService.matchesSelectedCurriculum(t.curriculums, selectedCourseCode)
      return semMatch && disciplineMatch && currMatch
    })
    const allCourses = dataService.getAllCourses()
    const courseNameMap = {}
    allCourses.forEach(c => {
      if (c.code) courseNameMap[c.code] = c.name
      if (c.id) courseNameMap[c.id] = c.name
    })

    const raw = scheduleGeneratorService.generateRankedSchedules({
      selectedCourses,
      restrictions,
      turmas,
      limit: 200
    })
    if (raw.length === 0) {
      // Códigos com turma neste período só do OUTRO currículo - separa "sem turma cadastrada em
      // lugar nenhum" (normal pra semestre futuro) de "turma existe mas restrita ao outro
      // currículo" (situação real do período atual, vale conferir no Portal do Aluno).
      const otherCourseCode = curriculumService.normalizeCurriculumCode(selectedCourseCode) === 'ECP' ? 'CIC' : 'ECP'
      const otherCurriculumCodes = new Set(
        dataService.getTurmas(otherCourseCode)
          .filter(t => t.semester === '2026/2')
          .map(t => (t.course_code || t.course_id || '').toUpperCase())
      )
      const diag = scheduleGeneratorService.diagnoseConflicts(selectedCourses, turmas, restrictions, otherCurriculumCodes)
      conflictReasons.value = diag.conflictReasons
      unavailableReasons.value = diag.unavailableReasons
      restrictedReasons.value = diag.restrictedReasons
    }
    allScheduleOptions.value = raw.map((option, gi) => {
      const flatItems = []
      if (Array.isArray(option.schedule)) {
        option.schedule.forEach(section => {
          if (Array.isArray(section.schedules)) {
            section.schedules.forEach(sched => {
              flatItems.push({
                id: sched.id,
                section_id: section.section_id || section.id || (section.course_code + '_' + section.section_code),
                section_code: section.section_code,
                course_name: section.course_name || courseNameMap[section.course_code] || section.course_code,
                course_code: section.course_code,
                professor_name: section.professor_name,
                day_of_week: sched.day_of_week,
                start_time: sched.start_time,
                end_time: sched.end_time,
                room: sched.room,
                campus: extractCampus(sched.room),
                is_elective: !courseCodesSet.has(section.course_code) || section.is_elective === true || section.natureza === 'Eletiva',
                capacity: section.capacity,
                capacity_by_curriculum: section.capacity_by_curriculum,
                curriculums: section.curriculums,
                all_schedules: section.schedules.map(s => ({
                  day_of_week: normalizeDay(s.day_of_week),
                  start_time: s.start_time,
                  end_time: s.end_time,
                  room: s.room,
                  campus: extractCampus(s.room)
                }))
              })
            })
          }
        })
      }
      
      const sortedItems = sortSchedule(flatItems)
      
      // Find the minimum start time and maximum end time for this specific option
      let minStartMin = Infinity
      let maxEndMin = -Infinity
      
      sortedItems.forEach(item => {
        const start = convertTimeToMinutes(item.start_time)
        const end = convertTimeToMinutes(item.end_time)
        if (start < minStartMin) minStartMin = start
        if (end > maxEndMin) maxEndMin = end
      })
      
      // Dynamic definitions of schedules with margins
      let startHour = 8
      let endHour = 22
      
      if (minStartMin !== Infinity && maxEndMin !== -Infinity) {
        // Exact schedules rounded to the nearest hour (without a 1-hour margin)
        startHour = Math.max(0, Math.floor(minStartMin / 60))
        endHour = Math.min(23, Math.ceil(maxEndMin / 60))
      }
      
      // Group classes by day of the week
      const groupedByDay = {}
      daysArray.forEach(dia => {
        groupedByDay[dia.index] = []
      })
      
      sortedItems.forEach(item => {
        const rawDay = item.day_of_week
        const normalized = normalizeDay(rawDay)
        const dayIndex = dayOrder[normalized] || null
        if (dayIndex && groupedByDay[dayIndex]) {
          groupedByDay[dayIndex].push(item)
        }
      })
      
      return {
        items: sortedItems,
        groupedByDay,
        startHour,
        endHour,
        totalHeight: (endHour - startHour + 1) * HOUR_HEIGHT,
        score: option.score,
        selected_course_count: option.selected_course_count,
        total_course_priority: option.total_course_priority,
        matched_preference_count: option.matched_preference_count
      }
    })
  } catch (err) {
    console.error('Erro ao gerar grades:', err)
    const detalhe = err?.response?.data || err?.message || String(err)
    error.value = typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)
    allScheduleOptions.value = []
  } finally {
    loading.value = false
  }
}

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

const electivesModalRef = ref(null)

const saveScheduleOption = (gradeObj, scheduleIndex) => {
  const saved = dataService.getSavedSchedules()
  const count = gradeObj.selected_course_count || (gradeObj.items ? new Set(gradeObj.items.map(i => i.course_code || i.course_id)).size : 0)
  const name = `Grade #${scheduleIndex + 1} (${count} disciplina${count === 1 ? '' : 's'}) - ${new Date().toLocaleDateString('pt-BR')}`
  
  const newSchedule = {
    id: Date.now() + Math.random(),
    name,
    createdAt: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(gradeObj.items || [])),
    groupedByDay: JSON.parse(JSON.stringify(gradeObj.groupedByDay || {})),
    startHour: gradeObj.startHour || 8,
    endHour: gradeObj.endHour || 22,
    totalHeight: gradeObj.totalHeight || 840,
    score: gradeObj.score || 0,
    selected_course_count: count
  }
  saved.push(newSchedule)
  dataService.saveSavedSchedules(saved)
  showSnackbar(`Grade "${name}" salva com sucesso em 'Grades Salvas'!`, 'success')
}

const openElectivesModal = (gradeObj) => {
  const turmas = dataService.getTurmas()
  const restrictions = dataService.getRestrictions()
  electivesModalRef.value?.open(gradeObj, turmas, restrictions, { isSaved: false })
}

const onAddElectiveSection = ({ gradeObj, section, course }) => {
  if (!gradeObj || !section) return
  const newGrade = JSON.parse(JSON.stringify(gradeObj))
  if (!newGrade.items) newGrade.items = []

  const allCourses = dataService.getAllCourses()
  const courseNameMap = {}
  allCourses.forEach(c => {
    if (c.code) courseNameMap[c.code] = c.name
    if (c.id) courseNameMap[c.id] = c.name
  })

  if (Array.isArray(section.schedules)) {
    section.schedules.forEach(sched => {
      newGrade.items.push({
        id: sched.id || (Date.now() + Math.random()),
        section_id: section.section_id || section.id,
        section_code: section.section_code || section.section_id,
        course_name: course.name || section.course_name || courseNameMap[section.course_code] || section.course_code,
        course_code: section.course_code || course.code,
        professor_name: section.professor_name,
        day_of_week: sched.day_of_week,
        start_time: sched.start_time,
        end_time: sched.end_time,
        room: sched.room,
        campus: extractCampus(sched.room),
        is_elective: true,
        capacity: section.capacity,
        capacity_by_curriculum: section.capacity_by_curriculum,
        curriculums: section.curriculums,
        all_schedules: section.schedules.map(s => ({
          day_of_week: normalizeDay(s.day_of_week),
          start_time: s.start_time,
          end_time: s.end_time,
          room: s.room,
          campus: extractCampus(s.room)
        }))
      })
    })
  }

  const sortedItems = sortSchedule(newGrade.items)
  newGrade.items = sortedItems

  let minStartMin = Infinity
  let maxEndMin = -Infinity
  sortedItems.forEach(item => {
    const start = convertTimeToMinutes(item.start_time)
    const end = convertTimeToMinutes(item.end_time)
    if (start < minStartMin) minStartMin = start
    if (end > maxEndMin) maxEndMin = end
  })

  let startHour = 8
  let endHour = 22
  if (minStartMin !== Infinity && maxEndMin !== -Infinity) {
    startHour = Math.max(0, Math.floor(minStartMin / 60))
    endHour = Math.min(23, Math.ceil(maxEndMin / 60))
  }

  const groupedByDay = {}
  daysArray.forEach(dia => {
    groupedByDay[dia.index] = []
  })
  sortedItems.forEach(item => {
    const rawDay = item.day_of_week
    const normalized = normalizeDay(rawDay)
    const dayIndex = dayOrder[normalized] || null
    if (dayIndex && groupedByDay[dayIndex]) {
      groupedByDay[dayIndex].push(item)
    }
  })

  newGrade.groupedByDay = groupedByDay
  newGrade.startHour = startHour
  newGrade.endHour = endHour
  newGrade.totalHeight = (endHour - startHour + 1) * HOUR_HEIGHT
  const count = new Set(sortedItems.map(i => i.course_code || i.course_id)).size
  newGrade.selected_course_count = count

  const saved = dataService.getSavedSchedules()
  const name = `Grade (${count} disciplinas, incl. Eletiva ${course.code || ''}) - ${new Date().toLocaleDateString('pt-BR')}`
  const newSchedule = {
    id: Date.now() + Math.random(),
    name,
    createdAt: new Date().toISOString(),
    items: newGrade.items,
    groupedByDay: newGrade.groupedByDay,
    startHour: newGrade.startHour,
    endHour: newGrade.endHour,
    totalHeight: newGrade.totalHeight,
    score: newGrade.score || 0,
    selected_course_count: count
  }
  saved.push(newSchedule)
  dataService.saveSavedSchedules(saved)
  showSnackbar(`Grade salva em 'Grades Salvas' com a eletiva "${course.code} - ${course.name}" adicionada!`, 'success')
}

const formatPrintRoom = (room) => {
  if (!room) return ''
  let cleaned = room.normalize('NFC')
    .replace(/SALA DE AULA/gi, 'Sala')
    .replace(/\s*(?:-|-)?\s*Campus:\s*[^\s-].*$/i, '')
    .replace(/\s*(?:-|-)?\s*Campus\s+(?:do\s+Vale|Centro|da\s+Sa[uú]de|Litoral\s+Norte|Olhos\s+d['']?Água|EAD|Outros).*$/i, '')
    .trim()
  if (cleaned.replace(/^[-\s]+|[-\s]+$/g, '').toLowerCase().startsWith('campus')) return ''
  return cleaned.replace(/^[-\s]+|[-\s]+$/g, '')
}

const exportToPDF = (gradeObj, scheduleIndex) => {
  const startHour = gradeObj.startHour || 8
  const endHour = gradeObj.endHour || 22
  const numHours = endHour - startHour + 1
  
  // A4 landscape height fits about ~620px for the grid after title bar
  const printHourHeight = Math.min(56, Math.max(36, Math.floor(620 / numHours)))
  const printScaleY = printHourHeight / 60
  const printTotalHeight = numHours * printHourHeight
  const semesterStr = gradeObj.semester || localStorage.getItem('ufrgs_selected_semester') || '2026/2'
  
  // 1. Generate the table rows for the summary (deduplicated across all courses and electives)
  const uniqueSectionsMap = new Map()
  gradeObj.items.forEach(item => {
    const key = item.section_id || (item.course_code + '_' + item.section_code)
    if (!uniqueSectionsMap.has(key)) {
      const allScheds = item.all_schedules && Array.isArray(item.all_schedules) && item.all_schedules.length > 0 
        ? item.all_schedules 
        : (gradeObj.items || []).filter(i => (i.section_id || (i.course_code + '_' + i.section_code)) === key)
      uniqueSectionsMap.set(key, {
        ...item,
        schedulesList: allScheds
      })
    }
  })

  let tableRows = ''
  uniqueSectionsMap.forEach(item => {
    // Unique list of schedule blocks for this course
    const timesList = (item.schedulesList || []).map(s => {
      const cleanRoom = escapeHtml(formatPrintRoom(s.room))
      return `${escapeHtml(s.day_of_week)} das ${s.start_time?.substring(0, 5)} às ${s.end_time?.substring(0, 5)}${cleanRoom ? ` (${cleanRoom})` : ''}`
    }).join('<br>')

    const obsText = item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id) || ''

    tableRows += `
      <tr>
        <td><strong>${escapeHtml(item.course_name || item.course_code)}</strong></td>
        <td>${escapeHtml(item.course_code)}</td>
        <td>${escapeHtml(item.section_code)}</td>
        <td>${item.professor_name ? escapeHtml(item.professor_name) : '—'}</td>
        <td>${timesList}</td>
        <td>${obsText ? escapeHtml(obsText).replace(/\n/g, '<br>') : '—'}</td>
      </tr>
    `
  })

  const getPrintPalette = (campus, isConflict) => {
    if (isConflict) {
      return { bg: '#ffebee', border: '#d32f2f', text: '#b71c1c' }
    }
    const str = (campus || '').toLowerCase()
    if (str.includes('centro')) {
      return { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' }
    } else if (str.includes('vale')) {
      return { bg: '#e8f5e9', border: '#388e3c', text: '#1b5e20' }
    } else if (str.includes('saúde') || str.includes('saude')) {
      return { bg: '#f3e5f5', border: '#8e24aa', text: '#4a148c' }
    }
    return { bg: '#fff3e0', border: '#f57c00', text: '#e65100' }
  }

  // 2. Generate the visual calendar days
  let calendarColumns = ''
  daysArray.forEach(dia => {
    let dayCards = ''
    const itemsForDay = gradeObj.groupedByDay[dia.index] || []
    
    itemsForDay.forEach(item => {
      const start = convertTimeToMinutes(item.start_time)
      const end = convertTimeToMinutes(item.end_time)
      const duration = Math.max(0, end - start)
      const startMinutes = startHour * 60
      const top = (start - startMinutes) * printScaleY
      const height = Math.max(26, (duration * printScaleY) - 3)
      const isConflict = getCellConflict(gradeObj.items, item)
      const isElective = isElectiveItem(item)
      const palette = getPrintPalette(item.campus, isConflict)
      const isShort = duration < 75
      const cleanRoom = escapeHtml(formatPrintRoom(item.room))
          const cap = dataService.getSectionCapacity(item, curriculumService.getSelectedCourse())
          const capHtml = cap !== null ? ` <span style="font-size: 0.9em; opacity: 0.9;">(👥 ${cap} vagas)</span>` : ''
          dayCards += `
        <div class="class-card ${isShort ? 'short-card' : ''} ${isConflict ? 'conflict' : ''} ${isElective ? 'elective-hatched' : ''}" style="top: ${top}px; height: ${height}px; background-color: ${palette.bg} !important; border-left: 4px solid ${palette.border} !important; color: ${palette.text} !important;">
          <div class="class-card-title ${isConflict ? 'conflict' : ''}" style="color: ${palette.text} !important;">${escapeHtml(item.course_name || item.course_code)}</div>
          <div class="class-card-details turma-details" style="color: ${palette.text} !important; opacity: 0.95;"><strong>Turma:</strong> ${escapeHtml(item.section_code)}${capHtml}</div>
          ${cleanRoom ? `<div class="class-card-details location-details" style="color: ${palette.text} !important; opacity: 0.9;">📍 ${cleanRoom}</div>` : ''}
          ${item.professor_name ? `<div class="class-card-details professor-details" style="color: ${palette.text} !important; opacity: 0.85;"><strong>Prof:</strong> ${escapeHtml(item.professor_name)}</div>` : ''}
        </div>
      `
    })

    calendarColumns += `
      <div class="day-column">
        ${dayCards}
      </div>
    `
  })

  // Collect unique start and end times where things begin/end
  const uniqueEventTimes = new Set()
  if (gradeObj.groupedByDay) {
    Object.values(gradeObj.groupedByDay).forEach(dayItems => {
      if (Array.isArray(dayItems)) {
        dayItems.forEach(item => {
          if (item.start_time) uniqueEventTimes.add(item.start_time.substring(0, 5))
          if (item.end_time) uniqueEventTimes.add(item.end_time.substring(0, 5))
        })
      }
    })
  }
  ;(gradeObj.items || []).forEach(item => {
    if (item.start_time) uniqueEventTimes.add(item.start_time.substring(0, 5))
    if (item.end_time) uniqueEventTimes.add(item.end_time.substring(0, 5))
    const list = item.all_schedules || item.schedules || []
    if (Array.isArray(list)) {
      list.forEach(s => {
        if (s.start_time) uniqueEventTimes.add(s.start_time.substring(0, 5))
        if (s.end_time) uniqueEventTimes.add(s.end_time.substring(0, 5))
      })
    }
  })
  const sortedEventTimes = Array.from(uniqueEventTimes)
    .filter(t => typeof t === 'string' && t.includes(':'))
    .sort((a, b) => convertTimeToMinutes(a) - convertTimeToMinutes(b))

  let eventMarkersHTML = ''
  let eventGridLinesHTML = ''
  let lastMarkerMin = -999
  sortedEventTimes.forEach(tStr => {
    const min = convertTimeToMinutes(tStr)
    if (min < startHour * 60 || min > (endHour + 1) * 60) return
    const top = (min - startHour * 60) * printScaleY
    const isCloseToPrevious = (min - lastMarkerMin) < 14
    lastMarkerMin = min

    const labelTransform = isCloseToPrevious ? 'translateY(-10%)' : 'translateY(-50%)'

    eventMarkersHTML += `
      <div class="event-time-marker" style="top: ${top}px;">
        <span class="event-time-label" style="transform: ${labelTransform};">${tStr}</span>
        <div class="event-time-tick"></div>
      </div>
    `
    if (min % 60 !== 0) {
      eventGridLinesHTML += `<div class="event-grid-line" style="top: ${top}px;"></div>`
    }
  })

  // 3. Generate background grid rows
  let gridRows = ''
  for (let h = startHour; h <= endHour; h++) {
    gridRows += `<div class="grid-hour-row" style="height: ${printHourHeight}px;"></div>`
  }
  gridRows += eventGridLinesHTML

  // 4. Generate time labels on the axis
  let timeLabels = ''
  for (let h = startHour; h <= endHour; h++) {
    const hMin = h * 60
    const isOverlappedByEvent = sortedEventTimes.some(t => {
      const min = convertTimeToMinutes(t)
      return Math.abs(min - hMin) < 14 && min !== hMin
    })
    const isExactEvent = sortedEventTimes.includes(`${String(h).padStart(2, '0')}:00`) || sortedEventTimes.includes(`${h}:00`)
    timeLabels += `
      <div class="time-label-container" style="height: ${printHourHeight}px;">
        <span class="time-label" style="${(isOverlappedByEvent || isExactEvent) ? 'visibility: hidden;' : ''}">${String(h).padStart(2, '0')}:00</span>
      </div>
    `
  }
  timeLabels += eventMarkersHTML

  // Build the complete HTML document
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Plano de Horário ${semesterStr}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 10mm;
        }
        body {
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #333;
          padding: 15px;
          margin: 0;
          background-color: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          border-bottom: 2px solid #1976d2;
          padding-bottom: 8px;
        }
        .header-bar h1 {
          font-size: 20px;
          color: #1976d2;
          margin: 0;
        }
        .color-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          color: #444;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
        }
        .legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          display: inline-block;
          border-left: 2.5px solid;
          box-sizing: border-box;
        }
        .swatch-centro {
          background-color: #e3f2fd !important;
          border-color: #1976d2 !important;
          color: #0d47a1 !important;
        }
        .swatch-vale {
          background-color: #e8f5e9 !important;
          border-color: #388e3c !important;
          color: #1b5e20 !important;
        }
        .swatch-saude {
          background-color: #f3e5f5 !important;
          border-color: #8e24aa !important;
          color: #4a148c !important;
        }
        .swatch-outros {
          background-color: #fff3e0 !important;
          border-color: #f57c00 !important;
          color: #e65100 !important;
        }
        .swatch-elective {
          background-color: #fff !important;
          border-color: #666 !important;
          background-image: repeating-linear-gradient(-45deg, #666, #666 1.5px, transparent 1.5px, transparent 4px) !important;
        }
        .print-btn {
          padding: 8px 16px;
          background-color: #1976d2;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }
        
        .calendar-container {
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background-color: #fff;
        }
        .calendar-header {
          display: flex;
          background-color: #f5f5f5 !important;
          font-weight: bold;
          border-bottom: 1px solid #e0e0e0;
        }
        .time-axis-header {
          width: 55px;
          border-right: 1px solid #e0e0e0;
          flex-shrink: 0;
        }
        .day-header-col {
          flex: 1;
          text-align: center;
          padding: 6px 4px;
          font-size: 11px;
          border-right: 1px solid #e0e0e0;
        }
        .day-header-col:last-child {
          border-right: none;
        }
        .calendar-body {
          display: flex;
          position: relative;
        }
        .time-axis {
          width: 58px;
          border-right: 1px solid #e0e0e0;
          background-color: #fafafa !important;
          flex-shrink: 0;
          position: relative;
        }
        .time-label-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-top: 2px;
          box-sizing: border-box;
          position: relative;
        }
        .time-label {
          font-size: 8.5px;
          font-weight: bold;
          color: #888;
        }
        .event-time-marker {
          position: absolute;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          transform: translateY(-50%);
          pointer-events: none;
          z-index: 4;
        }
        .event-time-label {
          font-size: 7.5px;
          font-weight: 700;
          color: #1976d2;
          background-color: #e3f2fd !important;
          padding: 1px 3.5px;
          border-radius: 3px;
          border: 0.5px solid #90caf9;
          margin-right: 2px;
          box-shadow: 0 0.5px 1.5px rgba(0,0,0,0.06);
          letter-spacing: -0.2px;
          line-height: 1.1;
        }
        .event-time-tick {
          width: 5px;
          height: 1.5px;
          background-color: #1976d2 !important;
        }
        .event-grid-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          border-top: 1px dotted rgba(25, 118, 210, 0.4);
          pointer-events: none;
          z-index: 1;
        }
        .grid-area {
          flex-grow: 1;
          position: relative;
        }
        .grid-lines-bg {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }
        .grid-hour-row {
          border-bottom: 1px dashed #e0e0e0;
          box-sizing: border-box;
        }
        .grid-hour-row:last-child {
          border-bottom: none;
        }
        .columns-container {
          display: flex;
          position: relative;
          width: 100%;
        }
        .day-column {
          flex: 1;
          position: relative;
          height: 100%;
          border-right: 1px solid #e0e0e0;
          box-sizing: border-box;
        }
        .day-column:last-child {
          border-right: none;
        }
        .class-card {
          position: absolute;
          left: 2.5px;
          right: 2.5px;
          border-radius: 4px;
          padding: 3.5px 5.5px;
          font-size: 9.5px;
          box-sizing: border-box;
          overflow: visible;
          line-height: 1.18;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          z-index: 2;
        }
        .class-card.short-card {
          padding: 2px 4px;
          font-size: 8.5px;
          line-height: 1.1;
          z-index: 5;
        }
        .class-card.elective-hatched::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: repeating-linear-gradient(
            -45deg,
            currentColor,
            currentColor 2px,
            transparent 2px,
            transparent 8px
          );
          opacity: 0.15;
          pointer-events: none;
          z-index: 1;
        }
        .class-card.elective-hatched {
          border-right: 1.5px dashed currentColor !important;
          border-top: 1.5px dashed currentColor !important;
          border-bottom: 1.5px dashed currentColor !important;
        }
        .class-card-title {
          font-weight: bold;
          font-size: 10px;
          margin-bottom: 2px;
          line-height: 1.15;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          position: relative;
          z-index: 2;
          flex-shrink: 0;
        }
        .class-card.short-card .class-card-title {
          font-size: 9px;
          margin-bottom: 1px;
          -webkit-line-clamp: 1;
        }
        .class-card-details {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 1px;
          line-height: 1.15;
          position: relative;
          z-index: 2;
          flex-shrink: 0;
        }
        .class-card.short-card .class-card-details {
          margin-top: 0px;
        }
        .class-card-details.location-details,
        .class-card-details.professor-details {
          white-space: normal;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .class-card.short-card .class-card-details.location-details,
        .class-card.short-card .class-card-details.professor-details {
          -webkit-line-clamp: 1;
        }
        
        .page-break {
          page-break-before: always;
          break-before: page;
          padding-top: 15px;
        }
        .summary-title {
          font-size: 16px;
          font-weight: bold;
          margin: 15px 0 10px 0;
          color: #1976d2;
        }
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }
        .summary-table th, .summary-table td {
          border: 1px solid #e0e0e0;
          padding: 8px 10px;
          text-align: left;
          font-size: 11px;
        }
        .summary-table th {
          background-color: #f5f5f5 !important;
          font-weight: bold;
        }
        
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header-bar">
        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <h1 style="margin: 0;">Plano de Horário ${semesterStr}</h1>
          <div class="color-legend">
            <span class="legend-item"><span class="legend-swatch swatch-centro"></span>Centro</span>
            <span class="legend-item"><span class="legend-swatch swatch-vale"></span>Vale</span>
            <span class="legend-item"><span class="legend-swatch swatch-saude"></span>Saúde</span>
            <span class="legend-item"><span class="legend-swatch swatch-outros"></span>Outros / EAD</span>
            ${gradeObj.items.some(i => isElectiveItem(i)) ? `<span class="legend-item"><span class="legend-swatch swatch-elective"></span>Eletiva</span>` : ''}
          </div>
        </div>
        <button class="print-btn no-print" onclick="window.print()">Imprimir PDF</button>
      </div>

      <div class="calendar-container">
        <div class="calendar-header">
          <div class="time-axis-header"></div>
          ${daysArray.map(d => `<div class="day-header-col">${d.name}</div>`).join('')}
        </div>
        <div class="calendar-body">
          <div class="time-axis">
            ${timeLabels}
          </div>
          <div class="grid-area">
            <div class="grid-lines-bg">
              ${gridRows}
            </div>
            <div class="columns-container" style="height: ${printTotalHeight}px;">
              ${calendarColumns}
            </div>
          </div>
        </div>
      </div>

      <div class="page-break">
        <div class="summary-title">Resumo das Disciplinas (${dataService.getScheduleTotalCredits(gradeObj.items)} créditos)</div>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Disciplina</th>
              <th>Código</th>
              <th>Turma</th>
              <th>Professor</th>
              <th>Horários e Salas</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
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

const icsDialogOpen = ref(false)
const icsDialogGrade = ref(null)
const icsStartDate = ref('')
const icsEndDate = ref('')
const icsError = ref('')

const openIcsDialog = (gradeObj) => {
  icsDialogGrade.value = gradeObj
  icsStartDate.value = ''
  icsEndDate.value = ''
  icsError.value = ''
  icsDialogOpen.value = true
}

const icsPad2 = n => String(n).padStart(2, '0')

const toIcsLocalDateTime = (date, hhmmss) => {
  const [h, m] = (hhmmss || '00:00:00').split(':').map(Number)
  return `${date.getFullYear()}${icsPad2(date.getMonth() + 1)}${icsPad2(date.getDate())}T${icsPad2(h)}${icsPad2(m || 0)}00`
}

const toIcsUtcStamp = (date) =>
  `${date.getUTCFullYear()}${icsPad2(date.getUTCMonth() + 1)}${icsPad2(date.getUTCDate())}T${icsPad2(date.getUTCHours())}${icsPad2(date.getUTCMinutes())}${icsPad2(date.getUTCSeconds())}Z`

// RFC 5545 pede escape de vírgula/ponto-e-vírgula/barra invertida em valores de texto.
const icsEscapeText = (str) => String(str || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n')

function confirmExportICS() {
  const gradeObj = icsDialogGrade.value
  icsError.value = ''
  if (!gradeObj || !icsStartDate.value || !icsEndDate.value) {
    icsError.value = 'Informe as duas datas.'
    return
  }
  const start = new Date(`${icsStartDate.value}T00:00:00`)
  const end = new Date(`${icsEndDate.value}T23:59:59`)
  if (end < start) {
    icsError.value = 'A data de fim precisa ser depois da data de início.'
    return
  }

  const untilStr = `${end.getFullYear()}${icsPad2(end.getMonth() + 1)}${icsPad2(end.getDate())}T235959`
  const dtstamp = toIcsUtcStamp(new Date())

  // ponytail: sem line-folding de RFC 5545 (linhas <=75 octetos) - SUMMARY/LOCATION aqui são
  // curtos o bastante pra todo client testado aceitar sem folding; revisitar se algum campo
  // longo (ex: observação de turma) entrar nesses valores no futuro.
  const events = (gradeObj.items || []).map(item => {
    const isoWeekday = dayOrder[item.day_of_week]
    if (!isoWeekday || !item.start_time || !item.end_time) return null
    // Acha a 1ª ocorrência do dia da semana do item a partir da data de início, não importa
    // em que dia da semana a data de início caia.
    const jsWeekday = isoWeekday % 7 // dayOrder: 1=segunda..7=domingo; Date#getDay: 0=domingo..6=sábado
    const firstOccurrence = new Date(start)
    firstOccurrence.setDate(firstOccurrence.getDate() + ((jsWeekday - firstOccurrence.getDay() + 7) % 7))
    if (firstOccurrence > end) return null

    return [
      'BEGIN:VEVENT',
      `UID:${item.section_id || item.course_code}-${isoWeekday}-${item.start_time}@pam-ufrgs`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${toIcsLocalDateTime(firstOccurrence, item.start_time)}`,
      `DTEND:${toIcsLocalDateTime(firstOccurrence, item.end_time)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`,
      `SUMMARY:${icsEscapeText(`${item.course_name || item.course_code} (${item.course_code})`)}`,
      ...(formatRoom(item.room) ? [`LOCATION:${icsEscapeText(formatRoom(item.room))}`] : []),
      'END:VEVENT'
    ].join('\r\n')
  }).filter(Boolean)

  if (events.length === 0) {
    icsError.value = 'Nenhuma aula cai dentro do período informado.'
    return
  }

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAM UFRGS//Previsão de Horário//PT', ...events, 'END:VCALENDAR'].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'horario-pam-ufrgs.ics'
  a.click()
  URL.revokeObjectURL(url)

  icsDialogOpen.value = false
}

const compareSelection = ref([]) // até 2 gradeObj selecionados para comparação lado a lado
const compareDialogOpen = ref(false)

const isSelectedForCompare = (gradeObj) => compareSelection.value.includes(gradeObj)

function toggleCompareSelection(gradeObj) {
  if (isSelectedForCompare(gradeObj)) {
    compareSelection.value = compareSelection.value.filter(g => g !== gradeObj)
  } else if (compareSelection.value.length < 2) {
    compareSelection.value = [...compareSelection.value, gradeObj]
  }
}

onMounted(() => {
  loadSchedules()
})
</script>

<template>
  <v-container>
    <v-card class="mx-auto rounded-xl shadow-premium" elevation="2">
      <v-card-title class="text-h4 font-weight-bold pa-6 d-flex align-center justify-space-between border-bottom">
        <div class="d-flex align-center ga-3">
          <v-icon icon="mdi-calendar-multiple-check" color="primary" size="x-large"></v-icon>
          Grades de Horários Geradas
        </div>
        <v-btn color="primary" variant="outlined" class="rounded-lg" @click="emit('back')">
          Voltar
        </v-btn>
      </v-card-title>

      <v-card-text class="pa-6">
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4 rounded-lg">
          <div>{{ error }}</div>
          <v-btn color="error" variant="flat" class="mt-3 rounded-lg" @click="loadSchedules">Tentar novamente</v-btn>
        </v-alert>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4 rounded-lg" />

        <div v-if="!loading && allScheduleOptions.length === 0 && !error && conflictReasons.length > 0">
          <v-alert type="warning" variant="tonal" icon="mdi-alert-circle-outline" class="rounded-xl pa-5 border-thin">
            <div class="text-h6 font-weight-bold mb-2">Não foi possível gerar grades de horários</div>
            <div class="text-body-1 mb-3">
              Encontramos conflitos que impedem a combinação das disciplinas selecionadas:
            </div>
            <ul class="pl-5 mb-4">
              <li v-for="(reason, rIdx) in conflictReasons" :key="rIdx" class="mb-3 font-weight-medium text-body-1" style="white-space: pre-line;">
                {{ reason }}
              </li>
            </ul>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-left" class="text-none font-weight-bold rounded-lg" @click="$emit('back')">
              Voltar e Ajustar Disciplinas
            </v-btn>
          </v-alert>
        </div>

        <div v-else-if="!loading && allScheduleOptions.length === 0 && !error && (unavailableReasons.length > 0 || restrictedReasons.length > 0)">
          <v-alert v-if="unavailableReasons.length > 0" type="info" variant="tonal" icon="mdi-calendar-remove-outline" class="rounded-xl pa-5 border-thin mb-4">
            <div class="text-h6 font-weight-bold mb-2">Sem turma cadastrada para este período ainda</div>
            <div class="text-body-1 mb-3">
              Normal para semestres futuros - só existem turmas cadastradas para o período atual (2026/2). Não é um conflito de horário.
            </div>
            <ul class="pl-5" :class="restrictedReasons.length > 0 ? '' : 'mb-4'">
              <li v-for="(reason, rIdx) in unavailableReasons" :key="rIdx" class="mb-2 text-body-1" style="white-space: pre-line;">
                {{ reason }}
              </li>
            </ul>
          </v-alert>
          <v-alert v-if="restrictedReasons.length > 0" type="warning" variant="tonal" icon="mdi-account-alert-outline" class="rounded-xl pa-5 border-thin">
            <div class="text-h6 font-weight-bold mb-2">Turma existe, mas restrita a outro currículo</div>
            <div class="text-body-1 mb-3">
              Essas disciplinas têm turma aberta neste período, mas só para o outro currículo. Confirme no Portal do Aluno se também há vaga para o seu currículo:
            </div>
            <ul class="pl-5 mb-4">
              <li v-for="(reason, rIdx) in restrictedReasons" :key="rIdx" class="mb-2 text-body-1" style="white-space: pre-line;">
                {{ reason }}
              </li>
            </ul>
          </v-alert>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-arrow-left" class="text-none font-weight-bold rounded-lg mt-2" @click="$emit('back')">
            Voltar
          </v-btn>
        </div>

        <div v-else-if="!loading && allScheduleOptions.length > 0 && scheduleOptions.length === 0 && !error">
          <v-alert type="warning" variant="tonal" icon="mdi-filter-remove" class="rounded-xl pa-5 border-thin">
            <div class="text-h6 font-weight-bold mb-2">Nenhuma grade corresponde às turmas fixadas</div>
            <div class="text-body-1 mb-3">
              As turmas que você fixou possuem conflito de horário entre si ou não formam uma grade compatível.
            </div>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" class="text-none font-weight-bold rounded-lg" @click="clearFixedSections">
              Limpar Fixações de Turma
            </v-btn>
          </v-alert>
        </div>

        <div v-else-if="allScheduleOptions.length > 0">
          <!-- PAINEL FIXAR TURMAS (PÓS-FILTRO) -->
          <v-card variant="outlined" class="mb-6 rounded-xl border-thin bg-surface-light">
            <v-card-text class="pa-4">
              <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
                <div class="d-flex align-center ga-2 flex-wrap">
                  <v-icon color="primary" icon="mdi-pin-outline"></v-icon>
                  <span class="text-subtitle-1 font-weight-bold">Fixar Turmas para Filtrar Grades</span>
                  <v-chip size="small" color="primary" variant="tonal" class="ml-2 font-weight-bold">
                    Exibindo {{ scheduleOptions.length }} de {{ allScheduleOptions.length }} grades possíveis
                  </v-chip>
                  <v-chip v-if="scheduleOptions.length > 0" size="small" color="success" variant="tonal" class="font-weight-bold">
                    {{ dataService.getScheduleTotalCredits(scheduleOptions[0].items) }} créditos no total
                  </v-chip>
                </div>
                <v-btn
                  v-if="Object.keys(fixedSections).length > 0"
                  size="small"
                  color="error"
                  variant="text"
                  prepend-icon="mdi-close-circle-outline"
                  class="text-none font-weight-bold"
                  @click="clearFixedSections"
                >
                  Limpar turmas fixadas
                </v-btn>
              </div>

              <div class="d-flex flex-wrap ga-2">
                <v-menu v-for="course in availableCoursesInSchedules" :key="course.code">
                  <template v-slot:activator="{ props }">
                    <v-btn
                      v-bind="props"
                      size="small"
                      :color="fixedSections[course.code] ? 'primary' : 'default'"
                      :variant="fixedSections[course.code] ? 'flat' : 'outlined'"
                      class="text-none font-weight-medium rounded-lg"
                      prepend-icon="mdi-pin"
                      append-icon="mdi-chevron-down"
                    >
                      {{ course.name || course.code }}:
                      <strong class="ml-1">
                        {{ fixedSections[course.code] ? 'Turma ' + fixedSections[course.code] : 'Todas as Turmas' }}
                      </strong>
                    </v-btn>
                  </template>
                  <v-list class="rounded-lg elevation-3">
                    <v-list-item
                      @click="setFixedSection(course.code, null)"
                      :active="!fixedSections[course.code]"
                    >
                      <v-list-item-title class="font-weight-medium">Todas as Turmas (Sem filtro)</v-list-item-title>
                    </v-list-item>
                    <v-divider class="my-1"></v-divider>
                    <v-list-item
                      v-for="sec in getAvailableSectionsForCourse(course.code)"
                      :key="sec.section_code"
                      @click="setFixedSection(course.code, sec.section_code)"
                      :active="fixedSections[course.code] === sec.section_code"
                    >
                      <template v-slot:prepend>
                        <v-icon :icon="fixedSections[course.code] === sec.section_code ? 'mdi-pin' : 'mdi-pin-outline'" color="primary"></v-icon>
                      </template>
                      <v-list-item-title class="font-weight-bold d-flex align-center justify-space-between">
                        <span>Turma {{ sec.section_code }}</span>
                        <span v-if="dataService.getSectionCapacity(sec, curriculumService.getSelectedCourse()) !== null" class="text-caption opacity-90 d-inline-flex align-center ml-2" :title="`Vagas oferecidas para veteranos: ${dataService.getSectionCapacity(sec, curriculumService.getSelectedCourse())}`">
                          <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(sec, curriculumService.getSelectedCourse()) }}
                        </span>
                      </v-list-item-title>
                      <v-list-item-subtitle>
                        Prof: {{ sec.professor_name }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </div>

              <!-- Switch e Legenda de Campi -->
              <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-4 pt-3 border-top-thin">
                <v-switch
                  v-model="filterInterCampus"
                  color="primary"
                  label="Evitar disciplinas em campi distintos com intervalo inferior a 1h"
                  hide-details
                  density="compact"
                  class="font-weight-medium"
                ></v-switch>

                <div class="d-flex align-center flex-wrap ga-2">
                  <span class="text-caption font-weight-bold">Legenda de Campi:</span>
                  <v-chip size="small" color="primary" variant="flat" prepend-icon="mdi-domain">Centro</v-chip>
                  <v-chip size="small" color="success" variant="flat" prepend-icon="mdi-pine-tree">Vale</v-chip>
                  <v-chip size="small" color="purple" variant="flat" prepend-icon="mdi-hospital-building">Saúde</v-chip>
                  <v-chip size="small" color="warning" variant="flat" prepend-icon="mdi-help-circle-outline">Não Informado</v-chip>
                </div>
              </div>
            </v-card-text>
          </v-card>

          <v-alert
            v-if="compareSelection.length === 2"
            type="info"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="compareSelection = []"
          >
            <div class="d-flex align-center justify-space-between flex-wrap ga-2">
              <span class="font-weight-medium">2 opções selecionadas para comparar.</span>
              <v-btn color="primary" variant="flat" size="small" class="font-weight-bold rounded-lg" @click="compareDialogOpen = true">
                Comparar agora
              </v-btn>
            </div>
          </v-alert>

          <v-row>
          <v-col
            v-for="(gradeObj, scheduleIndex) in scheduleOptions"
            :key="scheduleIndex"
            cols="12"
          >
            <v-card variant="outlined" class="mb-6 rounded-xl border-thin">
              <v-card-title class="text-subtitle-1 font-weight-bold pa-4 d-flex justify-space-between align-center flex-wrap border-bottom ga-2">
                <div class="d-flex align-center ga-2 flex-wrap">
                  <span class="text-h6 font-weight-bold">Opção {{ scheduleIndex + 1 }}</span>
                  <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold">
                    {{ gradeObj.selected_course_count || (gradeObj.items ? new Set(gradeObj.items.map(i => i.course_code || i.course_id)).size : 0) }} disciplina(s)
                  </v-chip>
                  <v-chip size="small" color="success" variant="tonal" class="font-weight-bold">
                    {{ dataService.getScheduleTotalCredits(gradeObj.items) }} créditos
                  </v-chip>
                </div>
                <div class="d-flex align-center ga-2 flex-wrap">
                  <v-btn
                    color="success"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-bookmark-plus-outline"
                    class="rounded-lg font-weight-bold"
                    @click="saveScheduleOption(gradeObj, scheduleIndex)"
                  >
                    Salvar grade
                  </v-btn>
                  <v-btn
                    color="warning"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-star-plus-outline"
                    class="rounded-lg font-weight-bold"
                    @click="openElectivesModal(gradeObj)"
                  >
                    Ver eletivas compatíveis
                  </v-btn>
                  <v-btn
                    color="primary"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-file-pdf-box"
                    class="rounded-lg font-weight-bold"
                    @click="exportToPDF(gradeObj, scheduleIndex)"
                  >
                    Salvar PDF
                  </v-btn>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-calendar-export-outline"
                    class="rounded-lg font-weight-bold"
                    @click="openIcsDialog(gradeObj)"
                  >
                    Exportar .ics
                  </v-btn>
                  <v-btn
                    :color="isSelectedForCompare(gradeObj) ? 'primary' : undefined"
                    :variant="isSelectedForCompare(gradeObj) ? 'flat' : 'outlined'"
                    size="small"
                    prepend-icon="mdi-compare-horizontal"
                    class="rounded-lg font-weight-bold"
                    :disabled="!isSelectedForCompare(gradeObj) && compareSelection.length >= 2"
                    @click="toggleCompareSelection(gradeObj)"
                  >
                    {{ isSelectedForCompare(gradeObj) ? 'Selecionado p/ comparar' : 'Comparar' }}
                  </v-btn>
                </div>
              </v-card-title>

              <!-- Alternador de Modo de Visualização (Grade / Dia a Dia) -->
              <div class="px-4 pt-3 pb-1 d-flex align-center justify-space-between flex-wrap ga-2">
                <div class="text-caption text-medium-emphasis">
                  <span v-if="scheduleViewMode === 'timeline'">Visualizando grade em formato Dia a Dia (otimizado para celular/lista)</span>
                  <span v-else>Visualizando tabela horária completa (deslize horizontalmente se necessário)</span>
                </div>
                <v-btn-group variant="outlined" density="compact" color="primary" class="rounded-lg">
                  <v-btn
                    :variant="scheduleViewMode === 'grid' ? 'flat' : 'outlined'"
                    prepend-icon="mdi-grid"
                    class="text-none font-weight-bold text-caption"
                    @click="scheduleViewMode = 'grid'"
                  >
                    Grade 2D
                  </v-btn>
                  <v-btn
                    :variant="scheduleViewMode === 'timeline' ? 'flat' : 'outlined'"
                    prepend-icon="mdi-view-day-outline"
                    class="text-none font-weight-bold text-caption"
                    @click="scheduleViewMode = 'timeline'"
                  >
                    Dia a Dia
                  </v-btn>
                </v-btn-group>
              </div>

              <v-card-text class="pa-4">
                <!-- Modo Dia a Dia (Timeline / Mobile) -->
                <div v-if="scheduleViewMode === 'timeline'">
                  <v-tabs v-model="selectedTimelineDay" color="primary" density="compact" show-arrows class="mb-4 border-b">
                    <v-tab v-for="dia in daysArray" :key="dia.index" :value="dia.index" class="font-weight-bold text-none">
                      {{ dia.name }}
                      <v-chip size="x-small" :color="gradeObj.groupedByDay[dia.index]?.length ? 'primary' : 'medium-emphasis'" class="ml-1 font-weight-bold">
                        {{ gradeObj.groupedByDay[dia.index]?.length || 0 }}
                      </v-chip>
                    </v-tab>
                  </v-tabs>

                  <div v-if="gradeObj.groupedByDay[selectedTimelineDay] && gradeObj.groupedByDay[selectedTimelineDay].length > 0" class="d-flex flex-column ga-3">
                    <v-card
                      v-for="item in gradeObj.groupedByDay[selectedTimelineDay]"
                      :key="item.id || item.course_code + '-' + item.start_time"
                      variant="outlined"
                      :color="getCampusColor(item.campus, getCellConflict(gradeObj.items, item))"
                      class="pa-4 rounded-xl d-flex flex-column ga-2"
                      :class="{ 'bg-error-suttle': getCellConflict(gradeObj.items, item) }"
                    >
                      <div class="d-flex justify-space-between align-center flex-wrap ga-2">
                        <div class="d-flex align-center ga-2">
                          <span v-if="hasCampusWarning(gradeObj.items, item)" title="Campus não informado em aula próxima a outra">⚠️</span>
                          <span class="font-weight-bold text-subtitle-1 text-primary">
                            {{ item.course_code }} - {{ item.course_name }}
                            <v-icon
                              v-if="item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id)"
                              size="16"
                              color="warning"
                              class="ml-1"
                              @click.stop
                            >
                              mdi-information-outline
                              <v-tooltip activator="parent" location="top" max-width="450">
                                <div class="text-caption font-weight-regular" style="white-space: pre-line;">
                                  <strong>Observações:</strong><br>{{ item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id) }}
                                </div>
                              </v-tooltip>
                            </v-icon>
                          </span>
                        </div>
                        <v-chip size="small" :color="getCampusColor(item.campus, getCellConflict(gradeObj.items, item))" variant="flat" class="font-weight-bold">
                          {{ item.start_time.slice(0,5) }} às {{ item.end_time.slice(0,5) }}
                        </v-chip>
                      </div>

                      <div class="d-flex align-center ga-4 text-body-2 flex-wrap">
                        <span class="d-flex align-center"><strong>Turma:</strong>&nbsp;{{ item.section_code }}</span>
                        <span v-if="dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) !== null" class="d-inline-flex align-center text-caption opacity-90">
                          <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) }} vagas
                        </span>
                        <span class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-account</v-icon> {{ item.professor_name || 'A definir' }}</span>
                        <span class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-map-marker</v-icon> Campus: {{ item.campus || extractCampus(item.room) }}</span>
                        <span class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-door</v-icon> Sala: {{ formatRoom(item.room) }}</span>
                        <span v-if="item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id)" class="d-flex align-center text-warning font-weight-medium w-100" style="white-space: pre-line;">
                          <v-icon size="16" color="warning" class="mr-1 mt-1">mdi-information-outline</v-icon>
                          <span><strong>Observações:</strong><br>{{ item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id) }}</span>
                        </span>
                      </div>

                      <v-alert v-if="getCellConflict(gradeObj.items, item)" type="error" variant="tonal" density="compact" class="mt-1 text-caption">
                        Colisão de horário ou conflito detectado nesta disciplina.
                      </v-alert>

                      <v-divider class="my-1"></v-divider>

                      <div>
                        <v-btn
                          :color="fixedSections[item.course_code] === item.section_code ? 'error' : 'primary'"
                          variant="tonal"
                          size="small"
                          class="text-none font-weight-bold rounded-lg"
                          :prepend-icon="fixedSections[item.course_code] === item.section_code ? 'mdi-pin-off' : 'mdi-pin'"
                          @click="togglePinSection(item.course_code, item.section_code)"
                        >
                          {{ fixedSections[item.course_code] === item.section_code ? 'Desafixar Turma ' + item.section_code : 'Fixar esta turma (' + item.section_code + ')' }}
                        </v-btn>
                      </div>
                    </v-card>
                  </div>
                  <div v-else class="text-center pa-8 border rounded-xl bg-surface-light text-medium-emphasis">
                    <v-icon icon="mdi-calendar-check-outline" size="40" class="mb-2"></v-icon>
                    <div class="font-weight-bold text-body-1">Nenhuma aula programada para este dia!</div>
                    <div class="text-caption">Seu dia está livre na grade letiva selecionada.</div>
                  </div>
                </div>

                <!-- Modo Grade 2D (Tabela / Desktop) -->
                <div v-else class="calendar-wrapper rounded-xl border-thin bg-surface">
                  <div class="calendar-container">
                    
                    <!-- Cabeçalho de Dias -->
                    <div class="calendar-header border-bottom">
                      <div class="time-axis-header"></div>
                      <div 
                        v-for="dia in daysArray" 
                        :key="dia.index" 
                        class="day-header-col"
                      >
                        {{ dia.name }}
                      </div>
                    </div>

                    <!-- Corpo do Calendário -->
                    <div class="calendar-body">
                      
                      <!-- Eixo do Tempo (Esquerda Dinâmica) -->
                      <div class="time-axis">
                        <div 
                          v-for="hour in (gradeObj.endHour - gradeObj.startHour + 1)" 
                          :key="hour"
                          class="time-label-container"
                          :style="{ height: `${HOUR_HEIGHT}px` }"
                        >
                          <span class="time-label">{{ String(gradeObj.startHour + hour - 1).padStart(2, '0') }}:00</span>
                        </div>
                      </div>

                      <!-- Área da Grade de Colunas (Direita) -->
                      <div class="grid-area">
                        
                        <!-- Linhas Horárias de Fundo -->
                        <div class="grid-lines-bg">
                          <div 
                            v-for="hour in (gradeObj.endHour - gradeObj.startHour + 1)" 
                            :key="hour"
                            class="grid-hour-row"
                            :style="{ height: `${HOUR_HEIGHT}px` }"
                          ></div>
                        </div>

                        <!-- Colunas dos Dias (Sobrepostas no Grid) -->
                        <div class="columns-container" :style="{ height: `${gradeObj.totalHeight}px` }">
                          <div 
                            v-for="dia in daysArray" 
                            :key="dia.index" 
                            class="day-column"
                          >
                            <!-- Cartões de Disciplinas Deste Dia -->
                            <v-card
                              v-for="item in gradeObj.groupedByDay[dia.index]"
                              :key="item.id || item.course_code + '-' + item.start_time"
                              variant="tonal"
                              :color="getCampusColor(item.campus, getCellConflict(gradeObj.items, item))"
                              class="pa-2 rounded-xl text-left class-card cursor-pointer"
                              elevation="0"
                              :class="{ 'conflict-border': getCellConflict(gradeObj.items, item) }"
                              :style="getCardStyle(item, gradeObj.startHour)"
                            >
                              <div class="text-caption font-weight-bold card-title-clamp d-flex align-center justify-space-between ga-1">
                                <div class="d-flex align-center ga-1">
                                  <span v-if="hasCampusWarning(gradeObj.items, item)" title="Campus não informado em aula próxima a outra">⚠️</span>
                                  <span>
                                    {{ item.course_name }}
                                    <v-icon
                                      v-if="item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id)"
                                      size="12"
                                      color="warning"
                                      class="ml-1"
                                    >
                                      mdi-information-outline
                                    </v-icon>
                                  </span>
                                </div>
                                <v-icon
                                  v-if="fixedSections[item.course_code] === item.section_code"
                                  icon="mdi-pin"
                                  size="x-small"
                                  color="primary"
                                  title="Turma Fixada"
                                ></v-icon>
                              </div>
                              <div class="text-caption opacity-95 card-text-clamp d-flex align-center justify-space-between">
                                <span><strong>Turma:</strong> {{ item.section_code }}</span>
                                <span v-if="dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) !== null" class="d-inline-flex align-center ml-1 text-caption opacity-90" :title="`Vagas oferecidas para veteranos: ${dataService.getSectionCapacity(item, curriculumService.getSelectedCourse())}`">
                                  <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) }}
                                </span>
                              </div>
                              <div class="text-caption opacity-90 card-text-clamp">
                                📍 {{ item.room ? formatRoom(item.room) : item.campus }}
                              </div>
                              <div v-if="item.professor_name" class="text-caption opacity-85 card-text-clamp">
                                <strong>Prof:</strong> {{ item.professor_name }}
                              </div>

                              <!-- Tooltip ao passar o mouse -->
                              <v-tooltip
                                activator="parent"
                                location="top"
                                open-delay="200"
                                max-width="360"
                                :content-class="theme.global.name.value === 'dark' ? 'custom-node-tooltip tooltip-theme-dark' : 'custom-node-tooltip tooltip-theme-light'"
                                :theme="theme.global.name.value"
                              >
                                <div class="pa-2">
                                  <div class="text-subtitle-2 font-weight-bold border-bottom pb-1 mb-1">
                                    {{ item.course_name }}
                                  </div>
                                  <div class="text-caption mb-1">
                                    <strong>Código da Cadeira:</strong> {{ item.course_code }}
                                  </div>
                                  <div class="text-caption mb-1 d-flex align-center justify-space-between">
                                    <span><strong>Turma:</strong> {{ item.section_code }}</span>
                                    <span v-if="dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) !== null" class="d-inline-flex align-center ml-1 opacity-90">
                                      <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) }} vagas (veteranos)
                                    </span>
                                  </div>
                                  <div class="text-caption mb-1">
                                    <strong>Campus:</strong> {{ item.campus }}
                                  </div>
                                  <div v-if="item.professor_name" class="text-caption mb-1">
                                    <strong>Professor:</strong> {{ item.professor_name }}
                                  </div>

                                  <div v-if="item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id)" class="text-caption mt-2 pt-1 border-top-thin text-warning font-weight-medium" style="white-space: pre-line;">
                                    <strong>Observações:</strong><br>{{ item.observacao || dataService.getSectionObservation(item.course_code || item.course_id, item.section_code) || dataService.getCourseObservation(item.course_code || item.course_id) }}
                                  </div>

                                  <div v-if="hasCampusWarning(gradeObj.items, item)" class="pa-2 mt-2 rounded bg-warning-subtle border text-caption">
                                    ⚠️ <strong>Campus Não Especificado:</strong> O campus desta disciplina não estava especificado no portal (Não Informado). Como ela ocorre próxima (< 1h) a outra aula no mesmo dia, verifique se haverá tempo hábil para eventual deslocamento de campus!
                                  </div>

                                  <div class="mt-2 pt-1 border-top-thin text-caption">
                                    💡 <em>Clique nesta disciplina para ver opções de fixar/desafixar turma</em>
                                  </div>
                                </div>
                              </v-tooltip>

                              <!-- Pop-up Interativo ao Clicar no Bloco da Disciplina -->
                              <v-menu
                                activator="parent"
                                location="top"
                                :close-on-content-click="false"
                                max-width="340"
                              >
                                <v-card class="pa-4 rounded-xl elevation-6 border-thin">
                                  <div class="d-flex align-center justify-space-between mb-2">
                                    <span class="text-subtitle-2 font-weight-bold">{{ item.course_name }}</span>
                                    <v-chip size="x-small" :color="getCampusColor(item.campus)" variant="tonal">
                                      {{ item.campus }}
                                    </v-chip>
                                  </div>

                                  <div class="text-caption mb-1 d-flex align-center justify-space-between">
                                    <span><strong>Código:</strong> {{ item.course_code }} | <strong>Turma:</strong> {{ item.section_code }}</span>
                                    <span v-if="dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) !== null" class="d-inline-flex align-center ml-2 opacity-90" :title="`Vagas oferecidas para veteranos: ${dataService.getSectionCapacity(item, curriculumService.getSelectedCourse())}`">
                                      <v-icon icon="mdi-account-group" size="x-small" class="mr-1"></v-icon>{{ dataService.getSectionCapacity(item, curriculumService.getSelectedCourse()) }}
                                    </span>
                                  </div>
                                  <div v-if="item.professor_name" class="text-caption mb-2 text-medium-emphasis">
                                    <strong>Professor:</strong> {{ item.professor_name }}
                                  </div>

                                  <v-divider class="my-2"></v-divider>

                                  <v-btn
                                    :color="fixedSections[item.course_code] === item.section_code ? 'error' : 'primary'"
                                    variant="flat"
                                    size="small"
                                    block
                                    class="text-none font-weight-bold rounded-lg mt-2"
                                    :prepend-icon="fixedSections[item.course_code] === item.section_code ? 'mdi-pin-off' : 'mdi-pin'"
                                    @click="togglePinSection(item.course_code, item.section_code)"
                                  >
                                    {{ fixedSections[item.course_code] === item.section_code ? 'Desafixar Turma ' + item.section_code : 'Fixar esta turma (' + item.section_code + ')' }}
                                  </v-btn>
                                </v-card>
                              </v-menu>
                            </v-card>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        </div>
      </v-card-text>
    </v-card>

    <!-- Modal de Sugestão de Eletivas -->
    <ElectiveSuggestionsModal ref="electivesModalRef" @add-section="onAddElectiveSection" />

    <v-dialog v-model="compareDialogOpen" max-width="1600" scrollable>
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4 border-bottom">
          <span class="text-h6 font-weight-bold">Comparar horários</span>
          <v-btn icon="mdi-close" variant="text" @click="compareDialogOpen = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-row>
            <v-col v-for="(gradeObj, i) in compareSelection" :key="i" cols="12" md="6">
              <div class="text-subtitle-1 font-weight-bold mb-2">
                Opção {{ scheduleOptions.indexOf(gradeObj) + 1 }}
                <v-chip size="small" color="success" variant="tonal" class="ml-2 font-weight-bold">
                  {{ dataService.getScheduleTotalCredits(gradeObj.items) }} créditos
                </v-chip>
              </div>
              <div class="calendar-wrapper rounded-xl border-thin bg-surface">
                <div class="calendar-container">
                  <div class="calendar-header border-bottom">
                    <div class="time-axis-header"></div>
                    <div v-for="dia in daysArray" :key="dia.index" class="day-header-col">{{ dia.name }}</div>
                  </div>
                  <div class="calendar-body">
                    <div class="time-axis">
                      <div
                        v-for="hour in (gradeObj.endHour - gradeObj.startHour + 1)"
                        :key="hour"
                        class="time-label-container"
                        :style="{ height: `${HOUR_HEIGHT}px` }"
                      >
                        <span class="time-label">{{ String(gradeObj.startHour + hour - 1).padStart(2, '0') }}:00</span>
                      </div>
                    </div>
                    <div class="grid-area">
                      <div class="grid-lines-bg">
                        <div
                          v-for="hour in (gradeObj.endHour - gradeObj.startHour + 1)"
                          :key="hour"
                          class="grid-hour-row"
                          :style="{ height: `${HOUR_HEIGHT}px` }"
                        ></div>
                      </div>
                      <div class="columns-container" :style="{ height: `${gradeObj.totalHeight}px` }">
                        <div v-for="dia in daysArray" :key="dia.index" class="day-column">
                          <v-card
                            v-for="item in gradeObj.groupedByDay[dia.index]"
                            :key="item.id || item.course_code + '-' + item.start_time"
                            variant="tonal"
                            :color="getCampusColor(item.campus, getCellConflict(gradeObj.items, item))"
                            class="pa-2 rounded-xl text-left class-card"
                            elevation="0"
                            :class="{ 'conflict-border': getCellConflict(gradeObj.items, item) }"
                            :style="getCardStyle(item, gradeObj.startHour)"
                          >
                            <div class="text-caption font-weight-bold card-title-clamp">{{ item.course_name }}</div>
                            <div class="text-caption opacity-90 card-text-clamp">Turma {{ item.section_code }}</div>
                            <div class="text-caption opacity-85 card-text-clamp">📍 {{ item.room ? formatRoom(item.room) : item.campus }}</div>
                          </v-card>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="icsDialogOpen" max-width="420">
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-h6 font-weight-bold">Exportar .ics</span>
          <v-btn icon="mdi-close" variant="text" @click="icsDialogOpen = false"></v-btn>
        </v-card-title>
        <v-card-text class="pa-4 pt-0">
          <div class="text-caption text-medium-emphasis mb-3">
            Informe o período do semestre pra gerar os eventos recorrentes semanais corretamente.
          </div>
          <v-text-field
            v-model="icsStartDate"
            type="date"
            label="Data de início do semestre"
            variant="outlined"
            density="comfortable"
            hide-details
            class="mb-3"
          ></v-text-field>
          <v-text-field
            v-model="icsEndDate"
            type="date"
            label="Data de fim do semestre"
            variant="outlined"
            density="comfortable"
            hide-details
          ></v-text-field>
          <v-alert v-if="icsError" type="error" variant="tonal" density="compact" class="mt-3">{{ icsError }}</v-alert>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="icsDialogOpen = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" class="font-weight-bold rounded-lg" @click="confirmExportICS">Exportar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Notificação Global desta Tela -->
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

.calendar-wrapper {
  overflow-x: auto;
}

.calendar-container {
  min-width: 850px;
  display: flex;
  flex-direction: column;
}

/* Cabeçalho */
.calendar-header {
  display: flex;
  background-color: rgba(var(--v-theme-on-surface), 0.03);
  font-weight: bold;
}

.time-axis-header {
  width: 75px;
  flex-shrink: 0;
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
}

.day-header-col {
  flex: 1;
  text-align: center;
  padding: 14px 6px;
  color: rgb(var(--v-theme-on-surface));
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
}

.day-header-col:last-child {
  border-right: none;
}

/* Corpo */
.calendar-body {
  display: flex;
  position: relative;
}

/* Eixo de Tempo */
.time-axis {
  width: 75px;
  flex-shrink: 0;
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
  background-color: rgba(var(--v-theme-on-surface), 0.01);
  user-select: none;
}

.time-label-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 4px;
}

.time-label {
  font-size: 0.75rem;
  font-weight: bold;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

/* Área de Grade */
.grid-area {
  flex-grow: 1;
  position: relative;
}

.grid-lines-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.grid-hour-row {
  border-bottom: 1px dashed rgba(var(--v-border-color), 0.08);
  box-sizing: border-box;
}

.grid-hour-row:last-child {
  border-bottom: none;
}

/* Colunas dos Dias */
.columns-container {
  display: flex;
  position: relative;
  width: 100%;
  z-index: 1;
}

.day-column {
  flex: 1;
  position: relative;
  height: 100%;
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
  box-sizing: border-box;
}

.day-column:last-child {
  border-right: none;
}

/* Cartão da Aula */
.class-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
  box-sizing: border-box;
}

.class-card:hover {
  transform: scale(1.02);
  z-index: 20 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.conflict-border {
  outline: 2px solid rgb(var(--v-theme-error)) !important;
}

.elective-card-hatched::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: repeating-linear-gradient(
    -45deg,
    currentColor,
    currentColor 2px,
    transparent 2px,
    transparent 8px
  );
  opacity: 0.15;
  pointer-events: none;
  z-index: 1;
  border-radius: inherit;
}

.elective-card-hatched {
  border: 1.5px dashed currentColor !important;
}

.card-title-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.card-text-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.border-top-thin {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>

<style>
/* Estilos Globais da Tooltip (para funcionar com Teleport/v-overlay) */
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
</style>