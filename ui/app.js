const form = document.getElementById("convert-form");
const imageInput = document.getElementById("image-input");
const nameInput = document.getElementById("name-input");
const dropZone = document.getElementById("drop-zone");
const filePill = document.getElementById("file-pill");
const convertButton = document.getElementById("convert-button");
const logPanel = document.getElementById("log-panel");
const stageList = document.getElementById("stage-list");
const resultCard = document.getElementById("result-card");
const resultLinks = document.getElementById("result-links");
const languageBar = document.getElementById("language-bar");
const signalState = document.getElementById("signal-state");

const stages = ["upload", "crop", "blender", "glb"];

function setLog(message) {
  logPanel.textContent = message;
}

function clearStages() {
  [...stageList.querySelectorAll("li")].forEach((item) => {
    item.classList.remove("active", "done");
  });
}

function activateStage(name) {
  clearStages();
  stages.forEach((stage) => {
    const item = stageList.querySelector(`[data-stage="${stage}"]`);
    if (!item) return;
    if (stage === name) {
      item.classList.add("active");
    } else if (stages.indexOf(stage) < stages.indexOf(name)) {
      item.classList.add("done");
    }
  });
}

function setBar(mode, label) {
  languageBar.className = `language-bar ${mode}`;
  signalState.textContent = label;
}

function selectedFile() {
  return imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
}

function updateFilePill() {
  const file = selectedFile();
  filePill.textContent = file ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No image selected";
}

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  if (!event.dataTransfer.files.length) return;
  imageInput.files = event.dataTransfer.files;
  updateFilePill();
});

imageInput.addEventListener("change", updateFilePill);

function renderResult(data) {
  resultLinks.innerHTML = "";
  const links = [
    { href: data.downloadUrl, label: "Download GLB" },
    { href: data.faceTextureUrl, label: "Open face texture" },
    { href: data.blendUrl, label: "Open .blend source" },
  ];
  links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.textContent = link.label;
    if (link.label === "Download GLB") {
      anchor.download = "";
    } else {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    resultLinks.appendChild(anchor);
  });
  resultCard.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = selectedFile();
  if (!file) {
    setLog("Choose a JPG or PNG before starting the build.");
    return;
  }

  resultCard.hidden = true;
  convertButton.disabled = true;
  convertButton.textContent = "Building...";
  setBar("busy", "Working");
  activateStage("upload");
  setLog(`Queued ${file.name}\nPreparing upload payload...`);

  const payload = new FormData();
  payload.append("image", file);
  payload.append("name", nameInput.value.trim() || "Photo Avatar");

  window.setTimeout(() => {
    activateStage("crop");
    setBar("cropping busy", "Cropping");
    setLog(`Queued ${file.name}\nPreparing face texture...`);
  }, 250);

  window.setTimeout(() => {
    activateStage("blender");
    setBar("blender busy", "Blender");
    setLog(`Queued ${file.name}\nPreparing face texture...\nRunning Blender headless...`);
  }, 900);

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: payload,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.details || data.error || "Conversion failed.");
    }

    activateStage("glb");
    [...stageList.querySelectorAll("li")].forEach((item) => item.classList.add("done"));
    setBar("done", "Ready");
    setLog(data.stdout || "GLB exported.");
    renderResult(data);
  } catch (error) {
    clearStages();
    setBar("idle", "Error");
    setLog(String(error.message || error));
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = "Build GLB";
  }
});
