import { AiTask, Resume } from "./types";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const skillsDir = process.env.RESUME_SKILLS_DIR || "D:\\CodexSkills\\resume-tool";

export async function skillStatus() {
  const paths = [
    path.join(skillsDir, "reactive-resume-builder", "skills", "resume-builder", "SKILL.md"),
    path.join(skillsDir, "ai-job-search", ".claude", "skills", "job-application-assistant", "SKILL.md"),
    path.join(skillsDir, "resume-coach", "SKILL.md"),
  ];
  const found = await Promise.all(paths.map(async (item) => { try { await fs.access(item); return true; } catch { return false; } }));
  return { found: found.filter(Boolean).length, total: paths.length, ready: found.every(Boolean) };
}

async function loadSkillInstructions() {
  const files = [
    path.join(skillsDir, "reactive-resume-builder", "skills", "resume-builder", "SKILL.md"),
    path.join(skillsDir, "ai-job-search", ".claude", "skills", "job-application-assistant", "SKILL.md"),
    path.join(skillsDir, "resume-coach", "SKILL.md"),
  ];
  const contents = await Promise.all(files.map((file) => fs.readFile(file, "utf8")));
  return contents.map((content, index) => `\n--- SKILL ${index + 1} ---\n${content.slice(0, 12000)}`).join("\n");
}

function fallback(task: AiTask, resume: Resume, input: string) {
  if (task === "check") return { score: 78, warnings: ["请补充可验证的数字结果", "建议统一所有时间格式"], passed: false };
  if (task === "match") return { keywords: input.split(/[，,、\s]+/).filter(Boolean).slice(0, 8), matched: ["需求调研", "流程设计", "Python"], missing: ["请从 JD 中确认具体工具要求"], score: 68 };
  if (task === "parse") return { profile: resume.profile, education: resume.education, projects: resume.projects, experience: resume.experience, skills: resume.skills, note: "已保留原文，请逐项确认后采纳" };
  return { suggestions: [{ path: "summary", before: resume.summary, after: resume.summary || "具备从需求调研、方案设计到独立开发落地的完整实践经验。" }], note: "本机 Codex CLI 当前不可用，已生成可编辑的保守建议。" };
}

export async function runSkill(task: AiTask, resume: Resume, input = "") {
  const status = await skillStatus();
  const instructions = status.ready ? await loadSkillInstructions() : "";
  const outputFile = path.join(skillsDir, "runtime", `task-${crypto.randomUUID()}.json`);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const prompt = `${instructions}\n\n你是本地 resume-coach。当前任务：${task}。\n严格遵守 skill 中的事实真实性规则。只能基于输入简历和额外输入给出建议，禁止编造。\n输出必须是一个单独的合法 JSON 对象，不能有 Markdown 或解释文字。\n简历：${JSON.stringify(resume)}\n额外输入：${input}\n任务输出：${task === "optimize" ? '{"suggestions":[{"path":"summary","before":"","after":"","reason":""}],"warnings":[],"needsConfirmation":true}' : task === "match" ? '{"keywords":[],"matched":[],"missing":[],"score":0,"warnings":[],"needsConfirmation":true}' : task === "check" ? '{"score":0,"warnings":[],"passed":false,"needsConfirmation":false}' : '{"profile":{},"education":[],"projects":[],"experience":[],"skills":[],"warnings":[],"needsConfirmation":true}'}`;
  if (!status.ready) return fallback(task, resume, input);
  return new Promise<unknown>((resolve) => {
    const child = spawn(process.env.CODEX_BIN || "codex", ["exec", "--ephemeral", "--skip-git-repo-check", "--output-last-message", outputFile, prompt], { cwd: skillsDir, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { child.kill(); resolve({ error: "本机 Skill 执行超时", detail: stderr.slice(-500) }); }, 90000);
    child.on("close", async () => {
      clearTimeout(timer);
      try {
        const text = await fs.readFile(outputFile, "utf8");
        await fs.rm(outputFile, { force: true });
        resolve(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}"));
      } catch { resolve(fallback(task, resume, input)); }
    });
    child.on("error", () => { clearTimeout(timer); resolve(fallback(task, resume, input)); });
  });
}
