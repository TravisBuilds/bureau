/**
 * Bureau - "No Idea Yet" Flow (Stub)
 * For founders who haven't started yet
 * 
 * Future: Extract passions, suggest business ideas
 */

export default function NoIdeaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Bureau</h1>
              <p className="text-sm text-slate-600 mt-1">
                Decision intelligence for solo founders
              </p>
            </div>
            <a
              href="/"
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              ← Back to Home
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <div className="text-6xl mb-6">💡</div>
          <h2 className="text-4xl font-bold text-slate-900 mb-4">
            No Business Idea Yet?
          </h2>
          <p className="text-xl text-slate-600">
            Bureau helps founders evaluate existing businesses.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-8">
          <h3 className="text-2xl font-semibold text-slate-900 mb-4">
            Coming Soon
          </h3>
          <p className="text-slate-600 mb-6">
            Future versions will help founders discover business ideas by:
          </p>
          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-3">
              <span className="text-slate-400">•</span>
              <span>Extracting what you're passionate about</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-slate-400">•</span>
              <span>Suggesting AI-enhanced business ideas</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-slate-400">•</span>
              <span>Modeling potential unit economics</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-slate-400">•</span>
              <span>Providing agent-driven market research</span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="font-semibold text-blue-900 mb-2">For Now</h4>
          <p className="text-blue-800 mb-4">
            Explore the example businesses to see how Bureau evaluates real businesses:
          </p>
          <div className="flex gap-3">
            <a
              href="/"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              View Examples
            </a>
            <a
              href="/api/evaluate"
              className="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
            >
              API Documentation
            </a>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-slate-500">
        Bureau v1.0 • Built for solo founders running AI agent businesses
      </footer>
    </div>
  );
}
