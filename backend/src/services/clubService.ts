import { prisma } from '../config/database';

export interface CreateClubInput {
  name: string;
  description?: string;
  location?: string;
  sportTypes: string[];
  ownerDeviceId: string;
  ownerName: string;
  contactEmail?: string;
  contactPhone?: string;
  wechatGroup?: string;
  logoUrl?: string;
  isPublic?: boolean;
}

export interface ClubWithStats {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  sportTypes: string[];
  memberCount: number;
  sessionCount: number;
  upcomingSessions: number;
  logoUrl: string | null;
  isPublic: boolean;
  ownerDeviceId: string;
}

/**
 * Create a new club. Creator becomes first admin + member.
 */
export async function createClub(input: CreateClubInput) {
  return prisma.$transaction(async (tx) => {
    const club = await tx.club.create({
      data: {
        name: input.name,
        description: input.description || null,
        location: input.location || null,
        sportTypes: input.sportTypes,
        ownerDeviceId: input.ownerDeviceId,
        adminIds: [input.ownerDeviceId],
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        wechatGroup: input.wechatGroup || null,
        logoUrl: input.logoUrl || null,
        isPublic: input.isPublic ?? true,
      },
    });

    await tx.clubMember.create({
      data: {
        clubId: club.id,
        deviceId: input.ownerDeviceId,
        name: input.ownerName,
        role: 'ADMIN',
      },
    });

    return club;
  });
}

/**
 * Get club with stats.
 */
export async function getClub(clubId: string): Promise<ClubWithStats | null> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      members: true,
      sessions: { where: { status: 'ACTIVE' }, orderBy: { scheduledAt: 'asc' } },
    },
  });

  if (!club) return null;

  return {
    id: club.id,
    name: club.name,
    description: club.description,
    location: club.location,
    sportTypes: club.sportTypes,
    memberCount: club.members.length,
    sessionCount: await prisma.mvpSession.count({ where: { clubId } }),
    upcomingSessions: club.sessions.length,
    logoUrl: club.logoUrl,
    isPublic: club.isPublic,
    ownerDeviceId: club.ownerDeviceId,
  };
}

/**
 * List clubs for a device (clubs they own or belong to).
 */
export async function getMyClubs(deviceId: string) {
  const memberships = await prisma.clubMember.findMany({
    where: { deviceId },
    include: {
      club: {
        include: {
          members: { select: { id: true } },
          sessions: { where: { status: 'ACTIVE' }, select: { id: true } },
        },
      },
    },
  });

  return memberships.map(m => ({
    id: m.club.id,
    name: m.club.name,
    role: m.role,
    location: m.club.location,
    sportTypes: m.club.sportTypes,
    memberCount: m.club.members.length,
    upcomingSessions: m.club.sessions.length,
    logoUrl: m.club.logoUrl,
    isOwner: m.club.ownerDeviceId === deviceId,
  }));
}

/**
 * Discover public clubs.
 */
export async function discoverClubs(sport?: string, limit = 20) {
  const whereClause: any = { isPublic: true };
  if (sport) whereClause.sportTypes = { has: sport };

  const clubs = await prisma.club.findMany({
    where: whereClause,
    include: {
      members: { select: { id: true } },
      sessions: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return clubs.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    location: c.location,
    sportTypes: c.sportTypes,
    memberCount: c.members.length,
    upcomingSessions: c.sessions.length,
    logoUrl: c.logoUrl,
  }));
}

/**
 * Join a club.
 */
export async function joinClub(clubId: string, deviceId: string, name: string) {
  const existing = await prisma.clubMember.findUnique({
    where: { clubId_deviceId: { clubId, deviceId } },
  });
  if (existing) throw new Error('Already a member');

  return prisma.clubMember.create({
    data: { clubId, deviceId, name, role: 'MEMBER' },
  });
}

/**
 * Create a club session — auto-adds all club members as PENDING.
 */
export async function createClubSession(
  clubId: string,
  sessionData: {
    name: string;
    dateTime: string;
    location?: string;
    maxPlayers?: number;
    organizerName: string;
    ownerDeviceId?: string;
    costModel?: string;
    cost?: number;
    birdieProvidedBy?: string;
  },
) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: { members: true },
  });

  if (!club) throw new Error('Club not found');

  // Create session with club affiliation
  const shareCode = generateShareCode();
  const session = await prisma.mvpSession.create({
    data: {
      name: sessionData.name,
      scheduledAt: new Date(sessionData.dateTime),
      location: sessionData.location || club.location,
      maxPlayers: sessionData.maxPlayers || 20,
      ownerName: sessionData.organizerName,
      ownerDeviceId: sessionData.ownerDeviceId || club.ownerDeviceId,
      shareCode,
      status: 'ACTIVE',
      clubId,
      clubAffiliation: club.name,
      costModel: sessionData.costModel || 'SPLIT_EVENLY',
      cost: sessionData.cost || null,
      birdieProvidedBy: sessionData.birdieProvidedBy || null,
      visibility: club.isPublic ? 'public' : 'club',
      sport: club.sportTypes[0] || 'badminton',
    },
  });

  // Add organizer as first ACTIVE player
  await prisma.mvpPlayer.create({
    data: {
      sessionId: session.id,
      name: sessionData.organizerName,
      deviceId: sessionData.ownerDeviceId || club.ownerDeviceId,
      status: 'ACTIVE',
      role: 'ORGANIZER',
    },
  });

  // Auto-add all other club members as PENDING
  const otherMembers = club.members.filter(
    m => m.deviceId !== (sessionData.ownerDeviceId || club.ownerDeviceId),
  );

  if (otherMembers.length > 0) {
    await prisma.mvpPlayer.createMany({
      data: otherMembers.map(m => ({
        sessionId: session.id,
        name: m.name,
        deviceId: m.deviceId,
        status: 'PENDING' as const,
        role: 'PLAYER' as const,
      })),
    });
  }

  return session;
}

function generateShareCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
