// GHL Status Webhook Edge Function
// Receives status updates from GoHighLevel and updates Supabase records

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsResponse, successResponse, errorResponse } from '@/_shared/response.ts'

interface WebhookPayload {
  type: string // opportunity.status_update
  location_id: string
  opportunity_id: string
  contact_id: string
  pipeline_id: string
  pipeline_stage_id: string
  pipeline_stage_name: string
  status: string
  name: string
  monetary_value?: number
  assigned_to?: string
  last_status_change_at?: string
  [key: string]: any
}

// Map GHL stage names to our submission_status enum
function mapStageToStatus(stageName: string): string {
  const lowerStage = stageName.toLowerCase()

  // Exact matches for support ticket pipeline
  if (lowerStage === 'new') {
    return 'received'
  }
  if (lowerStage === 'emailed received') {
    return 'pending'
  }
  if (lowerStage === 'awaiting response' || lowerStage === 'reopened') {
    return 'in_progress'
  }
  if (lowerStage === 'closed') {
    return 'closed'
  }

  // Fuzzy matching for other pipelines
  if (lowerStage.includes('new') || lowerStage.includes('received')) {
    return 'received'
  }
  if (lowerStage.includes('pending') || lowerStage.includes('queue') || lowerStage.includes('emailed')) {
    return 'pending'
  }
  if (lowerStage.includes('progress') || lowerStage.includes('working') || lowerStage.includes('active') || lowerStage.includes('awaiting') || lowerStage.includes('reopened')) {
    return 'in_progress'
  }
  if (lowerStage.includes('closed') || lowerStage.includes('complete') || lowerStage.includes('resolved') || lowerStage.includes('won')) {
    return 'closed'
  }
  if (lowerStage.includes('failed') || lowerStage.includes('lost') || lowerStage.includes('error')) {
    return 'failed'
  }

  // Default to pending if we can't match
  return 'pending'
}

// Determine which table to update based on pipeline name
function getTableName(pipelineName: string): string | null {
  const lowerPipeline = pipelineName.toLowerCase()

  // Match by pipeline name (more reliable than ID across environments)
  if (lowerPipeline.includes('change ae') || lowerPipeline.includes('change account')) {
    return 'change_ae_requests'
  }
  if (lowerPipeline.includes('lender connection')) {
    return 'lender_connections'
  }
  if (lowerPipeline.includes('vendor connection')) {
    return 'vendor_connections'
  }
  if (lowerPipeline.includes('loan escalation') || lowerPipeline.includes('escalate')) {
    return 'loan_escalations'
  }
  if (lowerPipeline.includes('support')) {
    return 'support_tickets'
  }

  return null
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return corsResponse()
  }

  try {
    // Webhook verification (optional - you can add a secret in GHL webhook config)
    // For now, we'll allow all requests since GHL workflows don't easily support custom headers
    // In production, consider adding IP whitelist or webhook signature verification

    // Parse webhook payload
    const payload: any = await req.json()
    console.log('Received webhook:', payload)

    // Support both webhook formats:
    // 1. Standard GHL event: { type: 'opportunity.status_update', opportunity_id, pipeline_stage_name, ... }
    // 2. Workflow webhook: { id, pipleline_stage (typo in GHL), pipeline_id, pipeline_name, ... }

    const opportunityId = payload.opportunity_id || payload.id
    const pipelineName = payload.pipeline_name
    const stageName = payload.pipeline_stage_name || payload.pipleline_stage // Note: GHL has typo "pipleline"

    if (!opportunityId || !pipelineName || !stageName) {
      console.log('Missing required fields in webhook payload')
      return errorResponse('Missing required fields: opportunity_id, pipeline_name, stage_name', 400)
    }

    // Determine which table to update based on pipeline name
    const tableName = getTableName(pipelineName)
    if (!tableName) {
      console.error('Unknown pipeline name:', pipelineName)
      return errorResponse('Unknown pipeline name - could not map to table', 400)
    }

    // Map stage name to our status enum
    const userStatus = mapStageToStatus(stageName)

    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Update the record
    const { data, error } = await supabase
      .from(tableName)
      .update({
        user_status: userStatus,
        ghl_stage_name: stageName,
        last_webhook_at: new Date().toISOString()
      })
      .eq('ghl_opportunity_id', opportunityId)
      .select()

    if (error) {
      console.error('Error updating record:', error)
      return errorResponse('Failed to update record', 500)
    }

    if (!data || data.length === 0) {
      console.warn('No records found for opportunity ID:', opportunityId)
      return successResponse({
        message: 'No matching record found',
        warning: true
      })
    }

    console.log(`Updated ${tableName} record:`, data[0].id)

    return successResponse({
      message: 'Status updated successfully',
      table: tableName,
      record_id: data[0].id,
      new_status: userStatus
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return errorResponse(error, 500)
  }
})
