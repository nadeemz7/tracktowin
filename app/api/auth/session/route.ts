import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const COOKIE_NAME = "token";

export async function GET() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "JWT secret not configured" }, { status: 500 });
  }

  try {
    const decoded = jwt.verify(token, secret);
    return NextResponse.json({ user: decoded }, { status: 200 });
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}
