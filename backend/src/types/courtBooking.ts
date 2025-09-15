// Court Booking Types for Backend

export interface Court {
  id: string;
  venueId: string;
  name: string;
  courtNumber: number;
  type: 'INDOOR' | 'OUTDOOR' | 'COVERED';
  surface: 'WOOD' | 'SYNTHETIC' | 'CARPET' | 'CONCRETE' | 'RUBBER';
  maxPlayers: number;
  hourlyRate: number;
  currency: string;
  isActive: boolean;
  amenities: string[];
  description?: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
  operatingHours: OperatingHours;
  amenities: string[];
  images: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatingHours {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

export interface TimeSlot {
  open: string; // HH:MM format
  close: string; // HH:MM format
  isPeakHour: boolean;
  peakHourMultiplier: number;
}

export interface CourtBooking {
  id: string;
  courtId: string;
  userId: string;
  bookingDate: Date;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  duration: number; // in minutes
  totalAmount: number;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  paymentStatus: 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
  players: string[]; // Array of user IDs
  isRecurring: boolean;
  recurringPattern?: RecurringPattern;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringPattern {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number; // Every N days/weeks/months
  endDate: Date;
  daysOfWeek?: number[]; // For weekly: [1,3,5] for Mon, Wed, Fri
}

export interface CourtMaintenance {
  id: string;
  courtId: string;
  title: string;
  description?: string;
  maintenanceType: 'ROUTINE' | 'REPAIR' | 'DEEP_CLEAN' | 'EQUIPMENT' | 'EMERGENCY';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  scheduledDate: Date;
  startTime: string;
  endTime: string;
  duration: number;
  assignedTo?: string; // User ID of maintenance person
  cost?: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourtAvailability {
  courtId: string;
  date: Date;
  timeSlots: TimeSlotAvailability[];
}

export interface TimeSlotAvailability {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  bookingId?: string; // If booked
  maintenanceId?: string; // If under maintenance
  price: number;
  isPeakHour: boolean;
}

export interface BookingRequest {
  courtId: string;
  bookingDate: Date;
  startTime: string;
  duration: number;
  players: string[];
  notes?: string;
  paymentMethod?: string;
}

export interface BookingConflict {
  type: 'DOUBLE_BOOKING' | 'MAINTENANCE' | 'OPERATING_HOURS' | 'PLAYER_CONFLICT';
  message: string;
  conflictingBookingId?: string;
  conflictingMaintenanceId?: string;
  suggestedAlternatives?: TimeSlotAvailability[];
}

export interface CourtSearchFilters {
  venueId?: string;
  courtType?: ('INDOOR' | 'OUTDOOR' | 'COVERED')[];
  surface?: ('WOOD' | 'SYNTHETIC' | 'CARPET' | 'CONCRETE' | 'RUBBER')[];
  maxPlayers?: number;
  priceRange?: {
    min: number;
    max: number;
  };
  amenities?: string[];
  date?: Date;
  timeRange?: {
    start: string;
    end: string;
  };
  availableOnly?: boolean;
}

export interface CourtStats {
  courtId: string;
  totalBookings: number;
  totalRevenue: number;
  averageBookingDuration: number;
  peakHours: string[];
  utilizationRate: number;
  popularTimes: string[];
  cancellationRate: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface VenueStats {
  venueId: string;
  totalCourts: number;
  activeCourts: number;
  totalBookings: number;
  totalRevenue: number;
  averageUtilization: number;
  topCourts: {
    courtId: string;
    bookings: number;
    revenue: number;
  }[];
  period: {
    start: Date;
    end: Date;
  };
}