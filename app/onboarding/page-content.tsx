'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Key, Zap, ArrowRight, CheckCircle2, Copy, ExternalLink } from 'lucide-react';

interface OnboardingContentProps {
  userEmail: string;
}

export default function OnboardingContent({ userEmail }: OnboardingContentProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState('');
  const [firstStream, setFirstStream] = useState('');
  const [ingestToken, setIngestToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Set default workspace name from email
  useEffect(() => {
    if (userEmail && !workspaceName) {
      setWorkspaceName(`${userEmail.split('@')[0]}'s Workspace`);
    }
  }, [userEmail, workspaceName]);

  const handleCreateToken = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'First Agent Token',
          stream_id: firstStream || 'default-stream',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create token');
      }

      const data = await response.json();
      setIngestToken(data.token);
      setStep(3);
    } catch (error) {
      console.error('Error creating token:', error);
      alert('Failed to create token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const connectSnippet = `# Install Bureau client
npm install @bureau/client

# In your agent code:
import { Bureau } from '@bureau/client';

const bureau = new Bureau('${ingestToken}');

// Log inputs, outputs, costs
await bureau.log({
  input: 'User question',
  output: 'Agent response',
  model: 'gpt-4o',
  cost: 0.0032
});`;

  const copyToClipboard = (text: string, type: 'token' | 'snippet') => {
    navigator.clipboard.writeText(text);
    if (type === 'token') {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } else {
      setSnippetCopied(true);
      setTimeout(() => setSnippetCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Building2 className="w-16 h-16 text-highstreet-purple mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to Bureau</h1>
          <p className="text-slate-600">Let's get your first AI agent connected</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className={`flex items-center ${step >= 1 ? 'text-highstreet-purple' : 'text-slate-300'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${step >= 1 ? 'border-highstreet-purple bg-highstreet-purple text-white' : 'border-slate-300'}`}>
              {step > 1 ? <CheckCircle2 className="w-5 h-5" /> : '1'}
            </div>
            <span className="ml-2 text-sm font-medium">Setup</span>
          </div>
          
          <div className={`w-16 h-0.5 mx-4 ${step >= 2 ? 'bg-highstreet-purple' : 'bg-slate-300'}`} />
          
          <div className={`flex items-center ${step >= 2 ? 'text-highstreet-purple' : 'text-slate-300'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${step >= 2 ? 'border-highstreet-purple bg-highstreet-purple text-white' : 'border-slate-300'}`}>
              {step > 2 ? <CheckCircle2 className="w-5 h-5" /> : '2'}
            </div>
            <span className="ml-2 text-sm font-medium">Token</span>
          </div>
          
          <div className={`w-16 h-0.5 mx-4 ${step >= 3 ? 'bg-highstreet-purple' : 'bg-slate-300'}`} />
          
          <div className={`flex items-center ${step >= 3 ? 'text-highstreet-purple' : 'text-slate-300'}`}>
            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${step >= 3 ? 'border-highstreet-purple bg-highstreet-purple text-white' : 'border-slate-300'}`}>
              {step > 3 ? <CheckCircle2 className="w-5 h-5" /> : '3'}
            </div>
            <span className="ml-2 text-sm font-medium">Connect</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {step === 1 && (
            <>
              <h2 className="text-2xl font-semibold text-slate-900 mb-6">Name Your First Stream</h2>
              <p className="text-slate-600 mb-6">
                A stream represents one AI agent or revenue source. You can add more later.
              </p>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Stream Name
                  </label>
                  <input
                    type="text"
                    value={firstStream}
                    onChange={(e) => setFirstStream(e.target.value)}
                    placeholder="e.g. AI Chatbot, Content Generator, Data Analyzer"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    This helps you organize metrics if you run multiple agents
                  </p>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!firstStream.trim()}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <Key className="w-8 h-8 text-highstreet-purple" />
                <h2 className="text-2xl font-semibold text-slate-900">Create Ingest Token</h2>
              </div>
              <p className="text-slate-600 mb-6">
                This token lets your agent send logs, costs, and metrics to Bureau securely.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-blue-900">
                      <strong>Stream:</strong> {firstStream}
                    </p>
                    <p className="text-sm text-blue-900 mt-1">
                      Token will be scoped to this stream in your workspace
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateToken}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Token'}
                  <Key className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <h2 className="text-2xl font-semibold text-slate-900">Token Created!</h2>
              </div>
              <p className="text-slate-600 mb-6">
                Copy this token and add it to your agent code. Keep it secret!
              </p>

              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Your Ingest Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ingestToken}
                      readOnly
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(ingestToken, 'token')}
                      className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                      title="Copy token"
                    >
                      {tokenCopied ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Example Integration
                  </label>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
                      {connectSnippet}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(connectSnippet, 'snippet')}
                      className="absolute top-2 right-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors flex items-center gap-1"
                    >
                      {snippetCopied ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-900">
                  <strong>⚠️ Save this token now!</strong> You won't be able to see it again. 
                  Store it securely in your environment variables.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/settings/connect-agent')}
                  className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  View Setup Guide
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => router.push('/top-floor')}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple/90 transition-colors"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Help Text */}
        <div className="text-center mt-8">
          <p className="text-sm text-slate-600">
            Need help? Check out the{' '}
            <a href="/settings/connect-agent" className="text-highstreet-purple hover:underline">
              connection guide
            </a>
            {' '}or visit{' '}
            <a href="/top-floor" className="text-highstreet-purple hover:underline">
              your dashboard
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
