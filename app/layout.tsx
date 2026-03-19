import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "AIME Member Portal",
  description: "Association of Independent Mortgage Experts Member Portal - Access exclusive resources, lenders, market insights, and events for mortgage professionals.",
  keywords: ["AIME", "mortgage", "member portal", "loan officers", "brokers", "mortgage resources"],
  authors: [{ name: "AIME" }],
  openGraph: {
    title: "AIME Member Portal",
    description: "Association of Independent Mortgage Experts Member Portal",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${hankenGrotesk.variable} antialiased font-sans`}
        style={{ fontFamily: 'var(--font-hanken-grotesk)' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
