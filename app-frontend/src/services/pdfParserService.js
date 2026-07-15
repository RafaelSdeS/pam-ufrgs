import * as pdfjsLib from 'pdfjs-dist'
import academicData from '../data/academic_data.json'

// Set local/bundled worker or CDN fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

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

export const pdfParserService = {
  async parsePdfTranscript(file) {
    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
    
    let fullText = ''
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join('\n')
      fullText += pageText + '\n'
    }

    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const completedCodes = new Set()
    const completedNames = new Set()

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
        const blockText = blockLines.join(' ').toLowerCase()

        const isCompleted = [
          'aprovado', 'aprovada',
          'liberação com crédito', 'liberação com credito', 'liberaçao com credito',
          'liberado com crédito', 'liberado com credito',
          'aproveitamento com crédito', 'aproveitamento com credito',
          'dispensa com crédito', 'dispensa com credito'
        ].some(kw => blockText.includes(kw))

        const isRejected = [
          'reprovado', 'reprovada', 'reprov',
          'matriculado', 'matriculada',
          'trancado', 'trancamento',
          'sem crédito', 'sem credito',
          'cancelada', 'cancelado'
        ].some(kw => blockText.includes(kw))

        if (isCompleted && !isRejected) {
          completedCodes.add(code)
        }
      }
    }

    // Build database maps
    const coursesMap = academicData.courses || {}
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
