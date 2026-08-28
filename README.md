# daily-todo

每日待办 —— 四象限 × 日期时间线（Apple 极简风）。前后端分离，云端数据为主、免登录 Token 鉴权。

## 目录

```
daily-todo/
├── frontend/          # 前端静态 SPA（现有网页 + PWA）
│   ├── 每日待办.html
│   ├── sw.js          # Service Worker（Web Push 后台推送）
│   ├── manifest.webmanifest
│   └── icon.svg
└── server/            # 后端 Node.js API 服务
    ├── server.js      # 数据读写 + Token 鉴权 + 定时推送
    ├── package.json
    └── .env.example
```

## 后端接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查 |
| GET | /api/state | 拉取云端数据（Token） |
| PUT | /api/state | 保存云端数据（Token） |
| GET | /api/push/keys | VAPID 公钥（前端订阅推送，暂缓） |
| POST | /api/push/subscribe | 保存推送订阅（暂缓） |
| POST | /api/sync | 同步未来提醒计划（暂缓） |
| POST | /api/unsubscribe | 清除订阅与计划（暂缓） |

鉴权：`Authorization: Bearer <TOKEN>` 或 `?token=<TOKEN>`（免登录，单用户）。
> 推送相关接口已实现但暂缓启用（`pushEnabled: false`），等网页版调试完成后再开。

## 配置（配置文件）

复制 `config.example.json` 为 `config.json` 并填写：

```json
{
  "port": 8787,
  "token": "改成你自己的随机长字符串",
  "dataFile": "./data.json",
  "pushEnabled": false,
  "vapidPublicKey": "",
  "vapidPrivateKey": "",
  "vapidSubject": "mailto:you@example.com"
}
```

优先级：环境变量 > config.json > 默认值。数据存 `data.json`（服务器上）。

## 本地运行后端

```bash
cd server
npm install
cp config.example.json config.json   # 填上 token
npm start                            # http://localhost:8787
```

## 部署（服务器）

```bash
# 1. 上传 server/ 到服务器，安装依赖
cd server && npm install

# 2. 配置
cp config.example.json config.json   # 填 port/token/dataFile/pushEnabled

# 3. 常驻运行
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 4. Nginx 反代 + 前端静态文件
#    - frontend/ 上传到 /var/www/daily-todo
#    - 参考 nginx.conf.example 配置（server_name 改你的域名）
#    - HTTPS：certbot --nginx（Let's Encrypt 免费证书）

# 5. 前端设置里填入：服务器地址（https://你的域名）+ Token
```

## 前端云同步（已实现）

- 设置 → 云端同步：填服务器地址 + Token
- 启动时从云端拉取（云端有数据则以云端为准；云端为空则上传本地）
- 每次修改自动防抖 2 秒同步上云；离线时存本地，联网自动补传（`online` 事件）
- 未配置服务器时完全本地运行（与旧版一致）

## 后续

- [x] 前端接入后端（云端同步）
- [ ] 推送（Web Push）暂缓，网页版稳定后再启用
- [ ] 网页版调试完毕后，再打包 Mac（Electron）程序
