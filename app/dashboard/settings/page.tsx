'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import BillingTab from '@/components/settings/BillingTab'
import { getImpersonationSettingsClient } from '@/lib/impersonation'

export default function SettingsPage() {
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [avatarUrl, setAvatarUrl] = useState<string>('')

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isPasswordLoading, setIsPasswordLoading] = useState(false)

  const [formData, setFormData] = useState({
    // Personal Information
    firstName: '',
    lastName: '',
    email: '',
    mobilePhone: '',
    mailingAddress: '',
    city: '',
    state: '',
    zipCode: '',
    roleType: '',
    individualNMLS: '',
    stateLicenses: [] as string[],
    birthday: '',
    gender: '',
    languagesSpoken: [] as string[],
    race: '',

    // Company Information
    company: '',
    companyNMLS: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyZipCode: '',
    companyPhone: '',

    // Subscriptions
    scotsmanGuide: false,
  })

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) return

      // Check for impersonation - use impersonated user's ID if active
      const impersonationSettings = getImpersonationSettingsClient()
      const effectiveUserId = impersonationSettings?.isImpersonating
        ? impersonationSettings.impersonatedUserId
        : user.id
      const effectiveEmail = impersonationSettings?.isImpersonating
        ? impersonationSettings.impersonatedUserEmail
        : user.email

      setUser({ ...user, id: effectiveUserId, email: effectiveEmail })

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', effectiveUserId)
        .single()

      setProfile(profile)

      if (profile) {
        // Use first_name/last_name if available, otherwise parse full_name
        let firstName = profile.first_name || ''
        let lastName = profile.last_name || ''
        if (!firstName && !lastName && profile.full_name) {
          const nameParts = profile.full_name.split(' ')
          firstName = nameParts[0] || ''
          lastName = nameParts.slice(1).join(' ') || ''
        }

        setAvatarUrl(profile.avatar_url || '')

        setFormData({
          firstName,
          lastName,
          email: user.email || profile.email || '',
          mobilePhone: profile.phone || '',
          mailingAddress: profile.address || '',
          city: profile.city || '',
          state: profile.state || '',
          zipCode: profile.zip_code || '',
          roleType: profile.role || '',
          individualNMLS: profile.nmls_number || '',
          stateLicenses: profile.state_licenses || [],
          birthday: profile.birthday || '',
          gender: profile.gender || '',
          languagesSpoken: profile.languages_spoken || [],
          race: profile.race || '',
          company: profile.company || '',
          companyNMLS: profile.company_nmls || '',
          companyAddress: profile.company_address || '',
          companyCity: profile.company_city || '',
          companyState: profile.company_state || '',
          companyZipCode: profile.company_zip_code || '',
          companyPhone: profile.company_phone || '',
          scotsmanGuide: profile.scotsman_guide_subscription || false,
        })
      }

      setIsLoading(false)
    }

    loadProfile()
  }, [])

  const toggleStateLicense = (state: string) => {
    setFormData(prev => ({
      ...prev,
      stateLicenses: prev.stateLicenses.includes(state)
        ? prev.stateLicenses.filter(s => s !== state)
        : [...prev.stateLicenses, state]
    }))
  }

  const toggleLanguage = (language: string) => {
    setFormData(prev => ({
      ...prev,
      languagesSpoken: prev.languagesSpoken.includes(language)
        ? prev.languagesSpoken.filter(l => l !== language)
        : [...prev.languagesSpoken, language]
    }))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    setIsUploadingImage(true)

    try {
      // Create unique file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user?.id)

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      toast.success('Profile picture updated successfully!')

      // Refresh the page to update the sidebar avatar
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(error.message || 'Failed to upload profile picture')
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: formData.firstName.trim(),
          last_name: formData.lastName.trim(),
          full_name: `${formData.firstName} ${formData.lastName}`.trim(),
          phone: formData.mobilePhone,
          address: formData.mailingAddress,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zipCode,
          nmls_number: formData.individualNMLS || null,
          state_licenses: formData.stateLicenses,
          birthday: formData.birthday,
          gender: formData.gender,
          languages_spoken: formData.languagesSpoken,
          race: formData.race,
          company: formData.company,
          company_nmls: formData.companyNMLS,
          company_address: formData.companyAddress,
          company_city: formData.companyCity,
          company_state: formData.companyState,
          company_zip_code: formData.companyZipCode,
          company_phone: formData.companyPhone,
          scotsman_guide_subscription: formData.scotsmanGuide,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id)

      if (error) throw error

      // GHL sync happens automatically via database trigger

      setIsEditing(false)
      toast.success('Profile updated successfully!')
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    // Reload profile data to reset form
    // Use first_name/last_name if available, otherwise parse full_name
    let firstName = profile?.first_name || ''
    let lastName = profile?.last_name || ''
    if (!firstName && !lastName && profile?.full_name) {
      const nameParts = profile.full_name.split(' ')
      firstName = nameParts[0] || ''
      lastName = nameParts.slice(1).join(' ') || ''
    }

    setFormData({
      firstName,
      lastName,
      email: user?.email || profile?.email || '',
      mobilePhone: profile?.phone || '',
      mailingAddress: profile?.address || '',
      city: profile?.city || '',
      state: profile?.state || '',
      zipCode: profile?.zip_code || '',
      roleType: profile?.role || '',
      individualNMLS: profile?.nmls_number || '',
      stateLicenses: profile?.state_licenses || [],
      birthday: profile?.birthday || '',
      gender: profile?.gender || '',
      languagesSpoken: profile?.languages_spoken || [],
      race: profile?.race || '',
      company: profile?.company || '',
      companyNMLS: profile?.company_nmls || '',
      companyAddress: profile?.company_address || '',
      companyCity: profile?.company_city || '',
      companyState: profile?.company_state || '',
      companyZipCode: profile?.company_zip_code || '',
      companyPhone: profile?.company_phone || '',
      scotsmanGuide: profile?.scotsman_guide_subscription || false,
    })

    setIsEditing(false)
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPasswordLoading(true)

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      setIsPasswordLoading(false)
      return
    }

    // Validate password length
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long')
      setIsPasswordLoading(false)
      return
    }

    try {
      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: currentPassword,
      })

      if (signInError) {
        toast.error('Current password is incorrect')
        setIsPasswordLoading(false)
        return
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        throw updateError
      }

      toast.success('Password updated successfully!')

      // Clear password fields
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      console.error('Error updating password:', error)
      toast.error(error.message || 'Failed to update password')
    } finally {
      setIsPasswordLoading(false)
    }
  }

  // Check if user is a partner (vendor or lender)
  const isPartner = profile?.role === 'partner_vendor' || profile?.role === 'partner_lender'

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#dd1969]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="px-4 md:px-8 py-6 md:py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-[#dd1969] mb-2">
          SETTINGS
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="px-4 md:px-8 pb-8">
        <Tabs defaultValue="profile" className="w-full">
          {isPartner ? (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Email & Password</TabsTrigger>
            </TabsList>
          ) : (
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="security">Email & Password</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>
          )}

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="bg-white rounded-lg shadow-md p-6 space-y-8">
              {/* Edit/Save Buttons */}
              <div className="flex justify-end gap-3">
                {!isEditing ? (
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    className="border-[#dd1969] text-[#dd1969] hover:bg-[#dd1969] hover:text-white"
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleCancelEdit}
                      variant="outline"
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="bg-[#dd1969] hover:bg-[#c01559] text-white"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                  </>
                )}
              </div>

              {/* Profile Picture */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Profile Picture</h3>
                <div className="flex items-center gap-6">
                  <div className="relative">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile"
                        className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#20adce] to-[#dd1969] flex items-center justify-center text-white text-3xl font-bold">
                        {formData.firstName?.[0]}{formData.lastName?.[0]}
                      </div>
                    )}
                    {isUploadingImage && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      id="avatar-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={isUploadingImage}
                    />
                    <Button
                      onClick={() => document.getElementById('avatar-upload')?.click()}
                      variant="outline"
                      disabled={isUploadingImage}
                      className="mb-2"
                    >
                      {isUploadingImage ? 'Uploading...' : 'Change Picture'}
                    </Button>
                    <p className="text-sm text-gray-500">
                      JPG, PNG or GIF. Max size 5MB.
                    </p>
                  </div>
                </div>
              </div>

              {/* Partner Simplified Profile */}
              {isPartner ? (
                <div>
                  <h3 className="text-xl font-bold text-[#25314e] mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        disabled={!isEditing}
                        className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        disabled={!isEditing}
                        className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        disabled
                        className="mt-2 bg-gray-50"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobilePhone">Phone</Label>
                      <Input
                        id="mobilePhone"
                        type="tel"
                        value={formData.mobilePhone}
                        onChange={(e) => setFormData({ ...formData, mobilePhone: e.target.value })}
                        disabled={!isEditing}
                        className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor="roleType">Account Type</Label>
                      <Input
                        id="roleType"
                        type="text"
                        value={profile?.role === 'partner_vendor' ? 'Vendor Partner' : 'Lender Partner'}
                        disabled
                        className="mt-2 bg-gray-50"
                      />
                    </div>
                  </div>
                </div>
              ) : (
              <>
              {/* Personal Information - Full form for regular users */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="mt-2 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mobilePhone">Mobile Phone</Label>
                    <Input
                      id="mobilePhone"
                      type="tel"
                      value={formData.mobilePhone}
                      onChange={(e) => setFormData({ ...formData, mobilePhone: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="mailingAddress">Mailing Address</Label>
                    <Input
                      id="mailingAddress"
                      type="text"
                      value={formData.mailingAddress}
                      onChange={(e) => setFormData({ ...formData, mailingAddress: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode">Zip Code</Label>
                    <Input
                      id="zipCode"
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="roleType">Role Type</Label>
                    <Input
                      id="roleType"
                      type="text"
                      value={formData.roleType}
                      disabled
                      className="mt-2 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="individualNMLS">Individual NMLS</Label>
                    <Input
                      id="individualNMLS"
                      type="text"
                      value={formData.individualNMLS}
                      onChange={(e) => setFormData({ ...formData, individualNMLS: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="stateLicenses">State Licenses</Label>
                    <Select value={formData.stateLicenses[0] || ''} onValueChange={(value) => toggleStateLicense(value)} disabled={!isEditing}>
                      <SelectTrigger className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}>
                        <SelectValue placeholder="Select state licenses" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="AL">AL - Alabama</SelectItem>
                        <SelectItem value="AK">AK - Alaska</SelectItem>
                        <SelectItem value="AZ">AZ - Arizona</SelectItem>
                        <SelectItem value="AR">AR - Arkansas</SelectItem>
                        <SelectItem value="CA">CA - California</SelectItem>
                        <SelectItem value="CO">CO - Colorado</SelectItem>
                        <SelectItem value="CT">CT - Connecticut</SelectItem>
                        <SelectItem value="DE">DE - Delaware</SelectItem>
                        <SelectItem value="FL">FL - Florida</SelectItem>
                        <SelectItem value="GA">GA - Georgia</SelectItem>
                        <SelectItem value="HI">HI - Hawaii</SelectItem>
                        <SelectItem value="ID">ID - Idaho</SelectItem>
                        <SelectItem value="IL">IL - Illinois</SelectItem>
                        <SelectItem value="IN">IN - Indiana</SelectItem>
                        <SelectItem value="IA">IA - Iowa</SelectItem>
                        <SelectItem value="KS">KS - Kansas</SelectItem>
                        <SelectItem value="KY">KY - Kentucky</SelectItem>
                        <SelectItem value="LA">LA - Louisiana</SelectItem>
                        <SelectItem value="ME">ME - Maine</SelectItem>
                        <SelectItem value="MD">MD - Maryland</SelectItem>
                        <SelectItem value="MA">MA - Massachusetts</SelectItem>
                        <SelectItem value="MI">MI - Michigan</SelectItem>
                        <SelectItem value="MN">MN - Minnesota</SelectItem>
                        <SelectItem value="MS">MS - Mississippi</SelectItem>
                        <SelectItem value="MO">MO - Missouri</SelectItem>
                        <SelectItem value="MT">MT - Montana</SelectItem>
                        <SelectItem value="NE">NE - Nebraska</SelectItem>
                        <SelectItem value="NV">NV - Nevada</SelectItem>
                        <SelectItem value="NH">NH - New Hampshire</SelectItem>
                        <SelectItem value="NJ">NJ - New Jersey</SelectItem>
                        <SelectItem value="NM">NM - New Mexico</SelectItem>
                        <SelectItem value="NY">NY - New York</SelectItem>
                        <SelectItem value="NC">NC - North Carolina</SelectItem>
                        <SelectItem value="ND">ND - North Dakota</SelectItem>
                        <SelectItem value="OH">OH - Ohio</SelectItem>
                        <SelectItem value="OK">OK - Oklahoma</SelectItem>
                        <SelectItem value="OR">OR - Oregon</SelectItem>
                        <SelectItem value="PA">PA - Pennsylvania</SelectItem>
                        <SelectItem value="RI">RI - Rhode Island</SelectItem>
                        <SelectItem value="SC">SC - South Carolina</SelectItem>
                        <SelectItem value="SD">SD - South Dakota</SelectItem>
                        <SelectItem value="TN">TN - Tennessee</SelectItem>
                        <SelectItem value="TX">TX - Texas</SelectItem>
                        <SelectItem value="UT">UT - Utah</SelectItem>
                        <SelectItem value="VT">VT - Vermont</SelectItem>
                        <SelectItem value="VA">VA - Virginia</SelectItem>
                        <SelectItem value="WA">WA - Washington</SelectItem>
                        <SelectItem value="WV">WV - West Virginia</SelectItem>
                        <SelectItem value="WI">WI - Wisconsin</SelectItem>
                        <SelectItem value="WY">WY - Wyoming</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.stateLicenses.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {formData.stateLicenses.map(state => (
                          <span key={state} className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                            {state}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="birthday">Birthday</Label>
                    <Input
                      id="birthday"
                      type="date"
                      value={formData.birthday}
                      onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })} disabled={!isEditing}>
                      <SelectTrigger className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                        <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="languagesSpoken">Languages Spoken</Label>
                    <Select value={formData.languagesSpoken[0] || ''} onValueChange={(value) => toggleLanguage(value)} disabled={!isEditing}>
                      <SelectTrigger className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}>
                        <SelectValue placeholder="Select languages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="English">English</SelectItem>
                        <SelectItem value="Spanish">Spanish</SelectItem>
                        <SelectItem value="Mandarin">Mandarin</SelectItem>
                        <SelectItem value="French">French</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.languagesSpoken.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {formData.languagesSpoken.map(lang => (
                          <span key={lang} className="bg-gray-100 px-3 py-1 rounded-full text-sm">
                            {lang}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="race">Race</Label>
                    <Select value={formData.race} onValueChange={(value) => setFormData({ ...formData, race: value })} disabled={!isEditing}>
                      <SelectTrigger className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}>
                        <SelectValue placeholder="Select race" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asian">Asian</SelectItem>
                        <SelectItem value="Black or African American">Black or African American</SelectItem>
                        <SelectItem value="Hispanic or Latino">Hispanic or Latino</SelectItem>
                        <SelectItem value="White">White</SelectItem>
                        <SelectItem value="Native American or Alaska Native">Native American or Alaska Native</SelectItem>
                        <SelectItem value="Native Hawaiian or Pacific Islander">Native Hawaiian or Pacific Islander</SelectItem>
                        <SelectItem value="Two or More Races">Two or More Races</SelectItem>
                        <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Company Information */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="company">Company Name</Label>
                    <Input
                      id="company"
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyPhone">Company Phone</Label>
                    <Input
                      id="companyPhone"
                      type="tel"
                      value={formData.companyPhone}
                      onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="companyAddress">Company Address</Label>
                    <Input
                      id="companyAddress"
                      type="text"
                      value={formData.companyAddress}
                      onChange={(e) => setFormData({ ...formData, companyAddress: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyCity">Company City</Label>
                    <Input
                      id="companyCity"
                      type="text"
                      value={formData.companyCity}
                      onChange={(e) => setFormData({ ...formData, companyCity: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyState">Company State</Label>
                    <Input
                      id="companyState"
                      type="text"
                      value={formData.companyState}
                      onChange={(e) => setFormData({ ...formData, companyState: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyZipCode">Company Zip Code</Label>
                    <Input
                      id="companyZipCode"
                      type="text"
                      value={formData.companyZipCode}
                      onChange={(e) => setFormData({ ...formData, companyZipCode: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyNMLS">Company NMLS</Label>
                    <Input
                      id="companyNMLS"
                      type="text"
                      value={formData.companyNMLS}
                      onChange={(e) => setFormData({ ...formData, companyNMLS: e.target.value })}
                      disabled={!isEditing}
                      className={`mt-2 ${!isEditing ? 'bg-gray-50' : ''}`}
                    />
                  </div>
                </div>
              </div>

              {/* Subscriptions */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Subscriptions</h3>
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="scotsmanGuide"
                    checked={formData.scotsmanGuide}
                    onCheckedChange={(checked) => setFormData({ ...formData, scotsmanGuide: checked as boolean })}
                    disabled={!isEditing}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="scotsmanGuide"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Scotsman Guide Subscription
                    </label>
                    <p className="text-sm text-gray-500">
                      Receive your FREE subscription to Scotsman Guide
                    </p>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          </TabsContent>

          {/* Email & Password Tab */}
          <TabsContent value="security">
            <div className="bg-white rounded-lg shadow-md p-6 space-y-8">
              {/* Change Email Section */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Change Email</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentEmail">Current Email</Label>
                    <Input
                      id="currentEmail"
                      type="email"
                      value={formData.email}
                      disabled
                      className="mt-2 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newEmail">New Email</Label>
                    <Input
                      id="newEmail"
                      type="email"
                      placeholder="Enter new email address"
                      className="mt-2"
                    />
                  </div>
                  <Button className="bg-[#dd1969] hover:bg-[#c01559] text-white">
                    Update Email
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Change Password Section */}
              <div>
                <h3 className="text-xl font-bold text-[#25314e] mb-4">Change Password</h3>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative mt-2">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative mt-2">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Enter new password (min. 8 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative mt-2">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isPasswordLoading}
                    className="bg-[#dd1969] hover:bg-[#c01559] text-white"
                  >
                    {isPasswordLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>

          {/* Billing Tab - Only for non-partners */}
          {!isPartner && (
            <TabsContent value="billing">
              <BillingTab initialPlanTier={profile?.plan_tier || 'None'} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
