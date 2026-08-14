// Teste de precisão: manda perguntas com resposta conhecida pro Worker (que chama a Groq)
// e confere se a resposta contém/evita os códigos certos. Roda contra o Worker já deployado.
// Uso: node test.mjs [URL_DO_WORKER]

import { readFileSync } from 'fs'

const WORKER_URL = process.argv[2] || 'https://pam-ai-worker.rafesilvadesouza.workers.dev'

const raw = JSON.parse(readFileSync(new URL('../app-frontend/src/data/ufrgs_data.json', import.meta.url)))
const academic = JSON.parse(readFileSync(new URL('../app-frontend/src/data/academic_data.json', import.meta.url)))

// Mesma transformação de curriculumService.getCurriculumSubjects() para CIC
function toCompactSubjects(curriculum) {
  return curriculum.map(item => {
    const semester = parseInt(item.etapa.replace(/\D/g, '')) || 1
    const prereqCodes = (item.pre_requisitos || [])
      .filter(pre => !pre.startsWith('Créditos'))
      .map(pre => pre.split(' - ')[0].trim())
    return {
      codigo: item.codigo || 'TCC',
      nome: item.nome,
      semestre: semester,
      creditos: parseInt(item.creditos),
      pre_requisitos: prereqCodes
    }
  })
}

const fullCurriculum = toCompactSubjects(raw.curriculum)

// Mesma lógica de dataService.getEligibleCourses(): pré-requisitos todos cumpridos e ainda não concluída
function eligibleCourses(curriculum, completed) {
  const completedSet = new Set(completed.map(c => c.toUpperCase()))
  return curriculum
    .filter(c => !completedSet.has(c.codigo.toUpperCase()))
    .filter(c => c.pre_requisitos.every(p => completedSet.has(p.toUpperCase())))
    .map(c => c.codigo)
}

