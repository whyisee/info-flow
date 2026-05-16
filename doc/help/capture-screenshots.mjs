import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = "http://127.0.0.1:5173";
const debugPort = 9333;
const userDataDir = "/private/tmp/info-flow-help-chrome";
const outDir = resolve("doc/help/screenshots");
const token = process.env.INFO_FLOW_HELP_TOKEN;

const pages = [
  { slug: "login", title: "登录页", path: "/login", public: true },
  { slug: "declaration-dashboard", title: "申报首页", path: "/declaration/dashboard" },
  { slug: "declaration-profile", title: "我的资料-基本信息", path: "/declaration/profile" },
  { slug: "declaration-projects", title: "申报业务-项目管理", path: "/declaration/projects" },
  { slug: "declaration-materials", title: "申报业务-我的申报", path: "/declaration/materials" },
  { slug: "declaration-approvals", title: "申报业务-审批中心", path: "/declaration/approvals" },
  { slug: "declaration-templates", title: "申报业务-模板管理", path: "/declaration/templates" },
  { slug: "survey-home", title: "问卷概览", path: "/survey" },
  { slug: "survey-design", title: "问卷应用-问卷设计", path: "/survey/design" },
  { slug: "survey-export", title: "问卷应用-问卷数据", path: "/survey/export" },
  { slug: "system-users", title: "系统-用户管理", path: "/system/users" },
  { slug: "system-permission-catalog", title: "系统-权限目录", path: "/system/permissions/catalog" },
  { slug: "system-permission-roles", title: "系统-角色授权", path: "/system/permissions/roles" },
  { slug: "system-settings", title: "系统-系统设置", path: "/system/settings" },
  { slug: "system-dict", title: "系统-字典维护", path: "/system/dict" },
  { slug: "system-profile-fields", title: "系统-基本信息字段", path: "/system/profile-fields" },
];

if (!token) {
  throw new Error("INFO_FLOW_HELP_TOKEN is required");
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForJson(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function send(ws, method, params = {}) {
  const id = ++send.nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return await new Promise((resolveSend, rejectSend) => {
    const onMessage = (raw) => {
      const data = raw?.data ?? raw;
      const msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString());
      if (msg.id !== id) return;
      ws.removeEventListener("message", onMessage);
      if (msg.error) rejectSend(new Error(`${method}: ${JSON.stringify(msg.error)}`));
      else resolveSend(msg.result ?? {});
    };
    ws.addEventListener("message", onMessage);
  });
}
send.nextId = 0;

async function waitForLoad(ws) {
  await new Promise((resolveLoad) => {
    const timer = setTimeout(resolveLoad, 3000);
    const onMessage = (raw) => {
      const data = raw?.data ?? raw;
      const msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString());
      if (msg.method === "Page.loadEventFired") {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolveLoad();
      }
    };
    ws.addEventListener("message", onMessage);
  });
  await sleep(1200);
}

async function navigate(ws, url) {
  await send(ws, "Page.navigate", { url });
  await waitForLoad(ws);
}

await mkdir(outDir, { recursive: true });
await rm(userDataDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  "--window-size=1440,1000",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

chrome.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  if (!text.includes("DevTools listening")) process.stderr.write(text);
});

try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen) => ws.addEventListener("open", resolveOpen, { once: true }));

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  await navigate(ws, `${baseUrl}/login`);
  await send(ws, "Runtime.evaluate", {
    expression: `localStorage.setItem('token', ${JSON.stringify(token)}); localStorage.removeItem('activeRole');`,
  });

  const manifest = [];
  for (const page of pages) {
    if (page.public) {
      await send(ws, "Runtime.evaluate", { expression: "localStorage.removeItem('token')" });
    } else {
      await send(ws, "Runtime.evaluate", {
        expression: `localStorage.setItem('token', ${JSON.stringify(token)});`,
      });
    }
    await navigate(ws, `${baseUrl}${page.path}`);
    const screenshot = await send(ws, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
    });
    const imagePath = resolve(outDir, `${page.slug}.png`);
    await writeFile(imagePath, Buffer.from(screenshot.data, "base64"));

    const textResult = await send(ws, "Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const textPath = resolve(outDir, `${page.slug}.txt`);
    await writeFile(textPath, textResult.result?.value ?? "");
    manifest.push({ ...page, screenshot: `screenshots/${page.slug}.png`, text: `screenshots/${page.slug}.txt` });
  }

  await writeFile(resolve(dirname(outDir), "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  ws.close();
} finally {
  chrome.kill("SIGTERM");
}
