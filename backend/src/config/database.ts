import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export const connectDB = async (): Promise<void> => {
  try {
    console.log('🔄 Attempting database connection...');
    console.log('📊 Database URL:', process.env.DATABASE_URL?.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Test the connection with a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database test query successful:', result);

  } catch (error: any) {
    console.error('❌ Database connection failed:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta
    });
    process.exit(1);
  }
};

export { prisma };