import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { dataService } from './dataService'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const ALIASES = {
  'tecnicasdeconstrucaodeprogramas': 'INF01120',
  'introducaoaarquiteturadecomputadores': 'INF01112',
  'arquiteturaeorganizacaodecomputadoresi': 'INF01075',
  'organizacaodecomputadoresb': 'INF01113',
  'teoriadacomputacaon': 'INF05035',
  'introducaoaengenhariadecomputacao': 'ECP99002'
}

const SYNONYM_CODES = {
  'ENG10031': 'ECP99002',
  'ECP9902': 'ECP99002'
}

function normalizeName(name) {
  if (!name) return ''
  let n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  n = n.replace(/\s*-\s*[a-z0-9]{1,3}$/, '')
  n = n.replace(/\b(a|b|c|d|cic|n)\b$/, '')
  return n.replace(/[^a-z0-9]/g, '').trim()
}

function checkCourseStatus(text) {
  if (!text) return { isCompleted: false, isRejected: false }
  const lower = text.toLowerCase()
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\ufffd/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')

  const completedKws = [
    'aprovado', 'aprovada', 'aprov',
    'liberacao com credito', 'liberao com crdito', 'liberado com credito', 'liberado com crdito',
    'liberacao sem credito', 'liberao sem crdito', 'liberado sem credito', 'liberado sem crdito',
    'aproveitamento com credito', 'aproveitamento com crdito',
    'aproveitamento sem credito', 'aproveitamento sem crdito',
    'dispensa com credito', 'dispensa com crdito',
    'dispensa sem credito', 'dispensa sem crdito'
  ]

  const isCompleted = completedKws.some(kw => lower.includes(kw) || normalized.includes(kw)) ||
    /libera[^\s]*\s+(com|sem)\s+cr[^\s]*dito/i.test(lower) ||
    /libera[^\s]*\s+(com|sem)\s+cr[^\s]*dito/i.test(normalized)

  const rejectedKws = [
    'reprovado', 'reprovada', 'reprov',
    'matriculado', 'matriculada', 'matricula',
    'trancado', 'trancamento',
    'cancelada', 'cancelado', 'cancel'
  ]

  const isRejected = rejectedKws.some(kw => lower.includes(kw) || normalized.includes(kw))

  return { isCompleted, isRejected }
}

export const pdfParserService = {
  async readTextFileSafe(file) {
    try {
      const buffer = await file.arrayBuffer()
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      } catch (e) {
        return new TextDecoder('iso-8859-1').decode(buffer)
      }
    } catch (err) {
      return await file.text()
    }
  },

  async parseTranscript(file) {
    return this.parsePdfTranscript(file)
  },

  async parsePdfTranscript(file) {
    const isHtml = file.name?.toLowerCase().endsWith('.html') || file.name?.toLowerCase().endsWith('.htm') || file.type === 'text/html'
    const completedCodes = new Set()
    const completedNames = new Set()
    let fullText = ''

    if (isHtml) {
      const htmlText = await this.readTextFileSafe(file)
      if (/sess[aã]o expirou/i.test(htmlText)) {
        return {
          totalFound: 0,
          courses: [],
          error: 'session_expired'
        }
      }

      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlText, 'text/html')
        const rows = doc.querySelectorAll('tr')
        rows.forEach(tr => {
          const text = (tr.textContent || '').trim()
          const match = text.match(/[\[\(]([A-Z0-9]{3,10})[\]\)]/)
          if (match) {
            const code = match[1].toUpperCase()
            const { isCompleted, isRejected } = checkCourseStatus(text)
            if (isCompleted && !isRejected) {
              completedCodes.add(code)
            }
          }
        })
      }
      fullText = htmlText.replace(/<(br|tr|table|div|p|li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    } else {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map(item => item.str).join('\n')
        fullText += pageText + '\n'
      }

      if (!fullText || fullText.replace(/\s+/g, '').length < 10) {
        return {
          totalFound: 0,
          courses: [],
          error: 'empty_pdf'
        }
      }
    }

    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(/[\[\(]([A-Z0-9]{3,10})[\]\)]/)
      if (match) {
        const code = match[1].toUpperCase()
        const blockLines = [line]
        for (let j = 1; j <= 12; j++) {
          if (i + j >= lines.length) break
          const nextLine = lines[i + j]
          if (/[\[\(][A-Z0-9]{3,10}[\]\)]/.test(nextLine)) break
          if (nextLine.includes('Página') || nextLine.includes('Vínculo em') || nextLine.includes('Créditos Obtidos')) break
          blockLines.push(nextLine)
        }
        const blockText = blockLines.join(' ')

        const { isCompleted, isRejected } = checkCourseStatus(blockText)
        if (isCompleted && !isRejected) {
          completedCodes.add(code)
        }
      }
    }

    // Build database maps
    const coursesMap = dataService.getCoursesMap()
    const dbByCode = {}
    const dbByName = {}
    Object.values(coursesMap).forEach(course => {
      dbByCode[course.code.toUpperCase()] = course
      dbByName[normalizeName(course.name)] = course
    })

    const matchedCourses = []
    const addedCodes = new Set()

    // 1. Match codes and synonym codes
    completedCodes.forEach(code => {
      let upper = code.toUpperCase()
      if (SYNONYM_CODES[upper]) {
        upper = SYNONYM_CODES[upper]
      }
      if (dbByCode[upper] && !addedCodes.has(upper)) {
        addedCodes.add(upper)
        matchedCourses.push(dbByCode[upper])
      }
      Object.values(coursesMap).forEach(course => {
        if (course.synonyms && Array.isArray(course.synonyms)) {
          if (course.synonyms.includes(upper) || course.synonyms.includes(code.toUpperCase())) {
            if (!addedCodes.has(course.code)) {
              addedCodes.add(course.code)
              matchedCourses.push(course)
            }
          }
        }
      })
    })

    // 2. Match names
    completedNames.forEach(name => {
      const norm = normalizeName(name)
      if (!norm) return
      let targetCode = null
      if (ALIASES[norm]) {
        targetCode = ALIASES[norm]
      } else if (dbByName[norm]) {
        targetCode = dbByName[norm].code
      }
      if (targetCode && dbByCode[targetCode] && !addedCodes.has(targetCode)) {
        addedCodes.add(targetCode)
        matchedCourses.push(dbByCode[targetCode])
      }
    })

    return {
      totalFound: matchedCourses.length,
      courses: matchedCourses.sort((a, b) => a.code.localeCompare(b.code))
    }
  }
}
