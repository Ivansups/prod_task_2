import { useState } from 'react';
import Head from 'next/head';

/**
 * Структура ответа ИИ-анализа пользователя
 */
interface UserAnalysis {
  personality: string;
  topics: string[];
  communicationStyle: string;
  activity: string;
  recommendations: string[];
}

/**
 * Главная страница веб-интерфейса для анализа пользователей Telegram
 * Позволяет вводить username и получать ИИ-анализ поведения пользователя
 */
export default function Home() {
  const [username, setUsername] = useState('');
  const [analysis, setAnalysis] = useState<UserAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Обрабатывает отправку формы анализа пользователя
   * Отправляет запрос к API и обновляет состояние компонента
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!response.ok) {
        throw new Error('Не удалось выполнить анализ');
      }

      const data = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Telegram Chat Analytics</title>
        <meta name="description" content="Анализ поведения пользователей в Telegram чатах" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Telegram Chat Analytics
            </h1>
            <p className="text-lg text-gray-600">
              Анализ поведения пользователей с помощью ИИ
            </p>
          </header>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <form onSubmit={handleSubmit} className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Имя пользователя Telegram
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@username или username"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Анализ...' : 'Анализировать'}
                </button>
              </div>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Ошибка
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          )}

          {analysis && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Анализ пользователя @{username}
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Личность и характер
                  </h3>
                  <p className="text-gray-700">{analysis.personality}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Основные темы обсуждения
                  </h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {analysis.topics.map((topic, index) => (
                      <li key={index}>{topic}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Стиль общения
                  </h3>
                  <p className="text-gray-700">{analysis.communicationStyle}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Активность
                  </h3>
                  <p className="text-gray-700">{analysis.activity}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Рекомендации по взаимодействию
                  </h3>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {analysis.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}