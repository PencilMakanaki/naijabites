import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession, useLogout } from '../lib/session.js';
import {
  useVendorOrders,
  useVendorOrder,
  useAcceptVendorOrder,
  useRejectVendorOrder,
} from '../lib/vendorOrders.js';
import { Button } from '../components/Button.jsx';
import { getErrorMessage } from '../lib/forms.js';
import './pages.css';
import './vendor-dashboard.css';

const STATUS_LABELS = {
  pending: 'Awaiting response',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for dispatch',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatNaira(kobo) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(kobo || 0) / 100);
}

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function StatusBadge({ status }) {
  return (
    <span className={`vendor-status vendor-status-${status}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function VendorDashboard() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const session = useSession();
  const logout = useLogout();

  const ordersQuery = useVendorOrders({ page, pageSize: 10 });
  const detailQuery = useVendorOrder(selectedId);

  const acceptOrder = useAcceptVendorOrder();
  const rejectOrder = useRejectVendorOrder();

  const orders = ordersQuery.data?.orders || [];
  const pagination = ordersQuery.data?.pagination || {};

  const summary = ordersQuery.data?.summary || {
    orderValueKobo: 0,
    commissionKobo: 0,
    earningsKobo: 0,
    };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter((order) => order.status === filter);

  const selectedOrder = detailQuery.data;

  async function handleAccept(order) {
    const confirmed = window.confirm(
      'Accept this order? You will be responsible for fulfilling it.'
    );

    if (!confirmed) return;

    try {
      await acceptOrder.mutateAsync(order.id);
    } catch {
      // The mutation error is displayed below.
    }
  }

  async function handleReject(order) {
    const reason = window.prompt(
      'Please enter a reason for rejecting this order:'
    );

    if (reason === null) return;

    if (!reason.trim()) {
      window.alert('Please provide a rejection reason.');
      return;
    }

    const confirmed = window.confirm(
      'Reject this order? This will cancel the entire unpaid customer checkout.'
    );

    if (!confirmed) return;

    try {
      await rejectOrder.mutateAsync({
        id: order.id,
        reason: reason.trim(),
      });

      setSelectedId(null);
    } catch {
      // The mutation error is displayed below.
    }
  }

  if (session.isLoading) {
    return <main className="message"><p>Loading vendor account...</p></main>;
  }

  if (session.isError) {
    return (
      <main className="message">
        <h1>Unable to load account</h1>
        <p>{getErrorMessage(session.error)}</p>
      </main>
    );
  }

  const user = session.data?.user;

  return (
    <main className="vendor-dashboard">
      <header className="vendor-dashboard-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1>Vendor Dashboard</h1>
          <p className="muted">
            Welcome{user?.fullName ? `, ${user.fullName}` : ''}.
            Manage your incoming orders here.
          </p>
        </div>

        <div className="vendor-dashboard-actions">
          <Link to="/vendor/products" className="vendor-back-link">
            Manage products
          </Link>
          <Link to="/" className="vendor-back-link">
            Visit store
          </Link>

          <Button
            type="button"
            variant="secondary"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {logout.isPending ? 'Signing out...' : 'Sign out'}
          </Button>
        </div>
      </header>
      <section className="vendor-earnings-grid">
        <article className="vendor-earning-card">
            <span>Potential order value</span>
            <strong>{formatNaira(summary.orderValueKobo)}</strong>
        </article>

        <article className="vendor-earning-card">
            <span>Platform commission</span>
            <strong>{formatNaira(summary.commissionKobo)}</strong>
        </article>

        <article className="vendor-earning-card vendor-earning-highlight">
            <span>Potential vendor earnings</span>
            <strong>{formatNaira(summary.earningsKobo)}</strong>
        </article>
        </section>

        <p className="vendor-earnings-note">
        These figures exclude cancelled orders and may include unpaid orders.
        They are not confirmed payouts.
        </p>

      <section className="vendor-dashboard-card">
        <div className="vendor-section-heading">
          <div>
            <h2>Your orders</h2>
            <p className="muted">
              Review customer orders and respond to pending requests.
            </p>
          </div>
        </div>

        <div className="vendor-order-filters">
          <label htmlFor="vendor-order-filter">Filter orders</label>
          <select
            id="vendor-order-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All orders</option>
            <option value="pending">Awaiting response</option>
            <option value="accepted">Accepted</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready for dispatch</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {ordersQuery.isLoading && (
          <p className="vendor-feedback">Loading your orders...</p>
        )}

        {ordersQuery.isError && (
          <p className="vendor-feedback vendor-error">
            {getErrorMessage(ordersQuery.error)}
          </p>
        )}

        {!ordersQuery.isLoading && !ordersQuery.isError && (
          <>
            {filteredOrders.length === 0 ? (
              <div className="vendor-empty-state">
                <h3>No orders found</h3>
                <p className="muted">
                  Orders matching this filter will appear here.
                </p>
              </div>
            ) : (
              <div className="vendor-orders-list">
                {filteredOrders.map((order) => (
                  <article
                    className={`vendor-order-card ${
                      selectedId === order.id ? 'is-selected' : ''
                    }`}
                    key={order.id}
                  >
                    <div className="vendor-order-main">
                      <div>
                        <span className="vendor-order-reference">
                          Order #{order.id}
                        </span>
                        <p className="muted">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>

                      <StatusBadge status={order.status} />
                    </div>

                    <div className="vendor-order-summary">
                      <span>
                        {formatNaira(order.subtotalKobo)}
                      </span>
                      <span>
                        Payment: {order.paymentStatus || 'Unknown'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="vendor-view-order"
                      onClick={() => setSelectedId(
                        selectedId === order.id ? null : order.id
                      )}
                    >
                      {selectedId === order.id
                        ? 'Close details'
                        : 'View order details'}
                    </button>
                  </article>
                ))}
              </div>
            )}

            <div className="vendor-pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>

              <span>Page {pagination.page || page}</span>

              <button
                type="button"
                disabled={
                  !pagination.hasMore &&
                  (!pagination.totalPages || page >= pagination.totalPages)
                }
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      {selectedId && (
        <section className="vendor-dashboard-card vendor-detail-section">
          <div className="vendor-section-heading">
            <h2>Order details</h2>
            <button
              type="button"
              className="vendor-close-detail"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>

          {detailQuery.isLoading && (
            <p className="vendor-feedback">Loading order details...</p>
          )}

          {detailQuery.isError && (
            <p className="vendor-feedback vendor-error">
              {getErrorMessage(detailQuery.error)}
            </p>
          )}

          {selectedOrder && (
            <>
              <div className="vendor-detail-grid">
                <div>
                  <span className="vendor-detail-label">Order status</span>
                  <StatusBadge status={selectedOrder.status} />
                </div>

                <div>
                  <span className="vendor-detail-label">Payment status</span>
                  <strong>{selectedOrder.paymentStatus || 'Unknown'}</strong>
                </div>

                <div>
                  <span className="vendor-detail-label">Order subtotal</span>
                  <strong>{formatNaira(selectedOrder.subtotalKobo)}</strong>
                </div>

                <div>
                  <span className="vendor-detail-label">Date received</span>
                  <strong>{formatDate(selectedOrder.createdAt)}</strong>
                </div>
              </div>

              <div className="vendor-customer-details">
                <h3>Delivery information</h3>

                <p>
                    <strong>{selectedOrder.deliveryAddress?.recipientName}</strong>
                </p>

                <p>{selectedOrder.deliveryAddress?.recipientPhone}</p>

                <p>
                    {[
                    selectedOrder.deliveryAddress?.addressLine1,
                    selectedOrder.deliveryAddress?.addressLine2,
                    selectedOrder.deliveryAddress?.area,
                    selectedOrder.deliveryAddress?.city,
                    selectedOrder.deliveryAddress?.state,
                    ].filter(Boolean).join(', ')}
                </p>

                {selectedOrder.deliveryAddress?.landmark && (
                    <p>
                    Landmark: {selectedOrder.deliveryAddress.landmark}
                    </p>
                )}

                {selectedOrder.deliveryAddress?.deliveryInstructions && (
                    <p>
                    Instructions: {selectedOrder.deliveryAddress.deliveryInstructions}
                    </p>
                )}
                </div>

              <div className="vendor-items-section">
                <h3>Items in this order</h3>

                {(selectedOrder.items || []).map((item) => (
                    <div className="vendor-item-row" key={item.productId}>
                    <div>
                      <strong>{item.productName}</strong>
                      <p className="muted">
                        {item.quantity} × {formatNaira(item.unitPriceKobo)}
                      </p>
                    </div>

                    <strong>{formatNaira(item.lineTotalKobo)}</strong>
                  </div>
                ))}
              </div>

              {selectedOrder.status === 'pending' &&
                selectedOrder.paymentStatus === 'unpaid' && (
                  <div className="vendor-order-actions">
                    <Button
                      type="button"
                      onClick={() => handleAccept(selectedOrder)}
                      disabled={acceptOrder.isPending || rejectOrder.isPending}
                    >
                      {acceptOrder.isPending ? 'Accepting...' : 'Accept order'}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleReject(selectedOrder)}
                      disabled={acceptOrder.isPending || rejectOrder.isPending}
                    >
                      {rejectOrder.isPending ? 'Rejecting...' : 'Reject order'}
                    </Button>
                  </div>
                )}

              {acceptOrder.isError && (
                <p className="vendor-error">
                  {getErrorMessage(acceptOrder.error)}
                </p>
              )}

              {rejectOrder.isError && (
                <p className="vendor-error">
                  {getErrorMessage(rejectOrder.error)}
                </p>
              )}

              {acceptOrder.isSuccess && (
                <p className="vendor-success">Order accepted successfully.</p>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}