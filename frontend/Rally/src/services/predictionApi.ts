import { apiClient } from './apiClient'; // Assume existing API client

export const predictionApi = {
  getPrediction: (type: string, params: any = {}) => {
    return apiClient.get(`/predictions/${type}`, { params });
  },
  trainModel: (type: string, force = false) => {
    return apiClient.post('/predictions/train', { type, force });
  },
};