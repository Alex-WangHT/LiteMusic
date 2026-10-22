const fs = require('node:fs/promises');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');

(async () => {
  const root = path.resolve(__dirname, '..');
  const petRoot = path.resolve(process.env.LITEMUSIC_PET_ROOT || path.join(root, 'pet'));
  const appDir = path.join(root, '.pet-build', 'app-' + Date.now());
  const copy = async (source, relative) => {
    const destination = path.join(appDir, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true });
  };
  // Only runtime files are included: no credentials, local profiles, database or developer tools.
  for (const relative of ['public', 'scripts/dev.mjs', 'scripts/remote-playlist.mjs', 'src/local-player.mjs']) await copy(path.join(root, relative), relative);
  for (const relative of ['music-shell', 'assets', 'NOTICE.md', 'AUTHORS.md', 'PROVENANCE.md', 'LICENSE', 'LITEMUSIC.md']) await copy(path.join(petRoot, relative), path.join('pet', relative));
  await fs.writeFile(path.join(appDir, 'package.json'), JSON.stringify({
    name: 'whale-music-pet', productName: 'WhaleMusicPet', version: '1.0.0', private: true,
    description: '鲸鱼娘音乐桌宠 · 本地播放', main: 'pet/music-shell/main.cjs', type: 'module',
    author: 'LitePlayer contributors; model attribution in pet/NOTICE.md',
  }, null, 2));
  await copy(path.join(root, 'node_modules/undici'), 'node_modules/undici');
  const artifacts = await build({ targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64), config: {
    appId: 'local.liteplayer.whalemusic', productName: 'WhaleMusicPet',
    directories: { app: appDir, output: path.join(root, 'release') },
    electronVersion: require('electron/package.json').version,
    electronDist: path.join(root, 'node_modules/electron/dist'),
    asar: false, npmRebuild: false,
    files: ['**/*'],
    win: { icon: path.join(petRoot, 'assets/model/icon.png'), signAndEditExecutable: false },
    portable: { artifactName: 'WhaleMusicPet-1.0.0-Windows-x64.exe' },
  } });
  console.log('Built:', artifacts.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
