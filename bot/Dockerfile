# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S telegrambot -u 1001

# Change ownership of app directory
RUN chown -R telegrambot:nodejs /app
USER telegrambot

# Expose port (if needed)
# EXPOSE 3000

# Start the bot
CMD ["node", "dist/index.js"]