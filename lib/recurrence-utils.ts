// Helper function to convert text to StartCase (capitalize first letter of each word)
export function toStartCase(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Helper function to convert RRULE to human-readable text
export function formatRecurrenceRule(rrule: string): string {
  if (!rrule) return ''

  const parts = rrule.split(';')
  const ruleMap: Record<string, string> = {}

  parts.forEach(part => {
    const [key, value] = part.split('=')
    ruleMap[key] = value
  })

  const freq = ruleMap['FREQ']
  const interval = ruleMap['INTERVAL'] ? parseInt(ruleMap['INTERVAL']) : 1
  const byday = ruleMap['BYDAY']

  // Map day codes to names
  const dayMap: Record<string, string> = {
    'MO': 'Monday',
    'TU': 'Tuesday',
    'WE': 'Wednesday',
    'TH': 'Thursday',
    'FR': 'Friday',
    'SA': 'Saturday',
    'SU': 'Sunday'
  }

  switch (freq) {
    case 'DAILY':
      return interval === 1 ? 'Daily' : `Every ${interval} days`

    case 'WEEKLY':
      if (byday) {
        // Extract numeric prefix if exists (e.g., 1MO = first Monday)
        const match = byday.match(/^(\d+)?([A-Z]{2})$/)
        if (match) {
          const [, position, day] = match
          const dayName = dayMap[day] || day

          if (position) {
            const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Last'][parseInt(position) - 1] || position + 'th'
            return `${ordinal} ${dayName} of every month`
          }

          return interval === 1 ? `Every ${dayName}` : `Every ${interval} weeks on ${dayName}`
        }
      }
      return interval === 1 ? 'Weekly' : `Every ${interval} weeks`

    case 'MONTHLY':
      if (byday) {
        const match = byday.match(/^(\d+)?([A-Z]{2})$/)
        if (match) {
          const [, position, day] = match
          const dayName = dayMap[day] || day
          const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Last'][parseInt(position) - 1] || position + 'th'
          return `${ordinal} ${dayName} of every month`
        }
      }
      return interval === 1 ? 'Monthly' : `Every ${interval} months`

    case 'YEARLY':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`

    default:
      return 'Recurring'
  }
}

// Helper function to calculate the next occurrence of a recurring event
export function getNextOccurrence(startDate: string, rrule: string, recurrenceEndDate?: string): Date | null {
  if (!rrule) return null

  const now = new Date()
  const start = new Date(startDate)
  const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null

  // If there's an end date and we're past it, return null
  if (endDate && now > endDate) {
    return null
  }

  // Parse RRULE
  const parts = rrule.split(';')
  const ruleMap: Record<string, string> = {}
  parts.forEach(part => {
    const [key, value] = part.split('=')
    ruleMap[key] = value
  })

  const freq = ruleMap['FREQ']
  const interval = ruleMap['INTERVAL'] ? parseInt(ruleMap['INTERVAL']) : 1
  const byday = ruleMap['BYDAY']

  // Map day codes to day numbers (0 = Sunday, 6 = Saturday)
  const dayMap: Record<string, number> = {
    'SU': 0,
    'MO': 1,
    'TU': 2,
    'WE': 3,
    'TH': 4,
    'FR': 5,
    'SA': 6
  }

  // If we haven't reached the first occurrence yet, return start date
  if (now < start) {
    return start
  }

  let candidate = new Date(start)

  switch (freq) {
    case 'DAILY': {
      // Calculate days since start
      const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const intervalsPassed = Math.floor(daysSinceStart / interval)
      candidate = new Date(start)
      candidate.setDate(start.getDate() + (intervalsPassed + 1) * interval)
      break
    }

    case 'WEEKLY': {
      if (byday) {
        const match = byday.match(/^(\d+)?([A-Z]{2})$/)
        if (match) {
          const [, , day] = match
          const targetDay = dayMap[day]

          // Find next occurrence of target day
          candidate = new Date(now)
          candidate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())

          const currentDay = candidate.getDay()
          let daysUntilTarget = (targetDay - currentDay + 7) % 7

          // If target day is today but time has passed, go to next week
          if (daysUntilTarget === 0 && candidate <= now) {
            daysUntilTarget = 7 * interval
          } else if (daysUntilTarget > 0) {
            // Adjust for interval
            const weeksSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))
            const weekIntervalsPassed = Math.floor(weeksSinceStart / interval)
            const nextIntervalWeek = start.getTime() + (weekIntervalsPassed + 1) * interval * 7 * 24 * 60 * 60 * 1000
            candidate = new Date(nextIntervalWeek)

            // Adjust to correct day of week
            const nextCandidateDay = candidate.getDay()
            daysUntilTarget = (targetDay - nextCandidateDay + 7) % 7
          }

          candidate.setDate(candidate.getDate() + daysUntilTarget)
        }
      } else {
        // Generic weekly recurrence
        const weeksSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7))
        const weekIntervalsPassed = Math.floor(weeksSinceStart / interval)
        candidate = new Date(start)
        candidate.setDate(start.getDate() + (weekIntervalsPassed + 1) * interval * 7)
      }
      break
    }

    case 'MONTHLY': {
      if (byday) {
        // e.g., "1MO" = first Monday
        const match = byday.match(/^(\d+)?([A-Z]{2})$/)
        if (match) {
          const [, position, day] = match
          const targetDay = dayMap[day]
          const weekOfMonth = position ? parseInt(position) : 1

          // Start from current month
          candidate = new Date(now.getFullYear(), now.getMonth(), 1)
          candidate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds())

          // Find the nth occurrence of target day in month
          const findNthDayOfMonth = (year: number, month: number, day: number, n: number) => {
            const firstDay = new Date(year, month, 1)
            const firstOccurrence = new Date(year, month, 1 + (day - firstDay.getDay() + 7) % 7)
            return new Date(year, month, firstOccurrence.getDate() + (n - 1) * 7)
          }

          candidate = findNthDayOfMonth(now.getFullYear(), now.getMonth(), targetDay, weekOfMonth)

          // If this month's occurrence has passed, go to next interval month
          if (candidate <= now) {
            const monthsSinceStart = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
            const monthIntervalsPassed = Math.floor(monthsSinceStart / interval)
            const nextMonth = new Date(start)
            nextMonth.setMonth(start.getMonth() + (monthIntervalsPassed + 1) * interval)
            candidate = findNthDayOfMonth(nextMonth.getFullYear(), nextMonth.getMonth(), targetDay, weekOfMonth)
          }
        }
      } else {
        // Generic monthly recurrence (same day of month)
        const monthsSinceStart = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
        const monthIntervalsPassed = Math.floor(monthsSinceStart / interval)
        candidate = new Date(start)
        candidate.setMonth(start.getMonth() + (monthIntervalsPassed + 1) * interval)
      }
      break
    }

    case 'YEARLY': {
      const yearsSinceStart = now.getFullYear() - start.getFullYear()
      const yearIntervalsPassed = Math.floor(yearsSinceStart / interval)
      candidate = new Date(start)
      candidate.setFullYear(start.getFullYear() + (yearIntervalsPassed + 1) * interval)
      break
    }

    default:
      return null
  }

  // Check if candidate is within recurrence end date
  if (endDate && candidate > endDate) {
    return null
  }

  return candidate
}

// Helper function to generate all occurrences of a recurring event within a date range
export function generateOccurrences(
  startDate: string,
  rrule: string,
  recurrenceEndDate: string | undefined,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!rrule) return []

  const occurrences: Date[] = []
  const start = new Date(startDate)
  const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null

  // Parse RRULE
  const parts = rrule.split(';')
  const ruleMap: Record<string, string> = {}
  parts.forEach(part => {
    const [key, value] = part.split('=')
    ruleMap[key] = value
  })

  const freq = ruleMap['FREQ']
  const interval = ruleMap['INTERVAL'] ? parseInt(ruleMap['INTERVAL']) : 1
  const byday = ruleMap['BYDAY']

  // Map day codes to day numbers (0 = Sunday, 6 = Saturday)
  const dayMap: Record<string, number> = {
    'SU': 0,
    'MO': 1,
    'TU': 2,
    'WE': 3,
    'TH': 4,
    'FR': 5,
    'SA': 6
  }

  let currentDate = new Date(start)

  // Generate occurrences up to 100 to prevent infinite loops
  let count = 0
  const maxOccurrences = 100

  while (count < maxOccurrences) {
    // Check if we've passed the range end
    if (currentDate > rangeEnd) break

    // Check if we've passed the recurrence end date
    if (endDate && currentDate > endDate) break

    // If current date is within range and after start, add it
    if (currentDate >= rangeStart && currentDate <= rangeEnd && currentDate >= start) {
      occurrences.push(new Date(currentDate))
    }

    // Calculate next occurrence based on frequency
    switch (freq) {
      case 'DAILY':
        currentDate.setDate(currentDate.getDate() + interval)
        break

      case 'WEEKLY': {
        if (byday) {
          const match = byday.match(/^(\d+)?([A-Z]{2})$/)
          if (match) {
            const [, , day] = match
            const targetDay = dayMap[day]

            // Move to next week interval
            currentDate.setDate(currentDate.getDate() + (7 * interval))

            // Adjust to target day of week
            const currentDay = currentDate.getDay()
            const daysToAdd = (targetDay - currentDay + 7) % 7
            currentDate.setDate(currentDate.getDate() + daysToAdd)
          }
        } else {
          currentDate.setDate(currentDate.getDate() + (7 * interval))
        }
        break
      }

      case 'MONTHLY': {
        if (byday) {
          // e.g., "1MO" = first Monday
          const match = byday.match(/^(\d+)?([A-Z]{2})$/)
          if (match) {
            const [, position, day] = match
            const targetDay = dayMap[day]
            const weekOfMonth = position ? parseInt(position) : 1

            // Move to next month interval
            currentDate.setMonth(currentDate.getMonth() + interval)

            // Find nth occurrence of target day in this month
            const year = currentDate.getFullYear()
            const month = currentDate.getMonth()
            const firstDay = new Date(year, month, 1)
            const firstOccurrence = new Date(year, month, 1 + (targetDay - firstDay.getDay() + 7) % 7)
            currentDate = new Date(year, month, firstOccurrence.getDate() + (weekOfMonth - 1) * 7)
          }
        } else {
          // Same day of month
          currentDate.setMonth(currentDate.getMonth() + interval)
        }
        break
      }

      case 'YEARLY':
        currentDate.setFullYear(currentDate.getFullYear() + interval)
        break

      default:
        return occurrences
    }

    count++
  }

  return occurrences
}
