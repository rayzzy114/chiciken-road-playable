# Chicken Road Playable Generator

## Project Overview
This project is a **Telegram Bot** (`html5-playable-bot-grammy`) that generates customized **HTML5 Playable Ads**.
The core functionality allows users to configure a "Chicken Railroad" game (theme, language, currency, balance) via Telegram, and the bot automatically builds and delivers a single-file HTML5 game.

### Architecture
- **Bot Service (`html5_generator/`)**:
    - **Framework:** Node.js + TypeScript + [Grammy](https://grammy.dev/) (Telegram Bot).
    - **Database:** SQLite + Prisma ORM.
    - **Admin Panel:** Simple Express.js server for stats (`/admin`).
    - **Builder Engine:** `builder.js` orchestrates the build process.
- **Playable Template (`html5_generator/templates/railroad/`)**:
    - **Stack:** Vite + TypeScript + Pixi.js + GSAP.
    - **Build Output:** Single HTML file (inlined assets) using `vite-plugin-singlefile`.
    - **Configuration:** `src/Config.ts` is dynamically modified by the builder before compilation.

## Key Directories & Files

### Bot Service (`html5_generator/`)
- `bot.ts`: Main entry point. Sets up the bot, session storage, and conversation handlers.
- `bot_helpers.ts`: Helper functions for logic, currency parsing, and pricing.
- `builder.js`: Core logic that copies the template, injects config, runs `vite build`, and returns the final file path.
- `config.ts`: Environment variables and global constants.
- `db.ts`: Database wrapper methods.
- `prisma/schema.prisma`: Database schema (Users, Orders, Logs).
- `data/bot.db`: SQLite database file.

### Playable Template (`html5_generator/templates/railroad/`)
- `src/Game.ts` / `src/main.ts`: Main game logic (Pixi.js).
- `src/Config.ts`: **CRITICAL**. This file defines themes, locales, and the default user configuration. The `builder.js` script uses Regex to inject user-specific settings here.
- `vite.config.js`: Configured to inline all assets (images, CSS, JS) into a single HTML file.

## Getting Started

### Prerequisites
- Node.js (v16+)
- Telegram Bot Token (set in `.env` or `config.ts`)

### Setup & Run (Bot)
1. Navigate to the bot directory:
   ```bash
   cd html5_generator
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Initialize the database:
   ```bash
   npx prisma db push
   ```
4. Start the bot:
   ```bash
   npm start
   ```
   (Runs `ts-node bot.ts`)

### Developing the Template
You can work on the game template independently to test gameplay changes.
1. Navigate to the template:
   ```bash
   cd html5_generator/templates/railroad
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

## Build Process (How it works)
1. User completes the wizard in Telegram.
2. Bot saves an `Order` to the DB.
3. Bot calls `generatePlayable(order)` from `builder.js`.
4. **Builder Steps:**
   - Creates a temp directory `html5_generator/temp/<order_id>`.
   - Copies `templates/railroad` to the temp directory.
   - **Injects** the user's config (Currency, Theme, etc.) into `src/Config.ts`.
   - Runs `npm install` (if `node_modules` missing) and `npm run build` inside the temp dir.
   - Moves the generated `dist/index.html` to `html5_generator/previews/`.
   - Cleans up the temp directory.
5. Bot sends the file to the user.

## Conventions
- **Configuration Injection:** The builder relies on specific formatting in `src/Config.ts` to inject values. **Do not change the structure of the `user` object in `Config.ts` without updating `builder.js` regex.**
- **Assets:** All game assets in the template must be importable or referenced such that Vite can inline them.
- **Database:** Always run `npx prisma db push` after modifying `schema.prisma`.
