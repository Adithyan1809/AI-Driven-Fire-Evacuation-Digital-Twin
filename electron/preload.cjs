const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  appVersion: '2.0.0',
  platform: process.platform,
  title: 'AI Fire Evacuation Digital Twin'
});
