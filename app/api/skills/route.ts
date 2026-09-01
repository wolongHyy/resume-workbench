import { NextResponse } from "next/server";
import { runSkill, skillStatus } from "../../../lib/ai";
import { AiTask, Resume } from "../../../lib/types";

const ALLOWED_TASKS: AiTask[] = ["parse", "optimize", "match", "check", "coach"];

export async function GET() { return NextResponse.json(await skillStatus()); }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { task?: unknown; resume?: unknown; input?: unknown } | null;
  if (!body || !ALLOWED_TASKS.includes(body.task as AiTask) || typeof body.resume !== "object" || body.resume === null) {
    return NextResponse.json({ error: "无效的 Skill 任务参数" }, { status: 400 });
  }
  const resume = body.resume as Resume;
  const input = typeof body.input === "string" ? body.input : "";
  const result = await runSkill(body.task as AiTask, resume, input);
  return NextResponse.json(result);
}
