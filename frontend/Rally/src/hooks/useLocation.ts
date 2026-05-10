import { useState, useEffect } from 'react';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export const useLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Mock location permission request
      // In a real app, this would use expo-location or react-native-geolocation
      const mockGranted = true; // Simulate permission granted

      if (!mockGranted) {
        setError('Location permission denied. Please grant permission to find nearby sessions.');
        return false;
      }

      // Mock location data (Edmonton, AB coordinates)
      const mockLocation: LocationData = {
        latitude: 53.5444,
        longitude: -113.4909,
        accuracy: 10,
        timestamp: Date.now(),
      };

      setLocation(mockLocation);
      return true;

    } catch (err) {
      console.error('Location error:', err);
      setError('Failed to get location. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const clearLocation = () => {
    setLocation(null);
    setError(null);
  };

  const refreshLocation = async (): Promise<boolean> => {
    if (!location) {
      return await requestLocationPermission();
    }

    try {
      setLoading(true);

      // Mock refreshed location with slight variation
      const mockLocation: LocationData = {
        latitude: location.latitude + (Math.random() - 0.5) * 0.01, // Small random variation
        longitude: location.longitude + (Math.random() - 0.5) * 0.01,
        accuracy: 10,
        timestamp: Date.now(),
      };

      setLocation(mockLocation);
      return true;
    } catch (err) {
      console.error('Refresh location error:', err);
      setError('Failed to refresh location.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Auto-request location on mount (mock)
  useEffect(() => {
    const checkPermissionAndLocation = async () => {
      try {
        // Simulate checking previous permission
        const mockHasPermission = Math.random() > 0.5; // 50% chance

        if (mockHasPermission) {
          const mockLocation: LocationData = {
            latitude: 53.5444,
            longitude: -113.4909,
            accuracy: 10,
            timestamp: Date.now(),
          };
          setLocation(mockLocation);
        }
      } catch (err) {
        // Silently fail on auto-location - user can manually request
        console.log('Auto location failed:', err);
      }
    };

    // Delay to simulate async operation
    setTimeout(checkPermissionAndLocation, 1000);
  }, []);

  return {
    location,
    loading,
    error,
    requestLocationPermission,
    clearLocation,
    refreshLocation,
  };
};