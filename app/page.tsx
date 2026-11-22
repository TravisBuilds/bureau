'use client';

import { useState, useEffect } from 'react';
import { ProjectStatus, FounderTimeBudget } from '@/lib/agent-report-types';
import { evaluateAgentReport, calculateFounderTimeAsks } from '@/lib/decision-engine-v2';
import { plumListAgentReport } from '@/lib/agent-reports-seed';
import PortfolioHome from '@/components/PortfolioHome';
import ConnectAgentScreen from '@/components/ConnectAgentScreen';
import ProjectDetailView from '@/components/ProjectDetailView';

export default function Home() {
  const [projects, setProjects] = useState<ProjectStatus[]>([]);
  const [founderBudget, setFounderBudget] = useState<FounderTimeBudget>({});
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  // Load projects on mount
  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem('bureau-projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProjects(parsed);
      } catch (e) {
        console.error('Failed to load projects:', e);
      }
    } else {
      // Seed with Plum List
      const plumListStatus = evaluateAgentReport(plumListAgentReport);
      const initialProjects = [
        plumListStatus,
        {
          projectName: 'Project 2',
          connected: false,
        },
        {
          projectName: 'Project 3',
          connected: false,
        },
      ];
      setProjects(initialProjects);
      localStorage.setItem('bureau-projects', JSON.stringify(initialProjects));
    }

    // Load founder budget
    const savedBudget = localStorage.getItem('bureau-founder-budget');
    if (savedBudget) {
      try {
        setFounderBudget(JSON.parse(savedBudget));
      } catch (e) {
        console.error('Failed to load budget:', e);
      }
    }
  }, []);

  // Save to localStorage when data changes
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('bureau-projects', JSON.stringify(projects));
    }
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('bureau-founder-budget', JSON.stringify(founderBudget));
  }, [founderBudget]);

  const timeAsks = calculateFounderTimeAsks(projects);

  if (showConnect) {
    return (
      <ConnectAgentScreen
        onClose={() => setShowConnect(false)}
        onReportAdded={(report) => {
          const status = evaluateAgentReport(report);
          const updated = [...projects.filter(p => p.projectName !== status.projectName), status];
          setProjects(updated);
          setShowConnect(false);
        }}
      />
    );
  }

  if (selectedProject) {
    const project = projects.find(p => p.projectName === selectedProject);
    if (project && project.connected) {
      return (
        <ProjectDetailView
          project={project}
          onBack={() => setSelectedProject(null)}
        />
      );
    }
  }

  return (
    <PortfolioHome
      projects={projects}
      founderBudget={founderBudget}
      timeAsks={timeAsks}
      onConnectAgent={() => setShowConnect(true)}
      onSelectProject={(name) => setSelectedProject(name)}
      onUpdateBudget={(budget) => setFounderBudget(budget)}
    />
  );
}
