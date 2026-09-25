// Единственный рабочий массив: исходные записи загружаются в него из exercises.json.
const exercises = [];

const elements = {
  setupView: document.querySelector("#setup-view"),
  workoutView: document.querySelector("#workout-view"),
  completeView: document.querySelector("#complete-view"),
  exerciseList: document.querySelector("#exercise-list"),
  routineLabel: document.querySelector("#routine-label"),
  addExerciseButton: document.querySelector("#add-exercise-button"),
  exerciseDialog: document.querySelector("#exercise-dialog"),
  exerciseDialogTitle: document.querySelector("#exercise-dialog-title"),
  exerciseDialogClose: document.querySelector("#exercise-dialog-close"),
  exerciseDialogCancel: document.querySelector("#exercise-dialog-cancel"),
  exerciseForm: document.querySelector("#exercise-form"),
  exerciseFormSubmit: document.querySelector("#exercise-form-submit"),
  exerciseFormName: document.querySelector("#exercise-form-name"),
  exerciseFormDescription: document.querySelector("#exercise-form-description"),
  exerciseFormDuration: document.querySelector("#exercise-form-duration"),
  exerciseFormPause: document.querySelector("#exercise-form-pause"),
  exerciseFormRepetitions: document.querySelector("#exercise-form-repetitions"),
  exerciseDeleteButton: document.querySelector("#exercise-delete-button"),
  startButton: document.querySelector("#start-button"),
  pauseButton: document.querySelector("#pause-button"),
  stopButton: document.querySelector("#stop-button"),
  repeatButton: document.querySelector("#repeat-button"),
  exerciseProgress: document.querySelector("#exercise-progress"),
  nextExercise: document.querySelector("#next-exercise"),
  repeatProgress: document.querySelector("#repeat-progress"),
  exerciseName: document.querySelector("#exercise-name"),
  timerRing: document.querySelector("#timer-ring"),
  exerciseTimeLeft: document.querySelector("#exercise-time-left"),
  restTimeLeft: document.querySelector("#rest-time-left"),
  totalTimeLeft: document.querySelector("#total-time-left"),
  transitionSound: document.querySelector("#transition-sound"),
};

const TICK_RATE = 100;
const TRANSITION_SOUND_LEAD = 300;

function calculateTotalWorkoutTime() {
  return exercises.reduce(
    (total, exercise) =>
      total + (exercise.duration + exercise.pause) * exercise.repetitions * 1000,
    0,
  );
}

function normalizeExercise(record, index) {
  const label = `Запись ${index + 1}`;

  if (record === null || typeof record !== "object") {
    throw new Error(`${label}: ожидается объект`);
  }

  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string"
    ? record.description.trim()
    : "";

  if (!id) {
    throw new Error(`${label}: отсутствует id`);
  }

  if (!name) {
    throw new Error(`${label}: отсутствует name`);
  }

  if (!Number.isInteger(record.duration) || record.duration <= 0) {
    throw new Error(`${label}: duration должен быть целым числом больше нуля`);
  }

  if (!Number.isInteger(record.pause) || record.pause < 0) {
    throw new Error(`${label}: pause должен быть целым неотрицательным числом`);
  }

  if (!Number.isInteger(record.repetitions) || record.repetitions <= 0) {
    throw new Error(`${label}: repetitions должен быть целым числом больше нуля`);
  }

  return {
    id,
    name,
    description,
    duration: record.duration,
    pause: record.pause,
    repetitions: record.repetitions,
  };
}

async function loadExercises() {
  try {
    const response = await fetch("exercises.json");

    if (!response.ok) {
      throw new Error(`Ошибка загрузки: ${response.status}`);
    }

    const source = await response.json();

    if (!Array.isArray(source) || source.length === 0) {
      throw new Error("exercises.json должен содержать непустой массив");
    }

    const loadedExercises = source.map(normalizeExercise);
    const uniqueIds = new Set(loadedExercises.map((exercise) => exercise.id));

    if (uniqueIds.size !== loadedExercises.length) {
      throw new Error("Все id в exercises.json должны быть уникальными");
    }

    exercises.splice(0, exercises.length, ...loadedExercises);
    totalWorkoutDuration = calculateTotalWorkoutTime();
    phaseTimeLeft = exercises[0].duration * 1000;
    totalTimeLeft = totalWorkoutDuration;
    elements.startButton.disabled = false;
    elements.addExerciseButton.disabled = false;
    renderSetup();
  } catch (error) {
    console.error(error);
    elements.routineLabel.textContent = "Ошибка загрузки данных";
    elements.exerciseList.innerHTML = `
      <li class="exercise-item">
        Не удалось загрузить exercises.json. Запустите приложение через локальный веб-сервер.
      </li>
    `;
  }
}

