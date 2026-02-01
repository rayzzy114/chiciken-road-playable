FROM node:20-slim

# Install git for template cloning/pulling if needed
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Create necessary directories
RUN mkdir -p previews library sessions data temp

# Expose admin panel port
EXPOSE 3000

# Start the bot using ts-node
CMD ["npx", "ts-node", "bot.ts"]
