import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Message } from './Message';
import { Pool } from 'pg';

// Мокаем Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn()
  }))
}));

describe('Message Model - Search functionality', () => {
  let messageModel: Message;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn()
    };
    messageModel = new Message(mockPool);
  });

  describe('highlightText', () => {
    it('should highlight simple text search', () => {
      const text = 'Привет, как дела?';
      const query = 'как';
      const result = (messageModel as any).highlightText(text, query, false);
      expect(result).toBe('Привет, **как** дела?');
    });

    it('should highlight multiple occurrences', () => {
      const text = 'Привет привет всем';
      const query = 'привет';
      const result = (messageModel as any).highlightText(text, query, false);
      expect(result).toBe('**Привет** **привет** всем');
    });

    it('should highlight regex search', () => {
      const text = 'Привет123 мир456';
      const query = '/\\d+/';
      const result = (messageModel as any).highlightText(text, query, true);
      expect(result).toBe('Привет**123** мир**456**');
    });

    it('should handle invalid regex gracefully', () => {
      const text = 'Привет мир';
      const query = '/[invalid/';
      const result = (messageModel as any).highlightText(text, query, true);
      expect(result).toBe('Привет мир');
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      const result = (messageModel as any).escapeRegExp('hello.world*+?^${}()|[]\\');
      expect(result).toBe('hello\\.world\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });
  });

  describe('create', () => {
    it('should create new message', async () => {
      const messageData = {
        user_id: 123,
        chat_id: 456,
        text: 'Hello world!'
      };

      const expectedResult = {
        id: 1,
        ...messageData,
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedResult]
      });

      const result = await messageModel.create(messageData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        [messageData.user_id, messageData.chat_id, messageData.text]
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findById', () => {
    it('should return message when found', async () => {
      const messageId = 1;
      const expectedMessage = {
        id: messageId,
        user_id: 123,
        chat_id: 456,
        text: 'Test message',
        created_at: new Date('2023-01-01T00:00:00Z')
      };

      mockPool.query.mockResolvedValue({
        rows: [expectedMessage]
      });

      const result = await messageModel.findById(messageId);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT id, user_id, chat_id, text, created_at FROM messages WHERE id = $1',
        [messageId]
      );
      expect(result).toEqual(expectedMessage);
    });

    it('should return null when message not found', async () => {
      mockPool.query.mockResolvedValue({
        rows: []
      });

      const result = await messageModel.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return messages for user with default pagination', async () => {
      const userId = 123;
      const messages = [
        {
          id: 1,
          user_id: userId,
          chat_id: 456,
          text: 'Message 1',
          created_at: new Date('2023-01-02T00:00:00Z')
        },
        {
          id: 2,
          user_id: userId,
          chat_id: 456,
          text: 'Message 2',
          created_at: new Date('2023-01-01T00:00:00Z')
        }
      ];

      mockPool.query.mockResolvedValue({
        rows: messages
      });

      const result = await messageModel.findByUserId(userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        [userId, 100, 0]
      );
      expect(result).toEqual(messages);
    });

    it('should support custom limit and offset', async () => {
      const userId = 123;
      const limit = 50;
      const offset = 10;

      mockPool.query.mockResolvedValue({
        rows: []
      });

      await messageModel.findByUserId(userId, limit, offset);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [userId, limit, offset]
      );
    });
  });

  describe('findByChatId', () => {
    it('should return messages from chat', async () => {
      const chatId = 456;
      const messages = [
        {
          id: 1,
          user_id: 123,
          chat_id: chatId,
          text: 'Message 1',
          created_at: new Date('2023-01-01T00:00:00Z')
        }
      ];

      mockPool.query.mockResolvedValue({
        rows: messages
      });

      const result = await messageModel.findByChatId(chatId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE chat_id = $1'),
        [chatId, 100, 0]
      );
      expect(result).toEqual(messages);
    });
  });

  describe('findByDateRange', () => {
    it('should return messages within date range', async () => {
      const chatId = 456;
      const startDate = new Date('2023-01-01T00:00:00Z');
      const endDate = new Date('2023-01-02T00:00:00Z');

      const messages = [
        {
          id: 1,
          user_id: 123,
          chat_id: chatId,
          text: 'Message in range',
          created_at: new Date('2023-01-01T12:00:00Z')
        }
      ];

      mockPool.query.mockResolvedValue({
        rows: messages
      });

      const result = await messageModel.findByDateRange(chatId, startDate, endDate);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN $2 AND $3'),
        [chatId, startDate, endDate]
      );
      expect(result).toEqual(messages);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics for chat', async () => {
      const chatId = 456;
      const stats = [
        {
          user_id: 123,
          username: 'user1',
          first_name: 'User',
          last_name: 'One',
          message_count: 10
        }
      ];

      mockPool.query.mockResolvedValue({
        rows: stats
      });

      const result = await messageModel.getUserStats(chatId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM users u'),
        expect.arrayContaining([chatId])
      );
      expect(result).toEqual(stats);
    });

    it('should apply days limit filter', async () => {
      const chatId = 456;
      const daysLimit = 7;

      mockPool.query.mockResolvedValue({
        rows: []
      });

      await messageModel.getUserStats(chatId, daysLimit);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INTERVAL \'1 day\' * $2'),
        [chatId, daysLimit]
      );
    });
  });

  describe('getTopUsers', () => {
    it('should return top users limited by count', async () => {
      const chatId = 456;
      const limit = 5;

      const allStats = [
        { user_id: 1, username: 'user1', first_name: 'User1', last_name: 'One', message_count: 20 },
        { user_id: 2, username: 'user2', first_name: 'User2', last_name: 'Two', message_count: 15 },
        { user_id: 3, username: 'user3', first_name: 'User3', last_name: 'Three', message_count: 10 }
      ];

      // Мокаем getUserStats
      const getUserStatsSpy = vi.spyOn(messageModel as any, 'getUserStats');
      getUserStatsSpy.mockResolvedValue(allStats);

      const result = await messageModel.getTopUsers(chatId, limit);

      expect(getUserStatsSpy).toHaveBeenCalledWith(chatId, undefined);
      expect(result).toHaveLength(3); // Все пользователи, так как limit > количества
    });
  });

  describe('getTotalCount', () => {
    it('should return total message count for chat', async () => {
      const chatId = 456;
      const totalCount = 42;

      mockPool.query.mockResolvedValue({
        rows: [{ count: totalCount }]
      });

      const result = await messageModel.getTotalCount(chatId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count'),
        [chatId]
      );
      expect(result).toBe(totalCount);
    });

    it('should apply days limit filter', async () => {
      const chatId = 456;
      const daysLimit = 30;

      mockPool.query.mockResolvedValue({
        rows: [{ count: 10 }]
      });

      await messageModel.getTotalCount(chatId, daysLimit);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= CURRENT_TIMESTAMP - INTERVAL \'1 day\' * $2'),
        [chatId, daysLimit]
      );
    });
  });
});