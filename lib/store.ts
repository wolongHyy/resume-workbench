import fs from "node:fs/promises";
import path from "node:path";
import { cleanText, customIds, CustomSection, defaultSectionOrder, Education, emptyResume, Project, RecordItem, Resume, SectionId } from "./types";

export const DATA_ROOT = "D:\\简历";
const validSections = new Set<SectionId>(defaultSectionOrder);
const value = (input: unknown) => cleanText(input);
const lines = (input: unknown) => Array.isArray(input) ? input.map(value).filter(Boolean) : [];
const record = (input: unknown): RecordItem => { const x = input && typeof input === "object" ? input as Record<string, unknown> : {}; return { organization: value(x.organization ?? x.company), role: value(x.role), date: value(x.date), bullets: lines(x.bullets) }; };
const project = (input: unknown): Project => { const x = input && typeof input === "object" ? input as Record<string, unknown> : {}; return { name: value(x.name), role: value(x.role), date: value(x.date), bullets: lines(x.bullets) }; };
const education = (input: unknown): Education => { const x = input && typeof input === "object" ? input as Record<string, unknown> : {}; return { school: value(x.school), degree: value(x.degree), major: value(x.major), date: value(x.date), detail: value(x.detail) }; };

export function normalizeResume(input: unknown): Resume {
  if (!input || typeof input !== "object") throw new Error("简历数据格式无效");
  const x = input as Record<string, unknown>; const profile = x.profile && typeof x.profile === "object" ? x.profile as Record<string, unknown> : {};
  const id = value(x.id); if (!id) throw new Error("简历缺少 ID");
  const customInput = Array.isArray(x.customSections) ? x.customSections : [];
  const customSections: CustomSection[] = customIds.map((id) => { const found = customInput.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === id) as Record<string, unknown> | undefined; return { id, title: value(found?.title), lines: lines(found?.lines) }; });
  const order = Array.isArray(x.sectionOrder) ? x.sectionOrder.filter((id): id is SectionId => typeof id === "string" && validSections.has(id as SectionId)) : [];
  return {
    id, name: value(x.name) || "未命名简历", targetRole: value(x.targetRole), updatedAt: value(x.updatedAt) || new Date().toISOString(), theme: x.theme === "product" || x.theme === "technical" ? x.theme : "standard",
    fontSize: x.fontSize === "small" || x.fontSize === "large" ? x.fontSize : "medium", spacing: x.spacing === "compact" || x.spacing === "relaxed" ? x.spacing : "normal",
    moduleGap: x.moduleGap === "compact" || x.moduleGap === "relaxed" ? x.moduleGap : "normal",
    listStyle: x.listStyle === "dash" || x.listStyle === "number" ? x.listStyle : "dot",
    sectionOrder: [...order, ...defaultSectionOrder.filter((id) => !order.includes(id))],
    profile: { name: value(profile.name), phone: value(profile.phone), email: value(profile.email), city: value(profile.city), headline: value(profile.headline) },
    photo: value(x.photo),
    summary: value(x.summary), education: Array.isArray(x.education) ? x.education.map(education) : [], experience: Array.isArray(x.experience) ? x.experience.map(record) : [], internships: Array.isArray(x.internships) ? x.internships.map(record) : [], projects: Array.isArray(x.projects) ? x.projects.map(project) : [], campus: Array.isArray(x.campus) ? x.campus.map(record) : [], awards: lines(x.awards), skills: lines(x.skills), customSections, jd: value(x.jd),
  };
}

function fileFor(userId: string) { return path.join(DATA_ROOT, "users", userId, "resumes.json"); }
async function readAll(userId: string): Promise<Resume[]> { try { const raw: unknown = JSON.parse(await fs.readFile(fileFor(userId), "utf8")); return Array.isArray(raw) ? raw.map(normalizeResume) : []; } catch { return []; } }
async function writeAll(userId: string, resumes: Resume[]) { const file = fileFor(userId); await fs.mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(temporary, JSON.stringify(resumes, null, 2), "utf8"); await fs.rename(temporary, file); }
export async function listResumes(userId: string) { return readAll(userId); }
export async function saveResume(userId: string, input: unknown) { const resume = normalizeResume(input); const resumes = await readAll(userId); const saved = { ...resume, updatedAt: new Date().toISOString() }; const index = resumes.findIndex((item) => item.id === saved.id); if (index === -1) resumes.unshift(saved); else resumes[index] = saved; await writeAll(userId, resumes); return saved; }
export async function seedResume(userId: string) { const resumes = await readAll(userId); return resumes[0] || saveResume(userId, emptyResume()); }
