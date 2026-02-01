# Chicken Railroad Bot - Test Plan

## TC-FLOW-001: Navigation and Duplication Prevention
- **Prerequisites**: Bot is started, user has access.
- **Steps**:
  1. Send `/start` command.
  2. Click "🎮 Заказать плеебл".
  3. Click "🐔 Чикен".
  4. Click "🚂 Chicken Railroad".
  5. Click "🔙 Назад" on the video message.
  6. Click "🏠 Главное меню" (persistent keyboard).
- **Expected Results**:
  1. Only ONE main menu message exists after `/start` (no waving emoji).
  2. Clicking "Back" on video message DELETES the video and shows "Choose Game" menu (no double "Choose Game").
  3. Clicking "🏠 Главное меню" DELETES any previous menu/video and shows the Main Menu photo (no stacking).

## TC-FLOW-002: Category and Game Structure
- **Prerequisites**: User is at "Choose Category".
- **Steps**:
  1. Verify categories: "Чикен", "Плинко", "Слоты", "Метчинг".
  2. Click "🎰 Слоты".
  3. Click "⚡ Gates of Olympus".
  4. Click "🔙 Назад".
- **Expected Results**:
  1. All 4 categories are present.
  2. Placeholder message "В разработке!" shown for Olympus.
  3. "Back" button returns user to "Slots" category, not "Main Menu" or "Chicken".

## TC-FLOW-003: HTML Formatting and Emojis
- **Prerequisites**: Any bot message.
- **Steps**:
  1. View Main Menu, Profile, and Order Summary.
- **Expected Results**:
  1. All labels in Summary/Profile are **Bold**.
  2. No raw `<b>` tags visible.
  3. Buttons have emojis (🎮, 👤, 🤝, etc.).

## TC-SEC-001: Persistent Asset Caching
- **Prerequisites**: Bot has sent at least one media asset.
- **Steps**:
  1. Check `asset_cache` table in `bot.db`.
  2. Restart the bot.
  3. Request the same media asset.
- **Expected Results**:
  1. `asset_cache` contains the file IDs.
  2. After restart, bot uses the cached IDs (logged as `[Cache]`) instead of re-uploading.
