const GRID_SIZE = 8;
const ROUND_SECONDS = 60;
const BEST_SCORE_KEY = "orchard-best-score";

const boardElement = document.querySelector("#game-board");
const currentScoreElement = document.querySelector("#current-score");
const bestScoreElement = document.querySelector("#best-score");
const footerBestScoreElement = document.querySelector("#footer-best-score");
const timerElement = document.querySelector("#timer");
const timerFillElement = document.querySelector("#timer-fill");
const selectionSumElement = document.querySelector("#selection-sum b");
const statusMessageElement = document.querySelector("#status-message");
const startButton = document.querySelector("#start-button");
const startLabel = document.querySelector("#start-label");
const resultOverlay = document.querySelector("#result-overlay");
const finalScoreElement = document.querySelector("#final-score");
const restartButton = document.querySelector("#restart-button");
const confettiCanvas = document.querySelector("#confetti-canvas");
const confettiContext = confettiCanvas.getContext("2d");

let board = [];
let selectedCells = [];
let score = 0;
let bestScore = readBestScore();
let gameState = "ready";
let pointerIsDown = false;
let timerInterval = null;
let deadline = 0;

function randomDigit() {
  return Math.floor(Math.random() * 9) + 1;
}

function createBoard() {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, randomDigit),
  );
}

function readBestScore() {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function formatScore(value) {
  return String(value).padStart(4, "0");
}

function renderScores() {
  currentScoreElement.textContent = formatScore(score);
  bestScoreElement.textContent = formatScore(bestScore);
  footerBestScoreElement.textContent = formatScore(bestScore);
}

function renderBoard(fallingColumns = new Set()) {
  const fragment = document.createDocumentFragment();

  board.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.row = rowIndex;
      tile.dataset.column = columnIndex;
      tile.style.setProperty("--fall-delay", `${rowIndex * 24}ms`);
      tile.setAttribute("role", "gridcell");
      tile.setAttribute(
        "aria-label",
        value === null
          ? `행 ${rowIndex + 1}, 열 ${columnIndex + 1}: 빈칸`
          : `행 ${rowIndex + 1}, 열 ${columnIndex + 1}: ${value}`,
      );

      if (value === null) {
        tile.classList.add("is-empty");
        tile.disabled = true;
      } else {
        const apple = document.createElement("span");
        apple.className = "apple-icon";
        apple.setAttribute("aria-hidden", "true");
        apple.textContent = "🍎";

        const number = document.createElement("span");
        number.className = "tile-value";
        number.textContent = value;

        tile.append(apple, number);
        tile.disabled = gameState !== "playing";
        if (fallingColumns.has(columnIndex)) tile.classList.add("is-falling");
      }

      fragment.append(tile);
    });
  });

  boardElement.replaceChildren(fragment);
}

function updateTimer() {
  const millisecondsLeft = Math.max(0, deadline - Date.now());
  const secondsLeft = Math.ceil(millisecondsLeft / 1000);
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  timerElement.textContent = `${minutes}:${seconds}`;
  timerFillElement.style.transform = `scaleX(${millisecondsLeft / (ROUND_SECONDS * 1000)})`;
  timerFillElement.classList.toggle("is-low", secondsLeft <= 10);

  if (millisecondsLeft <= 0) finishGame();
}

function getSelectionSum() {
  return selectedCells.reduce(
    (total, cell) => total + board[cell.row][cell.column],
    0,
  );
}

function updateSelection() {
  const sum = getSelectionSum();
  const isValid = selectedCells.length > 1 && sum % 10 === 0;
  selectionSumElement.textContent = sum;

  boardElement.querySelectorAll(".tile:not(.is-empty)").forEach((tile) => {
    const row = Number(tile.dataset.row);
    const column = Number(tile.dataset.column);
    const isSelected = selectedCells.some(
      (cell) => cell.row === row && cell.column === column,
    );
    tile.classList.toggle("is-selected", isSelected);
    tile.classList.toggle("is-valid", isValid && isSelected);
  });

  if (selectedCells.length > 0) {
    statusMessageElement.textContent = isValid
      ? "좋아요! 손을 놓아 사과를 따세요."
      : `현재 합계 ${sum}`;
  }
}

function clearSelection() {
  selectedCells = [];
  selectionSumElement.textContent = "0";
  boardElement.querySelectorAll(".tile").forEach((tile) => {
    tile.classList.remove("is-selected", "is-valid");
  });
}

