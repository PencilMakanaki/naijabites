import { Outlet } from 'react-router-dom';
import { CommunityButton } from '../components/CommunityButton.jsx';
import { Footer } from '../components/Footer.jsx';
import { TopBar } from '../components/TopBar.jsx';
import { VerifyBanner } from '../components/VerifyBanner.jsx';

export function StorefrontLayout() {
  return (
    <>
      <TopBar />
      <VerifyBanner />
      <Outlet />
      <Footer />
      <CommunityButton />
    </>
  );
}
