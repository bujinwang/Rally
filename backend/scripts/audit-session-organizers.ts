import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const separator = () => console.log('='.repeat(60));

async function main() {
  separator();
  console.log('Session Organizer Audit');
  separator();

  const totalSessions = await prisma.mvpSession.count();
  const sessionsWithoutOwnerDevice = await prisma.mvpSession.findMany({
    where: { ownerDeviceId: null },
    include: {
      players: {
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          name: true,
          deviceId: true,
          role: true,
          joinedAt: true,
        },
      },
    },
  });

  const totalPlayers = await prisma.mvpPlayer.count();
  const playersWithoutDevice = await prisma.mvpPlayer.count({ where: { deviceId: null } });
  const playersWithoutRole = await prisma.$queryRawUnsafe<[{ missingRoleCount: bigint }]>(
    'SELECT COUNT(*)::bigint AS "missingRoleCount" FROM "mvp_players" WHERE role IS NULL'
  ).catch(() => [{ missingRoleCount: BigInt(-1) }]);

  console.log(`Total sessions: ${totalSessions}`);
  console.log(`Sessions missing ownerDeviceId: ${sessionsWithoutOwnerDevice.length}`);
  console.log(`Total players: ${totalPlayers}`);
  console.log(`Players missing deviceId: ${playersWithoutDevice}`);

  const missingRoleCount = playersWithoutRole[0]?.missingRoleCount ?? BigInt(-1);
  if (missingRoleCount >= BigInt(0)) {
    console.log(`Players with NULL role: ${missingRoleCount}`);
  } else {
    console.log('Players with NULL role: (query not supported on this database)');
  }

  separator();
  console.log('Sessions missing ownerDeviceId breakdown:');
  separator();

  const autoFixable = [] as { id: string; shareCode: string | null; proposedDeviceId: string | null; playerName: string | null }[];
  const manualReview = [] as { id: string; shareCode: string | null; reason: string }[];

  for (const session of sessionsWithoutOwnerDevice) {
    const firstPlayerWithDevice = session.players.find((player) => player.deviceId);
    if (firstPlayerWithDevice) {
      autoFixable.push({
        id: session.id,
        shareCode: session.shareCode,
        proposedDeviceId: firstPlayerWithDevice.deviceId ?? null,
        playerName: firstPlayerWithDevice.name ?? null,
      });
    } else {
      manualReview.push({
        id: session.id,
        shareCode: session.shareCode,
        reason: 'No players with deviceId available',
      });
    }
  }

  console.log(`Sessions auto-fixable with player device IDs: ${autoFixable.length}`);
  console.log(`Sessions requiring manual follow-up: ${manualReview.length}`);

  if (autoFixable.length > 0) {
    separator();
    console.log('Auto-fixable sessions (sessionId, shareCode, playerName, deviceId):');
    separator();
    autoFixable.slice(0, 20).forEach((entry) => {
      console.log(`${entry.id} | ${entry.shareCode ?? 'n/a'} | ${entry.playerName ?? 'unknown'} | ${entry.proposedDeviceId ?? 'missing-deviceId'}`);
    });
    if (autoFixable.length > 20) {
      console.log(`...and ${autoFixable.length - 20} more`);
    }
  }

  if (manualReview.length > 0) {
    separator();
    console.log('Sessions requiring manual review (sessionId, shareCode, reason):');
    separator();
    manualReview.slice(0, 20).forEach((entry) => {
      console.log(`${entry.id} | ${entry.shareCode ?? 'n/a'} | ${entry.reason}`);
    });
    if (manualReview.length > 20) {
      console.log(`...and ${manualReview.length - 20} more`);
    }
  }

  separator();
  console.log('Audit complete.');
  separator();

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Audit failed:', error);
  return prisma.$disconnect().finally(() => process.exit(1));
});
