import { Equipment, EquipmentReservation, EquipmentMaintenance, EquipmentSearchFilters, EquipmentReservationRequest, EquipmentReturnRequest, EquipmentUsageStats, EquipmentInventory, EquipmentNotification, MaintenanceStatus } from '../types/equipment';
export declare class EquipmentService {
    /**
     * Create new equipment item
     */
    static createEquipment(data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Equipment>;
    /**
     * Get equipment by ID
     */
    static getEquipmentById(id: string): Promise<Equipment | null>;
    /**
     * Search and filter equipment
     */
    static searchEquipment(filters: EquipmentSearchFilters): Promise<Equipment[]>;
    /**
     * Update equipment
     */
    static updateEquipment(id: string, data: Partial<Equipment>): Promise<Equipment>;
    /**
     * Delete equipment
     */
    static deleteEquipment(id: string): Promise<void>;
    /**
     * Create equipment reservation
     */
    static createReservation(request: EquipmentReservationRequest, userId: string): Promise<EquipmentReservation>;
    /**
     * Approve or reject reservation
     */
    static processReservation(reservationId: string, approved: boolean, approvedBy: string): Promise<EquipmentReservation>;
    /**
     * Checkout equipment (convert approved reservation to active)
     */
    static checkoutEquipment(reservationId: string, checkedOutBy: string): Promise<EquipmentReservation>;
    /**
     * Return equipment
     */
    static returnEquipment(request: EquipmentReturnRequest, returnedBy: string): Promise<EquipmentReservation>;
    /**
     * Get equipment inventory status
     */
    static getEquipmentInventory(equipmentId: string): Promise<EquipmentInventory>;
    /**
     * Get equipment usage statistics
     */
    static getEquipmentUsageStats(equipmentId: string, startDate: Date, endDate: Date): Promise<EquipmentUsageStats>;
    /**
     * Create maintenance record
     */
    static createMaintenance(equipmentId: string, maintenanceData: Omit<EquipmentMaintenance, 'id' | 'equipmentId' | 'createdAt' | 'updatedAt'>): Promise<EquipmentMaintenance>;
    /**
     * Update maintenance status
     */
    static updateMaintenanceStatus(maintenanceId: string, status: MaintenanceStatus, completedBy?: string): Promise<EquipmentMaintenance>;
    /**
     * Create notification
     */
    static createNotification(notification: Omit<EquipmentNotification, 'id' | 'createdAt'>): Promise<EquipmentNotification>;
    /**
     * Get user notifications
     */
    static getUserNotifications(userId: string, unreadOnly?: boolean): Promise<EquipmentNotification[]>;
    /**
     * Mark notification as read
     */
    static markNotificationRead(notificationId: string): Promise<void>;
    private static checkReservationConflicts;
    private static updateEquipmentAvailableQuantity;
    private static updateEquipmentStatus;
}
//# sourceMappingURL=equipmentService.d.ts.map