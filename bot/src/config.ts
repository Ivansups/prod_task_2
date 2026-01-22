import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

export const config = {
  // Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },

  // Database
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'chat_analytics',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },

  // Google Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },

  // Web App
  web: {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
};

/**
 * Проверяет наличие обязательных переменных окружения
 */
export function validateConfig(): void {
  const required = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY'];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('Configuration validated successfully');
}