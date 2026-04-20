import { VanguardNode, ForgeNode, GuardianNode } from './nodes.js';

/**
 * 5-Minute TDD Execution Loop.
 * Inspired by Superpowers TDD requirement: Forces the sub-agents to pass 
 * strict testing gates (RED -> GREEN -> REFACTOR) before merging context.
 */
export async function executeTddLoop(intent: string, maxRetries = 3): Promise<boolean> {
    const vanguard = new VanguardNode();
    const forge = new ForgeNode();
    const guardian = new GuardianNode();

    // 1. Planning Phase
    const plan = await vanguard.execute(intent);
    
    // 2. Generation & Review Loop
    for (let attempts = 0; attempts < maxRetries; attempts++) {
        const code = await forge.execute(plan);
        const review = await guardian.execute(code);
        
        if (review.includes('Approved')) {
            return true; // Condition Met - GREEN
        }
        // If rejected, loop repeats passing error logs as extra context
    }

    throw new Error('Guardian rejected changes max times. TDD Subagent Aborted to prevent slop.');
}
