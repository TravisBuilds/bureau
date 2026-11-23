'use client';

import { useState } from 'react';
import { Building2, Plus, Calendar, TrendingUp, CheckCircle2, XCircle, HelpCircle, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow, format } from 'date-fns';

interface Decision {
  id: string;
  stream_id: string | null;
  title: string;
  action: string;
  metric_name: string;
  baseline_value: number | null;
  baseline_unit: string | null;
  created_at: string;
  review_date: string;
  reviewed_at: string | null;
  outcome_value: number | null;
  outcome_notes: string | null;
  verdict: 'pending' | 'worked' | 'didnt-work' | 'inconclusive';
  stream_name: string | null;
  stream_category: string | null;
}

interface Stream {
  id: string;
  name: string;
  category: string;
}

interface DecisionsPageContentProps {
  decisions: Decision[];
  streams: Stream[];
}

export default function DecisionsPageContent({ decisions, streams }: DecisionsPageContentProps) {
  const router = useRouter();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<Decision | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pendingDecisions = decisions.filter(d => d.verdict === 'pending');
  const reviewedDecisions = decisions.filter(d => d.verdict !== 'pending');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDecisions = pendingDecisions.filter(d => new Date(d.review_date) <= today);

  const handleCreateDecision = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get('title'),
      action: formData.get('action'),
      metric_name: formData.get('metric_name'),
      baseline_value: formData.get('baseline_value') ? parseFloat(formData.get('baseline_value') as string) : null,
      baseline_unit: formData.get('baseline_unit') || null,
      review_date: formData.get('review_date'),
      stream_id: formData.get('stream_id') || null
    };

    try {
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        setShowCreateForm(false);
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create decision');
      }
    } catch (error) {
      alert('Failed to create decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordOutcome = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDecision) return;

    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      outcome_value: formData.get('outcome_value') ? parseFloat(formData.get('outcome_value') as string) : null,
      outcome_notes: formData.get('outcome_notes'),
      verdict: formData.get('verdict')
    };

    try {
      const response = await fetch(`/api/decisions/${selectedDecision.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        setSelectedDecision(null);
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to record outcome');
      }
    } catch (error) {
      alert('Failed to record outcome');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'worked': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'didnt-work': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'inconclusive': return <HelpCircle className="w-5 h-5 text-slate-500" />;
      default: return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getVerdictLabel = (verdict: string) => {
    switch (verdict) {
      case 'worked': return 'Worked';
      case 'didnt-work': return "Didn't Work";
      case 'inconclusive': return 'Inconclusive';
      default: return 'Pending';
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-highstreet-purple" />
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Decision Records</h1>
                <p className="text-sm text-slate-500">Track decisions and follow through on outcomes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/top-floor')}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-highstreet-purple/90"
              >
                <Plus className="w-4 h-4" />
                New Decision
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="p-4 bg-white border border-slate-200 rounded-lg">
            <div className="text-sm text-slate-500 mb-1">Due for Review</div>
            <div className="text-2xl font-semibold text-slate-900">{dueDecisions.length}</div>
            <div className="text-xs text-slate-400 mt-1">needs your attention</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg">
            <div className="text-sm text-slate-500 mb-1">Pending</div>
            <div className="text-2xl font-semibold text-slate-900">{pendingDecisions.length}</div>
            <div className="text-xs text-slate-400 mt-1">awaiting review date</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg">
            <div className="text-sm text-slate-500 mb-1">Reviewed</div>
            <div className="text-2xl font-semibold text-slate-900">{reviewedDecisions.length}</div>
            <div className="text-xs text-slate-400 mt-1">outcomes recorded</div>
          </div>
        </div>

        {/* Due for Review Section */}
        {dueDecisions.length > 0 && (
          <div className="mb-12">
            <h2 className="text-lg font-medium text-slate-900 mb-6">Due for Review</h2>
            <div className="space-y-3">
              {dueDecisions.map((decision) => (
                <div
                  key={decision.id}
                  className="p-6 bg-amber-50 border border-amber-200 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">{decision.title}</h3>
                      {decision.stream_name && (
                        <span className="text-sm text-slate-500">{decision.stream_name}</span>
                      )}
                    </div>
                    <span className="px-3 py-1 text-sm font-medium bg-amber-100 text-amber-800 rounded-full">
                      Due {format(new Date(decision.review_date), 'MMM d')}
                    </span>
                  </div>
                  <div className="mb-4">
                    <div className="text-sm text-slate-700 mb-2">
                      <span className="font-medium">Action:</span> {decision.action}
                    </div>
                    <div className="text-sm text-slate-700">
                      <span className="font-medium">Tracking:</span> {decision.metric_name}
                      {decision.baseline_value !== null && (
                        <span className="ml-2">
                          (baseline: {decision.baseline_value}{decision.baseline_unit ? ` ${decision.baseline_unit}` : ''})
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDecision(decision)}
                    className="px-4 py-2 text-sm font-medium text-highstreet-purple border border-highstreet-purple rounded-lg hover:bg-highstreet-purple/5"
                  >
                    Record Outcome
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Decisions */}
        {pendingDecisions.filter(d => new Date(d.review_date) > today).length > 0 && (
          <div className="mb-12">
            <h2 className="text-lg font-medium text-slate-900 mb-6">Upcoming Reviews</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingDecisions.filter(d => new Date(d.review_date) > today).map((decision) => (
                <DecisionCard key={decision.id} decision={decision} />
              ))}
            </div>
          </div>
        )}

        {/* Reviewed Decisions */}
        {reviewedDecisions.length > 0 && (
          <div>
            <h2 className="text-lg font-medium text-slate-900 mb-6">History</h2>
            <div className="space-y-3">
              {reviewedDecisions.map((decision) => (
                <div
                  key={decision.id}
                  className="p-6 bg-white border border-slate-200 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      {getVerdictIcon(decision.verdict)}
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">{decision.title}</h3>
                        {decision.stream_name && (
                          <span className="text-sm text-slate-500">{decision.stream_name}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                      decision.verdict === 'worked' ? 'bg-green-100 text-green-800' :
                      decision.verdict === 'didnt-work' ? 'bg-red-100 text-red-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {getVerdictLabel(decision.verdict)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Metric</div>
                      <div className="text-sm text-slate-900">{decision.metric_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Outcome</div>
                      <div className="text-sm text-slate-900">
                        {decision.baseline_value !== null && decision.outcome_value !== null ? (
                          <>
                            {decision.baseline_value}{decision.baseline_unit || ''} → {decision.outcome_value}{decision.baseline_unit || ''}
                          </>
                        ) : decision.outcome_value !== null ? (
                          <>{decision.outcome_value}{decision.baseline_unit || ''}</>
                        ) : (
                          <span className="text-slate-400">Not recorded</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {decision.outcome_notes && (
                    <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded">
                      {decision.outcome_notes}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-slate-400">
                    Reviewed {decision.reviewed_at ? formatDistanceToNow(new Date(decision.reviewed_at), { addSuffix: true }) : 'recently'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {decisions.length === 0 && (
          <div className="text-center py-16">
            <TrendingUp className="w-16 h-16 mx-auto mb-6 text-slate-300" />
            <h2 className="text-2xl font-semibold text-slate-900 mb-3">No decisions yet</h2>
            <p className="text-slate-600 mb-8 max-w-md mx-auto">
              Start tracking your business decisions and their outcomes to learn what works.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple/90"
            >
              <Plus className="w-5 h-5" />
              Record Your First Decision
            </button>
          </div>
        )}
      </main>

      {/* Create Decision Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Record a Decision</h2>
            <form onSubmit={handleCreateDecision}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Decision Title *
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="e.g., Switch from daily to weekly YouTube Shorts"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    What You Did (Action) *
                  </label>
                  <textarea
                    name="action"
                    required
                    rows={3}
                    placeholder="Describe the specific action you took..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Stream (Optional)
                  </label>
                  <select
                    name="stream_id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  >
                    <option value="">No stream</option>
                    {streams.map((stream) => (
                      <option key={stream.id} value={stream.id}>
                        {stream.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Metric to Track *
                  </label>
                  <input
                    type="text"
                    name="metric_name"
                    required
                    placeholder="e.g., views_per_video, cost_per_view, subscriber_conversion"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Baseline Value
                    </label>
                    <input
                      type="number"
                      step="any"
                      name="baseline_value"
                      placeholder="e.g., 1250"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Unit
                    </label>
                    <input
                      type="text"
                      name="baseline_unit"
                      placeholder="e.g., views, $, %"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Review Date *
                  </label>
                  <input
                    type="date"
                    name="review_date"
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                  <p className="text-xs text-slate-500 mt-1">When should you check the results?</p>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-highstreet-purple/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Record Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Outcome Modal */}
      {selectedDecision && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">{selectedDecision.title}</h2>
            <p className="text-sm text-slate-500 mb-6">
              Decision made {formatDistanceToNow(new Date(selectedDecision.created_at), { addSuffix: true })}
            </p>
            
            <form onSubmit={handleRecordOutcome}>
              <div className="space-y-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-700 mb-2">
                    <span className="font-medium">Action taken:</span> {selectedDecision.action}
                  </div>
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">Tracking:</span> {selectedDecision.metric_name}
                    {selectedDecision.baseline_value !== null && (
                      <span className="ml-2">
                        (baseline: {selectedDecision.baseline_value}{selectedDecision.baseline_unit || ''})
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Current Value
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="outcome_value"
                    placeholder="What's the metric at now?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Verdict *
                  </label>
                  <select
                    name="verdict"
                    required
                    defaultValue=""
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  >
                    <option value="" disabled>Select outcome...</option>
                    <option value="worked">Worked</option>
                    <option value="didnt-work">Didn't Work</option>
                    <option value="inconclusive">Inconclusive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    name="outcome_notes"
                    rows={4}
                    placeholder="What did you learn? What would you do differently?"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-highstreet-purple"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDecision(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-highstreet-purple/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Outcome'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const reviewDate = new Date(decision.review_date);
  const isUpcoming = reviewDate > new Date();

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">{decision.title}</h3>
          {decision.stream_name && (
            <span className="text-sm text-slate-500">{decision.stream_name}</span>
          )}
        </div>
      </div>
      <div className="mb-4">
        <div className="text-sm text-slate-700 mb-1">
          <span className="font-medium">Tracking:</span> {decision.metric_name}
        </div>
        {decision.baseline_value !== null && (
          <div className="text-sm text-slate-600">
            Baseline: {decision.baseline_value}{decision.baseline_unit || ''}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Calendar className="w-4 h-4" />
        Review {format(reviewDate, 'MMM d, yyyy')}
        <span className="text-slate-400">
          ({formatDistanceToNow(reviewDate, { addSuffix: true })})
        </span>
      </div>
    </div>
  );
}
