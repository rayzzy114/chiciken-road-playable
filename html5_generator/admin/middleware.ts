import { NextResponse, type NextRequest } from "next/server";

const REALM = 'Basic realm="Admin Panel"';

function challenge() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": REALM },
  });
}

function parseBasicAuth(authHeader: string | null): { user: string; pass: string } | null {
  if (!authHeader || !authHeader.startsWith("Basic ")) return null;
  try {
    const decoded = atob(authHeader.slice(6));
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return {
      user: decoded.slice(0, sep),
      pass: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const adminUser = process.env.ADMIN_USER;
  const adminPass = process.env.ADMIN_PASS;

  if (!adminUser || !adminPass) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: "ADMIN_USER and ADMIN_PASS must be configured" },
      { status: 500 },
    );
  }

  const creds = parseBasicAuth(request.headers.get("authorization"));
  if (!creds || creds.user !== adminUser || creds.pass !== adminPass) {
    return challenge();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
