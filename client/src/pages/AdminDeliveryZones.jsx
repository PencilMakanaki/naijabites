import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';

import {
  useDeliveryZones,
  useCreateDeliveryZone,
  useUpdateDeliveryZone,
  useSetDeliveryZoneStatus,
} from '../lib/delivery.js';

import './admin-delivery-zones.css';

const EMPTY_FORM = {
  zoneName: '',
  state: '',
  city: '',
  area: '',
  fee: '',
};

function formatNaira(kobo) {
  if (kobo == null) return '—';

  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(kobo) / 100);
}

function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export function AdminDeliveryZones() {
  const zonesQuery = useDeliveryZones();

  const createZone = useCreateDeliveryZone();
  const updateZone = useUpdateDeliveryZone();
  const changeStatus = useSetDeliveryZoneStatus();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  const zones = zonesQuery.data ?? [];

  const isSaving = createZone.isPending || updateZone.isPending;

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
  }

  function editZone(zone) {
    setEditingId(zone.id);

    setForm({
      zoneName: zone.zoneName,
      state: zone.state,
      city: zone.city,
      area: zone.area ?? '',
      fee: (Number(zone.feeKobo) / 100).toFixed(2),
    });

    setMessage('');
    setFormError('');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage('');
    setFormError('');

    const naira = Number(form.fee);

    if (!Number.isFinite(naira) || naira < 0) {
      setFormError('Enter a valid delivery fee.');
      return;
    }

    const feeKobo = Math.round(naira * 100);

    if (!Number.isSafeInteger(feeKobo)) {
      setFormError('The delivery fee is too large.');
      return;
    }

    const values = {
      zoneName: form.zoneName,
      state: form.state,
      city: form.city,
      area: form.area,
      feeKobo,
    };

    try {
      if (editingId) {
        await updateZone.mutateAsync({
          id: editingId,
          values,
        });

        setMessage('Delivery zone updated successfully.');
      } else {
        await createZone.mutateAsync(values);

        setMessage('Delivery zone created successfully.');
      }

      resetForm();
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  async function toggleStatus(zone) {
    setMessage('');

    const status = zone.status === 'active' ? 'inactive' : 'active';

    try {
      await changeStatus.mutateAsync({
        id: zone.id,
        status,
      });

      setMessage(
        `Delivery zone ${status === 'active' ? 'activated' : 'deactivated'} successfully.`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  return (
    <main className="page admin-delivery">
      <div className="admin-delivery__header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Delivery Zones</h1>
          <p className="muted">
            Configure delivery locations and their delivery fees.
          </p>
        </div>

        <Link to="/admin" className="admin-delivery__back">
          Back to dashboard
        </Link>
      </div>

      {message ? (
        <div className="admin-delivery__notice" role="status">
          {message}
        </div>
      ) : null}

      <section className="card admin-delivery__form-card">
        <div>
          <h2>{editingId ? 'Edit delivery zone' : 'Add delivery zone'}</h2>
          <p className="muted">
            Delivery fees are entered in naira and stored in kobo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="admin-delivery__form">
          <Field
            label="Zone name"
            name="zoneName"
            placeholder="e.g. Lagos Mainland"
            value={form.zoneName}
            onChange={updateField}
            required
            maxLength={100}
          />

          <Field
            label="State"
            name="state"
            placeholder="e.g. Lagos"
            value={form.state}
            onChange={updateField}
            required
            maxLength={80}
          />

          <Field
            label="City"
            name="city"
            placeholder="e.g. Ikeja"
            value={form.city}
            onChange={updateField}
            required
            maxLength={80}
          />

          <Field
            label="Area (optional)"
            name="area"
            placeholder="e.g. Allen Avenue"
            value={form.area}
            onChange={updateField}
            maxLength={80}
            hint="Leave empty to configure a city-wide delivery fee."
          />

          <Field
            label="Delivery fee (₦)"
            name="fee"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 2500"
            value={form.fee}
            onChange={updateField}
            required
          />

          {formError ? (
            <p className="admin-delivery__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="admin-delivery__actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? 'Saving...'
                : editingId
                  ? 'Save changes'
                  : 'Add delivery zone'}
            </Button>

            {editingId ? (
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSaving}
              >
                Cancel editing
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-delivery__list">
        <div className="admin-delivery__list-heading">
          <h2>Configured delivery zones</h2>
          <span>{zones.length} zones</span>
        </div>

        {zonesQuery.isLoading ? (
          <p className="muted">Loading delivery zones...</p>
        ) : zonesQuery.isError ? (
          <div className="card">
            <p className="admin-delivery__error">
              {getErrorMessage(zonesQuery.error)}
            </p>

            <Button
              variant="outline"
              onClick={() => zonesQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : zones.length === 0 ? (
          <div className="card">
            <p>No delivery zones have been configured yet.</p>
          </div>
        ) : (
          <div className="admin-delivery__table-wrap">
            <table className="admin-delivery__table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Location</th>
                  <th>Delivery fee</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td data-label="Zone">
                      <strong>{zone.zoneName}</strong>
                    </td>

                    <td data-label="Location">
                      {[zone.area, zone.city, zone.state]
                        .filter(Boolean)
                        .join(', ')}
                    </td>

                    <td data-label="Delivery fee">
                      <strong>{formatNaira(zone.feeKobo)}</strong>
                    </td>

                    <td data-label="Status">
                      <span
                        className={`admin-delivery__status admin-delivery__status--${zone.status}`}
                      >
                        {zone.status}
                      </span>
                    </td>

                    <td data-label="Actions">
                      <div className="admin-delivery__row-actions">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => editZone(zone)}
                        >
                          Edit
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={changeStatus.isPending}
                          onClick={() => toggleStatus(zone)}
                        >
                          {zone.status === 'active'
                            ? 'Deactivate'
                            : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}