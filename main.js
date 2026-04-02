const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 200,
    height: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setIgnoreMouseEvents(false);
}

// 拖拽
ipcMain.on('window-drag', (event, { dx, dy }) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

app.commandLine.appendSwitch('enable-speech-dispatcher');

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow();
});

// 截图功能：检测到 screenshots/.capture 文件时自动截图
const screenshotDir = path.join(__dirname, 'screenshots');
const triggerFile = path.join(screenshotDir, '.capture');

setInterval(() => {
  if (!win || !fs.existsSync(triggerFile)) return;

  // 读取触发文件里的文件名（如果有的话）
  let filename;
  try {
    filename = fs.readFileSync(triggerFile, 'utf-8').trim();
    fs.unlinkSync(triggerFile);
  } catch(e) { return; }

  if (!filename) filename = new Date().toISOString().replace(/[:.]/g, '-');

  win.capturePage().then(image => {
    const filePath = path.join(screenshotDir, filename + '.png');
    fs.writeFileSync(filePath, image.toPNG());
    console.log('[Moyo] 截图已保存:', filePath);
  });
}, 500);

app.on('window-all-closed', () => {
  app.quit();
});
