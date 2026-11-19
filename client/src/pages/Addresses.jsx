import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import { Field } from '../components/Field.jsx';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from '../lib/addresses.js';
import './addresses.css';

const EMPTY = {
  recipientName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  area: '',
  city: '',
  state: 'Lagos',
  landmark: '',
  deliveryInstructions: '',
  isDefault: false,
};

const LABELS = [
  ['recipientName', 'Recipient full name'],
  ['phone', 'Phone number'],
  ['addressLine1', 'Street address'],
  ['addressLine2', 'Apartment, suite or unit (optional)'],
  ['area', 'Area / neighbourhood'],
  ['city', 'City'],
  ['state', 'State'],
  ['landmark', 'Nearby landmark (optional)'],
  ['deliveryInstructions', 'Delivery instructions (optional)'],
];

export function Addresses() {
  const query = useAddresses();
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const makeDefault = useSetDefaultAddress();

  const [values, setValues] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const pending = create.isPending || update.isPending;
  const error = create.error || update.error;

  function submit(event) {
    event.preventDefault();

    const payload = {
      ...values,
      isDefault: Boolean(values.isDefault),
    };

    if (editing) {
      update.mutate(
        { id: editing, values: payload },
        {
          onSuccess: () => {
            setEditing(null);
            setValues(EMPTY);
          },
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => setValues(EMPTY),
      });
    }
  }

    function edit(address) {
    setEditing(address.id);
    // Copy only the fields the form (and the server) accept; the saved address also has id, dates, etc.
    const next = { ...EMPTY };
    for (const key of Object.keys(EMPTY)) {
      if (address[key] != null) next[key] = address[key];
    }
    setValues(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="page addresses-page">
      <div className="addresses-page__head">
        <div>
          <p className="eyebrow">DELIVERY DETAILS</p>
          <h1>Your delivery addresses</h1>
          <p className="muted">
            Save the places where you would like your orders delivered.
          </p>
        </div>

        <Link to="/account">Back to account</Link>
      </div>

      <section className="card address-form-card">
        <h2>{editing ? 'Edit address' : 'Add a delivery address'}</h2>

        <form className="address-form" onSubmit={submit}>
          {LABELS.map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={values[key] ?? ''}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [key]: e.target.value,
                }))
              }
              required={
                ![
                  'addressLine2',
                  'landmark',
                  'deliveryInstructions',
                ].includes(key)
              }
            />
          ))}

          <label className="address-check">
            <input
              type="checkbox"
              checked={Boolean(values.isDefault)}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  isDefault: e.target.checked,
                }))
              }
            />
            Set as my default delivery address
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error.fields
                ? Object.values(error.fields).join(' ')
                : error.message}
            </p>
          ) : null}

          <div className="address-form__actions">
            <Button type="submit" disabled={pending}>
              {pending
                ? 'Saving…'
                : editing
                  ? 'Save address'
                  : 'Add address'}
            </Button>

            {editing ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setValues(EMPTY);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="address-list">
        <h2>Saved addresses</h2>

        {query.isPending ? <p>Loading addresses…</p> : null}

        {query.isError ? (
          <p className="form-error" role="alert">
            {query.error.message}
          </p>
        ) : null}

        {query.data?.length
          ? query.data.map((a) => (
              <article className="card address-card" key={a.id}>
                <div>
                  <h3>
                    {a.recipientName}
                    {a.isDefault ? (
                      <span className="address-default">Default</span>
                    ) : null}
                  </h3>

                  <p>{a.phone}</p>

                  <p>
                    {a.addressLine1}
                    {a.addressLine2 ? `, ${a.addressLine2}` : ''},{' '}
                    {a.area}, {a.city}, {a.state}
                  </p>

                  {a.landmark ? (
                    <p className="muted">Landmark: {a.landmark}</p>
                  ) : null}
                </div>

                <div className="address-card__actions">
                  {!a.isDefault ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => makeDefault.mutate(a.id)}
                      disabled={makeDefault.isPending}
                    >
                      Make default
                    </Button>
                  ) : null}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => edit(a)}
                  >
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm('Delete this delivery address?')) {
                        remove.mutate(a.id);
                      }
                    }}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </article>
            ))
          : null}

        {query.data?.length === 0 ? (
          <p className="muted">
            You have not saved a delivery address yet.
          </p>
        ) : null}
      </section>
    </main>
  );
}