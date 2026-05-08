import { NavLink } from 'react-router-dom';
import { Camera, List, BarChart2 } from 'lucide-react';

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <Camera size={22} />
        <span>Scan</span>
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <List size={22} />
        <span>History</span>
      </NavLink>
      <NavLink to="/analytics" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <BarChart2 size={22} />
        <span>Analytics</span>
      </NavLink>
    </nav>
  );
}
