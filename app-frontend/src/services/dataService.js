import academicData from '../data/academic_data.json'
import { curriculumService } from './curriculumService'

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// Disciplinas equivalentes (mesma matéria, ofertada em modalidades diferentes) - concluir uma
// dispensa a outra. Único caso hoje: Probabilidade e Estatística presencial (MAT02219, matriz
// obrigatória) e EAD (MAT02050, aparece no catálogo como eletiva).
const EQUIVALENT_COURSE_CODES = {
  MAT02219: ['MAT02050'],
  MAT02050: ['MAT02219']
}

const STORAGE_KEYS = {
  COMPLETED_COURSES: 'ufrgs_pma_completed_courses',
  DESIRED_COURSES: 'ufrgs_pma_desired_courses',
  DESIRED_COURSES_BACKUP: 'ufrgs_pma_desired_courses_backup',
  RESTRICTIONS: 'ufrgs_pma_restrictions',
  SELECTED_CURRICULUM: 'ufrgs_pma_selected_curriculum',
  CUSTOM_TURMAS: 'ufrgs_pma_custom_turmas',
  CUSTOM_TURMAS_DATE: 'ufrgs_pma_custom_turmas_date',
  SAVED_SCHEDULES: 'ufrgs_pma_saved_schedules',
  CREDIT_LIMIT: 'ufrgs_pma_credit_limit',
  GRADUATION_PLAN: 'ufrgs_pma_graduation_plan',
  SEMESTER_CREDIT_LIMITS: 'ufrgs_pma_semester_credit_limits',
  SAVED_GRADUATION_PLANS: 'ufrgs_pma_saved_graduation_plans',
  PLAN_PREFERENCES: 'ufrgs_pma_plan_preferences',
  FROZEN_COURSES: 'ufrgs_pma_frozen_courses'
}

const DEFAULT_PLAN_PREFERENCES = { avoidScheduleConflicts: true, groupByCampus: false, limitHardSubjects: false }

