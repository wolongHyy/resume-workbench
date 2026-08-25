import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { currentUser } from "../../../lib/auth";
import { normalizeResume } from "../../../lib/store";
import { cleanText, Resume, SectionId } from "../../../lib/types";

const DATA_ROOT = "D:\\简历";
const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe") : "",
].filter(Boolean);

// poppler 的 pdftoppm：把文本 PDF 转成 A4 页面 PNG，用于 PNG/JPG 导出
const PDFTOPPM_CANDIDATES = [
  process.env.POPPLER_PDFTOPPM || "",
  "C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe",
  "C:\\Program Files (x86)\\poppler\\Library\\bin\\pdftoppm.exe",
  "C:\\poppler\\Library\\bin\\pdftoppm.exe",
  "D:\\poppler\\Library\\bin\\pdftoppm.exe",
  "C:\\Users\\1\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\poppler\\Library\\bin\\pdftoppm.exe",
].filter(Boolean);

let edgePath = "";
async function findEdge(): Promise<string> {
  if (edgePath) return edgePath;
  for (const candidate of EDGE_CANDIDATES) {
    try { await fs.access(candidate); edgePath = candidate; return edgePath; } catch { /* 继续尝试下一个路径 */ }
  }
  throw new Error("未找到 Edge 浏览器，无法导出。请确认本机已安装 Microsoft Edge 后重试。");
}

let pdfToPpm = "";
async function findPdfToPpm(): Promise<string> {
  if (pdfToPpm) return pdfToPpm;
  for (const candidate of PDFTOPPM_CANDIDATES) {
    try { await fs.access(candidate); pdfToPpm = candidate; return pdfToPpm; } catch { /* 继续尝试 */ }
  }
  return "";
}

const esc = (v: unknown) => cleanText(v).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
const list = (values: string[], style: string) => {
  const items = values.map(cleanText).filter(Boolean).map((v) => `<li>${esc(v)}</li>`).join("");
  return items ? `<ul class="marker-${style}">${items}</ul>` : "";
};
const title = (id: SectionId) => ({ summary: "个人概述", education: "教育经历", experience: "工作经历", internships: "实习经历", projects: "项目经历", campus: "校园经历", awards: "奖项荣誉", skills: "专业技能", "custom-1": "", "custom-2": "", "custom-3": "", "custom-4": "" }[id]);
const section = (name: string, body: string) => name && body ? `<section><h2>${name}</h2>${body}</section>` : "";

