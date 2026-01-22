import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../lib/services/database';
import { geminiService } from '../../lib/services/gemini';

/**
 * API эндпоинт для анализа пользователей
 * POST /api/analyze
 *
 * Выполняет ИИ-анализ поведения пользователя на основе его сообщений в чате
 */

interface AnalyzeRequest {
  username: string;
}

interface AnalyzeResponse {
  personality: string;
  topics: string[];
  communicationStyle: string;
  activity: string;
  recommendations: string[];
}

/**
 * Обработчик API запросов для анализа пользователей
 * @param req - HTTP запрос с телом { username: string }
 * @param res - HTTP ответ с анализом пользователя или ошибкой
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyzeResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username }: AnalyzeRequest = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;

    const user = await db.users.findByUsername(normalizedUsername);

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден в базе данных' });
    }

    const messages = await db.messages.getRecentMessages(user.id, 50);

    if (messages.length === 0) {
      return res.status(404).json({ error: 'У пользователя нет сообщений для анализа' });
    }

    const userStats = await db.users.getStats(user.id);
    const totalMessages = userStats?.message_count || messages.length;

    const messagesForAnalysis = messages.map(msg => ({
      text: msg.text,
      created_at: msg.created_at
    }));

    const analysis = await geminiService.analyzeUser(
      normalizedUsername,
      messagesForAnalysis,
      totalMessages
    );

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in analyze API:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}