// @ts-nocheck
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
}

export function useLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        if ('geolocation' in navigator) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
            });
          });
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } else {
          setError('Geolocation not available');
        }
      } else {
        // React Native — would use expo-location
        setError('Location not available on this platform');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get location');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    requestLocation();
  }, []);

  return { location, error, loading, requestLocation };
}
