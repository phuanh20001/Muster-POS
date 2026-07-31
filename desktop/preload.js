const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__DREAMYCAFE_DESKTOP__', true)
