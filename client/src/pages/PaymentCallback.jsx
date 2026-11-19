import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button.jsx';
import {
  initializePayment,
  startPaystackRedirect,
  verifyPayment,
} from '../lib/payments.js';
import './payment.css';

const PENDING_ORDER_KEY = 'naijabites.pendingPaymentOrderId';

export function PaymentCallback() {
  const [params] = useSearchParams();

  const orderId = params.get('orderId') || '';
  const reference =
    params.get('reference') || params.get('trxref') || '';

  const started = useRef(false);

  const [state, setState] = useState({
    status: 'checking',
    message: 'Confirming your payment with Paystack…',
  });

  const [busy, setBusy] = useState(false);

  function applyVerificationResult(result) {
    if (
      result.paymentStatus === 'success' &&
      result.verified
    ) {
      window.sessionStorage.removeItem(PENDING_ORDER_KEY);

      setState({
        status: 'success',
        message:
          result.orderStatus === 'payment_review'
            ? 'Your payment is confirmed, but your order needs a manual review before fulfilment. Our team will review it.'
            : 'Your payment has been confirmed. Your order is now being processed.',
        result,
      });

      return;
    }

    if (
      ['failed', 'abandoned'].includes(result.paymentStatus)
    ) {
      setState({
        status: 'failed',
        message:
          result.paymentStatus === 'abandoned'
            ? 'This payment was abandoned. You can safely try again.'
            : 'Paystack could not complete this payment. You can safely try again.',
        result,
      });

      return;
    }

    setState({
      status: 'pending',
      message:
        'Paystack has not confirmed this payment yet. Please check again shortly.',
      result,
    });
  }

  useEffect(() => {
    if (started.current) return;

    started.current = true;

    if (!orderId || !reference) {
      setState({
        status: 'error',
        message:
          'The payment return link is incomplete. Open checkout to resume your payment.',
      });

      return;
    }

    verifyPayment(orderId, reference)
      .then(applyVerificationResult)
      .catch((error) => {
        setState({
          status: 'error',
          message:
            error.message ||
            'We could not verify this payment. Please try again.',
        });
      });
  }, [orderId, reference]);

  async function checkPaymentStatus() {
    if (!orderId || !reference) return;

    setBusy(true);

    try {
      const result = await verifyPayment(orderId, reference);
      applyVerificationResult(result);
    } catch (error) {
      setState({
        status: 'error',
        message:
          error.message ||
          'We could not check your payment. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function retryPayment() {
    if (!orderId) return;

    setBusy(true);

    try {
      const payment = await initializePayment(orderId);

      if (payment.authorizationUrl) {
        startPaystackRedirect(payment);
        return;
      }

      if (payment.reference) {
        window.location.assign(
          `/payment/callback?orderId=${encodeURIComponent(orderId)}&reference=${encodeURIComponent(payment.reference)}`,
        );

        return;
      }

      setState({
        status: 'pending',
        message:
          'Your payment is still being prepared. Please try again shortly.',
      });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error.message ||
          'We could not restart the payment.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page payment-result-page">
      <section
        className="card payment-result-card"
        aria-live="polite"
      >
        <p className="eyebrow">PAYMENT STATUS</p>

        <div
          className={`payment-result-icon payment-result-icon--${state.status}`}
          aria-hidden="true"
        >
          {state.status === 'success'
            ? '✓'
            : state.status === 'failed' ||
                state.status === 'error'
              ? '!'
              : '…'}
        </div>

        <h1>
          {state.status === 'success'
            ? 'Payment successful'
            : state.status === 'failed'
              ? 'Payment not completed'
              : state.status === 'pending'
                ? 'Payment pending'
                : state.status === 'error'
                  ? 'Unable to verify payment'
                  : 'Checking your payment'}
        </h1>

        <p>{state.message}</p>

        {state.result?.reference ? (
          <p className="payment-reference">
            Reference:{' '}
            <strong>{state.result.reference}</strong>
          </p>
        ) : null}

        {state.status === 'success' ? (
          <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}>
            <Link className="btn btn--primary btn--lg" to={`/orders/${encodeURIComponent(orderId)}/tracking`}>
              Track my delivery
            </Link>
            <Link className="btn btn--outline btn--lg" to="/account">View my account</Link>
          </div>
        ) : null}

        {state.status === 'failed' &&
        state.result?.retryAllowed ? (
          <Button
            disabled={busy}
            onClick={retryPayment}
          >
            {busy ? 'Connecting…' : 'Try payment again'}
          </Button>
        ) : null}

        {state.status === 'pending' && reference ? (
          <Button
            disabled={busy}
            onClick={checkPaymentStatus}
          >
            {busy ? 'Checking…' : 'Check payment status'}
          </Button>
        ) : null}

        {state.status === 'error' && reference ? (
          <Button
            disabled={busy}
            onClick={checkPaymentStatus}
          >
            {busy ? 'Checking…' : 'Check again'}
          </Button>
        ) : null}

        {state.status !== 'checking' &&
        state.status !== 'success' ? (
          <Link to="/cart">Return to shopping</Link>
        ) : null}
      </section>
    </main>
  );
}