// Cópia do array hardcoded ecpSubjects em curriculumService.js (não dá pra importar o .js
// direto aqui porque ele usa `localStorage` do Vue no top-level, que não existe em Node puro)
const ecpSubjects = [
  { code: 'INF01202', name: 'ALGORÍTMOS E PROGRAMAÇÃO - CIC', semester: 1, credits: 6, prerequisites: [] },
  { code: 'MAT01353', name: 'CÁLCULO E GEOMETRIA ANALÍTICA I - A', semester: 1, credits: 6, prerequisites: [] },
  { code: 'FIS01181', name: 'FÍSICA I-C', semester: 1, credits: 6, prerequisites: [] },
  { code: 'ECP99002', name: 'INTRODUÇÃO À ENGENHARIA DE COMPUTAÇÃO', semester: 1, credits: 2, prerequisites: [] },
  { code: 'INF05508', name: 'LÓGICA PARA COMPUTAÇÃO', semester: 1, credits: 4, prerequisites: [] },
  { code: 'MAT01355', name: 'ÁLGEBRA LINEAR I - A', semester: 2, credits: 4, prerequisites: ['MAT01353'] },
  { code: 'INF01075', name: 'ARQUITETURA DE COMPUTADORES', semester: 2, credits: 4, prerequisites: ['INF01202'] },
  { code: 'MAT01354', name: 'CÁLCULO E GEOMETRIA ANALÍTICA II - A', semester: 2, credits: 6, prerequisites: ['MAT01353'] },
  { code: 'INF01203', name: 'ESTRUTURAS DE DADOS', semester: 2, credits: 4, prerequisites: ['INF01202'] },
  { code: 'FIS01182', name: 'FÍSICA GERAL - ELETROMAGNETISMO', semester: 2, credits: 6, prerequisites: ['FIS01181', 'MAT01353'] },
  { code: 'MAT01375', name: 'MATEMÁTICA DISCRETA B', semester: 2, credits: 4, prerequisites: [] },
  { code: 'INF01120', name: 'DESENVOLVIMENTO DE SOFTWARE', semester: 3, credits: 4, prerequisites: ['INF01203'] },
  { code: 'MAT01167', name: 'EQUAÇÕES DIFERENCIAIS II', semester: 3, credits: 6, prerequisites: ['MAT01354', 'MAT01355'] },
  { code: 'FIS01183', name: 'FÍSICA III-C', semester: 3, credits: 6, prerequisites: ['FIS01182'] },
  { code: 'INF01086', name: 'PROJETO DE CIRCUITOS DIGITAIS', semester: 3, credits: 6, prerequisites: ['INF01075'] },
  { code: 'INF05027', name: 'PROJETO E ANÁLISE DE ALGORITMOS I', semester: 3, credits: 4, prerequisites: ['INF01203', 'MAT01353', 'MAT01375'] },
  { code: 'ENG10001', name: 'CIRCUITOS ELÉTRICOS I - C', semester: 4, credits: 4, prerequisites: ['FIS01182', 'MAT01167'] },
  { code: 'MAT01168', name: 'MATEMÁTICA APLICADA II', semester: 4, credits: 6, prerequisites: ['MAT01167'] },
  { code: 'INF01113', name: 'ORGANIZAÇÃO DE COMPUTADORES', semester: 4, credits: 4, prerequisites: ['INF01086'] },
  { code: 'INF05035', name: 'TEORIA DA COMPUTAÇÃO', semester: 4, credits: 4, prerequisites: ['INF05508', 'MAT01375'] },
  { code: 'ENG10002', name: 'CIRCUITOS ELÉTRICOS II - C', semester: 5, credits: 4, prerequisites: ['ENG10001', 'MAT01168'] },
  { code: 'INF01127', name: 'ENGENHARIA DE SOFTWARE N', semester: 5, credits: 4, prerequisites: ['INF01120'] },
  { code: 'INF01175', name: 'SISTEMAS DIGITAIS PARA COMPUTADORES A', semester: 5, credits: 4, prerequisites: ['INF01086'] },
  { code: 'INF01142', name: 'SISTEMAS OPERACIONAIS I N', semester: 5, credits: 4, prerequisites: ['INF01075', 'INF01203'] },
  { code: 'ENG04010', name: 'TEORIA ELETROMAGNÉTICA E ONDAS', semester: 5, credits: 4, prerequisites: ['FIS01183', 'MAT01168'] },
  { code: 'ENG04077', name: 'CIRCUITOS ELETRÔNICOS I', semester: 6, credits: 6, prerequisites: ['ENG10002'] },
  { code: 'INF01185', name: 'CONCEPÇÃO DE CIRCUITOS INTEGRADOS I', semester: 6, credits: 4, prerequisites: ['ENG10001', 'INF01086'] },
  { code: 'ENG10003', name: 'LABORATÓRIO DE CIRCUITOS ELÉTRICOS', semester: 6, credits: 2, prerequisites: ['ENG10002'] },
  { code: 'INF01082', name: 'LABORATÓRIO DE REDES DE COMPUTADORES', semester: 6, credits: 2, prerequisites: ['INF01075'] },
  { code: 'INF01084', name: 'REDES DE COMPUTADORES E INTERNET', semester: 6, credits: 4, prerequisites: ['INF01075'] },
  { code: 'INF01194', name: 'CONCEPÇÃO DE CIRCUITOS INTEGRADOS II', semester: 7, credits: 4, prerequisites: ['INF01175', 'INF01185'] },
  { code: 'INF01085', name: 'SISTEMAS DISTRIBUÍDOS E TOLERANTES A FALHAS', semester: 7, credits: 4, prerequisites: ['INF01142'] },
  { code: 'MAT02219', name: 'PROBABILIDADE E ESTATÍSTICA', semester: 4, credits: 4, prerequisites: ['MAT01353'] },
  { code: 'ECP99001', name: 'PROJETO DE FINAL DE CURSO DE ENGENHARIA DE COMPUTAÇÃO', semester: 9, credits: 2, prerequisites: [], min_credits_required: 146, min_elective_credits_required: 30 },
  { code: 'TG-I-ECP', name: 'TRABALHO DE GRADUAÇÃO I - ECP', semester: 9, credits: 0, prerequisites: [], min_credits_required: 146, min_elective_credits_required: 30 },
  { code: 'TG-II-ECP', name: 'TRABALHO DE GRADUAÇÃO II - ECP', semester: 10, credits: 0, prerequisites: ['ECP99001', 'TG-I-ECP'] }
]

