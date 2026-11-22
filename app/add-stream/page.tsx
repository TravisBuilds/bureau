'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, FileText, Rocket } from 'lucide-react';
import StreamDataEntry from '@/components/StreamDataEntry';
import PrototypeBanner from '@/components/PrototypeBanner';

type StreamType = 'day-job' | 'contract' | 'project';

export default function AddStreamPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<StreamType | null>(null);

  if (!selectedType) {
    return (
      <div className="min-h-screen bg-white">
        <PrototypeBanner />
        <header className="border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <h1 className="text-2xl font-semibold text-slate-900">Add Income Stream</h1>
            <p className="text-slate-600 mt-2">What type of stream is this?</p>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Day Job Option */}
            <button
              onClick={() => setSelectedType('day-job')}
              className="p-8 border-2 border-slate-200 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Day Job</h3>
              <p className="text-sm text-slate-600">
                Your 9-5, salary or hourly work
              </p>
            </button>
            
            {/* Contract Option */}
            <button
              onClick={() => setSelectedType('contract')}
              className="p-8 border-2 border-slate-200 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Contract Work</h3>
              <p className="text-sm text-slate-600">
                Freelance clients and invoices
              </p>
            </button>
            
            {/* Project Option */}
            <button
              onClick={() => setSelectedType('project')}
              className="p-8 border-2 border-slate-200 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all text-left group"
            >
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                <Rocket className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Project</h3>
              <p className="text-sm text-slate-600">
                Side projects with users and agents
              </p>
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PrototypeBanner />
      <header className="border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <button
            onClick={() => setSelectedType(null)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to type selection
          </button>
        </div>
      </header>

      <main>
        <StreamDataEntry
          streamType={selectedType}
          onConnectAgent={() => {
            // In a real app, this would open the agent connection flow
            alert('Agent connection flow would open here');
          }}
          onManualEntry={(data) => {
            console.log('Manual entry data:', data);
            // In a real app, this would save the data and redirect
            alert('Stream added! (In real app, would save and redirect)');
            router.push('/top-floor');
          }}
        />
      </main>
    </div>
  );
}
