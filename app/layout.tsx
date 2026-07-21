import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkClientProvider } from "./clerk-client-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://agentguard-control-plane.siddhartha-kha310162.chatgpt.site",
  ),
  title: "AgentGuard — AI Agent Governance Control Plane",
  description:
    "Build and run governed AI agents with enforceable policy, DLP, approvals, trusted web search, and durable audit evidence.",
  openGraph: {
    title: "AgentGuard",
    description: "Build agents. Govern every action.",
    images: [
      {
        url: "/og.png",
        width: 1729,
        height: 910,
        alt: "AgentGuard Replay blocking a hostile repository command and preserving a safe replay trace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentGuard Control Plane",
    description: "Build agents. Govern every action.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );

  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkClientProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
    >
      {content}
    </ClerkClientProvider>
  ) : (
    content
  );
}
