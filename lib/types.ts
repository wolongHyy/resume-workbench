export type Theme = "standard" | "product" | "technical";
export type AiTask = "parse" | "optimize" | "match" | "check";
export type FontSize = "small" | "medium" | "large";
export type Spacing = "compact" | "normal" | "relaxed";
export type SectionId = "summary" | "education" | "experience" | "internships" | "projects" | "campus" | "awards" | "skills" | "custom-1" | "custom-2";

export type Education = { school: string; degree: string; major: string; date: string; detail: string };
export type RecordItem = { organization: string; role: string; date: string; bullets: string[] };
export type Project = { name: string; role: string; date: string; bullets: string[] };
export type CustomSection = { id: "custom-1" | "custom-2"; title: string; lines: string[] };

export type Resume = {
  id: string; name: string; targetRole: string; updatedAt: string; theme: Theme;
  fontSize: FontSize; spacing: Spacing; sectionOrder: SectionId[];
  profile: { name: string; phone: string; email: string; city: string; headline: string };
  summary: string; education: Education[]; experience: RecordItem[]; internships: RecordItem[];
  projects: Project[]; campus: RecordItem[]; awards: string[]; skills: string[];
  customSections: CustomSection[]; jd: string;
};

export const sectionLabels: Record<SectionId, string> = {
  summary: "个人概述", education: "教育经历", experience: "工作经历", internships: "实习经历",
  projects: "项目经历", campus: "校园经历", awards: "奖项荣誉", skills: "专业技能",
  "custom-1": "自定义模块一", "custom-2": "自定义模块二",
};
export const defaultSectionOrder: SectionId[] = ["summary", "education", "experience", "internships", "projects", "campus", "awards", "skills", "custom-1", "custom-2"];

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result && !/^[?？\s]+$/.test(result) ? result : "";
}

export function emptyResume(): Resume {
  return {
    id: crypto.randomUUID(), name: "未命名简历", targetRole: "", updatedAt: new Date().toISOString(), theme: "standard",
    fontSize: "medium", spacing: "normal", sectionOrder: [...defaultSectionOrder],
    profile: { name: "", phone: "", email: "", city: "", headline: "" }, summary: "", education: [], experience: [], internships: [], projects: [], campus: [], awards: [], skills: [],
    customSections: [{ id: "custom-1", title: "", lines: [] }, { id: "custom-2", title: "", lines: [] }], jd: "",
  };
}

export function cloneResume(resume: Resume): Resume { return JSON.parse(JSON.stringify(resume)) as Resume; }
