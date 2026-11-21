// أسماء قنوات IPC — مكان واحد يستخدمه Main و Preload
export const CH = {
  appInfo: 'app:info',
  openDataFolder: 'app:open-data-folder',
  openBackupsFolder: 'app:open-backups-folder',

  deviceGet: 'device:get',
  deviceRefresh: 'device:refresh',
  deviceSelect: 'device:select',
  deviceSelectCom: 'device:select-com',
  deviceStateEvent: 'device:state-event',

  profilesList: 'profiles:list',
  profilesReload: 'profiles:reload',

  runStart: 'run:start',
  runCancel: 'run:cancel',
  runProgressEvent: 'run:progress-event',

  logHistory: 'log:history',
  logClear: 'log:clear',
  logExport: 'log:export',
  logEntriesEvent: 'log:entries-event',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const
