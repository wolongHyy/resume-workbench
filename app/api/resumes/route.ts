import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { listResumes, saveResume } from "../../../lib/store";

async function userFor(request: NextRequest) { return currentUser(request.cookies.get("resume_user")?.value); }
export async function GET(request: NextRequest) { try { const user = await userFor(request); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); return NextResponse.json(await listResumes(user.id)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取简历失败" }, { status: 500 }); } }
export async function POST(request: NextRequest) { try { const user = await userFor(request); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 }); return NextResponse.json(await saveResume(user.id, await request.json())); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存简历失败" }, { status: 400 }); } }
