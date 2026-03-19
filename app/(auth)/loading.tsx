import { Loader2 } from 'lucide-react'

export default function AuthLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  )
}
