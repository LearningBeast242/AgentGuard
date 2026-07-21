import { NextResponse } from "next/server";

// Clerk's session cookie is verified inside the application with the
// Cloudflare-compatible backend package. Native Sites ChatGPT identity arrives
// independently through trusted platform headers.
export default function authenticationBoundary() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
