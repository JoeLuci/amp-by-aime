import { createClient } from '@/lib/supabase/server'
import { TrainingVideosManager } from '@/components/admin/TrainingVideosManager'

export default async function AdminTrainingPage() {
  const supabase = await createClient()

  // Get current user and their role
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: videos, error: videosError },
    { data: profile }
  ] = await Promise.all([
    supabase
      .from('admin_training_videos')
      .select('*')
      .order('display_order', { ascending: true }),
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user?.id)
      .single()
  ])

  if (videosError) {
    console.error('Error fetching training videos:', videosError)
  }

  // Only super_admin can manage videos
  const isSuperAdmin = profile?.role === 'super_admin'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#dd1969] mb-2">TRAINING VIDEOS</h1>
        <p className="text-gray-600">How-to videos and tutorials for admin staff</p>
      </div>

      <TrainingVideosManager videos={videos || []} canManage={isSuperAdmin} />
    </div>
  )
}
