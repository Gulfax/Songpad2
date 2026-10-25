// Songpad desktop shell: opens the app in its own window. No server, no internet needed.
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    title: 'Songpad',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // keep listening if the window is behind another
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(function (d) {
    if (/^https?:/.test(d.url)) shell.openExternal(d.url);
    return { action: 'deny' };
  });
  win.on('closed', function () { win = null; });
}

app.whenReady().then(function () {
  // The only permission Songpad asks for is the microphone.
  session.defaultSession.setPermissionRequestHandler(function (wc, permission, callback) {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler(function (wc, permission) {
    return permission === 'media';
  });
  createWindow();
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', function () {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('window-all-closed', function () { app.quit(); });
