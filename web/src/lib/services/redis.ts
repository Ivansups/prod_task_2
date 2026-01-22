import { createClient, RedisClientType } from 'redis';

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Disconnected from Redis');
      this.isConnected = false;
    });
  }

  /**
   * Подключается к Redis
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Закрывает соединение с Redis
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
    }
  }

  /**
   * Получает значение из кэша
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  /**
   * Устанавливает значение в кэш с TTL
   */
  async set(key: string, value: string, ttlSeconds: number = 1200): Promise<void> {
    try {
      await this.client.setEx(key, ttlSeconds, value);
    } catch (error) {
      console.error('Redis SET error:', error);
    }
  }

  /**
   * Удаляет значение из кэша
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis DELETE error:', error);
    }
  }

  /**
   * Проверяет, подключен ли клиент к Redis
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Создает ключ для кэширования статистики
   */
  createStatsCacheKey(chatId: number, period: string): string {
    return `stats:${chatId}:${period}`;
  }

  /**
   * Создает ключ для кэширования статистики пользователя
   */
  createUserStatsCacheKey(chatId: number, userId: number, period: string): string {
    return `user_stats:${chatId}:${userId}:${period}`;
  }

  /**
   * Создает ключ для кэширования списка пользователей
   */
  createUsersListCacheKey(chatId: number): string {
    return `users_list:${chatId}`;
  }

  /**
   * Создает ключ для кэширования результатов поиска
   */
  createSearchCacheKey(chatId: number, query: string, page: number): string {
    // Нормализуем запрос для ключа (убираем пробелы и специальные символы)
    const normalizedQuery = query.replace(/[^a-zA-Z0-9а-яА-Я]/g, '_').substring(0, 50);
    return `search:${chatId}:${normalizedQuery}:${page}`;
  }
}

// Создаем синглтон экземпляр сервиса Redis
export const redis = new RedisService();