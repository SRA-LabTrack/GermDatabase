import "./backgroundSlideshow.css";

const BUILTIN_SLIDES = [
  {
    "id": "builtin-01",
    "name": "20190520_110554.jpg",
    "src": "/canesprout-backgrounds/bg-01.webp",
    "width": 1920,
    "height": 1440,
    "builtin": true
  },
  {
    "id": "builtin-02",
    "name": "20190520_111008.jpg",
    "src": "/canesprout-backgrounds/bg-02.webp",
    "width": 1920,
    "height": 1257,
    "builtin": true
  },
  {
    "id": "builtin-03",
    "name": "20190624_151509-011.jpeg",
    "src": "/canesprout-backgrounds/bg-03.webp",
    "width": 1920,
    "height": 420,
    "builtin": true
  },
  {
    "id": "builtin-04",
    "name": "DSC_0372.JPG",
    "src": "/canesprout-backgrounds/bg-04.webp",
    "width": 1920,
    "height": 1280,
    "builtin": true
  },
  {
    "id": "builtin-05",
    "name": "IMG_20210506_083103.jpg",
    "src": "/canesprout-backgrounds/bg-05.webp",
    "width": 1920,
    "height": 1440,
    "builtin": true
  },
  {
    "id": "builtin-06",
    "name": "IMG_20210506_083258.jpg",
    "src": "/canesprout-backgrounds/bg-06.webp",
    "width": 1920,
    "height": 1440,
    "builtin": true
  },
  {
    "id": "builtin-07",
    "name": "IMG_20210701_094140.jpg",
    "src": "/canesprout-backgrounds/bg-07.webp",
    "width": 1920,
    "height": 1440,
    "builtin": true
  },
  {
    "id": "builtin-08",
    "name": "IMG_20220325_072405.jpg",
    "src": "/canesprout-backgrounds/bg-08.webp",
    "width": 1920,
    "height": 1440,
    "builtin": true
  }
];
const DEFAULT_SELECTION = ["builtin-05", "builtin-07", "builtin-08"];
const MAX_ACTIVE = 10;
const CHANGE_EVERY_MS = 5000;
const CROSS_FADE_MS = 2500;
const MAX_LONG_EDGE = 1920;
const WEBP_QUALITY = 0.78;
const JPEG_QUALITY = 0.80;

const DB_NAME = "canesprout-background-slideshow-v281";
const DB_STORE = "settings";
const DB_KEY = "background-state";

const state = {
  selectedIds: [],
  customSlides: [],
  currentIndex: 0,
  timer: null,
  mounted: false,
};

function openDatabase() {
  if (!("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open background storage."));
  });
}

async function loadSavedState() {
  try {
    const db = await openDatabase();
    if (!db) return null;

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const request = store.get(DB_KEY);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not load background settings."));
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch (error) {
    console.warn("CaneSprout background settings could not be loaded:", error);
    return null;
  }
}

async function saveState() {
  try {
    const db = await openDatabase();
    if (!db) return;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(
        {
          selectedIds: state.selectedIds.slice(0, MAX_ACTIVE),
          customSlides: state.customSlides,
        },
        DB_KEY,
      );

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Could not save background settings."));
      };
    });
  } catch (error) {
    console.warn("CaneSprout background settings could not be saved:", error);
  }
}

function allSlides() {
  return [...BUILTIN_SLIDES, ...state.customSlides];
}

