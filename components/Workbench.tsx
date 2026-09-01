"use client";
import { useEffect, useRef, useState } from "react";
import { cleanText, cloneResume, emptyResume, ListStyle, Resume, SectionId, sectionLabels } from "../lib/types";

type Props = { initial: Resume; resumes: Resume[]; user: string };
type Tab = "profile" | "education" | "experience" | "internships" | "projects" | "campus" | "awards" | "skills" | "custom" | "settings" | "import" | "coach";
const tabs: [Tab, string][] = [
  ["profile", "基本信息"],
  ["education", "教育经历"],
  ["experience", "工作经历"],
  ["internships", "实习经历"],
  ["projects", "项目经历"],
  ["campus", "校园经历"],
  ["awards", "奖项荣誉"],
  ["skills", "专业技能"],
  ["custom", "自定义模块"],
  ["settings", "排版设置"],
  ["import", "智能导入"],
  ["coach", "JD 优化"],
];
const themes = [
  { id: "standard" as const, label: "简约", color: "#1976d2" },
  { id: "product" as const, label: "产品", color: "#0f8a6a" },
  { id: "technical" as const, label: "技术", color: "#5e5ce6" },
];
const text = (v: unknown) => cleanText(v);
const saveJson = (resume: Resume) => fetch("/api/resumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resume) });
// 比较简历内容时忽略更新时间，避免“保存-回填-再保存”的死循环
const comparable = (resume: Resume) => { const { updatedAt, ...rest } = resume; return JSON.stringify(rest); };
// 浏览器网络层失败的提示（用户常见的 “Failed to fetch” 属于这一类）
const friendlyError = (error: unknown, action: string) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|load failed|ERR_CONNECTION|ECONNREFUSED|socket|aborted/i.test(message)) {
    return `${action}失败：无法连接本地服务。请确认“简历工作台服务”窗口仍在运行（通过 start.bat 启动），然后刷新页面后重试。`;
  }
  return message;
};

