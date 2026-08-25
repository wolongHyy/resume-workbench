import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import pdfParse from "pdf-parse";
import { currentUser } from "../../../lib/auth";
import { parsePlainText } from "../../../lib/importer";
import { normalizeResume } from "../../../lib/store";

const MAX_BYTES = 20 * 1024 * 1024;

// 大型或加密 PDF 解析可能很慢甚至卡死：超过 45 秒就放弃，避免请求一直挂着（表现为页面“Failed to fetch”）
function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PDF 解析超时（45秒），可能文件过大或已加密，请改用 Word/TXT 格式重试")), 45000);
    pdfParse(buffer).then((parsed) => { clearTimeout(timer); resolve(parsed); }).catch((error) => { clearTimeout(timer); reject(error); });
  });
}

// .docx 本质是 zip，正文在 word/document.xml；把段落/换行/制表符还原成文本
function docxText(xml: string): string {
  return xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 老式 txt 常是 GBK 编码：先按 UTF-8 解，出现乱码再按 GBK 解
function decodeTextFile(buffer: Buffer): string {
  let decoded = buffer.toString("utf8");
  if (decoded.includes("\uFFFD")) {
    try {
      decoded = new TextDecoder("gbk").decode(buffer);
    } catch {
      decoded = buffer.toString("utf8");
    }
  }
  return decoded;
}

export async function POST(request: NextRequest) {
  try {
    if (!(await currentUser(request.cookies.get("resume_user")?.value))) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    let resumeInput: unknown = {};
    let text = "";
    let fileName = "";
    let buffer: Buffer | null = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const resumeRaw = form.get("resume");
      if (typeof resumeRaw === "string") {
        try { resumeInput = JSON.parse(resumeRaw); } catch { throw new Error("当前简历数据无法解析，请先刷新页面后重试"); }
      }
      const textRaw = form.get("text");
      if (typeof textRaw === "string") text = textRaw;
      const file = form.get("file");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const data = Buffer.from(await file.arrayBuffer());
        if (data.length > MAX_BYTES) return NextResponse.json({ error: "文件过大，请选择 20MB 以内的简历" }, { status: 400 });
        buffer = data;
        fileName = "name" in file ? String(file.name) : "";
      }
    } else {
      const input = z.object({ text: z.string().max(100000).optional(), resume: z.unknown() }).parse(await request.json());
      text = input.text || "";
      resumeInput = input.resume;
    }

    const base = normalizeResume(Object.keys(resumeInput as Record<string, unknown>).length ? resumeInput : { id: "import-base" });
    let source = text;

    if (buffer && buffer.length) {
      const ext = (fileName.split(".").pop() || "").toLowerCase();
      if (ext === "pdf") {
        const parsed = await parsePdf(buffer);
        source = parsed.text || "";
      } else if (ext === "docx") {
        const zip = await JSZip.loadAsync(buffer);
        const entry = zip.file("word/document.xml");
        if (!entry) throw new Error("无法解析该 Word 文件（缺少文档正文）");
        source = docxText(await entry.async("string"));
      } else {
        source = decodeTextFile(buffer);
      }
      if (!source.trim()) throw new Error("未从文件中识别到文字内容，请确认文件可正常打开");
    }

    if (!source.trim()) throw new Error("请粘贴简历文本或选择简历文件");
    const parsed = parsePlainText(source, base);
    if (!parsed) return NextResponse.json({ error: "未识别到简历内容，请检查文件或文本是否为中文简历" }, { status: 422 });
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 });
  }
}
