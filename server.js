const express = require('express');а
const app = express();
const port = 3000;
const fs = require('fs');

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Простая БД на JSON
const DB_FILE = 'chat.json';

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

initDB();

// Главная
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>IBM BIOS Chat</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #000;
          color: #0f0;
          font-family: 'Courier New', monospace;
          padding: 20px;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .container {
          max-width: 600px;
          width: 100%;
          padding: 30px;
          border: 2px solid #0f0;
          border-radius: 8px;
          box-shadow: 0 0 20px rgba(0,255,0,0.1);
        }
        h1 {
          text-align: center;
          font-size: 20px;
          margin-bottom: 30px;
          letter-spacing: 2px;
        }
        label {
          display: block;
          margin-bottom: 10px;
          font-size: 14px;
        }
        input {
          width: 100%;
          background: #000;
          color: #0f0;
          border: 1px solid #0f0;
          padding: 12px;
          font-family: 'Courier New', monospace;
          font-size: 16px;
          margin-bottom: 15px;
        }
        input:focus {
          outline: none;
          box-shadow: 0 0 10px rgba(0,255,0,0.3);
        }
        button {
          width: 100%;
          background: #0f0;
          color: #000;
          border: none;
          padding: 12px;
          font-family: 'Courier New', monospace;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s;
        }
        button:hover {
          background: #00cc00;
          box-shadow: 0 0 20px rgba(0,255,0,0.3);
        }
        .rules {
          margin-top: 20px;
          font-size: 11px;
          color: #666;
          text-align: center;
          border-top: 1px solid #1a1a1a;
          padding-top: 15px;
        }
        .rules span { color: #ff0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>╔═══════════════════════╗<br>║  IBM BIOS CHAT v3.0 ║<br>╚═══════════════════════╝</h1>
        <form action='/login' method='POST'>
          <label>👤 ВВЕДИТЕ ВАШ НИКНЕЙМ:</label>
          <input type='text' name='nick' required placeholder='Например: Neo' maxlength='20'>
          <button type='submit'>ВОЙТИ В ЧАТ</button>
        </form>
        <div class="rules">
          <span>⚠️</span> Ник: 2-20 символов<br>
          <span>🚫</span> Запрещены ссылки и спам
        </div>
      </div>
    </body>
    </html>
  `);
});

// Логин
app.post('/login', (req, res) => {
  let nick = req.body.nick.trim();
  
  if (nick.length < 2 || nick.length > 20) {
    return res.send(`
      <h2 style='color:red'>❌ Ошибка: ник должен быть 2-20 символов</h2>
      <a href='/'>Вернуться</a>
    `);
  }

  const db = readDB();
  db.users[nick] = { 
    ip: req.ip || 'unknown', 
    joined: new Date().toISOString() 
  };
  writeDB(db);
  
  res.redirect(`/chat/${encodeURIComponent(nick)}`);
});

// Чат
app.get('/chat/:nick', (req, res) => {
  const nick = decodeURIComponent(req.params.nick);
  const page = parseInt(req.query.page) || 0;
  const limit = 5;
  
  const db = readDB();
  
  if (!db.users[nick]) {
    return res.send(`<h2 style='color:red'>❌ Пользователь не найден</h2><a href='/'>Войти</a>`);
  }

  const messages = db.messages || [];
  const total = messages.length;
  const start = Math.max(0, total - (page + 1) * limit);
  const end = total - page * limit;
  const pageMsgs = messages.slice(start, end);
  
  const msgHtml = pageMsgs.length > 0 
    ? pageMsgs.map(m => `<div><span style="color:#0f0;">[${m.time}]</span> <strong>${m.nick}</strong>: ${m.msg}</div>`).join('')
    : '<div style="color:#666;">📭 Сообщений пока нет</div>';

  const prev = page > 0 ? `<a href='/chat/${encodeURIComponent(nick)}?page=${page-1}'>← Пред.</a>` : '';
  const next = start > 0 ? `<a href='/chat/${encodeURIComponent(nick)}?page=${page+1}'>След. →</a>` : '';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap&subset=cyrillic" rel="stylesheet">
      <meta charset="UTF-8">
      <title>Чат - ${nick}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #000;
          color: #0f0;
          font-family: 'Press Start 2P', 'Courier New', monospace;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          border-bottom: 2px solid #0f0;
          padding-bottom: 15px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .user { font-size: 18px; }
        .user span { color: #0f0; }
        .exit a {
          color: #0f0;
          text-decoration: none;
          padding: 5px 15px;
          border: 1px solid #0f0;
        }
        .exit a:hover {
          background: #0f0;
          color: #000;
        }
        .messages {
          height: 400px;
          overflow-y: auto;
          border: 1px solid #0f0;
          padding: 15px;
          margin-bottom: 15px;
          background: #0a0a0a;
        }
        .messages div {
          padding: 5px 0;
          border-bottom: 1px solid #0a1a0a;
        }
        .messages div:last-child { border-bottom: none; }
        .messages strong { color: #0f0; }
        .pagination {
          text-align: center;
          margin: 15px 0;
        }
        .pagination a {
          color: #0f0;
          text-decoration: none;
          padding: 5px 15px;
          border: 1px solid #0f0;
          margin: 0 5px;
        }
        .pagination a:hover {
          background: #0f0;
          color: #000;
        }
        .input-area {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        .input-area input {
          flex: 1;
          background: #000;
          color: #0f0;
          border: 1px solid #0f0;
          padding: 12px;
          font-family: 'Courier New', monospace;
          font-size: 14px;
        }
        .input-area input:focus {
          outline: none;
          box-shadow: 0 0 10px rgba(0,255,0,0.2);
        }
        .input-area button {
          background: #0f0;
          color: #000;
          border: none;
          padding: 12px 30px;
          font-family: 'Courier New', monospace;
          font-weight: bold;
          cursor: pointer;
        }
        .input-area button:hover {
          background: #00cc00;
        }
        .footer {
          margin-top: 15px;
          font-size: 11px;
          color: #444;
          text-align: center;
          border-top: 1px solid #1a1a1a;
          padding-top: 10px;
        }
        .footer span { color: #ff0; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #0f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="user">👤 <span>${nick}</span></div>
          <div class="exit"><a href='/'>Выйти</a></div>
        </div>
        
        <div class="messages">
          ${msgHtml}
        </div>

        <div class="pagination">
          ${prev} ${next}
        </div>

        <form action='/send' method='POST'>
          <input type='hidden' name='nick' value='${nick}'>
          <div class="input-area">
            <input type='text' name='msg' placeholder='Введите сообщение...' required autofocus>
            <button type='submit'>→</button>
          </div>
        </form>

        <div class="footer">
          <span>⚠️</span> Стр. ${page+1} | Всего: ${total} сообщ. | <span>🚫</span> Ссылки запрещены
        </div>
      </div>
    </body>
    </html>
  `);
});

