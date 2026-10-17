(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const dot = document.getElementById("statusDot");
  const connectBtn = document.getElementById("connectBtn");
  const nameInput = document.getElementById("playerName");
  const roomCount = document.getElementById("roomCount");
  const chatLog = document.getElementById("chatLog");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const joystick = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  const jumpBtn = document.getElementById("jumpBtn");
  const notice = document.getElementById("notice");
  const crystalCountEl = document.getElementById("crystalCount");

  const WORLD = { width: 2200, height: 1400 };
  const keys = new Set();
  const players = new Map();
  const crystals = [];
  let socket = null, myId = null, connected = false, myName = "Игрок";
  let camera = { x: 0, y: 0 }, joystickVector = { x: 0, y: 0 }, joyPointer = null;
  let crystalsCollected = 0, lastSent = 0;
  const me = { x: 300, y: 300, color: "#b4a7ff", jump: 0, jumpV: 0 };
  for (let i = 0; i < 65; i++) crystals.push({ x: 80 + Math.random() * (WORLD.width - 160), y: 80 + Math.random() * (WORLD.height - 160), got: false });

  function setStatus(text, online) {
    statusEl.textContent = text; dot.classList.toggle("online", !!online);
  }
  function showNotice(text) {
    notice.textContent = text; notice.hidden = false;
    setTimeout(() => { notice.hidden = true; }, 2600);
  }
  function addChat(name, text) {
    const line = document.createElement("div"); line.className = "chat-line";
    const b = document.createElement("b"); b.textContent = name + ": ";
    const span = document.createElement("span"); span.textContent = text;
    line.append(b, span); chatLog.appendChild(line);
    while (chatLog.children.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function updateCount() { roomCount.textContent = `Игроков: ${players.size + (myId ? 0 : 0)}/${20}`; }
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(); return;
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;
    myName = (nameInput.value.trim() || "Игрок").slice(0, 18);
    setStatus("Подключение…", false); connectBtn.textContent = "Подключение…";
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      connected = true; setStatus("Онлайн", true); connectBtn.textContent = "Отключиться";
      socket.send(JSON.stringify({ type: "hello", name: myName }));
    });
    socket.addEventListener("message", event => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === "welcome") {
        myId = msg.id; if (msg.world) Object.assign(WORLD, msg.world);
        players.clear(); (msg.players || []).forEach(p => players.set(p.id, p));
        me.x = Math.max(80, Math.min(WORLD.width - 80, me.x)); me.y = Math.max(80, Math.min(WORLD.height - 80, me.y));
        players.set(myId, { id: myId, name: myName, x: me.x, y: me.y, color: me.color });
        updateCount(); addChat("Система", "Ты подключился к городу.");
      } else if (msg.type === "join") {
        players.set(msg.player.id, msg.player); updateCount();
      } else if (msg.type === "rename") {
        const p = players.get(msg.id); if (p) p.name = msg.name;
      } else if (msg.type === "move") {
        const p = players.get(msg.id); if (p) { p.x = msg.x; p.y = msg.y; }
      } else if (msg.type === "leave") {
        players.delete(msg.id); updateCount();
      } else if (msg.type === "chat") addChat(msg.name, msg.text);
      else if (msg.type === "full") showNotice(msg.message || "Комната заполнена.");
    });
    socket.addEventListener("close", () => {
      connected = false; myId = null; setStatus("Не подключено", false); connectBtn.textContent = "Играть онлайн";
      players.clear(); updateCount();
    });
    socket.addEventListener("error", () => showNotice("Не удалось подключиться. Проверь адрес сайта и сервер."));
  }
  connectBtn.addEventListener("click", connect);

  function resize() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize); resize();
  window.addEventListener("keydown", e => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    if (e.key === " " && !e.repeat) jump();
  });
  window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  function jump() { if (me.jump <= 0) me.jumpV = 7; }
  jumpBtn.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });

  function setJoy(e) {
    const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy, max = r.width * .32;
    const len = Math.hypot(dx, dy); if (len > max) { dx *= max / len; dy *= max / len; }
    joystickVector = { x: dx / max, y: dy / max };
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  joystick.addEventListener("pointerdown", e => { joyPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); setJoy(e); });
  joystick.addEventListener("pointermove", e => { if (e.pointerId === joyPointer) setJoy(e); });
  function resetJoy() { joyPointer = null; joystickVector = {x:0,y:0}; stick.style.transform = "translate(0,0)"; }
  joystick.addEventListener("pointerup", resetJoy); joystick.addEventListener("pointercancel", resetJoy);

  chatForm.addEventListener("submit", e => {
    e.preventDefault(); const text = chatInput.value.trim(); if (!text) return;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "chat", text }));
    else addChat("Локально", text);
    chatInput.value = "";
  });

  function moveMe(dt) {
    let x = joystickVector.x, y = joystickVector.y;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    const speed = 230 * dt;
    me.x = Math.max(25, Math.min(WORLD.width - 25, me.x + x * speed));
    me.y = Math.max(25, Math.min(WORLD.height - 25, me.y + y * speed));
    me.jump = Math.max(0, me.jump + me.jumpV);
    if (me.jump > 0) me.jumpV -= 0.55; else { me.jump = 0; me.jumpV = 0; }
    if (myId) {
      const p = players.get(myId);
      if (p) { p.x = me.x; p.y = me.y; }
    }
    for (const c of crystals) {
      if (!c.got && Math.hypot(c.x - me.x, c.y - me.y) < 27) {
        c.got = true; crystalsCollected++; crystalCountEl.textContent = `Кристаллы: ${crystalsCollected}`;
      }
    }
    if (socket && socket.readyState === WebSocket.OPEN && myId && performance.now() - lastSent > 50) {
      lastSent = performance.now(); socket.send(JSON.stringify({ type: "move", x: me.x, y: me.y }));
    }
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    camera.x = Math.max(0, Math.min(WORLD.width - w, me.x - w / 2));
    camera.y = Math.max(0, Math.min(WORLD.height - h, me.y - h / 2));
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    ctx.fillStyle = "#b7d99b"; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    // Roads
    ctx.fillStyle = "#d8d1b8";
    for (let x = 0; x < WORLD.width; x += 440) ctx.fillRect(x, 0, 100, WORLD.height);
    for (let y = 0; y < WORLD.height; y += 360) ctx.fillRect(0, y, WORLD.width, 76);
    ctx.strokeStyle = "#fff0bd"; ctx.lineWidth = 3; ctx.setLineDash([18, 16]);
    for (let x = 50; x < WORLD.width; x += 440) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,WORLD.height); ctx.stroke(); }
    for (let y = 38; y < WORLD.height; y += 360) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(WORLD.width,y); ctx.stroke(); }
    ctx.setLineDash([]);
    // Houses and parks
    for (let x = 140; x < WORLD.width - 100; x += 440) for (let y = 120; y < WORLD.height - 80; y += 360) {
      ctx.fillStyle = "#89bd82"; ctx.fillRect(x, y, 230, 190);
      for (let k = 0; k < 3; k++) {
        const hx = x + 18 + k * 70, hy = y + 22 + (k % 2) * 65;
        ctx.fillStyle = ["#f4a261","#ef8f9d","#8db7e8"][k]; ctx.fillRect(hx, hy, 52, 46);
        ctx.fillStyle = "#fff0d5"; ctx.fillRect(hx + 8, hy + 8, 11, 12); ctx.fillRect(hx + 32, hy + 8, 11, 12);
        ctx.fillStyle = "#795548"; ctx.fillRect(hx + 21, hy + 27, 12, 19);
      }
    }
    // Crystals
    crystals.forEach(c => { if (!c.got) { ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(Math.PI/4); ctx.fillStyle="#8d63ff"; ctx.fillRect(-7,-7,14,14); ctx.strokeStyle="#e1d7ff"; ctx.lineWidth=2; ctx.strokeRect(-7,-7,14,14); ctx.restore(); } });
    // Other players and local player
    for (const p of players.values()) drawPlayer(p, p.id === myId, p.x, p.y);
    if (!connected) drawPlayer({name:"Ты",color:me.color}, true, me.x, me.y);
    ctx.restore();
    // Minimap
    const mw = 100, mh = 64, mx = w - mw - 12, my = h - mh - 12;
    ctx.fillStyle = "#101827cc"; ctx.fillRect(mx,my,mw,mh); ctx.strokeStyle="#ffffff88"; ctx.strokeRect(mx,my,mw,mh);
    for (const p of players.values()) { ctx.fillStyle = p.color || "#fff"; ctx.fillRect(mx + p.x / WORLD.width * mw - 2, my + p.y / WORLD.height * mh - 2, 4, 4); }
    if (!connected) { ctx.fillStyle = me.color; ctx.fillRect(mx + me.x / WORLD.width * mw - 2, my + me.y / WORLD.height * mh - 2, 4, 4); }
  }
  function drawPlayer(p, isMe, x, y) {
    const lift = isMe ? me.jump : 0;
    ctx.fillStyle = "#00000022"; ctx.beginPath(); ctx.ellipse(x,y+11,17,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = p.color || "#b4a7ff"; ctx.beginPath(); ctx.arc(x,y- lift,15,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x-5,y- lift-3,3,0,Math.PI*2); ctx.arc(x+5,y- lift-3,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#172033"; ctx.beginPath(); ctx.arc(x-5,y- lift-3,1.4,0,Math.PI*2); ctx.arc(x+5,y- lift-3,1.4,0,Math.PI*2); ctx.fill();
    ctx.font = "12px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.strokeText(p.name || "Игрок",x,y-lift-23); ctx.fillStyle="#182238"; ctx.fillText(p.name || "Игрок",x,y-lift-23);
  }
  let last = performance.now();
  function loop(now) { const dt = Math.min(.04,(now-last)/1000); last = now; moveMe(dt); draw(); requestAnimationFrame(loop); }
  updateCount(); addChat("Система", "Добро пожаловать! Подключись к серверу, чтобы увидеть других игроков.");
  requestAnimationFrame(loop);
})();
