"use strict";

const elements = {
  scanner: document.querySelector(".scanner"),
  video: document.querySelector("#camera"),
  welcomePanel: document.querySelector("#welcomePanel"),
  errorPanel: document.querySelector("#errorPanel"),
  errorTitle: document.querySelector("#errorTitle"),
  errorMessage: document.querySelector("#errorMessage"),
  startButton: document.querySelector("#startButton"),
  retryButton: document.querySelector("#retryButton"),
  switchCameraButton: document.querySelector("#switchCameraButton"),
  helpButton: document.querySelector("#helpButton"),
  helpDialog: document.querySelector("#helpDialog"),
  closeHelpButton: document.querySelector("#closeHelpButton"),
  statusText: document.querySelector("#statusText"),
  cameraMeta: document.querySelector("#cameraMeta"),
  resolutionText: document.querySelector("#resolutionText"),
  captureBar: document.querySelector("#captureBar"),
  captureButton: document.querySelector("#captureButton"),
  captureHint: document.querySelector("#captureHint"),
  reviewPanel: document.querySelector("#reviewPanel"),
  previewImage: document.querySelector("#previewImage"),
  reviewResolution: document.querySelector("#reviewResolution"),
  retakeButton: document.querySelector("#retakeButton"),
  saveButton: document.querySelector("#saveButton"),
  captureCanvas: document.querySelector("#captureCanvas"),
  analysisCanvas: document.querySelector("#analysisCanvas"),
  toast: document.querySelector("#toast"),
};

const state = {
  stream: null,
  cameras: [],
  cameraIndex: 0,
  activeDeviceId: null,
  capturedBlob: null,
  capturedUrl: null,
  capturing: false,
  toastTimer: null,
};

const cameraConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 3840 },
    height: { ideal: 2880 },
    aspectRatio: { ideal: 4 / 3 },
    frameRate: { ideal: 30, max: 30 },
  },
};

function setStatus(message) {
  elements.statusText.textContent = message;
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function stopCamera() {
  if (!state.stream) return;
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.video.srcObject = null;
  elements.scanner.classList.remove("is-live", "is-capturing");
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  state.cameras = devices.filter((device) => device.kind === "videoinput");
  elements.switchCameraButton.hidden = state.cameras.length < 2;
}

function getErrorCopy(error) {
  if (!window.isSecureContext) {
    return {
      title: "안전한 연결이 필요합니다",
      message: "카메라는 HTTPS 주소에서만 사용할 수 있습니다. GitHub Pages로 배포하면 HTTPS가 자동 적용됩니다.",
    };
  }

  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "카메라 권한이 필요합니다",
        message: "Safari의 주소 표시줄 또는 iPhone 설정에서 이 사이트의 카메라 접근을 허용해 주세요.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        title: "카메라를 찾지 못했습니다",
        message: "사용 가능한 카메라가 있는 기기에서 다시 시도해 주세요.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        title: "카메라가 사용 중입니다",
        message: "다른 앱의 카메라 사용을 종료한 뒤 다시 시도해 주세요.",
      };
    default:
      return {
        title: "카메라를 시작할 수 없습니다",
        message: "잠시 후 다시 시도하거나 Safari를 새로고침해 주세요.",
      };
  }
}

function showCameraError(error) {
  const copy = getErrorCopy(error);
  elements.errorTitle.textContent = copy.title;
  elements.errorMessage.textContent = copy.message;
  elements.welcomePanel.hidden = true;
  elements.errorPanel.hidden = false;
  elements.captureBar.hidden = true;
  elements.cameraMeta.hidden = true;
  elements.scanner.classList.remove("is-live", "is-capturing");
  setStatus("카메라 오류");
}

async function waitForVideo() {
  if (elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video preview failed"));
    };
    const cleanup = () => {
      elements.video.removeEventListener("loadeddata", onReady);
      elements.video.removeEventListener("error", onError);
    };
    elements.video.addEventListener("loadeddata", onReady, { once: true });
    elements.video.addEventListener("error", onError, { once: true });
  });
}

async function startCamera(deviceId = null) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showCameraError(new DOMException("Unsupported", "NotSupportedError"));
    return;
  }

  elements.startButton.disabled = true;
  elements.retryButton.disabled = true;
  elements.captureBar.hidden = true;
  elements.cameraMeta.hidden = true;
  setStatus("카메라 연결 중");
  stopCamera();

  const constraints = structuredClone(cameraConstraints);
  if (deviceId) {
    delete constraints.video.facingMode;
    constraints.video.deviceId = { exact: deviceId };
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    elements.video.srcObject = state.stream;
    await elements.video.play();
    await waitForVideo();
    await listCameras();

    if (deviceId) {
      const selectedIndex = state.cameras.findIndex((camera) => camera.deviceId === deviceId);
      if (selectedIndex >= 0) state.cameraIndex = selectedIndex;
    } else {
      const track = state.stream.getVideoTracks()[0];
      const activeId = track.getSettings().deviceId;
      const selectedIndex = state.cameras.findIndex((camera) => camera.deviceId === activeId);
      if (selectedIndex >= 0) state.cameraIndex = selectedIndex;
    }

    const track = state.stream.getVideoTracks()[0];
    const settings = track.getSettings();
    state.activeDeviceId = settings.deviceId || deviceId;
    const width = settings.width || elements.video.videoWidth;
    const height = settings.height || elements.video.videoHeight;

    elements.resolutionText.textContent = `${width} × ${height}`;
    elements.welcomePanel.hidden = true;
    elements.errorPanel.hidden = true;
    elements.captureBar.hidden = false;
    elements.cameraMeta.hidden = false;
    elements.scanner.classList.add("is-live");
    setStatus("스캔 준비");
  } catch (error) {
    stopCamera();
    showCameraError(error);
  } finally {
    elements.startButton.disabled = false;
    elements.retryButton.disabled = false;
  }
}

