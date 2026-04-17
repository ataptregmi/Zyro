import * as React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

function getRootElement() {
  return document.getElementById("root");
}

function renderHardFallback(message) {
  const root = getRootElement();
  if (!root) return;
  root.innerHTML = `
    <div style="border:1px solid rgba(255,255,255,0.12);background:rgba(15,23,42,0.92);border-radius:24px;padding:24px;color:white;font-family:Arial,sans-serif;">
      <h1 style="margin:0 0 12px 0;font-size:28px;">Zyro Analyst</h1>
      <p style="margin:0;color:#cbd5e1;">${message}</p>
    </div>
  `;
}

function hasFirebaseConfig() {
  const config = window.ZYRO_FIREBASE_CONFIG;
  return Boolean(
    config &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.appId
  );
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferGameFromFileName(fileName) {
  const name = (fileName || "").toLowerCase();
  if (name.includes("freefire") || name.includes("free-fire")) return "Free Fire";
  if (name.includes("valorant") || name.includes("val")) return "Valorant";
  if (name.includes("pubg")) return "PUBG";
  if (name.includes("cod") || name.includes("warzone")) return "Call of Duty";
  if (name.includes("fortnite")) return "Fortnite";
  if (name.includes("apex")) return "Apex Legends";
  if (name.includes("cs2") || name.includes("counter")) return "Counter-Strike 2";
  return "";
}

async function uploadToFirebase(file) {
  const config = window.ZYRO_FIREBASE_CONFIG;
  const [{ initializeApp, getApps, getApp }, { getStorage, ref, uploadBytes, getDownloadURL }] =
    await Promise.all([
      import("https://esm.sh/firebase@10.12.2/app"),
      import("https://esm.sh/firebase@10.12.2/storage"),
    ]);

  const app = getApps().length ? getApp() : initializeApp(config);
  const storage = getStorage(app);
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const fileRef = ref(storage, `uploads/${safeName}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

function UploadPanel(props) {
  const {
    file,
    previewUrl,
    caption,
    detectedGame,
    status,
    isUploading,
    onFileChange,
    onCaptionChange,
    onGameChange,
    onUploadClick,
  } = props;

  return React.createElement(
    "div",
    { className: "rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/30" },
    React.createElement(
      "div",
      { className: "mb-6" },
      React.createElement("p", { className: "text-xs uppercase tracking-[0.28em] text-amber-300/70" }, "Create Hub"),
      React.createElement("h1", { className: "mt-2 text-3xl font-bold text-white" }, "AI Analyst Upload"),
      React.createElement(
        "p",
        { className: "mt-2 text-sm text-slate-400" },
        "Upload your clip, then let Zyro switch into analyst mode automatically."
      )
    ),
    React.createElement(
      "div",
      { className: "space-y-5" },
      React.createElement(
        "div",
        null,
        React.createElement("label", { className: "mb-2 block text-sm font-medium text-slate-300" }, "Video File"),
        React.createElement("input", {
          type: "file",
          accept: "video/*",
          onChange: onFileChange,
          className:
            "block w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:font-medium file:text-black",
        })
      ),
      React.createElement(
        "div",
        null,
        React.createElement("label", { className: "mb-2 block text-sm font-medium text-slate-300" }, "Caption"),
        React.createElement("input", {
          type: "text",
          value: caption,
          onChange: onCaptionChange,
          placeholder: "Write a caption",
          className:
            "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500",
        })
      ),
      React.createElement(
        "div",
        null,
        React.createElement("label", { className: "mb-2 block text-sm font-medium text-slate-300" }, "Detected Game"),
        React.createElement(
          "select",
          {
            value: detectedGame,
            onChange: onGameChange,
            className:
              "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm text-white outline-none",
          },
          React.createElement("option", { value: "" }, "Auto detect or choose manually"),
          React.createElement("option", { value: "Free Fire" }, "Free Fire"),
          React.createElement("option", { value: "Valorant" }, "Valorant"),
          React.createElement("option", { value: "PUBG" }, "PUBG"),
          React.createElement("option", { value: "Call of Duty" }, "Call of Duty"),
          React.createElement("option", { value: "Fortnite" }, "Fortnite"),
          React.createElement("option", { value: "Apex Legends" }, "Apex Legends"),
          React.createElement("option", { value: "Counter-Strike 2" }, "Counter-Strike 2")
        )
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: onUploadClick,
          disabled: isUploading,
          className: `w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
            isUploading
              ? "cursor-not-allowed bg-slate-700 text-slate-400"
              : "bg-amber-300 text-black hover:bg-amber-200"
          }`,
        },
        isUploading ? "Uploading..." : "Upload & Analyze"
      ),
      React.createElement(
        "div",
        { className: "rounded-xl border border-white/10 bg-slate-800/60 px-4 py-3 text-sm text-slate-300" },
        status
      ),
      file
        ? React.createElement(
            "div",
            { className: "rounded-2xl border border-white/10 bg-slate-950 p-4" },
            React.createElement("div", { className: "mb-2 text-sm text-slate-200" }, file.name),
            React.createElement("div", { className: "mb-4 text-xs text-slate-500" }, formatFileSize(file.size)),
            previewUrl
              ? React.createElement("video", {
                  src: previewUrl,
                  controls: true,
                  className: "w-full rounded-xl bg-black",
                })
              : null
          )
        : null
    )
  );
}

function AnalysisDashboard({ results, videoUrl, isAnalyzing, status }) {
  if (isAnalyzing) {
    return React.createElement(
      "div",
      { className: "rounded-3xl border border-amber-300/20 bg-slate-900/95 p-6 shadow-2xl shadow-black/30" },
      React.createElement("p", { className: "text-xs uppercase tracking-[0.28em] text-amber-300/70" }, "AI Analyst"),
      React.createElement("h2", { className: "mt-2 text-3xl font-bold text-white" }, "Scanning gameplay"),
      React.createElement("p", { className: "mt-3 text-sm text-slate-400" }, status)
    );
  }

  if (!results) return null;

  return React.createElement(
    "div",
    { className: "rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/30" },
    React.createElement("p", { className: "text-xs uppercase tracking-[0.28em] text-amber-300/70" }, "AI Analyst"),
    React.createElement("h2", { className: "mt-2 text-3xl font-bold text-white" }, "Analysis Complete"),
    React.createElement(
      "p",
      { className: "mt-3 text-sm text-slate-400" },
      `Detected game: ${results.game} · Rank estimate: ${results.rank_estimate}`
    ),
    React.createElement(
      "div",
      { className: "analysis-grid" },
      React.createElement(
        "div",
        null,
        videoUrl
          ? React.createElement("video", {
              src: videoUrl,
              controls: true,
              className: "mb-5 w-full rounded-2xl border border-white/10 bg-black",
            })
          : null,
        React.createElement(
          "div",
          { className: "rounded-2xl border border-white/10 bg-black/20 p-5" },
          React.createElement("h3", { className: "mb-4 text-xl font-semibold text-white" }, "Frame-by-frame insights"),
          results.insights.map((item) =>
            React.createElement(
              "div",
              { key: `${item.time}-${item.type}`, className: "insight-card" },
              React.createElement(
                "div",
                { className: "mb-2 flex items-center justify-between gap-3 text-sm text-white" },
                React.createElement("strong", null, item.type),
                React.createElement("span", { className: "text-xs text-slate-400" }, item.time)
              ),
              React.createElement("p", { className: "text-sm text-slate-300" }, item.note)
            )
          )
        )
      ),
      React.createElement(
        "div",
        { className: "rounded-2xl border border-white/10 bg-black/20 p-5" },
        React.createElement("h3", { className: "mb-4 text-xl font-semibold text-white" }, "Skill Snapshot"),
        React.createElement(
          "div",
          { className: "mb-5 flex justify-center" },
          React.createElement("div", { className: "skill-meter-circle" }, `${results.skill_score}`)
        ),
        React.createElement(
          "div",
          { className: "space-y-3 text-sm text-slate-300" },
          React.createElement("div", null, `Game: ${results.game}`),
          React.createElement("div", null, `Estimated rank: ${results.rank_estimate}`),
          React.createElement("div", null, `Status: ${status}`)
        )
      )
    )
  );
}

function App() {
  const [file, setFile] = React.useState(null);
  const [caption, setCaption] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [uploadedUrl, setUploadedUrl] = React.useState("");
  const [detectedGame, setDetectedGame] = React.useState("");
  const [status, setStatus] = React.useState("Choose a video to begin.");
  const [isUploading, setIsUploading] = React.useState(false);
  const [analysisResults, setAnalysisResults] = React.useState(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function onFileChange(event) {
    const nextFile = event.target.files && event.target.files[0];
    if (!nextFile) return;

    if (!nextFile.type || !nextFile.type.startsWith("video/")) {
      window.alert("Please select a valid video file.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setPreviewUrl(nextPreviewUrl);
    setUploadedUrl("");
    setAnalysisResults(null);
    setDetectedGame(inferGameFromFileName(nextFile.name));
    setStatus("Video selected. Ready to upload.");
  }

  async function analyzeGameplay(videoUrl) {
    setIsAnalyzing(true);
    setStatus("AI Analyst is scanning frames...");
    await new Promise((resolve) => window.setTimeout(resolve, 3000));

    const mockData = {
      game: detectedGame || "Free Fire",
      skill_score: 72,
      rank_estimate: "Platinum II",
      insights: [
        { time: "00:12", type: "Mechanical", note: "Gloo Wall delay was 0.9s. Target: < 0.3s." },
        { time: "00:45", type: "Strategy", note: "Pushed without utility. High risk of 3rd party." },
      ],
      videoUrl,
    };

    setAnalysisResults(mockData);
    setIsAnalyzing(false);
    setStatus("Analysis Complete.");
  }

  async function onUploadClick() {
    if (!file) {
      window.alert("Please select a video first.");
      return;
    }

    try {
      setIsUploading(true);
      setAnalysisResults(null);
      setStatus(hasFirebaseConfig() ? "Uploading to Firebase..." : "Simulating upload...");

      let nextVideoUrl = previewUrl;
      if (hasFirebaseConfig()) {
        nextVideoUrl = await uploadToFirebase(file);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }

      setUploadedUrl(nextVideoUrl);
      setStatus("Upload complete. Launching AI Analyst...");
      await analyzeGameplay(nextVideoUrl);
    } catch (error) {
      console.error("Upload failed:", error);
      setStatus("Upload failed");
      window.alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return React.createElement(
    "div",
    { className: "mx-auto w-full max-w-6xl" },
    React.createElement(
      "div",
      { className: "grid gap-6 lg:grid-cols-[0.95fr_1.05fr]" },
      React.createElement(UploadPanel, {
        file,
        previewUrl,
        caption,
        detectedGame,
        status,
        isUploading,
        onFileChange,
        onCaptionChange: (event) => setCaption(event.target.value),
        onGameChange: (event) => setDetectedGame(event.target.value),
        onUploadClick,
      }),
      React.createElement(AnalysisDashboard, {
        results: analysisResults,
        videoUrl: uploadedUrl || previewUrl,
        isAnalyzing,
        status,
      })
    )
  );
}

try {
  const rootElement = getRootElement();
  if (!rootElement) {
    throw new Error("Root element not found.");
  }
  createRoot(rootElement).render(React.createElement(App));
} catch (error) {
  console.error("Upload page render failed:", error);
  renderHardFallback("The upload page failed to render correctly.");
}
