'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AskTeamBox from '@/components/AskTeamBox';

interface Question {
  id: string;
  asker_name: string;
  question_text: string;
  answer_text: string | null;
  status: string;
  target_clone_id: string | null;
  clone_display_name: string | null;
  asked_at: string;
  answered_at: string | null;
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const questionsRes = await fetch('/api/questions');

      if (questionsRes.ok) {
        const data = await questionsRes.json();
        setQuestions(data.questions || []);
      }


      setLoading(false);
    } catch (err) {
      setError('Failed to load data');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">Questions</h1>
            <p className="text-gray-600 mt-2">Ask questions to your team's clones</p>
          </div>
          <Link href="/top-floor" className="text-blue-600 hover:underline">
            ← Back to Top Floor
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <AskTeamBox title="Ask a question" onAsked={loadData} />

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Recent Questions</h2>
          {questions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No questions yet. Ask one to get started!</p>
          ) : (
            <div className="space-y-4">
              {questions.map(question => (
                <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm text-gray-500">
                        {question.asker_name} → {question.clone_display_name}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(question.asked_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      question.status === 'answered' ? 'bg-green-100 text-green-800' :
                      question.status === 'escalated' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {question.status}
                    </span>
                  </div>
                  <p className="font-medium mb-2">{question.question_text}</p>
                  {question.answer_text && (
                    <div className="mt-2 p-3 bg-gray-50 rounded">
                      <p className="text-sm text-gray-700">{question.answer_text}</p>
                      {question.answered_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          Answered {new Date(question.answered_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
