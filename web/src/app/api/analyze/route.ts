import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/services/database';
import { geminiService } from '@/lib/services/gemini';

export interface AnalysisResult {
  username: string;
  analysis: string;
  messageCount: number;
  lastActivity: string;
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();

    // Ищем пользователя по username
    const user = await db.users.findByUsername(cleanUsername);
    if (!user) {
      return NextResponse.json(
        { error: `User @${cleanUsername} not found in database` },
        { status: 404 }
      );
    }

    // Получаем статистику пользователя для проверки
    const stats = await db.users.getStats(user.id);

    if (!stats || stats.message_count === 0) {
      return NextResponse.json(
        { error: `User @${cleanUsername} has no messages to analyze` },
        { status: 404 }
      );
    }

    // Получаем последние сообщения пользователя (увеличено до 50 для лучшего анализа)
    const recentMessages = await db.messages.getRecentMessages(user.id, 50);

    if (recentMessages.length < 5) {
      return NextResponse.json(
        { error: `User @${cleanUsername} has too few messages for analysis. Minimum 5 messages required.` },
        { status: 400 }
      );
    }

    try {
      // Анализируем пользователя с помощью Gemini
      const analysis = await geminiService.analyzeUser(cleanUsername, recentMessages, stats.message_count);

      // Форматируем ответ
      let analysisText = `🤖 *ИИ-анализ пользователя @${cleanUsername}*\n\n`;
      analysisText += `📊 *Статистика:*\n`;
      analysisText += `• Всего сообщений: ${stats.message_count}\n`;

      if (stats.first_message) {
        analysisText += `• Первое сообщение: ${stats.first_message.toLocaleDateString('ru-RU')}\n`;
      }
      if (stats.last_message) {
        analysisText += `• Последнее сообщение: ${stats.last_message.toLocaleDateString('ru-RU')}\n`;
      }

      analysisText += `\n🧠 *Личность:* ${analysis.personality}\n\n`;
      analysisText += `📝 *Основные темы:* ${analysis.topics.join(', ')}\n\n`;
      analysisText += `💬 *Стиль общения:* ${analysis.communicationStyle}\n\n`;
      analysisText += `⚡ *Активность:* ${analysis.activity}\n\n`;
      analysisText += `💡 *Рекомендации:*\n`;
      analysis.recommendations.forEach((rec, index) => {
        analysisText += `${index + 1}. ${rec}\n`;
      });

      const result: AnalysisResult = {
        username: cleanUsername,
        analysis: analysisText,
        messageCount: stats.message_count,
        lastActivity: stats.last_message ? stats.last_message.toISOString() : new Date().toISOString(),
      };

      return NextResponse.json(result);

    } catch (analysisError) {
      console.error('❌ Error in Gemini analysis:', analysisError);
      return NextResponse.json(
        { error: 'AI analysis failed. Please try again later.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('❌ Error in /api/analyze:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}