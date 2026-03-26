import { PrismaClient } from '@prisma/client';
import { builtInAgents } from '../apps/api/src/agents/builtin-registry.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const builtIn of builtInAgents) {
    const { spec } = builtIn;
    await prisma.agent.upsert({
      where: { id: builtIn.id },
      create: {
        id: builtIn.id,
        name: spec.name,
        category: spec.category,
        icon: spec.icon ?? '🤖',
        color: spec.color ?? '#00D4AA',
        voiceId: spec.voiceId ?? 'alloy',
        isBuiltIn: true,
        version: '1.0',
        environment: 'Production',
        specJson: spec as object,
        guardrailsJson: spec.guardrails as object,
      },
      update: {
        name: spec.name,
        category: spec.category,
        icon: spec.icon ?? '🤖',
        color: spec.color ?? '#00D4AA',
        voiceId: spec.voiceId ?? 'alloy',
        specJson: spec as object,
        guardrailsJson: spec.guardrails as object,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