function activeSlides() {
  const library = new Map(allSlides().map((slide) => [slide.id, slide]));
  return state.selectedIds
    .map((id) => library.get(id))
    .filter(Boolean)
    .slice(0, MAX_ACTIVE);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}.`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not encode compressed image."));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }

  const image = await fileToImage(file);
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  if (!naturalWidth || !naturalHeight) {
    throw new Error(`${file.name} has invalid dimensions.`);
  }

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot optimize images.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  }
  if (!blob) throw new Error(`Could not compress ${file.name}.`);

  return {
    id: globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    src: await blobToDataUrl(blob),
    width,
    height,
    builtin: false,
    originalBytes: file.size,
    compressedBytes: blob.size,
  };
}

function preloadSlide(slide) {
  if (!slide?.src) return;
  const image = new Image();
  image.decoding = "async";
  image.src = slide.src;
}

function preloadActiveSlides() {
  activeSlides().forEach(preloadSlide);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function startTimer() {
  stopTimer();
  if (activeSlides().length <= 1) return;

  state.timer = window.setInterval(() => {
    setCurrentSlide(state.currentIndex + 1);
  }, CHANGE_EVERY_MS);
}

function fitModeFor() {
  // v2.8.5: Windows-style wallpaper fill. Always crop proportionally to the
  // viewport instead of letterboxing extreme aspect ratios.
  return "fill";
}

function populateFrame(frame, slide) {
  const ambient = frame.querySelector(".cs-bg-ambient");
  const foreground = frame.querySelector(".cs-bg-foreground");

  if (!slide) {
    frame.hidden = true;
    ambient.removeAttribute("src");
    foreground.removeAttribute("src");
    return;
  }

  frame.hidden = false;
  frame.dataset.fit = fitModeFor(slide);

  if (ambient.getAttribute("src") !== slide.src) ambient.src = slide.src;
  if (foreground.getAttribute("src") !== slide.src) foreground.src = slide.src;

  foreground.onerror = () => {
    console.error("CaneSprout background image failed to load:", slide.src);
  };
}

function setCurrentSlide(index, { immediate = false } = {}) {
  const slides = activeSlides();
  const frames = [...document.querySelectorAll(".cs-bg-frame")];

  if (!slides.length) {
    frames.forEach((frame) => {
      frame.hidden = true;
      frame.classList.remove("cs-bg-frame--active");
    });
    return;
  }

  state.currentIndex = ((index % slides.length) + slides.length) % slides.length;

  // Preload the next frame before fading so the cross-fade never flashes blank.
  preloadSlide(slides[(state.currentIndex + 1) % slides.length]);

  frames.forEach((frame, frameIndex) => {
    const slide = slides[frameIndex];
    populateFrame(frame, slide);

    if (immediate) frame.classList.add("cs-bg-frame--instant");
    frame.classList.toggle("cs-bg-frame--active", frameIndex === state.currentIndex);

    if (immediate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => frame.classList.remove("cs-bg-frame--instant"));
      });
    }
  });

  renderDots();
}

function refreshSlideshow({ immediate = false } = {}) {
  const slides = activeSlides();
  const background = document.getElementById("cs-background-slideshow");
  if (!background) return;

  background.classList.toggle("cs-background-slideshow--empty", slides.length === 0);
  state.currentIndex = Math.min(state.currentIndex, Math.max(0, slides.length - 1));

  setCurrentSlide(state.currentIndex, { immediate });
  startTimer();
  renderGallery();
}

function renderDots() {
  const dots = document.getElementById("cs-bg-dots");
  if (!dots) return;

  const slides = activeSlides();
  dots.innerHTML = "";

  if (slides.length <= 1) return;

  slides.forEach((slide, index) => {
    const dot = document.createElement("span");
    dot.className = "cs-bg-dot";
    dot.classList.toggle("cs-bg-dot--active", index === state.currentIndex);
    dot.title = slide.name;
    dots.appendChild(dot);
  });
}

function setStatus(message, tone = "neutral") {
  const status = document.getElementById("cs-bg-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function renderGallery() {
  const gallery = document.getElementById("cs-bg-gallery");
  const count = document.getElementById("cs-bg-count");
  if (!gallery) return;

  const slides = allSlides();
  gallery.innerHTML = "";

  if (count) count.textContent = `${state.selectedIds.length} / ${MAX_ACTIVE} selected`;

  slides.forEach((slide) => {
    const selected = state.selectedIds.includes(slide.id);

    const item = document.createElement("article");
    item.className = "cs-bg-library-item";
    item.classList.toggle("cs-bg-library-item--selected", selected);

    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "cs-bg-library-choice";
    choose.dataset.slideId = slide.id;
    choose.setAttribute("aria-pressed", selected ? "true" : "false");

    const image = document.createElement("img");
    image.src = slide.src;
    image.alt = slide.name;
    image.loading = "lazy";

    const shade = document.createElement("span");
    shade.className = "cs-bg-library-shade";

    const check = document.createElement("span");
    check.className = "cs-bg-library-check";
    check.textContent = selected ? "✓" : "+";

    const name = document.createElement("span");
    name.className = "cs-bg-library-name";
    name.textContent = slide.name;

    choose.append(image, shade, check, name);
    item.appendChild(choose);

    if (!slide.builtin) {
      const meta = document.createElement("div");
      meta.className = "cs-bg-custom-meta";

      const compression = document.createElement("span");
      compression.textContent = slide.compressedBytes
        ? `${formatBytes(slide.compressedBytes)} optimized`
        : "Custom photo";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cs-bg-delete-custom";
      remove.dataset.deleteSlideId = slide.id;
      remove.textContent = "Delete";

      meta.append(compression, remove);
      item.appendChild(meta);
    }

    gallery.appendChild(item);
  });
}

async function toggleSelection(id) {
  const index = state.selectedIds.indexOf(id);

  if (index >= 0) {
    state.selectedIds.splice(index, 1);
  } else {
    if (state.selectedIds.length >= MAX_ACTIVE) {
      setStatus(`You can select a maximum of ${MAX_ACTIVE} slideshow photos.`, "error");
      return;
    }
    state.selectedIds.push(id);
  }

  state.currentIndex = 0;
  await saveState();
  refreshSlideshow({ immediate: true });

  setStatus(
    state.selectedIds.length === MAX_ACTIVE
      ? `${MAX_ACTIVE} photos selected. Slideshow changes every ${CHANGE_EVERY_MS / 1000} seconds.`
      : `Select up to ${MAX_ACTIVE - state.selectedIds.length} more photo${MAX_ACTIVE - state.selectedIds.length === 1 ? "" : "s"}.`,
    "success",
  );
}

async function importFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    setStatus("Choose image files to import.", "error");
    return;
  }

  try {
    for (let index = 0; index < files.length; index += 1) {
      setStatus(`Optimizing ${index + 1} / ${files.length}: ${files[index].name}`);
      const slide = await compressImage(files[index]);
      state.customSlides.push(slide);
    }

    await saveState();
    renderGallery();
    setStatus(`Imported and compressed ${files.length} photo${files.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Could not import the selected photos.", "error");
  }
}