// Отправка
app.post('/send', (req, res) => {
  const { nick, msg } = req.body;
  
  if (!nick || !msg) return res.redirect('/');

  const clean = msg.trim();
  if (clean.length === 0) {
    return res.redirect(`/chat/${encodeURIComponent(nick)}`);
  }

  // Фильтр ссылок
  const linkPattern = /(https?:\/\/|www\.|\.(com|ru|org|net|xyz|io|me|site)\b)/i;
  if (linkPattern.test(clean)) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Запрещено</title>
        <style>
          body { background: #000; color: #0f0; font-family: 'Courier New', monospace; padding: 50px; text-align: center; }
          a { color: #0f0; }
          h1 { color: red; }
        </style>
      </head>
      <body>
        <h1>⛔ ЗАПРЕЩЕНО!</h1>
        <h3>Отправка ссылок запрещена правилами чата</h3>
        <br><br>
        <a href='/chat/${encodeURIComponent(nick)}'>← Вернуться в чат</a>
      </body>
      </html>
    `);
  }

  const time = new Date().toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  const db = readDB();
  db.messages.push({ nick, msg: clean, time });
  writeDB(db);
  
  res.redirect(`/chat/${encodeURIComponent(nick)}`);
});

// Запуск
app.listen(port, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════╗');
  console.log('║   🖥️  IBM BIOS CHAT ЗАПУЩЕН     ║');
  console.log(`║   📡 http://localhost:${port}     ║`);
  console.log('╚═══════════════════════════════════╝');
  console.log('\n💡 Нажмите Ctrl+C для остановки\n');
});
