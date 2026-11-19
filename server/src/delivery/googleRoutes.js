import { validCoordinates } from './geo.js';

export function createGoogleRoutesClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  return {
    async computeDistance({ origin, destination }) {
      const from = validCoordinates(origin?.latitude, origin?.longitude);
      const to = validCoordinates(destination?.latitude, destination?.longitude);
      
      if (!from || !to) {
        throw new Error('Valid origin and destination coordinates are required.');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // OSRM requires longitude first, then latitude!
        const url = `https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`;

        const response = await fetchImpl(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'NaijaBites-Local-Dev' 
          },
        });

        if (!response.ok) {
          throw new Error(`OSRM API returned HTTP ${response.status}.`);
        }

        const data = await response.json();

        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
           throw new Error('OSRM returned no valid route distance.');
        }

        // OSRM usually returns a float, so we Math.round() it into an integer.
        const meters = Math.round(data.routes[0].distance);

        return { distanceMeters: meters, source: 'osrm' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}