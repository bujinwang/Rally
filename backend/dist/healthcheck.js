"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = void 0;
const database_1 = require("./config/database");
const healthCheck = async () => {
    try {
        // Test database connection
        await database_1.prisma.$queryRaw `SELECT 1`;
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
    }
    catch (error) {
        console.error('Health check failed:', error);
        return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0'
        };
    }
};
exports.healthCheck = healthCheck;
// If this file is run directly
if (require.main === module) {
    (0, exports.healthCheck)()
        .then((result) => {
        console.log(JSON.stringify(result));
        process.exit(result.status === 'healthy' ? 0 : 1);
    })
        .catch((error) => {
        console.error('Health check error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=healthcheck.js.map