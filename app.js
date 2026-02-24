let db;

const request = indexedDB.open("PoetryDB", 1);

request.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore("poems", { autoIncrement: true });
};

request.onsuccess = e => {
  db = e.target.result;
  loadPoems();
};

function savePoem() {
  const title = document.getElementById("title").value;
  const poem = document.getElementById("poem").value;

  if (!title || !poem) return;

  const tx = db.transaction("poems", "readwrite");
  tx.objectStore("poems").add({ title, poem });

  tx.oncomplete = () => {
    document.getElementById("title").value = "";
    document.getElementById("poem").value = "";
    loadPoems();
  };
}

function loadPoems() {
  const container = document.getElementById("poems");
  container.innerHTML = "";

  const tx = db.transaction("poems", "readonly");
  const store = tx.objectStore("poems");

  store.openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      const div = document.createElement("div");
      div.innerHTML = `
        <h3>${cursor.value.title}</h3>
        <pre>${cursor.value.poem}</pre>
        <hr>
      `;
      container.appendChild(div);
      cursor.continue();
    }
  };
}

/* офлайн */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
