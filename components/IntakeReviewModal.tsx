'use client';

import { IntakeResponse, DayJobIntake, ContractIntake, ProjectIntake } from '@/lib/intake-types';
import { X, AlertTriangle } from 'lucide-react';

interface Props {
  intake: IntakeResponse | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

export default function IntakeReviewModal({ intake, onApprove, onReject, onClose }: Props) {
  if (!intake) return null;

  const isSample = intake.dataSource.includes('SAMPLE');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Review Data from Agent</h2>
            <p className="text-sm text-slate-500 mt-1">
              from {intake.dataSource} • {new Date(intake.asOf).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* SAMPLE Warning */}
        {isSample && (
          <div className="mx-6 mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900 text-sm">This is SAMPLE data for demonstration</p>
              <p className="text-sm text-amber-700 mt-1">
                It will not count toward your real totals. This is just to show how agent-populated data works.
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {intake.streamType === 'day-job' && (
            <DayJobReview data={intake.data as DayJobIntake} />
          )}
          {intake.streamType === 'contract' && (
            <ContractReview data={intake.data as ContractIntake} />
          )}
          {intake.streamType === 'project' && (
            <ProjectReview data={intake.data as ProjectIntake} />
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 text-sm font-medium text-white bg-highstreet-purple rounded-lg hover:bg-opacity-90"
          >
            Approve & Import
          </button>
        </div>
      </div>
    </div>
  );
}

function DayJobReview({ data }: { data: DayJobIntake }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-sm font-medium text-slate-700">Employer</label>
          <div className="mt-1 text-slate-900">{data.employer}</div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Role</label>
          <div className="mt-1 text-slate-900">{data.role}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-sm font-medium text-slate-700">Pay Type</label>
          <div className="mt-1 text-slate-900 capitalize">{data.payType}</div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">
            {data.payType === 'salary' ? 'Annual Salary' : 'Hourly Rate'}
          </label>
          <div className="mt-1 text-slate-900 font-semibold">
            ${data.payType === 'salary' ? data.annualSalary?.toLocaleString() : data.hourlyRate}
            {data.payType === 'hourly' && '/hr'}
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700">Hours per Week</label>
        <div className="mt-1 text-slate-900">{data.hoursPerWeek} hours</div>
      </div>

      {data.recentPayStubs && data.recentPayStubs.length > 0 && (
        <div>
          <label className="text-sm font-medium text-slate-700 mb-3 block">Recent Pay Stubs</label>
          <div className="space-y-2">
            {data.recentPayStubs.map((stub, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {stub.period}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{stub.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    ${stub.grossPay.toLocaleString()} gross
                  </div>
                  <div className="text-xs text-slate-500">
                    ${stub.netPay.toLocaleString()} net
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.benefits && data.benefits.length > 0 && (
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Benefits</label>
          <ul className="space-y-1">
            {data.benefits.map((benefit, i) => (
              <li key={i} className="text-sm text-slate-600">• {benefit}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ContractReview({ data }: { data: ContractIntake }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-slate-700 mb-3 block">Clients</label>
        <div className="space-y-2">
          {data.clients.map((client, i) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-900">{client.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {client.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div className="text-sm font-semibold text-slate-900">
                ${client.hourlyRate || client.projectRate}/
                {client.hourlyRate ? 'hr' : 'project'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.recentInvoices && data.recentInvoices.length > 0 && (
        <div>
          <label className="text-sm font-medium text-slate-700 mb-3 block">Recent Invoices</label>
          <div className="space-y-2">
            {data.recentInvoices.map((invoice) => (
              <div key={invoice.id} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-slate-900">
                    {invoice.clientName}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    ${invoice.amount.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div>
                    Issued {invoice.dateIssued} • Due {invoice.dateDue}
                  </div>
                  <div>
                    <span className={`px-2 py-0.5 rounded ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-700' :
                      invoice.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      invoice.status === 'overdue' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
                {invoice.hoursWorked && (
                  <div className="text-xs text-slate-500 mt-1">
                    {invoice.hoursWorked} hours worked
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.monthlyHours && (
        <div>
          <label className="text-sm font-medium text-slate-700">Typical Monthly Hours</label>
          <div className="mt-1 text-slate-900">{data.monthlyHours} hours/month</div>
        </div>
      )}
    </div>
  );
}

function ProjectReview({ data }: { data: ProjectIntake }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-slate-700 mb-3 block">Users</label>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-semibold text-slate-900">{data.users.total}</div>
              <div className="text-xs text-slate-500 mt-1">Total users</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-slate-900">{data.users.active}</div>
              <div className="text-xs text-slate-500 mt-1">Active users</div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900 mt-1">{data.users.growth}</div>
              <div className="text-xs text-slate-500 mt-1">Growth</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 mb-3 block">Revenue</label>
        <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              ${data.revenue.total.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">Total revenue</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-slate-900">
              ${data.revenue.thisMonth.toLocaleString()}/mo
            </div>
            <div className="text-xs text-slate-500 mt-1">{data.revenue.trend}</div>
          </div>
        </div>
      </div>

      {data.costs && data.costs.length > 0 && (
        <div>
          <label className="text-sm font-medium text-slate-700 mb-3 block">Costs</label>
          <div className="space-y-2">
            {data.costs.map((cost, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                <div className="text-sm text-slate-900">{cost.service}</div>
                <div className="text-sm font-semibold text-slate-900">
                  ${cost.amount.toFixed(2)}/{cost.period}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.metrics && data.metrics.length > 0 && (
        <div>
          <label className="text-sm font-medium text-slate-700 mb-3 block">Metrics</label>
          <div className="grid grid-cols-2 gap-3">
            {data.metrics.map((metric, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-lg">
                <div className="text-2xl font-semibold text-slate-900">
                  {metric.value.toLocaleString()} {metric.unit}
                </div>
                <div className="text-sm text-slate-600 mt-1">{metric.name}</div>
                <div className="text-xs text-slate-500 mt-1">{metric.trend}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
