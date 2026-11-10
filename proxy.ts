import { NextResponse, type NextRequest } from "next/server";
import { configProblems, hasDemoAccess, isDemoMode } from "./lib/config";

// Hosting platforms can start pages without the usual startup step,
// so the safety check is repeated here on every request.
export function proxy(request: NextRequest) {
  if (configProblems().length > 0) {
    return new NextResponse("Unavailable: this deployment's settings are unsafe.", { status: 503 });
  }

  // Scheduled jobs cannot type a password. Each /api route checks CRON_SECRET instead.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const password = process.env.DEMO_ACCESS_PASSWORD;
  if (isDemoMode() && password && !hasDemoAccess(request.headers.get("authorization"), password)) {
    return new NextResponse("Access required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Requirement Desk demo"' },
    });
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