// 只生成文字排版（证件照由导出流程在 PDF/PNG 上叠加，保证各格式一致）
function html(resume: Resume, withPhoto: boolean) {
  const p = resume.profile;
  const meta = [p.headline, resume.targetRole, p.city, p.phone, p.email].map(esc).filter(Boolean).join(" · ");
  const body = resume.sectionOrder.map((id) => {
    if (id === "summary") return section(title(id), esc(resume.summary) ? `<p>${esc(resume.summary)}</p>` : "");
    if (id === "education") return section(title(id), resume.education.map((x) => { const school = esc(x.school); const mid = [x.major, x.degree].map(esc).filter(Boolean).join(" · "); return school || mid || esc(x.date) || esc(x.detail) ? `<div class="item"><div class="row cols3"><strong>${school}</strong><strong class="mid">${mid}</strong><time>${esc(x.date)}</time></div>${esc(x.detail) ? `<p>${esc(x.detail)}</p>` : ""}</div>` : ""; }).join(""));
    if (id === "awards" || id === "skills") return section(title(id), list((id === "awards" ? resume.awards : resume.skills), resume.listStyle));
    if (id.startsWith("custom")) { const item = resume.customSections.find((x) => x.id === id); const content = item ? list(item.lines, resume.listStyle) : ""; return item ? section(esc(item.title), content) : ""; }
    const values = resume[id as "experience" | "internships" | "campus" | "projects"] as Resume["experience"] | Resume["projects"];
    return section(title(id), values.map((x) => { const name = esc("name" in x ? x.name : x.organization); const role = esc(x.role); const bullets = list(x.bullets, resume.listStyle); return name || role || esc(x.date) || bullets ? `<div class="item"><div class="row cols3"><strong>${name}</strong><strong class="mid">${role}</strong><time>${esc(x.date)}</time></div>${bullets}</div>` : ""; }).join(""));
  }).join("");
  const size = `${resume.fontSize}pt`;
  const lineHeight = resume.lineHeight;
  const spacing = `${resume.spacing}px`;
  const itemGap = `${Math.round(resume.spacing * 1.6)}px`;
  const gap = `${resume.moduleGap}px`;
  const photoPad = withPhoto ? ".paper-id{padding-right:96px}" : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;padding:16mm 17mm;width:210mm;min-height:297mm;font-family:Arial,"Microsoft YaHei",sans-serif;color:#000!important;font-size:${size};line-height:${lineHeight}}body *{color:#000!important}strong{font-weight:700}.paper-head{display:flex;gap:18px;align-items:flex-start;justify-content:space-between}.paper-id{flex:1;min-width:0}${photoPad}h1{margin:0 0 6px;font-size:24pt;line-height:1.1}h2{margin:${gap} 0 6px;padding-bottom:3px;border-bottom:1px solid #000;font-size:12pt}p{margin:${spacing} 0}.meta{margin:0 0 12px}.item{margin:${itemGap} 0}.row{display:flex;justify-content:space-between;gap:12px}.row strong{min-width:0}.row time{white-space:nowrap}.row.cols3{justify-content:flex-start}.row.cols3 .mid{flex:1;text-align:center;min-width:0}.row.cols3 time{margin-left:auto}ul{margin:${spacing} 0;padding-left:18px}li{margin:2px 0}.marker-dash{list-style:none;padding-left:0}.marker-dash li::before{content:"- "}.marker-number{list-style:none;padding-left:0;counter-reset:item}.marker-number li{counter-increment:item}.marker-number li::before{content:counter(item) ". "}</style></head><body><div class="paper-head"><div class="paper-id"><h1>${esc(p.name)}</h1>${meta ? `<p class="meta">${meta}</p>` : ""}</div></div>${body}</body></html>`;
}

function run(args: string[], timeoutMs = 90000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(edgePath, args, { windowsHide: true });
    let error = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new Error("导出超时（90秒），可能是浏览器被占用或系统安全软件拦截，请关闭多余 Edge 窗口后重试"));
    }, timeoutMs);
    child.stderr.on("data", (data) => { error += data.toString(); });
    child.on("error", (err) => { if (!done) { done = true; clearTimeout(timer); reject(err); } });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(error || `Edge 渲染失败（退出码 ${code}）`));
    });
  });
}

function runShell(program: string, args: string[], timeoutMs = 90000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, { shell: /\.(cmd|bat)$/i.test(program), windowsHide: true });
    let error = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new Error("图片转换超时（90秒），请重试"));
    }, timeoutMs);
    child.stderr.on("data", (data) => { error += data.toString(); });
    child.on("error", (err) => { if (!done) { done = true; clearTimeout(timer); reject(err); } });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(error || `图片转换失败（退出码 ${code}）`));
    });
  });
}

