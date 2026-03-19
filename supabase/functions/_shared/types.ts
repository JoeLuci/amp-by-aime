// Shared TypeScript types for Edge Functions

export interface ContactData {
  email: string
  phone?: string
  firstName?: string
  lastName?: string
  name?: string
  companyName?: string // Native GHL field
  customFields?: Record<string, string | number | boolean>
}

export interface OpportunityData {
  contactId: string
  pipelineId: string
  stageId: string
  name: string
  source?: string
  status?: string
  monetaryValue?: number
  customFields?: Array<{
    key: string
    field_value: string
  }>
}

export interface GHLContact {
  id: string
  locationId: string
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  name?: string
  [key: string]: any
}

export interface GHLOpportunity {
  id: string
  pipelineId: string
  pipelineStageId: string
  name: string
  contactId: string
  status: string
  monetaryValue?: number
  [key: string]: any
}

export interface SubmissionStatus {
  user_status: 'received' | 'pending' | 'in_progress' | 'closed' | 'failed'
  ghl_stage_name?: string
  last_webhook_at?: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  phone?: string
  nmls_number?: string
  state_licenses?: string[]
  ghl_contact_id?: string
  [key: string]: any
}
