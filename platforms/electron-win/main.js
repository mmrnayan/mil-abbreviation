const { app, BrowserWindow, protocol, net, shell, session } = require("electron");
const { existsSync, statSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const smoke = process.argv.includes("--offline-smoke-test");
if (smoke) app.setPath("userData", require("node:fs").mkdtempSync(path.join(require("node:os").tmpdir(), "sac-offline-smoke-")));
protocol.registerSchemesAsPrivileged([{ scheme: "sac", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window;
  app.whenReady().then(() => {
    if (smoke) session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (_details, callback) => callback({ cancel: true }));
    const root = path.join(__dirname, "www");
    protocol.handle("sac", (request) => {
      const url = new URL(request.url);
      let relative;
      try { relative = decodeURIComponent(url.pathname); } catch { return new Response("Not found", { status: 404 }); }
      if (url.hostname !== "app" || relative.includes("\\") || relative.includes("\0")) return new Response("Not found", { status: 404 });
      let file = path.resolve(root, "." + relative);
      if (file !== root && !file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
      if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!existsSync(file)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    window = new BrowserWindow({ show: !smoke, width: 1280, height: 820, autoHideMenuBar: true, title: "Abbreviation Converter", backgroundColor: "#173e32", webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    window.loadURL("sac://app/");
    if (smoke) {
      const deadline = Date.now() + 20000;
      const timer = setInterval(async () => {
        try {
          const text = await window.webContents.executeJavaScript("document.body.innerText");
          if (text.includes("Write clearly.") && text.includes("entries") && text.includes("Full-form input")) {
            clearInterval(timer); console.log("PASS: Windows consumer UI and bundled dataset loaded with all HTTP/HTTPS requests blocked."); app.exit(0);
          } else if (Date.now() > deadline) { clearInterval(timer); console.error("FAIL: offline app did not become ready", text.slice(0, 500)); app.exit(1); }
        } catch { if (Date.now() > deadline) { clearInterval(timer); app.exit(1); } }
      }, 250);
    }
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//u.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("sac://app/")) event.preventDefault(); });
  });
  app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on("window-all-closed", () => app.quit());
}