const ecpCurriculum = ecpSubjects.map(s => ({
  codigo: s.code, nome: s.name, semestre: s.semester, creditos: s.credits, pre_requisitos: s.prerequisites,
  ...(s.min_credits_required ? { min_creditos_obrigatorios_requeridos: s.min_credits_required } : {}),
  ...(s.min_elective_credits_required ? { min_creditos_eletivos_requeridos: s.min_elective_credits_required } : {})
}))

// Mesma lógica de dataService.getElectiveCatalog(): todo curso do catálogo que não está
// na grade obrigatória do curso selecionado
function electiveCatalog(mandatoryCurriculum, courseKey) {
  const mandatorySet = new Set(mandatoryCurriculum.map(c => c.codigo.toUpperCase()))
  return Object.values(academic.courses[courseKey] || {})
    .filter(c => c.code && !mandatorySet.has(c.code.toUpperCase()))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function ask(question, context, attempt = 1) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context })
  })
  const data = await res.json()
  if (res.status === 429 && attempt <= 3) {
    const waitMatch = /try again in ([\d.]+)s/.exec(data.detail || '')
    const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 1000 : 15000
    console.log(`  (rate limit, aguardando ${Math.round(waitMs / 1000)}s antes de tentar de novo...)`)
    await sleep(waitMs)
    return ask(question, context, attempt + 1)
  }
  return data.answer || `[ERRO ${res.status}] ${JSON.stringify(data)}`
}

// Remove acentos pra não reprovar quando a IA usa a grafia padrão (ex: "Algoritmos") e o dado
// de origem tem uma grafia não-padrão (ex: "ALGORÍTMOS", como vem do Portal do Aluno)
const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

function check(answer, mustContain = [], mustNotContain = [], mustNotContainRegex = []) {
  const normAnswer = normalize(answer)
  const missing = mustContain.filter(s => !normAnswer.includes(normalize(s)))
  const leaked = mustNotContain.filter(s => normAnswer.includes(normalize(s)))
  const badPattern = mustNotContainRegex.filter(re => re.test(answer))
  return { ok: missing.length === 0 && leaked.length === 0 && badPattern.length === 0, missing, leaked, badPattern }
}

