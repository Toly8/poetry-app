let db;

const API_BASE_URL = "https://example.com/api/poems";
const DB_NAME = "PoetryDB";
const DB_VERSION = 2;
const POEMS_STORE = "poems";
const OUTBOX_STORE = "outbox";

const defaultSettings = {
  fontSize: 18,
  fontFamily: "system",
  readingMode: false,
  readonlyMode: false,
  darkTheme: false
};

let uiSettings = { ...defaultSettings };
let readerOverlayState = { open: false, startX: null };

const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = event => {
  db = event.target.result;

  if (!db.objectStoreNames.contains(POEMS_STORE)) {
    db.createObjectStore(POEMS_STORE, { keyPath: "id", autoIncrement: true });
  }

  if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
    db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = event => {
  db = event.target.result;
  loadSettings();
  applySettings();
  updateConnectionStatus();
  initPage();
  syncOutbox();
};

request.onerror = () => {
  console.error("Не удалось открыть базу данных");
};

function initPage() {
  const page = document.body.dataset.page;

  if (page === "create") {
    document.getElementById("save-poem")?.addEventListener("click", savePoem);
  }

  if (page === "collection") {
    document.getElementById("search")?.addEventListener("input", loadCollection);
    setupReaderOverlay();
    loadCollection();
  }

  if (page === "reader") {
    setupReaderControls();
  }
}

function setupReaderControls() {
  const decrease = document.getElementById("font-decrease");
  const increase = document.getElementById("font-increase");
  const family = document.getElementById("font-family");
  const readingMode = document.getElementById("reading-mode");
  const readonlyMode = document.getElementById("readonly-mode");
  const darkTheme = document.getElementById("dark-theme");

  if (decrease) {
    decrease.addEventListener("click", () => {
      uiSettings.fontSize = Math.max(14, uiSettings.fontSize - 1);
      persistAndApplySettings();
    });
  }

  if (increase) {
    increase.addEventListener("click", () => {
      uiSettings.fontSize = Math.min(30, uiSettings.fontSize + 1);
      persistAndApplySettings();
    });
  }

  if (family) {
    family.value = uiSettings.fontFamily;
    family.addEventListener("change", () => {
      uiSettings.fontFamily = family.value;
      persistAndApplySettings();
    });
  }

  if (readingMode) {
    readingMode.checked = uiSettings.readingMode;
    readingMode.addEventListener("change", () => {
      uiSettings.readingMode = readingMode.checked;
      persistAndApplySettings();
    });
  }

  if (readonlyMode) {
    readonlyMode.checked = uiSettings.readonlyMode;
    readonlyMode.addEventListener("change", () => {
      uiSettings.readonlyMode = readonlyMode.checked;
      persistAndApplySettings();
    });
  }

  if (darkTheme) {
    darkTheme.checked = uiSettings.darkTheme;
    darkTheme.addEventListener("change", () => {
      uiSettings.darkTheme = darkTheme.checked;
      persistAndApplySettings();
    });
  }
}

function setupReaderOverlay() {
  const overlay = document.getElementById("reader-overlay");
  const sheet = document.getElementById("reader-sheet");
  const closeButton = document.getElementById("reader-close");
  const top = document.getElementById("reader-top");

  if (!overlay || !sheet || !closeButton || !top) {
    return;
  }

  closeButton.addEventListener("click", () => {
    if (!closeButton.disabled) {
      closeReaderOverlay();
    }
  });

  sheet.addEventListener("scroll", () => {
    const atTop = sheet.scrollTop < 8;
    closeButton.disabled = !atTop;
    top.classList.toggle("is-hidden", sheet.scrollTop > 60);
  });

  sheet.addEventListener("touchstart", event => {
    readerOverlayState.startX = event.changedTouches[0].clientX;
  }, { passive: true });

  sheet.addEventListener("touchend", event => {
    const startX = readerOverlayState.startX;
    if (typeof startX !== "number") {
      return;
    }

    const endX = event.changedTouches[0].clientX;
    const deltaX = endX - startX;

    if (deltaX > 90) {
      closeReaderOverlay();
    }

    readerOverlayState.startX = null;
  }, { passive: true });
}

function openReaderOverlay(poem) {
  const overlay = document.getElementById("reader-overlay");
  const sheet = document.getElementById("reader-sheet");
  const title = document.getElementById("reader-title");
  const author = document.getElementById("reader-author");
  const content = document.getElementById("reader-content");
  const closeButton = document.getElementById("reader-close");
  const top = document.getElementById("reader-top");

  if (!overlay || !sheet || !title || !author || !content || !closeButton || !top) {
    return;
  }

  title.textContent = poem.title;
  author.textContent = poem.author || "Без автора";
  content.innerHTML = `<pre>${escapeHtml(poem.poem)}</pre>`;

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("reader-open");
  sheet.scrollTop = 0;
  top.classList.remove("is-hidden");
  closeButton.disabled = false;
  readerOverlayState.open = true;

  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function closeReaderOverlay() {
  const overlay = document.getElementById("reader-overlay");
  if (!overlay || !readerOverlayState.open) {
    return;
  }

  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("reader-open");
  readerOverlayState.open = false;

  setTimeout(() => {
    overlay.classList.add("hidden");
  }, 220);
}

function getPoemPreview(poemText) {
  const source = String(poemText || "").trim();
  const lines = source.split("\n").map(line => line.trim()).filter(Boolean);
  const previewLines = lines.slice(0, 3);
  let previewText = previewLines.join("\n");

  const fullNormalized = lines.join("\n");
  const previewNormalized = previewLines.join("\n");
  const isTruncated = lines.length > 3 || source.length > previewText.length || fullNormalized.length > previewNormalized.length;

  if (isTruncated && previewText) {
    previewText = `${previewText}...`;
  }

  return { previewText, isTruncated };
}

function savePoem() {
  const titleInput = document.getElementById("title");
  const authorInput = document.getElementById("author");
  const poemInput = document.getElementById("poem");

  if (!titleInput || !authorInput || !poemInput || !db) {
    return;
  }

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();
  const poem = poemInput.value.trim();

  if (!title || !poem) {
    return;
  }

  const poemRecord = { title, author, poem, updatedAt: Date.now() };
  const tx = db.transaction([POEMS_STORE, OUTBOX_STORE], "readwrite");
  const addPoemRequest = tx.objectStore(POEMS_STORE).add(poemRecord);

  addPoemRequest.onsuccess = event => {
    tx.objectStore(OUTBOX_STORE).add({
      type: "add",
      localId: event.target.result,
      payload: poemRecord,
      createdAt: Date.now()
    });
  };

  tx.oncomplete = () => {
    titleInput.value = "";
    authorInput.value = "";
    poemInput.value = "";
    syncOutbox();
  };
}

async function loadCollection() {
  if (!db) {
    return;
  }

  const container = document.getElementById("poems");
  if (!container) {
    return;
  }

  const query = (document.getElementById("search")?.value || "").trim().toLowerCase();

  const poems = await getAllPoems();
  const filtered = poems
    .filter(item => {
      if (!query) {
        return true;
      }
      return item.title.toLowerCase().includes(query)
        || (item.author || "").toLowerCase().includes(query)
        || item.poem.toLowerCase().includes(query);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  renderCollection(container, filtered, query);
}

function renderCollection(container, poems, query) {
  container.innerHTML = "";

  if (!poems.length) {
    container.innerHTML = query
      ? '<p class="empty">Ничего не найдено по вашему запросу.</p>'
      : '<p class="empty">✨ Пока пусто. Добавьте первое стихотворение на вкладке «Добавить».</p>';
    return;
  }

  poems.forEach(item => {
    const authorLine = item.author ? `<p class="poem-author">${escapeHtml(item.author)}</p>` : "";
    const { previewText, isTruncated } = getPoemPreview(item.poem);
    const preview = escapeHtml(previewText);
    const actionsMarkup = uiSettings.readonlyMode
      ? ""
      : `
      <div class="card-actions">
        <button class="secondary" onclick="event.stopPropagation(); startEditPoem(${item.id})">Редактировать</button>
        <button class="danger" onclick="event.stopPropagation(); deletePoem(${item.id})">Удалить</button>
      </div>
      <form id="edit-form-${item.id}" class="edit-form hidden" onsubmit="submitEdit(event, ${item.id})">
        <label class="input-group">
          <span>Название</span>
          <input id="edit-title-${item.id}" value="${escapeAttribute(item.title)}" required>
        </label>
        <label class="input-group">
          <span>Автор</span>
          <input id="edit-author-${item.id}" value="${escapeAttribute(item.author || "")}">
        </label>
        <label class="input-group">
          <span>Текст</span>
          <textarea id="edit-poem-${item.id}" required>${escapeHtml(item.poem)}</textarea>
        </label>
        <div class="card-actions">
          <button class="primary" type="submit">Сохранить изменения</button>
          <button class="ghost" type="button" onclick="event.stopPropagation(); cancelEditPoem(${item.id})">Отмена</button>
        </div>
      </form>`;

    const card = document.createElement("article");
    card.className = "poem-card preview-card";
    card.innerHTML = `
      <div class="card-head">
        <h3>${escapeHtml(item.title)}</h3>
        ${authorLine}
      </div>
      <div class="preview-block">
        <p class="preview-label">Краткий фрагмент (предпросмотр)</p>
        <pre class="preview-text">${preview}</pre>
        ${isTruncated ? '<p class="ellipsis-hint">Есть продолжение...</p>' : ''}
      </div>
      <div class="preview-divider"></div>
      <button class="read-more-btn primary" type="button" onclick="event.stopPropagation(); openPoemReader(${item.id})">📖 Читать полностью</button>
      ${actionsMarkup}
    `;

    card.addEventListener("click", event => {
      if (event.target.closest("button") || event.target.closest("form") || event.target.closest("input") || event.target.closest("textarea")) {
        return;
      }
      openPoemReader(item.id);
    });

    container.appendChild(card);
  });
}

function openPoemReader(id) {
  getAllPoems().then(poems => {
    const poem = poems.find(item => item.id === id);
    if (poem) {
      openReaderOverlay(poem);
    }
  });
}

function startEditPoem(id) {
  document.getElementById(`edit-form-${id}`)?.classList.remove("hidden");
}

function cancelEditPoem(id) {
  document.getElementById(`edit-form-${id}`)?.classList.add("hidden");
}

function submitEdit(event, id) {
  event.preventDefault();
  event.stopPropagation();

  const titleInput = document.getElementById(`edit-title-${id}`);
  const authorInput = document.getElementById(`edit-author-${id}`);
  const poemInput = document.getElementById(`edit-poem-${id}`);

  if (!titleInput || !authorInput || !poemInput || !db) {
    return;
  }

  const title = titleInput.value.trim();
  const author = authorInput.value.trim();
  const poem = poemInput.value.trim();

  if (!title || !poem) {
    return;
  }

  const updatedAt = Date.now();
  const payload = { title, author, poem, updatedAt };

  const tx = db.transaction([POEMS_STORE, OUTBOX_STORE], "readwrite");
  tx.objectStore(POEMS_STORE).put({ id, ...payload });
  tx.objectStore(OUTBOX_STORE).add({
    type: "update",
    localId: id,
    payload,
    createdAt: Date.now()
  });

  tx.oncomplete = () => {
    loadCollection();
    syncOutbox();
  };
}

function deletePoem(id) {
  if (!db) {
    return;
  }

  const tx = db.transaction([POEMS_STORE, OUTBOX_STORE], "readwrite");
  tx.objectStore(POEMS_STORE).delete(id);
  tx.objectStore(OUTBOX_STORE).add({
    type: "delete",
    localId: id,
    createdAt: Date.now()
  });

  tx.oncomplete = () => {
    loadCollection();
    syncOutbox();
  };
}

function getAllPoems() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POEMS_STORE, "readonly");
    const store = tx.objectStore(POEMS_STORE);
    const poems = [];

    store.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        poems.push({ ...cursor.value, id: cursor.primaryKey });
        cursor.continue();
        return;
      }
      resolve(poems);
    };

    tx.onerror = () => reject(new Error("Не удалось загрузить коллекцию"));
  });
}

