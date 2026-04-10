import { NextRequest, NextResponse } from "next/server";

const VALID_USERS = [
  { email: "ibd-test@cgiar.org", password: "TestGb4567" },
];

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const user = VALID_USERS.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");

  const res = NextResponse.json({ ok: true, email: user.email });
  res.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
