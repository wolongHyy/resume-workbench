import { cleanText, cloneResume, CustomSection, Education, RecordItem, Resume } from "./types";

/*
  识别原则（核心标识字段 vs 基本内容）：

  核心标识字段 = 决定“这一条是什么”的字段，只有它们能判定生成新的条目：
  - 基本信息：姓名、电话、邮箱、城市、目标岗位
  - 教育经历：学校、专业、学历、时间
  - 工作/实习/校园/项目：单位/项目名称、职位/角色、时间

  基本内容 = 描述性内容，不会生成新条目，只会并入上一条的 detail / bullets：
  - 个人概述、自我评价
  - 职责说明、工作/项目描述、成果描述
  - GPA/绩点、排名、证书、技能等补充说明

  其他规则：
  - 模块标题只按“白名单”识别（教育经历/工作经历/…），不会因为某个词加粗就当成标题或核心字段。
  - 带列表记号（-、•、1. 等）的行一律是“要点”，永远不当作新的单位/学校条目。
  - 教育/工作/项目条目必须有时间或学校特征词，否则视为上一条的描述。
  - 技能、奖项保持“一行一条”，不在 、，； 处强行拆散；技能按“分类：”前缀把后面的独立词合并回同一行。
*/

type SectionKey = "profile" | "summary" | "education" | "experience" | "internships" | "projects" | "campus" | "awards" | "skills" | "custom";
type SectionGroup = { key: SectionKey; names: string[] };

// 常见简历模块标题（按出现频率排序）
const SECTION_HEADERS: SectionGroup[] = [
  { key: "profile", names: ["基本信息", "个人信息", "个人资料"] },
  { key: "summary", names: ["个人概况", "自我评价", "个人总结", "个人简介"] },
  { key: "education", names: ["教育经历", "教育背景", "学习经历", "教育"] },
  { key: "experience", names: ["工作经历", "工作经验", "职业经历", "工作"] },
  { key: "internships", names: ["实习经历", "实习经验"] },
  { key: "projects", names: ["项目经历", "项目经验"] },
  { key: "campus", names: ["校园经历", "校园活动", "在校经历", "校内经历"] },
  { key: "awards", names: ["获奖情况", "奖项荣誉", "荣誉奖项", "所获荣誉", "获奖经历", "荣誉", "获奖"] },
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
// 学校特征词：没有时间时，只有带这些词的行才可能是新的教育条目
const SCHOOL_RE = /大学|学院|学校|研究院|党校|中学|高中|职校|职业技术|专科/;
// 明显是“补充说明/标签”而不是学校名称的行
const LABEL_RE = /^(?:gpa|绩点|排名|荣誉|证书|资格|技能|特长|主修|辅修|专业|课程|奖学金|获奖|社团|活动|成绩|平均分|加权)[：:]/i;
// 列表记号（-、•、1. 等）
const MARKER_RE = /^\s*(?:[-*•●◦▪◆]\s*|\d{1,2}\s*[.、)](?=\s|\D)\s*)/;
// 匹配常见时间格式：2018-2022、2018.09-2022.06、2018年9月-2022年6月、2020.06至今、2019.07 ~ 2021.03
const DATE_RE = /((?:19|20)\d{2}\s*[-—~～至到]\s*(?:19|20)\d{2}|(?:19|20)\d{2}\s*[年./-]\s*\d{1,2}\s*月?(?:\s*[-—~～至到]\s*(?:(?:19|20)?\d{2}\s*(?:[年./-]\s*\d{1,2}\s*月?)?|至今|现在|今))?|(?:19|20)\d{2}\s*年(?:\s*[-—~～至到]\s*(?:19|20)\d{2}\s*年)?)/;

// 去掉行首的列表记号，如 "-"、"•"、"1."、"1、"；但不会误删 "2020.06" 这类时间
const stripMarker = (value: string) => value.replace(MARKER_RE, "");

