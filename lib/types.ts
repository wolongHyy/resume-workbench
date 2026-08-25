export type Theme = "standard" | "product" | "technical";
export type AiTask = "parse" | "optimize" | "match" | "check";
export type FontSize = "small" | "medium" | "large";
export type Spacing = "compact" | "normal" | "relaxed";
export type ModuleGap = "compact" | "normal" | "relaxed";
export type ListStyle = "dot" | "dash" | "number";
export type SectionId = "summary" | "education" | "experience" | "internships" | "projects" | "campus" | "awards" | "skills" | "custom-1" | "custom-2" | "custom-3" | "custom-4";
export type CustomId = "custom-1" | "custom-2" | "custom-3" | "custom-4";

export type Education = { school: string; degree: string; major: string; date: string; detail: string };
export type RecordItem = { organization: string; role: string; date: string; bullets: string[] };
export type Project = { name: string; role: string; date: string; bullets: string[] };
export type CustomSection = { id: CustomId; title: string; lines: string[] };

export type Resume = {
  id: string; name: string; targetRole: string; updatedAt: string; theme: Theme;
  fontSize: FontSize; spacing: Spacing; moduleGap: ModuleGap; listStyle: ListStyle; sectionOrder: SectionId[];
  profile: { name: string; phone: string; email: string; city: string; headline: string };
  photo: string;
  summary: string; education: Education[]; experience: RecordItem[]; internships: RecordItem[];
  projects: Project[]; campus: RecordItem[]; awards: string[]; skills: string[];
  customSections: CustomSection[]; jd: string;
};

export const sectionLabels: Record<SectionId, string> = {
  summary: "个人概述", education: "教育经历", experience: "工作经历", internships: "实习经历",
  projects: "项目经历", campus: "校园经历", awards: "奖项荣誉", skills: "专业技能",
  "custom-1": "自定义模块一", "custom-2": "自定义模块二", "custom-3": "自定义模块三", "custom-4": "自定义模块四",
};
export const customIds: CustomId[] = ["custom-1", "custom-2", "custom-3", "custom-4"];
export const defaultSectionOrder: SectionId[] = ["summary", "education", "experience", "internships", "projects", "campus", "awards", "skills", ...customIds];

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result && !/^[?？\s]+$/.test(result) ? result : "";
}

export function emptyResume(): Resume {
  return {
    id: crypto.randomUUID(), name: "未命名简历", targetRole: "", updatedAt: new Date().toISOString(), theme: "standard",
    fontSize: "medium", spacing: "normal", moduleGap: "normal", listStyle: "dot", sectionOrder: [...defaultSectionOrder],
    profile: { name: "", phone: "", email: "", city: "", headline: "" }, photo: "", summary: "", education: [], experience: [], internships: [], projects: [], campus: [], awards: [], skills: [],
    customSections: customIds.map((id) => ({ id, title: "", lines: [] })), jd: "",
  };
}

export function cloneResume(resume: Resume): Resume { return JSON.parse(JSON.stringify(resume)) as Resume; }
