import academicData from '../data/academic_data.json'
import { curriculumService } from './curriculumService'

const STORAGE_KEYS = {
  COMPLETED_COURSES: 'ufrgs_pma_completed_courses',
  DESIRED_COURSES: 'ufrgs_pma_desired_courses',
  RESTRICTIONS: 'ufrgs_pma_restrictions',
  SELECTED_CURRICULUM: 'ufrgs_pma_selected_curriculum',
  CUSTOM_TURMAS: 'ufrgs_pma_custom_turmas',
  CUSTOM_TURMAS_DATE: 'ufrgs_pma_custom_turmas_date',
  SAVED_SCHEDULES: 'ufrgs_pma_saved_schedules'
}

export const dataService = {
  // --- Academic Data Getters ---
  getCoursesMap() {
    return academicData.courses || {}
  },

  getAllCourses() {
    return Object.values(academicData.courses || {}).sort((a, b) => a.name.localeCompare(b.name))
  },

  getCourseByCode(code) {
    if (!code) return null
    const map = this.getCoursesMap()
    return map[code.toUpperCase()] || null
  },

  getCourseCredits(code) {
    if (!code) return 0
    const upper = String(code).toUpperCase().trim()
    const course = this.getCourseByCode(upper)
    if (course && course.credits !== undefined) return Number(course.credits)
    const subjects = curriculumService.getCurriculumSubjects(curriculumService.getSelectedCourse())
    const subj = subjects.find(s => s.code === upper || s.id === upper)
    if (subj && subj.credits !== undefined) return Number(subj.credits)
    return 4
  },

  getScheduleTotalCredits(itemsOrCodes) {
    if (!itemsOrCodes || !Array.isArray(itemsOrCodes)) return 0
    const codes = new Set()
    itemsOrCodes.forEach(item => {
      if (typeof item === 'string') {
        codes.add(item)
      } else if (item && (item.course_code || item.course_id || item.code)) {
        codes.add(item.course_code || item.course_id || item.code)
      }
    })
    let total = 0
    codes.forEach(code => {
      total += this.getCourseCredits(code)
    })
    return total
  },

  getCurriculum(curriculumKey = 'cc') {
    return academicData.curriculums?.[curriculumKey] || academicData.curriculums?.cc || { name: 'Ciência da Computação', courses: [] }
  },

  getCurriculumCourses(curriculumKey = 'cc') {
    const curr = this.getCurriculum(curriculumKey)
    const coursesMap = this.getCoursesMap()
    return (curr.courses || []).map(item => {
      const details = coursesMap[item.code] || {
        code: item.code,
        name: item.code,
        credits: 4,
        min_credits_required: 0,
        prerequisites: []
      }
      return {
        ...details,
        semester: item.semester,
        mandatory: item.mandatory
      }
    })
  },

  getServerLastUpdated() {
    return academicData.last_updated || '2026-01-15'
  },

  // --- Turmas Management ---
  getTurmas() {
    let list = academicData.turmas || []
    const customStr = localStorage.getItem(STORAGE_KEYS.CUSTOM_TURMAS)
    if (customStr) {
      try {
        const parsed = JSON.parse(customStr)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customSemesters = new Set(parsed.map(t => t.semester))
          const remainingDefault = list.filter(t => !customSemesters.has(t.semester))
          list = [...parsed, ...remainingDefault]
        }
      } catch (e) {
        console.warn('Invalid custom turmas in localStorage:', e)
      }
    }
    return list.map(t => ({
      ...t,
      schedules: Array.isArray(t.schedules) ? t.schedules : []
    }))
  },

  getTurmasSourceInfo() {
    const isCustom = !!localStorage.getItem(STORAGE_KEYS.CUSTOM_TURMAS)
    if (isCustom) {
      return {
        isCustom: true,
        date: 'Arquivo carregado pelo usuário',
        label: 'Arquivo carregado pelo usuário'
      }
    }
    let rawDate = academicData.last_updated || '2026/2'
    if (rawDate && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(rawDate)) {
      const parts = rawDate.split(' ')
      const dateParts = parts[0].split('-')
      rawDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} às ${parts[1]}`
    }
    return {
      isCustom: false,
      date: rawDate,
      label: 'Turmas oficiais UFRGS (' + rawDate + ')'
    }
  },

  getSectionCapacity(section, selectedCourseCode = null) {
    if (!section) return null
    if (!selectedCourseCode) {
      selectedCourseCode = curriculumService.getSelectedCourse() || 'CIC'
    }
    let secObj = section
    if (secObj.capacity_by_curriculum === undefined && secObj.capacity === undefined && (secObj.course_code || secObj.course_id) && secObj.section_code) {
      const code = secObj.course_code || secObj.course_id
      const found = this.getTurmas().find(t => (t.course_code === code || t.course_id === code) && t.section_code === secObj.section_code)
      if (found) secObj = found
    }
    if (secObj.capacity_by_curriculum && selectedCourseCode) {
      const target = curriculumService.normalizeCurriculumCode(selectedCourseCode)
      for (const [key, val] of Object.entries(secObj.capacity_by_curriculum)) {
        if (curriculumService.normalizeCurriculumCode(key) === target && val !== undefined && val !== null) {
          return val
        }
      }
    }
    return secObj.capacity !== undefined ? secObj.capacity : null
  },

  saveCustomTurmas(turmasArray, timestampStr = null) {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TURMAS, JSON.stringify(turmasArray))
    const now = timestampStr || new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TURMAS_DATE, now)
  },

  resetToOfficialTurmas() {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TURMAS)
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TURMAS_DATE)
  },

  parseTurmasCsv(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim())
    if (lines.length < 2) return []

    const DAY_MAPPING = {
      segunda: 'Segunda-feira',
      terça: 'Terça-feira',
      terca: 'Terça-feira',
      tera: 'Terça-feira',
      quarta: 'Quarta-feira',
      quinta: 'Quinta-feira',
      sexta: 'Sexta-feira',
      sábado: 'Sábado',
      sabado: 'Sábado',
      sbado: 'Sábado',
      domingo: 'Domingo'
    }

    const turmas = []
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim())
      if (cols.length < 6) continue

      const [courseCode, sectionCode, semester, capacity, professorName, schedulesRaw] = cols
      const schedules = []
      const chunks = schedulesRaw.split(';').map(c => c.trim()).filter(Boolean)
      const pattern = /(Segunda|Terça|Tera|Terca|Quarta|Quinta|Sexta|Sábado|Sabado|Sbado|Domingo)[a-z-]*\s+(?:das\s+)?(\d{1,2}:\d{2})\s*(?:-|as|às|a)\s*(\d{1,2}:\d{2})/i
      for (const chunk of chunks) {
        const m = chunk.match(pattern)
        if (m) {
          const dayRaw = m[1]
          const startT = m[2]
          const endT = m[3]
          let room = chunk.slice(m[0].length).trim()
          room = room.replace(/^[-\s(]+|[)\s]+$/g, '')
          const dayNorm = DAY_MAPPING[dayRaw.toLowerCase()] || dayRaw
          const padTime = t => (t.length === 5 ? `${t}:00` : t.length === 4 ? `0${t}:00` : t)
          schedules.push({
            day_of_week: dayNorm,
            start_time: padTime(startT),
            end_time: padTime(endT),
            room: room
          })
        }
      }

      turmas.push({
        id: i,
        course_code: courseCode,
        section_code: sectionCode,
        semester: semester || '2026/1',
        professor_name: professorName,
        schedules
      })
    }
    return turmas
  },

  parseTurmasHtml(htmlText) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(htmlText, 'text/html')
    const table = doc.querySelector('table.modelo1') || doc.querySelector('table')
    if (!table) return []

    const turmas = []
    let currentCode = null
    let currentName = null

    const rows = table.querySelectorAll('tr')
    rows.forEach((tr, index) => {
      const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent.trim())
      if (cells.length < 10) return
      if (cells[0].includes('Atividades de Ensino') || cells[1].includes('Créditos')) return

      if (cells[0]) {
        const match = cells[0].match(/\(([A-Z0-9]+)\)\s*(.*)/)
        if (match) {
          currentCode = match[1].trim()
          currentName = match[2].trim().replace(/\s+-\s+[A-Z0-9/]+$/, '')
        }
      }
      if (!currentCode) return

      const sectionCode = cells[2].trim()
      if (!sectionCode) return

      const capacity = parseInt(cells[3], 10) || 10
      const scheduleRaw = cells[8] || ''
      const profRaw = cells[9] || ''

      const schedules = []
      const chunks = scheduleRaw.split(';').map(c => c.trim()).filter(Boolean)
      const regex = /([A-Za-zçã-]+?)\s+(?:das\s+)?(\d{1,2}:\d{2})\s*(?:-|as|às|a)\s*(\d{1,2}:\d{2})/i
      for (const chunk of chunks) {
        const m = chunk.match(regex)
        if (m) {
          let day = m[1].replace(/-/g, '').trim()
          const start = m[2].length === 5 ? `${m[2]}:00` : `0${m[2]}:00`
          const end = m[3].length === 5 ? `${m[3]}:00` : `0${m[3]}:00`
          let room = chunk.slice(m[0].length).trim()
          room = room.replace(/^[-\s(]+|[)\s]+$/g, '')
          const dayMap = {
            segunda: 'Segunda-feira', terça: 'Terça-feira', terca: 'Terça-feira', tera: 'Terça-feira',
            quarta: 'Quarta-feira', quinta: 'Quinta-feira', sexta: 'Sexta-feira',
            sábado: 'Sábado', sabado: 'Sábado', sbado: 'Sábado', domingo: 'Domingo'
          }
          schedules.push({
            day_of_week: dayMap[day.toLowerCase()] || day,
            start_time: start,
            end_time: end,
            room: room
          })
        }
      }

      turmas.push({
        id: `html-${index}`,
        course_code: currentCode,
        course_name: currentName,
        section_code: sectionCode,
        semester: '2026/2',
        capacity: capacity,
        professor_name: profRaw.replace(/\n+/g, ' ').trim(),
        schedules: schedules
      })
    })

    return turmas
  },

  // --- User Completed Courses (Histórico) ---
  getCompletedCourses() {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPLETED_COURSES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveCompletedCourses(codesArray) {
    const unique = [...new Set(codesArray.filter(Boolean).map(c => c.toUpperCase()))]
    localStorage.setItem(STORAGE_KEYS.COMPLETED_COURSES, JSON.stringify(unique))
    return unique
  },

  toggleCompletedCourse(code) {
    const current = this.getCompletedCourses()
    const upper = code.toUpperCase()
    const exists = current.includes(upper)
    const updated = exists ? current.filter(c => c !== upper) : [...current, upper]
    this.saveCompletedCourses(updated)
    return updated
  },

  // --- Curriculum Selection ---
  getSelectedCurriculum() {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_CURRICULUM) || 'cc'
  },

  setSelectedCurriculum(key) {
    localStorage.setItem(STORAGE_KEYS.SELECTED_CURRICULUM, key)
  },

  // --- Eligible Courses Calculation ---
  getEligibleCourses(curriculumKey = 'cc') {
    const completedSet = new Set(this.getCompletedCourses())
    const allCourses = this.getAllCourses()

    // Calculate total completed credits
    let totalCompletedCredits = 0
    completedSet.forEach(code => {
      const c = this.getCourseByCode(code)
      if (c) totalCompletedCredits += (c.credits || 0)
    })

    return allCourses.filter(course => {
      // Already completed -> not eligible
      if (completedSet.has(course.code)) return false

      // Check min credits required
      if ((course.min_credits_required || 0) > totalCompletedCredits) return false

      // Check prerequisites
      const prereqs = course.prerequisites || []
      const allPrereqsMet = prereqs.every(p => completedSet.has(p.toUpperCase()))
      return allPrereqsMet
    })
  },

  // --- Desired Courses (Cadeiras que o aluno quer fazer) ---
  getDesiredCourses() {
    const raw = localStorage.getItem(STORAGE_KEYS.DESIRED_COURSES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveDesiredCourses(list) {
    localStorage.setItem(STORAGE_KEYS.DESIRED_COURSES, JSON.stringify(list))
  },

  // --- Time & Preference Restrictions ---
  getRestrictions() {
    const raw = localStorage.getItem(STORAGE_KEYS.RESTRICTIONS)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter(r => {
            if (r.restriction_type === 'professor_preference') return Boolean(r.course_id && r.preferred_professor)
            const day = r.dia || r.day_of_week
            const start = r.horario_inicio || r.start_time
            const end = r.horario_fim || r.end_time
            return Boolean(day && start && end && start !== ':' && end !== ':' && start !== 'das :' && end !== 'as :')
          })
        : []
    } catch (e) {
      return []
    }
  },

  saveRestrictions(list) {
    const validList = Array.isArray(list)
      ? list.filter(r => {
          if (r.restriction_type === 'professor_preference') return Boolean(r.course_id && r.preferred_professor)
          const day = r.dia || r.day_of_week
          const start = r.horario_inicio || r.start_time
          const end = r.horario_fim || r.end_time
          return Boolean(day && start && end && start !== ':' && end !== ':' && start !== 'das :' && end !== 'as :')
        })
      : []
    localStorage.setItem(STORAGE_KEYS.RESTRICTIONS, JSON.stringify(validList))
  },

  // --- Saved Schedules ---
  getSavedSchedules() {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_SCHEDULES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveSavedSchedules(list) {
    localStorage.setItem(STORAGE_KEYS.SAVED_SCHEDULES, JSON.stringify(list))
  }
}
