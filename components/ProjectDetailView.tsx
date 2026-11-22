import { useState } from 'react';
import { ProjectStatus } from '@/lib/agent-report-types';
import { AgentConnection } from '@/lib/agent-connection-types';
import { plumListConnections, grokBotTakeExample, chatGPTTakeExample } from '@/lib/agent-takes-seed';
import { compareAgentTakes } from '@/lib/take-comparison';
import { plumListAgentReport } from '@/lib/agent-reports-seed';
import DecisionCardWithTakes from './DecisionCardWithTakes';
import AgentChatPanel from './AgentChatPanel';

interface Props {
  project: ProjectStatus;
  onBack: () => void;
}

export default function ProjectDetailView({ project, onBack }: Props) {
  const [selectedConnection, setSelectedConnection] = useState<AgentConnection | null>(null);
  
  // For prototype, use example connections and takes for Plum List
  const connections = project.projectName === 'Plum List' ? plumListConnections : [];
  const exampleTakes = [grokBotTakeExample, chatGPTTakeExample];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{project.projectName}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {project.verdict}
              </p>
            </div>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors text-sm font-medium"
            >
              ← Back to Portfolio
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Agent Connections */}
        {connections.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Connected Agents ({connections.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="border border-slate-200 rounded-lg p-3 flex items-center justify-between hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        {conn.displayName}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        conn.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {conn.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {conn.provider} • Last: {conn.lastActivity ? new Date(conn.lastActivity).toLocaleTimeString() : 'Never'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedConnection(conn)}
                    className="px-3 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800"
                  >
                    Chat
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Founder Signal */}
        {project.founderSignal && (
          <div className={`rounded-lg p-6 border-2 ${
            project.founderSignal === 'keep' ? 'bg-blue-50 border-blue-200' :
            project.founderSignal === 'push' ? 'bg-green-50 border-green-200' :
            project.founderSignal === 'pause' ? 'bg-yellow-50 border-yellow-200' :
            'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-2xl font-bold ${
                project.founderSignal === 'keep' ? 'text-blue-900' :
                project.founderSignal === 'push' ? 'text-green-900' :
                project.founderSignal === 'pause' ? 'text-yellow-900' :
                'text-red-900'
              }`}>
                {project.founderSignal.toUpperCase()}
              </span>
            </div>
            <p className={`text-sm ${
              project.founderSignal === 'keep' ? 'text-blue-800' :
              project.founderSignal === 'push' ? 'text-green-800' :
              project.founderSignal === 'pause' ? 'text-yellow-800' :
              'text-red-800'
            }`}>
              {project.signalReasoning}
            </p>
          </div>
        )}

        {/* Next Actions with Agent Takes */}
        {project.nextActions && project.nextActions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              What to Do Next (with Agent Takes)
            </h2>
            <div className="space-y-6">
              {project.nextActions.map((action, i) => {
                // For the first action on Plum List, show example takes
                const showExampleTakes = i === 0 && project.projectName === 'Plum List';
                const decisionWithTakes = showExampleTakes
                  ? compareAgentTakes(action, exampleTakes)
                  : compareAgentTakes(action, []);
                
                return (
                  <div key={i}>
                    {showExampleTakes && (
                      <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                        <strong>💡 Example:</strong> Below shows how Grok Bot and ChatGPT's takes would appear side-by-side. These are example takes for demonstration.
                      </div>
                    )}
                    <DecisionCardWithTakes
                      decisionWithTakes={decisionWithTakes}
                      projectReport={project.projectName === 'Plum List' ? plumListAgentReport : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Connection Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-600">Status:</span>
              <span className="ml-2 text-green-700 font-semibold">Connected</span>
            </div>
            {project.lastReportDate && (
              <div className="text-slate-500">
                Last report: {new Date(project.lastReportDate).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Agent Chat Panel */}
      {selectedConnection && (
        <AgentChatPanel
          connection={selectedConnection}
          onClose={() => setSelectedConnection(null)}
        />
      )}
    </div>
  );
}