function areAdjacent(first, second) {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

function selectCell(row, column) {
  if (gameState !== "playing" || board[row][column] === null) return;

  const nextCell = { row, column };
  const lastCell = selectedCells.at(-1);
  if (lastCell?.row === row && lastCell?.column === column) return;

  if (selectedCells.length > 1) {
    const previousCell = selectedCells.at(-2);
    if (previousCell.row === row && previousCell.column === column) {
      selectedCells.pop();
      updateSelection();
      return;
    }
  }

  const alreadySelected = selectedCells.some(
    (cell) => cell.row === row && cell.column === column,
  );
  if (alreadySelected || (lastCell && !areAdjacent(lastCell, nextCell))) return;

  selectedCells.push(nextCell);
  updateSelection();
}

function resolveSelection() {
  if (selectedCells.length < 2 || getSelectionSum() % 10 !== 0) {
    clearSelection();
    if (gameState === "playing") {
      statusMessageElement.textContent = "합이 10의 배수일 때 사과를 딸 수 있어요.";
    }
    return;
  }

  const gainedPoints = getSelectionSum();
  const affectedColumns = new Set(selectedCells.map(({ column }) => column));
  selectedCells.forEach(({ row, column }) => {
    board[row][column] = null;
  });

  affectedColumns.forEach((column) => {
    let destinationRow = GRID_SIZE - 1;
    for (let row = GRID_SIZE - 1; row >= 0; row -= 1) {
      if (board[row][column] === null) continue;
      board[destinationRow][column] = board[row][column];
      destinationRow -= 1;
    }
    while (destinationRow >= 0) {
      board[destinationRow][column] = randomDigit();
      destinationRow -= 1;
    }
  });

  score += gainedPoints;
  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
    celebrateRecord();
  }

  clearSelection();
  renderBoard(affectedColumns);
  renderScores();
  statusMessageElement.textContent = `+${gainedPoints}점! 계속 이어보세요.`;
}

function startGame() {
  window.clearInterval(timerInterval);
  board = createBoard();
  selectedCells = [];
  score = 0;
  gameState = "playing";
  pointerIsDown = false;
  deadline = Date.now() + ROUND_SECONDS * 1000;
  resultOverlay.hidden = true;
  boardElement.classList.remove("is-locked");
  startLabel.textContent = "새 게임";
  statusMessageElement.textContent = "이웃한 숫자를 드래그해 연결하세요.";

  renderBoard();
  renderScores();
  updateTimer();
  timerInterval = window.setInterval(updateTimer, 100);
}

function finishGame() {
  if (gameState !== "playing") return;

  window.clearInterval(timerInterval);
  timerInterval = null;
  gameState = "finished";
  pointerIsDown = false;
  clearSelection();
  boardElement.classList.add("is-locked");
  boardElement.querySelectorAll(".tile:not(.is-empty)").forEach((tile) => {
    tile.disabled = true;
  });
  startLabel.textContent = "다시 시작";
  finalScoreElement.textContent = formatScore(score);
  resultOverlay.hidden = false;
  restartButton.focus();
}

function tileAtPoint(event) {
  return document.elementFromPoint(event.clientX, event.clientY)?.closest(".tile") ?? null;
}

function celebrateRecord() {
  if (!confettiContext || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  confettiCanvas.width = Math.floor(width * pixelRatio);
  confettiCanvas.height = Math.floor(height * pixelRatio);
  confettiContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const colors = ["#c84b3a", "#527353", "#e3ad45", "#f1d989", "#7d9b62"];
  const particles = Array.from({ length: 120 }, () => ({
    x: width / 2,
    y: 20,
    velocityX: (Math.random() - 0.5) * 10,
    velocityY: Math.random() * -4 - 2,
    rotation: Math.random() * Math.PI,
    rotationSpeed: (Math.random() - 0.5) * 0.18,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const startedAt = performance.now();

  function animateConfetti(timestamp) {
    confettiContext.clearRect(0, 0, width, height);
    particles.forEach((particle) => {
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;
      particle.velocityY += 0.12;
      particle.rotation += particle.rotationSpeed;

      confettiContext.save();
      confettiContext.translate(particle.x, particle.y);
      confettiContext.rotate(particle.rotation);
      confettiContext.fillStyle = particle.color;
      confettiContext.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.65);
      confettiContext.restore();
    });

    if (timestamp - startedAt < 2400) {
      requestAnimationFrame(animateConfetti);
    } else {
      confettiContext.clearRect(0, 0, width, height);
    }
  }

  requestAnimationFrame(animateConfetti);
}

boardElement.addEventListener("pointerdown", (event) => {
  const tile = event.target.closest(".tile");
  if (!tile || tile.disabled || gameState !== "playing") return;

  event.preventDefault();
  pointerIsDown = true;
  boardElement.setPointerCapture(event.pointerId);
  selectCell(Number(tile.dataset.row), Number(tile.dataset.column));
});

boardElement.addEventListener("pointermove", (event) => {
  if (!pointerIsDown) return;
  const tile = tileAtPoint(event);
  if (tile && !tile.disabled) {
    selectCell(Number(tile.dataset.row), Number(tile.dataset.column));
  }
});

boardElement.addEventListener("pointerup", () => {
  if (!pointerIsDown) return;
  pointerIsDown = false;
  resolveSelection();
});

boardElement.addEventListener("pointercancel", () => {
  if (!pointerIsDown) return;
  pointerIsDown = false;
  clearSelection();
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

board = createBoard();
renderBoard();
renderScores();