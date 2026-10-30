import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";

import { api } from "../api/client";
import { checkPremium, getCurrentUser, getSetting, setSetting } from "../lib/settings";
import Sidebar from "../components/xyron/Sidebar";

import CodexHome from "../components/xyron/codex/CodexHome";
import CodexBuilder from "../components/xyron/codex/CodexBuilder";
import CodexErrorBoundary from "../components/xyron/codex/CodexErrorBoundary";
import CodexHostModal from "../components/xyron/codex/CodexHostModal";
import { importFiles, languageFor } from "../components/xyron/codex/codexImport";
import { MODELS } from "../components/xyron/codex/codexUtils";
import "../styles/codex-theme.css";

// Codex = a home screen ("What should we build?") and a build screen. The build screen plans the work,
// writes every file with a live log, hands back a ZIP and can run the result in the sandbox.
// Projects are kept as CodeFile records so they show up under Recents / Projects on the home screen.

// A project's files as { path, value }: drops a shared top-level folder so the ZIP isn't nested twice.
function projectFromFiles(list) {
  const names = list.map((f) => f.name);
  const firstSegs = new Set(names.map((n) => n.split("/")[0]));
  const strip = names.every((n) => n.includes("/")) && firstSegs.size === 1 ? `${[...firstSegs][0]}/` : "";
  return list.map((f) => ({ path: strip ? f.name.slice(strip.length) : f.name, value: f.content || "", id: f.id }));
}

