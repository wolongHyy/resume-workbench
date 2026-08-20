import { cloneResume, cleanText, Resume } from "./types";

const headers = ["基本信息", "教育经历", "工作经历", "实习经历", "项目经历", "校园经历", "奖项荣誉", "奖项", "荣誉", "专业技能", "技能"];
const section = (text: string, names: readonly string[]) => { const next = headers.filter((name) => !names.includes(name)).join("|"); return text.match(new RegExp(`(?:^|\\n)\\s*(?:${names.join("|")})\\s*[:：]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${next})\\s*[:：]?|$)`, "i"))?.[1]?.trim() || ""; };
const field = (text: string, names: string[]) => text.match(new RegExp(`(?:^|\\n|[，,])\\s*(?:${names.join("|")})\\s*[:：]\\s*([^\\n，,]+)`, "i"))?.[1]?.trim() || "";
const cleanLines = (value: string) => value.split("\n").map((line) => cleanText(line.replace(/^\s*[-*•]\s*/, ""))).filter(Boolean);
const records = (value: string) => cleanLines(value).map((line) => ({ organization: "", role: "", date: "", bullets: [line] }));

export function parsePlainText(text: string, base: Resume): Resume | null {
  const source = text.trim(); if (!source || !/基本信息|姓名|电话|手机|邮箱|求职意向|求职岗位|教育经历|学校|工作经历|实习经历|项目经历|校园经历|奖项|荣誉|专业技能|技能/i.test(source)) return null;
  const next = cloneResume(base); let changed = false;
  const name = field(source, ["姓名"]); const phone = field(source, ["电话", "手机"]); const email = field(source, ["邮箱", "电子邮箱"]); const targetRole = field(source, ["求职意向", "求职岗位", "目标岗位"]);
  if (cleanText(name)) { next.profile.name = cleanText(name); changed = true; }
  if (cleanText(phone)) { next.profile.phone = cleanText(phone); changed = true; }
  if (cleanText(email)) { next.profile.email = cleanText(email); changed = true; }
  if (cleanText(targetRole)) { next.targetRole = cleanText(targetRole); changed = true; }
  const skillLines = cleanLines(section(source, ["专业技能", "技能"])); if (skillLines.length) { next.skills = skillLines; changed = true; }
  const awardLines = cleanLines(section(source, ["奖项荣誉", "奖项", "荣誉"])); if (awardLines.length) { next.awards = awardLines; changed = true; }
  ([ ["experience", ["工作经历"]], ["internships", ["实习经历"]], ["campus", ["校园经历"]] ] as const).forEach(([key, names]) => { const items = records(section(source, names)); if (items.length) { next[key] = items; changed = true; } });
  const projectLines = cleanLines(section(source, ["项目经历"])); if (projectLines.length) { next.projects = projectLines.map((line) => ({ name: "", role: "", date: "", bullets: [line] })); changed = true; }
  const educationLines = cleanLines(section(source, ["教育经历"])); if (educationLines.length) { next.education = educationLines.map((line) => ({ school: line, degree: "", major: "", date: "", detail: "" })); changed = true; }
  return changed ? next : null;
}