// 读取证件照并裁剪成 78x104 CSS px（在 192dpi 下为 156x208 px），输出 PNG Buffer
async function loadPhotoOverlay(userId: string, photo: string): Promise<Buffer | null> {
  if (!photo || !/^[A-Za-z0-9._-]+$/.test(photo)) return null;
  const photoPath = path.join(DATA_ROOT, "users", userId, "photos", photo);
  const bytes = await fs.readFile(photoPath).catch(() => null);
  if (!bytes) return null;
  return sharp(bytes).resize(156, 208, { fit: "cover" }).png().toBuffer().catch(() => null);
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request.cookies.get("resume_user")?.value);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let temp = "";
  try {
    const input = await request.json();
    const format = input.format as string;
    if (!(["pdf", "png", "jpg"] as string[]).includes(format)) return NextResponse.json({ error: "不支持的导出格式" }, { status: 400 });
    const resume = normalizeResume(input.resume);
    const photoOverlay = await loadPhotoOverlay(user.id, resume.photo);
    const dir = path.join(DATA_ROOT, "exports", user.id);
    await fs.mkdir(dir, { recursive: true });
    temp = await fs.mkdtemp(path.join(dir, "tmp-"));
    const source = path.join(temp, "resume.html");
    const output = path.join(dir, `resume-${Date.now()}.${format === "jpg" ? "jpg" : format}`);
    await fs.writeFile(source, html(resume, Boolean(photoOverlay)), "utf8");
    edgePath = await findEdge();

    // 第一步：用 Edge 渲染文字版 PDF（该管线稳定，不依赖图片渲染）
    const pdfPath = path.join(temp, "resume.pdf");
    await run(["--headless", "--disable-gpu", `--print-to-pdf=${pdfPath}`, "--no-pdf-header-footer", source]);

    if (format === "pdf") {
      if (!photoOverlay) {
        await fs.copyFile(pdfPath, output);
      } else {
        // 用 pdf-lib 在文字 PDF 第一页右上角叠加证件照，文字仍可选择
        const doc = await PDFDocument.load(await fs.readFile(pdfPath));
        const page = doc.getPages()[0];
        const image = await doc.embedPng(photoOverlay);
        const width = 58.5; // 78 CSS px
        const height = 78;  // 104 CSS px
        const x = page.getWidth() - 48.19 - width;   // 右边距 17mm
        const y = page.getHeight() - 45.35 - height; // 上边距 16mm
        page.drawImage(image, { x, y, width, height });
        await fs.writeFile(output, await doc.save());
      }
    } else {
      // PNG/JPG：先把文字 PDF 转成 A4 页面 PNG，再叠加证件照
      let pagePngPath = "";
      const ppm = await findPdfToPpm();
      if (ppm) {
        const pagePrefix = path.join(temp, "page");
        await runShell(ppm, ["-png", "-r", "192", "-f", "1", "-l", "1", pdfPath, pagePrefix]);
        const pagePng = (await fs.readdir(temp)).find((file) => file.startsWith("page") && file.endsWith(".png"));
        if (!pagePng) throw new Error("PDF 转图片失败，请重试");
        pagePngPath = path.join(temp, pagePng);
      } else {
        // 没有 poppler 时退回 Edge 截图（文字版可靠，证件照同样用 sharp 叠加）
        const fallback = path.join(temp, "capture.png");
        await run(["--headless", "--disable-gpu", `--screenshot=${fallback}`, "--window-size=1588,2246", source]);
        pagePngPath = fallback;
      }
      if (photoOverlay) {
        // 证件照位置：右上角（右/上边距 17mm/16mm，即 129px/121px），照片 156x208px
        const composed = await sharp(pagePngPath).composite([{ input: photoOverlay, left: 1587 - 129 - 156, top: 121 }]).png().toBuffer();
        if (format === "png") await fs.writeFile(output, composed);
        else await sharp(composed).jpeg({ quality: 95 }).toFile(output);
      } else {
        if (format === "png") await fs.copyFile(pagePngPath, output);
        else await sharp(pagePngPath).jpeg({ quality: 95 }).toFile(output);
      }
    }
    const stat = await fs.stat(output).catch(() => null);
    if (!stat || stat.size === 0) throw new Error("导出未生成文件，请重试");
    const data = await fs.readFile(output);
    return new NextResponse(data, { headers: { "Content-Type": format === "pdf" ? "application/pdf" : format === "png" ? "image/png" : "image/jpeg", "Content-Disposition": `attachment; filename="resume.${format}"` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 500 });
  } finally {
    if (temp) await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}
