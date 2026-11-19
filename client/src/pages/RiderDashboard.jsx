import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button } from '../components/Button.jsx';

export function RiderDashboard() {
  const [orderId, setOrderId] = useState('');
  const [status, setStatus] = useState('');

  function shareLocation() {
    if (!orderId) return setStatus('Please enter an order ID.');
    setStatus('Getting your GPS location...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.post('/tracking/rider/location', {
            orderId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setStatus('Location sent successfully!');
        } catch (err) {
          setStatus(err.message || 'Failed to send location.');
        }
      },
      (error) => {
        setStatus('GPS Error: ' + error.message);
      }
    );
  }

  return (
    <main className="page">
      <section className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <h1>Rider Dashboard</h1>
        <p>Enter the Order ID to update your live location.</p>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Order ID</label>
          <input 
            type="text" 
            value={orderId} 
            onChange={(e) => setOrderId(e.target.value)} 
            placeholder="e.g. 01M7N89YXSPKH6MS5KZEWYAB10"
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <Button onClick={shareLocation} className="btn--block">
          Share My Live Location
        </Button>

        {status && <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>{status}</p>}
      </section>
    </main>
  );
}