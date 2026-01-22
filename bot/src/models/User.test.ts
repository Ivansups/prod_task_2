import { describe, it, expect, beforeEach, vi } from 'vitest';
import { User, UserData } from './User';
import { Pool } from 'pg';

// Мокаем Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn()
  }))
}));

describe('User Model', () => {
  let userModel: User;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn()
    };
    userModel = new User(mockPool);
  });

  describe('createOrUpdate', () => {
    it('should create new user', async () => {
      const userData = {
        id: 123,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      };

      const expectedResult: UserData = {
        ...userData,
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedResult]
      });

      const result = await userModel.createOrUpdate(userData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [userData.id, userData.username, userData.first_name, userData.last_name]
      );
      expect(result).toEqual(expectedResult);
    });

    it('should update existing user on conflict', async () => {
      const userData = {
        id: 123,
        username: 'updateduser',
        first_name: 'Updated',
        last_name: 'User'
      };

      mockPool.query.mockResolvedValue({
        rows: [{
          ...userData,
          created_at: new Date('2023-01-01T00:00:00Z')
        }]
      });

      await userModel.createOrUpdate(userData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array)
      );
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const userId = 123;
      const expectedUser: UserData = {
        id: userId,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedUser]
      });

      const result = await userModel.findById(userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, username, first_name, last_name, created_at FROM users WHERE id = $1',
        [userId]
      );
      expect(result).toEqual(expectedUser);
    });

    it('should return null when user not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: []
      });

      const result = await userModel.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should return user when found by username', async () => {
      const username = 'testuser';
      const expectedUser: UserData = {
        id: 123,
        username,
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedUser]
      });

      const result = await userModel.findByUsername(username);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, username, first_name, last_name, created_at FROM users WHERE username = $1',
        [username]
      );
      expect(result).toEqual(expectedUser);
    });

    it('should return null when username not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: []
      });

      const result = await userModel.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all users ordered by created_at DESC', async () => {
      const users: UserData[] = [
        {
          id: 1,
          username: 'user1',
          first_name: 'User',
          last_name: 'One',
          created_at: new Date('2023-01-02T00:00:00Z')
        },
        {
          id: 2,
          username: 'user2',
          first_name: 'User',
          last_name: 'Two',
          created_at: new Date('2023-01-01T00:00:00Z')
        }
      ];

      mockPool.query.mockResolvedValue({
        rows: users
      });

      const result = await userModel.findAll();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, username, first_name, last_name, created_at FROM users ORDER BY created_at DESC'
      );
      expect(result).toEqual(users);
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      const userId = 123;
      const updates = {
        username: 'newusername',
        first_name: 'NewFirst'
      };

      const expectedResult: UserData = {
        id: userId,
        username: 'newusername',
        first_name: 'NewFirst',
        last_name: 'User',
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedResult]
      });

      const result = await userModel.update(userId, updates);

      // Проверяем что запрос содержит UPDATE
      const callArgs = mockPool.query.mock.calls[0];
      expect(callArgs[0]).toMatch(/UPDATE users\s+SET/);
      expect(callArgs[1]).toEqual(expect.arrayContaining(['newusername', 'NewFirst', userId]));
      expect(result).toEqual(expectedResult);
    });

    it('should return existing user when no updates provided', async () => {
      const userId = 123;
      const existingUser: UserData = {
        id: userId,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      // Мокаем findById для случая пустых обновлений
      mockPool.query.mockResolvedValueOnce({
        rows: [existingUser]
      });

      const result = await userModel.update(userId, {});

      expect(result).toEqual(existingUser);
    });
  });

  describe('delete', () => {
    it('should delete user and return true', async () => {
      mockPool.query.mockResolvedValue({
        rowCount: 1
      });

      const result = await userModel.delete(123);

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM users WHERE id = $1',
        [123]
      );
      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      mockPool.query.mockResolvedValue({
        rowCount: 0
      });

      const result = await userModel.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should get user stats', async () => {
      const userId = 123;
      const stats = {
        message_count: 42,
        first_message: new Date('2023-01-01T00:00:00Z'),
        last_message: new Date('2023-01-02T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [stats]
      });

      const result = await userModel.getStats(userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_user_stats($1, $2)',
        [userId, null]
      );
      expect(result).toEqual(stats);
    });

    it('should get user stats with days limit', async () => {
      const userId = 123;
      const daysLimit = 7;

      mockPool.query.mockResolvedValue({
        rows: [{
          message_count: 10,
          first_message: new Date('2023-01-01T00:00:00Z'),
          last_message: new Date('2023-01-02T00:00:00Z')
        }]
      });

      await userModel.getStats(userId, daysLimit);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM get_user_stats($1, $2)',
        [userId, daysLimit]
      );
    });
  });
});