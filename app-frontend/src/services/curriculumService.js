import { ref } from 'vue'
import ufrgsData from '../data/ufrgs_data.json'

const currentCourseRef = ref(localStorage.getItem('ufrgs_selected_course') || 'CIC')

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

  { code: 'ECP99001', name: 'PROJETO DE FINAL DE CURSO DE ENGENHARIA DE COMPUTAÇÃO', semester: 9, credits: 2, prerequisites: [] },
  { code: 'TG-I-ECP', name: 'TRABALHO DE GRADUAÇÃO I - ECP', semester: 9, credits: 0, prerequisites: [] },
  { code: 'TG-II-ECP', name: 'TRABALHO DE GRADUAÇÃO II - ECP', semester: 10, credits: 0, prerequisites: ['ECP99001', 'TG-I-ECP'] }
]

export const curriculumService = {
  selectedCourseRef: currentCourseRef,

  getCoursesList() {
    return [
      { code: 'CIC', name: 'Ciência da Computação (CIC)' },
      { code: 'ECP', name: 'Engenharia de Computação (ECP)' }
    ]
  },

  getSelectedCourse() {
    return currentCourseRef.value
  },

  setSelectedCourse(courseCode) {
    localStorage.setItem('ufrgs_selected_course', courseCode)
    currentCourseRef.value = courseCode
  },

  getCurriculumSubjects(courseCode) {
    if (courseCode === 'ECP') {
      return ecpSubjects.map(item => ({
        id: item.code,
        code: item.code,
        name: item.name,
        semester: item.semester,
        carga_horaria: item.credits * 15,
        credits: item.credits,
        prerequisites: item.prerequisites
      }))
    }

    // Default: Ciência da Computação (CIC)
    const list = []
    if (ufrgsData && ufrgsData.curriculum) {
      ufrgsData.curriculum.forEach(item => {
        const semesterNum = parseInt(item.etapa.replace(/\D/g, '')) || 1
        const prereqCodes = (item.pre_requisitos || [])
          .filter(pre => !pre.startsWith('Créditos'))
          .map(pre => pre.split(' - ')[0].trim())

        const code = item.codigo === "" ? "TCC" : item.codigo
        list.push({
          id: code,
          code: code,
          name: item.nome,
          semester: semesterNum,
          carga_horaria: parseInt(item.carga_horaria) || (parseInt(item.creditos) * 15),
          credits: parseInt(item.creditos),
          prerequisites: prereqCodes
        })
      })
    }
    return list
  },

  normalizeCurriculumCode(code) {
    if (!code) return ''
    const c = String(code).toUpperCase().trim()
    if (c === 'CIC' || c === 'CC' || c === 'CIC-UFRGS' || c === 'CIÊNCIA DA COMPUTAÇÃO' || c === 'CIENCIA DA COMPUTACAO') return 'CIC'
    if (c === 'ECP' || c === 'EC' || c === 'ENG_COMP' || c === 'ENGCOMP' || c === 'ENGENHARIA DE COMPUTAÇÃO' || c === 'ENGENHARIA DE COMPUTACAO' || c === 'ENG') return 'ECP'
    return c
  },

  matchesSelectedCurriculum(curriculumsList, selectedCourseCode) {
    if (!curriculumsList || !Array.isArray(curriculumsList) || curriculumsList.length === 0) {
      return true
    }
    const target = this.normalizeCurriculumCode(selectedCourseCode)
    return curriculumsList.some(c => this.normalizeCurriculumCode(c) === target)
  }
}
