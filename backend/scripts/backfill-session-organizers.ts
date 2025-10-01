import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.mvpSession.findMany({
    where: { ownerDeviceId: null },
    include: {
      players: {
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          name: true,
          deviceId: true,
          role: true,
        },
      },
    },
  });

  if (sessions.length === 0) {
    console.log('No sessions without ownerDeviceId found. Nothing to backfill.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${sessions.length} sessions missing ownerDeviceId.`);

  let autoAssigned = 0;
  const manualReview: { sessionId: string; shareCode: string | null; reason: string }[] = [];

  for (const session of sessions) {
    const candidate = session.players.find((player) => player.deviceId);

    if (!candidate) {
      manualReview.push({
        sessionId: session.id,
        shareCode: session.shareCode,
        reason: 'No player with deviceId available to assign as organizer.',
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.mvpSession.update({
        where: { id: session.id },
        data: { ownerDeviceId: candidate.deviceId },
      });

      await tx.mvpPlayer.update({
        where: { id: candidate.id },
        data: { role: 'ORGANIZER' },
      });

      await tx.mvpPlayer.updateMany({
        where: {
          sessionId: session.id,
          id: { not: candidate.id },
          role: 'ORGANIZER',
        },
        data: { role: 'PLAYER' },
      });
    });

    autoAssigned += 1;
    console.log(`Assigned organizer for session ${session.id} using player ${candidate.name} (${candidate.deviceId}).`);
  }

  console.log('='.repeat(60));
  console.log(`Organizer assignment complete.`);
  console.log(`Sessions updated automatically: ${autoAssigned}`);
  console.log(`Sessions needing manual review: ${manualReview.length}`);

  if (manualReview.length > 0) {
    console.log('Manual review list (sessionId | shareCode | reason):');
    manualReview.forEach((entry) => {
      console.log(`${entry.sessionId} | ${entry.shareCode ?? 'n/a'} | ${entry.reason}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  return prisma.$disconnect().finally(() => process.exit(1));
});
