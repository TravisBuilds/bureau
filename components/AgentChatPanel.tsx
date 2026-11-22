'use client';

import { useState } from 'react';
import { AgentConnection, ChatMessage } from '@/lib/agent-connection-types';

interface Props {
  connection: AgentConnection;
  onClose: () => void;
}

export default function AgentChatPanel({ connection, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      connectionId: connection.id,
      role: 'system',
      content: `Connected to ${connection.displayName}. Use the copy/paste bridge below to relay messages manually.`,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [promptToCopy, setPromptToCopy] = useState('');
  const [replyToPaste, setReplyToPaste] = useState('');

  const handleSendMessage = () => {
    if (!promptToCopy.trim()) return;
    
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      connectionId: connection.id,
      role: 'user',
      content: promptToCopy,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, userMessage]);
    setPromptToCopy('');
  };

  const handlePasteReply = () => {
    if (!replyToPaste.trim()) return;
    
    // Add agent message
    const agentMessage: ChatMessage = {
      id: Date.now().toString(),
      connectionId: connection.id,
      role: 'agent',
      content: replyToPaste,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, agentMessage]);
    setReplyToPaste('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">{connection.displayName}</h3>
            <p className="text-xs text-slate-500">
              {connection.provider} • {connection.status}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.role === 'system'
                    ? 'bg-slate-100 text-slate-700 text-sm'
                    : 'bg-slate-200 text-slate-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Copy/Paste Bridge */}
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
            <strong>📋 Copy/Paste Bridge (Prototype Mode)</strong>
            <p className="mt-1">
              1. Write your prompt below and copy it to {connection.displayName}
              <br />
              2. Paste the agent's reply into the box below
            </p>
            <p className="mt-2 text-blue-600 font-semibold">
              In production, this would be a direct API integration (OpenAI API, Grok Bot).
              See README for adapter plugin interface.
            </p>
          </div>

          {/* Prompt to Copy */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              1. Prompt to copy to {connection.displayName}:
            </label>
            <div className="flex gap-2">
              <textarea
                value={promptToCopy}
                onChange={(e) => setPromptToCopy(e.target.value)}
                placeholder="Type your prompt here..."
                className="flex-1 p-2 border border-slate-300 rounded text-sm"
                rows={2}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(promptToCopy);
                  handleSendMessage();
                  alert('Copied! Paste into ' + connection.displayName);
                }}
                disabled={!promptToCopy.trim()}
                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📋 Copy
              </button>
            </div>
          </div>

          {/* Reply to Paste */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              2. Paste agent's reply here:
            </label>
            <div className="flex gap-2">
              <textarea
                value={replyToPaste}
                onChange={(e) => setReplyToPaste(e.target.value)}
                placeholder="Paste the agent's reply..."
                className="flex-1 p-2 border border-slate-300 rounded text-sm"
                rows={2}
              />
              <button
                onClick={handlePasteReply}
                disabled={!replyToPaste.trim()}
                className="px-3 py-1 bg-slate-900 text-white text-xs rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
