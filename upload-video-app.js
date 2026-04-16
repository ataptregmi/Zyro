import React from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const { useMemo, useState, useEffect } = React;

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
  const storageRef = ref(storage, `uploads/${safeName}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

function App() {
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  const firebaseEnabled = useMemo(() => hasFirebaseConfig(), []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event) {
    const selectedFile = event.target.files && event.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreviewUrl(objectUrl);
    setUploadedUrl("");
    setMessage("");
  }

  async function handleUpload() {
    if (!file) {
      alert("Please select a video file first.");
      return;
    }

    try {
      setIsUploading(true);
      setMessage("");

      if (firebaseEnabled) {
        const url = await uploadToFirebase(file);
        setUploadedUrl(url);
        setMessage("Upload complete");
      } else {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 2000);
        });
        setUploadedUrl(previewUrl);
        setMessage("Upload complete");
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return React.createElement(
    "div",
    {
      className:
        "rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-black/30 backdrop-blur",
    },
    React.createElement(
      "div",
      { className: "mb-6 text-center" },
      React.createElement("h1", { className: "text-3xl font-bold text-white" }, "Upload Video"),
      React.createElement(
        "p",
        { className: "mt-2 text-sm text-slate-400" },
        "Simple, stable upload page for Zyro."
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
          onChange: handleFileChange,
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
      file
        ? React.createElement(
            "div",
            { className: "rounded-2xl border border-white/10 bg-slate-950 p-4" },
            React.createElement(
              "div",
              { className: "mb-2 text-sm text-slate-200" },
              file.name
            ),
            React.createElement(
              "div",
              { className: "mb-4 text-xs text-slate-500" },
              formatFileSize(file.size)
            ),
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
        "button",
        {
          type: "button",
          onClick: handleUpload,
          disabled: isUploading,
          className: `w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
            isUploading
              ? "cursor-not-allowed bg-slate-700 text-slate-400"
              : "bg-amber-300 text-black hover:bg-amber-200"
          }`,
        },
        isUploading ? "Uploading..." : "Upload Video"
      ),
      message
        ? React.createElement(
            "div",
            { className: "rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100" },
            message
          )
        : null,
      React.createElement(
        "div",
        { className: "text-center text-xs text-slate-500" },
        firebaseEnabled
          ? "Firebase upload is enabled."
          : "Firebase config not found. Using simulated upload."
      )
    )
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  alert("Root element not found.");
} else {
  try {
    createRoot(rootElement).render(React.createElement(App));
  } catch (error) {
    console.error("Render failed:", error);
    alert("The upload page failed to render.");
  }
}
