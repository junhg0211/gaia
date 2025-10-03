// main.js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import "./ws-server.js"; // WebSocket 서버 모듈 임포트

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 개발 모드에서는 Vite Dev 서버, 배포 모드에서는 빌드된 파일 로드
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://127.0.0.1:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading');
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
