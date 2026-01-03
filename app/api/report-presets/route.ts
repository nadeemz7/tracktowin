import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim() || "Untitled";
  const description = String(body.description || "").trim() || null;
  const configJson = body.configJson || {};
  const preset = await prisma.reportPreset.create({ data: { name, description, configJson } });
  return NextResponse.json({ ok: true, id: preset.id });
}
