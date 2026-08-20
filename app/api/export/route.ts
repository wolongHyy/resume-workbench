import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { currentUser } from "../../../lib/auth";
import { normalizeResume } from "../../../lib/store";
import { cleanText, Resume, SectionId } from "../../../lib/types";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const esc = (v: unknown) => cleanText(v).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
const list = (values: string[]) => values.map(esc).filter(Boolean).map((v) => `<li>${v}</li>`).join("");
const title = (id: SectionId) => ({ summary: "个人概述", education: "教育经历", experience: "工作经历", internships: "实习经历", projects: "项目经历", campus: "校园经历", awards: "奖项荣誉", skills: "专业技能", "custom-1": "", "custom-2": "" }[id]);
const section = (name: string, body: string) => name && body ? `<section><h2>${name}</h2>${body}</section>` : "";
function html(resume: Resume) {
  const p = resume.profile; const meta = [p.headline, resume.targetRole, p.city, p.phone, p.email].map(esc).filter(Boolean).join(" · ");
  const body = resume.sectionOrder.map((id) => {
    if (id === "summary") return section(title(id), esc(resume.summary) ? `<p>${esc(resume.summary)}</p>` : "");
    if (id === "education") return section(title(id), resume.education.map((x) => { const heading = [x.school, x.major, x.degree].map(esc).filter(Boolean).join(" · "); return heading || esc(x.date) || esc(x.detail) ? `<div class="row"><strong>${heading}</strong><time>${esc(x.date)}</time></div>${esc(x.detail) ? `<p>${esc(x.detail)}</p>` : ""}` : ""; }).join(""));
    if (id === "awards" || id === "skills") return section(title(id), list((id === "awards" ? resume.awards : resume.skills).map(cleanText).filter(Boolean)) ? `<ul>${list((id === "awards" ? resume.awards : resume.skills).map(cleanText).filter(Boolean))}</ul>` : "");
    if (id.startsWith("custom")) { const item = resume.customSections.find((x) => x.id === id); const content = item ? list(item.lines) : ""; return item ? section(esc(item.title), content ? `<ul>${content}</ul>` : "") : ""; }
    const values = resume[id as "experience" | "internships" | "campus" | "projects"] as Resume["experience"] | Resume["projects"];
    return section(title(id), values.map((x) => { const heading = ["name" in x ? x.name : x.organization, x.role].map(esc).filter(Boolean).join(" · "); const bullets = list(x.bullets); return heading || esc(x.date) || bullets ? `<div class="row"><strong>${heading}</strong><time>${esc(x.date)}</time></div>${bullets ? `<ul>${bullets}</ul>` : ""}` : ""; }).join(""));
  }).join("");
  const size = resume.fontSize === "small" ? "9pt" : resume.fontSize === "large" ? "11pt" : "10pt"; const spacing = resume.spacing === "compact" ? "3px" : resume.spacing === "relaxed" ? "9px" : "5px";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;padding:16mm 17mm;width:210mm;min-height:297mm;font-family:Arial,"Microsoft YaHei",sans-serif;color:#000!important;font-size:${size};line-height:1.5}body *{color:#000!important}h1{margin:0 0 6px;font-size:24pt;line-height:1.1}h2{margin:15px 0 6px;padding-bottom:3px;border-bottom:1px solid #000;font-size:12pt}p{margin:${spacing} 0}.meta{margin:0 0 12px}.row{display:flex;justify-content:space-between;gap:12px}.row strong{min-width:0}.row time{white-space:nowrap}ul{margin:${spacing} 0;padding-left:18px}li{margin:2px 0}</style></head><body><h1>${esc(p.name)}</h1>${meta ? `<p class="meta">${meta}</p>` : ""}${body}</body></html>`;
}
function run(args: string[]) { return new Promise<void>((resolve, reject) => { const child = spawn(edge, args, { windowsHide: true }); let error = ""; child.stderr.on("data", (data) => { error += data.toString(); }); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error || `Edge exited ${code}`))); }); }

export async function POST(request: NextRequest) {
  const user = await currentUser(request.cookies.get("resume_user")?.value); if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try { const input = await request.json(); const format = input.format as string; if (!(["pdf", "png", "jpg"] as string[]).includes(format)) return NextResponse.json({ error: "不支持的导出格式" }, { status: 400 }); const resume = normalizeResume(input.resume); const dir = path.join("D:\\简历", "exports", user.id); await fs.mkdir(dir, { recursive: true }); const temp = await fs.mkdtemp(path.join(dir, "tmp-")); const source = path.join(temp, "resume.html"); const output = path.join(dir, `resume-${Date.now()}.${format === "jpg" ? "jpg" : format}`); await fs.writeFile(source, html(resume), "utf8");
    if (format === "pdf") await run(["--headless", "--disable-gpu", `--print-to-pdf=${output}`, `--no-pdf-header-footer`, source]); else { const png = format === "png" ? output : path.join(temp, "capture.png"); await run(["--headless", "--disable-gpu", `--screenshot=${png}`, "--window-size=1588,2246", source]); if (format === "jpg") await sharp(png).jpeg({ quality: 95 }).toFile(output); }
    const data = await fs.readFile(output); await fs.rm(temp, { recursive: true, force: true }); return new NextResponse(data, { headers: { "Content-Type": format === "pdf" ? "application/pdf" : format === "png" ? "image/png" : "image/jpeg", "Content-Disposition": `attachment; filename="resume.${format}"` } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 500 }); }
}
