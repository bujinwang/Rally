import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { getSessionSuggestions, predictNextSessionTime } from '../services/regularGroupService';

const router = Router();

/**
 * GET /session-templates/suggestions/:deviceId
 * Returns regular group suggestions — groups of players who play together repeatedly.
 * Shows how long since their last game and suggests creating the next session.
 */
router.get('/suggestions/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const minOccurrences = parseInt(req.query.minOccurrences as string) || 2;
    const minDaysSinceLast = parseInt(req.query.minDaysSinceLast as string) || 5;

    const suggestions = await getSessionSuggestions(deviceId, minOccurrences, minDaysSinceLast);

    // For each suggestion, predict the next session time
    const enriched = suggestions.map(s => ({
      ...s,
      nextPredictedTime: predictNextSessionTime(s.dayOfWeek, s.typicalTime).toISOString(),
    }));

    res.json({
      success: true,
      data: { suggestions: enriched },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get suggestions' },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