export default function Workbench({ initial, resumes, user }: Props) {
  const [resume, setResume] = useState<Resume>(initial);
  const [items, setItems] = useState<Resume[]>(resumes);
  const [tab, setTab] = useState<Tab>("profile");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("已保存");
  const [beforeImport, setBeforeImport] = useState<Resume | null>(null);
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachResult, setCoachResult] = useState<any>(null);
  const [coachError, setCoachError] = useState("");
  const dragMoved = useRef(false);
  const resumeRef = useRef(resume);

  useEffect(() => { resumeRef.current = resume; }, [resume]);

  useEffect(() => {
    const snapshot = resume;
    const timer = setTimeout(async () => {
      setStatus("保存中...");
      try {
        const response = await saveJson(snapshot);
        const saved = (await response.json()) as Resume;
        if (!response.ok) throw new Error((saved as unknown as { error?: string }).error || "保存失败");
        // 保存期间用户又改过或切换了简历，则不回填，交给下一次保存
        if (resumeRef.current !== snapshot) return;
        const needsApply = comparable(saved) !== comparable(snapshot);
        if (needsApply) {
          setResume((current) => (current === snapshot ? saved : current));
          setItems((all) => [saved, ...all.filter((item) => item.id !== saved.id)]);
        } else {
          setItems((all) => all.map((item) => (item.id === saved.id ? { ...item, updatedAt: saved.updatedAt } : item)));
        }
        setStatus("已保存");
      } catch {
        setStatus("保存失败，当前内容仍保留");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [resume]);

  const update = (mutate: (draft: Resume) => void) => setResume((current) => { const draft = cloneResume(current); mutate(draft); return draft; });
  const create = () => {
    const next = emptyResume();
    setResume(next);
    setItems((all) => [next, ...all]);
    setTab("profile");
    setNotice("已创建新简历");
  };
  const runImport = async () => {
    if (!raw.trim() && !file) return;
    setNotice("");
    setStatus("导入中...");
    try {
      const response = file
        ? await fetch("/api/import", { method: "POST", body: (() => { const form = new FormData(); form.append("resume", JSON.stringify(resume)); form.append("file", file); return form; })() })
        : await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw, resume }) });
      const data = await response.json().catch(() => ({ error: `服务返回异常（HTTP ${response.status}）` }));
      if (!response.ok) throw new Error(data.error || "导入失败");
      setBeforeImport(cloneResume(resume));
      setResume(data.resume);
      setRaw("");
      setFile(null);
      setTab("profile");
      const detected = (data.detected || []).join("、") || "基本内容";
      setNotice(`导入完成：已识别 ${detected}，可在左侧各模块中继续修改。`);
    } catch (error) {
      setNotice(friendlyError(error, "导入"));
      setStatus("已保存");
    }
  };
  const exportFile = async (format: "pdf" | "png" | "jpg") => {
    try {
      const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, resume }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `服务返回异常（HTTP ${response.status}）` }));
        throw new Error(data.error || "导出失败");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${text(resume.profile.name) || "resume"}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(friendlyError(error, "导出"));
    }
  };
  const runCoach = async () => {
    const jd = resume.jd.trim();
    if (!jd) {
      setCoachError("请先在左侧“JD 优化”页签填写职位描述（JD）。");
      return;
    }
    setCoachBusy(true);
    setCoachError("");
    setCoachResult(null);
    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "coach", resume, input: jd }),
      });
      const data = await response.json().catch(() => ({ error: `服务返回异常（HTTP ${response.status}）` }));
      if (!response.ok) throw new Error(data.error || "JD 优化失败");
      if (data.error) throw new Error(data.error);
      setCoachResult(data);
    } catch (error) {
      setCoachError(friendlyError(error, "JD 优化"));
    } finally {
      setCoachBusy(false);
    }
  };
  const moveTo = (from: number, to: number) => update((draft) => {
    const order = [...draft.sectionOrder];
    if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    draft.sectionOrder = order;
  });
  // 模块 ↔ 编辑页签：点击模块名直接进入对应编辑页
  const tabForSection = (id: SectionId): Tab => {
    if (id === "summary") return "profile";
    if (id === "custom-1" || id === "custom-2" || id === "custom-3" || id === "custom-4") return "custom";
    return id;
  };

  return (
    <main className="workbench">
      <header className="topbar">
        <div className="brand"><b>R</b><strong>简历工作台</strong><span>{user}</span></div>
        <div className="top-actions">
          <span>{status}</span>
          <button className="secondary" onClick={() => fetch("/api/auth", { method: "DELETE" }).then(() => location.reload())}>退出</button>
          <button className="primary" onClick={() => exportFile("pdf")}>导出 PDF</button>
          <button className="secondary" onClick={() => exportFile("png")}>PNG</button>
          <button className="secondary" onClick={() => exportFile("jpg")}>JPG</button>
        </div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <div className="side-title"><strong>我的简历</strong><button title="新建简历" onClick={create}>+</button></div>
          <div className="resume-list">
            {items.map((item) => (
              <button key={item.id} className={item.id === resume.id ? "resume selected" : "resume"} onClick={() => setResume(cloneResume(item))}>
                <strong>{text(item.name) || "未命名简历"}</strong>
                <span>{text(item.targetRole) || "未设置岗位"}</span>
              </button>
            ))}
          </div>
          <div className="versions">
            <span>版本</span>
            <button onClick={() => { setResume(cloneResume(resume)); setNotice("已恢复当前草稿"); }}>当前草稿</button>
            <button disabled={!beforeImport} onClick={() => beforeImport && (setResume(cloneResume(beforeImport)), setNotice("已恢复导入前版本"))}>导入前版本</button>
          </div>
          <p>数据保存在 D:\简历<br />不会上传到云端</p>
          <div className="sidebar-modules">
            <div className="side-title"><strong>模块</strong><em>点击编辑 / 拖动排序</em></div>
            <div className="module-list">
              {resume.sectionOrder.map((id, index) => (
                <div
                  key={id}
                  title="点击进入编辑，拖动调整顺序"
                  className={"module-row" + (tab === tabForSection(id) ? " active" : "") + (dragIndex === index ? " dragging" : "") + (overIndex === index && dragIndex !== null && dragIndex !== index ? " over" : "")}
                  draggable
                  onClick={() => { if (dragMoved.current) return; setTab(tabForSection(id)); }}
                  onDragStart={(e) => { dragMoved.current = true; setDragIndex(index); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); if (overIndex !== index) setOverIndex(index); }}
                  onDragLeave={() => { if (overIndex === index) setOverIndex(null); }}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) moveTo(dragIndex, index); setDragIndex(null); setOverIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); setTimeout(() => { dragMoved.current = false; }, 0); }}
                >
                  <span className="grip">⠿</span>
                  <span className="name">{sectionLabels[id]}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
        <section className="editor">
          <div className="editor-head">
            <div>
              <input value={resume.name} onChange={(e) => update((d) => { d.name = e.target.value; })} />
              <p>{text(resume.targetRole) || "未设置目标岗位"}</p>
            </div>
            <div className="theme-list">
              {themes.map((theme) => (
                <button key={theme.id} title={`切换${theme.label}模板`} className={resume.theme === theme.id ? "theme selected" : "theme"} style={{ background: theme.color }} onClick={() => update((d) => { d.theme = theme.id; })} />
              ))}
            </div>
          </div>
          <nav className="tabs">
            {tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
          </nav>
          {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
          <div className="form-panel">
            <Editor tab={tab} resume={resume} update={update} raw={raw} setRaw={setRaw} file={file} setFile={setFile} runImport={runImport} setNotice={setNotice} coachBusy={coachBusy} coachResult={coachResult} coachError={coachError} setCoachError={setCoachError} runCoach={runCoach} />
          </div>
        </section>
        <aside className="preview">
          <div className="preview-head"><span>A4 实时预览</span><span>{themes.find((t) => t.id === resume.theme)?.label}</span></div>
          <Preview resume={resume} />
        </aside>
      </div>
    </main>
  );
}

