import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Bubble role to Supabase role
function mapRole(bubbleRole: string): string {
  const roleMap: Record<string, string> = {
    "Broker Owner": "broker_owner",
    "Loan Officer": "loan_officer",
    "Loan Officer Assistant": "loan_officer_assistant",
    "Processor": "processor",
    "Partner Lender": "partner_lender",
    "Partner Vendor/Vendor member": "partner_vendor",
    "Admin": "admin",
  };
  return roleMap[bubbleRole] || "loan_officer";
}

// Map Bubble subscription type to Supabase plan tier
function mapPlanTier(bubbleType: string | undefined): string {
  if (!bubbleType) return "None";
  const tierMap: Record<string, string> = {
    "None": "None",
    "Premium Guest": "Premium Guest",
    "Premium": "Premium",
    "Elite": "Elite",
    "VIP": "VIP",
    "Premium Processor": "Premium Processor",
    "Elite Processor": "Elite Processor",
    "VIP Processor": "VIP Processor",
  };
  return tierMap[bubbleType] || "None";
}

// Get base escalation count for a plan tier
function getBasePlanEscalations(planTier: string): number {
  const escalationsMap: Record<string, number> = {
    "Premium": 1,
    "Premium Processor": 1,
    "Premium Guest": 0,
    "Elite": 6,
    "Elite Processor": 3,
    "VIP": 9999,
    "VIP Processor": 6,
    "None": 0,
  };
  return escalationsMap[planTier] || 0;
}

