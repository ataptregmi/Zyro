import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import htm from "https://esm.sh/htm@3.1.1";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { FFmpeg } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.10";
import { fetchFile, toBlobURL } from "https://esm.sh/@ffmpeg/util@0.12.1";

const html = htm.bind(React.createElement);

const CAPTION_LIMIT = 120;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_SECONDS = 60;
const MAX_VIDEO_HEIGHT = 720;
const ACCEPTED_MIME_PREFIX = "video/";
const ACCEPTED_LABEL = "MP4, MOV, WebM";
const DRAFT_STORAGE_KEY = "zyro-upload-draft-v2";
const SUCCESS_REDIRECT_URL = "";
const SUCCESS_REDIRECT_DELAY_MS = 1800;
const COMPRESSION_TARGET = {
  videoBitrate: "1800k",
  audioBitrate: "128k",
  crf: "28",
};

const firebaseConfig = window.ZYRO_FIREBASE_CONFIG || {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

const categoryOptions = ["FPS", "Battle Royale", "Sports", "Strategy", "Other"];
const privacyOptions = ["Public", "Private"];
const defaultValues = {
  caption: "",
  description: "",
  category: "",
  tags: [],
  privacy: "Public",
};

let ffmpegPromise = null;
let ffmpegProgressHandler = null;

const isFirebaseConfigured = () =>
  Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.appId
  );

const getFirebaseServices = () => {
  if (!isFirebaseConfigured()) return null;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return {
    app,
    auth: getAuth(app),
    storage: getStorage(app),
    firestore: getFirestore(app),
  };
};

const readDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      caption: typeof parsed.caption === "string" ? parsed.caption : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      category: typeof parsed.category === "string" ? parsed.category : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((item) => typeof item === "string") : [],
      privacy: typeof parsed.privacy === "string" ? parsed.privacy : "Public",
      savedAt: parsed.savedAt || "",
    };
  } catch (_error) {
    return null;
  }
};

const writeDraft = (values) => {
  const payload = {
    caption: values.caption,
    description: values.description,
    category: values.category,
    tags: values.tags,
    privacy: values.privacy,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  return payload.savedAt;
};

const clearDraft = () => {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
};

const formatBytes = (bytes) => {
  if (!bytes) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
};

const formatRelativeSave = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `Autosaved ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Calculating ETA";
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs} remaining`;
};

const createVideoId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `video-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildTrendingHint = (caption, tags, category) => {
  let score = 34;
  if (caption.trim().length >= 40) score += 18;
  if (tags.length >= 2) score += 20;
  if (category && category !== "Other") score += 12;
  return Math.min(score, 96);
};

const readVideoMetadata = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const metadata = {
        duration: Number(video.duration) || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("We could not read this video. Try another file."));
    };

    video.src = objectUrl;
  });

const createThumbnail = (file) =>
  new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const capture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const context = canvas.getContext("2d");
      if (!context) {
        cleanup();
        resolve("");
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.82);
      cleanup();
      resolve(image);
    };

    video.addEventListener(
      "loadeddata",
      () => {
        const seekTarget = Math.min(Math.max(video.duration * 0.2, 0.1), 1.5);
        if (Number.isFinite(seekTarget)) {
          video.currentTime = seekTarget;
        } else {
          capture();
        }
      },
      { once: true }
    );

    video.addEventListener("seeked", capture, { once: true });
    video.addEventListener(
      "error",
      () => {
        cleanup();
        resolve("");
      },
      { once: true }
    );

    video.src = objectUrl;
  });

const validateVideoFile = async (file) => {
  if (!file) {
    throw new Error("Select a video file to continue.");
  }

  if (!file.type.startsWith(ACCEPTED_MIME_PREFIX)) {
    throw new Error(`Unsupported file type. Use a video file such as ${ACCEPTED_LABEL}.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File is too large. The limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
  }

  const metadata = await readVideoMetadata(file);
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
    throw new Error("This video is missing duration metadata. Try exporting it again.");
  }

  if (metadata.duration > MAX_DURATION_SECONDS) {
    throw new Error(`Video is too long. Keep clips under ${MAX_DURATION_SECONDS} seconds.`);
  }

  return metadata;
};

