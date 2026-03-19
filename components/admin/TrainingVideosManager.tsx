'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Plus, Edit, Trash2, Upload, Play, Search, Eye, EyeOff, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface TrainingVideo {
  id: string
  title: string
  description?: string | null
  video_url: string
  thumbnail_url?: string | null
  duration_seconds?: number | null
  category: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at?: string
}

interface TrainingVideosManagerProps {
  videos: TrainingVideo[]
  canManage?: boolean // Only super admins can manage
}

const VIDEO_CATEGORIES = [
  'general',
  'user-management',
  'content-management',
  'subscriptions',
  'analytics',
  'settings',
]

export function TrainingVideosManager({ videos: initialVideos, canManage = false }: TrainingVideosManagerProps) {
  const router = useRouter()
  const [videos, setVideos] = useState(initialVideos)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(VIDEO_CATEGORIES))
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewVideo, setPreviewVideo] = useState<TrainingVideo | null>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    video_url: '',
    thumbnail_url: '',
    duration_seconds: 0,
    category: 'general',
    is_active: true,
  })

  const filteredVideos = videos.filter((video) => {
    const matchesSearch = searchTerm === '' ||
      video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      video.description?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  // Group videos by category
  const videosByCategory = VIDEO_CATEGORIES.reduce((acc, category) => {
    acc[category] = filteredVideos
      .filter(v => v.category === category)
      .sort((a, b) => a.display_order - b.display_order)
    return acc
  }, {} as Record<string, TrainingVideo[]>)

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const expandAll = () => setExpandedCategories(new Set(VIDEO_CATEGORIES))
  const collapseAll = () => setExpandedCategories(new Set())

  const handleOpenDialog = (video?: TrainingVideo) => {
    if (video) {
      setEditingVideo(video)
      setFormData({
        title: video.title,
        description: video.description || '',
        video_url: video.video_url,
        thumbnail_url: video.thumbnail_url || '',
        duration_seconds: video.duration_seconds || 0,
        category: video.category || 'general',
        is_active: video.is_active,
      })
      setThumbnailPreview(video.thumbnail_url || '')
    } else {
      setEditingVideo(null)
      setFormData({
        title: '',
        description: '',
        video_url: '',
        thumbnail_url: '',
        duration_seconds: 0,
        category: 'general',
        is_active: true,
      })
      setThumbnailPreview('')
    }
    setVideoFile(null)
    setThumbnailFile(null)
    setUploadProgress(0)
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingVideo(null)
    setVideoFile(null)
    setThumbnailFile(null)
    setThumbnailPreview('')
    setUploadProgress(0)
  }

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file')
        return
      }
      // Validate file size (500MB max)
      if (file.size > 500 * 1024 * 1024) {
        toast.error('Video file must be less than 500MB')
        return
      }
      setVideoFile(file)
    }
  }

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }
      setThumbnailFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setThumbnailPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadFile = async (file: File, bucket: string, folder: string) => {
    const supabase = createClient()
    const fileExt = file.name.split('.').pop()
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    return publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      let videoUrl = formData.video_url
      let thumbnailUrl = formData.thumbnail_url

      // Upload video if selected
      if (videoFile) {
        setUploadProgress(10)
        toast.info('Uploading video...')
        videoUrl = await uploadFile(videoFile, 'admin-training-videos', 'videos')
        setUploadProgress(70)
      }

      // Upload thumbnail if selected
      if (thumbnailFile) {
        setUploadProgress(80)
        thumbnailUrl = await uploadFile(thumbnailFile, 'admin-training-videos', 'thumbnails')
        setUploadProgress(90)
      }

      const videoData = {
        title: formData.title,
        description: formData.description || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl || null,
        duration_seconds: formData.duration_seconds || null,
        category: formData.category,
        is_active: formData.is_active,
        display_order: editingVideo?.display_order ?? videos.length,
      }

      if (editingVideo) {
        const { error } = await supabase
          .from('admin_training_videos')
          .update(videoData)
          .eq('id', editingVideo.id)

        if (error) throw error

        setVideos(videos.map(v =>
          v.id === editingVideo.id ? { ...v, ...videoData } : v
        ))
        toast.success('Training video updated successfully')
      } else {
        const { data, error } = await supabase
          .from('admin_training_videos')
          .insert(videoData)
          .select()
          .single()

        if (error) throw error

        setVideos([...videos, data])
        toast.success('Training video added successfully')
      }

      setUploadProgress(100)
      handleCloseDialog()
      router.refresh()
    } catch (error: any) {
      console.error('Error saving training video:', error)
      toast.error(`Failed to save: ${error.message}`)
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
    }
  }

  const handleDelete = async () => {
    if (!itemToDelete) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('admin_training_videos')
        .delete()
        .eq('id', itemToDelete)

      if (error) throw error

      setVideos(videos.filter(v => v.id !== itemToDelete))
      toast.success('Training video deleted')
      router.refresh()
    } catch (error: any) {
      console.error('Error deleting video:', error)
      toast.error(`Failed to delete: ${error.message}`)
    } finally {
      setDeleteDialogOpen(false)
      setItemToDelete(null)
    }
  }

  const toggleActive = async (video: TrainingVideo) => {
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('admin_training_videos')
        .update({ is_active: !video.is_active })
        .eq('id', video.id)

      if (error) throw error

      setVideos(videos.map(v =>
        v.id === video.id ? { ...v, is_active: !v.is_active } : v
      ))
      toast.success(`Video ${!video.is_active ? 'activated' : 'deactivated'}`)
    } catch (error: any) {
      console.error('Error toggling video status:', error)
      toast.error(`Failed to update: ${error.message}`)
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatCategory = (category: string) => {
    return category.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  return (
    <div className="space-y-6">
      {/* Search Bar and Actions */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-4 rounded-lg shadow">
        <div className="flex flex-col md:flex-row gap-4 flex-1 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
        {canManage && (
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-[#dd1969] hover:bg-[#c01559] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Video
          </Button>
        )}
      </div>

      {/* Videos by Category - Accordion Style */}
      {filteredVideos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No training videos found</p>
          {canManage && (
            <Button
              onClick={() => handleOpenDialog()}
              className="mt-4 bg-[#dd1969] hover:bg-[#c01559] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Video
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {VIDEO_CATEGORIES.map((category) => {
            const categoryVideos = videosByCategory[category]
            if (categoryVideos.length === 0) return null
            const isExpanded = expandedCategories.has(category)

            return (
              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                    <h3 className="font-semibold text-lg text-gray-900">
                      {formatCategory(category)}
                    </h3>
                    <Badge variant="secondary" className="ml-2">
                      {categoryVideos.length} video{categoryVideos.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </button>

                {/* Video List */}
                {isExpanded && (
                  <div className="border-t divide-y">
                    {categoryVideos.map((video) => (
                      <div
                        key={video.id}
                        className={`flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors ${!video.is_active ? 'opacity-50' : ''}`}
                      >
                        {/* Play Button / Thumbnail */}
                        <button
                          onClick={() => {
                            setPreviewVideo(video)
                            setPreviewDialogOpen(true)
                          }}
                          className="flex-shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-[#dd1969] to-[#1a2547] flex items-center justify-center hover:opacity-90 transition-opacity"
                        >
                          <Play className="w-6 h-6 text-white" />
                        </button>

                        {/* Video Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">{video.title}</h4>
                          {video.description && (
                            <p className="text-sm text-gray-500 truncate">{video.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {video.duration_seconds && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(video.duration_seconds)}
                              </span>
                            )}
                            {!video.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                <EyeOff className="w-3 h-3 mr-1" />
                                Hidden
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {canManage && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPreviewVideo(video)
                                setPreviewDialogOpen(true)
                              }}
                              title="Preview"
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(video)}
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(video)}
                              title={video.is_active ? 'Hide video' : 'Show video'}
                            >
                              {video.is_active ? (
                                <Eye className="w-4 h-4" />
                              ) : (
                                <EyeOff className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setItemToDelete(video.id)
                                setDeleteDialogOpen(true)
                              }}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVideo ? 'Edit Training Video' : 'Add Training Video'}</DialogTitle>
            <DialogDescription>
              Upload a how-to video for admin staff training
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., How to Add a New User"
                required
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this video covers..."
                rows={3}
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#dd1969]"
              >
                {VIDEO_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{formatCategory(cat)}</option>
                ))}
              </select>
            </div>

            {/* Video Upload */}
            <div>
              <Label>Video File *</Label>
              <div className="mt-2">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoChange}
                  className="hidden"
                />
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {videoFile ? 'Change Video' : 'Upload Video'}
                  </Button>
                  {videoFile && (
                    <span className="text-sm text-gray-600">{videoFile.name}</span>
                  )}
                  {!videoFile && formData.video_url && (
                    <span className="text-sm text-green-600">Video already uploaded</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Max 500MB. Supported formats: MP4, WebM, MOV
                </p>
              </div>
            </div>

            {/* Thumbnail Upload */}
            <div>
              <Label>Thumbnail (Optional)</Label>
              <div className="mt-2">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailChange}
                  className="hidden"
                />
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => thumbnailInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {thumbnailPreview ? 'Change Thumbnail' : 'Upload Thumbnail'}
                  </Button>
                  {thumbnailPreview && (
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      className="w-24 h-16 object-cover rounded"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Duration */}
            <div>
              <Label htmlFor="duration">Duration (seconds)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration_seconds || ''}
                onChange={(e) => setFormData({ ...formData, duration_seconds: parseInt(e.target.value) || 0 })}
                placeholder="e.g., 180 for 3 minutes"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter total duration in seconds (e.g., 90 = 1:30)
              </p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-sm text-gray-500">Make this video visible to admin staff</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            {/* Upload Progress */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#dd1969] h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || (!formData.video_url && !videoFile)}
                className="bg-[#dd1969] hover:bg-[#c01559] text-white"
              >
                {isSubmitting ? 'Saving...' : editingVideo ? 'Update Video' : 'Add Video'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Video Preview Dialog - YouTube sized */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-[1280px] w-[90vw] p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">{previewVideo?.title}</DialogTitle>
            {previewVideo?.description && (
              <DialogDescription className="text-base">{previewVideo.description}</DialogDescription>
            )}
          </DialogHeader>
          {previewVideo && (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={previewVideo.video_url}
                controls
                className="w-full h-full"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Video</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this training video? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
