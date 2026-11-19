import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNaira } from '@naijabites/shared/money';
import { Button } from '../components/Button.jsx';
import { useCheckoutSummary } from '../lib/addresses.js';
import {
  createOrder,
  initializePayment,
  startPaystackRedirect,
} from '../lib/payments.js';
import './checkout.css';

const PENDING_ORDER_KEY = 'naijabites.pendingPaymentOrderId';
const IDEMPOTENCY_KEY = 'naijabites.checkoutIdempotencyKey';

export function Checkout() {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const [pendingOrderId, setPendingOrderId] = useState(
    () => window.sessionStorage.getItem(PENDING_ORDER_KEY) || '',
  );

  const query = useCheckoutSummary(selected);

  const data = query.data;
  const addressId = selected || data?.selectedAddressId || '';

  async function startPayment(orderId) {
    const payment = await initializePayment(orderId);

    if (
      typeof payment?.authorizationUrl !== 'string' ||
      !payment.authorizationUrl.startsWith('https://')
    ) {
      throw new Error(
        'Payment initialization did not return a valid payment link.',
      );
    }

    startPaystackRedirect(payment);
  }

  async function handleCheckout() {
    if (busy) return;

    setBusy(true);
    setActionError('');

    try {
      let orderId = pendingOrderId;

      // Create an order only when there is no pending payment.
      if (!orderId) {
        if (!addressId) {
          throw new Error('Please select a delivery address.');
        }

        let idempotencyKey = window.sessionStorage.getItem(
          IDEMPOTENCY_KEY,
        );

        if (!idempotencyKey) {
          idempotencyKey = window.crypto.randomUUID();

          window.sessionStorage.setItem(
            IDEMPOTENCY_KEY,
            idempotencyKey,
          );
        }

        const order = await createOrder({
          addressId,
          idempotencyKey,
        });

        if (!order?.id) {
          throw new Error(
            'Your order could not be created. Please try again.',
          );
        }

        orderId = order.id;

        // Save the order so payment can be resumed without
        // creating another order.
        window.sessionStorage.setItem(
          PENDING_ORDER_KEY,
          orderId,
        );

        window.sessionStorage.removeItem(IDEMPOTENCY_KEY);

        setPendingOrderId(orderId);
      }

      // Initialize Paystack and redirect the customer.
      await startPayment(orderId);
    } catch (error) {
      setActionError(
        error.message ||
          'We could not start your payment. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page checkout-page">
      <p className="eyebrow">ALMOST THERE</p>
      <h1>Checkout</h1>

      {query.isPending ? (
        <p>Preparing your checkout…</p>
      ) : null}

      {query.isError ? (
        <p className="form-error" role="alert">
          {query.error.message}
        </p>
      ) : null}

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {data ? (
        <div className="checkout-grid">
          <section className="card">
            <h2>Delivery address</h2>

            {data.addresses.length ? (
              <>
                <div className="checkout-addresses">
                  {data.addresses.map((a) => (
                    <label
                      key={a.id}
                      className={`checkout-address ${
                        addressId === a.id ? 'is-selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        value={a.id}
                        checked={addressId === a.id}
                        disabled={busy || Boolean(pendingOrderId)}
                        onChange={() => setSelected(a.id)}
                      />

                      <span>
                        <strong>{a.recipientName}</strong>
                        {a.isDefault ? ' · Default' : ''}
                        <br />
                        {a.addressLine1}, {a.area}, {a.city}, {a.state}
                        <br />
                        {a.phone}
                      </span>
                    </label>
                  ))}
                </div>

                {!pendingOrderId ? (
                  <Link to="/addresses">
                    Manage delivery addresses
                  </Link>
                ) : null}
              </>
            ) : (
              <p>
                No delivery address saved.{' '}
                {!pendingOrderId ? (
                  <Link to="/addresses">Add one now</Link>
                ) : (
                  'Your pending payment must be completed first.'
                )}
              </p>
            )}
          </section>

          <aside className="card checkout-summary">
            <h2>Order summary</h2>

            <div>
              <span>Items ({data.cart.itemCount})</span>
              <strong>{formatNaira(data.subtotalKobo)}</strong>
            </div>

            <div>
              <span>Delivery fee</span>
              <strong>
                {data.deliveryFeeKobo === null
                  ? 'Unavailable'
                  : formatNaira(data.deliveryFeeKobo)}
              </strong>
            </div>

            <div>
              <span>Total</span>
              <strong>
                {data.totalKobo === null
                  ? '—'
                  : formatNaira(data.totalKobo)}
              </strong>
            </div>

            {data.blockers.length && !pendingOrderId ? (
              <ul className="checkout-blockers">
                {data.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}

            <Button
              disabled={
                busy ||
                (!pendingOrderId && !data.canContinue)
              }
              onClick={handleCheckout}
            >
              {busy
                ? 'Please wait…'
                : pendingOrderId
                  ? 'Resume payment'
                  : 'Place order and pay'}
            </Button>

            <p className="muted">
              {pendingOrderId
                ? 'You have an order awaiting payment. Continue to Paystack to complete it.'
                : 'Your order will be created before you are redirected to Paystack for secure payment.'}
            </p>
          </aside>
        </div>
      ) : null}
    </main>
  );
}