const ensureFfmpeg = async () => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        if (ffmpegProgressHandler) ffmpegProgressHandler(progress);
      });

      const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });

      return ffmpeg;
    })();
  }

  return ffmpegPromise;
};

const compressVideoFile = async ({ file, onProgress }) => {
  const ffmpeg = await ensureFfmpeg();
  const inputExtension = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const inputName = `input-${Date.now()}.${inputExtension}`;
  const outputName = `output-${Date.now()}.mp4`;

  ffmpegProgressHandler = (progress) => {
    if (onProgress) {
      onProgress(Math.max(0.05, Math.min(progress || 0, 1)));
    }
  };

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      `scale=-2:${MAX_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      COMPRESSION_TARGET.crf,
      "-maxrate",
      COMPRESSION_TARGET.videoBitrate,
      "-bufsize",
      "3600k",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      COMPRESSION_TARGET.audioBitrate,
      "-movflags",
      "+faststart",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    return new File([data], `${file.name.replace(/\.[^.]+$/, "") || "clip"}.mp4`, {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } finally {
    ffmpegProgressHandler = null;
    try {
      await ffmpeg.deleteFile(inputName);
    } catch (_error) {}
    try {
      await ffmpeg.deleteFile(outputName);
    } catch (_error) {}
  }
};

const waitForAuthenticatedUser = async () => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error("Firebase is not configured yet. Add ZYRO_FIREBASE_CONFIG to enable posting.");
  }

  const { auth } = services;
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error("Sign in before posting a video."));
    }, 2500);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
};

const postVideoToFirebase = async ({ file, values, userId, onProgress }) => {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error("Firebase is not configured yet. Add ZYRO_FIREBASE_CONFIG to enable posting.");
  }

  const { storage, firestore } = services;
  const videoId = createVideoId();
  const storageRef = ref(storage, `epic-moments/${userId}/${videoId}.mp4`);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: "video/mp4",
    cacheControl: "public,max-age=3600",
  });

  const downloadURL = await new Promise((resolve, reject) => {
    const startedAt = Date.now();

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
        const speed = snapshot.bytesTransferred / elapsedSeconds;
        const etaSeconds =
          speed > 0 ? (snapshot.totalBytes - snapshot.bytesTransferred) / speed : Number.POSITIVE_INFINITY;

        if (onProgress) {
          onProgress({
            percent,
            etaSeconds,
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
          });
        }
      },
      (error) => reject(error),
      async () => {
        try {
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (error) {
          reject(error);
        }
      }
    );
  });

  await setDoc(doc(collection(firestore, "epicMoments"), videoId), {
    id: videoId,
    url: downloadURL,
    userId,
    caption: values.caption.trim(),
    description: values.description.trim(),
    tags: values.tags,
    category: values.category,
    likes: 0,
    views: 0,
    createdAt: serverTimestamp(),
  });

  return { downloadURL, videoId };
};

const UploadDropzone = ({
  dragging,
  file,
  previewUrl,
  status,
  progress,
  progressLabel,
  thumbnailUrl,
  validationSummary,
  compressedSize,
  onBrowse,
  onDrop,
  onDragState,
  onRemove,
}) => {
  const inputRef = useRef(null);

  return html`
    <section className="glass-panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent"></div>
      <div
        className=${[
          "group relative flex min-h-[340px] flex-col justify-between rounded-[28px] border border-dashed p-5 transition duration-300",
          dragging
            ? "border-amber-300/70 bg-amber-300/10 shadow-glow"
            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]",
        ].join(" ")}
        onClick=${() => {
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }}
        onDragEnter=${(event) => {
          event.preventDefault();
          onDragState(true);
        }}
        onDragOver=${(event) => {
          event.preventDefault();
          onDragState(true);
        }}
        onDragLeave=${(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget)) return;
          onDragState(false);
        }}
        onDrop=${(event) => {
          event.preventDefault();
          onDragState(false);
          const nextFile = event.dataTransfer?.files?.[0];
          if (nextFile) onDrop(nextFile);
        }}
      >
        <input
          ref=${inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange=${(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) onBrowse(nextFile);
          }}
        />

        <div className="space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/90 to-amber-300 text-black shadow-glow">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
              <path d="M12 16.5l4-4h-2.6V5h-2.8v7.5H8l4 4zm-7 2h14V21H5v-2.5z"></path>
            </svg>
          </div>
          <div>
            <h2 className="font-display text-2xl text-white">Upload your clip</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zyro-muted">
              Drag and drop your video here or click to upload. We validate the file first, then
              compress to a delivery-ready MP4 before posting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-zyro-muted">
            <span className="rounded-full border border-white/10 px-3 py-1">Supported ${ACCEPTED_LABEL}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              Max ${formatBytes(MAX_FILE_SIZE_BYTES)}
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              Up to ${MAX_DURATION_SECONDS}s
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          ${file &&
          html`
            <div className="rounded-3xl border border-white/10 bg-black/30 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_148px]">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                  ${previewUrl
                    ? html`
                        <video
                          className="aspect-[4/5] w-full object-cover"
                          src=${previewUrl}
                          controls
                          playsInline
                        ></video>
                      `
                    : html`<div className="aspect-[4/5] bg-white/[0.04]"></div>`}
                </div>
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                    ${thumbnailUrl
                      ? html`
                          <img
                            src=${thumbnailUrl}
                            alt="Generated thumbnail"
                            className="aspect-video w-full object-cover"
                          />
                        `
                      : html`
                          <div className="flex aspect-video items-center justify-center text-xs uppercase tracking-[0.18em] text-zyro-muted">
                            Preparing thumbnail
                          </div>
                        `}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="truncate text-sm font-medium text-white">${file.name}</div>
                    <div className="mt-1 text-xs text-zyro-muted">${formatBytes(file.size)}</div>
                    ${validationSummary &&
                    html`
                      <div className="mt-3 space-y-1 text-xs text-zyro-muted">
                        <div>Duration ${formatDuration(validationSummary.duration)}</div>
                        <div>
                          Resolution ${validationSummary.width || 0} x ${validationSummary.height || 0}
                        </div>
                        ${compressedSize
                          ? html`<div>Compressed ${formatBytes(compressedSize)}</div>`
                          : null}
                      </div>
                    `}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="chip-button"
                        onClick=${(event) => {
                          event.stopPropagation();
                          if (inputRef.current) inputRef.current.value = "";
                          inputRef.current?.click();
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="chip-button"
                        onClick=${(event) => {
                          event.stopPropagation();
                          onRemove();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `}

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-zyro-muted">
              <span>${status}</span>
              <span>${progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 transition-[width] duration-300"
                style=${{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="mt-3 text-xs text-zyro-muted">${progressLabel}</div>
          </div>
        </div>
      </div>
    </section>
  `;
};

const TagInput = ({ tags, onAddTag, onRemoveTag }) => {
  const [value, setValue] = useState("");

  const commit = () => {
    const next = value.trim().replace(/^#+/, "");
    if (!next) return;
    onAddTag(`#${next.toLowerCase()}`);
    setValue("");
  };

  return html`
    <div>
      <label className="subtle-label">Tags</label>
      <div className="input-shell min-h-[56px] py-2">
        <div className="flex flex-wrap items-center gap-2">
          ${tags.map(
            (tag) => html`
              <button
                key=${tag}
                type="button"
                className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-sm text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-300/15"
                onClick=${() => onRemoveTag(tag)}
              >
                ${tag} <span className="ml-1 text-amber-200/70">x</span>
              </button>
            `
          )}
          <input
            value=${value}
            className="min-w-[140px] flex-1 bg-transparent py-1 text-sm text-white outline-none placeholder:text-zyro-muted"
            placeholder="Add tags like #clutch"
            onInput=${(event) => setValue(event.currentTarget.value)}
            onKeyDown=${(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Backspace" && !value && tags.length > 0) {
                onRemoveTag(tags[tags.length - 1]);
              }
            }}
            onBlur=${commit}
          />
        </div>
      </div>
    </div>
  `;
};

const DetailsPanel = ({
  values,
  captionCount,
  deferredCaption,
  trendingScore,
  isPosting,
  isCompressing,
  message,
  onChange,
  onAddTag,
  onRemoveTag,
  onSubmit,
  onSaveDraft,
  onRetry,
  canPost,
  canRetry,
  validationError,
  savedAt,
}) => html`
  <section className="glass-panel p-5 sm:p-6">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl text-white">Details</h2>
        <p className="mt-2 text-sm text-zyro-muted">
          Keep it fast to scan. Strong captions and tags help the clip travel.
        </p>
      </div>
      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-right">
        <div className="text-[10px] uppercase tracking-[0.24em] text-amber-200/70">
          Trending Potential
        </div>
        <div className="mt-1 font-display text-2xl text-amber-200">${trendingScore}%</div>
      </div>
    </div>

    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="subtle-label !mb-0">Caption</label>
          <span
            className=${[
              "text-xs",
              captionCount > CAPTION_LIMIT ? "text-red-300" : "text-zyro-muted",
            ].join(" ")}
          >
            ${captionCount}/${CAPTION_LIMIT}
          </span>
        </div>
        <input
          name="caption"
          value=${values.caption}
          maxLength=${CAPTION_LIMIT}
          className="input-shell"
          placeholder="Orbital rush ace with no reload"
          onInput=${onChange}
        />
        <p className="mt-2 text-xs text-zyro-muted">
          ${deferredCaption
            ? `Current tone: ${deferredCaption.length >= 40 ? "strong hook" : "try a punchier opener"}`
            : "Lead with the strongest moment in the clip."}
        </p>
      </div>

      <div>
        <label className="subtle-label">Description</label>
        <textarea
          name="description"
          rows="4"
          value=${values.description}
          className="input-shell resize-none"
          placeholder="Optional context, loadout, or what made the play special."
          onInput=${onChange}
        ></textarea>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="subtle-label">Category</label>
          <select
            name="category"
            className="input-shell"
            value=${values.category}
            onChange=${onChange}
          >
            <option value="">Select category</option>
            ${categoryOptions.map(
              (option) => html`<option key=${option} value=${option}>${option}</option>`
            )}
          </select>
        </div>

        <div>
          <label className="subtle-label">Privacy</label>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            ${privacyOptions.map(
              (option) => html`
                <button
                  key=${option}
                  type="button"
                  className=${[
                    "rounded-2xl px-4 py-3 text-sm transition",
                    values.privacy === option
                      ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.18)]"
                      : "text-zyro-muted hover:text-white",
                  ].join(" ")}
                  onClick=${() => onChange({ currentTarget: { name: "privacy", value: option } })}
                >
                  ${option}
                </button>
              `
            )}
          </div>
        </div>
      </div>

      ${html`<${TagInput} tags=${values.tags} onAddTag=${onAddTag} onRemoveTag=${onRemoveTag} />`}

      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-sm text-cyan-100">
        <div className="font-medium">Upload guardrails</div>
        <p className="mt-1 text-cyan-100/75">
          Clips over ${MAX_DURATION_SECONDS} seconds or ${formatBytes(MAX_FILE_SIZE_BYTES)} are blocked before upload.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zyro-muted">
        <div className="font-medium text-white">
          ${isCompressing ? "Compressing video" : isPosting ? "Uploading to Firebase" : "Ready to publish"}
        </div>
        <p className="mt-1">
          ${validationError
            ? validationError
            : isCompressing
              ? "We are converting to MP4, trimming resolution to 720p, and optimizing bitrate."
              : isPosting
                ? "Upload progress and ETA update live while the file is being sent."
                : savedAt || "Drafts autosave locally while you type."}
        </p>
      </div>

      ${message &&
      html`
        <div
          className=${[
            "rounded-2xl border px-4 py-3 text-sm",
            message.type === "error"
              ? "border-red-400/20 bg-red-400/10 text-red-100"
              : message.type === "success"
                ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                : "border-white/10 bg-white/[0.03] text-zyro-muted",
          ].join(" ")}
        >
          ${message.text}
        </div>
      `}
    </div>

    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        disabled=${!canPost || isPosting || isCompressing}
        className=${[
          "flex-1 rounded-2xl px-5 py-4 font-medium transition",
          !canPost || isPosting || isCompressing
            ? "cursor-not-allowed bg-white/10 text-white/40"
            : "bg-gradient-to-r from-red-500 via-orange-500 to-amber-300 text-black shadow-glow hover:-translate-y-0.5",
        ].join(" ")}
        onClick=${onSubmit}
      >
        ${isCompressing ? "Compressing..." : isPosting ? "Uploading..." : "Post Video"}
      </button>
      <button
        type="button"
        className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 font-medium text-white transition hover:border-white/20 hover:bg-white/[0.06]"
        onClick=${onSaveDraft}
      >
        Save as Draft
      </button>
      ${canRetry
        ? html`
            <button
              type="button"
              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 font-medium text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-300/15"
              onClick=${onRetry}
            >
              Retry Upload
            </button>
          `
        : null}
    </div>
  </section>
`;

