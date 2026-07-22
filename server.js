const express = require('express');
const app = express();
const port = 3000;
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const DB_FILE = 'chat.json';
const userCooldown = {};

function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, messages: [] }));
  }
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE));
  } catch {
    return { users: {}, messages: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getRealIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection.remoteAddress || 'unknown';
}

initDB();

// Настройка загрузки видео
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + unique + '.webm');
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use('/uploads', express.static('uploads'));

// Главная
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Логин
app.post('/login', (req, res) => {
  const { nick, password, deviceId } = req.body;
  if (!nick || !password || !deviceId) {
    return res.send(`<h2 style='color:red'>❌ Все поля обязательны</h2><a href='/'>Назад</a>`);
  }

  const cleanNick = nick.trim();
  if (cleanNick.length < 2 || cleanNick.length > 20) {
    return res.send(`<h2 style='color:red'>❌ Ник должен быть 2-20 символов</h2><a href='/'>Назад</a>`);
  }

  const db = readDB();
  const userIP = getRealIP(req);
  const hashedPassword = hashPassword(password);

  if (db.users[cleanNick]) {
    if (db.users[cleanNick].password !== hashedPassword) {
      return res.send(`<h2 style='color:red'>❌ Неверный пароль!</h2><a href='/'>Назад</a>`);
    }
    db.users[cleanNick].deviceId = deviceId;
    db.users[cleanNick].ip = userIP;
    writeDB(db);
    return res.redirect(`/chat/${encodeURIComponent(cleanNick)}`);
  }

  const existingUserWithIP = Object.entries(db.users).find(([name, data]) => data.ip === userIP);
  if (existingUserWithIP) {
    return res.send(`
      <h2 style='color:red'>❌ С этого IP уже зарегистрирован аккаунт: <strong>${existingUserWithIP[0]}</strong></h2>
      <p style='color:#0f0;'>Используйте этот ник или войдите с другого IP.</p>
      <a href='/'>Назад</a>
    `);
  }

  db.users[cleanNick] = {
    password: hashedPassword,
    deviceId: deviceId,
    ip: userIP,
    joined: new Date().toISOString(),
    status: '☕ Тут могла быть ваша реклама',
    rating: 0,
    posts: [],
    bio: 'Пока ничего о себе не написал'
  };
  writeDB(db);
  res.redirect(`/chat/${encodeURIComponent(cleanNick)}`);
});

