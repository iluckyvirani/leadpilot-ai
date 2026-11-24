import { NextResponse, type NextRequest } from "next/server";

// Optional HTTP Basic auth for the whole app. Set APP_PASSWORD on any public deployment,
// otherwise anyone with the URL can run the agent on your Claude credits.
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LeadPilot AI"' },
  });
}

export const config = {
  // Cron has its own bearer-token check; static assets stay public.
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
