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
      <h1 style="margin:0 0 12px 0;font-size:28px;">Upload Video</h1>
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

function App() {
  const [file, setFile] = React.useState(null);
  const [caption, setCaption] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [uploadedUrl, setUploadedUrl] = React.useState("");
  const [status, setStatus] = React.useState("Choose a video to begin.");
  const [isUploading, setIsUploading] = React.useState(false);

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
    setStatus("Video selected. Ready to upload.");
  }

  async function onUploadClick() {
    if (!file) {
      window.alert("Please select a video first.");
      return;
    }

    try {
      setIsUploading(true);
      setStatus(hasFirebaseConfig() ? "Uploading to Firebase..." : "Simulating upload...");

      if (hasFirebaseConfig()) {
        const downloadUrl = await uploadToFirebase(file);
        setUploadedUrl(downloadUrl);
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        setUploadedUrl(previewUrl);
      }

      setStatus("Upload complete");
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
    {
      className:
        "rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/30",
    },
    React.createElement(
      "div",
      { className: "mb-6 text-center" },
      React.createElement("h1", { className: "text-3xl font-bold text-white" }, "Upload Video"),
      React.createElement(
        "p",
        { className: "mt-2 text-sm text-slate-400" },
        "Simple, stable upload page."
      )
    ),
    React.createElement(
      "div",
      { className: "space-y-5" },
      React.createElement(
        "div",
        null,
        React.createElement(
          "label",
          { className: "mb-2 block text-sm font-medium text-slate-300" },
          "Video File"
        ),
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
        React.createElement(
          "label",
          { className: "mb-2 block text-sm font-medium text-slate-300" },
          "Caption"
        ),
        React.createElement("input", {
          type: "text",
          value: caption,
          onChange: (event) => setCaption(event.target.value),
          placeholder: "Write a caption",
          className:
            "w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500",
        })
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
        isUploading ? "Uploading..." : "Upload Video"
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
                  src: uploadedUrl || previewUrl,
                  controls: true,
                  className: "w-full rounded-xl bg-black",
                })
              : null
          )
        : null,
      React.createElement(
        "div",
        { className: "text-center text-xs text-slate-500" },
        hasFirebaseConfig()
          ? "Firebase upload is enabled."
          : "Firebase config not found. Using simulated upload."
      )
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
