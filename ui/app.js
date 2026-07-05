const form = document.getElementById("convert-form");
const imageInput = document.getElementById("image-input");
const nameInput = document.getElementById("name-input");
const dropZone = document.getElementById("drop-zone");
const filePill = document.getElementById("file-pill");
const surfaceNote = document.getElementById("surface-note");
const convertButton = document.getElementById("convert-button");
const logPanel = document.getElementById("log-panel");
const stageList = document.getElementById("stage-list");
const resultCard = document.getElementById("result-card");
const resultLinks = document.getElementById("result-links");
const languageBar = document.getElementById("language-bar");
const signalState = document.getElementById("signal-state");
const modelPreview = document.getElementById("model-preview");
const previewEmpty = document.getElementById("preview-empty");
const previewStage = document.getElementById("preview-stage");
const isGitHubPagesPreview = window.location.hostname.endsWith("github.io");

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
  filePill.textContent = file ? `${file.name} - ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No image selected";
}

function setGitHubPagesPreview() {
  imageInput.disabled = true;
  nameInput.disabled = true;
  convertButton.disabled = true;
  convertButton.textContent = "Local Conversion Only";
  convertButton.classList.add("showcase");
  dropZone.classList.add("is-disabled");
  dropZone.setAttribute("aria-disabled", "true");
  if (surfaceNote) {
    surfaceNote.hidden = false;
    surfaceNote.innerHTML =
      'GitHub Pages is showing the studio shell only. Run <code>.\\\\run-ui.ps1</code> locally for real photo-to-GLB conversion.';
  }
  clearStages();
  setBar("idle", "Preview");
  setLog("GitHub Pages preview loaded.\nRun .\\run-ui.ps1 locally to convert a photo with Blender.");
}

function resetPreview() {
  modelPreview.removeAttribute("src");
  modelPreview.removeAttribute("poster");
  previewEmpty.hidden = false;
  previewStage.classList.remove("is-ready");
}

function loadPreview(data) {
  modelPreview.src = data.downloadUrl;
  modelPreview.poster = data.faceTextureUrl;
  modelPreview.cameraOrbit = "20deg 74deg 2.9m";
  modelPreview.fieldOfView = "26deg";
  modelPreview.jumpCameraToGoal();
  previewEmpty.hidden = true;
  previewStage.classList.add("is-ready");
}

dropZone.addEventListener("dragover", (event) => {
  if (isGitHubPagesPreview) return;
  event.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  if (isGitHubPagesPreview) return;
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (event) => {
  if (isGitHubPagesPreview) return;
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
  loadPreview(data);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isGitHubPagesPreview) {
    setGitHubPagesPreview();
    return;
  }
  const file = selectedFile();
  if (!file) {
    setLog("Choose a JPG or PNG before starting the build.");
    return;
  }

  resultCard.hidden = true;
  resetPreview();
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
    resetPreview();
    setLog(String(error.message || error));
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = "Build GLB";
  }
});

resetPreview();
if (isGitHubPagesPreview) {
  setGitHubPagesPreview();
}
