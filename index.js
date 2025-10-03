// main.js
import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import "./ws-server.js"; // WebSocket 서버 모듈 임포트

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let serverProcess;

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
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/dist/index.html'));
  }
}

app.on('ready', () => {
  // WebSocket 서버 실행
  serverProcess = spawn('node', ['index.js'], { stdio: 'inherit' });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
  if (serverProcess) serverProcess.kill();
});
