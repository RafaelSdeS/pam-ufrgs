export function calculateSubjectStatuses(subjects, completedIds = []) {
  const completedSet = new Set(completedIds.map(id => String(id).trim().toLowerCase()))
  const statuses = {}
  const subjectMap = new Map()

  subjects.forEach(subject => {
    const subjectId = String(subject.id).trim().toLowerCase()
    const subjectCode = String(subject.code).trim().toLowerCase()
    subjectMap.set(subjectId, subject)
    subjectMap.set(subjectCode, subject)

    if (completedSet.has(subjectId) || completedSet.has(subjectCode)) {
      statuses[subject.id] = 'completed'
    }
  })

  let completedCredits = 0
  subjects.forEach(subject => {
    if (statuses[subject.id] === 'completed') completedCredits += subject.credits || 0
  })

  subjects.forEach(subject => {
    if (statuses[subject.id] === 'completed') return

    const prereqs = subject.prerequisites || []
    const prereqsMet = prereqs.length === 0 || prereqs.every(prereqId => {
      const pId = String(prereqId).trim().toLowerCase()
      const matchingSubject = subjectMap.get(pId)
      if (!matchingSubject) return true

      if (statuses[matchingSubject.id] === 'completed') return true
      if (completedSet.has(pId)) return true
      return false
    })

    const creditsMet = completedCredits >= (subject.min_credits_required || 0)

    statuses[subject.id] = (prereqsMet && creditsMet) ? 'available' : 'blocked'
  })

  return statuses
}

