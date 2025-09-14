import { PrismaClient, MvpPlayer, MvpSession } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreatePlayerData {
  sessionId: string;
  name: string;
  deviceId?: string;
}

export interface UpdatePlayerStatusData {
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
}

export interface RestManagementData {
  gamesCount: number;
  requestedBy: string;
}

export class MvpPlayerService {
  /**
   * Create a new player and add to session
   */
  static async createPlayer(data: CreatePlayerData): Promise<MvpPlayer> {
    try {
      // Check if session exists and is active
      const session = await prisma.mvpSession.findUnique({
        where: { id: data.sessionId }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Cannot join inactive session');
      }

      // Check if session is full
      const playerCount = await prisma.mvpPlayer.count({
        where: { sessionId: data.sessionId }
      });

      if (playerCount >= session.maxPlayers) {
        throw new Error('Session is full');
      }

      // Check for duplicate name in session
      const existingPlayer = await prisma.mvpPlayer.findFirst({
        where: {
          sessionId: data.sessionId,
          name: { equals: data.name, mode: 'insensitive' }
        }
      });

      if (existingPlayer) {
        throw new Error('Player with this name already exists in the session');
      }

      // Check for duplicate device in session
      if (data.deviceId) {
        const existingDevice = await prisma.mvpPlayer.findFirst({
          where: {
            sessionId: data.sessionId,
            deviceId: data.deviceId
          }
        });

        if (existingDevice) {
          throw new Error('This device is already registered for this session');
        }
      }

      const player = await prisma.mvpPlayer.create({
        data: {
          sessionId: data.sessionId,
          name: data.name.trim(),
          deviceId: data.deviceId,
          status: 'ACTIVE'
        }
      });

      return player;
    } catch (error) {
      console.error('Error creating player:', error);
      throw error;
    }
  }

  /**
   * Get player by ID with session info
   */
  static async getPlayerById(playerId: string): Promise<MvpPlayer | null> {
    try {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId },
        include: {
          session: {
            select: {
              id: true,
              name: true,
              shareCode: true,
              status: true,
              ownerName: true
            }
          }
        }
      });

