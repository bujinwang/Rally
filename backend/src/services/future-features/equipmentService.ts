import {
  Equipment,
  EquipmentReservation,
  EquipmentMaintenance,
  EquipmentSearchFilters,
  EquipmentReservationRequest,
  EquipmentCheckoutRequest,
  EquipmentReturnRequest,
  EquipmentUsageStats,
  EquipmentInventory,
  EquipmentNotification,
  EquipmentReport,
  EquipmentCondition,
  EquipmentStatus,
  ReservationStatus,
  MaintenanceStatus,
  NotificationType,
  NotificationPriority,
  ReportType,
} from '../types/equipment';

// Temporary in-memory storage until Prisma client is generated
const equipmentStore: Equipment[] = [];
const reservationStore: EquipmentReservation[] = [];
const maintenanceStore: EquipmentMaintenance[] = [];
const notificationStore: EquipmentNotification[] = [];

// Helper function to generate IDs
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class EquipmentService {
  /**
   * Create new equipment item
   */
  static async createEquipment(data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Equipment> {
    try {
      const equipment: Equipment = {
        id: `eq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...data,
        availableQuantity: data.quantity, // Initially all items are available
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      equipmentStore.push(equipment);
      return equipment;
    } catch (error) {
      console.error('Error creating equipment:', error);
      throw new Error('Failed to create equipment');
    }
  }

  /**
   * Get equipment by ID
   */
  static async getEquipmentById(id: string): Promise<Equipment | null> {
    try {
      const equipment = equipmentStore.find(eq => eq.id === id);
      if (!equipment) return null;

      // Add related data
      const reservations = reservationStore
        .filter(res => res.equipmentId === id && ['PENDING', 'APPROVED', 'ACTIVE'].includes(res.status))
        .sort((a, b) => b.reservedAt.getTime() - a.reservedAt.getTime());

      const maintenance = maintenanceStore
        .filter(maint => maint.equipmentId === id && ['SCHEDULED', 'IN_PROGRESS'].includes(maint.status))
        .sort((a, b) => (b.scheduledDate?.getTime() || 0) - (a.scheduledDate?.getTime() || 0));

      return equipment;
    } catch (error) {
      console.error('Error fetching equipment:', error);
      throw new Error('Failed to fetch equipment');
    }
  }

  /**
   * Search and filter equipment
   */
  static async searchEquipment(filters: EquipmentSearchFilters): Promise<Equipment[]> {
    try {
      const where: any = {};

      // Category filter
      if (filters.category?.length) {
        where.category = { in: filters.category };
      }

      // Type filter
      if (filters.type?.length) {
        where.type = { in: filters.type };
      }

      // Status filter
      if (filters.status?.length) {
        where.status = { in: filters.status };
      }

      // Condition filter
      if (filters.condition?.length) {
        where.condition = { in: filters.condition };
      }

      // Location filter
      if (filters.location) {
        where.location = { contains: filters.location, mode: 'insensitive' };
      }

      // Venue filter
      if (filters.venueId) {
        where.venueId = filters.venueId;
      }

      // Available only filter
      if (filters.availableOnly) {
        where.availableQuantity = { gt: 0 };
        where.status = 'AVAILABLE';
      }

      // Maintenance filter
      if (filters.requiresMaintenance !== undefined) {
        where.requiresMaintenance = filters.requiresMaintenance;
      }

      // Brand filter
      if (filters.brand) {
        where.brand = { contains: filters.brand, mode: 'insensitive' };
      }

      // Tags filter
      if (filters.tags?.length) {
        where.tags = { hasSome: filters.tags };
      }

      // Price range filter
      if (filters.priceRange) {
        where.purchasePrice = {
          gte: filters.priceRange.min,
          lte: filters.priceRange.max,
        };
      }

      // Date range filter
      if (filters.dateRange) {
        where.createdAt = {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end,
        };
      }

      const equipment = await prisma.equipment.findMany({
        where,
        include: {
          reservations: {
            where: {
              status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] }
            },
            orderBy: { reservedAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return equipment as Equipment[];
    } catch (error) {
      console.error('Error searching equipment:', error);
      throw new Error('Failed to search equipment');
    }
  }

  /**
   * Update equipment
   */
  static async updateEquipment(id: string, data: Partial<Equipment>): Promise<Equipment> {
    try {
      const updatedEquipment = await prisma.equipment.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      return updatedEquipment as Equipment;
    } catch (error) {
      console.error('Error updating equipment:', error);
      throw new Error('Failed to update equipment');
    }
  }

  /**
   * Delete equipment
   */
  static async deleteEquipment(id: string): Promise<void> {
    try {
      // Check for active reservations
      const activeReservations = await prisma.equipmentReservation.count({
        where: {
          equipmentId: id,
          status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] }
        }
      });

      if (activeReservations > 0) {
        throw new Error('Cannot delete equipment with active reservations');
      }

      await prisma.equipment.delete({
        where: { id },
      });
    } catch (error) {
      console.error('Error deleting equipment:', error);
      throw error;
    }
  }

  /**
   * Create equipment reservation
   */
  static async createReservation(request: EquipmentReservationRequest, userId: string): Promise<EquipmentReservation> {
    try {
      // Validate equipment exists and is available
      const equipment = await this.getEquipmentById(request.equipmentId);
      if (!equipment) {
        throw new Error('Equipment not found');
      }

      if (equipment.availableQuantity < request.quantity) {
        throw new Error('Insufficient equipment quantity available');
      }

      // Check for conflicting reservations
      const conflicts = await this.checkReservationConflicts(
        request.equipmentId,
        request.reservedUntil
      );

      if (conflicts.length > 0) {
        throw new Error('Equipment reservation conflict detected');
      }

      // Create reservation
      const reservation = await prisma.equipmentReservation.create({
        data: {
          equipmentId: request.equipmentId,
          userId,
          quantity: request.quantity,
          reservedUntil: request.reservedUntil,
          purpose: request.purpose,
          notes: request.notes,
          status: 'PENDING', // Requires approval
        },
      });

      // Update equipment available quantity
      await this.updateEquipmentAvailableQuantity(request.equipmentId);

      // Create notification for approval
      await this.createNotification({
        userId: userId, // Notify the requester
        equipmentId: request.equipmentId,
        type: NotificationType.RESERVATION_APPROVED, // Will be updated based on approval
        title: 'Reservation Request Submitted',
        message: `Your reservation request for ${equipment.name} has been submitted and is pending approval.`,
        priority: NotificationPriority.MEDIUM,
        read: false,
        actionRequired: false,
      });

      return reservation as EquipmentReservation;
    } catch (error) {
      console.error('Error creating reservation:', error);
      throw error;
    }
  }

  /**
   * Approve or reject reservation
   */
  static async processReservation(reservationId: string, approved: boolean, approvedBy: string): Promise<EquipmentReservation> {
    try {
      const reservation = await prisma.equipmentReservation.findUnique({
        where: { reservationId },
        include: { equipment: true }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      const newStatus = approved ? 'APPROVED' : 'CANCELLED';

      const updatedReservation = await prisma.equipmentReservation.update({
        where: { id: reservationId },
        data: {
          status: newStatus,
          approvedBy,
          approvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Update equipment available quantity
      await this.updateEquipmentAvailableQuantity(reservation.equipmentId);

      // Create notification
      const notificationType = approved ? 'RESERVATION_APPROVED' : 'RESERVATION_REJECTED';
      const title = approved ? 'Reservation Approved' : 'Reservation Rejected';
      const message = approved
        ? `Your reservation for ${reservation.equipment.name} has been approved.`
        : `Your reservation for ${reservation.equipment.name} has been rejected.`;

      await this.createNotification({
        userId: reservation.userId,
        equipmentId: reservation.equipmentId,
        reservationId: reservation.id,
        type: notificationType,
        title,
        message,
        priority: approved ? 'MEDIUM' : 'HIGH',
      });

      return updatedReservation as EquipmentReservation;
    } catch (error) {
      console.error('Error processing reservation:', error);
      throw error;
    }
  }

  /**
   * Checkout equipment (convert approved reservation to active)
   */
  static async checkoutEquipment(reservationId: string, checkedOutBy: string): Promise<EquipmentReservation> {
    try {
      const reservation = await prisma.equipmentReservation.findUnique({
        where: { id: reservationId },
        include: { equipment: true }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.status !== 'APPROVED') {
        throw new Error('Only approved reservations can be checked out');
      }

      const updatedReservation = await prisma.equipmentReservation.update({
        where: { id: reservationId },
        data: {
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      });

      // Update equipment status
      await this.updateEquipmentStatus(reservation.equipmentId);

      return updatedReservation as EquipmentReservation;
    } catch (error) {
      console.error('Error checking out equipment:', error);
      throw error;
    }
  }

  /**
   * Return equipment
   */
  static async returnEquipment(request: EquipmentReturnRequest, returnedBy: string): Promise<EquipmentReservation> {
    try {
      const reservation = await prisma.equipmentReservation.findUnique({
        where: { id: request.reservationId },
        include: { equipment: true }
      });

      if (!reservation) {
        throw new Error('Reservation not found');
      }

      if (reservation.status !== 'ACTIVE') {
        throw new Error('Only active reservations can be returned');
      }

      const updatedReservation = await prisma.equipmentReservation.update({
        where: { id: request.reservationId },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnCondition: request.returnCondition,
          returnNotes: request.returnNotes,
          updatedAt: new Date(),
        },
      });

      // Update equipment condition if damaged
      if (request.returnCondition === 'DAMAGED' || request.returnCondition === 'POOR') {
        await this.updateEquipment(reservation.equipmentId, {
          condition: request.returnCondition,
          status: 'MAINTENANCE',
        });
      }

      // Update equipment available quantity and status
      await this.updateEquipmentAvailableQuantity(reservation.equipmentId);
      await this.updateEquipmentStatus(reservation.equipmentId);

      // Create notification
      await this.createNotification({
        userId: reservation.userId,
        equipmentId: reservation.equipmentId,
        reservationId: reservation.id,
        type: 'EQUIPMENT_RETURN_REMINDER',
        title: 'Equipment Returned',
        message: `Your equipment ${reservation.equipment.name} has been returned successfully.`,
        priority: 'LOW',
      });

      return updatedReservation as EquipmentReservation;
    } catch (error) {
      console.error('Error returning equipment:', error);
      throw error;
    }
  }

  /**
   * Get equipment inventory status
   */
  static async getEquipmentInventory(equipmentId: string): Promise<EquipmentInventory> {
    try {
      const equipment = await this.getEquipmentById(equipmentId);
      if (!equipment) {
        throw new Error('Equipment not found');
      }

      const reservations = await prisma.equipmentReservation.findMany({
        where: {
          equipmentId,
          status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] }
        }
      });

      const reservedQuantity = reservations.reduce((sum, res) => sum + res.quantity, 0);
      const checkedOutQuantity = reservations
        .filter(res => res.status === 'ACTIVE')
        .reduce((sum, res) => sum + res.quantity, 0);

      const maintenanceCount = await prisma.equipmentMaintenance.count({
        where: {
          equipmentId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
        }
      });

      return {
        equipmentId,
        totalQuantity: equipment.quantity,
        availableQuantity: equipment.availableQuantity,
        reservedQuantity,
        checkedOutQuantity,
        maintenanceQuantity: maintenanceCount,
        lostQuantity: equipment.quantity - equipment.availableQuantity - reservedQuantity - checkedOutQuantity - maintenanceCount,
        lastUpdated: equipment.updatedAt,
      };
    } catch (error) {
      console.error('Error getting equipment inventory:', error);
      throw error;
    }
  }

  /**
   * Get equipment usage statistics
   */
  static async getEquipmentUsageStats(
    equipmentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<EquipmentUsageStats> {
    try {
      const reservations = await prisma.equipmentReservation.findMany({
        where: {
          equipmentId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: ['RETURNED', 'ACTIVE'] }
        },
        include: {
          equipment: true,
        }
      });

      const totalReservations = reservations.length;
      const totalUsageHours = reservations.reduce((sum, res) => {
        const duration = res.returnedAt
          ? (res.returnedAt.getTime() - res.reservedAt.getTime()) / (1000 * 60 * 60)
          : (new Date().getTime() - res.reservedAt.getTime()) / (1000 * 60 * 60);
        return sum + duration;
      }, 0);

      const averageUsagePerReservation = totalReservations > 0
        ? totalUsageHours / totalReservations
        : 0;

      // Calculate utilization rate
      const equipment = await this.getEquipmentById(equipmentId);
      const totalPossibleHours = equipment ? equipment.quantity * ((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)) : 0;
      const utilizationRate = totalPossibleHours > 0 ? (totalUsageHours / totalPossibleHours) * 100 : 0;

      return {
        equipmentId,
        totalReservations,
        totalUsageHours,
        averageUsagePerReservation,
        peakUsageTimes: [], // Would need more complex analysis
        mostUsedBy: [], // Would need user analysis
        maintenanceFrequency: 0, // Would need maintenance data
        averageLifespan: 0, // Would need lifecycle data
        utilizationRate,
        period: { start: startDate, end: endDate },
      };
    } catch (error) {
      console.error('Error getting equipment usage stats:', error);
      throw error;
    }
  }

  /**
   * Create maintenance record
   */
  static async createMaintenance(
    equipmentId: string,
    maintenanceData: Omit<EquipmentMaintenance, 'id' | 'equipmentId' | 'createdAt' | 'updatedAt'>
  ): Promise<EquipmentMaintenance> {
    try {
      const maintenance = await prisma.equipmentMaintenance.create({
        data: {
          equipmentId,
          ...maintenanceData,
        },
      });

      // Update equipment maintenance status
      await this.updateEquipment(equipmentId, {
        requiresMaintenance: true,
        lastMaintenanceDate: maintenance.completedDate || new Date(),
        nextMaintenanceDate: maintenanceData.scheduledDate,
      });

      // Create notification
      await this.createNotification({
        userId: maintenanceData.performedBy || 'system',
        equipmentId,
        type: 'MAINTENANCE_DUE',
        title: 'Maintenance Scheduled',
        message: `Maintenance scheduled for equipment: ${maintenance.description}`,
        priority: 'MEDIUM',
      });

      return maintenance as EquipmentMaintenance;
    } catch (error) {
      console.error('Error creating maintenance:', error);
      throw error;
    }
  }

  /**
   * Update maintenance status
   */
  static async updateMaintenanceStatus(
    maintenanceId: string,
    status: MaintenanceStatus,
    completedBy?: string
  ): Promise<EquipmentMaintenance> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'COMPLETED') {
        updateData.completedDate = new Date();
        if (completedBy) {
          updateData.performedBy = completedBy;
        }
      }

      const maintenance = await prisma.equipmentMaintenance.update({
        where: { id: maintenanceId },
        data: updateData,
      });

      // Update equipment status if maintenance is completed
      if (status === 'COMPLETED') {
        await this.updateEquipment(maintenance.equipmentId, {
          requiresMaintenance: false,
          status: 'AVAILABLE',
        });
      }

      return maintenance as EquipmentMaintenance;
    } catch (error) {
      console.error('Error updating maintenance status:', error);
      throw error;
    }
  }

  /**
   * Create notification
   */
  static async createNotification(notification: Omit<EquipmentNotification, 'id' | 'createdAt'>): Promise<EquipmentNotification> {
    try {
      const newNotification = await prisma.equipmentNotification.create({
        data: notification,
      });

      return newNotification as EquipmentNotification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(userId: string, unreadOnly = false): Promise<EquipmentNotification[]> {
    try {
      const where: any = { userId };
      if (unreadOnly) {
        where.read = false;
      }

      const notifications = await prisma.equipmentNotification.findMany({
        where,
        include: {
          reservation: {
            include: {
              equipment: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return notifications as EquipmentNotification[];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markNotificationRead(notificationId: string): Promise<void> {
    try {
      await prisma.equipmentNotification.update({
        where: { id: notificationId },
        data: {
          read: true,
          readAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Private helper methods

  private static async checkReservationConflicts(equipmentId: string, endDate: Date): Promise<EquipmentReservation[]> {
    try {
      const conflicts = await prisma.equipmentReservation.findMany({
        where: {
          equipmentId,
          status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] },
          reservedUntil: { gte: new Date() }, // Only future reservations
          OR: [
            {
              reservedAt: { lte: endDate },
              reservedUntil: { gte: new Date() }
            }
          ]
        }
      });

      return conflicts as EquipmentReservation[];
    } catch (error) {
      console.error('Error checking reservation conflicts:', error);
      throw error;
    }
  }

  private static async updateEquipmentAvailableQuantity(equipmentId: string): Promise<void> {
    try {
      const equipment = await this.getEquipmentById(equipmentId);
      if (!equipment) return;

      const activeReservations = await prisma.equipmentReservation.count({
        where: {
          equipmentId,
          status: { in: ['PENDING', 'APPROVED', 'ACTIVE'] }
        }
      });

      const availableQuantity = Math.max(0, equipment.quantity - activeReservations);

      await this.updateEquipment(equipmentId, { availableQuantity });
    } catch (error) {
      console.error('Error updating equipment available quantity:', error);
      throw error;
    }
  }

  private static async updateEquipmentStatus(equipmentId: string): Promise<void> {
    try {
      const equipment = await this.getEquipmentById(equipmentId);
      if (!equipment) return;

      let newStatus: EquipmentStatus = 'AVAILABLE';

      // Check if equipment is under maintenance
      const activeMaintenance = await prisma.equipmentMaintenance.count({
        where: {
          equipmentId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] }
        }
      });

      if (activeMaintenance > 0) {
        newStatus = 'MAINTENANCE';
      } else if (equipment.availableQuantity === 0) {
        newStatus = 'CHECKED_OUT';
      } else if (equipment.availableQuantity < equipment.quantity) {
        newStatus = 'RESERVED';
      }

      if (newStatus !== equipment.status) {
        await this.updateEquipment(equipmentId, { status: newStatus });
      }
    } catch (error) {
      console.error('Error updating equipment status:', error);
      throw error;
    }
  }
}