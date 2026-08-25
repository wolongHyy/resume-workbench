import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { currentUser } from "../../../lib/auth";

const DATA_ROOT = "D:\\简历";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

function photoDir(userId: string) { return path.join(DATA_ROOT, "users", userId, "photos"); }
function safeName(name: string) { return /^[A-Za-z0-9._-]+$/.test(name) ? name : ""; }

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser(request.cookies.get("resume_user")?.value);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const form = await request.formData();
    const resumeId = String(form.get("resumeId") || "").trim();
    if (!/^[A-Za-z0-9-]+$/.test(resumeId)) return NextResponse.json({ error: "简历编号无效" }, { status: 400 });
    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) return NextResponse.json({ error: "图片内容为空" }, { status: 400 });
    if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
    const originalName = "name" in file ? String(file.name) : "";
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: "仅支持 JPG / PNG / WebP / GIF 格式" }, { status: 400 });
    const dir = photoDir(user.id);
    await fs.mkdir(dir, { recursive: true });
    // 同一简历只保留一张证件照：删除旧的同名文件（可能是别的扩展名）
    for (const old of await fs.readdir(dir).catch(() => [] as string[])) {
      if (old.startsWith(`photo-${resumeId}.`)) await fs.rm(path.join(dir, old), { force: true }).catch(() => {});
    }
    const filename = `photo-${resumeId}${ext}`;
    await fs.writeFile(path.join(dir, filename), bytes);
    return NextResponse.json({ photo: filename });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传失败" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request.cookies.get("resume_user")?.value);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const name = safeName(String(request.nextUrl.searchParams.get("photo") || ""));
    if (!name) return NextResponse.json({ error: "参数无效" }, { status: 400 });
    const filePath = path.join(photoDir(user.id), name);
    const data = await fs.readFile(filePath).catch(() => null);
    if (!data) return NextResponse.json({ error: "证件照不存在" }, { status: 404 });
    const ext = path.extname(name).toLowerCase();
    return new NextResponse(data, { headers: { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser(request.cookies.get("resume_user")?.value);
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const name = safeName(String(request.nextUrl.searchParams.get("photo") || ""));
    if (!name) return NextResponse.json({ error: "参数无效" }, { status: 400 });
    await fs.rm(path.join(photoDir(user.id), name), { force: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 });
  }
}
