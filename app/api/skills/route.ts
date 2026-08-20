import { NextResponse } from "next/server";
import { runSkill, skillStatus } from "../../../lib/ai";
import { AiTask, Resume } from "../../../lib/types";
export async function GET() { return NextResponse.json(await skillStatus()); }
export async function POST(request: Request) { const body = await request.json() as { task: AiTask; resume: Resume; input?: string }; return NextResponse.json(await runSkill(body.task, body.resume, body.input)); }
