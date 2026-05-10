import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  createClub,
  getClub,
  getMyClubs,
  discoverClubs,
  joinClub,
  createClubSession,
} from '../services/clubService';

const router = Router();

/**
 * POST /clubs — Create a new club
 */
const createClubValidation = [
  body('name').isString().isLength({ min: 2, max: 100 }),
  body('sportTypes').isArray({ min: 1 }),
  body('ownerDeviceId').isString(),
  body('ownerName').isString().isLength({ min: 2, max: 100 }),
  body('location').optional().isString(),
  body('description').optional().isString(),
  body('logoUrl').optional().isString(),
  body('contactEmail').optional().isEmail(),
];

router.post('/', authenticateToken, createClubValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', details: errors.array() } });
    }
    const club = await createClub(req.body);
    res.status(201).json({ success: true, data: club });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /clubs/:clubId — Get club details
 */
router.get('/:clubId', async (req: Request, res: Response) => {
  try {
    const club = await getClub(req.params.clubId);
    if (!club) return res.status(404).json({ success: false, error: { message: 'Club not found' } });
    res.json({ success: true, data: club });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /clubs/my/:deviceId — Get clubs for a device
 */
router.get('/my/:deviceId', async (req: Request, res: Response) => {
  try {
    const clubs = await getMyClubs(req.params.deviceId);
    res.json({ success: true, data: clubs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * GET /clubs/discover — Browse public clubs
 */
router.get('/discover', async (req: Request, res: Response) => {
  try {
    const sport = req.query.sport as string | undefined;
    const clubs = await discoverClubs(sport);
    res.json({ success: true, data: clubs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

/**
 * POST /clubs/:clubId/join — Join a club
 */
router.post('/:clubId/join', async (req: Request, res: Response) => {
  try {
    const { deviceId, name } = req.body;
    if (!deviceId || !name) {
      return res.status(400).json({ success: false, error: { message: 'deviceId and name required' } });
    }
    const member = await joinClub(req.params.clubId, deviceId, name);
    res.status(201).json({ success: true, data: member });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { message: error.message } });
  }
});

/**
 * POST /clubs/:clubId/sessions — Create club session (auto-invites all members)
 */
router.post('/:clubId/sessions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { clubId } = req.params;
    const sessionData = req.body;

    if (!sessionData.name || !sessionData.dateTime || !sessionData.organizerName) {
      return res.status(400).json({ success: false, error: { message: 'name, dateTime, organizerName required' } });
    }

    const session = await createClubSession(clubId, sessionData);
    res.status(201).json({ success: true, data: session });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

export default router;
