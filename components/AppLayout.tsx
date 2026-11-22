'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Props {
  children: React.ReactNode;
  currentStream?: string | null;
}

export default function AppLayout({ children, currentStream }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-light-gray">
      {/* Left Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-dark text-white flex flex-col transition-all duration-200`}>
        {/* Logo & Header */}
        <div className="p-4 border-b border-gray-700">
          {sidebarOpen ? (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-cyan to-purple rounded"></div>
                <div>
                  <h1 className="text-lg font-bold">Bureau</h1>
                  <p className="text-xs text-silver">by Highstreet</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-cyan to-purple rounded mx-auto"></div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <NavLink href="/" icon="💰" label="Income Streams" open={sidebarOpen} />
            {currentStream && (
              <div className="mt-6 pt-6 border-t border-gray-700">
                <div className="text-xs text-silver mb-2 px-2">{sidebarOpen ? currentStream : '...'}</div>
                <NavLink href="/overview" icon="🎯" label="Overview" open={sidebarOpen} />
                <NavLink href="/tasks" icon="✓" label="Tasks" open={sidebarOpen} />
                <NavLink href="/helpers" icon="🤝" label="Your Helpers" open={sidebarOpen} />
                <NavLink href="/money" icon="💵" label="Money In/Out" open={sidebarOpen} />
                <NavLink href="/activity" icon="📝" label="Activity" open={sidebarOpen} />
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full text-silver hover:text-white text-sm"
          >
            {sidebarOpen ? '← Collapse' : '→'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, icon, label, open }: { href: string; icon: string; label: string; open: boolean }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-silver hover:bg-gray-800 hover:text-white transition-colors"
    >
      <span className="text-lg">{icon}</span>
      {open && <span className="text-sm font-medium">{label}</span>}
    </a>
  );
}
