"use client"

import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      expand={false}
      closeButton
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="size-5 text-[#1a2547]" />,
        info: <Info className="size-5 text-[#20adce]" />,
        warning: <AlertTriangle className="size-5 text-amber-500" />,
        error: <AlertCircle className="size-5 text-[#dd1969]" />,
        loading: <Loader2 className="size-5 animate-spin text-[#20adce]" />,
      }}
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border group-[.toaster]:border-gray-200 group-[.toaster]:shadow-xl group-[.toaster]:rounded-lg group-[.toaster]:py-4 group-[.toaster]:px-4",
          title: "group-[.toast]:font-semibold group-[.toast]:text-[#1a2547]",
          description: "group-[.toast]:text-gray-600 group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-[#dd1969] group-[.toast]:text-white group-[.toast]:font-medium group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:hover:bg-[#c01559] group-[.toast]:transition-colors",
          cancelButton: "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-700 group-[.toast]:font-medium group-[.toast]:rounded-md group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-sm group-[.toast]:hover:bg-gray-200 group-[.toast]:transition-colors",
          closeButton: "group-[.toast]:bg-white group-[.toast]:border-gray-200 group-[.toast]:text-gray-400 group-[.toast]:hover:text-[#1a2547] group-[.toast]:hover:bg-gray-50",
          success: "group-[.toast]:border-l-4 group-[.toast]:border-l-[#1a2547]",
          error: "group-[.toast]:border-l-4 group-[.toast]:border-l-[#dd1969]",
          warning: "group-[.toast]:border-l-4 group-[.toast]:border-l-amber-500",
          info: "group-[.toast]:border-l-4 group-[.toast]:border-l-[#20adce]",
        },
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#1a2547",
          "--normal-border": "#e5e7eb",
          "--border-radius": "0.5rem",
          "--width": "380px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
