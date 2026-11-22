import { ProjectStatus, FounderTimeBudget } from '@/lib/agent-report-types';

interface Props {
  projects: ProjectStatus[];
  founderBudget: FounderTimeBudget;
  timeAsks: { totalMinutesAsked: number; byProject: { projectName: string; minutes: number }[] };
  onConnectAgent: () => void;
  onSelectProject: (name: string) => void;
  onUpdateBudget: (budget: FounderTimeBudget) => void;
}

export default function PortfolioHome({
  projects,
  founderBudget,
  timeAsks,
  onConnectAgent,
  onSelectProject,
  onUpdateBudget,
}: Props) {
  const connectedProjects = projects.filter(p => p.connected);
  const nextActions = connectedProjects
    .flatMap(p => (p.nextActions || []).map(a => ({ ...a, projectName: p.projectName })))
    .sort((a, b) => a.priority - b.priority);

  const totalHoursAsked = Math.ceil(timeAsks.totalMinutesAsked / 60);
  const weeklyBudget = founderBudget.weeklyHours || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Bureau</h1>
              <p className="text-sm text-slate-600 mt-1">
                Your portfolio command center
              </p>
            </div>
            <button
              onClick={onConnectAgent}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              + Connect Agent
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Founder Time Budget */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              ⏱️ Founder Time This Week
            </h2>
            {!weeklyBudget && (
              <button
                onClick={() => {
                  const hours = prompt('Weekly hours available for side projects?');
                  if (hours) {
                    onUpdateBudget({ weeklyHours: Number(hours) });
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Set budget
              </button>
            )}
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-slate-900">{totalHoursAsked}h</span>
            <span className="text-lg text-slate-600">asked</span>
            {weeklyBudget > 0 && (
              <>
                <span className="text-slate-400">/</span>
                <span className="text-lg text-slate-600">{weeklyBudget}h budgeted</span>
                {totalHoursAsked > weeklyBudget && (
                  <span className="text-sm text-red-600 font-semibold">⚠️ Over budget</span>
                )}
              </>
            )}
          </div>
          
          {timeAsks.byProject.length > 0 && (
            <div className="mt-4 space-y-2">
              {timeAsks.byProject
                .filter(p => p.minutes > 0)
                .sort((a, b) => b.minutes - a.minutes)
                .map(p => (
                  <div key={p.projectName} className="flex justify-between text-sm">
                    <span className="text-slate-600">{p.projectName}</span>
                    <span className="font-semibold text-slate-900">{p.minutes}min</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* What to Do Next - Ranked Across All Projects */}
        {nextActions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              🎯 What to Do Next
            </h2>
            <div className="space-y-4">
              {nextActions.map((action, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl font-bold text-slate-400">#{i + 1}</span>
                      <div>
                        <h3 className="font-semibold text-slate-900">{action.title}</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          {action.projectName}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-blue-600">
                      {action.founderTimeMinutes}min
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-3">{action.reasoning}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>💰 Cost of waiting: {action.costOfWaiting}</span>
                    {action.blockedMetric && (
                      <span className="text-orange-600 font-semibold">
                        🚧 Blocks: {action.blockedMetric}
                      </span>
                    )}
                  </div>
                  
                  <details className="mt-3">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                      Agent task brief
                    </summary>
                    <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200">
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap">
                        {action.agentTaskBrief}
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(action.agentTaskBrief);
                          alert('Copied to clipboard!');
                        }}
                        className="mt-2 px-3 py-1 bg-slate-900 text-white text-xs rounded hover:bg-slate-800"
                      >
                        📋 Copy to agent
                      </button>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects Grid */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.projectName}
                className={`bg-white rounded-lg shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow ${
                  project.connected ? 'cursor-pointer' : ''
                }`}
                onClick={() => project.connected && onSelectProject(project.projectName)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">{project.projectName}</h3>
                  {project.connected ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Connected
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConnectAgent();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Connect
                    </button>
                  )}
                </div>
                
                {project.connected ? (
                  <>
                    <p className="text-sm text-slate-600 mb-3">{project.verdict}</p>
                    
                    {project.founderSignal && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          project.founderSignal === 'keep' ? 'bg-blue-100 text-blue-800' :
                          project.founderSignal === 'push' ? 'bg-green-100 text-green-800' :
                          project.founderSignal === 'pause' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {project.founderSignal.toUpperCase()}
                        </span>
                      </div>
                    )}
                    
                    {project.lastReportDate && (
                      <p className="text-xs text-slate-400">
                        Last report: {new Date(project.lastReportDate).toLocaleDateString()}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400 italic">Not connected</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-slate-500">
        Bureau v2.0 • Command center for founders with day jobs
      </footer>
    </div>
  );
}
