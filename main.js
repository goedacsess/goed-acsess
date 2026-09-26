const { app, BrowserWindow, Menu, dialog, shell, ipcMain, systemPreferences } = require('electron');
const path = require('path');

// Data lokal (login, setelan, localStorage) dikunci ke folder yang dipakai sejak
// versi iServis Pro: "iservis-pro", dari field "name" package.json. Kalau suatu
// saat nama paket diganti, tanpa baris ini semua kasir kehilangan datanya setelah
// pembaruan. Harus dipanggil sebelum app ready.
app.setPath('userData', path.join(app.getPath('appData'), 'iservis-pro'));
const { autoUpdater } = require('electron-updater');

let mainWindow;

/* ============ AUTO UPDATE (download + install otomatis via GitHub Releases) ============ */
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-available', { version: info.version });
});
autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) mainWindow.webContents.send('update-progress', { percent: Math.round(progress.percent) });
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', { version: info.version });
});
autoUpdater.on('error', (err) => {
  console.log('Auto update error:', err.message);
});

function checkForUpdates() {
  autoUpdater.checkForUpdates().catch(e => console.log('Cek update gagal:', e.message));
}

ipcMain.handle('check-update-now', () => {
  checkForUpdates();
});
ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});
// Hanya alamat web dan halaman izin kamera macOS yang boleh dibuka. Skema lain
// (file:, smb:, ms-msdt:, dll.) bisa menjalankan program di komputer kasir.
function bolehDibukaDiLuar(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'https:' || u.protocol === 'http:') return true;
    return u.protocol === 'x-apple.systempreferences:' && u.href.startsWith('x-apple.systempreferences:com.apple.preference.security');
  } catch (e) { return false; }
}

ipcMain.handle('open-external', (event, url) => {
  if (!bolehDibukaDiLuar(url)) return false;
  shell.openExternal(url);
});
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

/* ============ IZIN KAMERA (WAJIB DIMINTA EKSPLISIT DI ELECTRON) ============ */
ipcMain.handle('get-camera-status', () => {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('camera');
});
ipcMain.handle('request-camera-access', async () => {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('camera');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;
  const granted = await systemPreferences.askForMediaAccess('camera');
  return granted;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 650,
    title: 'Goed Access',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#1d1d1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Dimatikan hanya di build terpaket, supaya debugging saat ngoding tetap jalan.
      devTools: !app.isPackaged
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Cek update 3 detik setelah window terbuka
    setTimeout(checkForUpdates, 3000);
  });

  // Izinkan window cetak nota, buka link luar di browser
  // Jendela cetak nota dibuka kosong (about:blank) lalu diisi; itu saja yang boleh
  // jadi jendela aplikasi. Alamat web dibuka di browser, sisanya ditolak.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === '' || url === 'about:blank') return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Halaman utama tidak boleh berpindah ke alamat lain (mis. lewat tautan atau
  // skrip sisipan); hanya muat ulang file aplikasinya sendiri yang diizinkan.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

app.whenReady().then(() => {
  createWindow();
  // Cek update otomatis tiap 6 jam selama app terbuka
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
