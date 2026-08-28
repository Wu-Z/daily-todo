# 每日待办 PWA 后台推送服务

让「每日待办」在 **App 不在前台 / 页面关闭**时也能收到提醒。

## 原理
- App 部署到 HTTPS 后，注册 Service Worker 并获得浏览器推送订阅
- App 每次打开/保存时，把**未来 24 小时的提醒计划**同步到本服务
- 本服务每分钟检查一次，到活动时间（含提前量）通过 **Web Push** 推送到已安装的 PWA

## 快速开始

```bash
cd push-server
npm install
npm run keys        # 生成 VAPID 密钥，复制输出
export VAPID_PUBLIC_KEY="刚才的公钥"
export VAPID_PRIVATE_KEY="刚才的私钥"
export VAPID_SUBJECT="mailto:you@example.com"
npm start           # 默认端口 8787
```

也可以复制 `.env.example` 为 `.env`（需安装 dotenv）或用你服务器的方式注入环境变量。

## 接口（供 App 调用）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /subscribe | 保存浏览器推送订阅 `{subscription}` |
| POST | /sync | 同步提醒计划 `{reminders:[{id,text,time:'YYYY-MM-DD HH:MM',leadMin,quad,date}]}` |
| POST | /unsubscribe | 清除订阅与计划 |
| GET  | /health | 健康检查 |

## 部署到云服务器

```bash
# 建议用 pm2 常驻
pm2 start server.js --name dailytodo-push
```

注意：
- 生产环境请用 Nginx/Caddy 反代并开启 HTTPS（推送订阅要求 https 或 localhost）
- 数据存内存，服务器重启后 App 下次打开会自动重新同步
- 个人单用户场景足够；多设备可扩展为按订阅保存多份计划

## 说明
- 后台收到通知依赖 macOS 的 Safari/Chrome **保持运行**（推送会唤醒 Service Worker）；浏览器完全退出时可能延迟或无法送达
- iOS「添加到主屏幕」的 PWA 同样支持 Web Push（iOS 16.4+）
