import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Round Management ──────────────────────────────────────────────────────────

// Create or get the active golf round for a session
router.post('/rounds', async (req: Request, res: Response) => {
  try {
    const { sessionId, courseName, totalPar } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: { message: 'sessionId required' } });

    const session = await prisma.mvpSession.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });

    // Check for existing active round
    const existing = await prisma.golfRound.findFirst({
      where: { sessionId, status: 'IN_PROGRESS' },
    });
    if (existing) {
      return res.json({ success: true, data: { round: existing }, message: 'Active round already exists' });
    }

    const round = await prisma.golfRound.create({
      data: { sessionId, courseName: courseName || 'Unknown Course', totalPar: totalPar || 72 },
    });

    res.status(201).json({ success: true, data: { round }, message: 'Golf round started' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create round' } });
  }
});

// Get round with all scores and bets
router.get('/rounds/:roundId', async (req: Request, res: Response) => {
  try {
    const round = await prisma.golfRound.findUnique({
      where: { id: req.params.roundId },
      include: { scores: true, bets: true },
    });
    if (!round) return res.status(404).json({ success: false, error: { message: 'Round not found' } });

    res.json({ success: true, data: { round } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to get round' } });
  }
});

// Get active round for a session
router.get('/sessions/:sessionId/round', async (req: Request, res: Response) => {
  try {
    const round = await prisma.golfRound.findFirst({
      where: { sessionId: req.params.sessionId, status: 'IN_PROGRESS' },
      include: { scores: true, bets: true },
    });
    res.json({ success: true, data: { round: round || null } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to get round' } });
  }
});

// ── Scorecard ──────────────────────────────────────────────────────────────────

// Update player scorecard (full 18-hole JSON)
router.put('/rounds/:roundId/scores/:playerId', async (req: Request, res: Response) => {
  try {
    const { roundId, playerId } = req.params;
    const { playerName, handicap, holes } = req.body;

    if (!holes || !Array.isArray(holes)) {
      return res.status(400).json({ success: false, error: { message: 'holes array required' } });
    }

    // Calculate totals
    let totalGross = 0, front9Gross = 0, back9Gross = 0;
    for (const h of holes) {
      totalGross += h.score || 0;
      if (h.hole <= 9) front9Gross += h.score || 0;
      else back9Gross += h.score || 0;
    }
    const hcp = handicap || 0;
    const totalNet = totalGross - Math.round(hcp);
    const front9Net = front9Gross - Math.round(hcp / 2);
    const back9Net = back9Gross - Math.round(hcp / 2);

    const score = await prisma.golfScore.upsert({
      where: { roundId_playerId: { roundId, playerId } },
      create: {
        roundId, playerId, playerName: playerName || 'Unknown',
        handicap: hcp, holes, totalGross, totalNet,
        front9Gross, front9Net, back9Gross, back9Net,
      },
      update: {
        playerName: playerName || undefined,
        handicap: hcp, holes, totalGross, totalNet,
        front9Gross, front9Net, back9Gross, back9Net,
      },
    });

    res.json({ success: true, data: { score } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to save scorecard' } });
  }
});

// ── Betting ────────────────────────────────────────────────────────────────────

// Create a bet
router.post('/rounds/:roundId/bets', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const { type, description, participants, totalPot } = req.body;

    const bet = await prisma.golfBet.create({
      data: {
        roundId, type: type || 'NASSAU',
        description: description || null,
        participants,
        totalPot: totalPot || 0,
      },
    });

    res.status(201).json({ success: true, data: { bet } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to create bet' } });
  }
});

// Settle a bet
router.put('/bets/:betId/settle', async (req: Request, res: Response) => {
  try {
    const { betId } = req.params;
    const { results } = req.body;

    const bet = await prisma.golfBet.update({
      where: { id: betId },
      data: { results, settled: true, settledAt: new Date() },
    });

    res.json({ success: true, data: { bet }, message: 'Bet settled' });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to settle bet' } });
  }
});

// ── Auto-calculate bet results ─────────────────────────────────────────────────

// Calculate Nassau results based on scores
router.post('/rounds/:roundId/calculate-nassau', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const { betId } = req.body;

    const scores = await prisma.golfScore.findMany({ where: { roundId } });
    if (scores.length < 2) {
      return res.status(400).json({ success: false, error: { message: 'Need at least 2 players' } });
    }

    const sortedByFront = [...scores].sort((a, b) => a.front9Net - b.front9Net);
    const sortedByBack = [...scores].sort((a, b) => a.back9Net - b.back9Net);
    const sortedByTotal = [...scores].sort((a, b) => a.totalNet - b.totalNet);

    const winner = sortedByTotal[0];
    const participants = JSON.parse(JSON.stringify((await prisma.golfBet.findUnique({ where: { id: betId } }))?.participants || '[]'));

    const results = scores.map(s => ({
      playerId: s.playerId,
      playerName: s.playerName,
      wonAmount: s.playerId === winner.playerId ? participants.reduce((sum: number, p: any) => sum + (p.stake || 0), 0) : -participants.find((p: any) => p.playerId === s.playerId)?.stake || 0,
      front9Place: sortedByFront.findIndex(x => x.playerId === s.playerId) + 1,
      back9Place: sortedByBack.findIndex(x => x.playerId === s.playerId) + 1,
      totalPlace: sortedByTotal.findIndex(x => x.playerId === s.playerId) + 1,
      front9Net: s.front9Net,
      back9Net: s.back9Net,
      totalNet: s.totalNet,
    }));

    res.json({ success: true, data: { results, winner: { name: winner.playerName, totalNet: winner.totalNet } } });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to calculate' } });
  }
});

// Calculate Skins results
router.post('/rounds/:roundId/calculate-skins', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const { skinValue } = req.body; // value per skin

    const scores = await prisma.golfScore.findMany({ where: { roundId } });
    if (scores.length < 2) {
      return res.status(400).json({ success: false, error: { message: 'Need at least 2 players' } });
    }

    const skinResults: any[] = [];
    const playerSkins: Record<string, { name: string; skins: number; amount: number }> = {};

    scores.forEach(s => { playerSkins[s.playerId] = { name: s.playerName, skins: 0, amount: 0 }; });

    // For each hole, find lowest net score
    const allHoles = (scores[0].holes as any[]) || [];
    for (const hole of allHoles) {
      if (!hole || !hole.hole) continue;

      // Build hole scores: { playerId, netScore }
      const holeScores = scores.map(s => {
        const h = ((s.holes as any[]) || []).find((x: any) => x.hole === hole.hole);
        return { playerId: s.playerId, score: h ? (h.score || 0) : 99 };
      });

      holeScores.sort((a, b) => a.score - b.score);
      const best = holeScores[0].score;
      const winners = holeScores.filter(h => h.score === best);

      // Skip ties (no skin awarded) or give skin if unique winner
      if (winners.length === 1 && best < 99) {
        const winner = winners[0];
        playerSkins[winner.playerId].skins++;
        playerSkins[winner.playerId].amount += skinValue || 0;
        skinResults.push({ hole: hole.hole, winner: scores.find(s => s.playerId === winner.playerId)?.playerName, score: best });
      } else {
        skinResults.push({ hole: hole.hole, winner: 'Tie — carry over', score: best });
      }
    }

    res.json({
      success: true,
      data: {
        skinResults,
        playerSkins: Object.entries(playerSkins).map(([id, data]) => ({
          playerId: id, ...data,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: 'Failed to calculate skins' } });
  }
});

export default router;
