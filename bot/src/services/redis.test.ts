import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RedisService } from './redis';
import { createClient } from 'redis';

// Мокаем redis клиент
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    get: vi.fn(),
    setEx: vi.fn(),
    del: vi.fn(),
    on: vi.fn()
  }))
}));

describe('RedisService', () => {
  let redisService: RedisService;
  let mockClient: any;

  beforeEach(() => {
    // Очищаем все моки перед каждым тестом
    vi.clearAllMocks();

    // Создаем новый экземпляр сервиса
    redisService = new RedisService();

    // Получаем ссылку на мок клиента
    mockClient = (createClient as any).mock.results[0].value;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create Redis client with correct configuration', () => {
      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379'
      });
    });

    it('should setup event listeners', () => {
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('should handle connection events', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Проверяем обработчик ошибки
      const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
      errorHandler(new Error('Redis error'));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Redis Client Error:', expect.any(Error));

      // Проверяем обработчик подключения
      const connectHandler = mockClient.on.mock.calls.find(call => call[0] === 'connect')[1];
      connectHandler();
      expect(consoleSpy).toHaveBeenCalledWith('Connected to Redis');

      // Проверяем обработчик отключения
      const disconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'disconnect')[1];
      disconnectHandler();
      expect(consoleSpy).toHaveBeenCalledWith('Disconnected from Redis');

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await expect(redisService.connect()).resolves.toBeUndefined();
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should throw error on connection failure', async () => {
      const error = new Error('Connection failed');
      mockClient.connect.mockRejectedValue(error);

      await expect(redisService.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      mockClient.disconnect.mockResolvedValue(undefined);

      await expect(redisService.disconnect()).resolves.toBeUndefined();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return value from Redis', async () => {
      const key = 'test_key';
      const value = 'test_value';

      mockClient.get.mockResolvedValue(value);

      const result = await redisService.get(key);

      expect(mockClient.get).toHaveBeenCalledWith(key);
      expect(result).toBe(value);
    });

    it('should return null on error', async () => {
      const key = 'test_key';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await redisService.get(key);

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Redis GET error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('set', () => {
    it('should set value with default TTL', async () => {
      const key = 'test_key';
      const value = 'test_value';

      mockClient.setEx.mockResolvedValue(undefined);

      await redisService.set(key, value);

      expect(mockClient.setEx).toHaveBeenCalledWith(key, 1200, value);
    });

    it('should set value with custom TTL', async () => {
      const key = 'test_key';
      const value = 'test_value';
      const ttl = 3600;

      mockClient.setEx.mockResolvedValue(undefined);

      await redisService.set(key, value, ttl);

      expect(mockClient.setEx).toHaveBeenCalledWith(key, ttl, value);
    });

    it('should handle error gracefully', async () => {
      const key = 'test_key';
      const value = 'test_value';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockClient.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(redisService.set(key, value)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Redis SET error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('delete', () => {
    it('should delete value from Redis', async () => {
      const key = 'test_key';

      mockClient.del.mockResolvedValue(undefined);

      await expect(redisService.delete(key)).resolves.toBeUndefined();
      expect(mockClient.del).toHaveBeenCalledWith(key);
    });

    it('should handle error gracefully', async () => {
      const key = 'test_key';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(redisService.delete(key)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('Redis DELETE error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('isClientConnected', () => {
    it('should return false initially', () => {
      expect(redisService.isClientConnected()).toBe(false);
    });

    it('should return true after successful connection', () => {
      const connectHandler = mockClient.on.mock.calls.find(call => call[0] === 'connect')[1];
      connectHandler();

      expect(redisService.isClientConnected()).toBe(true);
    });

    it('should return false after disconnection', () => {
      const connectHandler = mockClient.on.mock.calls.find(call => call[0] === 'connect')[1];
      const disconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'disconnect')[1];

      connectHandler();
      expect(redisService.isClientConnected()).toBe(true);

      disconnectHandler();
      expect(redisService.isClientConnected()).toBe(false);
    });
  });

  describe('createStatsCacheKey', () => {
    it('should create correct stats cache key', () => {
      const chatId = 123;
      const period = 'week';

      const result = redisService.createStatsCacheKey(chatId, period);

      expect(result).toBe('stats:123:week');
    });
  });

  describe('createUserStatsCacheKey', () => {
    it('should create correct user stats cache key', () => {
      const chatId = 123;
      const userId = 456;
      const period = 'month';

      const result = redisService.createUserStatsCacheKey(chatId, userId, period);

      expect(result).toBe('user_stats:123:456:month');
    });
  });

  describe('createUsersListCacheKey', () => {
    it('should create correct users list cache key', () => {
      const chatId = 123;

      const result = redisService.createUsersListCacheKey(chatId);

      expect(result).toBe('users_list:123');
    });
  });

  describe('createSearchCacheKey', () => {
    it('should create correct search cache key', () => {
      const chatId = 123;
      const query = 'hello world';
      const page = 2;

      const result = redisService.createSearchCacheKey(chatId, query, page);

      // Проверяем что ключ содержит chatId, нормализованный запрос и page
      expect(result).toContain('search:123:');
      expect(result).toContain(':2');
      // Проверяем что пробелы заменены на подчеркивания
      expect(result).toContain('hello_world');
    });

    it('should limit query length in cache key', () => {
      const chatId = 123;
      const longQuery = 'a'.repeat(100); // Очень длинный запрос
      const page = 1;

      const result = redisService.createSearchCacheKey(chatId, longQuery, page);

      // Проверяем что длина ключа ограничена
      const queryPart = result.split(':')[2];
      expect(queryPart.length).toBeLessThanOrEqual(50);
    });

    it('should sanitize special characters in query', () => {
      const chatId = 123;
      const query = 'hello/world\\test?query=value';
      const page = 1;

      const result = redisService.createSearchCacheKey(chatId, query, page);

      // Проверяем что специальные символы заменены на подчеркивания
      expect(result).toContain('hello_world_test_query_value');
    });
  });
});