'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ConnectPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<any[]>([]);
  const [pageLoadTime] = useState(Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  // Poll for new connections
  useEffect(() => {
    const checkConnections = async () => {
      try {
        const res = await fetch('/api/connections');
        if (res.ok) {
          const data = await res.json();
          const newConnections = data.filter((c: any) => 
            new Date(c.created_at).getTime() > pageLoadTime
          );
          setConnections(newConnections);
        }
      } catch (err) {
        console.error('Failed to fetch connections:', err);
      }
    };

    // Initial check
    checkConnections();
    
    // Poll every 2 seconds
    const interval = setInterval(checkConnections, 2000);
    return () => clearInterval(interval);
  }, [pageLoadTime]);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const mcpUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/mcp`
    : 'https://bureau-krustbuild.vercel.app/mcp';

  const claudeUrl = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Bureau&connectorUrl=${encodeURIComponent(mcpUrl)}`;
  const chatgptUrl = 'https://chatgpt.com/g/settings/plugins';
  const grokBotMessage = `Add this MCP server: ${mcpUrl}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Connect Your Agent</h1>
          <p className="text-gray-600">
            Choose your assistant and approve the connection. No codes, tokens, or terminals.
          </p>
        </div>

        {/* Success banner */}
        {connections.length > 0 && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-800 font-medium">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Connected ✓ {connections[0].agent_label}
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Claude */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                C
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Claude</h2>
                <p className="text-sm text-gray-600">Free, Pro, Team, Enterprise</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-4">
              Opens the Claude connector dialog prefilled with Bureau.
            </p>
            
            <a
              href={claudeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors text-center"
            >
              Connect Claude
            </a>
            
            <p className="text-xs text-gray-500 mt-3">
              <strong>Steps:</strong> Click Add → Approve on Bureau → Done.<br />
              Not signed in? Sign in to Claude, then press the button again.
            </p>
          </div>

          {/* ChatGPT Plus/Pro */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-green-500 rounded-lg flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                G
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">ChatGPT</h2>
                <p className="text-sm text-gray-600">Plus, Pro, Business, Enterprise</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-4">
              Copy the MCP URL and follow the 3-step guide.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  copyToClipboard(mcpUrl, 'chatgpt');
                  window.open(chatgptUrl, '_blank');
                }}
                className="block w-full px-4 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors text-center"
              >
                {copied === 'chatgpt' ? 'Copied! Opening ChatGPT...' : 'Copy URL & Open ChatGPT'}
              </button>
              
              <div className="bg-gray-50 rounded p-3 text-xs text-gray-700 space-y-2">
                <p><strong>1.</strong> Click + → Add custom MCP server</p>
                <p><strong>2.</strong> Paste the URL → OAuth → Create as plugin → Install</p>
                <p><strong>3.</strong> Approve on Bureau</p>
              </div>
            </div>
          </div>

          {/* Grok Bot */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                X
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Grok Bot</h2>
                <p className="text-sm text-gray-600">Personal or Cursor Team</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-4">
              Copy one sentence and paste it into your bot.
            </p>
            
            <button
              onClick={() => copyToClipboard(grokBotMessage, 'grok')}
              className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-center mb-3"
            >
              {copied === 'grok' ? 'Copied!' : 'Copy Instruction'}
            </button>
            
            {copied === 'grok' && (
              <div className="bg-blue-50 rounded p-3 text-sm text-blue-800">
                Now paste it into Grok Bot, click the connect card, and approve.
              </div>
            )}
          </div>

          {/* Cursor IDE */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-75">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                ⌘
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Cursor IDE</h2>
                <p className="text-sm text-gray-600">Desktop app</p>
              </div>
            </div>
            
            <p className="text-gray-700 mb-4 text-sm">
              Deep link coming soon. For now, use Claude or Grok Bot in Cursor.
            </p>
          </div>

          {/* Script/Device Flow */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-75 md:col-span-2">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                &lt;/&gt;
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900">Scripts & Custom Bots</h2>
                <p className="text-sm text-gray-600">Device flow with verification link</p>
              </div>
            </div>
            
            <p className="text-gray-700 text-sm">
              Your script will print a verification link. Click it to approve.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/top-floor')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}
