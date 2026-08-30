import pdfParse from "pdf-parse";
import { cleanText, StyledLine } from "./types";

// 大型或加密 PDF 解析可能很慢甚至卡死：超过 45 秒就放弃，避免请求一直挂着（表现为页面“Failed to fetch”）
export function parsePdf(buffer: Buffer): Promise<{ text: string; lines: StyledLine[] }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("PDF 解析超时（45秒），可能文件过大或已加密，请改用 Word/TXT 格式重试")), 45000);
    const lines: StyledLine[] = [];
    pdfParse(buffer, { pagerender: (page: unknown) => renderPdfPage(page, lines) })
      .then((parsed) => { clearTimeout(timer); resolve({ text: String(parsed.text || ""), lines }); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });
}

// 解析 PDF 页面：既还原纯文本，也记录每行的“加粗 / 字号”，供核心标识识别使用
function renderPdfPage(page: any, collector: StyledLine[]): Promise<string> {
  return page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
    .then((textContent: any) => {
      const lines: StyledLine[] = [];
      let buffer = "";
      let maxSize = 0;
      let bold = false;
      let lastY: number | null = null;
      const flush = () => {
        const text = buffer.replace(/\s+/g, " ").trim();
        if (text) lines.push({ text, bold, size: maxSize });
        buffer = "";
        maxSize = 0;
        bold = false;
      };
      for (const item of textContent.items || []) {
        const y = item.transform ? item.transform[5] : 0;
        const size = item.transform ? Math.hypot(item.transform[0], item.transform[1]) : 0;
        let itemBold = false;
        try {
          const font = page.commonObjs ? page.commonObjs.get(item.fontName) : null;
          const fontName = String((font && (font.name || font.loadedName)) || "");
          itemBold = !!(font && (font.bold || font.black)) || /bold|heavy|black|semibold|黑体|粗/i.test(fontName);
        } catch { /* 字体对象缺失时按非加粗处理 */ }
        // 换行判断：pdf.js 的 hasEOL 标记，或 y 坐标明显变化（兼容没标记的 PDF）
        if (lastY !== null && Math.abs(y - lastY) > 2 && buffer.trim()) flush();
        buffer += item.str || "";
        if (size > maxSize) maxSize = size;
        if (itemBold) bold = true;
        lastY = y;
        if (item.hasEOL) flush();
      }
      flush();
      collector.push(...lines);
      return lines.map((line) => line.text).join("\n");
    })
    .catch(async () => {
      // 个别 PDF 字体结构异常时退回纯文本，保证导入不失败
      const textContent = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).catch(() => null);
      if (!textContent) return "";
      let lastY: number | null = null;
      let text = "";
      for (const item of textContent.items || []) {
        const y = item.transform ? item.transform[5] : 0;
        if (lastY !== null && Math.abs(y - lastY) > 2 && text) text += "\n";
        text += item.str || "";
        lastY = y;
      }
      return text;
    });
}

// .docx 本质是 zip，正文在 word/document.xml；把段落/换行/制表符还原成文本，并保留“加粗 / 字号”
export function parseDocxXml(xml: string): { text: string; lines: StyledLine[] } {
  const isBold = (props: string) => {
    const match = props.match(/<w:b(?:\s+w:val="([^"]*)")?\s*\/>/);
    if (!match) return false;
    const val = (match[1] || "true").toLowerCase();
    return !["0", "false", "off", "none"].includes(val);
  };
  const sizeOf = (props: string) => {
    const match = props.match(/<w:sz\s+w:val="(\d+)"/);
    return match ? Number(match[1]) / 2 : 0;
  };
  const isHeadingStyle = (props: string) => {
    const styleId = (props.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1] || "";
    return /heading|title|标题|head/i.test(styleId);
  };
  const decodeXml = (value: string) => value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
  const lines: StyledLine[] = [];
  const paragraphs = xml.match(/<w:p(?:[^>]*)>[\s\S]*?<\/w:p>|<w:p[^>]*\/>/g) || [];
  for (const paragraph of paragraphs) {
    const pPr = (paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [""])[0];
    const paraMark = (pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    let bold = isBold(paraMark) || isHeadingStyle(pPr);
    let size = sizeOf(paraMark);
    let text = "";
    const runs = paragraph.match(/<w:r(?:[^>]*)>[\s\S]*?<\/w:r>|<w:r[^>]*\/>/g) || [];
    for (const run of runs) {
      // 跳过域代码（如目录、分页符），避免出现重复文字
      if (/<w:instrText|<w:fldChar/.test(run)) continue;
      const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
      if (isBold(rPr)) bold = true;
      const runSize = sizeOf(rPr);
      if (runSize > size) size = runSize;
      const textMatches = run.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
      for (const match of textMatches) {
        text += decodeXml(match.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, ""));
      }
      if (/<w:br\s*\/>/.test(run)) text += "\n";
      if (/<w:tab\s*\/>/.test(run)) text += "\t";
    }
    for (const part of text.split("\n")) {
      const cleaned = cleanText(part);
      if (cleaned) lines.push({ text: cleaned, bold, size });
    }
  }
  return { text: lines.map((line) => line.text).join("\n"), lines };
}