let totalWorkoutDuration = 0;

let currentExerciseIndex = 0;
let currentRepeat = 1;
let phase = "exercise";
let phaseTimeLeft = 0;
let totalTimeLeft = 0;
let isPaused = false;
let hasStarted = false;
let lastTickTimestamp = 0;
let timerId = null;
let isAudioReady = false;
let hasPlayedTransitionSound = false;
let editingExerciseIndex = null;

function prepareAudio() {
  if (isAudioReady) {
    return;
  }

  elements.transitionSound.muted = true;
  const playRequest = elements.transitionSound.play();

  if (playRequest !== undefined) {
    playRequest
      .then(() => {
        elements.transitionSound.pause();
        elements.transitionSound.currentTime = 0;
        elements.transitionSound.muted = false;
        elements.transitionSound.volume = 0.55;
        isAudioReady = true;
      })
      .catch(() => {
        elements.transitionSound.muted = false;
      });
    return;
  }

  elements.transitionSound.pause();
  elements.transitionSound.currentTime = 0;
  elements.transitionSound.muted = false;
  elements.transitionSound.volume = 0.55;
  isAudioReady = true;
}

function playTransitionDing() {
  elements.transitionSound.pause();
  elements.transitionSound.currentTime = 0;
  elements.transitionSound.play().catch(() => {});
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatInterval(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character],
  );
}

function formatExerciseCount(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} упражнений`;
  }

  if (lastDigit === 1) {
    return `${count} упражнение`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} упражнения`;
  }

  return `${count} упражнений`;
}

function createUniqueExerciseId() {
  let sequence = exercises.length + 1;
  let id = `exercise-${sequence}`;

  while (exercises.some((exercise) => exercise.id === id)) {
    sequence += 1;
    id = `exercise-${sequence}`;
  }

  return id;
}

function showView(activeView) {
  [elements.setupView, elements.workoutView, elements.completeView].forEach((view) => {
    view.hidden = view !== activeView;
  });
}

function renderSetup() {
  elements.routineLabel.textContent = `${formatTime(totalWorkoutDuration / 1000)} | ${formatExerciseCount(exercises.length)}`;
  elements.exerciseList.innerHTML = exercises
    .map(
      (exercise, index) => `
        <li class="exercise-item">
          <span class="exercise-item__number" aria-hidden="true">${index + 1}</span>
          <span class="exercise-item__copy">
            <span class="exercise-item__topline">
              <span class="exercise-item__name">${escapeHtml(exercise.name)}</span>
              <span class="exercise-item__meta">
                (${exercise.duration} с + ${exercise.pause} с) × ${exercise.repetitions}
              </span>
            </span>
            <span class="exercise-item__description">${escapeHtml(exercise.description)}</span>
          </span>
          <button
            class="exercise-item__edit"
            type="button"
            data-exercise-index="${index}"
            aria-label="Редактировать упражнение"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"></path>
              <path d="m13.5 6.5 4 4"></path>
            </svg>
          </button>
        </li>
      `,
    )
    .join("");
}

function openExerciseDialog(index = null) {
  const isEditing = index !== null;
  const exercise = isEditing
    ? exercises[index]
    : { name: "", description: "", duration: 15, pause: 5, repetitions: 10 };

  editingExerciseIndex = index;
  elements.exerciseDialogTitle.textContent = isEditing
    ? "Редактировать упражнение"
    : "Добавить упражнение";
  elements.exerciseFormSubmit.textContent = isEditing ? "Сохранить" : "Добавить";
  elements.exerciseDeleteButton.hidden = !isEditing;
  elements.exerciseDeleteButton.disabled = exercises.length <= 1;
  elements.exerciseDeleteButton.title = exercises.length <= 1
    ? "В тренировке должно остаться хотя бы одно упражнение"
    : "";
  elements.exerciseFormName.value = exercise.name;
  elements.exerciseFormDescription.value = exercise.description;
  elements.exerciseFormDuration.value = String(exercise.duration);
  elements.exerciseFormPause.value = String(exercise.pause);
  elements.exerciseFormRepetitions.value = String(exercise.repetitions);
  elements.exerciseFormName.setCustomValidity("");
  elements.exerciseFormDuration.setCustomValidity("");
  elements.exerciseFormPause.setCustomValidity("");
  elements.exerciseFormRepetitions.setCustomValidity("");
  elements.exerciseDialog.showModal();
  elements.exerciseFormName.focus();
}

function closeExerciseDialog() {
  elements.exerciseDialog.close();
}

