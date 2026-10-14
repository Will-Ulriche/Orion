import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import UpdateModal from './UpdateModal';
import UpdateNotificationToast from './UpdateNotificationToast';

export default function Layout() {
  return (
    <div className="flex h-screen bg-[#1a1921] overflow-hidden">
      <Sidebar />
      <div className="flex-1 m-4 ml-0 flex flex-col relative overflow-hidden rounded-2xl shadow-2xl bg-slate-50">
        <main className="flex-1 overflow-auto relative">
          <Outlet />
        </main>
        <UpdateModal />
        <UpdateNotificationToast />
      </div>
    </div>
  );
}
