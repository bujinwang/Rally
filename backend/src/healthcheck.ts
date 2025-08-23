import { prisma } from './config/database';

export const healthCheck = async (): Promise<{ status: string; timestamp: string; version: string }> => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
};

// If this file is run directly
if (require.main === module) {
  healthCheck()
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(result.status === 'healthy' ? 0 : 1);
    })
    .catch((error) => {
      console.error('Health check error:', error);
      process.exit(1);
    });
}