"use strict";

const STORAGE_KEY = "teleprompter-state-v1";
const DEFAULTS = Object.freeze({
  text: "",
  fontSize: 52,
  lineHeight: 1.55,
  speed: 32,
  textColor: "#f7f3e8",
  backgroundColor: "#0d1110",
  alignment: "left",
  mirror: false,
});

const elements = {
  editorView: document.querySelector("#editorView"),
  playerView: document.querySelector("#playerView"),
  scriptInput: document.querySelector("#scriptInput"),
  charCount: document.querySelector("#charCount"),
  saveStatus: document.querySelector("#saveStatus"),
  clearButton: document.querySelector("#clearButton"),
  resetButton: document.querySelector("#resetButton"),
  startButton: document.querySelector("#startButton"),
  previewWindow: document.querySelector("#previewWindow"),
  previewText: document.querySelector("#previewText"),
  fontSize: document.querySelector("#fontSize"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  lineHeight: document.querySelector("#lineHeight"),
  lineHeightValue: document.querySelector("#lineHeightValue"),
  scrollSpeed: document.querySelector("#scrollSpeed"),
  speedValue: document.querySelector("#speedValue"),
  textColor: document.querySelector("#textColor"),
  textColorValue: document.querySelector("#textColorValue"),
  backgroundColor: document.querySelector("#backgroundColor"),
  backgroundColorValue: document.querySelector("#backgroundColorValue"),
  mirrorToggle: document.querySelector("#mirrorToggle"),
  reader: document.querySelector("#reader"),
  promptTrack: document.querySelector("#promptTrack"),
  promptText: document.querySelector("#promptText"),
  countdown: document.querySelector("#countdown"),
  countdownValue: document.querySelector("#countdown span"),
  playerStatus: document.querySelector("#playerStatus"),
  exitButton: document.querySelector("#exitButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  restartButton: document.querySelector("#restartButton"),
  slowerButton: document.querySelector("#slowerButton"),
  fasterButton: document.querySelector("#fasterButton"),
  playPauseButton: document.querySelector("#playPauseButton"),
  playPauseIcon: document.querySelector("#playPauseIcon"),
  playPauseLabel: document.querySelector("#playPauseLabel"),
  playerSpeed: document.querySelector("#playerSpeed"),
  toast: document.querySelector("#toast"),
};

let state = loadState();
let isPlaying = false;
let animationFrameId = null;
let lastFrameTime = null;
let scrollPosition = 0;
let countdownTimer = null;
let controlsTimer = null;
let saveTimer = null;
let toastTimer = null;
let wakeLock = null;
let pointerStart = null;
let pointerMoved = false;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return sanitizeState({ ...DEFAULTS, ...saved });
  } catch {
    return { ...DEFAULTS };
  }
}

