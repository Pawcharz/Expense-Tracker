import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="skeleton-block" style={{ width: '120px', height: '20px', borderRadius: '6px' }} />
        <div className="skeleton-block" style={{ width: '200px', height: '20px', borderRadius: '6px', marginTop: '12px' }} />
        <div className="skeleton-block" style={{ width: '160px', height: '20px', borderRadius: '6px', marginTop: '12px' }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
