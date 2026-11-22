import { evaluateAgentReport } from './lib/decision-engine-v2';
import { plumListAgentReport } from './lib/agent-reports-seed';

const status = evaluateAgentReport(plumListAgentReport);

console.log('=== PLUM LIST NEXT ACTIONS ===\n');
console.log('Verdict:', status.verdict);
console.log('Founder Signal:', status.founderSignal, '-', status.signalReasoning);
console.log('\nTop Next Actions:\n');

status.nextActions?.forEach((action, i) => {
  console.log(`${i + 1}. ${action.title}`);
  console.log(`   Priority: ${action.priority} | Founder time: ${action.founderTimeMinutes}min`);
  console.log(`   Reasoning: ${action.reasoning}`);
  console.log(`   Cost of waiting: ${action.costOfWaiting}`);
  if (action.blockedMetric) {
    console.log(`   🚧 Blocks: ${action.blockedMetric}`);
  }
  console.log(`   Agent task brief: ${action.agentTaskBrief.substring(0, 100)}...`);
  console.log('');
});
