// Os planos de ensino em public/planos_ensino/ vêm de PDFs oficiais da UFRGS extraídos com
// pdftotext, gerados em épocas e formatos de template bem diferentes (2008-2009 até o atual).
// Este parser reconhece os cabeçalhos de seção mais comuns entre esses formatos (com ou sem
// numeração, maiúsculas ou não, com variações de sufixo) e agrupa o texto em blocos uniformes
// para exibição. Cabeçalhos não reconhecidos não quebram nada: o texto continua dentro da seção
// anterior.

const ALIASES = {
  'dados de identificação': 'identificacao',
  identificação: 'identificacao',
  'carga horária': 'identificacao',
  súmula: 'sumula',
  ementa: 'sumula',
  'súmula e objetivos': 'sumula',
  currículos: 'curriculos',
  objetivos: 'objetivos',
  'objetivos da disciplina': 'objetivos',
  'conteúdo programático': 'conteudo',
  'conteúdos programáticos': 'conteudo',
  metodologia: 'metodologia',
  'metodologia adotada': 'metodologia',
  'metodologia e experiências de aprendizagem': 'metodologia',
  'experiências de aprendizagem': 'metodologia',
  cronograma: 'cronograma',
  'cronograma de atividades': 'cronograma',
  'cronograma por aula': 'cronograma',
  avaliação: 'avaliacao',
  'critérios de avaliação': 'avaliacao',
  'atividades de recuperação previstas': 'recuperacao',
  bibliografia: 'bibliografia',
  bibiografia: 'bibliografia',
  'bibliografia básica': 'bibliografia',
  'bibliografia básica obrigatória': 'bibliografia',
  'bibliografia complementar': 'bibliografia',
  'bibliografia adicional': 'bibliografia',
  'bibliografia principal': 'bibliografia',
  'básica essencial': 'bibliografia',
  básica: 'bibliografia',
  complementar: 'bibliografia',
  'outras referências': 'bibliografia',
  referências: 'bibliografia',
  observações: 'observacoes',
}

// Cabeçalhos que aparecem com sufixo variável (ex.: "Conteúdo Programático e Cronograma de
// Aulas"). Comparados por prefixo, do mais longo para o mais específico primeiro.
const PREFIX_ANCHORS = [
  ['cronograma de atividades', 'cronograma'],
  ['cronograma por aula', 'cronograma'],
  ['conteúdo programático', 'conteudo'],
  ['conteúdos programáticos', 'conteudo'],
  ['metodologia e experiências de aprendizagem', 'metodologia'],
  ['metodologia adotada', 'metodologia'],
  ['critérios de avaliação', 'avaliacao'],
  ['bibliografia básica', 'bibliografia'],
  ['bibliografia complementar', 'bibliografia'],
  ['bibliografia de referência', 'bibliografia'],
  ['atividades de recuperação', 'recuperacao'],
].sort((a, b) => b[0].length - a[0].length)

export const ICON_BY_CATEGORY = {
  identificacao: 'mdi-card-account-details-outline',
  sumula: 'mdi-text-box-outline',
  curriculos: 'mdi-school-outline',
  objetivos: 'mdi-target',
  conteudo: 'mdi-format-list-bulleted',
  metodologia: 'mdi-teach',
  cronograma: 'mdi-calendar-clock-outline',
  avaliacao: 'mdi-clipboard-check-outline',
  recuperacao: 'mdi-restore',
  bibliografia: 'mdi-book-open-variant',
  observacoes: 'mdi-information-outline',
  generic: 'mdi-file-document-outline',
}

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'com', 'no', 'na', 'à', 'ao'])
const ALLCAPS_RE = /^[A-ZÀ-ÖØ-Þ0-9\s.,:()\-/ºª%]+$/
const NOISE_LINE_RE = /^(PLANO DE ENSINO|Data de Emissão:.*|Página\s+\d+)$/

function humanize(text) {
  const t = text.trim().replace(/\s+/g, ' ')
  if (/[a-zà-öø-ÿ]/.test(t)) return t.charAt(0).toUpperCase() + t.slice(1)
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function isAllCapsHeader(s) {
  if (s.length < 4 || s.length > 70) return false
  if (!ALLCAPS_RE.test(s)) return false
  const letters = (s.match(/[A-ZÀ-ÖØ-Þ]/g) || []).length
  return letters >= 4
}

// Linhas "Rótulo: valor" (ex.: "CRÉDITOS:      4", "CÓDIGO: INF01043") não são cabeçalhos de
// seção mesmo quando o rótulo está em maiúsculas - têm dois-pontos seguido de conteúdo no meio
// da linha, não só no final.
const LABEL_VALUE_RE = /:\s*\S/

function classify(rawLine, precededByBlank) {
  const stripped = rawLine.trim()
  if (!stripped) return null
  // Cabeçalhos reais sempre vêm em parágrafo próprio nesses PDFs; linhas de tabela (ex.: cada
  // linha da lista de Currículos) e pares rótulo/valor consecutivos não têm quebra antes.
  if (!precededByBlank) return null

  const withoutNum = stripped.replace(/^\d{1,2}[.)]?\s+/, '')
  const withoutColon = withoutNum.replace(/[:\s]+$/, '')
  const key = withoutColon.replace(/\s+/g, ' ').toLowerCase()

  if (ALIASES[key]) return { category: ALIASES[key], title: humanize(withoutColon) }

  if (withoutColon.length <= 90) {
    const anchor = PREFIX_ANCHORS.find(([phrase]) => key.startsWith(phrase))
    if (anchor) return { category: anchor[1], title: isAllCapsHeader(withoutColon) ? humanize(withoutColon) : withoutColon }
  }

  // A partir daqui só resta a heurística genérica de "linha inteira em maiúsculas" - essa
  // precisa do filtro extra de rótulo/valor (ex.: "CRÉDITOS:      4") por não vir de uma lista
  // curada de frases conhecidas.
  if (LABEL_VALUE_RE.test(withoutColon)) return null
  if (isAllCapsHeader(withoutColon)) return { category: 'generic', title: humanize(withoutColon) }

  return null
}

export function parsePlano(rawText) {
  const lines = (rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => !NOISE_LINE_RE.test(line.trim()))

  const rawSections = []
  let current = { title: null, category: null, lines: [] }
  let foundAnyHeader = false
  let precededByBlank = true

  for (const line of lines) {
    const header = classify(line, precededByBlank)
    if (header) {
      foundAnyHeader = true
      rawSections.push(current)
      current = { title: header.title, category: header.category, lines: [] }
    } else {
      current.lines.push(line)
    }
    precededByBlank = line.trim().length === 0
  }
  rawSections.push(current)

  const finalize = block => block.join('\n').replace(/\n{3,}/g, '\n\n').trim()

  if (!foundAnyHeader) {
    const whole = finalize(lines)
    return whole ? [{ title: 'Plano de Ensino', category: 'generic', text: whole }] : []
  }

  const sections = rawSections
    .map(s => ({ title: s.title, category: s.category, text: finalize(s.lines) }))
    .filter(s => s.text.length > 0)

  if (sections.length && sections[0].title === null) {
    sections[0].title = 'Cabeçalho'
    sections[0].category = 'generic'
  }

  return sections
}
