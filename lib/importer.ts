import { cleanText, cloneResume, CustomSection, Education, RecordItem, Resume } from "./types";

type SectionKey = "profile" | "summary" | "education" | "experience" | "internships" | "projects" | "campus" | "awards" | "skills" | "custom";
type SectionGroup = { key: SectionKey; names: string[] };

// 常见简历模块标题（按出现频率排序）
const SECTION_HEADERS: SectionGroup[] = [
  { key: "profile", names: ["基本信息", "个人信息", "个人资料"] },
  { key: "summary", names: ["个人概况", "自我评价", "个人总结", "个人简介"] },
  { key: "education", names: ["教育经历", "教育背景", "学习经历"] },
  { key: "experience", names: ["工作经历", "工作经验", "职业经历"] },
  { key: "internships", names: ["实习经历", "实习经验"] },
  { key: "projects", names: ["项目经历", "项目经验"] },
  { key: "campus", names: ["校园经历", "校园活动", "在校经历", "校内经历"] },
  { key: "awards", names: ["获奖情况", "奖项荣誉", "荣誉奖项", "所获荣誉", "获奖经历", "荣誉"] },
  { key: "skills", names: ["专业技能", "技能特长", "专业能力", "技能"] },
];

// 本程序没有固定模块、但常见于他人简历的模块：识别后写入“自定义模块”，供用户继续编辑
const EXTRA_SECTIONS: SectionGroup[] = [
  { key: "custom", names: ["资格证书", "证书资质", "职业证书", "证书"] },
  { key: "custom", names: ["培训经历", "培训经验"] },
  { key: "custom", names: ["语言能力", "语言水平"] },
  { key: "custom", names: ["兴趣爱好", "个人爱好", "兴趣特长"] },
  { key: "custom", names: ["社会实践", "社会经历", "志愿服务", "志愿者经历"] },
  { key: "custom", names: ["作品集", "个人作品", "作品展示"] },
];

// 无标题时，若首行像个人信息字段，也归入基本信息
const PROFILE_FIELD_RE = /^(?:姓名|名字|电话|手机|邮箱|电子邮箱|求职意向|求职岗位|目标岗位|意向岗位|城市|现居|所在城市|所在地)/;
const DEGREE_RE = /本科|硕士|博士|学士|大专|专科|研究生|博士后|高中/;
// 匹配常见时间格式：2018-2022、2018.09-2022.06、2018年9月-2022年6月、2020.06至今、2019.07 ~ 2021.03
const DATE_RE = /((?:19|20)\d{2}\s*[-—~～至到]\s*(?:19|20)\d{2}|(?:19|20)\d{2}\s*[年./-]\s*\d{1,2}\s*月?(?:\s*[-—~～至到]\s*(?:(?:19|20)?\d{2}\s*(?:[年./-]\s*\d{1,2}\s*月?)?|至今|现在|今))?|(?:19|20)\d{2}\s*年(?:\s*[-—~～至到]\s*(?:19|20)\d{2}\s*年)?)/;

// 去掉行首的列表记号，如 "-"、"•"、"1."、"1、"；但不会误删 "2020.06" 这类时间
const stripMarker = (value: string) => value.replace(/^\s*(?:[-*•●◦▪◆]\s*|\d{1,2}\s*[.、)](?=\s|\D)\s*)/, "");

function detectHeader(line: string): { key: SectionKey; inline: string; title?: string } | null {
  const trimmed = line.trim();
  for (const group of [...SECTION_HEADERS, ...EXTRA_SECTIONS]) {
    for (const name of group.names) {
      if (trimmed === name) return { key: group.key, inline: "", title: group.key === "custom" ? name : undefined };
      // 长标题允许同一行带内容，如 "教育经历：清华大学 ..."；短标题（技能/荣誉等）只认独立标题行，避免误判正文
      if (name.length >= 3 && (trimmed.startsWith(name + ":") || trimmed.startsWith(name + "："))) {
        return { key: group.key, inline: trimmed.slice(name.length + 1).trim(), title: group.key === "custom" ? name : undefined };
      }
    }
  }
  // 兼容 "二、教育经历"、"1. 工作经历" 这类带编号的标题（只处理较短的行，避免误伤正文）
  const numbered = trimmed.replace(/^(?:[0-9一二三四五六七八九十]+[、.．]\s*|[-*•]\s*)/, "");
  if (numbered !== trimmed && numbered.length < 20) return detectHeader(numbered);
  return null;
}

