(() => {
  "use strict";

  const HISTORY_KEY = "workoutHistory";
  const PAUSE_AFTER_KEY = "pauseAfterEachExercise";
  const PHOTO_SET_KEY = "photoSet";
  const SETTINGS_KEY = "workoutSettings";
  const DEFAULT_SETTINGS = { exerciseSeconds: 35, restEvery: 0, restSeconds: 60 };

  const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  const homeScreen = document.getElementById("home-screen");
  const sessionScreen = document.getElementById("session-screen");
  const restScreen = document.getElementById("rest-screen");
  const completeScreen = document.getElementById("complete-screen");

  const routineListEl = document.getElementById("routine-list");
  const randomButtons = document.querySelectorAll(".random-btn");
  const pauseAfterToggle = document.getElementById("pause-after-toggle");
  const modeToggleLabelEl = document.getElementById("mode-toggle-label");

  const homeBtn = document.getElementById("home-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const sessionTitleEl = document.getElementById("session-title");
  const sessionCountEl = document.getElementById("session-count");
  const exerciseImageEl = document.getElementById("exercise-image");
  const exerciseFallbackEl = document.getElementById("exercise-fallback");
  const exerciseNameEl = document.getElementById("exercise-name");
  const exerciseDescriptionEl = document.getElementById("exercise-description");
  const timerBarFillEl = document.getElementById("timer-bar-fill");
  const timerValueEl = document.getElementById("timer-value");
  const nextBtn = document.getElementById("next-btn");

  const completeSummaryEl = document.getElementById("complete-summary");
  const doneBtn = document.getElementById("done-btn");

  const restCountEl = document.getElementById("rest-count");
  const restTimerValueEl = document.getElementById("rest-timer-value");
  const restBarFillEl = document.getElementById("rest-bar-fill");
  const continueBtn = document.getElementById("continue-btn");
  const restHomeBtn = document.getElementById("rest-home-btn");

  const settingsBtn = document.getElementById("settings-btn");
  const restSettingsBtn = document.getElementById("rest-settings-btn");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsCloseBtn = document.getElementById("settings-close-btn");
  const exerciseSecondsInput = document.getElementById("setting-exercise-seconds");
  const restEveryInput = document.getElementById("setting-rest-every");
  const restSecondsInput = document.getElementById("setting-rest-seconds");
  const photoSetToggle = document.getElementById("setting-photo-set");
  const photoSetLabelEl = document.getElementById("photo-set-label");

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.15 },
      { freq: 1318.51, start: 0.12, duration: 0.28 },
      { freq: 1046.5, start: 0.55, duration: 0.08 },
      { freq: 1046.5, start: 0.7, duration: 0.08 },
      { freq: 1046.5, start: 0.85, duration: 0.08 },
    ];
    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.3125, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    });
  }

  let wakeLock = null;

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (err) {
      // Wake lock unavailable (e.g. low battery, unsupported) — degrade silently.
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session) {
      requestWakeLock();
    }
  });

  let exercisesById = new Map();
  let allExercises = [];
  let pauseAfterEachExercise = localStorage.getItem(PAUSE_AFTER_KEY) === "true";
  pauseAfterToggle.checked = pauseAfterEachExercise;
  updateModeToggleLabel();
  pauseAfterToggle.addEventListener("change", () => {
    pauseAfterEachExercise = pauseAfterToggle.checked;
    localStorage.setItem(PAUSE_AFTER_KEY, String(pauseAfterEachExercise));
    updateModeToggleLabel();
  });

  function updateModeToggleLabel() {
    modeToggleLabelEl.textContent = pauseAfterEachExercise ? "Pause" : "Flow";
  }

  let photoSet = localStorage.getItem(PHOTO_SET_KEY) === "male" ? "male" : "female";
  photoSetToggle.checked = photoSet === "male";
  updatePhotoSetLabel();
  photoSetToggle.addEventListener("change", () => {
    photoSet = photoSetToggle.checked ? "male" : "female";
    localStorage.setItem(PHOTO_SET_KEY, photoSet);
    updatePhotoSetLabel();
    renderExerciseImage();
  });

  function updatePhotoSetLabel() {
    photoSetLabelEl.textContent = photoSet === "male" ? "Male" : "Female";
  }

  function photoFolder(set) {
    return set === "male" ? "images-male" : "images-female";
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return { ...DEFAULT_SETTINGS, ...(stored || {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  let settings = loadSettings();
  let settingsAutoPaused = false;
  let settingsAutoPausedRest = false;

  function applySettingsToInputs() {
    exerciseSecondsInput.value = settings.exerciseSeconds;
    restEveryInput.value = settings.restEvery;
    restSecondsInput.value = settings.restSeconds;
  }

  function saveSettingsFromInputs() {
    settings = {
      exerciseSeconds: clampInt(exerciseSecondsInput.value, 5, 600, DEFAULT_SETTINGS.exerciseSeconds),
      restEvery: clampInt(restEveryInput.value, 0, 50, DEFAULT_SETTINGS.restEvery),
      restSeconds: clampInt(restSecondsInput.value, 5, 600, DEFAULT_SETTINGS.restSeconds),
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function openSettings() {
    applySettingsToInputs();
    if (session && session.timerHandle && !session.paused) {
      session.paused = true;
      clearInterval(session.timerHandle);
      session.timerHandle = null;
      updatePauseButton();
      settingsAutoPaused = true;
    }
    if (session && session.restTimerHandle) {
      clearInterval(session.restTimerHandle);
      session.restTimerHandle = null;
      settingsAutoPausedRest = true;
    }
    settingsOverlay.hidden = false;
  }

  function closeSettings() {
    saveSettingsFromInputs();
    applySettingsToInputs();
    settingsOverlay.hidden = true;
    if (settingsAutoPaused && session) {
      settingsAutoPaused = false;
      session.paused = false;
      runTimer();
      updatePauseButton();
    }
    if (settingsAutoPausedRest && session) {
      settingsAutoPausedRest = false;
      runRestTimer();
    }
  }

  settingsBtn.addEventListener("click", openSettings);
  restSettingsBtn.addEventListener("click", openSettings);
  settingsCloseBtn.addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  let session = null; // { sequence, index, label, routineId, timerHandle, secondsLeft, timerIndex, paused }

  function showScreen(screen) {
    for (const s of [homeScreen, sessionScreen, restScreen, completeScreen]) {
      s.hidden = s !== screen;
    }
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function appendHistory(entry) {
    const history = loadHistory();
    history.push(entry);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // storage unavailable; nothing to fall back to for this personal app
    }
  }

  function renderHome(data) {
    routineListEl.innerHTML = "";
    for (const routine of data.routines) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "routine-card";
      card.innerHTML = `
        <p class="routine-title"></p>
        <p class="routine-meta"></p>
      `;
      card.querySelector(".routine-title").textContent = `${routine.id}. ${routine.title}`;
      card.querySelector(".routine-meta").textContent = routine.meta || "";
      card.addEventListener("click", () => startSession(routine.sequence, routine.title, routine.id));
      routineListEl.appendChild(card);
    }
  }

  function pickRandom(count) {
    const pool = [...allExercises];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).map((e) => e.id);
  }

  function startSession(sequence, label, routineId) {
    getAudioContext();
    requestWakeLock();
    if (session && session.timerHandle) clearInterval(session.timerHandle);
    session = {
      sequence,
      index: 0,
      label,
      routineId: routineId ?? null,
      timerHandle: null,
      secondsLeft: settings.exerciseSeconds,
      timerIndex: 0,
      paused: false,
      restTimerHandle: null,
      restSecondsLeft: 0,
    };
    sessionTitleEl.textContent = label;
    showScreen(sessionScreen);
    renderCurrentExercise();
  }

  let currentExercise = null;

  function renderCurrentExercise() {
    const id = session.sequence[session.index];
    const exercise = exercisesById.get(id);
    currentExercise = exercise || null;

    sessionCountEl.textContent = `${session.index + 1} / ${session.sequence.length}`;

    if (exercise) {
      exerciseNameEl.textContent = exercise.name;
      exerciseDescriptionEl.textContent = exercise.hasDescription ? exercise.description : "";
    } else {
      exerciseNameEl.textContent = id;
      exerciseDescriptionEl.textContent = "";
    }

    renderExerciseImage();
    startTimer();
  }

  function renderExerciseImage() {
    const exercise = currentExercise;
    if (!exercise || !exercise.hasImage) {
      exerciseImageEl.hidden = true;
      exerciseFallbackEl.hidden = false;
      return;
    }

    const otherSet = photoSet === "male" ? "female" : "male";
    exerciseImageEl.onerror = () => {
      exerciseImageEl.onerror = () => {
        exerciseImageEl.onerror = null;
        exerciseImageEl.hidden = true;
        exerciseFallbackEl.hidden = false;
      };
      exerciseImageEl.src = `${photoFolder(otherSet)}/${exercise.image}`;
    };
    exerciseImageEl.src = `${photoFolder(photoSet)}/${exercise.image}`;
    exerciseImageEl.alt = exercise.name;
    exerciseImageEl.hidden = false;
    exerciseFallbackEl.hidden = true;
  }

  function startTimer() {
    session.paused = false;
    session.secondsLeft = settings.exerciseSeconds;
    session.timerIndex = session.index;
    updateTimerDisplay();
    updatePauseButton();
    runTimer();
  }

  function runTimer() {
    if (session.timerHandle) clearInterval(session.timerHandle);
    const timerIndex = session.timerIndex;
    session.timerHandle = setInterval(() => {
      session.secondsLeft -= 1;
      updateTimerDisplay();
      if (session.secondsLeft <= 0) {
        playChime();
        clearInterval(session.timerHandle);
        session.timerHandle = null;
        if (pauseAfterEachExercise) {
          session.paused = true;
          updatePauseButton();
        } else {
          advance(timerIndex);
        }
      }
    }, 1000);
  }

  function togglePause() {
    if (!session) return;
    session.paused = !session.paused;
    if (session.paused) {
      if (session.timerHandle) {
        clearInterval(session.timerHandle);
        session.timerHandle = null;
      }
    } else {
      runTimer();
    }
    updatePauseButton();
  }

  function updatePauseButton() {
    const paused = !!(session && session.paused);
    pauseBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
    pauseBtn.classList.toggle("active", paused);
  }

  function updateTimerDisplay() {
    const secondsLeft = Math.max(session.secondsLeft, 0);
    timerValueEl.textContent = secondsLeft;
    const elapsedFraction = (settings.exerciseSeconds - secondsLeft) / settings.exerciseSeconds;
    timerBarFillEl.style.transform = `scaleX(${elapsedFraction})`;
  }

  // expectedIndex, when passed (by the auto-timer), guards against a stale
  // timer tick double-advancing after Next has already moved to a new exercise.
  function advance(expectedIndex) {
    if (!session) return;
    if (expectedIndex !== undefined && expectedIndex !== session.index) return;
    if (session.timerHandle) {
      clearInterval(session.timerHandle);
      session.timerHandle = null;
    }
    session.index += 1;
    if (session.index >= session.sequence.length) {
      finishSession();
    } else if (settings.restEvery > 0 && session.index % settings.restEvery === 0) {
      startRest();
    } else {
      renderCurrentExercise();
    }
  }

  function startRest() {
    restCountEl.textContent = `${session.index} / ${session.sequence.length} done`;
    showScreen(restScreen);
    session.restSecondsLeft = settings.restSeconds;
    updateRestDisplay();
    runRestTimer();
  }

  function runRestTimer() {
    if (session.restTimerHandle) clearInterval(session.restTimerHandle);
    session.restTimerHandle = setInterval(() => {
      session.restSecondsLeft -= 1;
      updateRestDisplay();
      if (session.restSecondsLeft <= 0) {
        clearInterval(session.restTimerHandle);
        session.restTimerHandle = null;
        playChime();
      }
    }, 1000);
  }

  function updateRestDisplay() {
    const secondsLeft = Math.max(session.restSecondsLeft, 0);
    restTimerValueEl.textContent = secondsLeft;
    const fraction = (settings.restSeconds - secondsLeft) / settings.restSeconds;
    restBarFillEl.style.transform = `scaleX(${Math.min(Math.max(fraction, 0), 1)})`;
  }

  function continueFromRest() {
    if (!session) return;
    if (session.restTimerHandle) {
      clearInterval(session.restTimerHandle);
      session.restTimerHandle = null;
    }
    showScreen(sessionScreen);
    renderCurrentExercise();
  }

  function finishSession() {
    appendHistory({
      type: session.routineId != null ? "curated" : "random",
      routineId: session.routineId,
      routineTitle: session.label,
      exerciseCount: session.sequence.length,
      completedAt: new Date().toISOString(),
    });
    completeSummaryEl.textContent = `${session.label} — ${session.sequence.length} exercises`;
    session = null;
    releaseWakeLock();
    showScreen(completeScreen);
  }

  function goHome() {
    if (session) {
      if (session.timerHandle) clearInterval(session.timerHandle);
      if (session.restTimerHandle) clearInterval(session.restTimerHandle);
    }
    session = null;
    releaseWakeLock();
    showScreen(homeScreen);
  }

  nextBtn.addEventListener("click", () => advance());
  homeBtn.addEventListener("click", goHome);
  pauseBtn.addEventListener("click", togglePause);
  continueBtn.addEventListener("click", continueFromRest);
  restHomeBtn.addEventListener("click", goHome);
  doneBtn.addEventListener("click", () => showScreen(homeScreen));
  randomButtons.forEach((btn) => {
    const count = Number(btn.dataset.count);
    btn.addEventListener("click", () => startSession(pickRandom(count), `Random ${count}`, null));
  });

  fetch("exercises_data.json")
    .then((res) => res.json())
    .then((data) => {
      allExercises = data.exercises;
      exercisesById = new Map(allExercises.map((e) => [e.id, e]));
      renderHome(data);
    })
    .catch((err) => {
      routineListEl.textContent = "Couldn't load workout data.";
      console.error(err);
    });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.error("Service worker registration failed", err);
      });
    });
  }
})();
