import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { body, validationResult } from 'express-validator';

const router = Router();

const createTemplateValidation = [
  body('name').isString().notEmpty().withMessage('Template name is required'),
  body('ownerDeviceId').isString().notEmpty().withMessage('Device ID is required'),
];

/**
 * List templates for a device
 * GET /session-templates/:deviceId
 */
router.get('/:deviceId', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    const templates = await prisma.sessionTemplate.findMany({
      where: { ownerDeviceId: deviceId },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      data: { templates },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list templates' },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Create a template
 * POST /session-templates
 */
router.post('/', createTemplateValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
        timestamp: new Date().toISOString(),
      });
    }

    const {
      name, description, ownerDeviceId,
      maxPlayers, courtCount, skillLevel, location, cost,
      scoringSystem, bestOfGames, restPeriod,
    } = req.body;

    const template = await prisma.sessionTemplate.create({
      data: {
        name,
        description: description || null,
        ownerDeviceId,
        maxPlayers: maxPlayers || 20,
        courtCount: courtCount || 1,
        skillLevel: skillLevel || null,
        location: location || null,
        cost: cost || null,
        scoringSystem: scoringSystem || '21_POINT',
        bestOfGames: bestOfGames || 3,
        restPeriod: restPeriod || 1,
      },
    });

    res.json({
      success: true,
      data: { template },
      message: 'Template created',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create template' },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Delete a template
 * DELETE /session-templates/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.sessionTemplate.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Template deleted',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete template' },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
