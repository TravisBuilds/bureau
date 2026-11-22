'use client';

import { useEffect, useState } from 'react';

interface ReviewData {
  weekEnding: string;
  objective: string;
  constraint: string;
  moves: Array<{
    id: string;
    description: string;
    feasible: boolean;
    reason: string;
  }>;
  chosenMoveId: string | null;
  lastPrediction: {
    prediction: string;
    actual: string;
    status: 'pending' | 'correct' | 'incorrect';
  } | null;
}

export default function WeeklyReviewPage() {
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // DETERMINISTIC RULE-BASED REVIEW
    // No LLM calls - all logic is deterministic
    const generateReview = (): ReviewData => {
      const now = new Date();
      const weekEnding = new Date(now);
      weekEnding.setDate(now.getDate() + (6 - now.getDay())); // Next Saturday
      
      return {
        weekEnding: weekEnding.toLocaleDateString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        objective: 'Increase Ember episode views by 20% within 3 episodes',
        constraint: 'Weekly generation budget: $50 (current burn: $30.93/episode)',
        moves: [
          {
            id: 'move1',
            description: 'Experiment with 90-second format (vs current 60s)',
            feasible: true,
            reason: 'Fits within $50 budget; Ep12 cost $30.93, 90s would be ~$46',
          },
          {
            id: 'move2',
            description: 'Test thumbnail A/B variations using Higgsfield stills',
            feasible: true,
            reason: 'Minimal cost increase ($5-8 for variants); high potential impact',
          },
        ],
        chosenMoveId: null,
        lastPrediction: {
          prediction: 'Ep12 would reach 40+ views within 48 hours',
          actual: 'Ep12 reached 49 views (actual data from seed)',
          status: 'correct',
        },
      };
    };

    setReview(generateReview());
    setLoading(false);
  }, []);

  const handleChooseMove = (moveId: string) => {
    if (!review) return;
    
    setReview({
      ...review,
      chosenMoveId: moveId,
    });
    
    // In a real app, this would POST to an API endpoint
    console.log('Move chosen:', moveId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-gray-600">Loading review...</div>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-red-600">Failed to load review</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Review</h1>
          <p className="text-gray-600 mt-2">Week ending {review.weekEnding}</p>
          <div className="mt-4 inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
            Rule-Based Review (No LLM)
          </div>
        </div>

        {/* Last Prediction Review */}
        {review.lastPrediction && (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Last Week's Prediction</h2>
            
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-700">Prediction:</div>
                <div className="text-gray-900">{review.lastPrediction.prediction}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium text-gray-700">Actual Result:</div>
                <div className="text-gray-900">{review.lastPrediction.actual}</div>
              </div>
              
              <div>
                <div className="text-sm font-medium text-gray-700">Status:</div>
                <div className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                  review.lastPrediction.status === 'correct' 
                    ? 'bg-green-100 text-green-800'
                    : review.lastPrediction.status === 'incorrect'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {review.lastPrediction.status === 'correct' ? '✓ Correct' :
                   review.lastPrediction.status === 'incorrect' ? '✗ Incorrect' :
                   '⏱ Pending'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Current Objective */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Objective</h2>
          <p className="text-gray-900 text-lg">{review.objective}</p>
        </div>

        {/* Constraint */}
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Operating Constraint</h2>
          <p className="text-gray-900">{review.constraint}</p>
        </div>

        {/* Feasible Moves */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Feasible Moves</h2>
          
          <div className="space-y-4">
            {review.moves.map((move) => (
              <div
                key={move.id}
                className={`border rounded-lg p-4 transition-all ${
                  review.chosenMoveId === move.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{move.description}</h3>
                      {move.feasible && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
                          ✓ Feasible
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm">{move.reason}</p>
                  </div>
                  
                  <button
                    onClick={() => handleChooseMove(move.id)}
                    disabled={review.chosenMoveId !== null}
                    className={`ml-4 px-4 py-2 rounded font-medium text-sm transition-colors ${
                      review.chosenMoveId === move.id
                        ? 'bg-blue-600 text-white'
                        : review.chosenMoveId === null
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {review.chosenMoveId === move.id ? 'Chosen ✓' : 'Choose'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Choice Recorded */}
        {review.chosenMoveId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="text-green-600 text-2xl">✓</div>
              <div>
                <h3 className="text-lg font-semibold text-green-900">Move Recorded</h3>
                <p className="text-green-800 mt-1">
                  Your choice has been recorded. Next week's review will assess the outcome.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feature Flag Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <div className="text-blue-600 text-sm">ℹ️</div>
            <div className="text-sm text-blue-900">
              <strong>Development Mode:</strong> This review is generated using deterministic rules.
              LLM-powered insights are disabled by default and require BUREAU_ENABLE_LLM_REVIEW=true.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
