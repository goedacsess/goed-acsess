const { app, BrowserWindow, Menu, dialog, shell, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const https = require('https');

let mainWindow;

/* ============ CEK UPDATE via GitHub Releases ============ */
const GITHUB_USER = 'goedacsess';
const GITHUB_REPO = 'goed-acsess';

// Ambil hanya angka.angka.angka dari tag, abaikan prefix apapun (v, v., V, release-, dst)
function cleanVersion(v) {
  const match = String(v).match(/(\d+(?:\.\d+)*)/);
  return match ? match[1] : '0.0.0';
}

// Bandingkan 2 nomor versi, misal "1.2.0" vs "1.10.0"
function compareVersions(v1, v2) {
  const clean = v => cleanVersion(v).split('.').map(Number);
  const a1 = clean(v1), a2 = clean(v2);
  for (let i = 0; i < Math.max(a1.length, a2.length); i++) {
    const n1 = a1[i] || 0, n2 = a2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function checkForUpdates() {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`,
    method: 'GET',
    headers: { 'User-Agent': 'GoedAcsess-App' }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.tag_name) return; // belum ada release / repo masih kosong
        const latestVersion = cleanVersion(json.tag_name);
        const currentVersion = app.getVersion();
        if (compareVersions(latestVersion, currentVersion) > 0 && mainWindow) {
          const asset = (json.assets || []).find(a => a.name.endsWith('.dmg'));
          const downloadUrl = asset ? asset.browser_download_url : json.html_url;
          mainWindow.webContents.send('update-available', {
            version: latestVersion,
            currentVersion,
            url: downloadUrl,
            notes: json.body || ''
          });
        }
      } catch (e) {
        console.log('Cek update gagal (parse):', e.message);
      }
    });
  });

  req.on('error', (e) => {
    console.log('Cek update gagal (koneksi):', e.message);
  });

  req.end();
}

ipcMain.handle('check-update-now', () => {
  checkForUpdates();
});
ipcMain.handle('open-external', (event, url) => {
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
    title: 'Goed Acsess',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#1d1d1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
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
