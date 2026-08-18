// Câmpus onde cada disciplina é ministrada, por prefixo de departamento do código.
// Conferido contra o campo "room" das turmas em academic_data.json, que já traz o
// sufixo "- Campus: X" retornado pelo Portal do Aluno.
// Prefixos sem entrada aqui (TCC, TG-*, INT - varia por turma) não exibem câmpus.
const CAMPUS_BY_PREFIX = {
  INF: 'Vale',   // Instituto de Informática
  MAT: 'Vale',   // Instituto de Matemática e Estatística
  FIS: 'Vale',   // Instituto de Física
  ENG: 'Centro', // Escola de Engenharia
  ADM: 'Centro', // Escola de Administração
  ECO: 'Centro', // Faculdade de Ciências Econômicas
  ECP: 'Centro', // Coordenação do curso de Engenharia de Computação
}

export function getCourseCampus(code) {
  const prefix = String(code || '').toUpperCase().match(/^[A-Z]+/)?.[0]
  return CAMPUS_BY_PREFIX[prefix] || null
}

export function getCampusFromRoom(room) {
  return String(room || '').match(/Campus:\s*(.+)$/)?.[1]?.trim() || null
}
