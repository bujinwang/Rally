import { prisma } from '../config/database';

/**
 * Cost sharing service for Rally sessions.
 * Handles: court fees, birdie costs, split calculations, BYOB mode.
 */

export type CostModel = 'SPLIT_EVENLY' | 'PER_PLAYER' | 'BYOB' | 'ORGANIZER_COVERS' | 'PER_COURT';
export type BirdieProvider = 'ORGANIZER' | 'PLAYERS_BRING_OWN' | 'INCLUDED_IN_COST';

export interface CostBreakdown {
  sessionId: string;
  costModel: CostModel;
  totalCost: number;
  courtCost: number;
  birdieCost: number;
  birdieTubesUsed: number;
  birdieCostPerTube: number | null;
  birdieProvidedBy: BirdieProvider | null;
  birdiesUsedTotal: number; // sum across all games
  activePlayerCount: number;
  perPlayerCost: number;
  breakdown: string; // human-readable explanation
}

/**
 * Calculate the full cost breakdown for a session.
 */
export async function calculateSessionCost(sessionId: string): Promise<CostBreakdown> {
  const session = await prisma.mvpSession.findUnique({
    where: { id: sessionId },
    include: {
      players: { where: { status: { not: 'LEFT' } } },
      games: true,
    },
  });

  if (!session) throw new Error('Session not found');

  const costModel = (session.costModel || 'SPLIT_EVENLY') as CostModel;
  const courtCost = session.cost || 0;
  const birdieCostPerTube = session.birdieCostPerTube || 0;
  const birdieTubesOpened = session.birdieTubesOpened || 0;
  const birdieProvidedBy = (session.birdieProvidedBy || null) as BirdieProvider | null;
  const activePlayers = session.players.filter(p => p.status === 'ACTIVE' || p.status === 'PENDING');
  const activeCount = activePlayers.length || 1; // avoid division by zero

  // Calculate birdies used across all games
  const birdiesUsedTotal = session.games.reduce((sum, g) => sum + (g.birdiesUsed || 0), 0);

  // Birdie cost: either from tubes opened or from per-game tracking
  let birdieCost = 0;
  if (birdieTubesOpened > 0 && birdieCostPerTube > 0) {
    birdieCost = birdieTubesOpened * birdieCostPerTube;
  } else if (birdiesUsedTotal > 0 && birdieCostPerTube > 0) {
    // Estimate: ~12 birdies per tube
    birdieCost = Math.ceil(birdiesUsedTotal / 12) * birdieCostPerTube;
  }

  // Calculate total and per-player based on model
  let totalCost = 0;
  let perPlayerCost = 0;
  let breakdown = '';

  switch (costModel) {
    case 'BYOB':
      // Players bring own birdies, only share court cost
      totalCost = courtCost;
      perPlayerCost = courtCost / activeCount;
      breakdown = `BYOB: ${activeCount} players split court cost ($${courtCost.toFixed(2)}) at $${perPlayerCost.toFixed(2)} each. Players bring own birdies.`;
      break;

    case 'PER_PLAYER':
      // Fixed amount per player set by organizer
      perPlayerCost = courtCost > 0 ? courtCost : (session as any).costPerPlayer || 0;
      totalCost = perPlayerCost * activeCount;
      breakdown = `$${perPlayerCost.toFixed(2)} per player × ${activeCount} players = $${totalCost.toFixed(2)} total`;
      break;

    case 'ORGANIZER_COVERS':
      totalCost = courtCost + birdieCost;
      perPlayerCost = 0;
      breakdown = `Organizer covers all costs ($${totalCost.toFixed(2)}). Players play free.`;
      break;

    case 'PER_COURT':
      totalCost = courtCost + birdieCost;
      perPlayerCost = totalCost / activeCount;
      breakdown = `Per-court split: $${totalCost.toFixed(2)} ÷ ${activeCount} players = $${perPlayerCost.toFixed(2)} each`;
      break;

    case 'SPLIT_EVENLY':
    default:
      totalCost = courtCost + birdieCost;
      perPlayerCost = totalCost / activeCount;
      breakdown = `Split evenly: (court $${courtCost.toFixed(2)} + birdies $${birdieCost.toFixed(2)}) ÷ ${activeCount} = $${perPlayerCost.toFixed(2)} each`;
      break;
  }

  return {
    sessionId,
    costModel,
    totalCost: Math.round(totalCost * 100) / 100,
    courtCost,
    birdieCost: Math.round(birdieCost * 100) / 100,
    birdieTubesUsed: birdieTubesOpened,
    birdieCostPerTube: birdieCostPerTube || null,
    birdieProvidedBy,
    birdiesUsedTotal,
    activePlayerCount: activeCount,
    perPlayerCost: Math.round(perPlayerCost * 100) / 100,
    breakdown,
  };
}

/**
 * Update session cost settings.
 */
export async function updateSessionCostSettings(
  sessionId: string,
  settings: {
    costModel?: CostModel;
    cost?: number;
    birdieCostPerTube?: number;
    birdieTubesOpened?: number;
    birdieProvidedBy?: BirdieProvider;
  },
) {
  const update: Record<string, any> = {};
  if (settings.costModel !== undefined) update.costModel = settings.costModel;
  if (settings.cost !== undefined) update.cost = settings.cost;
  if (settings.birdieCostPerTube !== undefined) update.birdieCostPerTube = settings.birdieCostPerTube;
  if (settings.birdieTubesOpened !== undefined) update.birdieTubesOpened = settings.birdieTubesOpened;
  if (settings.birdieProvidedBy !== undefined) update.birdieProvidedBy = settings.birdieProvidedBy;

  await prisma.mvpSession.update({
    where: { id: sessionId },
    data: update,
  });

  return calculateSessionCost(sessionId);
}

/**
 * Record birdies used in a game.
 */
export async function recordGameBirdies(
  gameId: string,
  birdiesUsed: number,
) {
  await prisma.mvpGame.update({
    where: { id: gameId },
    data: { birdiesUsed },
  });

  // Also update session-level tube count if we can estimate
  const game = await prisma.mvpGame.findUnique({
    where: { id: gameId },
    select: { sessionId: true },
  });

  if (game) {
    const session = await prisma.mvpSession.findUnique({
      where: { id: game.sessionId },
      include: { games: true },
    });

    if (session) {
      const totalBirdies = session.games.reduce((s, g) => s + (g.birdiesUsed || 0), 0);
      const tubesEstimate = Math.ceil(totalBirdies / 12); // ~12 birdies per tube
      await prisma.mvpSession.update({
        where: { id: game.sessionId },
        data: { birdieTubesOpened: tubesEstimate },
      });
    }
  }
}

/**
 * Get quick cost summary for display in session header.
 */
export function getCostLabel(costModel: CostModel, perPlayerCost: number): string {
  switch (costModel) {
    case 'BYOB':
      return perPlayerCost > 0 ? `$${perPlayerCost.toFixed(0)}/player + BYOB` : 'Bring your own birdies';
    case 'PER_PLAYER':
      return `$${perPlayerCost.toFixed(0)}/player`;
    case 'ORGANIZER_COVERS':
      return 'Free · organizer covers';
    case 'PER_COURT':
    case 'SPLIT_EVENLY':
      return perPlayerCost > 0 ? `~$${perPlayerCost.toFixed(0)}/player` : 'Free';
    default:
      return '';
  }
}