// Чат
app.get('/chat/:nick', (req, res) => {
  const nick = decodeURIComponent(req.params.nick);
  const page = parseInt(req.query.page) || 0;
  const limit = 10;

  const db = readDB();
  if (!db.users[nick]) return res.redirect('/');

  const messages = db.messages || [];
  const visibleMsgs = messages.filter(m => !m.hidden_for?.includes(nick));
  const total = visibleMsgs.length;
  const start = Math.max(0, total - (page + 1) * limit);
  const end = total - page * limit;
  const pageMsgs = visibleMsgs.slice(start, end);

  const msgHtml = pageMsgs.length > 0
    ? pageMsgs.map(m => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #0a1a0a;">
        <div>
          <span style="color:#0f0;">[${m.time}]</span>
          <strong>${m.nick}</strong>: ${m.msg}
        </div>
        <div style="display:flex; gap:5px;">
          <a href="/hide/${m.id}?nick=${nick}" style="color:#666; font-size:9px; text-decoration:none;" title="Скрыть для себя">🙈</a>
          ${m.nick === nick ? `<a href="/delete/${m.id}" style="color:#ff3333; font-size:9px; text-decoration:none;" title="Удалить для всех">🗑️</a>` : ''}
        </div>
      </div>
    `).join('')
    : '<div style="color:#666; padding:10px;">📭 Сообщений пока нет</div>';

  const prev = page > 0 ? `<a href='/chat/${encodeURIComponent(nick)}?page=${page-1}'>← Пред.</a>` : '';
  const next = start > 0 ? `<a href='/chat/${encodeURIComponent(nick)}?page=${page+1}'>След. →</a>` : '';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Чат - ${nick}</title>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap&subset=cyrillic" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; color: #0f0; font-family: 'Press Start 2P', monospace; padding: 20px; font-size: 12px; }
        .container { max-width: 800px; margin: 0 auto; position: relative; z-index: 1; }
        .header { border-bottom: 2px solid #0f0; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
        .user { font-size: 14px; }
        .profile-link { font-size: 10px; color: #0f0; text-decoration: none; border: 1px solid #0f0; padding: 4px 10px; }
        .messages { height: 400px; overflow-y: auto; border: 1px solid #0f0; padding: 15px; background: rgba(0,0,0,0.9); }
        .messages div { padding: 5px 0; border-bottom: 1px solid #0a1a0a; }
        .pagination { text-align: center; margin: 15px 0; }
        .pagination a { color: #0f0; text-decoration: none; padding: 5px 15px; border: 1px solid #0f0; margin: 0 5px; }
        .input-area { display: flex; gap: 10px; margin-top: 10px; }
        .input-area input { flex: 1; background: #000; color: #0f0; border: 1px solid #0f0; padding: 12px; font-family: 'Press Start 2P', monospace; font-size: 12px; }
        .input-area button { background: #0f0; color: #000; border: none; padding: 12px 30px; font-family: 'Press Start 2P', monospace; font-weight: bold; cursor: pointer; }
        .video-btn { background: #0f0; color: #000; border: none; padding: 8px 16px; font-family: 'Press Start 2P', monospace; font-size: 10px; cursor: pointer; margin-bottom: 10px; }
        .footer { margin-top: 15px; font-size: 9px; color: #444; text-align: center; border-top: 1px solid #1a1a1a; padding-top: 10px; }
        .footer span { color: #0f0; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #0f0; }
        a { color: #0f0; text-decoration: none; }
        #recorderContainer { display:none; margin: 10px 0; text-align:center; }
        #preview { width:200px; height:200px; background:#000; border:1px solid #0f0; object-fit:cover; }
      </style>
    </head>
    <body style="background: 
      radial-gradient(ellipse at 20% 50%, rgba(0,255,0,0.08) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 50%, rgba(0,255,0,0.08) 0%, transparent 60%),
      repeating-linear-gradient(0deg, rgba(0,255,0,0.03) 0px, rgba(0,255,0,0.03) 2px, transparent 2px, transparent 4px),
      #000;">
      <div class="container">
        <div class="header">
          <div class="user">👤 <span>${nick}</span></div>
          <div>
            <a href="/profile/${encodeURIComponent(nick)}" class="profile-link">📋 Профиль</a>
            <a href="/" style="margin-left:10px;">🚪 Выйти</a>
          </div>
        </div>

        <div class="messages">${msgHtml}</div>

        <div class="pagination">${prev} ${next}</div>

        <button onclick="startRecording()" class="video-btn">🎥 Записать квадратик (1:1)</button>

        <div id="recorderContainer">
          <video id="preview" autoplay muted></video>
          <br>
          <button onclick="stopRecording()" style="background:#ff3333; color:#fff; border:none; padding:8px 16px; font-family:'Press Start 2P',monospace; font-size:10px; cursor:pointer; margin-top:5px;">⏹ Остановить и отправить</button>
          <button onclick="cancelRecording()" style="background:#666; color:#fff; border:none; padding:8px 16px; font-family:'Press Start 2P',monospace; font-size:10px; cursor:pointer; margin-top:5px;">❌ Отмена</button>
        </div>

        <form action='/send' method='POST'>
          <input type='hidden' name='nick' value='${nick}'>
          <div class="input-area">
            <input type='text' name='msg' placeholder='Сообщение...' required autofocus>
            <button type='submit'>→</button>
          </div>
        </form>

        <form id="videoForm" action="/upload-video" method="POST" enctype="multipart/form-data" style="display:none;">
          <input type="hidden" name="nick" value="${nick}">
          <input type="file" name="video" id="videoInput" accept="video/*">
        </form>

        <div class="footer"><span>⚠️</span> Стр. ${page+1} | Всего: ${total} | <span>🚫</span> Ссылки и мат запрещены</div>
      </div>

      <script>
        let mediaRecorder;
        let recordedChunks = [];
        let stream;

        async function startRecording() {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: 360, height: 360, facingMode: 'user' },
              audio: true
            });
            
            document.getElementById('preview').srcObject = stream;
            document.getElementById('recorderContainer').style.display = 'block';
            
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recordedChunks = [];
            
            mediaRecorder.ondataavailable = event => {
              if (event.data.size > 0) recordedChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
              const blob = new Blob(recordedChunks, { type: 'video/webm' });
              const file = new File([blob], 'video.webm', { type: 'video/webm' });
              
              const input = document.getElementById('videoInput');
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              input.files = dataTransfer.files;
              
              document.getElementById('videoForm').submit();
            };
            
            mediaRecorder.start();
          } catch (err) {
            alert('❌ Не удалось получить доступ к камере: ' + err.message);
          }
        }

        function stopRecording() {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
          }
        }

        function cancelRecording() {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          document.getElementById('recorderContainer').style.display = 'none';
          document.getElementById('preview').srcObject = null;
        }
      </script>
    </body>
    </html>
  `);
});

