// Estimativa de dificuldade por reputação geral entre alunos do CIC/ECP - não é uma medida oficial.
// Chaves ausentes caem no fallback 'medio' em getCourseDifficulty.
// Classificação revisada a partir das súmulas/planos de ensino oficiais (ementas.inf.ufrgs.br,
// dep.ina/planos) baixados para ementas_ufrgs/ na raiz do repo - não só reputação de corredor.
export const COURSE_DIFFICULTY = {
  // Fáceis
  ADM01134: 'facil',
  ECO02254: 'facil',
  ECP99002: 'facil',
  INF01087: 'facil',
  INF01140: 'facil',
  INT00003: 'facil',
  INF05008: 'facil',
  INF01216: 'facil',
  INF99003: 'facil',
  INF01217: 'facil',
  INF01043: 'facil', // Interação Humano-Computador: conceitual/projeto de interfaces, sem prova pesada de matemática
  ENG10003: 'facil', // Laboratório de Circuitos Elétricos: prática guiada, verificação da teoria já vista em Circuitos Elétricos I
  INF01082: 'facil', // Laboratório de Redes de Computadores: prática guiada complementar à disciplina teórica

  // Difíceis - reservado para filtros clássicos, citados de forma quase unânime
  MAT01353: 'dificil',
  MAT01354: 'dificil',
  MAT01355: 'dificil',
  MAT01167: 'dificil',
  MAT01168: 'dificil',
  MAT01169: 'dificil',
  MAT01032: 'dificil',
  FIS01181: 'dificil',
  FIS01182: 'dificil',
  FIS01183: 'dificil',
  INF05027: 'dificil',
  INF05028: 'dificil',
  INF01142: 'dificil',
  ENG10017: 'dificil',
  ENG04010: 'dificil',
  ENG04077: 'dificil',
  ENG04078: 'dificil',
  ENG10001: 'dificil',
  ENG10002: 'dificil',
  ENG10004: 'dificil',
  ENG10019: 'dificil',
  ENG04434: 'dificil',
  ENG10051: 'dificil',
  INF01085: 'dificil',
  INF01008: 'dificil',
  INF05010: 'dificil',
  INF01001: 'dificil',
  // Confirmadas por conteúdo programático real (ementa pede prova/rigor formal ou projeto avançado):
  INF01113: 'dificil', // Organização de Computadores: pipeline, superescalar, hierarquia de cache, memória virtual/MMU, 2 provas + trabalho com nota mínima
  INF01191: 'dificil', // Arquiteturas Avançadas de Computadores: multiprocessadores/paralelismo, avaliação com monografia
  INF05508: 'dificil', // Lógica para Computação: sistemas dedutivos, prova de completude/correção/consistência
  INF05501: 'dificil', // Teoria da Computação II: máquina de Turing, cálculo lambda, computabilidade/indecidibilidade
  INF01175: 'dificil', // Sistemas Digitais para Computadores A: projeto RTL, ASM, VHDL/síntese para FPGA
  INF01185: 'dificil', // Concepção de Circuitos Integrados I: CMOS, leiaute, dimensionamento, timing/potência
  INF01194: 'dificil', // Concepção de Circuitos Integrados II: fluxo ASIC standard-cell, ferramentas EDA
  // Confirmadas por plano de ensino oficial 2026/2 (ementas.inf.ufrgs.br, baixadas em ~/Downloads):
  INF05029: 'dificil', // Linguagens de Programação I: análise léxica/sintática (LR/LALR), semântica formal, prova de propriedades de LPs
  INF01083: 'dificil', // Linguagens de Programação II: backend de compilador - geração de código intermediário, otimização, geração de código

  // Médios (o restante segue o fallback, mas os principais estão listados aqui por clareza)
  INF01202: 'medio',
  INF01203: 'medio', // Estruturas de Dados: conteúdo clássico/construtivo (listas, árvores, grafos), não filtro pesado
  INF05035: 'medio',
  INF05005: 'medio', // Teoria da Computação I: autômatos e linguagens formais, mais mecânico que TC II
  INF01075: 'medio', // Arquitetura de Computadores: versão introdutória, antecede Organização de Computadores na grade
  INF01205: 'medio',
  INF01048: 'medio',
  INF01017: 'medio',
  INF01092: 'medio',
  INF01081: 'medio',
  INF01100: 'medio',
  INF01096: 'medio',
  INF01046: 'medio',
  INF01089: 'medio',
  INF01030: 'medio',
  INF01047: 'medio',
  INF01097: 'medio',
  ENG10055: 'medio',
  INF01084: 'medio',
  INF01005: 'medio',
  INF01015: 'medio',
  INF01045: 'medio',
  INF01145: 'medio',
  INF01006: 'medio',
  INF01146: 'medio',
  INF05018: 'medio',
  INF01088: 'medio',
  INF01127: 'medio',
  INF01120: 'medio',
  INF01086: 'medio',
  MAT01375: 'medio',
  MAT02050: 'medio',
  MAT02219: 'medio',
  INF99004: 'medio',
  'TCC-CIC': 'medio',
  'TG-I-ECP': 'medio',
  'TG-II-ECP': 'medio'
}

const LABELS = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
const COLORS = { facil: 'success', medio: 'warning', dificil: 'error' }

export function getCourseDifficulty(code) {
  return COURSE_DIFFICULTY[String(code).toUpperCase()] || 'medio'
}

export function getDifficultyLabel(difficulty) {
  return LABELS[difficulty] || LABELS.medio
}

export function getDifficultyColor(difficulty) {
  return COLORS[difficulty] || COLORS.medio
}