function sanitizeState(value) {
  return {
    text: typeof value.text === "string" ? value.text : DEFAULTS.text,
    fontSize: clampNumber(value.fontSize, 20, 100, DEFAULTS.fontSize),
    lineHeight: clampNumber(value.lineHeight, 1.15, 2.2, DEFAULTS.lineHeight),
    speed: clampNumber(value.speed, 5, 120, DEFAULTS.speed),
    textColor: isHexColor(value.textColor) ? value.textColor : DEFAULTS.textColor,
    backgroundColor: isHexColor(value.backgroundColor) ? value.backgroundColor : DEFAULTS.backgroundColor,
    alignment: value.alignment === "center" ? "center" : "left",
    mirror: Boolean(value.mirror),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function saveState(immediate = false) {
  window.clearTimeout(saveTimer);
  elements.saveStatus.textContent = "正在保存…";

  const commit = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    elements.saveStatus.textContent = "已自动保存";
  };

  if (immediate) {
    commit();
  } else {
    saveTimer = window.setTimeout(commit, 260);
  }
}

function syncForm() {
  elements.scriptInput.value = state.text;
  elements.fontSize.value = String(state.fontSize);
  elements.lineHeight.value = String(state.lineHeight);
  elements.scrollSpeed.value = String(state.speed);
  elements.textColor.value = state.textColor;
  elements.backgroundColor.value = state.backgroundColor;
  elements.mirrorToggle.checked = state.mirror;

  const alignmentInput = document.querySelector(`input[name="alignment"][value="${state.alignment}"]`);
  if (alignmentInput) alignmentInput.checked = true;

  updateEditorUI();
}

function updateEditorUI() {
  const preview = state.text.trim() || "这里会显示你的台词预览。";
  elements.charCount.textContent = String(state.text.replace(/\s/g, "").length);
  elements.previewText.textContent = preview;
  elements.fontSizeValue.textContent = `${state.fontSize} px`;
  elements.lineHeightValue.textContent = state.lineHeight.toFixed(2);
  elements.speedValue.textContent = `${state.speed} px/s`;
  elements.textColorValue.textContent = state.textColor.toUpperCase();
  elements.backgroundColorValue.textContent = state.backgroundColor.toUpperCase();

  document.documentElement.style.setProperty("--prompt-font-size", `${state.fontSize}px`);
  document.documentElement.style.setProperty("--prompt-line-height", String(state.lineHeight));
  document.documentElement.style.setProperty("--prompt-color", state.textColor);
  document.documentElement.style.setProperty("--prompt-bg", state.backgroundColor);
  document.documentElement.style.setProperty("--prompt-align", state.alignment);
  elements.previewWindow.classList.toggle("is-mirrored", state.mirror);
  elements.playerSpeed.textContent = String(state.speed);
}

function readFormState() {
  state.text = elements.scriptInput.value;
  state.fontSize = Number(elements.fontSize.value);
  state.lineHeight = Number(elements.lineHeight.value);
  state.speed = Number(elements.scrollSpeed.value);
  state.textColor = elements.textColor.value;
  state.backgroundColor = elements.backgroundColor.value;
  state.mirror = elements.mirrorToggle.checked;
  state.alignment = document.querySelector('input[name="alignment"]:checked')?.value || "left";
  updateEditorUI();
  saveState();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}

function applyPlayerSettings() {
  updateEditorUI();
  elements.promptText.textContent = state.text.trim();
  elements.promptTrack.classList.toggle("is-mirrored", state.mirror);
}

function openPlayer() {
  if (!state.text.trim()) {
    showToast("请先输入或粘贴台词");
    elements.scriptInput.focus();
    return;
  }

  readFormState();
  saveState(true);
  applyPlayerSettings();
  elements.editorView.hidden = true;
  elements.playerView.hidden = false;
  elements.playerView.classList.remove("controls-hidden");
  document.body.classList.add("player-open");
  elements.reader.scrollTop = 0;
  scrollPosition = 0;
  elements.reader.focus({ preventScroll: true });
  startCountdown();
}

function closePlayer() {
  cancelCountdown();
  pauseScroll("已暂停");
  releaseWakeLock();
  window.clearTimeout(controlsTimer);
  elements.playerView.hidden = true;
  elements.editorView.hidden = false;
  elements.playerView.classList.remove("controls-hidden");
  document.body.classList.remove("player-open");

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  window.setTimeout(() => elements.startButton.focus(), 0);
}

function startCountdown() {
  cancelCountdown();
  pauseScroll("即将开始");
  elements.countdown.hidden = false;
  let remaining = 3;

  const render = () => {
    elements.countdownValue.textContent = String(remaining);
    elements.countdownValue.style.animation = "none";
    requestAnimationFrame(() => {
      elements.countdownValue.style.animation = "";
    });
  };

  render();
  countdownTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      cancelCountdown();
      startScroll();
      return;
    }
    render();
  }, 900);
}

function cancelCountdown() {
  window.clearInterval(countdownTimer);
  countdownTimer = null;
  elements.countdown.hidden = true;
}

function startScroll() {
  if (isPlaying) return;
  cancelCountdown();
  isPlaying = true;
  scrollPosition = elements.reader.scrollTop;
  lastFrameTime = null;
  updatePlaybackState("滚动中");
  requestWakeLock();
  animationFrameId = requestAnimationFrame(scrollFrame);
  scheduleControlsHide();
}

function pauseScroll(status = "已暂停") {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  isPlaying = false;
  lastFrameTime = null;
  scrollPosition = elements.reader.scrollTop;
  updatePlaybackState(status);
  releaseWakeLock();
  showControls(false);
}

function scrollFrame(timestamp) {
  if (!isPlaying) return;
  if (lastFrameTime === null) lastFrameTime = timestamp;

  const elapsed = Math.min(timestamp - lastFrameTime, 80);
  lastFrameTime = timestamp;
  scrollPosition += (state.speed * elapsed) / 1000;
  elements.reader.scrollTop = scrollPosition;

  const reachedEnd = elements.reader.scrollTop + elements.reader.clientHeight >= elements.reader.scrollHeight - 2;
  if (reachedEnd) {
    pauseScroll("已结束");
    showControls(false);
    return;
  }

  animationFrameId = requestAnimationFrame(scrollFrame);
}

function updatePlaybackState(status) {
  elements.playerStatus.textContent = status;
  elements.playPauseIcon.classList.toggle("is-pause", isPlaying);
  elements.playPauseIcon.classList.toggle("is-play", !isPlaying);
  elements.playPauseLabel.textContent = isPlaying ? "暂停" : "继续";
  elements.playPauseButton.setAttribute("aria-label", isPlaying ? "暂停滚动" : "继续滚动");
}

