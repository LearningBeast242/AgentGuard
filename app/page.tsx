import type { Metadata } from "next";
import { AgentGuardApp } from "./agentguard-app";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AgentGuard — Govern every agent action",
  description:
    "Build, test, and operate AI agents with enforceable policy, DLP, approvals, and replay.",
};

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <AgentGuardApp
      user={
        user
          ? {
              displayName: user.displayName,
              email: user.email,
              authProvider: user.authProvider,
            }
          : null
      }
      clerkConfigured={Boolean(
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
          process.env.CLERK_SECRET_KEY,
      )}
    />
  );
}
