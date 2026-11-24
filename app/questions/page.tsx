'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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

interface Clone {
  id: string;
  display_name: string;
  handle: string;
  owner_email: string;
  is_stale: boolean;
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [clones, setClones] = useState<Clone[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [showAskForm, setShowAskForm] = useState(false);
  const [targetCloneId, setTargetCloneId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [questionsRes, clonesRes] = await Promise.all([
        fetch('/api/questions'),
        fetch('/api/clones')
      ]);

      if (questionsRes.ok) {
        const data = await questionsRes.json();
        setQuestions(data.questions || []);
      }

      if (clonesRes.ok) {
        const data = await clonesRes.json();
        setClones(data.clones || []);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to load data');
      setLoading(false);
    }
  }

  async function handleAskQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setAsking(true);

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_clone_id: targetCloneId, question_text: questionText })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to ask question');
        setAsking(false);
        return;
      }

      setSuccess('Question asked successfully');
      setQuestionText('');
      setShowAskForm(false);
      await loadData();
      setAsking(false);
    } catch (err) {
      setError('Failed to ask question');
      setAsking(false);
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

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {!showAskForm ? (
          <div className="mb-6">
            <button
              onClick={() => setShowAskForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition"
            >
              Ask a Question
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Ask a Question</h2>
            <form onSubmit={handleAskQuestion} className="space-y-4">
              <div>
                <label htmlFor="clone" className="block text-sm font-medium text-gray-700 mb-2">
                  Who do you want to ask?
                </label>
                <select
                  id="clone"
                  value={targetCloneId}
                  onChange={(e) => setTargetCloneId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a clone...</option>
                  {clones.map(clone => (
                    <option key={clone.id} value={clone.id}>
                      {clone.display_name} (@{clone.handle}) - {clone.owner_email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
                  Your Question
                </label>
                <textarea
                  id="question"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="What's blocking you on the API integration?"
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-4">
                <button
                  type="submit"
                  disabled={asking}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-md transition"
                >
                  {asking ? 'Sending...' : 'Ask Question'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAskForm(false);
                    setQuestionText('');
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

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
