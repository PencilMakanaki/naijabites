import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';

// Fix for default Leaflet marker icons in React
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export function TrackOrder() {
  const { orderId } = useParams();
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Poll the backend every 5 seconds for the latest location
    const fetchLocation = async () => {
      try {
        const data = await api.get(`/tracking/customer/orders/${orderId}/tracking`);
        setTracking(data);
        setError('');
      } catch (err) {
        setError(err.message || 'Could not load tracking data.');
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  return (
    <main className="page" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1>Track Order</h1>
        <Link to="/account">Back to Account</Link>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      {tracking ? (
        <div>
          <p><strong>Status:</strong> {tracking.status.replace('_', ' ').toUpperCase()}</p>
          
          {tracking.location ? (
            <div style={{ height: '400px', width: '100%', marginTop: '1rem', borderRadius: '8px', overflow: 'hidden' }}>
              <MapContainer 
                center={[tracking.location.latitude, tracking.location.longitude]} 
                zoom={15} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                <Marker position={[tracking.location.latitude, tracking.location.longitude]}>
                  <Popup>Your rider is here!</Popup>
                </Marker>
              </MapContainer>
            </div>
          ) : (
            <p>The rider hasn't shared their location yet. Waiting for GPS...</p>
          )}
        </div>
      ) : (
        <p>Loading tracking details...</p>
      )}
    </main>
  );
}