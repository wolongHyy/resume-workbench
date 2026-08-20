import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../lib/auth";
import { parsePlainText } from "../../../lib/importer";
import { normalizeResume } from "../../../lib/store";

const payload = z.object({ text: z.string().min(1).max(100000), resume: z.unknown() });
export async function POST(request: NextRequest) { try { if (!await currentUser(request.cookies.get("resume_user")?.value)) return NextResponse.json({ error: "未登录" }, { status: 401 }); const input = payload.parse(await request.json()); const parsed = parsePlainText(input.text, normalizeResume(input.resume)); return parsed ? NextResponse.json(parsed) : NextResponse.json({ error: "非简历内容，导入失败，请导入可识别的简历内容" }, { status: 422 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 }); } }