export default function Codex() {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]); // saved CodeFile records
  const [view, setView] = useState("home"); // "home" | "build"
  const [build, setBuild] = useState(null); // { key, prompt?, initialProject?, initialInput? }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [homeNotice, setHomeNotice] = useState("");
  const [access, setAccess] = useState("checking");
  const [isPremium, setIsPremium] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [model, setModel] = useState(getSetting("codexModel", "vortyx_pulse"));
  const [modelNotice, setModelNotice] = useState("");

  const filesRef = useRef([]);
  const entityIdsRef = useRef(new Map()); // path -> CodeFile id for the project open in the build screen
  filesRef.current = files;
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];

  useEffect(() => {
    Promise.all([checkPremium(), getCurrentUser()]).then(([premium, user]) => {
      setIsPremium(premium);
      if (user) setAccess("granted"); // Codex is open to every signed-in user.
      else navigate("/login", { replace: true });
    });
  }, []);

  useEffect(() => {
    if (access !== "granted") return;
    api.entities.CodeFile.list().then(setFiles).catch((e) => setHomeNotice(`Could not load your projects: ${e.message}`));
  }, [access]);

  const selectModel = (m) => {
    if (!m.free && !isPremium) { setShowSubModal(true); return; }
    setModel(m.id);
    setSetting("codexModel", m.id);
  };

  // The server tells us how many free Xyron Nexus requests are left. When the 10 per 5 hours are used up it
  // answers with Xyron Swift instead; here we switch the picker to Swift too and say when Nexus is back.
  const handleModelMeta = (meta) => {
    if (!meta) return;
    const at = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
    if (meta.switched) {
      setModel(meta.model);
      setSetting("codexModel", meta.model);
      setModelNotice(`You've used your ${meta.limit || 10} free Xyron Nexus requests. Switched to Xyron Swift. Nexus comes back at ${at(meta.resetAt)}.`);
    } else if (typeof meta.remaining === "number" && meta.remaining <= 3) {
      setModelNotice(`${meta.remaining} free Xyron Nexus request${meta.remaining === 1 ? "" : "s"} left. Then it switches to Xyron Swift.`);
    }
  };
  useEffect(() => {
    if (!modelNotice) return undefined;
    const t = setTimeout(() => setModelNotice(""), 9000);
    return () => clearTimeout(t);
  }, [modelNotice]);

  const uniqueName = (name, taken) => {
    if (!taken.has(name)) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    while (taken.has(`${base}-${n}${ext}`)) n += 1;
    return `${base}-${n}${ext}`;
  };

  const openBuild = (extra = {}) => {
    setHomeNotice("");
    setBuild({ key: Date.now(), ...extra });
    setView("build");
  };

  // ---- Home screen actions ----
  const startBuild = ({ prompt }) => {
    entityIdsRef.current = new Map();
    openBuild({ prompt });
  };

  const startFix = () => {
    entityIdsRef.current = new Map();
    openBuild({ initialInput: "Fix this code and tell me what was wrong:\n\n" });
  };

  const openProject = (projectName, list) => {
    const proj = projectFromFiles(list);
    entityIdsRef.current = new Map(proj.map((f) => [f.path, f.id]));
    openBuild({ initialProject: { name: projectName, files: proj.map(({ path, value }) => ({ path, value })) } });
  };

  const openRecent = (file) => {
    const target = file && file.id ? file : files[0];
    if (!target) { startBuild({ prompt: "" }); return; }
    const project = target.project || "untitled";
    const group = files.filter((f) => (f.project || "untitled") === project);
    openProject(project, group.length ? group : [target]);
  };

  const createProjectFiles = async (projectName, list) => {
    const taken = new Set(filesRef.current.map((f) => f.name));
    const created = [];
    for (const f of list) {
      const name = uniqueName(f.name, taken);
      taken.add(name);
      created.push(await api.entities.CodeFile.create({ name, language: f.language, content: f.content, project: projectName }));
    }
    setFiles((prev) => [...created.slice().reverse(), ...prev]);
    return created;
  };

  const useTemplate = async (template) => {
    setHomeNotice("");
    setImporting(true);
    try {
      const created = await createProjectFiles(template.name, template.files.map((f) => ({ name: `${template.id}/${f.name}`, language: f.language, content: f.content })));
      openProject(template.name, created);
    } catch (e) {
      setHomeNotice(`Could not add the template: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const uploadProject = async (fileList) => {
    setHomeNotice("");
    setImporting(true);
    try {
      const result = await importFiles(fileList);
      if (result.fatal) { setHomeNotice(result.fatal); return; }
      if (!result.files.length) {
        const why = result.rejected.slice(0, 3).map((r) => `${r.name}: ${r.reason}`).join("; ");
        setHomeNotice(`Nothing could be imported.${why ? " " + why : ""}`);
        return;
      }
      const created = await createProjectFiles(result.projectName, result.files.map((f) => ({ name: f.name, language: f.language, content: f.content })));
      openProject(result.projectName, created);
    } catch (e) {
      setHomeNotice(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // ---- Build screen: keep what it writes ----
  // New files are created, files that already exist are updated.
  const saveBuildFiles = async (projectName, buildFiles) => {
    const ids = entityIdsRef.current;
    const createdList = [];
    const updated = new Map();
    for (const f of buildFiles) {
      const name = `${projectName}/${f.path}`;
      const existingId = ids.get(f.path) || filesRef.current.find((x) => x.name === name && x.project === projectName)?.id;
      const existing = existingId && filesRef.current.find((x) => x.id === existingId);
      if (existing) {
        if (existing.content !== f.value) {
          await api.entities.CodeFile.update(existing.id, { content: f.value });
          updated.set(existing.id, f.value);
        }
        ids.set(f.path, existing.id);
      } else {
        const created = await api.entities.CodeFile.create({ name, language: languageFor(f.path), content: f.value, project: projectName });
        createdList.push(created);
        ids.set(f.path, created.id);
      }
    }
    setFiles((prev) => [...createdList.slice().reverse(), ...prev.map((x) => (updated.has(x.id) ? { ...x, content: updated.get(x.id) } : x))]);
  };

  if (access === "checking") {
    return (
      <div className="xs-keep-dark flex min-h-screen items-center justify-center bg-[#212121] md:pl-[68px]">
        <Loader2 className="h-5 w-5 animate-spin text-white" />
      </div>
    );
  }

  const hostProject = files[0]?.project || "untitled";
  const hostModal = <CodexHostModal open={hostOpen} onClose={() => setHostOpen(false)} files={files} project={build?.initialProject?.name || hostProject} />;

  return (
    <>
      {/* The Codex screens draw their own rail, so the app sidebar only opens as a drawer here. */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopOpen={false} />

      {view === "build" && build ? (
        <CodexErrorBoundary key={`boundary-${build.key}`}>
        <CodexBuilder
          key={build.key}
          seed={build.prompt ? { id: build.key, prompt: build.prompt } : null}
          initialProject={build.initialProject}
          initialInput={build.initialInput}
          onBack={() => setView("home")}
          onMenu={() => setSidebarOpen(true)}
          onOpenChat={() => navigate("/")}
          onOpenHost={() => setHostOpen(true)}
          models={MODELS}
          model={model}
          onModelChange={(id) => { const m = MODELS.find((x) => x.id === id); if (m) selectModel(m); }}
          canUseModel={() => currentModel.free || isPremium}
          onNeedPremium={() => setShowSubModal(true)}
          onModelMeta={handleModelMeta}
          saveProject={saveBuildFiles}
        />
        </CodexErrorBoundary>
      ) : (
        <CodexHome
          recentFiles={files}
          onBuild={startBuild}
          onFix={startFix}
          onUpload={uploadProject}
          onUseTemplate={useTemplate}
          onOpenRecent={openRecent}
          onOpenMenu={() => setSidebarOpen(true)}
          onOpenHost={() => setHostOpen(true)}
          onOpenChat={() => navigate("/")}
          models={MODELS}
          model={model}
          onModelChange={(id) => { const m = MODELS.find((x) => x.id === id); if (m) selectModel(m); }}
          importing={importing}
          notice={homeNotice}
        />
      )}

      {hostModal}

      {modelNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-3">
          <div className="pointer-events-auto max-w-sm rounded-xl border border-white/15 bg-[#262626] px-4 py-2.5 text-sm text-neutral-100 shadow-2xl" role="status" onClick={() => setModelNotice("")}>
            {modelNotice}
          </div>
        </div>
      )}

      {showSubModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSubModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#262626] p-6 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3"><Lock className="h-5 w-5 text-neutral-300" /><h3 className="text-lg font-semibold">Premium model</h3></div>
            <p className="text-sm text-neutral-400">This model needs Premium. Pick a free model, or upgrade to unlock it.</p>
            <div className="mt-5 flex gap-2">
              <Link to="/premium" className="flex-1 rounded-xl bg-white px-4 py-2.5 text-center text-sm font-medium text-black">Upgrade</Link>
              <button type="button" onClick={() => setShowSubModal(false)} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5">Later</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
