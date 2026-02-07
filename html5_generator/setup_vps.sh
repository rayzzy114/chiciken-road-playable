#!/bin/bash

# 1. Create SWAP (1GB RAM is not enough for building playables without swap)
echo "🚀 Creating 2GB SWAP file..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo "✅ SWAP created!"

# 2. Install Node.js (using NVM)
echo "📦 Installing Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20

# 3. Install PM2
echo "⚙️ Installing PM2..."
npm install -g pm2

# 4. Success
echo "------------------------------------------------"
echo "✨ VPS Setup Complete!"
echo "Next steps:"
echo "1. Upload your code to the server"
echo "2. Run: cd html5_generator && npm install && npm --prefix admin install"
echo "3. Run: npm run build:all"
echo "4. Run: npx prisma db push"
echo "5. Run: mkdir -p logs && pm2 start ecosystem.config.cjs"
echo "6. Run: pm2 save && pm2 startup"
echo "------------------------------------------------"
