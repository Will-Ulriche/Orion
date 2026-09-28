import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#1a1921] overflow-hidden">
      <Sidebar />
      <main className="flex-1 bg-slate-50 rounded-2xl m-4 ml-0 overflow-auto shadow-2xl relative">
        <Outlet />
      </main>
    </div>
  );
}