// Загрузка видео
app.post('/upload-video', upload.single('video'), (req, res) => {
  const { nick } = req.body;
  if (!nick) return res.status(400).send('Нет ника');

  const file = req.file;
  if (!file) return res.status(400).send('Видео не загружено');

  const fileUrl = `/uploads/${file.filename}`;
  const db = readDB();
  
  const msg = `<video src="${fileUrl}" controls style="width:200px; height:200px; object-fit:cover; border-radius:8px; background:#000;"></video>`;
  
  const time = new Date().toLocaleTimeString('ru-RU');
  const msgId = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  db.messages.push({ id: msgId, nick, msg, time, file: fileUrl });
  if (db.messages.length > 1000) db.messages = db.messages.slice(-1000);
  writeDB(db);

  res.redirect(`/chat/${encodeURIComponent(nick)}`);
});

// Удаление
app.get('/delete/:id', (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const index = db.messages.findIndex(m => m.id === id);
  if (index !== -1) {
    db.messages.splice(index, 1);
    writeDB(db);
  }
  res.redirect('back');
});

app.get('/hide/:id', (req, res) => {
  const id = req.params.id;
  const nick = req.query.nick;
  if (!nick) return res.redirect('back');
  
  const db = readDB();
  const msg = db.messages.find(m => m.id === id);
  if (msg) {
    if (!msg.hidden_for) msg.hidden_for = [];
    if (!msg.hidden_for.includes(nick)) {
      msg.hidden_for.push(nick);
      writeDB(db);
    }
  }
  res.redirect('back');
});

// Отправка текста
app.post('/send', (req, res) => {
  const { nick, msg } = req.body;
  if (!nick || !msg) return res.redirect('/');

  const clean = msg.trim();
  if (clean.length === 0) return res.redirect(`/chat/${encodeURIComponent(nick)}`);

  const now = Date.now();
  if (userCooldown[nick] && (now - userCooldown[nick]) < 5000) {
    return res.send(`<h3 style='color:#ff0'>⏳ Подождите 5 секунд</h3><a href='/chat/${encodeURIComponent(nick)}'>Назад</a>`);
  }
  userCooldown[nick] = now;

  if (clean.length > 500) {
    return res.send(`<h3 style='color:red'>📏 Слишком длинное сообщение</h3><a href='/chat/${encodeURIComponent(nick)}'>Назад</a>`);
  }

  const linkPattern = /(https?:\/\/|www\.|\.(com|ru|org|net|xyz|io|me|site)\b)/i;
  if (linkPattern.test(clean)) {
    return res.send(`<h3 style='color:red'>⛔ Ссылки запрещены!</h3><a href='/chat/${encodeURIComponent(nick)}'>Назад</a>`);
  }

  const badWords = ['хуй', 'пизда', 'бля', 'ебал', 'пидор', 'мудак', 'сука'];
  if (badWords.some(word => clean.toLowerCase().includes(word))) {
    return res.send(`<h3 style='color:red'>🚫 Нецензурная лексика запрещена!</h3><a href='/chat/${encodeURIComponent(nick)}'>Назад</a>`);
  }

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const db = readDB();
  const msgId = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  db.messages.push({ id: msgId, nick, msg: clean, time });
  if (db.messages.length > 1000) db.messages = db.messages.slice(-1000);
  writeDB(db);
  res.redirect(`/chat/${encodeURIComponent(nick)}`);
});

