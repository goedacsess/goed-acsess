// Dijalankan electron-builder setelah aplikasi dirakit dan sebelum ditandatangani.
// Mematikan jalur yang membuat program lain bisa menjalankan kode dengan identitas
// (dan izin kamera) Goed Access: ELECTRON_RUN_AS_NODE, NODE_OPTIONS, dan --inspect.
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function aturFuses(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const nama = packager.appInfo.productFilename;
  const target = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${nama}.app`)
    : path.join(appOutDir, electronPlatformName === 'win32' ? `${nama}.exe` : nama);

  await flipFuses(target, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // electron-builder 24 hanya menulis hash app.asar di Info.plist macOS. Di Windows
    // hash itu tidak ada, jadi validasi dinyalakan hanya di Mac supaya aplikasi tetap terbuka.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: electronPlatformName === 'darwin'
  });
};