// 从一行中抽出时间，剩下的再按分隔符拆分
function extractDate(line: string) {
  const match = line.match(DATE_RE);
  if (!match || !match[1]) return { date: "", rest: cleanText(line) };
  const date = match[1];
  const rest = line
    .replace(match[1], " ")
    .replace(/\s*[（(]\s*[）)]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { date, rest };
}

function splitParts(rest: string, singleSpace: boolean) {
  const parts = rest
    .split(/\s{2,}|[|｜·•]\s*|\t|\s+[-—]\s+/)
    .map((part) => cleanText(part))
    .filter(Boolean);
  if (parts.length > 1) return parts;
  // 中文简历常用单空格分隔（如“学校 专业 学历 时间”）；只有明确允许时才按单空格拆分
  if (singleSpace) return rest.split(/\s+/).map((part) => cleanText(part)).filter(Boolean);
  return parts;
}

function parseEducationLine(line: string): Education {
  const { date, rest } = extractDate(line);
  const parts = splitParts(rest, Boolean(date));
  if (!parts.length) return { school: cleanText(stripMarker(line)), degree: "", major: "", date, detail: "" };
  const degreeIndex = parts.findIndex((part, index) => index > 0 && DEGREE_RE.test(part));
  const school = parts[0];
  const major = degreeIndex === -1 ? parts[1] || "" : parts.slice(1, degreeIndex).join(" ");
  const degree = degreeIndex === -1 ? "" : parts[degreeIndex];
  const detail = degreeIndex === -1 ? parts.slice(2).join(" ") : parts.slice(degreeIndex + 1).join(" ");
  return { school, degree, major, date, detail };
}

function parseRecordLine(line: string): RecordItem {
  const { date, rest } = extractDate(line);
  const parts = splitParts(rest, Boolean(date) || rest.split(/\s+/).filter(Boolean).length >= 3);
  const organization = parts[0] || "";
  // 能拆出单位+角色，或只有单位带时间时，按结构化条目处理；否则整行作为一条要点保留
  if (organization && (parts.length > 1 || date)) {
    return { organization, role: parts.length > 1 ? parts.slice(1).join(" · ") : "", date, bullets: [] };
  }
  return { organization: "", role: "", date, bullets: [cleanText(stripMarker(line))] };
}

// 把要点行（无单位/角色的行）归并到上一条结构化记录的 bullets 中，避免拆成独立空条目
function structuredItems(lines: string[] | undefined, parse: (line: string) => RecordItem): RecordItem[] {
  const items: RecordItem[] = [];
  for (const line of lines || []) {
    const item = parse(line);
    if (item.organization || item.role || item.date) {
      items.push(item);
    } else if (items.length && item.bullets.length) {
      items[items.length - 1].bullets.push(...item.bullets);
    } else {
      items.push(item);
    }
  }
  return items.filter((item) => item.organization || item.date || item.bullets.length);
}

// 教育经历的补充行（如 GPA、排名）归并到上一条记录的 detail
function educationItems(lines: string[] | undefined): Education[] {
  const items: Education[] = [];
  for (const line of lines || []) {
    const item = parseEducationLine(line);
    if (item.school || item.date) {
      items.push(item);
    } else if (items.length && item.detail) {
      items[items.length - 1].detail = [items[items.length - 1].detail, item.detail].filter(Boolean).join("\n");
    } else {
      items.push(item);
    }
  }
  return items.filter((item) => item.school || item.date || item.detail);
}

function field(text: string, names: string[]): string {
  const match = text.match(new RegExp(`(?:^|\\n|[，,；;])[\\t \\u3000]*(?:${names.join("|")})[\\t \\u3000]*[:：][\\t \\u3000]*([^\\n，,；;]+)`, "i"));
  return match ? cleanText(match[1]) : "";
}

const cleanItems = (lines: string[] | undefined) =>
  (lines || []).flatMap((line) => stripMarker(line).split(/[、，,；;]/)).map(cleanText).filter(Boolean);

export type ImportResult = { resume: Resume; detected: string[] };

export function parsePlainText(text: string, base: Resume): ImportResult | null {
  const source = cleanText(text);
  if (!source) return null;

  // 第一步：按标题行切分模块
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const pendingCustoms: { title: string; lines: string[] }[] = [];
  let current: SectionKey | null = null;
  let currentCustom = -1;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = cleanText(rawLine);
    if (!line) continue;
    const header = detectHeader(line);
    if (header) {
      if (header.key === "custom") {
        const title = header.title || "自定义内容";
        const index = pendingCustoms.findIndex((custom) => custom.title === title);
        currentCustom = index >= 0 ? index : (pendingCustoms.push({ title, lines: [] }), pendingCustoms.length - 1);
        current = null;
        if (header.inline) pendingCustoms[currentCustom].lines.push(header.inline);
      } else {
        current = header.key;
        currentCustom = -1;
        if (header.inline) (sections[current] = sections[current] || []).push(header.inline);
      }
      continue;
    }
    if (!current && PROFILE_FIELD_RE.test(line)) current = "profile";
    if (current) (sections[current] = sections[current] || []).push(line);
    else if (currentCustom >= 0) pendingCustoms[currentCustom].lines.push(line);
  }

  const next = cloneResume(base);
  const detected: string[] = [];
  const profileText = sections.profile ? sections.profile.join("\n") : source;

  // 基本信息
  const name = field(profileText, ["姓名", "名字"]) || source.match(/(?:^|\n)[\t \u3000]*姓名[\t \u3000]*[:：][\t \u3000]*([^\n，,；;]+)/)?.[1]?.trim() || "";
  const phone = field(profileText, ["电话", "手机", "联系电话"]) || source.match(/\b1[3-9]\d{9}\b/)?.[0] || "";
  const email = field(profileText, ["邮箱", "电子邮箱", "电子邮件"]) || source.match(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/)?.[0] || "";
  const city = field(profileText, ["城市", "现居地", "现居", "所在城市"]);
  const targetRole = field(profileText, ["求职意向", "求职岗位", "意向岗位", "目标岗位"]);
  let profileChanged = false;
  if (cleanText(name)) { next.profile.name = cleanText(name); profileChanged = true; }
  if (cleanText(phone)) { next.profile.phone = cleanText(phone); profileChanged = true; }
  if (cleanText(email)) { next.profile.email = cleanText(email); profileChanged = true; }
  if (cleanText(city)) { next.profile.city = cleanText(city); profileChanged = true; }
  if (cleanText(targetRole)) { next.targetRole = cleanText(targetRole); profileChanged = true; }
  if (profileChanged) detected.push("基本信息");

  // 个人概况
  const summary = (sections.summary || []).map(cleanText).join("\n");
  if (summary) { next.summary = summary; detected.push("个人概况"); }

  // 教育经历
  const education = educationItems(sections.education);
  if (education.length) { next.education = education; detected.push(`教育经历（${education.length}条）`); }

  // 工作 / 实习 / 校园经历
  (([
    ["experience", ["工作经历"]],
    ["internships", ["实习经历"]],
    ["campus", ["校园经历"]],
  ] as const)).forEach(([key, label]) => {
    const items = structuredItems(sections[key], parseRecordLine);
    if (items.length) { next[key] = items; detected.push(`${label}（${items.length}条）`); }
  });

  // 项目经历
  const projects = structuredItems(sections.projects, parseRecordLine).map((item) => ({ name: item.organization, role: item.role, date: item.date, bullets: item.bullets }));
  if (projects.length) { next.projects = projects; detected.push(`项目经历（${projects.length}条）`); }

  // 奖项荣誉 / 专业技能
  const awards = cleanItems(sections.awards);
  if (awards.length) { next.awards = awards; detected.push("奖项荣誉"); }
  const skills = cleanItems(sections.skills);
  if (skills.length) { next.skills = skills; detected.push("专业技能"); }

  // 自定义模块：把识别到的额外模块写入最多 4 个自定义槽位，超出部分并入最后一个
  if (pendingCustoms.length) {
    const filled: CustomSection[] = next.customSections.map((section) => ({ ...section }));
    let slot = 0;
    for (const custom of pendingCustoms) {
      const lines = custom.lines.map(cleanText).filter(Boolean);
      if (!lines.length) continue;
      if (slot < filled.length) {
        filled[slot] = { id: filled[slot].id, title: custom.title, lines };
        slot++;
      } else {
        filled[filled.length - 1].lines = [...filled[filled.length - 1].lines, custom.title ? `【${custom.title}】` : "", ...lines].filter(Boolean);
      }
    }
    if (filled.some((section) => section.title || section.lines.length)) {
      next.customSections = filled;
      detected.push("自定义模块");
    }
  }

  return detected.length ? { resume: next, detected } : null;
}
