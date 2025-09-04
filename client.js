const { io } = require("socket.io-client");

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("✅ Conectado al servidor con id:", socket.id);
  socket.emit("move", { player: "A", y: 100 });
});

socket.on("move", (data) => {
  console.log("📡 Movimiento recibido:", data);
});

socket.on("disconnect", () => {
  console.log("❌ Desconectado del servidor");
});
