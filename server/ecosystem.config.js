// pm2 常驻配置：pm2 start ecosystem.config.js
module.exports = {
  apps: [{
    name: 'daily-todo',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '200M',
    env: { CONFIG_FILE: '/var/lib/daily-todo/config.json' },
  }],
};