function Editor({ tab, resume, update, raw, setRaw, file, setFile, runImport, setNotice, coachBusy, coachResult, coachError, setCoachError, runCoach }: {
  tab: Tab; resume: Resume; update: (fn: (d: Resume) => void) => void; raw: string; setRaw: (v: string) => void;
  file: File | null; setFile: (f: File | null) => void; runImport: () => void; setNotice: (v: string) => void;
  coachBusy: boolean; coachResult: any; coachError: string; setCoachError: (v: string) => void; runCoach: () => void;
}) {
  if (tab === "profile") return (
    <section>
      <h1>基本信息</h1>
      <PhotoPicker resume={resume} update={update} setNotice={setNotice} />
      <div className="fields two">
        {([["name", "姓名"], ["headline", "个人标签"], ["phone", "手机"], ["email", "邮箱"], ["city", "城市"]] as const).map(([key, label]) => (
          <label key={key}><span>{label}</span><input value={resume.profile[key]} onChange={(e) => update((d) => { d.profile[key] = e.target.value; })} /></label>
        ))}
      </div>
      <label><span>目标岗位</span><input value={resume.targetRole} onChange={(e) => update((d) => { d.targetRole = e.target.value; })} /></label>
      <label><span>个人概述</span><textarea value={resume.summary} onChange={(e) => update((d) => { d.summary = e.target.value; })} /></label>
    </section>
  );
  if (tab === "settings") return (
    <section>
      <h1>排版设置</h1>
      <p className="hint">拖动滑块，右侧预览会立即变化；左小右大。</p>
      <Slider label="字体大小" value={resume.fontSize} display={`${resume.fontSize.toFixed(1)}pt`} min={8} max={14} step={0.5} onChange={(v) => update((d) => { d.fontSize = v; })} />
      <Slider label="行间距" value={resume.lineHeight} display={resume.lineHeight.toFixed(2)} min={1.2} max={2} step={0.05} onChange={(v) => update((d) => { d.lineHeight = v; })} />
      <Slider label="段落间距" value={resume.spacing} display={`${Math.round(resume.spacing)}px`} min={0} max={20} step={1} onChange={(v) => update((d) => { d.spacing = v; })} />
      <Slider label="模块间距" value={resume.moduleGap} display={`${Math.round(resume.moduleGap)}px`} min={4} max={48} step={1} onChange={(v) => update((d) => { d.moduleGap = v; })} />
      <label><span>内容排序记号</span>
        <select value={resume.listStyle} onChange={(e) => update((d) => { d.listStyle = e.target.value as ListStyle; })}>
          <option value="dot">圆点 ●</option>
          <option value="dash">短横线 -</option>
          <option value="number">数字序号 1. 2. 3.</option>
        </select>
      </label>
      <p className="hint">段落间距控制模块内段落与要点列表的松紧；模块间距控制各模块标题之间的留白。教育、工作、项目等条目按“名称居左、角色/专业居中加粗、时间居右”排版。</p>
    </section>
  );
  if (tab === "import") return (
    <section>
      <h1>智能导入</h1>
      <p>导入已有简历文件（支持 PDF / Word / TXT），或直接粘贴简历文本；系统会自动识别模块并填入，导入后可在各模块中自由修改。</p>
      <div className="import-box">
        <label className="file-pick">
          <span className="pick-btn">选择简历文件</span>
          <input type="file" accept=".pdf,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && <em>{file.name}</em>}
        </label>
        <div className="or">或</div>
        <label><span>粘贴简历文本</span>
          <textarea className="large" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="例如：&#10;姓名：张三&#10;电话：13800000000&#10;教育经历：&#10;清华大学 计算机科学与技术 本科 2018.09-2022.06&#10;工作经历：&#10;北京字节跳动 前端开发工程师 2022.07-至今" />
        </label>
        <button className="primary" disabled={!raw.trim() && !file} onClick={runImport}>识别并导入</button>
      </div>
    </section>
  );
  if (tab === "coach") return (
    <Coach resume={resume} update={update} busy={coachBusy} result={coachResult} error={coachError} setError={setCoachError} run={runCoach} />
  );
  if (tab === "education") return <Education resume={resume} update={update} />;
  if (tab === "awards" || tab === "skills") return <Lines title={tab === "awards" ? "奖项荣誉" : "专业技能"} values={tab === "awards" ? resume.awards : resume.skills} update={(values) => update((d) => { if (tab === "awards") d.awards = values; else d.skills = values; })} />;
  if (tab === "custom") return <Custom resume={resume} update={update} />;
  const key = tab as "experience" | "internships" | "projects" | "campus";
  return <Records title={sectionLabels[key]} kind={key} records={resume[key]} update={update} />;
}

