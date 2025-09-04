const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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
let playersReady = new Set(); // 👉 Para registrar quién está listo para la revancha

const ball = { x: canvasWidth / 2, y: canvasHeight / 2, dx: 5, dy: 5, size: 15 };
const score = { left: 0, right: 0 };
const paddleState = {
  left: { y: canvasHeight / 2 - paddleHeight / 2 },
  right: { y: canvasHeight / 2 - paddleHeight / 2 },
};
const playerAssignments = {};

console.log("🚀 Servidor Socket.IO listo...");

function resetBall() {
  ball.x = canvasWidth / 2;
  ball.y = canvasHeight / 2;
  ball.dx = 5 * (Math.random() > 0.5 ? 1 : -1);
  ball.dy = 5 * (Math.random() > 0.5 ? 1 : -1);
}

function checkAndStartGame() {
  const activePlayers = Object.values(playerAssignments).filter(p => p !== 'spectator').length;
  if (activePlayers === 2) {
    console.log("🎮 Ambos jugadores conectados. ¡Iniciando juego!");
    gamePhase = 'active';
    score.left = 0;
    score.right = 0;
    playersReady.clear(); // Limpia la lista de listos para la siguiente partida
    resetBall();
    io.emit("gameStart", { score });
  } else {
    console.log("⏳ Esperando más jugadores...");
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
    io.emit("scoreUpdate", score);
    if (score[scorer] >= WINNING_SCORE) {
      gamePhase = 'gameOver';
      playersReady.clear(); // Limpia la lista al terminar el juego
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
  console.log("🔌 Nuevo jugador conectado:", socket.id);
  const assignedSides = Object.values(playerAssignments);
  let side = 'spectator';
  if (!assignedSides.includes('left')) side = 'left';
  else if (!assignedSides.includes('right')) side = 'right';

  playerAssignments[socket.id] = side;
  socket.emit("playerSide", { side });
  socket.emit("scoreUpdate", score);
  console.log(`Asignado ${socket.id} al lado ${side}`);
  checkAndStartGame();

  socket.on("movePaddle", ({ side, y }) => {
    if (playerAssignments[socket.id] === side && paddleState[side]) paddleState[side].y = y * canvasHeight;
  });
  
  // 👉 LÓGICA DE REVANCHA MODIFICADA
  socket.on("restartGame", () => {
    if (gamePhase === 'gameOver') {
      playersReady.add(socket.id); // Añade al jugador actual a la lista de listos
      const activePlayersCount = Object.values(playerAssignments).filter(p => p !== 'spectator').length;
      
      // Si todos los jugadores activos están listos, reinicia
      if (playersReady.size === activePlayersCount && activePlayersCount === 2) {
        console.log("🔄 Ambos jugadores listos. Reiniciando...");
        paddleState.left.y = canvasHeight / 2 - paddleHeight / 2;
        paddleState.right.y = canvasHeight / 2 - paddleHeight / 2;
        checkAndStartGame();
      } else {
        console.log(`⏳ Jugador ${socket.id} está listo. Esperando al oponente...`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Jugador desconectado:", socket.id);
    playersReady.delete(socket.id); // Quítalo de la lista de listos si se desconecta
    delete playerAssignments[socket.id];
    checkAndStartGame();
  });
});

setInterval(() => {
  if (gamePhase === 'active') updateBall();
  const gameState = { ball: { x: ball.x / canvasWidth, y: ball.y / canvasHeight, size: ball.size / canvasWidth }, paddles: { left: { y: paddleState.left.y / canvasHeight }, right: { y: paddleState.right.y / canvasHeight } } };
  io.emit("gameState", gameState);
}, 16);

server.listen(3000, () => {
  console.log("🚀 Servidor Socket.IO corriendo en http://localhost:3000");
});