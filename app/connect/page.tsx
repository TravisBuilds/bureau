'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ConnectPage() {
  const [copiedUrl, setCopiedUrl] = useState(false);
  
  const mcpServerUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
  const mcpUrl = `${mcpServerUrl}/mcp`;
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Connect an Agent</h1>
        <p className="text-gray-600 mb-8">
          Connect ChatGPT, Grok Bot, Cursor, or any MCP client to Bureau
        </p>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* ChatGPT */}
          <div className="bg-white rounded-lg shadow-md p-6 border-2 border-transparent hover:border-blue-500 transition">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold mr-4">
                C
              </div>
              <div>
                <h2 className="text-xl font-bold">ChatGPT</h2>
                <p className="text-sm text-gray-500">Custom MCP Server</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Connect ChatGPT Business/Enterprise/Edu to report costs and metrics into Bureau streams.
            </p>
            <Link 
              href="/connect/chatgpt"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition"
            >
              Connect ChatGPT →
            </Link>
          </div>
          
          {/* Grok Bot */}
          <div className="bg-white rounded-lg shadow-md p-6 border-2 border-transparent hover:border-purple-500 transition">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold mr-4">
                G
              </div>
              <div>
                <h2 className="text-xl font-bold">Grok Bot</h2>
                <p className="text-sm text-gray-500">Custom MCP Connector</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Add Bureau as a custom connector in Grok Bot to track agent costs and outputs.
            </p>
            <Link 
              href="/connect/grokbot"
              className="block w-full text-center bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md transition"
            >
              Connect Grok Bot →
            </Link>
          </div>
          
          {/* Cursor */}
          <div className="bg-white rounded-lg shadow-md p-6 border-2 border-transparent hover:border-indigo-500 transition">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold mr-4">
                ▶
              </div>
              <div>
                <h2 className="text-xl font-bold">Cursor</h2>
                <p className="text-sm text-gray-500">Cloud Agent MCP</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Connect Cursor Cloud Agents to Bureau for cost tracking and stream management.
            </p>
            <Link 
              href="/connect/cursor"
              className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition"
            >
              Connect Cursor →
            </Link>
          </div>
          
          {/* Other MCP Client */}
          <div className="bg-white rounded-lg shadow-md p-6 border-2 border-transparent hover:border-gray-500 transition">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold mr-4">
                ⚡
              </div>
              <div>
                <h2 className="text-xl font-bold">Other MCP Client</h2>
                <p className="text-sm text-gray-500">Any MCP-compatible app</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Use Bureau with any MCP client that supports OAuth 2.1 with PKCE.
            </p>
            <button 
              onClick={() => copyToClipboard(mcpUrl)}
              className="w-full text-center bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition"
            >
              {copiedUrl ? '✓ Copied!' : 'Copy MCP URL'}
            </button>
          </div>
        </div>
        
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">🔗 Bureau MCP Server URL</h3>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-white px-3 py-2 rounded border border-gray-300 text-sm">
              {mcpUrl}
            </code>
            <button
              onClick={() => copyToClipboard(mcpUrl)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition"
            >
              {copiedUrl ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
        
        <div className="mt-6">
          <Link 
            href="/connections" 
            className="text-blue-600 hover:underline"
          >
            ← View existing connections
          </Link>
        </div>
      </div>
    </div>
  );
}
