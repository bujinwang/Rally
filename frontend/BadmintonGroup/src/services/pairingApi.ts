import { API_BASE_URL } from '../config/api';

export interface Pairing {
  id: string;
  court: number;
  players: {
    id: string;
    name: string;
    position: 'left' | 'right';
  }[];
  createdAt: Date;
}

export interface PairingResult {
  pairings: Pairing[];
  fairnessScore: number;
  oddPlayerOut?: string;
  generatedAt: Date;
}

export interface ManualPairingAdjustment {
  players: {
    id: string;
    name: string;
  }[];
}

export interface AIPairingSuggestion {
  pairing: [string, string];
  confidence: number;
  reason: string;
  factors: {
    skillMatch: number;
    preferenceMatch: number;
    historicalCompatibility: number;
  };
}

export interface AIPairingResult {
  suggestions: AIPairingSuggestion[];
  processingTime: number;
  algorithmVersion: string;
}

export interface PairingFeedback {
  sessionId: string;
  playerId: string;
  partnerId: string;
  feedback: number; // 1-5 rating
  aiSuggested?: boolean;
}

export interface PairingExplanation {
  suggestionId: string;
  explanation: string;
  factors: {
    skillCompatibility: string;
    historicalPerformance: string;
    preferenceAlignment: string;
  };
  confidence: number;
  alternatives: string[];
}

class PairingApiService {
  private getAuthHeaders(): HeadersInit {
    // Get auth token from storage or context
    // For now, return empty headers (will be handled by backend auth)
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generate new pairings for a session
   */
  async generatePairings(sessionId: string, algorithm: 'fair' | 'random' | 'skill_based' = 'fair'): Promise<PairingResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/sessions/${sessionId}/pairings`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ algorithm }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to generate pairings');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error generating pairings:', error);
      throw error;
    }
  }

  /**
   * Get current pairings for a session
   */
  async getPairings(sessionId: string): Promise<PairingResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/sessions/${sessionId}/pairings`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch pairings');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error fetching pairings:', error);
      throw error;
    }
  }

  /**
   * Manually adjust a pairing
   */
  async adjustPairing(sessionId: string, pairingId: string, adjustment: ManualPairingAdjustment): Promise<Pairing> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/sessions/${sessionId}/pairings/${pairingId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(adjustment),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to adjust pairing');
      }

      const data = await response.json();
      return data.data.pairing;
    } catch (error) {
      console.error('Error adjusting pairing:', error);
      throw error;
    }
  }

  /**
   * Clear all pairings for a session
   */
  async clearPairings(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/sessions/${sessionId}/pairings`, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to clear pairings');
      }
    } catch (error) {
      console.error('Error clearing pairings:', error);
      throw error;
    }
  }

  /**
   * Generate AI-powered pairing suggestions
   */
  async generateAISuggestions(
    sessionId: string,
    playerIds: string[],
    options: {
      maxSuggestions?: number;
      includeHistoricalData?: boolean;
      preferenceWeight?: number;
    } = {}
  ): Promise<AIPairingResult> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/suggest`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          sessionId,
          playerIds,
          options
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to generate AI suggestions');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      throw error;
    }
  }

  /**
   * Get explanation for a pairing suggestion
   */
  async getPairingExplanation(suggestionId: string): Promise<PairingExplanation> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/explain/${suggestionId}`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to get pairing explanation');
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error getting pairing explanation:', error);
      throw error;
    }
  }

  /**
   * Submit feedback on AI pairing suggestions
   */
  async submitPairingFeedback(feedback: PairingFeedback): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/feedback`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(feedback),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting pairing feedback:', error);
      throw error;
    }
  }

  /**
   * Update player skill levels based on recent performance
   */
  async updatePlayerSkillLevels(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/pairings/update-skills/${sessionId}`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to update skill levels');
      }
    } catch (error) {
      console.error('Error updating player skill levels:', error);
      throw error;
    }
  }
}

// Create singleton instance
const pairingApiService = new PairingApiService();

export default pairingApiService;
export { PairingApiService };