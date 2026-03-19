'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface CopyLinkButtonProps {
  path: string
  label?: string
  className?: string
  variant?: 'ghost' | 'outline' | 'default'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  showLabel?: boolean
}

export function CopyLinkButton({
  path,
  label = 'Copy Link',
  className = '',
  variant = 'ghost',
  size = 'sm',
  showLabel = false,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    // Use the production URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.brokersarebest.com'
    const fullUrl = `${baseUrl}${path}`

    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      toast.success('Link copied to clipboard!')

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Failed to copy link')
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      className={`text-gray-600 hover:text-gray-900 hover:bg-gray-50 ${className}`}
      title={label}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-600" />
      ) : (
        <Link2 className="w-4 h-4" />
      )}
      {showLabel && <span className="ml-2">{copied ? 'Copied!' : label}</span>}
    </Button>
  )
}
