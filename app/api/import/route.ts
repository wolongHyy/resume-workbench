import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { currentUser } from "../../../lib/auth";
import { parseDocxXml, parsePdf } from "../../../lib/file-parser";
import { parsePlainText, StyledLine } from "../../../lib/importer";
import { normalizeResume } from "../../../lib/store";

const MAX_BYTES = 20 * 1024 * 1024;

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
    let styledLines: StyledLine[] | undefined;

    if (buffer && buffer.length) {
      const ext = (fileName.split(".").pop() || "").toLowerCase();
      if (ext === "pdf") {
        const parsed = await parsePdf(buffer);
        source = parsed.text || "";
        styledLines = parsed.lines;
      } else if (ext === "docx") {
        const zip = await JSZip.loadAsync(buffer);
        const entry = zip.file("word/document.xml");
        if (!entry) throw new Error("无法解析该 Word 文件（缺少文档正文）");
        const parsed = parseDocxXml(await entry.async("string"));
        source = parsed.text;
        styledLines = parsed.lines;
      } else {
        source = decodeTextFile(buffer);
      }
      if (!source.trim()) throw new Error("未从文件中识别到文字内容，请确认文件可正常打开");
    }

    if (!source.trim()) throw new Error("请粘贴简历文本或选择简历文件");
    const parsed = parsePlainText(source, base, styledLines);
    if (!parsed) return NextResponse.json({ error: "未识别到简历内容，请检查文件或文本是否为中文简历" }, { status: 422 });
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 });
  }
}