function detectHeader(line: string): { key: SectionKey; inline: string; title?: string } | null {
  const trimmed = line.trim();
  for (const group of [...SECTION_HEADERS, ...EXTRA_SECTIONS]) {
    for (const name of group.names) {
      if (trimmed === name) return { key: group.key, inline: "", title: group.key === "custom" ? name : undefined };
      // 长标题允许同一行带内容，如 "教育经历：清华大学 ..."
      if (name.length >= 3 && (trimmed.startsWith(name + ":") || trimmed.startsWith(name + "："))) {
        return { key: group.key, inline: trimmed.slice(name.length + 1).trim(), title: group.key === "custom" ? name : undefined };
      }
      // 短标题（如“技能：”“证书：”）单独成行且只有冒号时也认作标题
      if (trimmed === name + ":" || trimmed === name + "：") {
        return { key: group.key, inline: "", title: group.key === "custom" ? name : undefined };
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
  let school = parts[0];
  let degree = degreeIndex === -1 ? "" : parts[degreeIndex];
  let major = degreeIndex === -1 ? parts[1] || "" : parts.slice(1, degreeIndex).join(" ");
  const detail = degreeIndex === -1 ? parts.slice(2).join(" ") : parts.slice(degreeIndex + 1).join(" ");
  // 常见写法“XX大学（双一流）（本科）环境科学”：把括号里的学历提出来
  const schoolDegree = school.match(/[（(](本科|硕士|博士|学士|大专|专科|研究生|博士后)[）)]/);
  if (schoolDegree && !degree) {
    degree = schoolDegree[1];
    school = cleanText(school.replace(schoolDegree[0], " ").replace(/\s{2,}/g, " "));
  }
  // 常见写法“XX大学（双一流） 环境科学”：学校名之后的剩余文字大概率是专业
  const trailingMajor = school.match(/^(.*?(?:大学|学院|学校|研究院)[^大学学院学校研究院]*?)\s+(.+)$/);
  if (trailingMajor && !major && !SCHOOL_RE.test(trailingMajor[2]) && !DEGREE_RE.test(trailingMajor[2])) {
    school = cleanText(trailingMajor[1]);
    major = trailingMajor[2];
  }
  return { school, degree, major, date, detail };
}

// 教育条目判定：必须有时间，或学校带特征词/学历/专业，否则只是一行描述（并入上一条的补充说明）
function isEducationEntity(item: Education): boolean {
  return Boolean(item.date || (item.school && (SCHOOL_RE.test(item.school) || DEGREE_RE.test(item.school) || item.major)));
}

// 教育经历的补充行（如 GPA、排名）归并到上一条记录的 detail
function educationItems(lines: string[] | undefined): Education[] {
  const items: Education[] = [];
  for (const line of lines || []) {
    const raw = cleanText(line);
    if (!raw) continue;
    const marked = cleanText(stripMarker(raw));
    // GPA/绩点/排名/证书等“基本内容”标签行：不生成新条目，并入上一条补充说明
    if (LABEL_RE.test(marked)) {
      if (items.length) items[items.length - 1].detail = [items[items.length - 1].detail, marked].filter(Boolean).join("\n");
      continue;
    }
    const item = parseEducationLine(raw);
    if (isEducationEntity(item)) {
      items.push(item);
    } else if (items.length) {
      items[items.length - 1].detail = [items[items.length - 1].detail, marked].filter(Boolean).join("\n");
    }
  }
  return items.filter((item) => item.school || item.date || item.detail);
}

// 工作/实习/项目条目：必须有时间才生成新条目；无时间的行一律是“要点/描述”（基本内容）
function parseRecordLine(line: string): RecordItem {
  const cleaned = cleanText(line);
  const marked = cleanText(stripMarker(cleaned));
  const { date, rest } = extractDate(marked);
  if (!date) {
    return { organization: "", role: "", date: "", bullets: [marked] };
  }
  const parts = splitParts(rest, Boolean(date) || rest.split(/\s+/).filter(Boolean).length >= 3);
  const organization = parts[0] || "";
  const role = parts.length > 1 ? parts.slice(1).join(" · ") : "";
  return { organization, role, date, bullets: [] };
}

// 把要点行（列表记号行、无时间描述行）归并到上一条结构化记录的 bullets 中，绝不生成空条目
function structuredItems(lines: string[] | undefined, parse: (line: string) => RecordItem): RecordItem[] {
  const items: RecordItem[] = [];
  for (const line of lines || []) {
    const raw = cleanText(line);
    if (!raw) continue;
    if (MARKER_RE.test(raw)) {
      const bullet = cleanText(stripMarker(raw));
      if (!bullet) continue;
      if (items.length && (items[items.length - 1].organization || items[items.length - 1].role || items[items.length - 1].date)) {
        items[items.length - 1].bullets.push(bullet);
      } else {
        items.push({ organization: "", role: "", date: "", bullets: [bullet] });
      }
      continue;
    }
    const item = parse(raw);
    if (item.organization || item.date) {
      items.push(item);
    } else if (items.length && item.bullets.length) {
      items[items.length - 1].bullets.push(...item.bullets);
    } else if (item.bullets.length) {
      items.push(item);
    }
  }
  return items.filter((item) => item.organization || item.date || item.bullets.length);
}

function field(text: string, names: string[]): string {
  const match = text.match(new RegExp(`(?:^|\\n|[，,；;|｜])[\\t \\u3000]*(?:${names.join("|")})[\\t \\u3000]*[:：][\\t \\u3000]*([^\\n，,；;|｜]+)`, "i"));
  return match ? cleanText(match[1]) : "";
}

// 技能/奖项：保持“一行一条”，不在 、，； 处强行拆散
const cleanLines = (lines: string[] | undefined) => (lines || []).map((line) => cleanText(stripMarker(line))).filter(Boolean);

// 技能按“分类：”前缀分组：分类行后面紧跟的独立词合并回同一行，用、连接
function skillLines(lines: string[] | undefined): string[] {
  const result: string[] = [];
  for (const line of cleanLines(lines)) {
    if (/[:：]/.test(line)) {
      result.push(line);
    } else if (result.length) {
      result[result.length - 1] = `${result[result.length - 1]}、${line}`;
    } else {
      result.push(line);
    }
  }
  return result;
}

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

  // 基本信息（核心标识字段：姓名/电话/邮箱/城市/目标岗位）
  const name = field(profileText, ["姓名", "名字"]) || source.match(/(?:^|\n)[\t \u3000]*姓名[\t \u3000]*[:：][\t \u3000]*([^\n，,；;|｜]+)/)?.[1]?.trim() || "";
  // 有些简历把姓名做成页首大标题（无“姓名：”标签）：未识别到姓名时，取开头第一段短文本
  const firstNameLine = source.split(/\r?\n/).map(cleanText).find(Boolean) || "";
  const phone = field(profileText, ["电话", "手机", "联系电话"]) || source.match(/\b1[3-9]\d{9}\b/)?.[0] || "";
  const email = field(profileText, ["邮箱", "电子邮箱", "电子邮件"]) || source.match(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/)?.[0] || "";
  const city = field(profileText, ["城市", "现居地", "现居", "所在城市"]);
  const targetRole = field(profileText, ["求职意向", "求职岗位", "意向岗位", "目标岗位"]);
  let profileChanged = false;
  const finalName = cleanText(name) ||
    (firstNameLine.length >= 2 && firstNameLine.length <= 10 && !/[\s\d：:|｜-]/.test(firstNameLine) && !/^(?:求职|电话|邮箱|姓名|城市|现居)/.test(firstNameLine) ? firstNameLine : "");
  if (finalName) { next.profile.name = finalName; profileChanged = true; }
  if (cleanText(phone)) { next.profile.phone = cleanText(phone); profileChanged = true; }
  if (cleanText(email)) { next.profile.email = cleanText(email); profileChanged = true; }
  if (cleanText(city)) { next.profile.city = cleanText(city); profileChanged = true; }
  if (cleanText(targetRole)) { next.targetRole = cleanText(targetRole); profileChanged = true; }
  if (profileChanged) detected.push("基本信息");

  // 个人概况（基本内容）
  const summary = (sections.summary || []).map(cleanText).join("\n");
  if (summary) { next.summary = summary; detected.push("个人概况"); }

  // 教育经历：只有学校/专业/学历/时间才能生成新条目，GPA 等并入补充说明
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

  // 奖项荣誉 / 专业技能：一行一条，技能按“分类：”分组
  const awards = cleanLines(sections.awards);
  if (awards.length) { next.awards = awards; detected.push("奖项荣誉"); }
  const skills = skillLines(sections.skills);
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