export const dataService = {
  _getScopedKey(baseKey, courseCode = null) {
    const code = (courseCode || curriculumService.getSelectedCourse() || 'CIC').toUpperCase()
    return `${baseKey}_${code}`
  },

  _getItemScoped(baseKey, courseCode = null) {
    const code = (courseCode || curriculumService.getSelectedCourse() || 'CIC').toUpperCase()
    const scopedKey = `${baseKey}_${code}`
    let raw = localStorage.getItem(scopedKey)
    if (raw === null && code === 'CIC') {
      raw = localStorage.getItem(baseKey)
      if (raw !== null) {
        localStorage.setItem(scopedKey, raw)
        localStorage.removeItem(baseKey)
      }
    }
    return raw
  },

  _setItemScoped(baseKey, value, courseCode = null) {
    const scopedKey = this._getScopedKey(baseKey, courseCode)
    localStorage.setItem(scopedKey, value)
  },

  _removeItemScoped(baseKey, courseCode = null) {
    const scopedKey = this._getScopedKey(baseKey, courseCode)
    localStorage.removeItem(scopedKey)
  },
  getCoursesMap(courseCode = null) {
    const selected = (courseCode || curriculumService.getSelectedCourse() || 'CIC').toLowerCase()
    if (!academicData.courses) return {}
    if (academicData.courses[selected]) {
      return academicData.courses[selected]
    }
    if (academicData.courses[selected.toUpperCase()]) {
      return academicData.courses[selected.toUpperCase()]
    }
    return academicData.courses || {}
  },

  getAllCourses(courseCode = null) {
    const map = this.getCoursesMap(courseCode)
    return Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },

  getCourseByCode(code, courseCode = null) {
    if (!code) return null
    const map = this.getCoursesMap(courseCode)
    return map[code.toUpperCase()] || null
  },

  getCourseCredits(code, courseCode = null) {
    if (!code) return 0
    const upper = String(code).toUpperCase().trim()
    const selectedCourse = courseCode || curriculumService.getSelectedCourse()
    const course = this.getCourseByCode(upper, selectedCourse)
    if (course && course.credits !== undefined) return Number(course.credits)
    const subjects = curriculumService.getCurriculumSubjects(selectedCourse)
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
  getTurmas(courseCode = null) {
    const selected = (courseCode || curriculumService.getSelectedCourse() || 'CIC').toLowerCase()
    let list = []
    if (academicData.turmas && !Array.isArray(academicData.turmas)) {
      list = academicData.turmas[selected] || academicData.turmas[selected.toUpperCase()] || []
    } else {
      list = academicData.turmas || []
    }
    const customStr = this._getItemScoped(STORAGE_KEYS.CUSTOM_TURMAS, courseCode)
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

  getTurmasSourceInfo(courseCode = null) {
    const selectedCode = courseCode || curriculumService.getSelectedCourse() || 'CIC'
    const isCustom = !!this._getItemScoped(STORAGE_KEYS.CUSTOM_TURMAS, selectedCode)
    if (isCustom) {
      return {
        isCustom: true,
        date: 'Arquivo carregado pelo usuário',
        label: 'Arquivo carregado pelo usuário',
        courseCode: selectedCode
      }
    }
    let rawDate = null
    if (academicData.last_updated_by_curriculum && typeof academicData.last_updated_by_curriculum === 'object') {
      rawDate = academicData.last_updated_by_curriculum[selectedCode] ||
                academicData.last_updated_by_curriculum['CIC'] ||
                academicData.last_updated_by_curriculum['ECP'] ||
                academicData.last_updated_by_curriculum['GERAL']
    }
    if (!rawDate && typeof academicData.last_updated === 'object' && academicData.last_updated !== null) {
      rawDate = academicData.last_updated[selectedCode] || academicData.last_updated['CIC'] || Object.values(academicData.last_updated)[0]
    }
    if (!rawDate) {
      rawDate = academicData.last_updated || '2026/2'
    }
    if (typeof rawDate === 'string') {
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(rawDate)) {
        const parts = rawDate.split(' ')
        const dateParts = parts[0].split('-')
        rawDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} às ${parts[1]}`
      } else {
        rawDate = rawDate.replace(/\s*-\s*(\d{1,2}:\d{2})/, ' às $1')
      }
    }
    return {
      isCustom: false,
      date: rawDate,
      courseCode: selectedCode,
      label: `Turmas aferidas pelo host da página (${selectedCode} - ${rawDate})`
    }
  },

  getCourseObservation(courseCode, semester = null) {
    if (!courseCode) return null
    const equivalentNote = this._getEquivalentCourseNote(courseCode)
    const targetSemester = semester || curriculumService.selectedSemesterRef?.value || '2026/2'
    const turmas = this.getTurmas().filter(t => (t.course_code === courseCode || t.course_id === courseCode) && (!semester || t.semester === targetSemester))
    const obsMap = new Map()
    turmas.forEach(t => {
      if (t.observacao && typeof t.observacao === 'string' && t.observacao.trim()) {
        obsMap.set(t.section_code, t.observacao.trim())
      }
    })
    let turmaObs = null
    if (obsMap.size === 1) {
      turmaObs = Array.from(new Set(obsMap.values()))[0]
    } else if (obsMap.size > 1) {
      const lines = []
      obsMap.forEach((obs, section) => lines.push(`Turma ${section}: ${obs}`))
      turmaObs = lines.join('\n')
    }
    if (equivalentNote && turmaObs) return `${equivalentNote}\n\n${turmaObs}`
    return equivalentNote || turmaObs
  },

  // Nota fixa (independente das turmas importadas) para disciplinas com equivalência de
  // modalidade cadastrada em EQUIVALENT_COURSE_CODES.
  _getEquivalentCourseNote(courseCode) {
    const equivalents = EQUIVALENT_COURSE_CODES[String(courseCode).toUpperCase()]
    if (!equivalents || equivalents.length === 0) return null
    const names = equivalents.map(code => {
      const course = this.getCourseByCode(code)
      return course ? `${code} - ${course.name}` : code
    })
    return `Equivalente a: ${names.join(', ')}. Cursar uma dispensa a outra.`
  },

  getSectionObservation(courseCode, sectionCode, semester = null) {
    if (!courseCode || !sectionCode) return null
    const targetSemester = semester || curriculumService.selectedSemesterRef?.value || '2026/2'
    const turma = this.getTurmas().find(t => (t.course_code === courseCode || t.course_id === courseCode) && t.section_code === sectionCode && (!semester || t.semester === targetSemester))
    if (turma && turma.observacao && typeof turma.observacao === 'string' && turma.observacao.trim()) {
      return turma.observacao.trim()
    }
    return null
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
    this._setItemScoped(STORAGE_KEYS.CUSTOM_TURMAS, JSON.stringify(turmasArray))
    const now = timestampStr || new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    this._setItemScoped(STORAGE_KEYS.CUSTOM_TURMAS_DATE, now)
  },

  resetToOfficialTurmas() {
    this._removeItemScoped(STORAGE_KEYS.CUSTOM_TURMAS)
    this._removeItemScoped(STORAGE_KEYS.CUSTOM_TURMAS_DATE)
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
      let scheduleRaw = cells[8] || ''
      const profRaw = cells[9] || ''

      let observacao = ''
      const obsMatch = scheduleRaw.match(/Observa[çc][ãa]o(?:es)?:\s*([\s\S]*)/i)
      if (obsMatch) {
        observacao = obsMatch[1].replace(/;$/, '').trim()
        scheduleRaw = scheduleRaw.slice(0, obsMatch.index).trim()
      }

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
          const obsRoomMatch = room.match(/Observa[çc][ãa]o(?:es)?:\s*([\s\S]*)/i)
          if (obsRoomMatch) {
            room = room.slice(0, obsRoomMatch.index).trim()
          }
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
        observacao: observacao,
        professor_name: profRaw.replace(/\n+/g, ' ').trim(),
        schedules: schedules
      })
    })

    return turmas
  },
  getCompletedCourses() {
    const raw = this._getItemScoped(STORAGE_KEYS.COMPLETED_COURSES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      const codes = Array.isArray(parsed) ? parsed : []
      const withEquivalents = new Set(codes)
      codes.forEach(code => {
        (EQUIVALENT_COURSE_CODES[code.toUpperCase()] || []).forEach(eq => withEquivalents.add(eq))
      })
      return [...withEquivalents]
    } catch (e) {
      return []
    }
  },

  saveCompletedCourses(codesArray) {
    const unique = [...new Set(codesArray.filter(Boolean).map(c => c.toUpperCase()))]
    this._setItemScoped(STORAGE_KEYS.COMPLETED_COURSES, JSON.stringify(unique))
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
  getSelectedCurriculum() {
    return this._getItemScoped(STORAGE_KEYS.SELECTED_CURRICULUM) || (curriculumService.getSelectedCourse() === 'ECP' ? 'ecp' : 'cc')
  },

  setSelectedCurriculum(key) {
    this._setItemScoped(STORAGE_KEYS.SELECTED_CURRICULUM, key)
  },
  // Créditos obrigatórios x eletivos já concluídos, para os limiares min_credits_required/
  // min_elective_credits_required (que são sobre "Créditos Obrigatórios"/"Créditos Eletivos" da
  // grade oficial - ver comentário em curriculumService.js - não sobre créditos concluídos em geral).
  getCompletedCreditsByType(courseCode = null) {
    const selectedCourseCode = courseCode || curriculumService.getSelectedCourse() || 'CIC'
    const mandatorySet = new Set(curriculumService.getCurriculumSubjects(selectedCourseCode).map(s => (s.code || s.id || '').toUpperCase()))
    let mandatory = 0
    let elective = 0
    this.getCompletedCourses().forEach(code => {
      const credits = this.getCourseCredits(code, selectedCourseCode)
      if (mandatorySet.has(code.toUpperCase())) mandatory += credits
      else elective += credits
    })
    return { mandatory, elective }
  },

  getEligibleCourses(courseCode = null) {
    const selectedCourseCode = courseCode || curriculumService.getSelectedCourse() || 'CIC'
    const completedSet = new Set(this.getCompletedCourses())
    const allCourses = this.getAllCourses()

    const currSubjects = curriculumService.getCurriculumSubjects(selectedCourseCode)
    const currSubjectCodes = new Set(currSubjects.map(s => (s.code || s.id || '').toUpperCase()))
    const allCourseCodes = new Set(allCourses.map(c => (c.code || '').toUpperCase()))

    const { mandatory: totalCompletedCredits, elective: totalCompletedElectiveCredits } = this.getCompletedCreditsByType(selectedCourseCode)

    return allCourses.filter(course => {
      if (completedSet.has(course.code)) return false
      if ((course.min_credits_required || 0) > totalCompletedCredits) return false
      if ((course.min_elective_credits_required || 0) > totalCompletedElectiveCredits) return false

      const prereqs = course.prerequisites || []
      const allPrereqsMet = prereqs.every(p => {
        const upper = (p || '').toUpperCase()
        if (completedSet.has(upper)) return true
        // Só ignora o pré-requisito se ele nem existir no catálogo do curso atual (ex.: código
        // de grade obrigatória de outro currículo). Se for uma disciplina real daqui - obrigatória
        // OU eletiva - e não tiver sido concluída, bloqueia sim (antes só checava obrigatórias,
        // deixando pré-requisito eletiva->eletiva passar batido).
        if (!currSubjectCodes.has(upper) && !allCourseCodes.has(upper)) return true
        return false
      })
      return allPrereqsMet
    })
  },
  getDesiredCourses() {
    const raw = this._getItemScoped(STORAGE_KEYS.DESIRED_COURSES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveDesiredCourses(list) {
    this._setItemScoped(STORAGE_KEYS.DESIRED_COURSES, JSON.stringify(list))
  },

  // Troca temporariamente a lista de disciplinas desejadas (ex.: preview de horário de um
  // semestre futuro do plano de formatura), guardando a lista atual para poder restaurá-la depois.
  // Chamadas repetidas não sobrescrevem o backup - só a primeira, para não perder a lista original.
  previewDesiredCourses(list) {
    if (!this._getItemScoped(STORAGE_KEYS.DESIRED_COURSES_BACKUP)) {
      this._setItemScoped(STORAGE_KEYS.DESIRED_COURSES_BACKUP, JSON.stringify(this.getDesiredCourses()))
    }
    this.saveDesiredCourses(list)
  },

  hasDesiredCoursesBackup() {
    return Boolean(this._getItemScoped(STORAGE_KEYS.DESIRED_COURSES_BACKUP))
  },

  restoreDesiredCoursesBackup() {
    const raw = this._getItemScoped(STORAGE_KEYS.DESIRED_COURSES_BACKUP)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw)
      this.saveDesiredCourses(Array.isArray(parsed) ? parsed : [])
    } catch (e) {
      this.saveDesiredCourses([])
    }
    this._setItemScoped(STORAGE_KEYS.DESIRED_COURSES_BACKUP, '')
    return true
  },

  getRestrictions() {
    const raw = this._getItemScoped(STORAGE_KEYS.RESTRICTIONS)
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
    this._setItemScoped(STORAGE_KEYS.RESTRICTIONS, JSON.stringify(validList))
  },
  getSavedSchedules() {
    const raw = this._getItemScoped(STORAGE_KEYS.SAVED_SCHEDULES)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveSavedSchedules(list) {
    this._setItemScoped(STORAGE_KEYS.SAVED_SCHEDULES, JSON.stringify(list))
  },
  getCreditLimit() {
    const raw = this._getItemScoped(STORAGE_KEYS.CREDIT_LIMIT)
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 24
  },

  saveCreditLimit(limit) {
    this._setItemScoped(STORAGE_KEYS.CREDIT_LIMIT, String(limit))
  },

  getPlanPreferences() {
    const raw = this._getItemScoped(STORAGE_KEYS.PLAN_PREFERENCES)
    if (!raw) return { ...DEFAULT_PLAN_PREFERENCES }
    try {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_PLAN_PREFERENCES, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
    } catch (e) {
      return { ...DEFAULT_PLAN_PREFERENCES }
    }
  },

  savePlanPreferences(prefs) {
    this._setItemScoped(STORAGE_KEYS.PLAN_PREFERENCES, JSON.stringify(prefs))
  },

  getFrozenCourses() {
    const raw = this._getItemScoped(STORAGE_KEYS.FROZEN_COURSES)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return (parsed && typeof parsed === 'object') ? parsed : {}
    } catch (e) {
      return {}
    }
  },

  saveFrozenCourses(frozen) {
    this._setItemScoped(STORAGE_KEYS.FROZEN_COURSES, JSON.stringify(frozen))
  },

  getGraduationPlan() {
    const raw = this._getItemScoped(STORAGE_KEYS.GRADUATION_PLAN)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch (e) {
      return null
    }
  },

  saveGraduationPlan(semesters) {
    this._setItemScoped(STORAGE_KEYS.GRADUATION_PLAN, JSON.stringify(semesters))
  },

  // Mapa esparso { semIndex: limite } - só guarda os semestres com limite diferente do padrão global.
  getSemesterCreditLimits() {
    const raw = this._getItemScoped(STORAGE_KEYS.SEMESTER_CREDIT_LIMITS)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return (parsed && typeof parsed === 'object') ? parsed : {}
    } catch (e) {
      return {}
    }
  },

  saveSemesterCreditLimits(map) {
    this._setItemScoped(STORAGE_KEYS.SEMESTER_CREDIT_LIMITS, JSON.stringify(map))
  },

  getSavedGraduationPlans() {
    const raw = this._getItemScoped(STORAGE_KEYS.SAVED_GRADUATION_PLANS)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  },

  saveSavedGraduationPlans(list) {
    this._setItemScoped(STORAGE_KEYS.SAVED_GRADUATION_PLANS, JSON.stringify(list))
  },

  getElectiveCatalog(courseCode = null) {
    const code = courseCode || curriculumService.getSelectedCourse()
    const mandatorySet = new Set(curriculumService.getCurriculumSubjects(code).map(s => s.code.toUpperCase()))
    return this.getAllCourses(code).filter(c => c.code && !mandatorySet.has(c.code.toUpperCase()))
  },

  setElectiveSemester(code, credits, semIndex = null) {
    const semesters = (this.getGraduationPlan() || []).map(sem => [...sem])
    for (const sem of semesters) {
      const i = sem.findIndex(c => c.toUpperCase() === code.toUpperCase())
      if (i !== -1) sem.splice(i, 1)
    }
    if (semIndex !== null && semIndex !== undefined) {
      while (semesters.length <= semIndex) semesters.push([])
      const sem = semesters[semIndex]
      const placeholderIdx = sem.findIndex(c => c === `ELETIVA-${credits}`)
      if (placeholderIdx !== -1) sem[placeholderIdx] = code
      else sem.push(code)
    }
    const trimmed = semesters.filter(sem => sem.length > 0)
    this.saveGraduationPlan(trimmed)
    return trimmed
  }
}
