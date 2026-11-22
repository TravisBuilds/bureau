#!/usr/bin/env node
/**
 * Bureau CLI - Evaluate a business from the command line
 * 
 * Usage:
 *   npm run evaluate -- --file data.json
 *   npm run evaluate -- --business "Plum List"
 */

import * as fs from 'fs';
import * as path from 'path';
import { evaluateBusiness } from '../lib/engine';
import { businessArchetypes } from '../lib/seed-data';
import { BusinessInputs } from '../lib/types';

function printHelp() {
  console.log(`
Bureau CLI - Business Decision Engine

Usage:
  npm run evaluate -- --file <path>        Evaluate from JSON file
  npm run evaluate -- --business <name>    Evaluate a seed business
  npm run evaluate -- --list               List available seed businesses
  npm run evaluate -- --help               Show this help

Examples:
  npm run evaluate -- --file my-business.json
  npm run evaluate -- --business "Plum List"
  npm run evaluate -- --list
  `);
}

function listBusinesses() {
  console.log('\nAvailable seed businesses:\n');
  businessArchetypes.forEach(archetype => {
    console.log(`  • ${archetype.name}`);
    console.log(`    ${archetype.description}\n`);
  });
}

function formatDecision(decision: any, inputs: BusinessInputs) {
  const verdictSymbols: { [key: string]: string } = {
    quit_your_day_job: '✅',
    keep_going: '🚀',
    not_enough_evidence: '🔍',
    not_yet: '⚠️',
    stop: '🛑',
  };

  const verdictLabels: { [key: string]: string } = {
    quit_your_day_job: 'Yes, quit your day job',
    keep_going: 'Keep going',
    not_enough_evidence: 'Not enough evidence',
    not_yet: 'Not yet',
    stop: 'Stop',
  };

  console.log('\n' + '='.repeat(80));
  console.log(`BUREAU DECISION: ${inputs.businessName}`);
  console.log('='.repeat(80));
  
  console.log(`\n${verdictSymbols[decision.verdict]} ${verdictLabels[decision.verdict]}`);
  console.log(`Confidence: ${decision.confidence.toUpperCase()}`);
  
  console.log('\n📊 KEY FACTS:');
  decision.keyFacts.forEach((fact: any) => {
    console.log(`\n  ${fact.label}: ${fact.value}`);
    console.log(`  → ${fact.interpretation}`);
  });

  console.log('\n💵 PRICING RECOMMENDATION:');
  console.log(`  Strategy: ${decision.pricingRecommendation.strategy}`);
  console.log(`  ${decision.pricingRecommendation.reasoning}`);
  if (decision.pricingRecommendation.recommendedPricePerUser) {
    console.log(`  Recommended: $${decision.pricingRecommendation.recommendedPricePerUser}/user/month`);
  }
  if (decision.pricingRecommendation.monthlyCostCap) {
    console.log(`  Cost cap: $${decision.pricingRecommendation.monthlyCostCap}/month`);
  }

  console.log('\n🌐 OPEN TO USERS:');
  console.log(`  Recommendation: ${decision.openToUsersRecommendation.recommendation}`);
  console.log(`  ${decision.openToUsersRecommendation.reasoning}`);

  console.log('\n💰 BREAK-EVEN METRICS:');
  console.log(`  Cost per user: $${decision.breakEvenMetrics.costPerUser.toFixed(2)}/month`);
  console.log(`  Break-even price: $${decision.breakEvenMetrics.breakEvenPricePerUser.toFixed(2)}/user/month`);
  console.log(`  Monthly burn: ${decision.breakEvenMetrics.monthlyBurnRate > 0 ? '-' : '+'}$${Math.abs(decision.breakEvenMetrics.monthlyBurnRate).toFixed(2)}`);

  if (decision.missingData && decision.missingData.length > 0) {
    console.log('\n⚠️  MISSING DATA:');
    decision.missingData.forEach((item: string) => {
      console.log(`  • ${item}`);
    });
  }

  console.log('\n🤖 AGENT ACTION BRIEF:');
  console.log('─'.repeat(80));
  console.log(decision.agentActionBrief);
  console.log('─'.repeat(80));

  console.log('\n' + '='.repeat(80) + '\n');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printHelp();
    return;
  }

  if (args.includes('--list')) {
    listBusinesses();
    return;
  }

  let inputs: BusinessInputs | null = null;

  // Load from file
  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && args[fileIndex + 1]) {
    const filePath = path.resolve(args[fileIndex + 1]);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      inputs = JSON.parse(content);
      console.log(`\n✓ Loaded business data from ${filePath}`);
    } catch (error) {
      console.error(`\n✗ Error loading file: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  // Load from seed business
  const businessIndex = args.indexOf('--business');
  if (businessIndex !== -1 && args[businessIndex + 1]) {
    const businessName = args[businessIndex + 1];
    const archetype = businessArchetypes.find(
      a => a.name.toLowerCase() === businessName.toLowerCase()
    );
    if (archetype) {
      inputs = archetype.inputs;
      console.log(`\n✓ Loaded seed business: ${archetype.name}`);
    } else {
      console.error(`\n✗ Business "${businessName}" not found. Use --list to see available businesses.`);
      process.exit(1);
    }
  }

  if (!inputs) {
    console.error('\n✗ No input provided. Use --file or --business.');
    printHelp();
    process.exit(1);
  }

  // Evaluate
  try {
    const decision = evaluateBusiness(inputs);
    formatDecision(decision, inputs);

    // Write output JSON
    const outputPath = path.resolve('bureau-decision.json');
    fs.writeFileSync(outputPath, JSON.stringify(decision, null, 2));
    console.log(`💾 Full decision saved to: ${outputPath}\n`);
  } catch (error) {
    console.error(`\n✗ Evaluation failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
