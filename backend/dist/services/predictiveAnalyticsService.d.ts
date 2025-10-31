export declare class PredictiveAnalyticsService {
    /**
     * Forecast session demand using historical data and linear regression
     * @param location - Venue location filter
     * @param days - Forecast horizon
     * @returns PredictionResult with daily forecasts
     */
    static forecastSessionDemand(location: string, days?: number): Promise<any>;
    /**
     * Predict player churn using logistic regression on activity metrics
     * @param playerId - Player to predict for
     * @returns PredictionResult with churn probability and recommendations
     */
    static predictChurn(playerId: string): Promise<any>;
    /**
     * Analyze and forecast seasonal trends in community activity
     * @returns PredictionResult with monthly forecasts
     */
    static analyzeSeasonalTrends(): Promise<any>;
    /**
     * Optimize resource allocation for venue on specific date
     * @param venueId - Venue to optimize
     * @param date - Target date
     * @returns PredictionResult with optimal schedule and cost
     */
    static optimizeResourceAllocation(venueId: string, date: string): Promise<any>;
}
//# sourceMappingURL=predictiveAnalyticsService.d.ts.map