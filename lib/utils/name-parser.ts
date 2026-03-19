/**
 * Parse a full name string into first and last name components
 * Handles various formats:
 * - "John" -> { firstName: "John", lastName: "" }
 * - "John Doe" -> { firstName: "John", lastName: "Doe" }
 * - "John van der Berg" -> { firstName: "John", lastName: "van der Berg" }
 */
export function parseFullName(fullName: string | null | undefined): {
  firstName: string
  lastName: string
} {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: '', lastName: '' }
  }

  const trimmed = fullName.trim()
  if (!trimmed) {
    return { firstName: '', lastName: '' }
  }

  const parts = trimmed.split(/\s+/)

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  // First word is first name, rest is last name
  // This handles "John van der Berg" as firstName: "John", lastName: "van der Berg"
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  }
}

/**
 * Combine first and last name into a full name
 */
export function combineNames(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const first = (firstName || '').trim()
  const last = (lastName || '').trim()

  if (first && last) {
    return `${first} ${last}`
  }
  return first || last || ''
}