async function deleteCustomSlide(id) {
  state.customSlides = state.customSlides.filter((slide) => slide.id !== id);
  state.selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
  state.currentIndex = 0;
  await saveState();
  refreshSlideshow({ immediate: true });
  setStatus("Custom background deleted.", "success");
}

function openModal() {
  const modal = document.getElementById("cs-bg-modal");
  if (!modal) return;

  renderGallery();
  setStatus(
    state.selectedIds.length === MAX_ACTIVE
      ? `${MAX_ACTIVE} photos selected. They transition every ${CHANGE_EVERY_MS / 1000} seconds.`
      : `Select up to ${MAX_ACTIVE} photos.`,
  );

  modal.hidden = false;
  document.body.classList.add("cs-bg-modal-open");
  document.getElementById("cs-bg-import")?.focus();
}

function closeModal() {
  const modal = document.getElementById("cs-bg-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("cs-bg-modal-open");
}

function buildDom() {
  if (document.getElementById("cs-background-slideshow")) return;

  document.documentElement.classList.add("cs-background-enabled");
  document.body.classList.add("cs-background-enabled");
  document.getElementById("root")?.classList.add("cs-background-root");

  const background = document.createElement("div");
  background.id = "cs-background-slideshow";
  background.className = "cs-background-slideshow";
  background.setAttribute("aria-hidden", "true");

  for (let index = 0; index < MAX_ACTIVE; index += 1) {
    const frame = document.createElement("div");
    frame.className = "cs-bg-frame";
    frame.hidden = true;

    const ambient = document.createElement("img");
    ambient.className = "cs-bg-ambient";
    ambient.alt = "";
    ambient.decoding = "async";
    ambient.draggable = false;

    const foreground = document.createElement("img");
    foreground.className = "cs-bg-foreground";
    foreground.alt = "";
    foreground.decoding = "async";
    foreground.draggable = false;

    frame.append(ambient, foreground);
    background.appendChild(frame);
  }

  const veil = document.createElement("div");
  veil.className = "cs-bg-veil";

  const dots = document.createElement("div");
  dots.id = "cs-bg-dots";
  dots.className = "cs-bg-dots";

  background.append(veil, dots);

  const settingsButton = document.createElement("button");
  settingsButton.id = "cs-bg-settings-button";
  settingsButton.type = "button";
  settingsButton.className = "cs-bg-settings-button";
  settingsButton.setAttribute("aria-label", "Background slideshow settings");
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13Zm2 11.75h12l-3.7-4.5-2.45 2.85-1.75-1.9L6 17.25Zm9.9-7.9a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z"/>
    </svg>
    <span>Background</span>
  `;

  const modal = document.createElement("div");
  modal.id = "cs-bg-modal";
  modal.className = "cs-bg-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="cs-bg-backdrop" data-bg-close="true"></div>
    <section class="cs-bg-panel" role="dialog" aria-modal="true" aria-labelledby="cs-bg-title">
      <header class="cs-bg-panel-header">
        <div>
          <p class="cs-bg-kicker">Appearance</p>
          <h2 id="cs-bg-title">Background slideshow</h2>
          <p>Select up to ten photos. They smoothly fade into one another every 5 seconds and always fill the current screen without stretching.</p>
        </div>
        <button type="button" class="cs-bg-close" id="cs-bg-close" aria-label="Close">×</button>
      </header>

      <div class="cs-bg-toolbar">
        <div>
          <strong>Your background library</strong>
          <small id="cs-bg-count">0 / 10 selected</small>
        </div>
        <div class="cs-bg-toolbar-actions">
          <input id="cs-bg-file-input" class="cs-bg-file-input" type="file" accept="image/*" multiple />
          <button type="button" class="cs-bg-primary" id="cs-bg-import">Add photos</button>
          <button type="button" class="cs-bg-secondary" id="cs-bg-reset">Use default 3</button>
        </div>
      </div>

      <div class="cs-bg-gallery" id="cs-bg-gallery"></div>

      <div class="cs-bg-fit-note">
        <strong>Full-screen fill:</strong> every photo keeps its original proportions, gently zooms to fill the device, and smoothly fades into the next image.
      </div>

      <div class="cs-bg-status" id="cs-bg-status" role="status" aria-live="polite"></div>
    </section>
  `;

  document.body.append(background, settingsButton, modal);

  settingsButton.addEventListener("click", openModal);
  modal.querySelector("#cs-bg-close")?.addEventListener("click", closeModal);
  modal.querySelector("[data-bg-close='true']")?.addEventListener("click", closeModal);

  const input = modal.querySelector("#cs-bg-file-input");
  modal.querySelector("#cs-bg-import")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async (event) => {
    if (event.currentTarget.files) await importFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  });

  modal.querySelector("#cs-bg-reset")?.addEventListener("click", async () => {
    state.selectedIds = [...DEFAULT_SELECTION];
    state.currentIndex = 0;
    await saveState();
    refreshSlideshow({ immediate: true });
    setStatus("Default three sugarcane backgrounds restored.", "success");
  });

  modal.querySelector("#cs-bg-gallery")?.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete-slide-id]");
    if (deleteButton) {
      await deleteCustomSlide(deleteButton.dataset.deleteSlideId);
      return;
    }

    const choice = event.target.closest("[data-slide-id]");
    if (choice) await toggleSelection(choice.dataset.slideId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopTimer();
    else startTimer();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setCurrentSlide(state.currentIndex, { immediate: true }), 120);
  });
}

async function mount() {
  if (state.mounted) return;
  state.mounted = true;

  buildDom();

  const saved = await loadSavedState();
  if (saved) {
    state.customSlides = Array.isArray(saved.customSlides) ? saved.customSlides : [];
    state.selectedIds = Array.isArray(saved.selectedIds) ? saved.selectedIds.slice(0, MAX_ACTIVE) : [];
  }

  const validIds = new Set(allSlides().map((slide) => slide.id));
  state.selectedIds = state.selectedIds.filter((id) => validIds.has(id)).slice(0, MAX_ACTIVE);

  if (!state.selectedIds.length) {
    state.selectedIds = [...DEFAULT_SELECTION];
    await saveState();
  }

  preloadActiveSlides();
  refreshSlideshow({ immediate: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}

if (import.meta.hot) {
  import.meta.hot.dispose(stopTimer);
}

export {};
