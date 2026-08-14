<script setup>
import { ref, onMounted, reactive, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { dataService, escapeHtml } from './services/dataService'
import { curriculumService } from './services/curriculumService'
import ElectiveSuggestionsModal from './components/ElectiveSuggestionsModal.vue'

const emit = defineEmits(['change-page'])
const { mobile } = useDisplay()

const scheduleViewModes = reactive({})
const selectedTimelineDays = reactive({})
const getViewMode = (gradeId) => scheduleViewModes[gradeId] || (mobile.value ? 'timeline' : 'grid')
const setViewMode = (gradeId, mode) => { scheduleViewModes[gradeId] = mode }
const getTimelineDay = (gradeId) => selectedTimelineDays[gradeId] || 1
const setTimelineDay = (gradeId, day) => { selectedTimelineDays[gradeId] = day }

const savedSchedules = ref([])
const electivesModalRef = ref(null)

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

const loadSavedSchedules = () => {
  savedSchedules.value = dataService.getSavedSchedules()
}

onMounted(() => {
  loadSavedSchedules()
})

watch(() => curriculumService.selectedCourseRef.value, () => {
  loadSavedSchedules()
})

const collapsedSchedules = reactive({})

const SCALE_Y = 1.2
const HOUR_HEIGHT = 60 * SCALE_Y // 72px per hour

const daysArray = [
  { name: 'Segunda', index: 1 },
  { name: 'Terça', index: 2 },
  { name: 'Quarta', index: 3 },
  { name: 'Quinta', index: 4 },
  { name: 'Sexta', index: 5 },
  { name: 'Sábado', index: 6 }
]

const dayOrder = {
  'Segunda': 1, 'Segunda-feira': 1, 'SEG': 1,
  'Terça': 2, 'Terça-feira': 2, 'TER': 2,
  'Quarta': 3, 'Quarta-feira': 3, 'QUA': 3,
  'Quinta': 4, 'Quinta-feira': 4, 'QUI': 4,
  'Sexta': 5, 'Sexta-feira': 5, 'SEX': 5,
  'Sábado': 6, 'SAB': 6,
  'Domingo': 7, 'DOM': 7
}

const normalizeDay = (dayStr) => {
  if (!dayStr) return ''
  const trimmed = dayStr.trim()
  if (trimmed.startsWith('Seg')) return 'Segunda'
  if (trimmed.startsWith('Ter')) return 'Terça'
  if (trimmed.startsWith('Qua')) return 'Quarta'
  if (trimmed.startsWith('Qui')) return 'Quinta'
  if (trimmed.startsWith('Sex')) return 'Sexta'
  if (trimmed.startsWith('Sáb') || trimmed.startsWith('Sab')) return 'Sábado'
  return trimmed
}

const convertTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const [hours, minutes] = timeStr.split(':').map(Number)
  return (hours * 60) + (minutes || 0)
}

const sortSchedule = (schedule) => {
  return [...schedule].sort((a, b) => {
    const dayA = dayOrder[normalizeDay(a.day_of_week)] || 99
    const dayB = dayOrder[normalizeDay(b.day_of_week)] || 99
    if (dayA !== dayB) return dayA - dayB
    return convertTimeToMinutes(a.start_time) - convertTimeToMinutes(b.start_time)
  })
}

const formatRoom = (room) => {
  if (!room) return 'A definir'
  let cleaned = room.normalize('NFC')
    .replace(/SALA DE AULA/gi, 'Sala')
    .replace(/\s*(?:-|-)?\s*Campus:\s*[^\s-].*$/i, '')
    .replace(/\s*(?:-|-)?\s*Campus\s+(?:do\s+Vale|Centro|da\s+Sa[uú]de|Litoral\s+Norte|Olhos\s+d['']?Água|EAD|Outros).*$/i, '')
    .trim()
  return cleaned ? cleaned.replace(/^[-\s]+|[-\s]+$/g, '') : 'A definir'
}

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

