import { NextRequest, NextResponse } from 'next/server';
import { AgentReport } from '@/lib/agent-report-types';
import { evaluateAgentReport } from '@/lib/decision-engine-v2';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.join(process.cwd(), 'data', 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * POST /api/reports
 * Receive agent report and store it
 */
export async function POST(request: NextRequest) {
  try {
    const report: AgentReport = await request.json();
    
    // Validate required fields
    if (!report.projectName || !report.reportDate || !report.userMetrics) {
      return NextResponse.json(
        { error: 'Missing required fields: projectName, reportDate, userMetrics' },
        { status: 400 }
      );
    }
    
    // Store report
    const filename = `${report.projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    const filepath = path.join(REPORTS_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    
    // Evaluate and return next actions
    const status = evaluateAgentReport(report);
    
    return NextResponse.json({
      message: 'Report received',
      status,
      storedAs: filename,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process report', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports
 * List all stored reports
 */
export async function GET() {
  try {
    const files = fs.existsSync(REPORTS_DIR) 
      ? fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.json'))
      : [];
    
    const reports = files.map(file => {
      const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
      return JSON.parse(content);
    });
    
    return NextResponse.json({ reports }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list reports', message: (error as Error).message },
      { status: 500 }
    );
  }
}