function syncOutbox() {
  if (!db || !navigator.onLine) {
    return;
  }

  const tx = db.transaction(OUTBOX_STORE, "readonly");
  const operations = [];

  tx.objectStore(OUTBOX_STORE).openCursor().onsuccess = event => {
    const cursor = event.target.result;
    if (cursor) {
      operations.push({ ...cursor.value, id: cursor.primaryKey });
      cursor.continue();
      return;
    }

    operations.sort((a, b) => a.createdAt - b.createdAt);
    processQueueSequentially(operations);
  };
}

async function processQueueSequentially(operations) {
  for (const operation of operations) {
    try {
      if (operation.type === "add") {
        await fetch(API_BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localId: operation.localId, ...operation.payload })
        });
      }

      if (operation.type === "update") {
        await fetch(`${API_BASE_URL}/${operation.localId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(operation.payload)
        });
      }

      if (operation.type === "delete") {
        await fetch(`${API_BASE_URL}/${operation.localId}`, { method: "DELETE" });
      }

      await removeOutboxOperation(operation.id);
    } catch {
      break;
    }
  }
}

function removeOutboxOperation(operationId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const req = tx.objectStore(OUTBOX_STORE).delete(operationId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error("Не удалось удалить событие из outbox"));
  });
}

function updateConnectionStatus() {
  const status = document.getElementById("status");

  if (!status) {
    return;
  }

  if (navigator.onLine) {
    status.textContent = "🟢 Онлайн: синхронизация включена";
    status.classList.add("online");
    status.classList.remove("offline");
    return;
  }

  status.textContent = "🟡 Оффлайн: изменения будут отправлены позже";
  status.classList.add("offline");
  status.classList.remove("online");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("poetryUiSettings");
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    uiSettings = { ...defaultSettings, ...parsed };
  } catch {
    uiSettings = { ...defaultSettings };
  }
}

function persistAndApplySettings() {
  localStorage.setItem("poetryUiSettings", JSON.stringify(uiSettings));
  applySettings();
}

function applySettings() {
  const body = document.body;
  body.dataset.theme = uiSettings.darkTheme ? "dark" : "light";
  body.classList.toggle("reading-mode", uiSettings.readingMode);
  body.classList.toggle("readonly-mode", uiSettings.readonlyMode);

  const familyMap = {
    system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
    serif: '"Times New Roman", Georgia, serif',
    mono: '"SF Mono", Menlo, Consolas, monospace'
  };

  body.style.setProperty("--reader-font-size", `${uiSettings.fontSize}px`);
  body.style.setProperty("--reader-font-family", familyMap[uiSettings.fontFamily] || familyMap.system);

  updateReaderPreview();
}



function updateReaderPreview() {
  const preview = document.getElementById("reader-preview-text");
  if (!preview) {
    return;
  }

  preview.style.fontFamily = getComputedStyle(document.body).getPropertyValue("--reader-font-family");
  preview.style.fontSize = getComputedStyle(document.body).getPropertyValue("--reader-font-size");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

window.addEventListener("online", () => {
  updateConnectionStatus();
  syncOutbox();
});

window.addEventListener("offline", updateConnectionStatus);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

window.startEditPoem = startEditPoem;
window.cancelEditPoem = cancelEditPoem;
window.submitEdit = submitEdit;
window.deletePoem = deletePoem;
window.openPoemReader = openPoemReader;