const getCampusColor = (campus) => {
  switch (campus) {
    case 'Centro': return 'primary'
    case 'Vale': return 'success'
    case 'Saúde': return 'purple'
    default: return 'warning'
  }
}

const getTopOffset = (startTime, startHour) => {
  const startMin = convertTimeToMinutes(startTime)
  const baseMin = startHour * 60
  const diff = startMin - baseMin
  return diff * SCALE_Y
}

const getHeight = (startTime, endTime) => {
  const startMin = convertTimeToMinutes(startTime)
  const endMin = convertTimeToMinutes(endTime)
  const duration = Math.max(0, endMin - startMin)
  return (duration * SCALE_Y) - 6 // Small visual gap for consecutive cards
}

const isElectiveItem = (item) => {
  if (!item) return false
  if (item.is_elective !== undefined) return Boolean(item.is_elective)
  const selectedCourseCode = curriculumService.getSelectedCourse() || 'CIC'
  const courseSubjects = curriculumService.getCurriculumSubjects(selectedCourseCode)
  const courseCodesSet = new Set(courseSubjects.map(s => s.code))
  return !courseCodesSet.has(item.course_code)
}

const getCardStyle = (item, startHour) => {
  const top = getTopOffset(item.start_time, startHour)
  const height = getHeight(item.start_time, item.end_time)
  return {
    top: `${top}px`,
    height: `${height}px`,
    position: 'absolute',
    left: '4px',
    right: '4px',
    zIndex: 10
  }
}

const deleteSavedSchedule = (id) => {
  savedSchedules.value = savedSchedules.value.filter(s => s.id !== id)
  dataService.saveSavedSchedules(savedSchedules.value)
  showSnackbar('Grade excluída das Grades Salvas com sucesso.', 'info')
}

const clearAllSavedSchedules = () => {
  savedSchedules.value = []
  dataService.saveSavedSchedules([])
  showSnackbar('Todas as grades salvas foram excluídas.', 'info')
}

const renamingSchedule = ref(null)
const newScheduleName = ref('')

const startRenaming = (grade) => {
  renamingSchedule.value = grade
  newScheduleName.value = grade.name
}

const saveRenaming = () => {
  if (!renamingSchedule.value || !newScheduleName.value.trim()) return
  renamingSchedule.value.name = newScheduleName.value.trim()
  dataService.saveSavedSchedules(savedSchedules.value)
  renamingSchedule.value = null
  showSnackbar('Nome da grade atualizado!', 'success')
}

const openElectivesModal = (grade) => {
  const turmas = dataService.getTurmas()
  const restrictions = dataService.getRestrictions()
  electivesModalRef.value?.open(grade, turmas, restrictions, { isSaved: true })
}

