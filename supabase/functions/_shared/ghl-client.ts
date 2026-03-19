// GoHighLevel API Client
// Uses Private Integration Key for authentication (no OAuth rotation needed)

import type { ContactData, OpportunityData, GHLContact, GHLOpportunity } from './types.ts'

export class GHLClient {
  private apiKey: string
  private locationId: string
  private baseURL = 'https://services.leadconnectorhq.com'

  constructor(apiKey?: string, locationId?: string) {
    this.apiKey = apiKey || Deno.env.get('GHL_PRIVATE_KEY') || ''
    this.locationId = locationId || Deno.env.get('GHL_LOCATION_ID') || ''

    if (!this.apiKey) {
      console.warn('GHL_PRIVATE_KEY not configured - GHL integration will be disabled')
    }
  }

  /**
   * Upsert a contact in GHL (idempotent operation)
   * If contact with same email/phone exists, returns existing contact ID
   * Otherwise creates new contact
   */
  async upsertContact(data: ContactData): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      // First, try to find existing contact by email or phone
      const existingContact = await this.findContact(data.email, data.phone)

      if (existingContact) {
        console.log('Found existing GHL contact:', existingContact.id)
        // Optionally update contact data
        await this.updateContact(existingContact.id, data)
        return existingContact.id
      }

      // Create new contact
      const response = await this.makeRequest('/contacts/', {
        method: 'POST',
        body: JSON.stringify({
          locationId: this.locationId,
          email: data.email,
          phone: data.phone,
          firstName: data.firstName,
          lastName: data.lastName,
          name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          companyName: data.companyName, // Native GHL field
          source: 'AMP Portal',
          customFields: data.customFields || []
        })
      })

      const result = await response.json()
      console.log('Created new GHL contact:', result.contact?.id)
      return result.contact?.id || result.id

    } catch (error) {
      console.error('Error upserting GHL contact:', error)
      throw error
    }
  }

  /**
   * Find existing contact by email or phone
   */
  private async findContact(email?: string, phone?: string): Promise<GHLContact | null> {
    if (!email && !phone) return null

    try {
      const filters: any[] = []

      if (email) {
        filters.push({
          field: 'email',
          operator: 'eq',
          value: email
        })
      }

      if (phone) {
        filters.push({
          field: 'phone',
          operator: 'eq',
          value: phone
        })
      }

      const response = await this.makeRequest('/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          locationId: this.locationId,
          page: 1,
          pageLimit: 1,
          filters: [{
            group: 'OR',
            filters
          }]
        })
      })

      const result = await response.json()
      return result.contacts?.[0] || null

    } catch (error) {
      console.error('Error searching for contact:', error)
      return null
    }
  }

  /**
   * Update existing contact
   */
  private async updateContact(contactId: string, data: ContactData): Promise<void> {
    try {
      await this.makeRequest(`/contacts/${contactId}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          companyName: data.companyName, // Native GHL field
          customFields: data.customFields || []
        })
      })
    } catch (error) {
      console.warn('Error updating contact (non-fatal):', error)
    }
  }

  /**
   * Create an opportunity in GHL
   */
  async createOpportunity(data: OpportunityData): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      const response = await this.makeRequest('/opportunities/', {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: data.pipelineId,
          pipelineStageId: data.stageId,
          locationId: this.locationId,
          contactId: data.contactId,
          name: data.name,
          status: data.status || 'open',
          source: data.source || 'AMP Portal',
          monetaryValue: data.monetaryValue || 0,
          customFields: data.customFields || []
        })
      })

      const result = await response.json()
      console.log('Created GHL opportunity:', result.id || result.opportunity?.id)
      return result.id || result.opportunity?.id

    } catch (error) {
      console.error('Error creating GHL opportunity:', error)
      throw error
    }
  }

  /**
   * Get opportunity details
   */
  async getOpportunity(opportunityId: string): Promise<GHLOpportunity> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      const response = await this.makeRequest(`/opportunities/${opportunityId}`)
      return await response.json()
    } catch (error) {
      console.error('Error fetching opportunity:', error)
      throw error
    }
  }

  /**
   * Update opportunity stage
   */
  async updateOpportunityStage(
    opportunityId: string,
    stageId: string
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      await this.makeRequest(`/opportunities/${opportunityId}`, {
        method: 'PUT',
        body: JSON.stringify({
          pipelineStageId: stageId
        })
      })
      console.log(`Updated opportunity ${opportunityId} to stage ${stageId}`)
    } catch (error) {
      console.error('Error updating opportunity stage:', error)
      throw error
    }
  }

  /**
   * Update opportunity custom field
   */
  async updateOpportunityCustomField(
    opportunityId: string,
    customFields: Record<string, string>
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      const fields = Object.entries(customFields).map(([key, value]) => ({
        key,
        field_value: value
      }))

      await this.makeRequest(`/opportunities/${opportunityId}`, {
        method: 'PUT',
        body: JSON.stringify({
          customFields: fields
        })
      })
    } catch (error) {
      console.error('Error updating opportunity custom field:', error)
      throw error
    }
  }

  /**
   * Add tags to a contact
   */
  async addTagsToContact(contactId: string, tags: string[]): Promise<void> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    try {
      await this.makeRequest(`/contacts/${contactId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tags })
      })
      console.log(`Added tags to contact ${contactId}:`, tags)
    } catch (error) {
      console.error('Error adding tags to contact:', error)
      throw error
    }
  }

  /**
   * Find or create contact and add tag
   * Returns contact ID
   */
  async findOrCreateContactWithTag(data: {
    name: string
    email: string
    phone: string
    companyName?: string
    tag: string
  }): Promise<{ contactId: string; isNew: boolean }> {
    if (!this.apiKey) {
      throw new Error('GHL API key not configured')
    }

    // Try to find existing contact
    const existingContact = await this.findContact(data.email, data.phone)

    if (existingContact) {
      console.log('Found existing contact:', existingContact.id)
      // Add tag to existing contact
      await this.addTagsToContact(existingContact.id, [data.tag])
      return { contactId: existingContact.id, isNew: false }
    }

    // Parse name into first and last name
    const nameParts = data.name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Create new contact with tag
    const response = await this.makeRequest('/contacts/', {
      method: 'POST',
      body: JSON.stringify({
        locationId: this.locationId,
        email: data.email,
        phone: data.phone,
        firstName,
        lastName,
        name: data.name,
        companyName: data.companyName, // Native GHL field
        source: 'AMP Portal',
        tags: [data.tag]
      })
    })

    const result = await response.json()
    const contactId = result.contact?.id || result.id
    console.log('Created new contact with tag:', contactId)

    return { contactId, isNew: true }
  }

  /**
   * Make HTTP request to GHL API with retry logic
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseURL}${endpoint}`

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
      ...options.headers
    }

    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`GHL API error (${response.status}): ${errorText}`)
        }

        return response

      } catch (error) {
        lastError = error as Error
        console.warn(`GHL API request attempt ${attempt} failed:`, error)

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('GHL API request failed after retries')
  }
}

// Singleton instance
let ghlClientInstance: GHLClient | null = null

export function getGHLClient(): GHLClient {
  if (!ghlClientInstance) {
    ghlClientInstance = new GHLClient()
  }
  return ghlClientInstance
}
