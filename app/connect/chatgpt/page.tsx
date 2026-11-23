'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ConnectChatGPTPage() {
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const [connected, setConnected] = useState(false);
  
  const mcpServerUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau.build';
  const mcpUrl = `${mcpServerUrl}/mcp`;
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const startPolling = () => {
    setPolling(true);
    // In a real implementation, poll /api/connections for new ChatGPT connections
    // For spike: just show the UI
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Connect ChatGPT</h1>
        <p className="text-gray-600 mb-8">
          Add Bureau as a custom MCP server in ChatGPT
        </p>
        
        {!connected && !polling && (
          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-semibold mb-4">Instructions</h2>
            
            <ol className="space-y-6 mb-8">
              <li className="flex">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">1</span>
                <div className="flex-1">
                  <p className="font-semibold mb-2">Copy the Bureau MCP Server URL</p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm">
                      {mcpUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(mcpUrl)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition"
                    >
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>
              
              <li className="flex">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">2</span>
                <div className="flex-1">
                  <p className="font-semibold mb-2">Open ChatGPT Settings</p>
                  <p className="text-sm text-gray-600">
                    Go to ChatGPT → Settings → Beta Features → Custom MCP Servers
                  </p>
                </div>
              </li>
              
              <li className="flex">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">3</span>
                <div className="flex-1">
                  <p className="font-semibold mb-2">Add Bureau as a Custom Server</p>
                  <p className="text-sm text-gray-600 mb-2">
                    Click "Add Custom Server" and paste the URL above. ChatGPT will redirect you to Bureau for authorization.
                  </p>
                </div>
              </li>
              
              <li className="flex">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mr-4">4</span>
                <div className="flex-1">
                  <p className="font-semibold mb-2">Authorize on Bureau</p>
                  <p className="text-sm text-gray-600">
                    Choose which agent and streams to authorize. Click "Authorize" to complete the connection.
                  </p>
                </div>
              </li>
            </ol>
            
            <button
              onClick={startPolling}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md transition"
            >
              I've started the connection in ChatGPT →
            </button>
          </div>
        )}
        
        {polling && !connected && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-2xl font-semibold mb-2">Waiting for connection...</h2>
            <p className="text-gray-600 mb-6">
              Complete the authorization in ChatGPT. This page will update automatically when connected.
            </p>
            <p className="text-sm text-gray-500">
              Still setting up? <button onClick={() => setPolling(false)} className="text-blue-600 hover:underline">Go back to instructions</button>
            </p>
          </div>
        )}
        
        {connected && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2">Connected!</h2>
            <p className="text-gray-600 mb-6">
              ChatGPT is now connected to Bureau. You can use Bureau tools in your conversations.
            </p>
            <Link
              href="/connections"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition"
            >
              View Connections
            </Link>
          </div>
        )}
        
        <div className="mt-6">
          <Link href="/connect" className="text-blue-600 hover:underline">
            ← Back to connection options
          </Link>
        </div>
      </div>
    </div>
  );
}
