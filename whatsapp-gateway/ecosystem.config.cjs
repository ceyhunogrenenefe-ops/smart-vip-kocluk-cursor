module.exports = {
  apps: [
    {
      name: 'whatsapp-gateway',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      min_uptime: '10s',
      max_restarts: 20,
      exp_backoff_restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        PORT: 4010,
      },
    },
  ],
};