// Профиль
app.get('/profile/:nick', (req, res) => {
  const nick = decodeURIComponent(req.params.nick);
  const db = readDB();
  const user = db.users[nick];
  if (!user) return res.send('Пользователь не найден');

  const bio = user.bio || 'Пока ничего не рассказал о себе';
  const posts = user.posts || [];
  const status = user.status || '☕ Ничего не указано';
  const rating = user.rating || 0;

  const postsHtml = posts.length
    ? posts.map((p, i) => `<div class="post">📌 ${i+1}. ${p}</div>`).join('')
    : '<div class="empty">📭 Нет записей</div>';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Профиль ${nick}</title>
      <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap&subset=cyrillic" rel="stylesheet">
      <style>
        body { background: #000; color: #0f0; font-family: 'Press Start 2P', monospace; padding: 20px; font-size: 11px; }
        .container { max-width: 700px; margin: 0 auto; border: 1px solid #0f0; padding: 20px; background: rgba(0,0,0,0.9); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0f0; padding-bottom: 10px; margin-bottom: 15px; flex-wrap: wrap; }
        .header h1 { font-size: 16px; }
        .status-block { border: 1px solid #0f0; padding: 10px; margin: 10px 0; background: #0a0a0a; }
        .rating-block { display: flex; align-items: center; gap: 15px; margin: 10px 0; flex-wrap: wrap; }
        .rating { font-size: 20px; }
        .btn { background: #0f0; color: #000; border: none; padding: 6px 15px; font-family: 'Press Start 2P', monospace; font-size: 14px; cursor: pointer; }
        .btn:hover { background: #00cc00; }
        .btn-negative { background: #ff3333; color: #fff; }
        .btn-negative:hover { background: #cc0000; }
        .bio { padding: 10px; border: 1px solid #0f0; margin: 10px 0; background: #0a0a0a; }
        .post { padding: 6px 0; border-bottom: 1px solid #1a1a1a; }
        .empty { color: #666; }
        textarea { width: 100%; background: #000; color: #0f0; border: 1px solid #0f0; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; }
        input[type="text"] { width: 100%; background: #000; color: #0f0; border: 1px solid #0f0; padding: 10px; font-family: 'Press Start 2P', monospace; font-size: 10px; }
        .back { margin-top: 20px; display: inline-block; border: 1px solid #0f0; padding: 8px 15px; text-decoration: none; color: #0f0; }
        .back:hover { background: #0f0; color: #000; }
        form { margin: 10px 0; }
      </style>
    </head>
    <body style="background: 
      radial-gradient(ellipse at 20% 50%, rgba(0,255,0,0.08) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 50%, rgba(0,255,0,0.08) 0%, transparent 60%),
      repeating-linear-gradient(0deg, rgba(0,255,0,0.03) 0px, rgba(0,255,0,0.03) 2px, transparent 2px, transparent 4px),
      #000;">
      <div class="container">
        <div class="header">
          <h1>👤 ${nick}</h1>
          <a href="/chat/${encodeURIComponent(nick)}" style="color:#0f0;">← Чат</a>
        </div>

        <h3>📌 Статус</h3>
        <div class="status-block">${status}</div>
        <form method="POST" action="/profile/${encodeURIComponent(nick)}/status">
          <input type="text" name="status" placeholder="Новый статус..." maxlength="100" required>
          <button type="submit" class="btn">Установить</button>
        </form>

        <h3>⭐ Рейтинг</h3>
        <div class="rating-block">
          <span class="rating">${rating}</span>
          <a href="/profile/${encodeURIComponent(nick)}/rate?action=like" class="btn">➕</a>
          <a href="/profile/${encodeURIComponent(nick)}/rate?action=dislike" class="btn btn-negative">➖</a>
        </div>

        <h3>📝 О себе</h3>
        <div class="bio">${bio}</div>
        <form method="POST" action="/profile/${encodeURIComponent(nick)}/bio">
          <textarea name="bio" rows="2" placeholder="Изменить описание...">${bio}</textarea>
          <button type="submit" class="btn">Обновить</button>
        </form>

        <h3>📜 Записи</h3>
        <div>${postsHtml}</div>
        <form method="POST" action="/profile/${encodeURIComponent(nick)}/post">
          <textarea name="post" rows="2" placeholder="Новая запись..." required></textarea>
          <button type="submit" class="btn">Добавить</button>
        </form>

        <a href="/chat/${encodeURIComponent(nick)}" class="back">🔙 Вернуться в чат</a>
      </div>
    </body>
    </html>
  `);
});

// Профиль: статус
app.post('/profile/:nick/status', (req, res) => {
  const nick = decodeURIComponent(req.params.nick);
  const db = readDB();
  if (!db.users[nick]) return res.send('Пользователь не найден');
  db.users[nick].status = req.body.status.trim().slice(0, 100) || '☕ Статус не указан';
  writeDB(db);
  res.redirect(`/profile/${encodeURIComponent(nick)}`);
});

// Профиль: рейтинг
app.get('/profile/:nick/rate', (req, res) => {
  const nick = decodeURIComponent(req.params.nick);
  const action = req.query.action;
  const db = readDB();
  if (!db.users[nick]) return res.send('Пользователь не найден');
  if (action === 'like') db.users[nick].rating = (db.users[nick].rating || 0) + 1;
  if (action === 'dislike') db.users[nick].rating = (db.users[nick].rating || 0) - 1;
  writeDB(db);
  res.redirect(`/profile/${encodeURIComponent(nick)}`);