function togglePlayback() {
  if (countdownTimer) cancelCountdown();
  if (isPlaying) pauseScroll();
  else startScroll();
}

function changeSpeed(delta) {
  state.speed = clampNumber(state.speed + delta, 5, 120, DEFAULTS.speed);
  elements.scrollSpeed.value = String(state.speed);
  elements.playerSpeed.textContent = String(state.speed);
  elements.speedValue.textContent = `${state.speed} px/s`;
  saveState();
  showToast(`滚动速度：${state.speed} px/s`);
  if (isPlaying) scheduleControlsHide();
}

function restartPrompt() {
  elements.reader.scrollTop = 0;
  scrollPosition = 0;
  lastFrameTime = null;
  showToast("已回到开头");
  showControls(isPlaying);
}

function showControls(autoHide = isPlaying) {
  window.clearTimeout(controlsTimer);
  elements.playerView.classList.remove("controls-hidden");
  if (autoHide) scheduleControlsHide();
}

function scheduleControlsHide() {
  window.clearTimeout(controlsTimer);
  controlsTimer = window.setTimeout(() => {
    if (isPlaying) elements.playerView.classList.add("controls-hidden");
  }, 2800);
}

function toggleControls() {
  if (elements.playerView.classList.contains("controls-hidden")) showControls(isPlaying);
  else if (isPlaying) elements.playerView.classList.add("controls-hidden");
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await elements.playerView.requestFullscreen();
      elements.fullscreenButton.textContent = "退出全屏";
    } else {
      await document.exitFullscreen();
      elements.fullscreenButton.textContent = "全屏";
    }
  } catch {
    showToast("当前浏览器不支持全屏，可添加到主屏幕使用");
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } catch {
    // The browser may already have released it when the page lost focus.
  }
  wakeLock = null;
}

function handleKeyboard(event) {
  if (elements.playerView.hidden) return;

  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key === "Escape") {
    closePlayer();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    if (isPlaying) pauseScroll("已暂停 · 手动滚动");
    elements.reader.scrollBy({ top: event.key === "ArrowUp" ? -80 : 80, behavior: "smooth" });
  } else if (event.key === "+" || event.key === "=") {
    changeSpeed(3);
  } else if (event.key === "-" || event.key === "_") {
    changeSpeed(-3);
  }
}

function attachEvents() {
  elements.scriptInput.addEventListener("input", readFormState);
  elements.fontSize.addEventListener("input", readFormState);
  elements.lineHeight.addEventListener("input", readFormState);
  elements.scrollSpeed.addEventListener("input", readFormState);
  elements.textColor.addEventListener("input", readFormState);
  elements.backgroundColor.addEventListener("input", readFormState);
  elements.mirrorToggle.addEventListener("change", readFormState);
  document.querySelectorAll('input[name="alignment"]').forEach((input) => input.addEventListener("change", readFormState));

  elements.clearButton.addEventListener("click", () => {
    if (!state.text || window.confirm("确定清空当前台词吗？")) {
      state.text = "";
      elements.scriptInput.value = "";
      updateEditorUI();
      saveState(true);
      elements.scriptInput.focus();
    }
  });

  elements.resetButton.addEventListener("click", () => {
    const text = state.text;
    state = { ...DEFAULTS, text };
    syncForm();
    saveState(true);
    showToast("显示设置已恢复默认");
  });

  elements.startButton.addEventListener("click", openPlayer);
  elements.exitButton.addEventListener("click", closePlayer);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  elements.restartButton.addEventListener("click", restartPrompt);
  elements.slowerButton.addEventListener("click", () => changeSpeed(-3));
  elements.fasterButton.addEventListener("click", () => changeSpeed(3));
  elements.playPauseButton.addEventListener("click", togglePlayback);

  elements.reader.addEventListener("wheel", () => {
    if (isPlaying) pauseScroll("已暂停 · 手动滚动");
  }, { passive: true });

  elements.reader.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    pointerMoved = false;
  });

  elements.reader.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    if (distance > 8) {
      pointerMoved = true;
      if (isPlaying) pauseScroll("已暂停 · 手动滚动");
    }
  });

  elements.reader.addEventListener("pointerup", () => {
    if (!pointerMoved) showControls(isPlaying);
    pointerStart = null;
  });

  elements.reader.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  document.addEventListener("keydown", handleKeyboard);
  document.addEventListener("fullscreenchange", () => {
    elements.fullscreenButton.textContent = document.fullscreenElement ? "退出全屏" : "全屏";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isPlaying) requestWakeLock();
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

syncForm();
attachEvents();
registerServiceWorker();
