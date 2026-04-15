import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import { getApp, getApps, initializeApp } from "https://esm.sh/firebase@10.12.2/app";
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from "https://esm.sh/firebase@10.12.2/storage";

const html = htm.bind(React.createElement);

const firebaseConfig = window.ZYRO_FIREBASE_CONFIG || null;
const htmlRoot = document.getElementById("upload-root");

const hasFirebaseConfig = (config) =>
  Boolean(
    config &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.appId
  );

const formatBytes = (bytes) => {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const createPreviewUrl = (file) => URL.createObjectURL(file);

const simulateUpload = ({ file, onProgress }) =>
  new Promise((resolve) => {
    let progress = 0;
    const timer = window.setInterval(() => {
      progress += 10;
      onProgress(Math.min(progress, 100));
      if (progress >= 100) {
        window.clearInterval(timer);
        window.setTimeout(() => {
          resolve({
            url: createPreviewUrl(file),
            mode: "simulated",
          });
        }, 250);
      }
    }, 180);
  });

const uploadWithFirebase = ({ file, onProgress }) =>
  new Promise((resolve, reject) => {
    try {
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const storage = getStorage(app);
      const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const storageRef = ref(storage, `uploads/${safeName}`);
      const task = uploadBytesResumable(storageRef, file);

      task.on(
        "state_changed",
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(percent);
        },
        (error) => {
          console.error("Firebase upload failed:", error);
          reject(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            resolve({
              url,
              mode: "firebase",
            });
          } catch (error) {
            console.error("Download URL fetch failed:", error);
            reject(error);
          }
        }
      );
    } catch (error) {
      console.error("Firebase setup failed:", error);
      reject(error);
    }
  });

const UploadApp = () => {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Choose a video to begin.");
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const firebaseReady = useMemo(() => hasFirebaseConfig(firebaseConfig), []);
  const canUpload = Boolean(file) && Boolean(caption.trim()) && !isUploading;

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    if (!nextFile.type.startsWith("video/")) {
      setMessage("Please choose a valid video file.");
      setStatus("Invalid file type.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreview = createPreviewUrl(nextFile);
    setFile(nextFile);
    setPreviewUrl(nextPreview);
    setUploadedUrl("");
    setProgress(0);
    setMessage("");
    setStatus("Ready to upload.");
  };

  const handleUpload = async () => {
    if (!canUpload || !file) return;

    setIsUploading(true);
    setProgress(0);
    setMessage("");
    setStatus(firebaseReady ? "Uploading to Firebase..." : "Firebase missing. Simulating upload...");

    try {
      const result = firebaseReady
        ? await uploadWithFirebase({
            file,
            onProgress: setProgress,
          })
        : await simulateUpload({
            file,
            onProgress: setProgress,
          });

      setUploadedUrl(result.url);
      setStatus("Upload complete");
      setMessage("Upload complete");
    } catch (error) {
      console.error("Upload flow crashed:", error);
      setStatus("Upload failed");
      setMessage("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return html`
    <div className="mx-auto max-w-3xl">
      <section className="rounded-3xl border border-white/10 bg-[#10141c]/90 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/70">Zyro Upload</p>
          <h1 className="mt-2 font-['Orbitron'] text-3xl text-white">Upload Video</h1>
          <p className="mt-3 text-sm text-slate-300">
            Stable upload flow with Firebase fallback so the page keeps working even when config is missing.
          </p>
        </div>

        <div className="grid gap-5">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange=${handleFileChange}
              className="block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white file:mr-4 file:rounded-xl file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:text-sm file:font-medium file:text-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Caption</label>
            <input
              type="text"
              value=${caption}
              onInput=${(event) => setCaption(event.currentTarget.value)}
              placeholder="Write a short caption"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
              <span>${status}</span>
              <span>${progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 transition-all duration-200"
                style=${{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <button
            type="button"
            disabled=${!canUpload}
            onClick=${handleUpload}
            className=${[
              "rounded-2xl px-5 py-3 text-sm font-semibold transition",
              canUpload
                ? "bg-gradient-to-r from-red-500 via-orange-500 to-amber-300 text-black hover:-translate-y-0.5"
                : "cursor-not-allowed bg-white/10 text-white/40",
            ].join(" ")}
          >
            ${isUploading ? "Uploading..." : "Upload Video"}
          </button>

          ${message
            ? html`
                <div
                  className=${[
                    "rounded-2xl border px-4 py-3 text-sm",
                    message === "Upload complete"
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                      : "border-red-400/20 bg-red-400/10 text-red-100",
                  ].join(" ")}
                >
                  ${message}
                </div>
              `
            : null}

          ${file
            ? html`
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-3 text-sm text-white">${file.name}</div>
                  <div className="mb-4 text-xs text-slate-400">${formatBytes(file.size)}</div>
                  ${previewUrl
                    ? html`
                        <video
                          src=${uploadedUrl || previewUrl}
                          controls
                          playsInline
                          className="w-full rounded-2xl border border-white/10 bg-black"
                        ></video>
                      `
                    : null}
                </div>
              `
            : null}

          <div className="text-xs text-slate-500">
            ${firebaseReady
              ? "Firebase mode is active."
              : "Firebase config is missing, so uploads are simulated instead of crashing the page."}
          </div>
        </div>
      </section>
    </div>
  `;
};

const renderFallback = (text) => {
  if (!htmlRoot) return;
  htmlRoot.innerHTML = `
    <div style="max-width: 720px; margin: 0 auto; padding: 24px; border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; background: rgba(16,20,28,0.9); color: #f8fafc;">
      <h1 style="margin: 0 0 12px; font-family: Orbitron, sans-serif;">Upload Page Error</h1>
      <p style="margin: 0; color: #cbd5e1;">${text}</p>
    </div>
  `;
};

if (!htmlRoot) {
  console.error("Upload root element was not found.");
} else {
  try {
    createRoot(htmlRoot).render(html`<${UploadApp} />`);
  } catch (error) {
    console.error("React render failed:", error);
    renderFallback("The upload page failed to load. Check the console for details.");
  }
}
