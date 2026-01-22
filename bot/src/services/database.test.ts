import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseService } from './database';
import { Pool } from 'pg';

// Мокаем Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn()
  }))
}));

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  let mockPool: unknown;

  beforeEach(() => {
    // Очищаем все моки перед каждым тестом
    vi.clearAllMocks();

    // Создаем мок Pool
    mockPool = {
      connect: vi.fn(),
      query: vi.fn(),
      end: vi.fn(),
      on: vi.fn()
    };

    // Мокаем конструктор Pool чтобы он возвращал наш мок
    (Pool as any).mockImplementation(() => mockPool);

    // Создаем новый экземпляр сервиса
    dbService = new DatabaseService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create Pool with correct configuration', () => {
      expect(Pool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    });

    it('should setup event listeners', () => {
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should handle connection error gracefully', () => {
      const errorHandler = mockPool.on.mock.calls.find(call => call[0] === 'error')[1];
      const mockError = new Error('Connection error');

      // Мокаем process.exit чтобы он не завершал тесты
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });

      expect(() => errorHandler(mockError)).toThrow('Process exit called');
      expect(exitSpy).toHaveBeenCalledWith(-1);

      exitSpy.mockRestore();
    });

    it('should log successful connection', () => {
      const connectHandler = mockPool.on.mock.calls.find(call => call[0] === 'connect')[1];

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      connectHandler();

      expect(consoleSpy).toHaveBeenCalledWith('Connected to PostgreSQL database');

      consoleSpy.mockRestore();
    });
  });

  describe('getPool', () => {
    it('should return the pool instance', () => {
      expect(dbService.getPool()).toBe(mockPool);
    });
  });

  describe('users getter', () => {
    it('should return User model instance', () => {
      const users = dbService.users;
      expect(users).toBeDefined();
      // Проверяем что модель была создана с правильным пулом
      expect(users).toHaveProperty('createOrUpdate');
      expect(users).toHaveProperty('findById');
    });
  });

  describe('messages getter', () => {
    it('should return Message model instance', () => {
      const messages = dbService.messages;
      expect(messages).toBeDefined();
      // Проверяем что модель была создана с правильным пулом
      expect(messages).toHaveProperty('create');
      expect(messages).toHaveProperty('findById');
    });
  });

  describe('testConnection', () => {
    it('should return true on successful connection test', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn()
      };

      mockPool.connect.mockResolvedValue(mockClient);

      const result = await dbService.testConnection();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW()');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false on connection error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      const result = await dbService.testConnection();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Database connection test failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should return false on query error', async () => {
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('Query failed')),
        release: vi.fn()
      };

      mockPool.connect.mockResolvedValue(mockClient);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await dbService.testConnection();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Database connection test failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('should close the database connection pool', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await dbService.close();

      expect(mockPool.end).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Database connections closed');

      consoleSpy.mockRestore();
    });
  });

  describe('query', () => {
    it('should execute query without parameters', async () => {
      const queryText = 'SELECT * FROM users';
      const expectedResult = { rows: [{ id: 1, name: 'test' }] };

      mockPool.query.mockResolvedValue(expectedResult);

      const result = await dbService.query(queryText);

      expect(mockPool.query).toHaveBeenCalledWith(queryText, undefined);
      expect(result).toEqual(expectedResult);
    });

    it('should execute query with parameters', async () => {
      const queryText = 'SELECT * FROM users WHERE id = $1';
      const params = [123];
      const expectedResult = { rows: [{ id: 123, name: 'test' }] };

      mockPool.query.mockResolvedValue(expectedResult);

      const result = await dbService.query(queryText, params);

      expect(mockPool.query).toHaveBeenCalledWith(queryText, params);
      expect(result).toEqual(expectedResult);
    });
  });
});