      return player;
    } catch (error) {
      console.error('Error fetching player by ID:', error);
      throw new Error('Failed to fetch player');
    }
  }

  /**
   * Get all players in a session
   */
  static async getPlayersBySession(sessionId: string): Promise<MvpPlayer[]> {
    try {
      const players = await prisma.mvpPlayer.findMany({
        where: { sessionId },
        orderBy: { joinedAt: 'asc' }
      });

      return players;
    } catch (error) {
      console.error('Error fetching players by session:', error);
      throw new Error('Failed to fetch session players');
    }
  }

  /**
   * Update player status
   */
  static async updatePlayerStatus(playerId: string, data: UpdatePlayerStatusData, deviceId?: string): Promise<MvpPlayer> {
    try {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId },
        include: { session: true }
      });

      if (!player) {
        throw new Error('Player not found');
      }

      // Check authorization - either the player themselves or session owner
      const isOwner = player.session.ownerDeviceId === deviceId;
      const isPlayerThemselves = player.deviceId === deviceId;

      if (!isOwner && !isPlayerThemselves) {
        throw new Error('Unauthorized: Only the player or session owner can update status');
      }

      // If leaving, check if player is in active game
      if (data.status === 'LEFT') {
        const isInActiveGame = await this.isPlayerInActiveGame(playerId);
        if (isInActiveGame) {
          throw new Error('Cannot leave session while playing in an active game');
        }
      }

      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: playerId },
        data: { status: data.status }
      });

      return updatedPlayer;
    } catch (error) {
      console.error('Error updating player status:', error);
      throw error;
    }
  }

  /**
   * Remove player from session (organizer only)
   */
  static async removePlayer(playerId: string, ownerDeviceId: string): Promise<void> {
    try {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId },
        include: { session: true }
      });

      if (!player) {
        throw new Error('Player not found');
      }

      // Check if requester is the session owner
      if (player.session.ownerDeviceId !== ownerDeviceId) {
        throw new Error('Unauthorized: Only session owner can remove players');
      }

      // Check if player is in active game
      const isInActiveGame = await this.isPlayerInActiveGame(playerId);
      if (isInActiveGame) {
        throw new Error('Cannot remove player while they are playing in an active game');
      }

      // Don't allow owner to remove themselves
      if (player.name === player.session.ownerName) {
        throw new Error('Cannot remove the session organizer');
      }

      await prisma.mvpPlayer.delete({
        where: { id: playerId }
      });
    } catch (error) {
      console.error('Error removing player:', error);
      throw error;
    }
  }

  /**
   * Add player by organizer (bypasses some restrictions)
   */
  static async addPlayerByOrganizer(sessionId: string, playerName: string, ownerDeviceId: string): Promise<MvpPlayer> {
    try {
      const session = await prisma.mvpSession.findUnique({
        where: { id: sessionId }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Check if requester is the session owner
      if (session.ownerDeviceId !== ownerDeviceId) {
        throw new Error('Unauthorized: Only session owner can add players');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Cannot add players to inactive session');
      }

      // Check if session is full
      const playerCount = await prisma.mvpPlayer.count({
        where: { sessionId }
      });

      if (playerCount >= session.maxPlayers) {
        throw new Error('Session is full');
      }

      // Check for duplicate name
      const existingPlayer = await prisma.mvpPlayer.findFirst({
        where: {
          sessionId,
          name: { equals: playerName, mode: 'insensitive' }
        }
      });

      if (existingPlayer) {
        throw new Error('Player with this name already exists in the session');
      }

      const player = await prisma.mvpPlayer.create({
        data: {
          sessionId,
          name: playerName.trim(),
          deviceId: 'manual_' + Math.random().toString(36).substr(2, 9),
          status: 'ACTIVE'
        }
      });

      return player;
    } catch (error) {
      console.error('Error adding player by organizer:', error);
      throw error;
    }
  }

  /**
   * Manage player rest status
   */
  static async managePlayerRest(playerId: string, data: RestManagementData, deviceId?: string): Promise<MvpPlayer> {
    try {
      const player = await prisma.mvpPlayer.findUnique({
        where: { id: playerId },
        include: { session: true }
      });

      if (!player) {
        throw new Error('Player not found');
      }

      // Check authorization
      const isOwner = player.session.ownerDeviceId === deviceId;
      const isPlayerThemselves = player.deviceId === deviceId;

      if (!isOwner && !isPlayerThemselves) {
        throw new Error('Unauthorized: Only the player or session owner can manage rest');
      }

      // Check if player is in active game
      if (data.gamesCount > 0) {
        const isInActiveGame = await this.isPlayerInActiveGame(playerId);
        if (isInActiveGame) {
          throw new Error('Cannot set rest while player is in an active game');
        }
      }

      const updatedPlayer = await prisma.mvpPlayer.update({
        where: { id: playerId },
        data: {
          status: data.gamesCount > 0 ? 'RESTING' : 'ACTIVE',
          restGamesRemaining: data.gamesCount,
          restRequestedAt: data.gamesCount > 0 ? new Date() : null,
          restRequestedBy: data.gamesCount > 0 ? data.requestedBy : null
        }
      });

      return updatedPlayer;
    } catch (error) {
      console.error('Error managing player rest:', error);
      throw error;
    }
  }

  /**
   * Get player status by device ID
   */
  static async getPlayerByDeviceId(sessionId: string, deviceId: string): Promise<MvpPlayer | null> {
    try {
      const player = await prisma.mvpPlayer.findFirst({
        where: {
          sessionId,
          deviceId
        }
      });

      return player;
    } catch (error) {
      console.error('Error fetching player by device ID:', error);
      throw new Error('Failed to fetch player');
    }
  }

  /**
   * Get rest status for all players in session
   */
  static async getRestStatusBySession(sessionId: string): Promise<Array<{
    id: string;
    name: string;
    status: string;
    restGamesRemaining: number;
    restRequestedAt: Date | null;
    restRequestedBy: string | null;
  }>> {
    try {
      const restingPlayers = await prisma.mvpPlayer.findMany({
        where: {
          sessionId,
          status: 'RESTING'
        },
        select: {
          id: true,
          name: true,
          status: true,
          restGamesRemaining: true,
          restRequestedAt: true,
          restRequestedBy: true
        },
        orderBy: { joinedAt: 'asc' }
      });

      return restingPlayers;
    } catch (error) {
      console.error('Error fetching rest status:', error);
      throw new Error('Failed to fetch rest status');
    }
  }

  /**
   * Check if player is currently in an active game
   */
  private static async isPlayerInActiveGame(playerId: string): Promise<boolean> {
    try {
      const activeGames = await prisma.mvpGame.findMany({
        where: {
          status: 'IN_PROGRESS',
          OR: [
            { team1Player1: { equals: await this.getPlayerName(playerId) } },
            { team1Player2: { equals: await this.getPlayerName(playerId) } },
            { team2Player1: { equals: await this.getPlayerName(playerId) } },
            { team2Player2: { equals: await this.getPlayerName(playerId) } }
          ]
        }
      });

      return activeGames.length > 0;
    } catch (error) {
      console.error('Error checking active games:', error);
      return false;
    }
  }

  /**
   * Get player name by ID (helper method)
   */
  private static async getPlayerName(playerId: string): Promise<string> {
    const player = await prisma.mvpPlayer.findUnique({
      where: { id: playerId },
      select: { name: true }
    });

    return player?.name || '';
  }
}