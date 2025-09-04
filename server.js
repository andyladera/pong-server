const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// --- Configuración del juego ---
const canvasWidth = 800;
const canvasHeight = 600;
const paddleHeight = 100;
const paddleWidth = 20;
const WINNING_SCORE = 7; // Puntuación para ganar

// --- Estado del Juego ---
let isGameActive = true;

const ball = {
  x: canvasWidth / 2,
  y: canvasHeight / 2,
  dx: 5,
  dy: 5,
  size: 15,
};

const score = {
  left: 0,
  right: 0,
};

const paddleState = {
  left: { y: canvasHeight / 2 - paddleHeight / 2 },
  right: { y: canvasHeight / 2 - paddleHeight / 2 },
};

const playerAssignments = {}; // Ej: { 'socket_id_123': 'left' }

console.log("🚀 Servidor Socket.IO listo...");

function resetBall() {
  console.log("⚽ Pelota reiniciada al centro");
  ball.x = canvasWidth / 2;
  ball.y = canvasHeight / 2;
  ball.dx = 5 * (Math.random() > 0.5 ? 1 : -1);
  ball.dy = 5 * (Math.random() > 0.5 ? 1 : -1);
}

function updateBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.y <= 0 || ball.y + ball.size >= canvasHeight) {
    ball.dy *= -1;
  }

  // Lógica de Puntuación y Victoria
  if (ball.x + ball.size < 0) { // Punto para la derecha
    score.right++;
    io.emit("scoreUpdate", score);
    if (score.right >= WINNING_SCORE) {
      isGameActive = false;
      io.emit("gameOver", { winner: "right" });
    } else {
      resetBall();
    }
    return;
  }
  if (ball.x > canvasWidth) { // Punto para la izquierda
    score.left++;
    io.emit("scoreUpdate", score);
    if (score.left >= WINNING_SCORE) {
      isGameActive = false;
      io.emit("gameOver", { winner: "left" });
    } else {
      resetBall();
    }
    return;
  }

  const ballRect = {
    left: ball.x, right: ball.x + ball.size,
    top: ball.y, bottom: ball.y + ball.size,
  };

  const leftPaddle = {
    left: 0, right: paddleWidth,
    top: paddleState.left.y, bottom: paddleState.left.y + paddleHeight,
  };

  const rightPaddle = {
    left: canvasWidth - paddleWidth, right: canvasWidth,
    top: paddleState.right.y, bottom: paddleState.right.y + paddleHeight,
  };

  // Colisión con paleta izquierda
  if (
    ballRect.left < leftPaddle.right && ballRect.right > leftPaddle.left &&
    ballRect.top < leftPaddle.bottom && ballRect.bottom > leftPaddle.top
  ) {
    const impactPoint = (ball.y + ball.size / 2) - (leftPaddle.top + paddleHeight / 2);
    const normalizedImpact = impactPoint / (paddleHeight / 2);
    ball.dy = normalizedImpact * 5;
    ball.dx = Math.abs(ball.dx) * 1.05;
    ball.x = leftPaddle.right;
  }

  // Colisión con paleta derecha
  if (
    ballRect.right > rightPaddle.left && ballRect.left < rightPaddle.right &&
    ballRect.top < rightPaddle.bottom && ballRect.bottom > rightPaddle.top
  ) {
    const impactPoint = (ball.y + ball.size / 2) - (rightPaddle.top + paddleHeight / 2);
    const normalizedImpact = impactPoint / (paddleHeight / 2);
    ball.dy = normalizedImpact * 5;
    ball.dx = -Math.abs(ball.dx) * 1.05;
    ball.x = rightPaddle.left - ball.size;
  }
}

io.on("connection", (socket) => {
  console.log("🔌 Nuevo jugador conectado:", socket.id);

  const assignedSides = Object.values(playerAssignments);
  let side;
  if (!assignedSides.includes('left')) {
    side = 'left';
  } else if (!assignedSides.includes('right')) {
    side = 'right';
  } else {
    side = 'spectator';
  }

  playerAssignments[socket.id] = side;
  socket.emit("playerSide", { side });
  socket.emit("scoreUpdate", score); // Enviar marcador al nuevo jugador
  console.log(`Asignado ${socket.id} al lado ${side}`);

  socket.on("movePaddle", ({ side, y }) => {
    if (playerAssignments[socket.id] === side && paddleState[side]) {
      paddleState[side].y = y * canvasHeight;
    }
  });
  
  socket.on("restartGame", () => {
    console.log("🔄 Reiniciando el juego...");
    score.left = 0;
    score.right = 0;
    isGameActive = true;
    resetBall();
    io.emit("gameRestart", { score });
  });

  socket.on("disconnect", () => {
    console.log("❌ Jugador desconectado:", socket.id);
    delete playerAssignments[socket.id];
  });
});

setInterval(() => {
  if (isGameActive) {
    updateBall();
  }

  const gameState = {
    ball: {
      x: ball.x / canvasWidth,
      y: ball.y / canvasHeight,
      size: ball.size / canvasWidth,
    },
    paddles: {
      left: { y: paddleState.left.y / canvasHeight },
      right: { y: paddleState.right.y / canvasHeight },
    },
  };

  io.emit("gameState", gameState);
}, 16);

server.listen(3000, () => {
  console.log("🚀 Servidor Socket.IO corriendo en http://localhost:3000");
});