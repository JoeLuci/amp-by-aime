import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if current user is an admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('is_admin, avatar_url')
      .eq('id', currentUser.id)
      .single()

    if (!currentProfile?.is_admin) {
      return NextResponse.json(
        { error: 'Only admins can access this endpoint' },
        { status: 403 }
      )
    }

    // Get form data
    const formData = await request.formData()
    const full_name = formData.get('full_name') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string
    const avatarFile = formData.get('avatar') as File | null

    if (!full_name || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    let avatar_url = currentProfile?.avatar_url

    // Handle avatar upload if provided
    if (avatarFile) {
      // Validate file size (max 5MB)
      if (avatarFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File size must be less than 5MB' },
          { status: 400 }
        )
      }

      // Validate file type
      if (!avatarFile.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'File must be an image' },
          { status: 400 }
        )
      }

      // Generate unique filename
      const fileExt = avatarFile.name.split('.').pop()
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Convert File to ArrayBuffer then to Buffer
      const arrayBuffer = await avatarFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, buffer, {
          contentType: avatarFile.type,
          upsert: true,
        })

      if (uploadError) {
        console.error('Error uploading avatar:', uploadError)
        return NextResponse.json(
          { error: 'Failed to upload avatar' },
          { status: 500 }
        )
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      avatar_url = publicUrl
    }

    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name,
        phone,
        avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id)

    if (updateError) {
      console.error('Error updating profile:', updateError)
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    // Update email if changed
    if (email !== currentUser.email) {
      const { error: emailError } = await supabase.auth.updateUser({
        email: email,
      })

      if (emailError) {
        console.error('Error updating email:', emailError)
        return NextResponse.json(
          { error: 'Profile updated but email change failed. Please try again.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      message: 'Profile updated successfully',
      avatar_url,
    })
  } catch (error: any) {
    console.error('Error in update-profile:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}