// Update migration queue status
async function updateMigrationQueue(
  supabase: any,
  queueId: string,
  updates: Record<string, any>
) {
  const { error } = await supabase
    .from("migration_queue")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  if (error) {
    console.error("Error updating migration queue:", error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const siteUrl = Deno.env.get("SITE_URL") || "https://app.brokersarebest.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { queue_id, dry_run = false } = await req.json();

    if (!queue_id) {
      return new Response(
        JSON.stringify({ error: "queue_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the migration queue item
    const { data: queueItem, error: fetchError } = await supabase
      .from("migration_queue")
      .select("*")
      .eq("id", queue_id)
      .single();

    if (fetchError || !queueItem) {
      return new Response(
        JSON.stringify({ error: "Queue item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if already completed
    if (queueItem.status === "completed") {
      return new Response(
        JSON.stringify({ message: "Already completed", queue_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as processing
    await updateMigrationQueue(supabase, queue_id, {
      status: "processing",
      processed_at: new Date().toISOString(),
    });

    const email = queueItem.email;
    const bubbleData = queueItem.bubble_data || {};
    const stripeValidation = bubbleData._stripe_validation || {};
    const result: Record<string, any> = { queue_id, email, steps: {} };

    // ========== STEP 1: Create Supabase Auth User ==========
    if (!queueItem.supabase_user_created) {
      try {
        // Generate random password (user will reset via email)
        const randomPassword = crypto.randomUUID() + crypto.randomUUID();

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: email,
          email_confirm: true,
          password: randomPassword,
          user_metadata: {
            full_name: `${queueItem.first_name || ""} ${queueItem.last_name || ""}`.trim(),
            role: mapRole(queueItem.user_role || ""),
            migrated_from_bubble: true,
            bubble_user_id: queueItem.bubble_user_id,
          },
        });

        if (authError) {
          // Check if user already exists
          if (authError.message.includes("already been registered")) {
            // Try to find existing user
            const { data: existingUsers } = await supabase.auth.admin.listUsers();
            const existingUser = existingUsers?.users?.find(
              (u: any) => u.email?.toLowerCase() === email.toLowerCase()
            );
            if (existingUser) {
              result.steps.auth = { status: "exists", user_id: existingUser.id };
              await updateMigrationQueue(supabase, queue_id, {
                supabase_user_created: true,
                supabase_user_id: existingUser.id,
              });
            } else {
              throw authError;
            }
          } else {
            throw authError;
          }
        } else {
          result.steps.auth = { status: "created", user_id: authData.user.id };
          await updateMigrationQueue(supabase, queue_id, {
            supabase_user_created: true,
            supabase_user_id: authData.user.id,
          });
        }
      } catch (error: any) {
        await updateMigrationQueue(supabase, queue_id, {
          status: "failed",
          error_step: "auth_create",
          error_message: error.message,
        });
        return new Response(
          JSON.stringify({ error: "Failed to create auth user", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      result.steps.auth = { status: "already_created", user_id: queueItem.supabase_user_id };
    }

    // Get the user ID for subsequent steps
    const { data: refreshedQueue } = await supabase
      .from("migration_queue")
      .select("supabase_user_id")
      .eq("id", queue_id)
      .single();
    const supabaseUserId = refreshedQueue?.supabase_user_id;

    // ========== STEP 2: Create Profile ==========
    if (!queueItem.profile_created && supabaseUserId) {
      try {
        // Parse phone number (could be number or string)
        const rawPhone = queueItem.phone || bubbleData.phoneNumber || bubbleData["mobileNumber(User)"];
        const phone = rawPhone ? String(rawPhone) : null;

        // Parse birthday (convert ISO string to date only)
        let birthday = null;
        if (bubbleData.birthday) {
          try {
            birthday = bubbleData.birthday.split("T")[0]; // Get just the date part
          } catch {
            birthday = null;
          }
        }

        // Languages spoken - already an array in Bubble
        const languagesSpoken = Array.isArray(bubbleData.languagespoken)
          ? bubbleData.languagespoken
          : bubbleData.languagespoken
            ? [bubbleData.languagespoken]
            : null;

        // State licenses - already an array in Bubble
        const stateLicenses = bubbleData["stateLicense(list)"] || null;

        // Determine plan tier (Stripe-validated tier takes precedence)
        const planTier = stripeValidation.stripe_tier || mapPlanTier(queueItem.subscription_type);

        // Get escalations - use Bubble value if exists, otherwise default to plan minimum
        const escalationsRemaining = bubbleData.escalationCountRemaining != null
          ? bubbleData.escalationCountRemaining
          : getBasePlanEscalations(planTier);

        const profileData = {
          id: supabaseUserId,
          email: email,

          // Basic info
          first_name: queueItem.first_name || null,
          last_name: queueItem.last_name || null,
          full_name: `${queueItem.first_name || ""} ${queueItem.last_name || ""}`.trim() || null,
          phone: phone,
          avatar_url: bubbleData["profile photo"] || null,

          // Role and plan - Use Stripe-validated tier as source of truth
          role: mapRole(queueItem.user_role || ""),
          plan_tier: planTier,
          is_admin: bubbleData.userType === "Admin",

          // Stripe - Use validated data from Stripe sync
          stripe_customer_id: queueItem.stripe_customer_id || null,
          stripe_subscription_id: stripeValidation.subscription_id || bubbleData.subscriptionID || null,
          stripe_subscription_status: stripeValidation.subscription_status || bubbleData.subscriptionStatus || null,
          subscription_status: stripeValidation.subscription_status || bubbleData.subscriptionStatus || null,

          // Professional info
          nmls_number: bubbleData.individualNMLS || null,
          state_licenses: stateLicenses,

          // Personal address
          address: bubbleData.userAddress || bubbleData.address || null,
          city: bubbleData.userCity || null,
          state: bubbleData.userState || null,
          zip_code: bubbleData.userZipCode || null,

          // Demographics
          birthday: birthday,
          gender: bubbleData.gender || null,
          race: bubbleData.race || null,
          languages_spoken: languagesSpoken,

          // Company info
          company: bubbleData.companyName || null,
          company_name: bubbleData.companyName || null,
          company_address: bubbleData.companyAddress || null,
          company_city: bubbleData.companyCity || null,
          company_state: bubbleData.companyState || null,
          company_zip_code: bubbleData.companyZipcode || null,
          company_nmls: null, // Not collected in Bubble
          company_phone: null, // Not in Bubble data

          // Subscriptions and features
          scotsman_guide_subscription: bubbleData.scotsmanGuide === "yes",
          escalations_remaining: escalationsRemaining,

          // Profile status - Stripe-only customers need to complete profile
          profile_complete: bubbleData._source === "stripe_only"
            ? false
            : (bubbleData.userProfileCompleted && bubbleData.companyProfileCompleted),
          onboarding_step: bubbleData._source === "stripe_only"
            ? "complete_profile"
            : ((bubbleData.userProfileCompleted && bubbleData.companyProfileCompleted) ? "completed" : "complete_profile"),

          // Migration tracking
          bubble_user_id: queueItem.bubble_user_id,
          created_at: bubbleData["Created Date"] || new Date().toISOString(),

          // GHL contact ID (synced before migration via ghl-sync-migration.js)
          ghl_contact_id: queueItem.ghl_contact_id || null,
        };

        const { error: profileError } = await supabase
          .from("profiles")
          .upsert(profileData, { onConflict: "id" });

        if (profileError) throw profileError;

        result.steps.profile = { status: "created" };
        await updateMigrationQueue(supabase, queue_id, { profile_created: true });
      } catch (error: any) {
        await updateMigrationQueue(supabase, queue_id, {
          status: "failed",
          error_step: "profile_create",
          error_message: error.message,
        });
        return new Response(
          JSON.stringify({ error: "Failed to create profile", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      result.steps.profile = { status: "already_created" };
    }

    // ========== STEP 3: Send Password Reset Email via Supabase/Resend ==========
    // Skip email for canceled/churned users - they get migrated but no password reset
    const subscriptionStatus = stripeValidation.subscription_status || bubbleData.subscriptionStatus;
    const isCanceled = subscriptionStatus === "canceled";

    if (!queueItem.email_sent && !dry_run && !isCanceled) {
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/reset-password`,
        });

        if (resetError) throw resetError;

        result.steps.email = { status: "sent" };
        await updateMigrationQueue(supabase, queue_id, {
          email_sent: true,
          email_sent_at: new Date().toISOString(),
          status: "completed",
          completed_at: new Date().toISOString(),
        });
      } catch (error: any) {
        await updateMigrationQueue(supabase, queue_id, {
          status: "failed",
          error_step: "email_send",
          error_message: error.message,
        });
        return new Response(
          JSON.stringify({ error: "Failed to send reset email", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (isCanceled) {
      result.steps.email = { status: "skipped_canceled" };
      await updateMigrationQueue(supabase, queue_id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: "Canceled subscription - email not sent",
      });
    } else if (dry_run) {
      result.steps.email = { status: "skipped_dry_run" };
      await updateMigrationQueue(supabase, queue_id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: "Dry run - email not sent",
      });
    } else {
      result.steps.email = { status: "already_sent" };
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Migration error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
