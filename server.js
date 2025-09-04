const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
// 👉 1. Importa y configura 'debug'
const debugConnection = require('debug')('app:connection');
const debugGame = require('debug')('app:game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// --- Configuración ---
const canvasWidth = 800;
const canvasHeight = 600;
const paddleHeight = 100;
const paddleWidth = 20;
const WINNING_SCORE = 7;

// --- Estado del Juego ---
let gamePhase = 'waiting';
let playersReady = new Set();

const ball = { x: canvasWidth / 2, y: canvasHeight / 2, dx: 5, dy: 5, size: 15 };
const score = { left: 0, right: 0 };
const paddleState = {
  left: { y: canvasHeight / 2 - paddleHeight / 2 },
  right: { y: canvasHeight / 2 - paddleHeight / 2 },
};
const playerAssignments = {};

debugGame("🚀 Servidor Socket.IO listo para iniciar...");

function resetBall() {
  debugGame("⚽ Pelota reiniciada al centro");
  ball.x = canvasWidth / 2;
  ball.y = canvasHeight / 2;
  ball.dx = 5 * (Math.random() > 0.5 ? 1 : -1);
  ball.dy = 5 * (Math.random() > 0.5 ? 1 : -1);
}

function checkAndStartGame() {
  const activePlayers = Object.values(playerAssignments).filter(p => p !== 'spectator').length;
  if (activePlayers === 2) {
    debugGame("🎮 Ambos jugadores conectados. ¡Iniciando juego!");
    gamePhase = 'active';
    score.left = 0;
    score.right = 0;
    playersReady.clear();
    resetBall();
    io.emit("gameStart", { score });
  } else {
    debugGame("⏳ Esperando más jugadores...");
    gamePhase = 'waiting';
    playersReady.clear();
    io.emit("waitingForPlayers");
  }
}

function updateBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;
  if (ball.y <= 0 || ball.y + ball.size >= canvasHeight) ball.dy *= -1;

  let scorer = null;
  if (ball.x + ball.size < 0) scorer = 'right';
  if (ball.x > canvasWidth) scorer = 'left';

  if (scorer) {
    score[scorer]++;
    debugGame(`Punto para ${scorer}. Marcador: ${score.left} - ${score.right}`);
    io.emit("scoreUpdate", score);
    if (score[scorer] >= WINNING_SCORE) {
      gamePhase = 'gameOver';
      playersReady.clear();
      debugGame(`Juego terminado. Ganador: ${scorer}`);
      io.emit("gameOver", { winner: scorer });
    } else {
      resetBall();
    }
    return;
  }
  
  const ballRect = { left: ball.x, right: ball.x + ball.size, top: ball.y, bottom: ball.y + ball.size };
  const leftPaddle = { left: 0, right: paddleWidth, top: paddleState.left.y, bottom: paddleState.left.y + paddleHeight };
  const rightPaddle = { left: canvasWidth - paddleWidth, right: canvasWidth, top: paddleState.right.y, bottom: paddleState.right.y + paddleHeight };
  if (ballRect.left < leftPaddle.right && ballRect.right > leftPaddle.left && ballRect.top < leftPaddle.bottom && ballRect.bottom > leftPaddle.top) { const impactPoint = (ball.y + ball.size / 2) - (leftPaddle.top + paddleHeight / 2); ball.dy = (impactPoint / (paddleHeight / 2)) * 5; ball.dx = Math.abs(ball.dx) * 1.05; ball.x = leftPaddle.right; }
  if (ballRect.right > rightPaddle.left && ballRect.left < rightPaddle.right && ballRect.top < rightPaddle.bottom && ballRect.bottom > rightPaddle.top) { const impactPoint = (ball.y + ball.size / 2) - (rightPaddle.top + paddleHeight / 2); ball.dy = (impactPoint / (paddleHeight / 2)) * 5; ball.dx = -Math.abs(ball.dx) * 1.05; ball.x = rightPaddle.left - ball.size; }
}

io.on("connection", (socket) => {
  debugConnection("🔌 Nuevo jugador conectado: %s", socket.id);
  const assignedSides = Object.values(playerAssignments);
  let side = 'spectator';
  if (!assignedSides.includes('left')) side = 'left';
  else if (!assignedSides.includes('right')) side = 'right';

  playerAssignments[socket.id] = side;
  socket.emit("playerSide", { side });
  socket.emit("scoreUpdate", score);
  debugConnection(`Asignado ${socket.id} al lado ${side}`);
  checkAndStartGame();

  socket.on("movePaddle", ({ side, y }) => {
    if (playerAssignments[socket.id] === side && paddleState[side]) paddleState[side].y = y * canvasHeight;
  });
  
  socket.on("restartGame", () => {
    if (gamePhase === 'gameOver') {
      playersReady.add(socket.id);
      const activePlayersCount = Object.values(playerAssignments).filter(p => p !== 'spectator').length;
      
      if (playersReady.size === activePlayersCount && activePlayersCount === 2) {
        debugGame("🔄 Ambos jugadores listos. Reiniciando...");
        paddleState.left.y = canvasHeight / 2 - paddleHeight / 2;
        paddleState.right.y = canvasHeight / 2 - paddleHeight / 2;
        checkAndStartGame();
      } else {
        debugGame(`⏳ Jugador ${socket.id} está listo. Esperando al oponente...`);
      }
    }
  });

  socket.on("disconnect", () => {
    debugConnection("❌ Jugador desconectado: %s", socket.id);
    playersReady.delete(socket.id);
    delete playerAssignments[socket.id];
    checkAndStartGame();
  });
});

setInterval(() => {
  if (gamePhase === 'active') updateBall();
  const gameState = { ball: { x: ball.x / canvasWidth, y: ball.y / canvasHeight, size: ball.size / canvasWidth }, paddles: { left: { y: paddleState.left.y / canvasHeight }, right: { y: paddleState.right.y / canvasHeight } } };
  io.emit("gameState", gameState);
}, 16);

// Usamos la versión compatible con Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  debugGame(`🚀 Servidor Socket.IO corriendo en el puerto ${PORT}`);
});