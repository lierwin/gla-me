import { Meteor } from 'meteor/meteor'
import { WebApp } from 'meteor/webapp'

import express from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)
const app = express()

// ===== 环境变量 =====
const PORT = process.env.PORT || 3000
const FILE_PATH = process.env.FILE_PATH || '.tmp'
const SUB_PATH = process.env.SUB_PATH || 'sub'
const NAME = process.env.NAME || 'Galaxy'

// ===== 初始化目录 =====
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH, { recursive: true })
}

// ===== 工具函数 =====
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

// ===== 订阅生成示例（保留你结构）=====
app.get(`/${SUB_PATH}`, (req, res) => {
  const demoSub = `
vless://demo@host:443#Meteor
vmess://ZGVtbw==
trojan://demo@host:443
  `
  const encoded = Buffer.from(demoSub).toString('base64')
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.send(encoded)
})

// ===== 根路由 =====
app.get('/', (req, res) => {
  res.send(`
<h2>🚀 Meteor Galaxy Service Running</h2>
<p>订阅地址：</p>
<pre>/${SUB_PATH}</pre>
`)
})

// ===== Meteor 挂载 Express =====
Meteor.startup(() => {
  WebApp.connectHandlers.use(app)
  console.log(`✅ Meteor service started`)
})