function saveExercise(event) {
  event.preventDefault();

  const name = elements.exerciseFormName.value.trim();
  const description = elements.exerciseFormDescription.value.trim();
  const duration = Number(elements.exerciseFormDuration.value);
  const pause = Number(elements.exerciseFormPause.value);
  const repetitions = Number(elements.exerciseFormRepetitions.value);

  elements.exerciseFormName.setCustomValidity(name ? "" : "Введите название упражнения");
  elements.exerciseFormDuration.setCustomValidity(
    Number.isInteger(duration) && duration > 0
      ? ""
      : "Введите целое число больше нуля",
  );
  elements.exerciseFormPause.setCustomValidity(
    Number.isInteger(pause) && pause >= 0
      ? ""
      : "Введите целое неотрицательное число",
  );
  elements.exerciseFormRepetitions.setCustomValidity(
    Number.isInteger(repetitions) && repetitions > 0
      ? ""
      : "Введите целое число больше нуля",
  );

  if (!elements.exerciseForm.reportValidity()) {
    return;
  }

  const exercise = {
    id: editingExerciseIndex === null
      ? createUniqueExerciseId()
      : exercises[editingExerciseIndex].id,
    name,
    description,
    duration,
    pause,
    repetitions,
  };

  if (editingExerciseIndex === null) {
    exercises.push(exercise);
  } else {
    exercises[editingExerciseIndex] = exercise;
  }

  totalWorkoutDuration = calculateTotalWorkoutTime();
  phaseTimeLeft = exercises[0].duration * 1000;
  totalTimeLeft = totalWorkoutDuration;
  renderSetup();
  closeExerciseDialog();
}

function deleteExercise() {
  if (editingExerciseIndex === null || exercises.length <= 1) {
    return;
  }

  const exercise = exercises[editingExerciseIndex];
  const shouldDelete = globalThis.confirm(`Удалить упражнение «${exercise.name}»?`);

  if (!shouldDelete) {
    return;
  }

  exercises.splice(editingExerciseIndex, 1);
  totalWorkoutDuration = calculateTotalWorkoutTime();
  phaseTimeLeft = exercises[0].duration * 1000;
  totalTimeLeft = totalWorkoutDuration;
  renderSetup();
  closeExerciseDialog();
}

