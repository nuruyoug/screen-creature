const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 让窗口不响应鼠标穿透（但我们自己处理拖拽）
  win.setIgnoreMouseEvents(false);
}

// 拖拽：渲染进程发来鼠标偏移量，主进程移动窗口
ipcMain.on('window-drag', (event, { dx, dy }) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
