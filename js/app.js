// NFT Marker Creator App Logic

// Elements
const fileInput = document.getElementById("fileInput");
const fileDropArea = document.getElementById("fileDropArea");
const canvasPreview = document.getElementById("canvasPreview");

// Dynamically create hidden canvas
let canvasImage = document.getElementById("canvasImage");
if (!canvasImage) {
  canvasImage = document.createElement("canvas");
  canvasImage.id = "canvasImage";
  canvasImage.style.display = "none";
  document.body.appendChild(canvasImage);
}

const generateButton = document.getElementById("generateButton");
const clearButton = document.getElementById("clearButton");
const optionsPanel = document.querySelector(".options-row");
const filenameInput = document.getElementById("filenameInput");

// Default options
const options = {
  zft: false,
  dpi: 72,
  level: 2,
  leveli: 1,
  sd_thresh: 8,
  max_thresh: 0.9,
  min_thresh: 0.55,
  feature_density: 70
};

let loadedImageData = null;
let Module = null;

// Load WASM Module
(async function () {
  Module = await import('./NftMarkerCreator.min.js').then(mod => mod.default());
})();

// File Handling
fileInput.addEventListener("change", handleFile);
fileDropArea.addEventListener("dragover", e => e.preventDefault());
fileDropArea.addEventListener("drop", e => {
  e.preventDefault();
  fileInput.files = e.dataTransfer.files;
  handleFile();
});

function handleFile() {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      // Visible canvas
      canvasPreview.width = img.width;
      canvasPreview.height = img.height;
      const ctx = canvasPreview.getContext("2d");
      ctx.clearRect(0, 0, canvasPreview.width, canvasPreview.height);
      ctx.drawImage(img, 0, 0);

      // Hidden canvas
      canvasImage.width = img.width;
      canvasImage.height = img.height;
      const hiddenCtx = canvasImage.getContext("2d");
      hiddenCtx.clearRect(0, 0, canvasImage.width, canvasImage.height);
      hiddenCtx.drawImage(img, 0, 0);

      loadedImageData = hiddenCtx.getImageData(0, 0, canvasImage.width, canvasImage.height);
      generateButton.disabled = false;
      clearButton.disabled = false;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Clear Image
clearButton.addEventListener("click", () => {
  const ctx = canvasPreview.getContext("2d");
  ctx.clearRect(0, 0, canvasPreview.width, canvasPreview.height);

  const hiddenCtx = canvasImage.getContext("2d");
  hiddenCtx.clearRect(0, 0, canvasImage.width, canvasImage.height);

  fileInput.value = "";
  loadedImageData = null;
  generateButton.disabled = true;
  clearButton.disabled = true;
});

// Bind options
optionsPanel.querySelectorAll("input").forEach(input => {
  const key = input.dataset.option;
  if (!key) return;

  if (input.type === "checkbox") {
    input.checked = options[key];
  } else {
    input.value = options[key];
  }

  input.addEventListener("input", () => {
    if (input.type === "checkbox") {
      options[key] = input.checked;
    } else {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        options[key] = val;
      }
    }
  });
});

// Helper
function buf2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Generate Button Logic
generateButton.addEventListener("click", () => {
  if (!Module || !loadedImageData) return alert("WASM Module or image not ready");

  const filename = filenameInput.value.trim() || "output";

  const cmdArr = [0, filename];
  for (let key in options) {
    if (key === "zft" && options[key]) {
      cmdArr.push("-zft");
    } else if (key !== "zft") {
      cmdArr.push(`-${key}=${options[key]}`);
    }
  }

  const paramStr = cmdArr.join(" ");
  const paramPtr = Module._malloc(paramStr.length + 1);
  Module.writeStringToMemory(paramStr, paramPtr);

  const imgData = loadedImageData.data;
  const heapPtr = Module._malloc(imgData.length);
  Module.HEAPU8.set(imgData, heapPtr);

  Module._createImageSet(heapPtr, options.dpi, canvasImage.width, canvasImage.height, 3, paramPtr);

  setTimeout(() => {
    try {
      const iset = Module.FS.readFile("tempFilename.iset");
      const fset = Module.FS.readFile("tempFilename.fset");
      const fset3 = Module.FS.readFile("tempFilename.fset3");

      [
        { blob: iset, ext: ".iset" },
        { blob: fset, ext: ".fset" },
        { blob: fset3, ext: ".fset3" }
      ].forEach(({ blob, ext }) => {
        const a = document.createElement("a");
        a.download = filename + ext;
        a.href = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

    } catch (err) {
      console.error("Download failed", err);
      alert("An error occurred while downloading files.");
    }

    Module._free(paramPtr);
    Module._free(heapPtr);
  }, 300); // give FS time to flush
});
