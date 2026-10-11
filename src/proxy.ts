import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const owner = process.env.SAC_OWNER_WORKSPACE === "1";
  if (owner) return NextResponse.next(); // Only the loopback-bound owner launcher enables this.
  if (path === "/api/feedback" && request.method === "POST") return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}
export const config = { matcher: ["/api/:path*", "/review/:path*", "/feedback/:path*", "/diagnostics/:path*", "/rules/:path*"] };