function Coach({ resume, update, busy, result, error, setError, run }: {
  resume: Resume; update: (fn: (d: Resume) => void) => void; busy: boolean; result: any; error: string; setError: (v: string) => void; run: () => void;
}) {
  const list = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  const risks = result && Array.isArray(result.risks) ? result.risks : [];
  const suggestions = result && Array.isArray(result.suggestions) ? result.suggestions : [];
  const matching = result && result.matching ? result.matching : null;
  const jd = result && result.jd ? result.jd : null;
  const missing = list(result && result.missing);
  const severityLabel: Record<string, string> = { high: "高", medium: "中", low: "低", info: "提示" };
  return (
    <section>
      <h1>JD 优化</h1>
      <label><span>职位描述（JD）</span>
        <textarea className="large" value={resume.jd} onChange={(e) => update((d) => { d.jd = e.target.value; })} placeholder="粘贴目标岗位的完整职位描述，例如：&#10;岗位职责：需求调研、PRD 撰写、用户访谈…&#10;任职要求：熟悉大模型 API 调用，有项目落地经验…" />
      </label>
      <button className="primary" disabled={busy || !resume.jd.trim()} onClick={run}>{busy ? "分析中..." : "开始五步分析"}</button>
      {error && <div className="error-box">{error}<button className="link-button" onClick={() => setError("")}>关闭</button></div>}
      {result && (
        <div className="coach-result">
          {matching && (
            <div className="coach-block">
              <h2>关键词匹配</h2>
              <p className="coach-meta">匹配度 {Number(matching.score) || 0} / 100</p>
              <p className="coach-line"><b>已命中</b>：{list(matching.matched).length ? list(matching.matched).join("、") : "暂无"}</p>
              <p className="coach-line"><b>未命中</b>：{list(matching.missing).length ? list(matching.missing).join("、") : "暂无"}</p>
              {jd && <p className="coach-line"><b>JD 关键词</b>：{list(jd.keywords).length ? list(jd.keywords).join("、") : "未识别"}</p>}
            </div>
          )}
          {risks.length > 0 && (
            <div className="coach-block">
              <h2>事实风险</h2>
              {risks.map((risk: any, index: number) => (
                <div className="coach-risk" key={index}>
                  <span className={`sev sev-${risk.severity || "info"}`}>{severityLabel[risk.severity] || "提示"}</span>
                  <div>
                    <b>{text(risk.path)}</b>
                    <p>{text(risk.item) || text(risk.reason)}</p>
                    <em>{text(risk.reason)}</em>
                  </div>
                </div>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="coach-block">
              <h2>改进建议</h2>
              {suggestions.map((suggestion: any, index: number) => (
                <div className="coach-suggestion" key={index}>
                  <b>{text(suggestion.path)}</b>
                  <p>{text(suggestion.after) || "待补充"}</p>
                  <em>{text(suggestion.reason)}</em>
                </div>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div className="coach-block">
              <h2>待补充</h2>
              <p className="coach-line">{missing.join("、")}</p>
            </div>
          )}
          {result.warnings && list(result.warnings).length > 0 && (
            <div className="coach-block">
              <h2>提醒</h2>
              {list(result.warnings).map((warning, index) => <p className="coach-warning" key={index}>{warning}</p>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Slider({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="slider-field">
      <span className="slider-head"><span>{label}</span><em>{display}</em></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="range-labels"><em>小</em><em>大</em></span>
    </label>
  );
}

function PhotoPicker({ resume, update, setNotice }: { resume: Resume; update: (fn: (d: Resume) => void) => void; setNotice: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("resumeId", resume.id);
      form.append("file", file);
      const response = await fetch("/api/photo", { method: "POST", body: form });
      const data = await response.json().catch(() => ({ error: `服务返回异常（HTTP ${response.status}）` }));
      if (!response.ok) throw new Error(data.error || "上传失败");
      update((d) => { d.photo = data.photo; });
      setNotice("证件照已上传，会显示在预览和导出文件的右上角。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const remove = async () => {
    if (!resume.photo) return;
    try {
      const response = await fetch(`/api/photo?photo=${encodeURIComponent(resume.photo)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "移除失败");
      update((d) => { d.photo = ""; });
      setNotice("已移除证件照。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "移除失败");
    }
  };
  return (
    <div className="photo-picker">
      <div className="photo-preview">
        {resume.photo ? <img src={`/api/photo?photo=${encodeURIComponent(resume.photo)}`} alt="证件照" /> : <span>未上传</span>}
      </div>
      <div className="photo-actions">
        <label className="pick-btn">
          {busy ? "上传中..." : "上传证件照"}
          <input ref={inputRef} type="file" accept="image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
        {resume.photo && <button className="secondary" onClick={remove}>移除</button>}
        <p>支持 JPG / PNG / WebP / GIF，5MB 以内；照片会显示在预览与导出文件的右上角。</p>
      </div>
    </div>
  );
}

function Education({ resume, update }: { resume: Resume; update: (fn: (d: Resume) => void) => void }) {
  const add = () => update((d) => { d.education.push({ school: "", degree: "", major: "", date: "", detail: "" }); });
  return (
    <section>
      <div className="heading"><h1>教育经历</h1><button className="secondary" onClick={add}>添加教育经历</button></div>
      <p className="hint">预览排版：学校居左，专业居中，学历与时间居右。</p>
      {resume.education.map((item, index) => (
        <div className="card" key={index}>
          <div className="fields two">
            <label><span>学校</span><input value={item.school} onChange={(e) => update((d) => { d.education[index].school = e.target.value; })} /></label>
            <label><span>专业</span><input value={item.major} onChange={(e) => update((d) => { d.education[index].major = e.target.value; })} /></label>
          </div>
          <div className="fields two">
            <label><span>学历</span><input value={item.degree} onChange={(e) => update((d) => { d.education[index].degree = e.target.value; })} /></label>
            <label><span>时间</span><input value={item.date} onChange={(e) => update((d) => { d.education[index].date = e.target.value; })} /></label>
          </div>
          <label><span>补充说明</span><textarea value={item.detail} onChange={(e) => update((d) => { d.education[index].detail = e.target.value; })} /></label>
          <button className="danger" onClick={() => update((d) => { d.education.splice(index, 1); })}>删除该条</button>
        </div>
      ))}
      {!resume.education.length && <p className="hint">暂无教育经历，点击上方“添加教育经历”开始填写。</p>}
    </section>
  );
}

function Records({ title, kind, records, update }: {
  title: string; kind: "experience" | "internships" | "campus" | "projects"; records: any[]; update: (fn: (d: Resume) => void) => void;
}) {
  return (
    <section>
      <div className="heading">
        <h1>{title}</h1>
        <button className="secondary" onClick={() => update((d) => {
          if (kind === "projects") d.projects.push({ name: "", role: "", date: "", bullets: [] });
          else (d as any)[kind].push({ organization: "", role: "", date: "", bullets: [] });
        })}>添加{title}</button>
      </div>
      <p className="hint">预览排版：单位/项目居左，角色居中，时间居右。</p>
      {records.map((item, index) => (
        <div className="card" key={index}>
          <div className="fields three">
            <label><span>{kind === "projects" ? "项目名称" : "单位"}</span><input value={kind === "projects" ? item.name : item.organization} onChange={(e) => update((d) => { if (kind === "projects") d.projects[index].name = e.target.value; else (d as any)[kind][index].organization = e.target.value; })} /></label>
            <label><span>角色</span><input value={item.role} onChange={(e) => update((d) => { (d as any)[kind][index].role = e.target.value; })} /></label>
            <label><span>时间</span><input value={item.date} onChange={(e) => update((d) => { (d as any)[kind][index].date = e.target.value; })} /></label>
          </div>
          <label><span>内容要点（每行一条）</span><textarea value={item.bullets.join("\n")} onChange={(e) => update((d) => { (d as any)[kind][index].bullets = e.target.value.split("\n"); })} /></label>
          <button className="danger" onClick={() => update((d) => { (d as any)[kind].splice(index, 1); })}>删除</button>
        </div>
      ))}
    </section>
  );
}

function Lines({ title, values, update }: { title: string; values: string[]; update: (v: string[]) => void }) {
  return (
    <section>
      <h1>{title}</h1>
      <label><span>每行一项</span><textarea className="large" value={values.join("\n")} onChange={(e) => update(e.target.value.split("\n"))} /></label>
    </section>
  );
}

function Custom({ resume, update }: { resume: Resume; update: (fn: (d: Resume) => void) => void }) {
  return (
    <section>
      <h1>自定义模块</h1>
      {resume.customSections.map((item, index) => (
        <div className="card" key={item.id}>
          <label><span>模块 {index + 1} 标题</span><input value={item.title} onChange={(e) => update((d) => { d.customSections[index].title = e.target.value; })} /></label>
          <label><span>内容（每行一条）</span><textarea value={item.lines.join("\n")} onChange={(e) => update((d) => { d.customSections[index].lines = e.target.value.split("\n"); })} /></label>
        </div>
      ))}
    </section>
  );
}

function Preview({ resume }: { resume: Resume }) {
  const marker = `marker-${resume.listStyle}`;
  const paperStyle = {
    fontSize: `${resume.fontSize}pt`,
    lineHeight: resume.lineHeight,
    "--module-gap": `${resume.moduleGap}px`,
    "--para-gap": `${resume.spacing}px`,
  } as React.CSSProperties;
  return (
    <article className="paper" style={paperStyle}>
      <div className="paper-head">
        <div className="paper-id">
          <h1>{text(resume.profile.name)}</h1>
          <p className="meta">{[resume.profile.headline, resume.targetRole, resume.profile.city, resume.profile.phone, resume.profile.email].map(text).filter(Boolean).join(" · ")}</p>
        </div>
        {resume.photo && <img className="photo" src={`/api/photo?photo=${encodeURIComponent(resume.photo)}`} alt="证件照" />}
      </div>
      {resume.sectionOrder.map((id) => <PreviewSection key={id} id={id} resume={resume} marker={marker} />)}
    </article>
  );
}

function PreviewSection({ id, resume, marker }: { id: SectionId; resume: Resume; marker: string }) {
  if (id === "summary") return text(resume.summary) ? <PaperSection title="个人概况"><p>{text(resume.summary)}</p></PaperSection> : null;
  if (id === "education") {
    const values = resume.education.filter((x) => Object.values(x).some(text));
    return values.length ? (
      <PaperSection title="教育经历">
        {values.map((x, i) => (
          <div className="item" key={i}>
            <div className="row cols3">
              <strong>{text(x.school)}</strong>
              <strong className="mid">{[x.major, x.degree].map(text).filter(Boolean).join(" · ")}</strong>
              <time>{text(x.date)}</time>
            </div>
            {text(x.detail) ? <p>{text(x.detail)}</p> : null}
          </div>
        ))}
      </PaperSection>
    ) : null;
  }
  if (id === "awards" || id === "skills") {
    const values = (id === "awards" ? resume.awards : resume.skills).map(text).filter(Boolean);
    return values.length ? <PaperSection title={sectionLabels[id]}><ul className={marker}>{values.map((x, i) => <li key={i}>{x}</li>)}</ul></PaperSection> : null;
  }
  if (id.startsWith("custom")) {
    const item = resume.customSections.find((x) => x.id === id);
    const lines = item ? item.lines.map(text).filter(Boolean) : [];
    return item && text(item.title) && lines.length ? <PaperSection title={text(item.title)}><ul className={marker}>{lines.map((x, i) => <li key={i}>{x}</li>)}</ul></PaperSection> : null;
  }
  const values = resume[id as "experience" | "internships" | "campus" | "projects"] as Resume["experience"] | Resume["projects"];
  const visible = values.filter((x) => Object.values(x).some((v) => Array.isArray(v) ? v.some(text) : text(v)));
  return visible.length ? (
    <PaperSection title={sectionLabels[id]}>
      {visible.map((x, i) => (
        <div className="item" key={i}>
          <div className="row cols3">
            <strong>{text("name" in x ? x.name : x.organization)}</strong>
            <strong className="mid">{text(x.role)}</strong>
            <time>{text(x.date)}</time>
          </div>
          {x.bullets.map(text).filter(Boolean).length ? <ul className={marker}>{x.bullets.map(text).filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul> : null}
        </div>
      ))}
    </PaperSection>
  ) : null;
}

function PaperSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="paper-section"><h2>{title}</h2>{children}</section>;
}
