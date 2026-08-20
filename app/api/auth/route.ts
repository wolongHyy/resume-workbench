import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, login, register } from "../../../lib/auth";

const schema = z.object({ action: z.enum(["login", "register"]), email: z.string().email(), password: z.string().min(6) });
const cookie = (response: NextResponse, id: string) => response.cookies.set("resume_user", id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });

export async function GET(request: NextRequest) { const user = await currentUser(request.cookies.get("resume_user")?.value); return user ? NextResponse.json(user) : NextResponse.json({ error: "未登录" }, { status: 401 }); }
export async function POST(request: NextRequest) { try { const body = schema.parse(await request.json()); const user = body.action === "login" ? await login(body.email, body.password) : await register(body.email, body.password); if (!user) return NextResponse.json({ error: "邮箱或密码不正确" }, { status: 401 }); const response = NextResponse.json(user); cookie(response, user.id); return response; } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败" }, { status: 400 }); } }
export async function DELETE() { const response = NextResponse.json({ ok: true }); response.cookies.set("resume_user", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 }); return response; }
