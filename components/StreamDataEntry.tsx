'use client';

import { useState } from 'react';
import { Bot, Edit3 } from 'lucide-react';

export type StreamType = 'day-job' | 'contract' | 'project';

interface Props {
  streamType: StreamType;
  onConnectAgent: () => void;
  onManualEntry: (data: any) => void;
}

export default function StreamDataEntry({ streamType, onConnectAgent, onManualEntry }: Props) {
  const [mode, setMode] = useState<'choice' | 'manual' | 'agent'>('choice');
  
  const getTypeLabel = () => {
    switch (streamType) {
      case 'day-job': return 'Day Job';
      case 'contract': return 'Contract Work';
      case 'project': return 'Project';
    }
  };

  if (mode === 'choice') {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Add {getTypeLabel()}</h2>
        <p className="text-slate-600 mb-8">Choose how you'd like to add this stream</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Connect Agent Option */}
          <button
            onClick={() => setMode('agent')}
            className="p-8 border-2 border-slate-200 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-highstreet-purple bg-opacity-10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-opacity-20 transition-colors">
              <Bot className="w-6 h-6 text-highstreet-purple" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Connect an Agent</h3>
            <p className="text-sm text-slate-600">
              Let your agent populate the data automatically
            </p>
          </button>
          
          {/* Manual Entry Option */}
          <button
            onClick={() => setMode('manual')}
            className="p-8 border-2 border-slate-200 rounded-xl hover:border-highstreet-purple hover:bg-slate-50 transition-all text-left group"
          >
            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-slate-200 transition-colors">
              <Edit3 className="w-6 h-6 text-slate-700" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Enter Manually</h3>
            <p className="text-sm text-slate-600">
              Fill in the details yourself
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'agent') {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <button
          onClick={() => setMode('choice')}
          className="text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          ← Back
        </button>
        
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Connect Agent</h2>
        <p className="text-slate-600 mb-8">
          Connect an agent to automatically populate your {getTypeLabel().toLowerCase()} data
        </p>
        
        <button
          onClick={onConnectAgent}
          className="w-full px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
        >
          Connect Agent
        </button>
      </div>
    );
  }

  // Manual entry forms
  return (
    <div className="max-w-2xl mx-auto py-12">
      <button
        onClick={() => setMode('choice')}
        className="text-sm text-slate-600 hover:text-slate-900 mb-6"
      >
        ← Back
      </button>
      
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Add {getTypeLabel()}</h2>
      <p className="text-slate-600 mb-8">Enter your details below</p>
      
      {streamType === 'day-job' && <DayJobForm onSubmit={onManualEntry} />}
      {streamType === 'contract' && <ContractForm onSubmit={onManualEntry} />}
      {streamType === 'project' && <ProjectForm onSubmit={onManualEntry} />}
    </div>
  );
}

function DayJobForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    employer: '',
    role: '',
    payType: 'salary' as 'salary' | 'hourly',
    annualSalary: '',
    hourlyRate: '',
    hoursPerWeek: '40',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      annualSalary: formData.payType === 'salary' ? Number(formData.annualSalary) : undefined,
      hourlyRate: formData.payType === 'hourly' ? Number(formData.hourlyRate) : undefined,
      hoursPerWeek: Number(formData.hoursPerWeek),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Employer
        </label>
        <input
          type="text"
          required
          value={formData.employer}
          onChange={(e) => setFormData({ ...formData, employer: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Role
        </label>
        <input
          type="text"
          required
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Pay Type
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="salary"
              checked={formData.payType === 'salary'}
              onChange={(e) => setFormData({ ...formData, payType: e.target.value as any })}
              className="mr-2"
            />
            Salary
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="hourly"
              checked={formData.payType === 'hourly'}
              onChange={(e) => setFormData({ ...formData, payType: e.target.value as any })}
              className="mr-2"
            />
            Hourly
          </label>
        </div>
      </div>

      {formData.payType === 'salary' ? (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Annual Salary
          </label>
          <input
            type="number"
            required
            value={formData.annualSalary}
            onChange={(e) => setFormData({ ...formData, annualSalary: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Hourly Rate
          </label>
          <input
            type="number"
            required
            value={formData.hourlyRate}
            onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Hours per Week
        </label>
        <input
          type="number"
          required
          value={formData.hoursPerWeek}
          onChange={(e) => setFormData({ ...formData, hoursPerWeek: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        className="w-full px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
      >
        Add Day Job
      </button>
    </form>
  );
}

function ContractForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    clientName: '',
    hourlyRate: '',
    monthlyHours: '',
    // Invoice fields
    invoiceAmount: '',
    invoiceStatus: 'sent' as 'draft' | 'sent' | 'paid' | 'overdue',
    invoiceDate: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      clients: [{
        name: formData.clientName,
        hourlyRate: Number(formData.hourlyRate),
        isActive: true,
      }],
      monthlyHours: Number(formData.monthlyHours),
      recentInvoices: formData.invoiceAmount ? [{
        id: `INV-${Date.now()}`,
        clientName: formData.clientName,
        amount: Number(formData.invoiceAmount),
        dateIssued: formData.invoiceDate || new Date().toISOString().split('T')[0],
        dateDue: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: formData.invoiceStatus,
      }] : [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Client Name
        </label>
        <input
          type="text"
          required
          value={formData.clientName}
          onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Hourly Rate
        </label>
        <input
          type="number"
          required
          value={formData.hourlyRate}
          onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Typical Monthly Hours
        </label>
        <input
          type="number"
          required
          value={formData.monthlyHours}
          onChange={(e) => setFormData({ ...formData, monthlyHours: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      {/* Recent Invoice (optional) */}
      <div className="pt-4 border-t border-slate-200">
        <h3 className="text-sm font-medium text-slate-900 mb-4">Most Recent Invoice (optional)</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Invoice Amount
            </label>
            <input
              type="number"
              value={formData.invoiceAmount}
              onChange={(e) => setFormData({ ...formData, invoiceAmount: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
              placeholder="Leave blank to skip"
            />
          </div>

          {formData.invoiceAmount && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.invoiceStatus}
                  onChange={(e) => setFormData({ ...formData, invoiceStatus: e.target.value as any })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="w-full px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-highstreet-purple-hover transition-colors font-medium"
      >
        Add Contract
      </button>
    </form>
  );
}

function ProjectForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    monthlyIncome: '',
    monthlyCosts: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      description: formData.description,
      monthlyIncome: Number(formData.monthlyIncome) || 0,
      monthlyCosts: Number(formData.monthlyCosts) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Project Name
        </label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Description
        </label>
        <textarea
          required
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Monthly Income (optional)
        </label>
        <input
          type="number"
          value={formData.monthlyIncome}
          onChange={(e) => setFormData({ ...formData, monthlyIncome: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Monthly Costs (optional)
        </label>
        <input
          type="number"
          value={formData.monthlyCosts}
          onChange={(e) => setFormData({ ...formData, monthlyCosts: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-highstreet-purple focus:border-transparent"
        />
      </div>

      <button
        type="submit"
        className="w-full px-6 py-3 bg-highstreet-purple text-white rounded-lg hover:bg-opacity-90 transition-colors font-medium"
      >
        Add Project
      </button>
    </form>
  );
}
