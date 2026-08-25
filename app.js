(() => {
  "use strict";

  const EXERCISE_SECONDS = 35;
  const HISTORY_KEY = "workoutHistory";
  const PAUSE_AFTER_KEY = "pauseAfterEachExercise";

  const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  const homeScreen = document.getElementById("home-screen");
  const sessionScreen = document.getElementById("session-screen");
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

  let session = null; // { sequence, index, label, routineId, timerHandle, secondsLeft, timerIndex, paused }

  function showScreen(screen) {
    for (const s of [homeScreen, sessionScreen, completeScreen]) {
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
    if (session && session.timerHandle) clearInterval(session.timerHandle);
    session = {
      sequence,
      index: 0,
      label,
      routineId: routineId ?? null,
      timerHandle: null,
      secondsLeft: EXERCISE_SECONDS,
      timerIndex: 0,
      paused: false,
    };
    sessionTitleEl.textContent = label;
    showScreen(sessionScreen);
    renderCurrentExercise();
  }

  function renderCurrentExercise() {
    const id = session.sequence[session.index];
    const exercise = exercisesById.get(id);

    sessionCountEl.textContent = `${session.index + 1} / ${session.sequence.length}`;

    if (exercise) {
      exerciseNameEl.textContent = exercise.name;
      exerciseDescriptionEl.textContent = exercise.hasDescription ? exercise.description : "";

      if (exercise.hasImage) {
        exerciseImageEl.src = `exercise_images/${exercise.image}`;
        exerciseImageEl.alt = exercise.name;
        exerciseImageEl.hidden = false;
        exerciseFallbackEl.hidden = true;
      } else {
        exerciseImageEl.hidden = true;
        exerciseFallbackEl.hidden = false;
      }
    } else {
      exerciseNameEl.textContent = id;
      exerciseDescriptionEl.textContent = "";
      exerciseImageEl.hidden = true;
      exerciseFallbackEl.hidden = false;
    }

    startTimer();
  }

  function startTimer() {
    session.paused = false;
    session.secondsLeft = EXERCISE_SECONDS;
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
    const elapsedFraction = (EXERCISE_SECONDS - secondsLeft) / EXERCISE_SECONDS;
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
    } else {
      renderCurrentExercise();
    }
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
    showScreen(completeScreen);
  }

  function goHome() {
    if (session && session.timerHandle) clearInterval(session.timerHandle);
    session = null;
    showScreen(homeScreen);
  }

  nextBtn.addEventListener("click", () => advance());
  homeBtn.addEventListener("click", goHome);
  pauseBtn.addEventListener("click", togglePause);
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
