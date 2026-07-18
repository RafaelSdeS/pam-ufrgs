export const scheduleGeneratorService = {
  normalizeDay(dayStr) {
    if (!dayStr) return ''
    const trimmed = String(dayStr).trim()
    if (trimmed.startsWith('Seg')) return 'Segunda-feira'
    if (trimmed.startsWith('Ter')) return 'Terça-feira'
    if (trimmed.startsWith('Qua')) return 'Quarta-feira'
    if (trimmed.startsWith('Qui')) return 'Quinta-feira'
    if (trimmed.startsWith('Sex')) return 'Sexta-feira'
    if (trimmed.startsWith('Sáb') || trimmed.startsWith('Sab')) return 'Sábado'
    if (trimmed.startsWith('Dom')) return 'Domingo'
    return trimmed
  },

  timeToMinutes(timeStr) {
    if (!timeStr) return 0
    const [h, m] = timeStr.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  },

  schedulesConflict(schedA, schedB) {
    if (this.normalizeDay(schedA.day_of_week) !== this.normalizeDay(schedB.day_of_week)) return false
    const startA = this.timeToMinutes(schedA.start_time)
    const endA = this.timeToMinutes(schedA.end_time)
    const startB = this.timeToMinutes(schedB.start_time)
    const endB = this.timeToMinutes(schedB.end_time)
    return startA < endB && startB < endA
  },

  sectionsConflict(sectionA, sectionB) {
    for (const sA of sectionA.schedules || []) {
      for (const sB of sectionB.schedules || []) {
        if (this.schedulesConflict(sA, sB)) return true
      }
    }
    return false
  },

  sectionViolatesHardBlock(section, hardBlocks) {
    for (const s of section.schedules || []) {
      const startS = this.timeToMinutes(s.start_time)
      const endS = this.timeToMinutes(s.end_time)
      const sDay = this.normalizeDay(s.day_of_week)
      for (const hb of hardBlocks) {
        const hbDay = this.normalizeDay(hb.day_of_week || hb.dia)
        if (hbDay && sDay && hbDay === sDay) {
          const startHb = this.timeToMinutes(hb.start_time || hb.horario_inicio)
          const endHb = this.timeToMinutes(hb.end_time || hb.horario_fim)
          if (startS < endHb && startHb < endS) return true
        }
      }
    }
    return false
  },

  generateRankedSchedules({ selectedCourses = [], restrictions = [], turmas = [], limit = 20 }) {
    if (!selectedCourses.length) return []
    const normalizedCoursesMap = {}
    selectedCourses.forEach(item => {
      const c = item.course || item
      const code = c.code || c.id
      if (code && !normalizedCoursesMap[code]) {
        normalizedCoursesMap[code] = {
          code: code,
          name: c.name || code,
          ...c
        }
      }
    })
    const distinctCourses = Object.values(normalizedCoursesMap)
    if (!distinctCourses.length) return []

    const hardBlocks = restrictions.filter(r => r.restriction_type === 'hard_block')
    const preferredWindows = restrictions.filter(r => r.restriction_type === 'preferred_window')

    const priorityMap = {}
    const professorMap = {}
    distinctCourses.forEach(c => {
      priorityMap[c.code] = c.importanceLevel || 'medium'
      if (c.preferredProfessor) {
        professorMap[c.code] = c.preferredProfessor.trim().toLowerCase()
      }
    })
    const sectionsByCourse = {}
    distinctCourses.forEach(c => {
      sectionsByCourse[c.code] = []
    })

    turmas.forEach(t => {
      if (sectionsByCourse[t.course_code]) {
        if (!t._precomputed_slots) {
          t._precomputed_slots = (t.schedules || []).map(s => ({
            dayNorm: this.normalizeDay(s.day_of_week),
            start: this.timeToMinutes(s.start_time),
            end: this.timeToMinutes(s.end_time)
          }))
        }
        if (!this.sectionViolatesHardBlock(t, hardBlocks)) {
          sectionsByCourse[t.course_code].push(t)
        }
      }
    })

    const validCourses = distinctCourses.filter(c => (sectionsByCourse[c.code] || []).length > 0)
    if (validCourses.length < distinctCourses.length) {
      return []
    }

    validCourses.sort((a, b) => (sectionsByCourse[a.code]?.length || 0) - (sectionsByCourse[b.code]?.length || 0))

    const fastSectionsConflict = (secA, secB) => {
      const slotsA = secA._precomputed_slots || []
      const slotsB = secB._precomputed_slots || []
      for (let i = 0; i < slotsA.length; i++) {
        const sA = slotsA[i]
        for (let j = 0; j < slotsB.length; j++) {
          const sB = slotsB[j]
          if (sA.dayNorm === sB.dayNorm && sA.start < sB.end && sB.start < sA.end) {
            return true
          }
        }
      }
      return false
    }
    const validCombinations = []
    const startTime = performance.now()
    let evalCount = 0
    const MAX_EVALS = 300000
    const MAX_COMBINATIONS = limit * 20

    const backtrack = (courseIndex, currentSelection) => {
      if (evalCount++ > MAX_EVALS || validCombinations.length >= MAX_COMBINATIONS || (performance.now() - startTime > 1500)) {
        return
      }
      if (courseIndex === validCourses.length) {
        validCombinations.push([...currentSelection])
        return
      }

      const course = validCourses[courseIndex]
      const candidates = sectionsByCourse[course.code] || []

      for (const section of candidates) {
        let hasConflict = false
        for (const sel of currentSelection) {
          if (fastSectionsConflict(sel, section)) {
            hasConflict = true
            break
          }
        }
        if (!hasConflict) {
          currentSelection.push(section)
          backtrack(courseIndex + 1, currentSelection)
          currentSelection.pop()
        }
      }
    }

    backtrack(0, [])
    const scoredOptions = validCombinations.map(combo => {
      let score = 0
      let matchedPrefCount = 0
      let totalPriorityScore = 0

      // Track daily times for gap calculation
      const daySlots = {}

      combo.forEach(section => {
        const priority = priorityMap[section.course_code] || 'medium'
        const prioVal = priority === 'high' ? 6 : (priority === 'low' ? 1 : 3)
        score += prioVal
        totalPriorityScore += prioVal

        const prefProf = professorMap[section.course_code]
        if (prefProf) {
          const prefLower = prefProf.toLowerCase()
          const ministrantesMatch = Array.isArray(section.ministrantes) && section.ministrantes.length > 0
            ? section.ministrantes.some(m => (m || '').toLowerCase().includes(prefLower))
            : (section.professor_name || '').toLowerCase().includes(prefLower)
          if (ministrantesMatch) {
            score += 3
            matchedPrefCount++
          }
        }

        const slots = section._precomputed_slots || []
        slots.forEach(s => {
          if (!daySlots[s.dayNorm]) daySlots[s.dayNorm] = []
          daySlots[s.dayNorm].push({ start: s.start, end: s.end })

          preferredWindows.forEach(pw => {
            const pwDayNorm = this.normalizeDay(pw.day_of_week || pw.dia)
            if (pwDayNorm && pwDayNorm === s.dayNorm) {
              const pwStart = this.timeToMinutes(pw.start_time)
              const pwEnd = this.timeToMinutes(pw.end_time)
              if (s.start >= pwStart && s.end <= pwEnd) {
                score += 2
                matchedPrefCount++
              }
            }
          })
        })
      })

      const activeDays = Object.keys(daySlots).length
      let totalGapMinutes = 0

      Object.values(daySlots).forEach(slots => {
        slots.sort((a, b) => a.start - b.start)
        for (let i = 0; i < slots.length - 1; i++) {
          const gap = slots[i + 1].start - slots[i].end
          if (gap > 0) totalGapMinutes += gap
        }
      })

      score -= (Math.max(0, activeDays - 1) * 0.35)
      score -= (totalGapMinutes / 60) * 0.08

      return {
        score: parseFloat(score.toFixed(2)),
        selected_course_count: combo.length,
        total_course_priority: totalPriorityScore,
        matched_preference_count: matchedPrefCount,
        active_days: activeDays,
        total_gap_minutes: totalGapMinutes,
        schedule: combo
      }
    })

    scoredOptions.sort((a, b) => b.score - a.score)
    return scoredOptions.slice(0, limit)
  },

  diagnoseConflicts(selectedCourses = [], turmas = [], restrictions = []) {
    if (!selectedCourses || selectedCourses.length === 0) {
      return { reasons: ['Nenhuma disciplina foi selecionada.'] }
    }

    const hardBlocks = (restrictions || []).filter(r => r.restriction_type === 'hard_block' || !r.restriction_type)
    const startTime = performance.now()

    const sectionsByCourse = {}
    const validSectionsByCourse = {}
    turmas.forEach(t => {
      const code = t.course_code || t.course_id
      if (!sectionsByCourse[code]) {
        sectionsByCourse[code] = []
        validSectionsByCourse[code] = []
      }
      if (!t._precomputed_slots) {
        t._precomputed_slots = (t.schedules || []).map(s => ({
          dayNorm: this.normalizeDay(s.day_of_week),
          start: this.timeToMinutes(s.start_time),
          end: this.timeToMinutes(s.end_time)
        }))
      }
      sectionsByCourse[code].push(t)
      if (!this.sectionViolatesHardBlock(t, hardBlocks)) {
        validSectionsByCourse[code].push(t)
      }
    })

    const fastSectionsConflict = (secA, secB) => {
      const slotsA = secA._precomputed_slots || []
      const slotsB = secB._precomputed_slots || []
      for (let i = 0; i < slotsA.length; i++) {
        const sA = slotsA[i]
        for (let j = 0; j < slotsB.length; j++) {
          const sB = slotsB[j]
          if (sA.dayNorm === sB.dayNorm && sA.start < sB.end && sB.start < sA.end) {
            return true
          }
        }
      }
      return false
    }

    const formatMinutesToTime = (mins) => {
      if (typeof mins !== 'number' || isNaN(mins)) return ''
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    const reasons = []
    const unschedulableSubsets = []

    const isSupersetOfKnownUnschedulable = (codesSet) => {
      return unschedulableSubsets.some(known => known.every(k => codesSet.has(k)))
    }
    selectedCourses.forEach(c => {
      const code = c.code || c.id
      const secs = sectionsByCourse[code] || []
      if (secs.length === 0) {
        reasons.push(`A disciplina "${c.name || code}" não possui turmas oferecidas para o seu curso neste semestre.`)
        unschedulableSubsets.push([code])
      } else if ((validSectionsByCourse[code] || []).length === 0) {
        const uniqueSecSlots = new Set()
        const uniqueBlocks = new Set()

        secs.forEach(section => {
          const slots = section._precomputed_slots || []
          slots.forEach(s => {
            hardBlocks.forEach(hb => {
              const hbDayNorm = this.normalizeDay(hb.day_of_week || hb.dia)
              if (hbDayNorm && hbDayNorm === s.dayNorm) {
                const startHb = this.timeToMinutes(hb.start_time || hb.horario_inicio)
                const endHb = this.timeToMinutes(hb.end_time || hb.horario_fim)
                if (s.start < endHb && startHb < s.end) {
                  uniqueSecSlots.add(`${s.dayNorm} (${formatMinutesToTime(s.start)} às ${formatMinutesToTime(s.end)})`)
                  uniqueBlocks.add(`${hbDayNorm} (${formatMinutesToTime(startHb)} às ${formatMinutesToTime(endHb)})`)
                }
              }
            })
          })
        })

        const secSlotsStr = Array.from(uniqueSecSlots).join('; ')
        const blocksStr = Array.from(uniqueBlocks).join('; ')
        let msg = `A disciplina "${c.name || code}" possui todas as suas turmas em colisão com as restrições e bloqueios de horário informados.`
        if (blocksStr) {
          msg += `\n• Turmas da disciplina ocorrem em: ${secSlotsStr || 'horários bloqueados'}\n• Colidem diretamente com os bloqueios em: ${blocksStr}`
        }
        reasons.push(msg)
        unschedulableSubsets.push([code])
      }
    })
    for (let i = 0; i < selectedCourses.length; i++) {
      for (let j = i + 1; j < selectedCourses.length; j++) {
        if (performance.now() - startTime > 1200) break
        const cA = selectedCourses[i]
        const cB = selectedCourses[j]
        const codeA = cA.code || cA.id
        const codeB = cB.code || cB.id

        const codesSet = new Set([codeA, codeB])
        if (isSupersetOfKnownUnschedulable(codesSet)) {
          continue
        }

        const secsA = validSectionsByCourse[codeA] || []
        const secsB = validSectionsByCourse[codeB] || []

        if (secsA.length > 0 && secsB.length > 0) {
          let allConflict = true
          const overlapSlots = new Set()

          for (const sA of secsA) {
            for (const sB of secsB) {
              let pairConflict = false
              const slotsA = sA._precomputed_slots || []
              const slotsB = sB._precomputed_slots || []
              for (let m = 0; m < slotsA.length; m++) {
                const slA = slotsA[m]
                for (let n = 0; n < slotsB.length; n++) {
                  const slB = slotsB[n]
                  if (slA.dayNorm === slB.dayNorm && slA.start < slB.end && slB.start < slA.end) {
                    pairConflict = true
                    const ovStart = Math.max(slA.start, slB.start)
                    const ovEnd = Math.min(slA.end, slB.end)
                    overlapSlots.add(`${slA.dayNorm} (${formatMinutesToTime(ovStart)} às ${formatMinutesToTime(ovEnd)})`)
                  }
                }
              }
              if (!pairConflict) {
                allConflict = false
                break
              }
            }
            if (!allConflict) break
          }

          if (allConflict) {
            const overlapStr = Array.from(overlapSlots).join('; ')
            let msg = `Coincidência direta de horários: As disciplinas "${cA.name || codeA}" e "${cB.name || codeB}" entram em conflito em todas as opções de turmas disponíveis.`
            if (overlapStr) {
              msg += `\n• Coincidência obrigatória nos horários: ${overlapStr}`
            }
            reasons.push(msg)
            unschedulableSubsets.push([codeA, codeB])
          }
        }
      }
    }
    const testSubsetsOfSize = (size, startIdx, currentSubset) => {
      if (reasons.length >= 10 || performance.now() - startTime > 1500) return
      if (currentSubset.length === size) {
        const codesSet = new Set(currentSubset.map(c => c.code || c.id))
        if (!isSupersetOfKnownUnschedulable(codesSet)) {
          const res = this.generateRankedSchedules({
            selectedCourses: currentSubset,
            restrictions: hardBlocks,
            turmas,
            limit: 1
          })
          if (res.length === 0) {
            const names = currentSubset.map(c => `"${c.name || c.code}"`).join(', ')
            reasons.push(`Incompatibilidade indireta entre ${size} disciplinas: O conjunto formado por ${names} não pode ser cursado junto pois a escolha da turma de uma disciplina bloqueia os horários das únicas turmas restantes das outras. Ao remover qualquer uma dessas disciplinas, torna-se possível gerar a grade.`)
            unschedulableSubsets.push(Array.from(codesSet))
          }
        }
        return
      }
      for (let i = startIdx; i < selectedCourses.length; i++) {
        currentSubset.push(selectedCourses[i])
        testSubsetsOfSize(size, i + 1, currentSubset)
        currentSubset.pop()
      }
    }

    for (let k = 3; k <= Math.min(6, selectedCourses.length); k++) {
      if (reasons.length >= 10 || performance.now() - startTime > 1500) break
      testSubsetsOfSize(k, 0, [])
    }

    if (reasons.length === 0) {
      reasons.push('Não foi possível gerar uma grade sem colisões combinando todas as disciplinas selecionadas e os bloqueios de horário. Tente remover ao menos uma disciplina ou liberar mais horários no seu calendário.')
    }

    return { reasons }
  }
}
