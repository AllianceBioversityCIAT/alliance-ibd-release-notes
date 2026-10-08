import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const decoded = Buffer.from(token, "base64").toString();
    const email = decoded.split(":")[0];
    return NextResponse.json({ authenticated: true, email });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
