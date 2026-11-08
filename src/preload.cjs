const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "accounts",
  Object.freeze({
    call: (method, params = {}) =>
      ipcRenderer.invoke("accounts:call", method, params),
    onState: (fn) => {
      const listener = (_event, data) => fn(data);
      ipcRenderer.on("accounts:state", listener);
      return () => ipcRenderer.removeListener("accounts:state", listener);
    },
  }),
);