const App = () => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Waiting for video");
  const [status, setStatus] = useState("Waiting for video");
  const [isPosting, setIsPosting] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [message, setMessage] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [validationSummary, setValidationSummary] = useState(null);
  const [compressedSize, setCompressedSize] = useState(0);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [values, setValues] = useState(defaultValues);

  const deferredCaption = useDeferredValue(values.caption);
  const validationRunRef = useRef(0);
  const hasHydratedDraft = useRef(false);

  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setValues((current) => ({ ...current, ...draft }));
      setDraftSavedAt(draft.savedAt || "");
    }
    hasHydratedDraft.current = true;
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!hasHydratedDraft.current) return;
    const savedAt = writeDraft(values);
    setDraftSavedAt(savedAt);
  }, [values]);

  const captionCount = values.caption.length;
  const trendingScore = useMemo(
    () => buildTrendingHint(values.caption, values.tags, values.category),
    [values.caption, values.tags, values.category]
  );

  const canPost =
    Boolean(file) &&
    !validationError &&
    Boolean(validationSummary) &&
    Boolean(values.caption.trim()) &&
    Boolean(values.category) &&
    captionCount <= CAPTION_LIMIT &&
    !isPosting &&
    !isCompressing;

  const resetUploadState = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl("");
    setThumbnailUrl("");
    setValidationSummary(null);
    setValidationError("");
    setCompressedSize(0);
    setProgress(0);
    setProgressLabel("Waiting for video");
    setStatus("Waiting for video");
  };

  const applyFile = async (nextFile) => {
    if (!nextFile) return;

    const runId = ++validationRunRef.current;
    setMessage(null);
    setValidationError("");
    setCompressedSize(0);
    setStatus("Validating video");
    setProgress(8);
    setProgressLabel("Checking file size and duration");

    try {
      const metadata = await validateVideoFile(nextFile);
      const [nextThumbnail] = await Promise.all([createThumbnail(nextFile)]);
      const nextPreviewUrl = URL.createObjectURL(nextFile);

      if (validationRunRef.current !== runId) {
        URL.revokeObjectURL(nextPreviewUrl);
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);

      startTransition(() => {
        setFile(nextFile);
        setPreviewUrl(nextPreviewUrl);
        setThumbnailUrl(nextThumbnail);
        setValidationSummary(metadata);
        setProgress(100);
        setStatus("Video ready");
        setProgressLabel("Validation passed. Ready for compression and upload.");
      });
    } catch (error) {
      console.error("Video validation failed:", error);
      if (validationRunRef.current !== runId) return;
      resetUploadState();
      setValidationError(error.message || "This file failed validation.");
      setMessage({
        type: "error",
        text: error.message || "This file failed validation.",
      });
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.currentTarget;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const handleAddTag = (tag) => {
    setValues((current) => {
      if (current.tags.includes(tag) || current.tags.length >= 5) return current;
      return { ...current, tags: [...current.tags, tag] };
    });
  };

  const handleRemoveTag = (tag) => {
    setValues((current) => ({
      ...current,
      tags: current.tags.filter((item) => item !== tag),
    }));
  };

  const handleSaveDraft = () => {
    const savedAt = writeDraft(values);
    setDraftSavedAt(savedAt);
    setMessage({
      type: "success",
      text: "Draft saved locally. Your caption, tags, and category will be restored on reload.",
    });
  };

  const handleSubmit = async () => {
    if (!canPost || !file || !validationSummary) return;

    try {
      const user = await waitForAuthenticatedUser();

      setIsCompressing(true);
      setStatus("Compressing video");
      setProgress(0);
      setProgressLabel("Preparing MP4 for upload");
      setMessage({ type: "info", text: "Compressing your clip before upload..." });

      const compressedFile = await compressVideoFile({
        file,
        onProgress: (fraction) => {
          setProgress(Math.round(fraction * 100));
          setProgressLabel("Compressing to 720p MP4");
        },
      });

      setCompressedSize(compressedFile.size);
      setIsCompressing(false);
      setIsPosting(true);
      setStatus("Uploading to Firebase");
      setProgress(0);
      setProgressLabel("Starting upload");
      setMessage({ type: "info", text: "Uploading your Epic Moment..." });

      await postVideoToFirebase({
        file: compressedFile,
        values,
        userId: user.uid,
        onProgress: ({ percent, etaSeconds }) => {
          setProgress(percent);
          setProgressLabel(`${percent}% uploaded · ${formatEta(etaSeconds)}`);
        },
      });

      clearDraft();
      setDraftSavedAt("");
      resetUploadState();
      setValues(defaultValues);
      setMessage({ type: "success", text: "🚀 Your moment is live!" });
      setStatus("Upload complete");
      setProgress(100);
      setProgressLabel("Upload finished");

      if (SUCCESS_REDIRECT_URL) {
        window.setTimeout(() => {
          window.location.href = SUCCESS_REDIRECT_URL;
        }, SUCCESS_REDIRECT_DELAY_MS);
      }
    } catch (error) {
      console.error("Video upload failed:", error);
      setStatus("Upload failed");
      setProgressLabel("Upload interrupted. You can retry.");
      setMessage({
        type: "error",
        text: error?.message || "Posting failed. Check Firebase config and try again.",
      });
    } finally {
      setIsCompressing(false);
      setIsPosting(false);
    }
  };

  return html`
    <div className="grid gap-6 lg:gap-8">
      <section className="glass-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-amber-200/70">Upload Epic Moment</p>
            <h1 className="mt-3 font-display text-3xl text-white sm:text-5xl">
              Share your best gameplay highlights
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zyro-muted sm:text-base">
              A polished creator flow for short-form clips. Validate early, compress in the browser,
              and publish into an auth-safe Firebase path built for growth.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zyro-muted">Formats</div>
              <div className="mt-1 font-display text-lg text-white">${ACCEPTED_LABEL}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zyro-muted">Storage</div>
              <div className="mt-1 text-sm text-white">
                ${isFirebaseConfigured() ? "Firebase ready" : "Add Firebase config"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8">
        <${UploadDropzone}
          dragging=${dragging}
          file=${file}
          previewUrl=${previewUrl}
          progress=${progress}
          progressLabel=${progressLabel}
          status=${status}
          thumbnailUrl=${thumbnailUrl}
          validationSummary=${validationSummary}
          compressedSize=${compressedSize}
          onBrowse=${applyFile}
          onDrop=${applyFile}
          onDragState=${setDragging}
          onRemove=${resetUploadState}
        />
        <${DetailsPanel}
          values=${values}
          captionCount=${captionCount}
          deferredCaption=${deferredCaption}
          trendingScore=${trendingScore}
          isPosting=${isPosting}
          isCompressing=${isCompressing}
          message=${message}
          validationError=${validationError}
          savedAt=${formatRelativeSave(draftSavedAt)}
          onChange=${handleChange}
          onAddTag=${handleAddTag}
          onRemoveTag=${handleRemoveTag}
          onSubmit=${handleSubmit}
          onRetry=${handleSubmit}
          onSaveDraft=${handleSaveDraft}
          canPost=${canPost}
          canRetry=${Boolean(file) && Boolean(message?.type === "error")}
        />
      </div>
    </div>
  `;
};

const container = document.getElementById("upload-root");
if (container) {
  createRoot(container).render(html`<${App} />`);
}