const onAddElectiveSection = ({ gradeObj, section, course }) => {
  if (!gradeObj || !section) return
  if (!gradeObj.items) gradeObj.items = []

  const allCourses = dataService.getAllCourses()
  const courseNameMap = {}
  allCourses.forEach(c => {
    if (c.code) courseNameMap[c.code] = c.name
    if (c.id) courseNameMap[c.id] = c.name
  })

  if (Array.isArray(section.schedules)) {
    section.schedules.forEach(sched => {
      gradeObj.items.push({
        id: sched.id || (Date.now() + Math.random()),
        section_id: section.section_id || section.id || (section.course_code + '_' + section.section_code),
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

  const sortedItems = sortSchedule(gradeObj.items)
  gradeObj.items = sortedItems

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

  gradeObj.groupedByDay = groupedByDay
  gradeObj.startHour = startHour
  gradeObj.endHour = endHour
  gradeObj.totalHeight = (endHour - startHour + 1) * HOUR_HEIGHT
  gradeObj.selected_course_count = new Set(sortedItems.map(i => i.course_code || i.course_id)).size

  dataService.saveSavedSchedules(savedSchedules.value)
  showSnackbar(`Eletiva "${course.code} - ${course.name}" adicionada com sucesso à grade salva!`, 'success')
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

const exportToPDF = (gradeObj) => {
  const startHour = gradeObj.startHour || 8
  const endHour = gradeObj.endHour || 22
  const numHours = endHour - startHour + 1
  
  const printHourHeight = Math.min(56, Math.max(36, Math.floor(620 / numHours)))
  const printScaleY = printHourHeight / 60
  const printTotalHeight = numHours * printHourHeight
  const semesterStr = gradeObj.semester || localStorage.getItem('ufrgs_selected_semester') || '2026/2'
  
  const uniqueSectionsMap = new Map()
  ;(gradeObj.items || []).forEach(item => {
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

  const getPrintPalette = (campus) => {
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

  let calendarColumns = ''
  daysArray.forEach(dia => {
    let dayCards = ''
    const itemsToday = (gradeObj.groupedByDay && gradeObj.groupedByDay[dia.index]) || []
    
    itemsToday.forEach(item => {
      const startMin = convertTimeToMinutes(item.start_time)
      const endMin = convertTimeToMinutes(item.end_time)
      const duration = Math.max(0, endMin - startMin)
      const startMinutes = startHour * 60
      const top = (startMin - startMinutes) * printScaleY
      const height = Math.max(26, (duration * printScaleY) - 3)
      const isElective = isElectiveItem(item)
      const palette = getPrintPalette(item.campus)
      const isShort = duration < 75
      const cleanRoom = escapeHtml(formatPrintRoom(item.room))
          const cap = dataService.getSectionCapacity(item, curriculumService.getSelectedCourse())
          const capHtml = cap !== null ? ` <span style="font-size: 0.9em; opacity: 0.9;">(👥 ${cap} vagas)</span>` : ''
          dayCards += `
        <div class="class-card ${isShort ? 'short-card' : ''} ${isElective ? 'elective-hatched' : ''}" style="top: ${top}px; height: ${height}px; background-color: ${palette.bg} !important; border-left: 4px solid ${palette.border} !important; color: ${palette.text} !important;">
          <div class="class-card-title" style="color: ${palette.text} !important;">${escapeHtml(item.course_name || item.course_code)}</div>
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

  let gridRows = ''
  for (let h = startHour; h <= endHour; h++) {
    gridRows += `<div class="grid-hour-row" style="height: ${printHourHeight}px;"></div>`
  }
  gridRows += eventGridLinesHTML

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

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

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
            ${(gradeObj.items || []).some(i => isElectiveItem(i)) ? `<span class="legend-item"><span class="legend-swatch swatch-elective"></span>Eletiva</span>` : ''}
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
    <!-- Cabeçalho -->
    <v-card class="mb-6 rounded-xl border-thin shadow-premium bg-surface" elevation="1">
      <v-card-text class="pa-6 d-flex justify-space-between align-center flex-wrap gap-4">
        <div>
          <div class="d-flex align-center gap-3 mb-1">
            <v-icon icon="mdi-bookmark-check" color="primary" size="x-large"></v-icon>
            <span class="text-h4 font-weight-bold">Grades Salvas</span>
            <v-chip color="primary" variant="tonal" class="font-weight-bold ml-2">
              {{ savedSchedules.length }} grade(s)
            </v-chip>
          </div>
          <div class="text-body-1 text-medium-emphasis">
            Acesse e gerencie suas opções favoritas de grade horária para o semestre.
          </div>
        </div>

        <div class="d-flex gap-3 align-center">
          <v-btn
            v-if="savedSchedules.length > 0"
            color="error"
            variant="tonal"
            prepend-icon="mdi-delete-sweep-outline"
            class="rounded-lg font-weight-bold"
            @click="clearAllSavedSchedules"
          >
            Excluir Todas
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-plus"
            class="rounded-lg font-weight-bold"
            @click="emit('change-page', 'generate_schedules')"
          >
            Gerar Nova Grade
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Estado Vazio -->
    <v-card v-if="savedSchedules.length === 0" class="rounded-xl pa-10 text-center border-thin bg-surface mb-6">
      <v-icon icon="mdi-bookmark-off-outline" size="64" color="medium-emphasis" class="mb-4"></v-icon>
      <div class="text-h5 font-weight-bold mb-2">Nenhuma grade salva ainda</div>
      <div class="text-body-1 text-medium-emphasis mb-6 max-width-600 mx-auto">
        Você ainda não salvou nenhuma grade de horários no seu navegador. Vá até a tela de geração de grades, escolha sua opção preferida e clique em "Salvar grade".
      </div>
      <v-btn
        color="primary"
        variant="elevated"
        size="large"
        prepend-icon="mdi-calendar-clock"
        class="rounded-lg font-weight-bold px-8"
        @click="emit('change-page', 'generate_schedules')"
      >
        Ir para Gerar Grade
      </v-btn>
    </v-card>

    <!-- Lista de Grades Salvas -->
    <div v-else class="d-flex flex-column gap-6">
      <v-card
        v-for="(grade, idx) in savedSchedules"
        :key="grade.id"
        variant="outlined"
        class="rounded-xl border-thin shadow-premium bg-surface"
      >
        <!-- Cabeçalho do Cartão da Grade Salva -->
        <v-card-title class="pa-5 bg-surface-light border-bottom d-flex justify-space-between align-center flex-wrap gap-3">
          <div class="d-flex align-center gap-3">
            <v-avatar color="primary" variant="tonal" size="42" class="font-weight-bold">
              #{{ idx + 1 }}
            </v-avatar>

            <div>
              <!-- Se estiver renomeando este item -->
              <div v-if="renamingSchedule?.id === grade.id" class="d-flex align-center gap-2">
                <v-text-field
                  v-model="newScheduleName"
                  density="compact"
                  variant="outlined"
                  hide-details
                  auto-select-first
                  class="font-weight-bold"
                  style="min-width: 280px;"
                  @keyup.enter="saveRenaming"
                ></v-text-field>
                <v-btn icon="mdi-check" color="success" size="small" variant="flat" @click="saveRenaming"></v-btn>
                <v-btn icon="mdi-close" size="small" variant="text" @click="renamingSchedule = null"></v-btn>
              </div>

              <!-- Exibição Normal do Nome -->
              <div v-else class="d-flex align-center gap-2">
                <span class="text-h6 font-weight-bold">{{ grade.name }}</span>
                <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" title="Renomear grade" @click="startRenaming(grade)"></v-btn>
              </div>

              <div class="text-caption text-medium-emphasis d-flex align-center gap-3 mt-1">
                <span>Salva em: {{ new Date(grade.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
                <span>•</span>
                <span class="font-weight-bold text-primary">{{ grade.selected_course_count || (grade.items ? new Set(grade.items.map(i => i.course_code || i.course_id)).size : 0) }} disciplina(s)</span>
                <span>•</span>
                <span class="font-weight-bold text-success">{{ dataService.getScheduleTotalCredits(grade.items) }} créditos</span>
              </div>
            </div>
          </div>

          <!-- Ações da Grade Salva -->
          <div class="d-flex align-center gap-2 flex-wrap">
            <v-btn
              color="warning"
              variant="flat"
              size="small"
              prepend-icon="mdi-star-plus-outline"
              class="rounded-lg font-weight-bold"
              @click="openElectivesModal(grade)"
            >
              Complementar com eletivas
            </v-btn>
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              prepend-icon="mdi-file-pdf-box"
              class="rounded-lg font-weight-bold"
              @click="exportToPDF(grade)"
            >
              Salvar PDF
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              class="rounded-lg font-weight-bold"
              @click="deleteSavedSchedule(grade.id)"
            >
              Excluir
            </v-btn>
            <v-btn
              :icon="collapsedSchedules[grade.id] ? 'mdi-chevron-down' : 'mdi-chevron-up'"
              variant="text"
              size="small"
              :title="collapsedSchedules[grade.id] ? 'Expandir grade' : 'Recolher grade'"
              @click="collapsedSchedules[grade.id] = !collapsedSchedules[grade.id]"
            ></v-btn>
          </div>
        </v-card-title>

        <!-- Alternador de Modo de Visualização (Grade / Dia a Dia) -->
        <div v-show="!collapsedSchedules[grade.id]" class="px-5 pt-3 pb-1 d-flex align-center justify-space-between flex-wrap gap-2 border-bottom">
          <div class="text-caption text-medium-emphasis">
            <span v-if="getViewMode(grade.id) === 'timeline'">Visualizando em formato Dia a Dia (otimizado para celular/lista)</span>
            <span v-else>Visualizando tabela horária completa (deslize horizontalmente se necessário)</span>
          </div>
          <v-btn-group variant="outlined" density="compact" color="primary" class="rounded-lg">
            <v-btn
              :variant="getViewMode(grade.id) === 'grid' ? 'flat' : 'outlined'"
              prepend-icon="mdi-grid"
              class="text-none font-weight-bold text-caption"
              @click="setViewMode(grade.id, 'grid')"
            >
              Grade 2D
            </v-btn>
            <v-btn
              :variant="getViewMode(grade.id) === 'timeline' ? 'flat' : 'outlined'"
              prepend-icon="mdi-view-day-outline"
              class="text-none font-weight-bold text-caption"
              @click="setViewMode(grade.id, 'timeline')"
            >
              Dia a Dia
            </v-btn>
          </v-btn-group>
        </div>

        <!-- Grade Visual Semanal -->
        <v-expand-transition>
          <v-card-text v-show="!collapsedSchedules[grade.id]" class="pa-5">
            <!-- Modo Dia a Dia (Timeline / Mobile) -->
            <div v-if="getViewMode(grade.id) === 'timeline'">
              <v-tabs :model-value="getTimelineDay(grade.id)" @update:model-value="setTimelineDay(grade.id, $event)" color="primary" density="compact" show-arrows class="mb-4 border-b">
                <v-tab v-for="dia in daysArray" :key="dia.index" :value="dia.index" class="font-weight-bold text-none">
                  {{ dia.name }}
                  <v-chip size="x-small" :color="grade.groupedByDay && grade.groupedByDay[dia.index]?.length ? 'primary' : 'medium-emphasis'" class="ml-1 font-weight-bold">
                    {{ (grade.groupedByDay && grade.groupedByDay[dia.index]?.length) || 0 }}
                  </v-chip>
                </v-tab>
              </v-tabs>

              <div v-if="grade.groupedByDay && grade.groupedByDay[getTimelineDay(grade.id)] && grade.groupedByDay[getTimelineDay(grade.id)].length > 0" class="d-flex flex-column gap-3">
                <v-card
                  v-for="item in grade.groupedByDay[getTimelineDay(grade.id)]"
                  :key="item.id || item.course_code + '-' + item.start_time"
                  variant="outlined"
                  color="primary"
                  class="pa-4 rounded-xl d-flex flex-column gap-2"
                >
                  <div class="d-flex justify-space-between align-center flex-wrap gap-2">
                    <span class="font-weight-bold text-subtitle-1 text-primary">{{ item.course_code }} - {{ item.course_name }}</span>
                    <v-chip size="small" color="primary" variant="flat" class="font-weight-bold">
                      {{ item.start_time.slice(0,5) }} às {{ item.end_time.slice(0,5) }}
                    </v-chip>
                  </div>

                  <div class="d-flex align-center gap-4 text-body-2 flex-wrap">
                    <span class="d-flex align-center"><strong>Turma:</strong>&nbsp;{{ item.section_code }}</span>
                    <span v-if="item.professor_name" class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-account</v-icon> {{ item.professor_name }}</span>
                    <span class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-map-marker</v-icon> Campus: {{ item.campus || extractCampus(item.room) }}</span>
                    <span class="d-flex align-center"><v-icon size="16" class="mr-1">mdi-door</v-icon> Sala: {{ formatRoom(item.room) }}</span>
                  </div>
                </v-card>
              </div>
              <div v-else class="text-center pa-8 border rounded-xl bg-surface-light text-medium-emphasis">
                <v-icon icon="mdi-calendar-check-outline" size="40" class="mb-2"></v-icon>
                <div class="font-weight-bold text-body-1">Nenhuma aula programada para este dia!</div>
                <div class="text-caption">Seu dia está livre nesta grade salva.</div>
              </div>
            </div>

            <!-- Modo Grade 2D (Tabela / Desktop) -->
            <div v-else class="calendar-wrapper rounded-xl border-thin bg-surface">
              <div class="calendar-container">
                <!-- Cabeçalho dos Dias -->
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
                  <!-- Eixo do Tempo -->
                  <div class="time-axis">
                    <div
                      v-for="hour in ((grade.endHour || 22) - (grade.startHour || 8) + 1)"
                      :key="hour"
                      class="time-label-container"
                      :style="{ height: `${HOUR_HEIGHT}px` }"
                    >
                      <span class="time-label">{{ String((grade.startHour || 8) + hour - 1).padStart(2, '0') }}:00</span>
                    </div>
                  </div>

                  <!-- Grade de Aulas -->
                  <div class="grid-area">
                    <div class="grid-lines-bg">
                      <div
                        v-for="hour in ((grade.endHour || 22) - (grade.startHour || 8) + 1)"
                        :key="hour"
                        class="grid-hour-row"
                        :style="{ height: `${HOUR_HEIGHT}px` }"
                      ></div>
                    </div>

                    <div class="columns-container" :style="{ height: `${grade.totalHeight || (( (grade.endHour || 22) - (grade.startHour || 8) + 1 ) * HOUR_HEIGHT)}px` }">
                      <div
                        v-for="dia in daysArray"
                        :key="dia.index"
                        class="day-column"
                      >
                        <v-card
                          v-for="item in (grade.groupedByDay && grade.groupedByDay[dia.index]) || []"
                          :key="item.id"
                          variant="tonal"
                          :color="getCampusColor(item.campus)"
                          class="schedule-card pa-2 rounded-xl text-left cursor-pointer"
                          elevation="0"
                          :class="{ 'elective-card-hatched': isElectiveItem(item) }"
                          :style="getCardStyle(item, grade.startHour || 8)"
                        >
                          <div class="text-caption font-weight-bold card-title-clamp">
                            {{ item.course_name }}
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
                        </v-card>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-expand-transition>
      </v-card>
    </div>

    <!-- Modal de Sugestão de Eletivas -->
    <ElectiveSuggestionsModal ref="electivesModalRef" @add-section="onAddElectiveSection" />

    <!-- Notificação -->
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

.calendar-wrapper {
  overflow-x: auto;
}

.calendar-container {
  min-width: 780px;
  position: relative;
}

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

.calendar-body {
  display: flex;
  position: relative;
}

.time-axis {
  width: 75px;
  flex-shrink: 0;
  border-right: 1px solid rgba(var(--v-border-color), 0.08);
  background-color: rgba(var(--v-theme-on-surface), 0.01);
}

.time-label-container {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding-right: 10px;
  box-sizing: border-box;
}

.time-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.5);
  transform: translateY(-8px);
}

.grid-area {
  flex: 1;
  position: relative;
}

.grid-lines-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
}

.grid-hour-row {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.06);
  box-sizing: border-box;
}

.columns-container {
  display: flex;
  position: relative;
}

.day-column {
  flex: 1;
  position: relative;
  border-right: 1px solid rgba(var(--v-border-color), 0.06);
}

.day-column:last-child {
  border-right: none;
}

.schedule-card {
  position: absolute;
  left: 4px;
  right: 4px;
  z-index: 2;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06) !important;
  transition: all 0.2s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.schedule-card:hover {
  transform: translateY(-2px);
  z-index: 10;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12) !important;
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
</style>
