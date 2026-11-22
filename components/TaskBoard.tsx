'use client';

import { useState, useEffect } from 'react';
import { AgentTask } from '@/lib/agent-provider-interface';

interface Props {
  projectName: string;
}

export default function TaskBoard({ projectName }: Props) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTasks();
    // Poll for task updates every 2 seconds
    const interval = setInterval(loadTasks, 2000);
    return () => clearInterval(interval);
  }, [projectName]);

  const loadTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?projectName=${encodeURIComponent(projectName)}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  const handleFounderAction = async (taskId: string, action: 'approved' | 'rejected') => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, founderAction: action }),
      });
      
      if (res.ok) {
        await loadTasks();
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    } finally {
      setLoading(false);
    }
  };

  const tasksByStatus = {
    queued: tasks.filter(t => t.status === 'queued'),
    running: tasks.filter(t => t.status === 'running'),
    'needs-founder': tasks.filter(t => t.status === 'needs-founder'),
    completed: tasks.filter(t => t.status === 'completed'),
    failed: tasks.filter(t => t.status === 'failed'),
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Task Board ({tasks.length} total)
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Queued */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Queued ({tasksByStatus.queued.length})
          </h3>
          <div className="space-y-2">
            {tasksByStatus.queued.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Running */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Running ({tasksByStatus.running.length})
          </h3>
          <div className="space-y-2">
            {tasksByStatus.running.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Needs Founder */}
        <div>
          <h3 className="text-sm font-semibold text-orange-700 mb-2">
            Needs You ({tasksByStatus['needs-founder'].length})
          </h3>
          <div className="space-y-2">
            {tasksByStatus['needs-founder'].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onApprove={() => handleFounderAction(task.id, 'approved')}
                onReject={() => handleFounderAction(task.id, 'rejected')}
                loading={loading}
              />
            ))}
          </div>
        </div>

        {/* Completed */}
        <div>
          <h3 className="text-sm font-semibold text-green-700 mb-2">
            Done ({tasksByStatus.completed.length})
          </h3>
          <div className="space-y-2">
            {tasksByStatus.completed.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Failed */}
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">
            Failed ({tasksByStatus.failed.length})
          </h3>
          <div className="space-y-2">
            {tasksByStatus.failed.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onApprove,
  onReject,
  loading,
}: {
  task: AgentTask;
  onApprove?: () => void;
  onReject?: () => void;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded p-3 text-xs ${
        task.status === 'queued' ? 'border-slate-200 bg-slate-50' :
        task.status === 'running' ? 'border-blue-200 bg-blue-50' :
        task.status === 'needs-founder' ? 'border-orange-200 bg-orange-50' :
        task.status === 'completed' ? 'border-green-200 bg-green-50' :
        'border-red-200 bg-red-50'
      }`}
    >
      <div
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <p className="font-semibold text-slate-900 mb-1 line-clamp-2">
          {task.brief}
        </p>
        <p className="text-slate-500 text-[10px]">
          {new Date(task.createdAt).toLocaleTimeString()}
        </p>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-slate-700 mb-2">{task.brief}</p>
          
          {task.result && (
            <div className="mb-2">
              <p className="font-semibold text-slate-700 mb-1">Result:</p>
              <p className="text-slate-600 text-[10px] whitespace-pre-wrap">
                {task.result.substring(0, 200)}...
              </p>
            </div>
          )}

          {task.error && (
            <div className="mb-2">
              <p className="font-semibold text-red-700 mb-1">Error:</p>
              <p className="text-red-600 text-[10px]">{task.error}</p>
            </div>
          )}

          {task.status === 'needs-founder' && onApprove && onReject && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onApprove}
                disabled={loading}
                className="flex-1 py-1 bg-green-600 text-white rounded text-[10px] hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                disabled={loading}
                className="flex-1 py-1 bg-red-600 text-white rounded text-[10px] hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )}

          {task.founderAction && (
            <div className={`mt-2 p-2 rounded text-[10px] ${
              task.founderAction === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              Founder {task.founderAction}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