function renderWorkout() {
  const exercise = exercises[currentExerciseIndex];
  const nextExercise = exercises[currentExerciseIndex + 1];
  const exerciseDuration = exercise.duration * 1000;
  const pauseDuration = exercise.pause * 1000;
  const cycleDuration = exerciseDuration + pauseDuration;
  const exerciseEnd = phase === "exercise" ? (phaseTimeLeft / cycleDuration) * 100 : 0;
  const restStart = (exerciseDuration / cycleDuration) * 100;
  const restEnd = phase === "rest"
    ? restStart + (phaseTimeLeft / cycleDuration) * 100
    : 100;
  const ariaPhase = phase === "rest" ? "Пауза" : exercise.name;
  const exerciseSeconds = phase === "exercise" ? phaseTimeLeft / 1000 : exercise.duration;
  const restSeconds = phase === "rest" ? phaseTimeLeft / 1000 : exercise.pause;

  elements.exerciseProgress.textContent = `${currentExerciseIndex + 1} из ${exercises.length}`;
  elements.nextExercise.textContent = nextExercise ? nextExercise.name : "завершение";
  elements.repeatProgress.textContent = `${currentRepeat} / ${exercise.repetitions}`;
  elements.exerciseName.textContent = exercise.name;
  elements.exerciseTimeLeft.textContent = formatInterval(exerciseSeconds);
  elements.restTimeLeft.textContent = formatInterval(restSeconds);
  elements.totalTimeLeft.textContent = formatTime(totalTimeLeft / 1000);
  elements.pauseButton.classList.toggle("button--continue-pulse", isPaused);
  elements.timerRing.style.setProperty("--exercise-end", exerciseEnd.toFixed(2));
  elements.timerRing.style.setProperty("--rest-start", restStart.toFixed(2));
  elements.timerRing.style.setProperty("--rest-end", restEnd.toFixed(2));
  elements.timerRing.classList.toggle("timer-ring--rest", phase === "rest");
  elements.timerRing.setAttribute(
    "aria-label",
    `${ariaPhase}. Повтор ${currentRepeat} из ${exercise.repetitions}. Осталось ${Math.ceil(phaseTimeLeft / 1000)} секунд`,
  );
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function completeWorkout() {
  stopTimer();
  phaseTimeLeft = 0;
  totalTimeLeft = 0;
  isPaused = false;
  hasStarted = false;
  hasPlayedTransitionSound = false;
  showView(elements.completeView);
  elements.repeatButton.focus();
}

function moveToNextPhase() {
  const exercise = exercises[currentExerciseIndex];
  hasPlayedTransitionSound = false;

  if (phase === "exercise") {
    phase = "rest";
    phaseTimeLeft = exercise.pause * 1000;
    return true;
  }

  if (currentRepeat < exercise.repetitions) {
    currentRepeat += 1;
    phase = "exercise";
    phaseTimeLeft = exercise.duration * 1000;
    return true;
  }

  if (currentExerciseIndex < exercises.length - 1) {
    currentExerciseIndex += 1;
    currentRepeat = 1;
    phase = "exercise";
    phaseTimeLeft = exercises[currentExerciseIndex].duration * 1000;
    return true;
  }

  completeWorkout();
  return false;
}

function playTransitionSoundBeforeBoundary(timeApplied) {
  const timeAfterUpdate = phaseTimeLeft - timeApplied;

  if (
    !hasPlayedTransitionSound &&
    phaseTimeLeft > 0 &&
    timeAfterUpdate <= TRANSITION_SOUND_LEAD
  ) {
    playTransitionDing();
    hasPlayedTransitionSound = true;
  }
}

function advanceTime(elapsedMilliseconds) {
  let timeToApply = Math.max(0, elapsedMilliseconds);

  while (timeToApply >= phaseTimeLeft) {
    playTransitionSoundBeforeBoundary(phaseTimeLeft);
    timeToApply -= phaseTimeLeft;
    totalTimeLeft = Math.max(0, totalTimeLeft - phaseTimeLeft);

    if (!moveToNextPhase()) {
      return false;
    }
  }

  playTransitionSoundBeforeBoundary(timeToApply);
  phaseTimeLeft -= timeToApply;
  totalTimeLeft = Math.max(0, totalTimeLeft - timeToApply);
  return true;
}

function updateTimer() {
  if (isPaused) {
    return;
  }

  const now = Date.now();
  const elapsedMilliseconds = Math.max(0, now - lastTickTimestamp);
  lastTickTimestamp = now;

  if (advanceTime(elapsedMilliseconds)) {
    renderWorkout();
  }
}

function runTimer() {
  stopTimer();
  lastTickTimestamp = Date.now();
  timerId = setInterval(updateTimer, TICK_RATE);
}

function resetWorkout() {
  stopTimer();
  currentExerciseIndex = 0;
  currentRepeat = 1;
  phase = "exercise";
  phaseTimeLeft = exercises[0].duration * 1000;
  totalTimeLeft = totalWorkoutDuration;
  isPaused = false;
  hasStarted = false;
  hasPlayedTransitionSound = false;
  elements.pauseButton.textContent = "Начать";
  renderWorkout();
}

function startWorkout() {
  resetWorkout();
  showView(elements.workoutView);
}

function togglePause() {
  prepareAudio();

  if (!hasStarted) {
    hasStarted = true;
    isPaused = false;
    elements.pauseButton.textContent = "Пауза";
    renderWorkout();
    runTimer();
    return;
  }

  if (isPaused) {
    isPaused = false;
    elements.pauseButton.textContent = "Пауза";
    renderWorkout();
    runTimer();
    return;
  }

  updateTimer();

  if (elements.workoutView.hidden) {
    return;
  }

  isPaused = true;
  stopTimer();
  elements.pauseButton.textContent = "Продолжить";
  renderWorkout();
}

function stopWorkout() {
  resetWorkout();
  showView(elements.setupView);
  elements.startButton.focus();
}

elements.startButton.addEventListener("click", startWorkout);
elements.pauseButton.addEventListener("click", togglePause);
elements.stopButton.addEventListener("click", stopWorkout);
elements.repeatButton.addEventListener("click", startWorkout);
elements.addExerciseButton.addEventListener("click", () => openExerciseDialog());
elements.exerciseDialogClose.addEventListener("click", closeExerciseDialog);
elements.exerciseDialogCancel.addEventListener("click", closeExerciseDialog);
elements.exerciseForm.addEventListener("submit", saveExercise);
elements.exerciseDeleteButton.addEventListener("click", deleteExercise);
elements.exerciseList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".exercise-item__edit");

  if (editButton === null) {
    return;
  }

  openExerciseDialog(Number(editButton.dataset.exerciseIndex));
});
elements.exerciseDialog.addEventListener("close", () => {
  editingExerciseIndex = null;
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerId !== null) {
    updateTimer();
  }
});

loadExercises();
