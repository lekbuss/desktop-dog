const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

function createTray(mainWindow) {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('豆豆');

  const contextMenu = Menu.buildFromTemplate([
    { label: '🍖 喂食', click: () => mainWindow.webContents.send('dog:tray-action', 'feed') },
    { label: '💧 喂水', click: () => mainWindow.webContents.send('dog:tray-action', 'water') },
    { label: '🚶 散步', click: () => mainWindow.webContents.send('dog:tray-action', 'walk') },
    { label: '💬 说话', click: () => mainWindow.webContents.send('dog:tray-action', 'talk') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
  tray.on('click', () => tray.popUpContextMenu(contextMenu));

  return tray;
}

module.exports = { createTray };
