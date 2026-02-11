const { app, BrowserWindow, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow;
let nextProcess;
const PORT = 3457;

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findAvailablePort(startPort + 1)));
  });
}

function waitForServer(port, retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      if (remaining <= 0) return reject(new Error('Server failed to start'));
      const client = net.createConnection({ port }, () => {
        client.end();
        resolve();
      });
      client.on('error', () => {
        setTimeout(() => attempt(remaining - 1), 500);
      });
    };
    attempt(retries);
  });
}

function startNextServer(port) {
  const isProd = app.isPackaged;
  const appPath = isProd
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  const nextBin = path.join(appPath, 'node_modules', '.bin', 'next');

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: isProd ? 'production' : 'development',
  };

  if (isProd) {
    nextProcess = spawn(nextBin, ['start', '-p', String(port)], {
      cwd: appPath,
      env,
      stdio: 'pipe',
    });
  } else {
    nextProcess = spawn(nextBin, ['dev', '-p', String(port)], {
      cwd: appPath,
      env,
      stdio: 'pipe',
    });
  }

  nextProcess.stdout?.on('data', (data) => {
    console.log(`[Next.js] ${data}`);
  });
  nextProcess.stderr?.on('data', (data) => {
    console.error(`[Next.js] ${data}`);
  });
  nextProcess.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'OVERWATCH',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'OVERWATCH',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  buildMenu();

  const port = await findAvailablePort(PORT);
  startNextServer(port);

  try {
    await waitForServer(port);
  } catch {
    console.error('Next.js server did not start in time');
    app.quit();
    return;
  }

  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(port);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }
});
