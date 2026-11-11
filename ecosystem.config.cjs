module.exports = {
  apps: [{
    name: 'gouye',
    script: './node_modules/.bin/tsx',
    args: 'src/app.ts',
    interpreter: 'none',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      TZ: 'Asia/Shanghai'
    },
    watch: ['src'],
    watch_delay: 1000,
    ignore_watch: ['node_modules', 'tests', 'log'],
    max_memory_restart: '256M',
    restart_delay: 1000,
    autorestart: true
  }]
};