const cases = [
  {
    label: 'Pré-requisitos diretos de Estruturas de Dados (contexto completo)',
    question: 'Quais são os pré-requisitos de Estruturas de Dados (INF01203)?',
    context: { curso: 'CIC', disciplinas_curriculo: fullCurriculum, disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: [] },
    mustContain: ['INF01202', 'ALGORÍTMOS E PROGRAMAÇÃO', 'INF05008', 'PENSAMENTO COMPUTACIONAL']
  },
  {
    label: 'Elegibilidade: faltando 1 pré-requisito (não deveria poder cursar)',
    question: 'Eu já cursei INF01202. Posso cursar Estruturas de Dados (INF01203) agora?',
    context: { curso: 'CIC', disciplinas_curriculo: fullCurriculum, disciplinas_concluidas: ['INF01202'], disciplinas_desejadas: [], disciplinas_elegiveis: eligibleCourses(fullCurriculum, ['INF01202']) },
    mustContain: ['INF05008', 'PENSAMENTO COMPUTACIONAL'],
    mustNotContainRegex: [/\bsim\b.{0,40}pode cursar/i, /pode cursar.{0,10}agora/i]
  },
  {
    label: 'Elegibilidade: todos pré-requisitos cumpridos (deveria poder cursar)',
    question: 'Eu já cursei INF01202 e INF05008. Posso cursar Estruturas de Dados (INF01203) agora?',
    context: { curso: 'CIC', disciplinas_curriculo: fullCurriculum, disciplinas_concluidas: ['INF01202', 'INF05008'], disciplinas_desejadas: [], disciplinas_elegiveis: eligibleCourses(fullCurriculum, ['INF01202', 'INF05008']) },
    mustContain: ['INF01203']
  },
  {
    label: 'GROUNDING: contexto incompleto (só lista INF01202 como matéria existente) — não deveria inventar INF05008',
    question: 'Quais são os pré-requisitos de Estruturas de Dados (INF01203)?',
    context: {
      curso: 'CIC',
      disciplinas_curriculo: [
        { codigo: 'INF01202', nome: 'ALGORÍTMOS E PROGRAMAÇÃO - CIC', semestre: 1, creditos: 6, pre_requisitos: [] },
        { codigo: 'INF01203', nome: 'ESTRUTURAS DE DADOS', semestre: 2, creditos: 4, pre_requisitos: ['INF01202'] }
      ],
      disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: []
    },
    mustContain: ['INF01202'],
    mustNotContain: ['INF05008']
  },
  {
    label: 'Créditos de uma disciplina',
    question: 'Quantos créditos tem Estruturas de Dados (INF01203)?',
    context: { curso: 'CIC', disciplinas_curriculo: fullCurriculum, disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: [] },
    mustContain: ['4']
  },
  {
    label: '[ELETIVA-CIC] Pré-requisito de uma eletiva (Laboratório de Redes de Computadores, fora da grade obrigatória)',
    question: 'Quais são os pré-requisitos da eletiva Laboratório de Redes de Computadores (INF01082)?',
    context: {
      curso: 'CIC',
      disciplinas_curriculo: fullCurriculum,
      disciplinas_eletivas: electiveCatalog(fullCurriculum, 'cic').map(c => ({ codigo: c.code, nome: c.name, creditos: c.credits, pre_requisitos: c.prerequisites })),
      disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: []
    },
    mustContain: ['INF01075']
  },
  {
    label: '[ELETIVA-CIC] Créditos de eletiva',
    question: 'Quantos créditos tem a eletiva Laboratório de Redes de Computadores (INF01082)?',
    context: {
      curso: 'CIC',
      disciplinas_curriculo: fullCurriculum,
      disciplinas_eletivas: electiveCatalog(fullCurriculum, 'cic').map(c => ({ codigo: c.code, nome: c.name, creditos: c.credits, pre_requisitos: c.prerequisites })),
      disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: []
    },
    mustContain: ['2']
  },
  {
    label: '[ECP] Pré-requisito de disciplina obrigatória (Circuitos Eletrônicos I)',
    question: 'Quais são os pré-requisitos de Circuitos Eletrônicos I (ENG04077)?',
    context: { curso: 'ECP', disciplinas_curriculo: ecpCurriculum, disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: [] },
    mustContain: ['ENG10002']
  },
  {
    label: '[ECP] Regra especial de créditos mínimos (Projeto de Final de Curso)',
    question: 'Quantos créditos obrigatórios e eletivos eu preciso ter concluído pra cursar o Projeto de Final de Curso de Engenharia de Computação (ECP99001)?',
    context: { curso: 'ECP', disciplinas_curriculo: ecpCurriculum, disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: [] },
    mustContain: ['146', '30']
  },
  {
    label: '[ELETIVA-ECP] Pré-requisito de uma eletiva (Bancos de Dados, fora da grade obrigatória de ECP)',
    question: 'Quais são os pré-requisitos da eletiva Bancos de Dados (INF01145) pro curso de Engenharia de Computação?',
    context: {
      curso: 'ECP',
      disciplinas_curriculo: ecpCurriculum,
      disciplinas_eletivas: electiveCatalog(ecpCurriculum, 'ecp').map(c => ({ codigo: c.code, nome: c.name, creditos: c.credits, pre_requisitos: c.prerequisites })),
      disciplinas_concluidas: [], disciplinas_desejadas: [], disciplinas_elegiveis: []
    },
    mustContain: ['INF01203']
  }
]

const results = []
for (const c of cases) {
  const answer = await ask(c.question, c.context)
  const result = check(answer, c.mustContain, c.mustNotContain, c.mustNotContainRegex)
  results.push({ ...c, answer, ...result })
}

let passed = 0
for (const r of results) {
  console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.label}`)
  console.log(`  Pergunta: ${r.question}`)
  console.log(`  Resposta: ${r.answer}`)
  if (!r.ok) {
    if (r.missing.length) console.log(`  Faltou mencionar: ${r.missing.join(', ')}`)
    if (r.leaked.length) console.log(`  Mencionou o que não devia: ${r.leaked.join(', ')}`)
    if (r.badPattern.length) console.log(`  Padrão indevido encontrado na resposta (ex: disse "sim pode" quando não podia)`)
  }
  if (r.ok) passed++
}
console.log(`\n${passed}/${results.length} passaram`)
