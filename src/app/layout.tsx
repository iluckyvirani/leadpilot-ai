import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadPilot AI - AI sales agent for local-business outreach",
  description: "A Claude tool-use agent that researches leads, scores them and drafts personalised outreach for human approval.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-xs text-white">LP</span>
              LeadPilot <span className="text-indigo-600">AI</span>
            </Link>
            <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900">Dashboard</Link>
            <Link href="/approvals" className="text-sm text-zinc-600 hover:text-zinc-900">Approvals</Link>
            <Link href="/runs" className="text-sm text-zinc-600 hover:text-zinc-900">Agent runs</Link>
            <span className="ml-auto hidden text-xs text-zinc-400 sm:block">Claude tool use · Next.js · Prisma · Postgres</span>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
