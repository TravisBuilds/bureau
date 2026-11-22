import { NextRequest, NextResponse } from 'next/server';
import { MockProvider } from '@/lib/providers/MockProvider';
import { getCredentials, sanitizeForClient } from '@/lib/credential-storage';
import * as fs from 'fs';
import * as path from 'path';

const TASKS_DIR = path.join(process.cwd(), 'data', 'tasks');

// Ensure directory exists
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

/**
 * POST /api/tasks
 * Dispatch a task to an agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, agentId, brief, context } = body;
    
    if (!projectName || !agentId || !brief) {
      return NextResponse.json(
        { error: 'Missing required fields: projectName, agentId, brief' },
        { status: 400 }
      );
    }
    
    // Get credentials (server-side only)
    const apiKey = getCredentials(projectName, 'mock-provider');
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No connection found', message: 'Connect to provider first' },
        { status: 401 }
      );
    }
    
    // Dispatch task
    const provider = new MockProvider();
    const result = await provider.dispatchTask(agentId, brief, context);
    
    // Store task metadata
    const taskMeta = {
      ...result,
      projectName,
      brief,
      context,
      createdAt: new Date().toISOString(),
    };
    
    const taskFile = path.join(TASKS_DIR, `${result.taskId}.json`);
    fs.writeFileSync(taskFile, JSON.stringify(taskMeta, null, 2));
    
    return NextResponse.json(sanitizeForClient(result), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Task dispatch failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tasks?taskId=X or ?projectName=Y
 * Get task status or list tasks for a project
 */
export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get('taskId');
    const projectName = request.nextUrl.searchParams.get('projectName');
    
    if (taskId) {
      // Get specific task status
      const provider = new MockProvider();
      const task = await provider.getTaskStatus(taskId);
      
      return NextResponse.json(sanitizeForClient(task), { status: 200 });
    } else if (projectName) {
      // List all tasks for project
      const files = fs.existsSync(TASKS_DIR)
        ? fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'))
        : [];
      
      const tasks = files.map(file => {
        const content = fs.readFileSync(path.join(TASKS_DIR, file), 'utf-8');
        return JSON.parse(content);
      }).filter(t => t.projectName === projectName);
      
      // Get current status for each task
      const provider = new MockProvider();
      const tasksWithStatus = await Promise.all(
        tasks.map(async (task) => {
          try {
            const status = await provider.getTaskStatus(task.taskId);
            return sanitizeForClient(status);
          } catch {
            return sanitizeForClient(task);
          }
        })
      );
      
      return NextResponse.json({ tasks: tasksWithStatus }, { status: 200 });
    } else {
      return NextResponse.json(
        { error: 'Missing taskId or projectName parameter' },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get task', message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tasks
 * Update task (e.g. approve/reject founder action)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, founderAction } = body;
    
    if (!taskId || !founderAction) {
      return NextResponse.json(
        { error: 'Missing required fields: taskId, founderAction' },
        { status: 400 }
      );
    }
    
    const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
    
    if (!fs.existsSync(taskFile)) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    
    const task = JSON.parse(fs.readFileSync(taskFile, 'utf-8'));
    task.founderAction = founderAction;
    task.reviewedAt = new Date().toISOString();
    
    fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
    
    return NextResponse.json(sanitizeForClient(task), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update task', message: (error as Error).message },
      { status: 500 }
    );
  }
}
