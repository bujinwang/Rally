import { PrismaClient } from '@prisma/client';
import { AchievementCategory, AchievementTriggerType, AchievementRarity, BadgeRarity } from '../types/achievement';

const prisma = new PrismaClient();

async function seedAchievements() {
  console.log('🌱 Seeding achievements and badges...');

  // Create badges first
  const badges = [
    {
      id: 'first-win-badge',
      name: 'First Victory',
      description: 'Your first badminton win!',
      icon: 'trophy',
      color: '#FFD700',
      rarity: BadgeRarity.COMMON,
    },
    {
      id: 'streak-master-badge',
      name: 'Streak Master',
      description: 'Achieved a 5-game winning streak',
      icon: 'flame',
      color: '#FF6B35',
      rarity: BadgeRarity.UNCOMMON,
    },
    {
      id: 'tournament-champion-badge',
      name: 'Tournament Champion',
      description: 'Won your first tournament',
      icon: 'crown',
      color: '#FFD700',
      rarity: BadgeRarity.RARE,
    },
    {
      id: 'social-butterfly-badge',
      name: 'Social Butterfly',
      description: 'Made 10 friends',
      icon: 'people',
      color: '#9C27B0',
      rarity: BadgeRarity.UNCOMMON,
    },
    {
      id: 'perfect-game-badge',
      name: 'Perfect Game',
      description: 'Won a game without losing a point',
      icon: 'star',
      color: '#FF9800',
      rarity: BadgeRarity.EPIC,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { id: badge.id },
      update: {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        color: badge.color,
        rarity: badge.rarity,
      },
      create: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        color: badge.color,
        rarity: badge.rarity,
      },
    });
  }

  console.log('✅ Created badges');

  // Create achievements
  const achievements = [
    {
      id: 'first-match',
      name: 'Getting Started',
      description: 'Play your first match',
      category: AchievementCategory.MATCH_PLAYING,
      triggerType: AchievementTriggerType.MATCH_PLAY,
      triggerValue: { count: 1 },
      points: 10,
      rarity: AchievementRarity.COMMON,
      maxProgress: 1,
    },
    {
      id: 'first-win',
      name: 'First Victory',
      description: 'Win your first match',
      category: AchievementCategory.MATCH_PLAYING,
      triggerType: AchievementTriggerType.MATCH_WIN,
      triggerValue: { count: 1 },
      points: 25,
      badgeId: 'first-win-badge',
      rarity: AchievementRarity.COMMON,
      maxProgress: 1,
    },
    {
      id: 'win-streak-3',
      name: 'On Fire',
      description: 'Win 3 matches in a row',
      category: AchievementCategory.MATCH_PLAYING,
      triggerType: AchievementTriggerType.STREAK,
      triggerValue: { minStreak: 3 },
      points: 50,
      rarity: AchievementRarity.UNCOMMON,
      maxProgress: 3,
    },
    {
      id: 'win-streak-5',
      name: 'Unstoppable',
      description: 'Win 5 matches in a row',
      category: AchievementCategory.MATCH_PLAYING,
      triggerType: AchievementTriggerType.STREAK,
      triggerValue: { minStreak: 5 },
      points: 100,
      badgeId: 'streak-master-badge',
      rarity: AchievementRarity.RARE,
      maxProgress: 5,
    },
    {
      id: 'perfect-game',
      name: 'Perfection',
      description: 'Win a game without losing a single point',
      category: AchievementCategory.MATCH_PLAYING,
      triggerType: AchievementTriggerType.PERFECT_GAME,
      triggerValue: { count: 1 },
      points: 200,
      badgeId: 'perfect-game-badge',
      rarity: AchievementRarity.EPIC,
      maxProgress: 1,
    },
    {
      id: 'tournament-winner',
      name: 'Champion',
      description: 'Win your first tournament',
      category: AchievementCategory.TOURNAMENT,
      triggerType: AchievementTriggerType.TOURNAMENT_WIN,
      triggerValue: { count: 1 },
      points: 150,
      badgeId: 'tournament-champion-badge',
      rarity: AchievementRarity.RARE,
      maxProgress: 1,
    },
    {
      id: 'tournament-participant',
      name: 'Tournament Player',
      description: 'Participate in 5 tournaments',
      category: AchievementCategory.TOURNAMENT,
      triggerType: AchievementTriggerType.TOURNAMENT_PARTICIPATE,
      triggerValue: { count: 5 },
      points: 75,
      rarity: AchievementRarity.UNCOMMON,
      maxProgress: 5,
    },
    {
      id: 'social-butterfly',
      name: 'Social Butterfly',
      description: 'Add 10 friends',
      category: AchievementCategory.SOCIAL,
      triggerType: AchievementTriggerType.SOCIAL_FRIEND,
      triggerValue: { count: 10 },
      points: 50,
      badgeId: 'social-butterfly-badge',
      rarity: AchievementRarity.UNCOMMON,
      maxProgress: 10,
    },
    {
      id: 'session-host',
      name: 'Community Builder',
      description: 'Host 5 sessions',
      category: AchievementCategory.SOCIAL,
      triggerType: AchievementTriggerType.SESSION_HOST,
      triggerValue: { count: 5 },
      points: 75,
      rarity: AchievementRarity.UNCOMMON,
      maxProgress: 5,
    },
    {
      id: 'experienced-player',
      name: 'Experienced Player',
      description: 'Play for 10 hours total',
      category: AchievementCategory.PROGRESSION,
      triggerType: AchievementTriggerType.TIME_PLAYED,
      triggerValue: { hours: 10 },
      points: 100,
      rarity: AchievementRarity.UNCOMMON,
      maxProgress: 600, // 10 hours in minutes
    },
    {
      id: 'skill-master',
      name: 'Skill Master',
      description: 'Reach skill level 5',
      category: AchievementCategory.PROGRESSION,
      triggerType: AchievementTriggerType.SKILL_LEVEL,
      triggerValue: { level: 5 },
      points: 200,
      rarity: AchievementRarity.RARE,
      maxProgress: 5,
    },
    {
      id: 'match-veteran',
      name: 'Match Veteran',
      description: 'Play 100 matches',
      category: AchievementCategory.PROGRESSION,
      triggerType: AchievementTriggerType.MATCH_PLAY,
      triggerValue: { count: 100 },
      points: 150,
      rarity: AchievementRarity.RARE,
      maxProgress: 100,
    },
    {
      id: 'win-master',
      name: 'Win Master',
      description: 'Win 50 matches',
      category: AchievementCategory.PROGRESSION,
      triggerType: AchievementTriggerType.MATCH_WIN,
      triggerValue: { count: 50 },
      points: 125,
      rarity: AchievementRarity.RARE,
      maxProgress: 50,
    },
  ];

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { id: achievement.id },
      update: {
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        triggerType: achievement.triggerType,
        triggerValue: achievement.triggerValue,
        points: achievement.points,
        badgeId: achievement.badgeId,
        rarity: achievement.rarity,
        maxProgress: achievement.maxProgress,
      },
      create: {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        category: achievement.category,
        triggerType: achievement.triggerType,
        triggerValue: achievement.triggerValue,
        points: achievement.points,
        badgeId: achievement.badgeId,
        rarity: achievement.rarity,
        maxProgress: achievement.maxProgress,
      },
    });
  }

  console.log('✅ Created achievements');
  console.log('🎉 Gamification system seeded successfully!');
}

async function main() {
  try {
    await seedAchievements();
  } catch (error) {
    console.error('❌ Error seeding achievements:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { seedAchievements };