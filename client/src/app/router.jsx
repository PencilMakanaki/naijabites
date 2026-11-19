import { createBrowserRouter } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { RequireRole } from './guards.jsx';
import { StorefrontLayout } from './StorefrontLayout.jsx';
import { About } from '../pages/About.jsx';
import { Account } from '../pages/Account.jsx';
import { AdminHome } from '../pages/AdminHome.jsx';
import { Community } from '../pages/Community.jsx';
import { Cart } from '../pages/Cart.jsx';
import { Addresses } from '../pages/Addresses.jsx';
import { Checkout } from '../pages/Checkout.jsx';
import { ForgotPassword } from '../pages/ForgotPassword.jsx';
import { Home } from '../pages/Home.jsx';
import { NotFound } from '../pages/NotFound.jsx';
import { ProductModal } from '../pages/ProductModal.jsx';
import { ResetPassword } from '../pages/ResetPassword.jsx';
import { SignIn } from '../pages/SignIn.jsx';
import { SignUp } from '../pages/SignUp.jsx';
import { VendorPage } from '../pages/VendorPage.jsx';
import { ConfirmEmailChange, VerifyEmail } from '../pages/TokenResult.jsx';
import { AdminDeliveryZones } from '../pages/AdminDeliveryZones.jsx';
import { VendorDashboard } from '../pages/VendorDashboard.jsx';
import { VendorProducts } from '../pages/VendorProducts.jsx';
import { PaymentCallback } from '../pages/PaymentCallback.jsx';
import { AdminDeliveries } from '../pages/AdminDeliveries.jsx';
import { RiderDeliveries } from '../pages/RiderDeliveries.jsx';
import { OrderTracking } from '../pages/OrderTracking.jsx';
import { TrackOrder } from '../pages/TrackOrder.jsx';
import { RiderDashboard } from '../pages/RiderDashboard.jsx';
import { VendorRegister } from '../pages/VendorRegister.jsx';
import { RiderPortal } from '../pages/RiderPortal.jsx';
import { AdminRiders } from '../pages/AdminRiders.jsx';
import { AdminVendors } from '../pages/AdminVendors.jsx';


export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: 'signup', element: <SignUp /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password/:token', element: <ResetPassword /> },
      { path: 'verify-email/:token', element: <VerifyEmail /> },
      { path: 'confirm-email/:token', element: <ConfirmEmailChange /> },
    ],
  },
  {
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <Home /> },
      // The sign-in pop-up opens over the home page, like the original.
      { path: 'signin', element: (<><Home /><SignIn /></>) },
      // A product opens as a pop-up over the storefront, and its address can be shared.
      { path: 'p/:id', element: (<><Home /><ProductModal /></>) },
      { path: 'vendors/:slug', element: <VendorPage /> },
      { path: 'about', element: <About /> },
      { path: 'community', element: <Community /> },
      { path: 'cart', element: (<RequireRole role="customer"><Cart /></RequireRole>) },
      { path: 'addresses', element: (<RequireRole role="customer"><Addresses /></RequireRole>) },
      { path: 'checkout', element: (<RequireRole role="customer"><Checkout /></RequireRole>) },
      { path: 'account', element: (<RequireRole role="customer"><Account /></RequireRole>) },
      { path: 'rider-portal', element: <RiderPortal /> },
      { path: 'rider/apply', element: <RequireRole role="customer"><RiderPortal /></RequireRole> },
      { path: 'orders/:id/tracking', element: <RequireRole role="customer"><OrderTracking /></RequireRole> },
      { path: 'vendor/register', element: <VendorRegister /> },
      { path: 'track/:orderId', element: <RequireRole role="customer"><TrackOrder /></RequireRole> },
      { path: 'payment/callback', element: <RequireRole role="customer"><PaymentCallback /></RequireRole> },
      { path: 'vendor/products', element: (<RequireRole role="vendor"><VendorProducts /></RequireRole>) },
      {
        path: 'vendor',
        element: (
          <RequireRole role="vendor">
            <VendorDashboard />
          </RequireRole>
        ),
      },
      { path: 'admin', element: (<RequireRole role="admin"><AdminHome /></RequireRole>) },
      { path: 'admin/riders', element: <RequireRole role="admin"><AdminRiders /></RequireRole> },
      { path: 'admin/vendors', element: <RequireRole role="admin"><AdminVendors /></RequireRole> },
      { path: 'admin/deliveries', element: <RequireRole role="admin"><AdminDeliveries /></RequireRole> },
      { path: 'rider/deliveries', element: <RequireRole role="rider"><RiderDeliveries /></RequireRole> },
      { path: 'rider/dashboard', element: <RequireRole role="rider"><RiderDashboard /></RequireRole> },
      { path: 'admin/delivery-zones', 
        element: (
        <RequireRole role="admin">
        <AdminDeliveryZones />
        </RequireRole>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);