import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

/* ========================
   环境变量
======================== */
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS === 'true';
const FILE_PATH = process.env.FILE_PATH || '.tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const UUID = process.env.UUID || '84705c0d-5036-44b1-a07e-d1582e653595';
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || '';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'Galaxy';

/* ========================
   初始化目录
======================== */
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH);

/* ========================
   随机名
======================== */
function rnd() {
  const s = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: 6 }, () => s[Math.floor(Math.random() * s.length)]).join('');
}

const npmName = rnd();
const webName = rnd();
const botName = rnd();
const phpName = rnd();

const npmPath = path.join(FILE_PATH, npmName);
const webPath = path.join(FILE_PATH, webName);
const botPath = path.join(FILE_PATH, botName);
const phpPath = path.join(FILE_PATH, phpName);
const subPath = path.join(FILE_PATH, 'sub.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');

/* ========================
   Meteor 启动入口
======================== */
Meteor.startup(async () => {
  console.log("Meteor server started");
  await startserver();
});

/* ========================
   HTTP 路由
======================== */
WebApp.connectHandlers.use("/", (req, res, next) => {
  if (req.url !== "/") return next();
  try {
    const html = Assets.getText("index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  } catch {
    res.end("Service is running! Visit /sub");
  }
});

WebApp.connectHandlers.use(`/${SUB_PATH}`, (req, res) => {
  if (!fs.existsSync(subPath)) {
    res.writeHead(404);
    return res.end("Subscription not ready");
  }
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(fs.readFileSync(subPath, "utf8"));
});

/* ========================
   主逻辑
======================== */
async function startserver() {
  argoType();
  cleanupOldFiles();
  await generateConfig();
  await downloadFilesAndRun();
  await extractDomains();
  await AddVisitTask();
}

/* ========================
   工具函数
======================== */
function cleanupOldFiles() {
  for (const f of fs.readdirSync(FILE_PATH)) {
    try {
      fs.unlinkSync(path.join(FILE_PATH, f));
    } catch {}
  }
}

async function generateConfig() {
  const config = {
    log: { loglevel: "none" },
    inbounds: [
      {
        port: ARGO_PORT,
        protocol: "vless",
        settings: { clients: [{ id: UUID }], decryption: "none" },
        streamSettings: { network: "ws", wsSettings: { path: "/vless-argo" } }
      }
    ],
    outbounds: [{ protocol: "freedom" }]
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getArch() {
  return os.arch().includes("arm") ? "arm" : "amd";
}

function getFilesForArchitecture(arch) {
  return [
    {
      fileName: webPath,
      fileUrl: arch === "arm"
        ? "https://arm64.ssss.nyc.mn/web"
        : "https://amd64.ssss.nyc.mn/web"
    },
    {
      fileName: botPath,
      fileUrl: arch === "arm"
        ? "https://arm64.ssss.nyc.mn/bot"
        : "https://amd64.ssss.nyc.mn/bot"
    }
  ];
}

async function download(file, url) {
  const res = await axios.get(url, { responseType: "stream" });
  return new Promise(resolve => {
    const w = fs.createWriteStream(file);
    res.data.pipe(w);
    w.on("finish", resolve);
  });
}

async function downloadFilesAndRun() {
  const arch = getArch();
  const files = getFilesForArchitecture(arch);

  for (const f of files) await download(f.fileName, f.fileUrl);

  await exec(`chmod +x ${webPath} ${botPath}`);
  await exec(`nohup ${webPath} -c ${configPath} >/dev/null 2>&1 &`);
  await exec(`nohup ${botPath} tunnel --url http://localhost:${ARGO_PORT} --logfile ${bootLogPath} >/dev/null 2>&1 &`);
}

async function extractDomains() {
  await new Promise(r => setTimeout(r, 3000));
  const log = fs.readFileSync(bootLogPath, "utf8");
  const m = log.match(/https?:\/\/([^ ]*trycloudflare\.com)/);
  if (!m) return;
  await generateLinks(m[1]);
}

async function generateLinks(domain) {
  const nodeName = `${NAME}`;
  const vmess = Buffer.from(JSON.stringify({
    v: "2",
    ps: nodeName,
    add: CFIP,
    port: CFPORT,
    id: UUID,
    net: "ws",
    host: domain,
    path: "/vmess-argo",
    tls: "tls"
  })).toString("base64");

  const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${domain}&type=ws&host=${domain}&path=/vless-argo#${nodeName}
vmess://${vmess}
`.trim();

  fs.writeFileSync(subPath, Buffer.from(subTxt).toString("base64"));
  if (UPLOAD_URL) uploadNodes();
}

async function uploadNodes() {
  if (!UPLOAD_URL || !PROJECT_URL) return;
  await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, {
    subscription: [`${PROJECT_URL}/${SUB_PATH}`]
  });
}

function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;
  fs.writeFileSync(
    path.join(FILE_PATH, "tunnel.yml"),
    `
tunnel: ${ARGO_DOMAIN}
credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
ingress:
  - hostname: ${ARGO_DOMAIN}
    service: http://localhost:${ARGO_PORT}
  - service: http_status:404
`
  );
}

async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL });
}
