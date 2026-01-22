// Тестовый setup файл для Vitest
// Здесь можно настроить глобальные моки и конфигурацию для всех тестов

import { vi } from 'vitest';

// Мокаем переменные окружения по умолчанию для тестов
process.env.NODE_ENV = 'test';
process.env.POSTGRES_HOST = 'localhost';
process.env.POSTGRES_PORT = '5432';
process.env.POSTGRES_DB = 'test_db';
process.env.POSTGRES_USER = 'test_user';
process.env.POSTGRES_PASSWORD = 'test_password';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Мокаем console методы для более чистого вывода тестов
global.console = {
  ...console,
  // Оставляем error и warn для важных сообщений
  log: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};