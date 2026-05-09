import { NavLink } from 'react-router-dom';
import { Camera, List, BarChart2, Settings } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

export default function BottomNav() {
  const { t } = useLanguage();

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <Camera size={22} />
        <span>{t('navScan')}</span>
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <List size={22} />
        <span>{t('navHistory')}</span>
      </NavLink>
      <NavLink to="/analytics" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <BarChart2 size={22} />
        <span>{t('navAnalytics')}</span>
      </NavLink>
      <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <Settings size={22} />
        <span>{t('navSettings')}</span>
      </NavLink>
    </nav>
  );
}
