import { Router, Request, Response } from 'express';
import { EquipmentService } from '../services/equipmentService';
import { EquipmentSearchFilters, EquipmentReservationRequest, EquipmentReturnRequest } from '../types/equipment';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/equipment - Get all equipment with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: EquipmentSearchFilters = {
      category: req.query.category ? [req.query.category as string] : undefined,
      type: req.query.type ? [req.query.type as string] : undefined,
      status: req.query.status ? [req.query.status as string] : undefined,
      condition: req.query.condition ? [req.query.condition as string] : undefined,
      location: req.query.location as string,
      venueId: req.query.venueId as string,
      availableOnly: req.query.availableOnly === 'true',
      requiresMaintenance: req.query.requiresMaintenance === 'true',
      brand: req.query.brand as string,
      tags: req.query.tags ? [req.query.tags as string] : undefined,
    };

    const equipment = await EquipmentService.searchEquipment(filters);
    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch equipment' });
  }
});

// GET /api/equipment/:id - Get equipment by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const equipment = await EquipmentService.getEquipmentById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, error: 'Equipment not found' });
    }
    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch equipment' });
  }
});

// POST /api/equipment - Create new equipment
router.post('/', async (req: Request, res: Response) => {
  try {
    const equipmentData = req.body;
    const equipment = await EquipmentService.createEquipment(equipmentData);
    res.status(201).json({ success: true, data: equipment });
  } catch (error) {
    console.error('Error creating equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to create equipment' });
  }
});

// PUT /api/equipment/:id - Update equipment
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const equipment = await EquipmentService.updateEquipment(req.params.id, req.body);
    res.json({ success: true, data: equipment });
  } catch (error) {
    console.error('Error updating equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to update equipment' });
  }
});

// DELETE /api/equipment/:id - Delete equipment
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await EquipmentService.deleteEquipment(req.params.id);
    res.json({ success: true, message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to delete equipment' });
  }
});

// POST /api/equipment/:id/reserve - Create equipment reservation
router.post('/:id/reserve', async (req: Request, res: Response) => {
  try {
    const reservationRequest: EquipmentReservationRequest = {
      equipmentId: req.params.id,
      quantity: req.body.quantity || 1,
      reservedUntil: new Date(req.body.reservedUntil),
      purpose: req.body.purpose,
      notes: req.body.notes,
    };

    const reservation = await EquipmentService.createReservation(reservationRequest, req.body.userId);
    res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to create reservation' });
  }
});

// PUT /api/equipment/reservations/:reservationId/approve - Approve reservation
router.put('/reservations/:reservationId/approve', async (req: Request, res: Response) => {
  try {
    const reservation = await EquipmentService.processReservation(req.params.reservationId, true, req.body.approvedBy);
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error('Error approving reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to approve reservation' });
  }
});

// PUT /api/equipment/reservations/:reservationId/reject - Reject reservation
router.put('/reservations/:reservationId/reject', async (req: Request, res: Response) => {
  try {
    const reservation = await EquipmentService.processReservation(req.params.reservationId, false, req.body.approvedBy);
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error('Error rejecting reservation:', error);
    res.status(500).json({ success: false, error: 'Failed to reject reservation' });
  }
});

// PUT /api/equipment/reservations/:reservationId/checkout - Checkout equipment
router.put('/reservations/:reservationId/checkout', async (req: Request, res: Response) => {
  try {
    const reservation = await EquipmentService.checkoutEquipment(req.params.reservationId, req.body.checkedOutBy);
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error('Error checking out equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to checkout equipment' });
  }
});

// PUT /api/equipment/reservations/:reservationId/return - Return equipment
router.put('/reservations/:reservationId/return', async (req: Request, res: Response) => {
  try {
    const returnRequest: EquipmentReturnRequest = {
      reservationId: req.params.reservationId,
      returnCondition: req.body.returnCondition,
      returnNotes: req.body.returnNotes,
    };

    const reservation = await EquipmentService.returnEquipment(returnRequest, req.body.returnedBy);
    res.json({ success: true, data: reservation });
  } catch (error) {
    console.error('Error returning equipment:', error);
    res.status(500).json({ success: false, error: 'Failed to return equipment' });
  }
});

// GET /api/equipment/:id/inventory - Get equipment inventory
router.get('/:id/inventory', async (req: Request, res: Response) => {
  try {
    const inventory = await EquipmentService.getEquipmentInventory(req.params.id);
    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory' });
  }
});

// GET /api/equipment/:id/stats - Get equipment usage statistics
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const stats = await EquipmentService.getEquipmentUsageStats(req.params.id, startDate, endDate);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching equipment stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch equipment stats' });
  }
});

// POST /api/equipment/:id/maintenance - Create maintenance record
router.post('/:id/maintenance', async (req: Request, res: Response) => {
  try {
    const maintenanceData = {
      equipmentId: req.params.id,
      maintenanceType: req.body.maintenanceType,
      description: req.body.description,
      priority: req.body.priority || 'MEDIUM',
      scheduledDate: req.body.scheduledDate ? new Date(req.body.scheduledDate) : undefined,
      performedBy: req.body.performedBy,
      notes: req.body.notes,
      status: 'SCHEDULED',
    };

    const maintenance = await EquipmentService.createMaintenance(req.params.id, maintenanceData);
    res.status(201).json({ success: true, data: maintenance });
  } catch (error) {
    console.error('Error creating maintenance:', error);
    res.status(500).json({ success: false, error: 'Failed to create maintenance' });
  }
});

// PUT /api/equipment/maintenance/:maintenanceId/complete - Complete maintenance
router.put('/maintenance/:maintenanceId/complete', async (req: Request, res: Response) => {
  try {
    const maintenance = await EquipmentService.updateMaintenanceStatus(
      req.params.maintenanceId,
      'COMPLETED',
      req.body.completedBy
    );
    res.json({ success: true, data: maintenance });
  } catch (error) {
    console.error('Error completing maintenance:', error);
    res.status(500).json({ success: false, error: 'Failed to complete maintenance' });
  }
});

// GET /api/equipment/notifications - Get user notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId; // This should come from authenticated user
    const unreadOnly = req.query.unreadOnly === 'true';
    const notifications = await EquipmentService.getUserNotifications(userId, unreadOnly);
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// PUT /api/equipment/notifications/:notificationId/read - Mark notification as read
router.put('/notifications/:notificationId/read', async (req: Request, res: Response) => {
  try {
    await EquipmentService.markNotificationRead(req.params.notificationId);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
});

export default router;