async function switchCamera() {
  if (state.cameras.length < 2 || state.capturing) return;
  state.cameraIndex = (state.cameraIndex + 1) % state.cameras.length;
  setStatus("카메라 전환 중");
  await startCamera(state.cameras[state.cameraIndex].deviceId);
}

function nextVideoFrame() {
  return new Promise((resolve) => {
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      elements.video.requestVideoFrameCallback(() => resolve());
    } else {
      window.requestAnimationFrame(() => resolve());
    }
  });
}

function calculateSharpness() {
  const canvas = elements.analysisCanvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const videoWidth = elements.video.videoWidth;
  const videoHeight = elements.video.videoHeight;
  const targetRatio = canvas.width / canvas.height;
  const sourceRatio = videoWidth / videoHeight;

  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (sourceRatio > targetRatio) {
    sw = videoHeight * targetRatio;
    sx = (videoWidth - sw) / 2;
  } else {
    sh = videoWidth / targetRatio;
    sy = (videoHeight - sh) / 2;
  }

  context.drawImage(elements.video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Float32Array(width * height);

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    gray[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }

  let total = 0;
  let totalSquared = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = y * width + x;
      const laplacian =
        gray[center - 1] +
        gray[center + 1] +
        gray[center - width] +
        gray[center + width] -
        4 * gray[center];
      total += laplacian;
      totalSquared += laplacian * laplacian;
      count += 1;
    }
  }

  const mean = total / count;
  return totalSquared / count - mean * mean;
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Image encoding failed"));
    }, type, quality);
  });
}

async function captureBestFrame() {
  if (state.capturing || !state.stream || elements.video.videoWidth === 0) return;

  state.capturing = true;
  elements.captureButton.disabled = true;
  elements.scanner.classList.add("is-capturing");
  elements.captureHint.textContent = "가장 선명한 프레임을 찾고 있어요";
  setStatus("프레임 선택 중");

  const canvas = elements.captureCanvas;
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = elements.video.videoWidth;
  canvas.height = elements.video.videoHeight;

  let bestScore = Number.NEGATIVE_INFINITY;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await nextVideoFrame();
      const score = calculateSharpness();

      if (score > bestScore) {
        bestScore = score;
        context.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
      }
    }

    state.capturedBlob = await canvasToBlob(canvas);
    if (state.capturedUrl) URL.revokeObjectURL(state.capturedUrl);
    state.capturedUrl = URL.createObjectURL(state.capturedBlob);
    elements.previewImage.src = state.capturedUrl;
    elements.reviewResolution.textContent = `${canvas.width} × ${canvas.height} · JPEG`;
    stopCamera();
    elements.scanner.hidden = true;
    elements.reviewPanel.hidden = false;
    setStatus("스캔 완료");
  } catch (error) {
    console.error(error);
    showToast("스캔에 실패했습니다. 다시 시도해 주세요.");
    setStatus("스캔 준비");
  } finally {
    state.capturing = false;
    elements.captureButton.disabled = false;
    elements.scanner.classList.remove("is-capturing");
    elements.captureHint.textContent = "문서를 프레임 안에 맞춰 주세요";
  }
}

async function retake() {
  elements.reviewPanel.hidden = true;
  elements.scanner.hidden = false;
  await startCamera(state.activeDeviceId);
}

function makeFilename() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `silent-${parts.join("")}.jpg`;
}

async function saveCapture() {
  if (!state.capturedBlob) return;
  const file = new File([state.capturedBlob], makeFilename(), { type: "image/jpeg" });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "silent 문서 스캔",
      });
      return;
    }

    const link = document.createElement("a");
    link.href = state.capturedUrl;
    link.download = file.name;
    link.click();
    showToast("이미지를 다운로드했습니다.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      showToast("저장 메뉴를 열 수 없습니다.");
    }
  }
}

function openHelp() {
  if (typeof elements.helpDialog.showModal === "function") {
    elements.helpDialog.showModal();
  }
}

function closeHelp() {
  elements.helpDialog.close();
}

elements.startButton.addEventListener("click", () => startCamera());
elements.retryButton.addEventListener("click", () => startCamera());
elements.switchCameraButton.addEventListener("click", switchCamera);
elements.captureButton.addEventListener("click", captureBestFrame);
elements.retakeButton.addEventListener("click", retake);
elements.saveButton.addEventListener("click", saveCapture);
elements.helpButton.addEventListener("click", openHelp);
elements.closeHelpButton.addEventListener("click", closeHelp);
elements.helpDialog.addEventListener("click", (event) => {
  if (event.target === elements.helpDialog) closeHelp();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.stream) {
    elements.video.play().catch(() => {});
  }
});

window.addEventListener("pagehide", stopCamera);

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
