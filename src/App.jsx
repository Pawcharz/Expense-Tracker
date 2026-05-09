import { Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import BottomNav from './components/BottomNav';
import Login from './pages/Login';
import Scan from './pages/Scan';
import Review from './pages/Review';
import History from './pages/History';
import ReceiptDetail from './pages/ReceiptDetail';
import Analytics from './pages/Analytics';
import ManualEntry from './pages/ManualEntry';
import Settings from './pages/Settings';

const NO_NAV_PATHS = ['/login', '/review', '/manual'];

export default function App() {
  const location = useLocation();
  const showNav = !NO_NAV_PATHS.includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Scan />} />
          <Route path="/review" element={<Review />} />
          <Route path="/history" element={<History />} />
          <Route path="/receipt/:id" element={<ReceiptDetail />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/manual" element={<ManualEntry />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}
