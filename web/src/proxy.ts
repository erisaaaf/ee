import { NextResponse, type NextRequest } from "next/server";

// Lightweight routing guard: sends signed-out visitors to /login and signed-in visitors away from auth pages.
// This only checks that a session cookie exists — real authorisation happens on every API request on the server.
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/privacy-policy"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("vt_session");
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|sw.js|.*\\.(?:png|svg|ico|webmanifest|js)$).*)"],
};
