const { app, BrowserWindow, ipcMain, screen, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { getState, setState, getApiKey, setApiKey } = require('./store');

let mainWindow = null;
const activeChatRequests = new Map();

const SYSTEM_PROMPT =
  '你是一只叫豆豆的小狗，性格活泼可爱。只用短句和拟声词说话，比如汪汪、呜呜、嘿嘿。' +
  '每次回复不超过 30 个字。根据传入状态调整语气：hunger<40 时说饿，water<40 时说渴，' +
  'mood>80 时特别开心，energy<30 时说困。';

function generateAssetsIfNeeded() {
  const dogPath = path.join(__dirname, 'assets', 'dog.png');
  if (!fs.existsSync(dogPath)) {
    try {
      require('./generate-assets');
    } catch (err) {
      console.error('Failed to generate assets:', err.message);
    }
  }
}

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 160,
    height: 160,
    x: width - 180,
    y: height - 180,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.loadFile('renderer/index.html');

  if (process.platform === 'darwin') {
    mainWindow.setAlwaysOnTop(true, 'floating');
  }

  const { createTray } = require('./tray');
  createTray(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function checkAndShowSetup() {
  const existingKey = getApiKey();
  if (existingKey) {
    createPetWindow();
    return;
  }

  const setupWin = new BrowserWindow({
    width: 440,
    height: 400,
    resizable: false,
    frame: true,
    title: '豆豆初始设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWin.loadFile('renderer/setup.html');
  setupWin.setMenuBarVisibility(false);

  setupWin.on('closed', () => {
    if (!mainWindow) createPetWindow();
  });
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (err) => console.error('Auto update error:', err.message));
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.webContents.send('dog:tray-action', 'update-downloaded');
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Failed to check for updates:', err.message);
    });
  }
}

function sendChatEvent(webContents, payload) {
  if (!webContents.isDestroyed()) {
    webContents.send('dog:chat-event', payload);
  }
}

function normalizeStats(stats) {
  const fallback = { hunger: 100, water: 100, mood: 100, energy: 100 };
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => {
      const raw = Number(stats && stats[key]);
      return [key, Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : value];
    })
  );
}

async function streamChat(event, payload) {
  const webContents = event.sender;
  const requestKey = webContents.id;
  const previous = activeChatRequests.get(requestKey);
  if (previous) previous.abort();

  const apiKey = getApiKey();
  if (!apiKey) {
    sendChatEvent(webContents, { type: 'missing-key' });
    return;
  }

  const controller = new AbortController();
  activeChatRequests.set(requestKey, controller);

  const stats = normalizeStats(payload && payload.stats);
  const statsPrefix = `[hunger:${stats.hunger} water:${stats.water} mood:${stats.mood} energy:${stats.energy}]`;
  const userMessage = payload && typeof payload.userMessage === 'string' ? payload.userMessage.trim() : '';
  const content = userMessage
    ? `${statsPrefix} ${userMessage}`
    : `${statsPrefix} 主动和主人打个招呼或说说现在的感受。`;

  sendChatEvent(webContents, { type: 'start' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HTTP ${response.status}: ${err.slice(0, 120)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (
            parsed.type === 'content_block_delta' &&
            parsed.delta &&
            parsed.delta.type === 'text_delta' &&
            parsed.delta.text
          ) {
            sendChatEvent(webContents, { type: 'chunk', text: parsed.delta.text });
          }
        } catch (_) {
          // Ignore partial or malformed server-sent-event frames.
        }
      }
    }

    sendChatEvent(webContents, { type: 'done' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Chat error:', err);
      sendChatEvent(webContents, { type: 'error', message: err.message });
    }
  } finally {
    if (activeChatRequests.get(requestKey) === controller) {
      activeChatRequests.delete(requestKey);
    }
  }
}

app.whenReady().then(() => {
  generateAssetsIfNeeded();
  checkAndShowSetup();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {});

ipcMain.on('dog:set-position', (event, x, y) => {
  if (mainWindow) mainWindow.setPosition(Math.round(x), Math.round(y));
});

ipcMain.handle('dog:get-screen-size', () => {
  return screen.getPrimaryDisplay().workAreaSize;
});

ipcMain.on('dog:set-ignore-mouse', (event, ignore, options) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, options || { forward: true });
});

ipcMain.handle('dog:get-state', () => getState());

ipcMain.on('dog:set-state', (event, key, value) => {
  if (['hunger', 'water', 'mood', 'energy'].includes(key)) setState(key, value);
});

ipcMain.on('dog:save-api-key', (event, key) => {
  try {
    setApiKey(key);
  } catch (err) {
    console.error('Failed to save API key:', err.message);
  }
});

ipcMain.on('dog:close-setup', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
  if (!mainWindow) createPetWindow();
});

ipcMain.on('dog:open-external', (event, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    shell.openExternal(url);
  }
});

ipcMain.on('dog:show-context-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const menu = Menu.buildFromTemplate([
    { label: '🍖 喂食', click: () => event.sender.send('dog:tray-action', 'feed') },
    { label: '💧 喂水', click: () => event.sender.send('dog:tray-action', 'water') },
    { label: '🚶 散步', click: () => event.sender.send('dog:tray-action', 'walk') },
    { label: '💬 说话', click: () => event.sender.send('dog:tray-action', 'talk') }
  ]);
  menu.popup({ window: win });
});

ipcMain.on('dog:resize-window', (event, width, height, deltaY) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setSize(width, height);
  mainWindow.setPosition(x, y + deltaY);
});

ipcMain.on('dog:set-window-layout', (event, layout) => {
  if (!mainWindow) return;

  const nextWidth = Math.max(160, Math.min(320, Number(layout && layout.width) || 160));
  const nextHeight = Math.max(160, Math.min(360, Number(layout && layout.height) || 160));
  const [x, y] = mainWindow.getPosition();
  const [oldWidth, oldHeight] = mainWindow.getSize();
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const bottom = y + oldHeight;
  const nextX = Math.max(0, Math.min(screenWidth - nextWidth, x + Math.round((oldWidth - nextWidth) / 2)));
  const nextY = Math.max(0, Math.min(screenHeight - nextHeight, bottom - nextHeight));

  mainWindow.setBounds({
    x: nextX,
    y: nextY,
    width: Math.round(nextWidth),
    height: Math.round(nextHeight)
  });
});

ipcMain.on('dog:chat-start', streamChat);

ipcMain.on('dog:quit', () => app.quit());
