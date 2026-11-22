'use client';

import { useState } from 'react';
import { BusinessInputs, BreakEvenMetrics } from '@/lib/types';

interface Props {
  inputs: BusinessInputs;
  breakEvenMetrics: BreakEvenMetrics;
}

export default function BreakEvenCalculator({ inputs, breakEvenMetrics }: Props) {
  const [userCount, setUserCount] = useState(inputs.userMetrics.totalUsers);
  const [revenuePerUser, setRevenuePerUser] = useState(
    inputs.revenue.monthlyRevenue / inputs.userMetrics.totalUsers || 0
  );

  const projectedRevenue = userCount * revenuePerUser;
  const projectedCosts = userCount * breakEvenMetrics.costPerUser;
  const projectedProfit = projectedRevenue - projectedCosts;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h3 className="font-semibold text-lg text-slate-900 mb-6">
        Break-Even Calculator
      </h3>

      {/* Current Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
        <div>
          <div className="text-xs text-slate-500 mb-1">Cost per User</div>
          <div className="text-2xl font-bold text-slate-900">
            ${breakEvenMetrics.costPerUser.toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 mt-1">per month</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Break-Even Price</div>
          <div className="text-2xl font-bold text-orange-600">
            ${breakEvenMetrics.breakEvenPricePerUser.toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 mt-1">per user/month</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Current Burn</div>
          <div className={`text-2xl font-bold ${breakEvenMetrics.monthlyBurnRate > 0 ? 'text-red-600' : 'text-green-600'}`}>
            ${Math.abs(breakEvenMetrics.monthlyBurnRate).toFixed(2)}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {breakEvenMetrics.monthlyBurnRate > 0 ? 'losing' : 'profit'} /month
          </div>
        </div>
      </div>

      {/* Cost per Task */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Cost per Task</h4>
        <div className="space-y-2">
          {Object.entries(breakEvenMetrics.costPerTask).map(([task, cost]) => (
            <div key={task} className="flex justify-between items-center text-sm">
              <span className="text-slate-600">{task}</span>
              <span className="font-mono font-semibold text-slate-900">
                ${cost.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Projections */}
      <div className="border-t border-slate-200 pt-6">
        <h4 className="text-sm font-semibold text-slate-700 mb-4">
          What if? Projections
        </h4>

        <div className="space-y-4">
          {/* User Count Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-slate-600">Number of Users</label>
              <span className="text-sm font-semibold text-slate-900">{userCount}</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(userCount * 5, 1000)}
              value={userCount}
              onChange={(e) => setUserCount(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            />
          </div>

          {/* Revenue per User Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-slate-600">Revenue per User/Month</label>
              <span className="text-sm font-semibold text-slate-900">
                ${revenuePerUser.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(breakEvenMetrics.breakEvenPricePerUser * 5, 100)}
              step="0.1"
              value={revenuePerUser}
              onChange={(e) => setRevenuePerUser(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            />
          </div>
        </div>

        {/* Projection Results */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-500 mb-1">Revenue</div>
              <div className="text-lg font-bold text-slate-900">
                ${projectedRevenue.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Costs</div>
              <div className="text-lg font-bold text-slate-900">
                ${projectedCosts.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Profit</div>
              <div className={`text-lg font-bold ${projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${projectedProfit >= 0 ? '+' : ''}{projectedProfit.toFixed(0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
