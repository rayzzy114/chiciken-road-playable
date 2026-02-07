module.exports = {
  apps: [
    {
      name: "playable-bot",
      script: "dist/bot.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "playable-admin",
      script: "npm",
      args: "--prefix admin run start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      error_file: "./logs/admin-err.log",
      out_file: "./logs/admin-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
