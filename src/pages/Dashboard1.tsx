import React from 'react';
import { Search, Mail, Bell, Calendar as CalendarIcon, Phone, MessageSquare, MoreHorizontal, ArrowLeft, ArrowRight } from 'lucide-react';

export default function Dashboard1() {
  return (
    <div className="flex flex-col h-full bg-[#F5F7FB] overflow-hidden font-sans p-6">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex items-center gap-6">
          <button className="text-slate-400 hover:text-slate-600"><Search size={20} /></button>
          <button className="text-slate-400 hover:text-slate-600"><Mail size={20} /></button>
          <button className="relative text-slate-400 hover:text-slate-600">
            <Bell size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="flex items-center gap-3 ml-4">
            <span className="font-semibold text-sm text-slate-800">Mr Smith</span>
            <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Profile" className="w-9 h-9 rounded-full shadow-sm" />
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col gap-6 min-h-0">
          
          {/* BANNER */}
          <div className="bg-[#6658d3] rounded-3xl p-6 text-white relative overflow-hidden flex justify-between items-center h-[180px] flex-shrink-0">
            <div className="relative z-10 max-w-md">
              <h2 className="text-2xl font-bold mb-3">Hello Mr Smith!</h2>
              <p className="text-[#d8d4f5] text-sm leading-relaxed mb-6">
                Today you have 9 new applications.<br />
                Also you need to hire ROR Developer, React JS<br />
                Developer.
              </p>
              <button className="bg-[#ffb038] hover:bg-[#ffa015] text-white px-6 py-2.5 rounded-full text-sm font-semibold transition-colors shadow-lg">
                Read more
              </button>
            </div>
            {/* Illustration Placeholder */}
            <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-[url('https://cdn.dribbble.com/users/418188/screenshots/15444827/media/539eb8ff18eeb68ad6bcfc2e99f660ba.png?resize=800x600&vertical=center')] bg-cover bg-left opacity-90 mix-blend-screen pointer-events-none"></div>
          </div>

          {/* CHARTS SECTION (Money status) */}
          <div className="flex-1 flex flex-col min-h-0 bg-white rounded-3xl shadow-sm p-6 relative">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-700">Money status</h3>
              <button className="text-slate-500 font-medium text-sm flex items-center gap-1 hover:text-slate-700">
                Week <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
            </div>
            
            <div className="flex-1 relative flex flex-col mt-2">
              {/* Grid Lines & Y-Axis */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                {[ '20k', '10k', '5k', '0'].map((label, i) => (
                  <div key={i} className="flex items-center w-full gap-4">
                    <span className="w-6 text-right text-xs font-semibold text-slate-300">{label}</span>
                    <div className="flex-1 border-b border-slate-100"></div>
                  </div>
                ))}
              </div>

              {/* Bars Area */}
              <div className="flex-1 flex items-end justify-between ml-14 mr-4 pb-6 relative z-10">
                {[
                  { day: 'Su', stacks: [25, 25, 15, 20], right: 50 },
                  { day: 'Mo', stacks: [8, 15, 10, 15], right: 8 },
                  { day: 'Tu', stacks: [0, 25, 0, 0], right: 45 },
                  { day: 'We', stacks: [38, 0, 18, 40], right: 62 },
                  { day: 'Th', stacks: [0, 15, 12, 15], right: 58 },
                  { day: 'Fr', stacks: [12, 12, 15, 15], right: 82 },
                  { day: 'Sa', stacks: [22, 18, 12, 15], right: 68 },
                ].map((d, i) => (
                  <div key={i} className="flex gap-1.5 h-full items-end">
                    
                    {/* Left Stacked Bar */}
                    <div className="w-2.5 flex flex-col justify-end gap-0 h-full">
                      <div className="flex flex-col-reverse justify-start w-full" style={{ height: `${d.stacks.reduce((a,b)=>a+b,0)}%` }}>
                        {d.stacks.map((val, idx) => {
                          if (val === 0) return null;
                          const bg = ['bg-[#6633cc]', 'bg-[#3366ff]', 'bg-[#ffcc00]', 'bg-[#ff3399]'][idx];
                          const isTop = idx === d.stacks.findLastIndex(v => v > 0);
                          const isBottom = idx === d.stacks.findIndex(v => v > 0);
                          return (
                            <div 
                              key={idx} 
                              className={`w-full ${bg} ${isTop ? 'rounded-t-full' : ''} ${isBottom ? 'rounded-b-sm' : ''}`} 
                              style={{ height: `${(val / d.stacks.reduce((a,b)=>a+b,0)) * 100}%` }}
                            ></div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Solid Bar */}
                    <div className="w-2.5 flex flex-col justify-end h-full">
                      <div className="w-full bg-[#48dbfb] rounded-t-full rounded-b-sm" style={{ height: `${d.right}%` }}></div>
                    </div>

                  </div>
                ))}
              </div>

              {/* X-Axis */}
              <div className="flex justify-between ml-14 mr-4 text-xs font-semibold text-slate-400 absolute bottom-0 left-0 right-0">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <div key={day} className="w-[26px] text-center">{day}</div>
                ))}
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full xl:w-[320px] flex flex-col gap-4 flex-shrink-0">
          
          {/* CALENDAR */}
          <div className="bg-white rounded-3xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800">October, 2020</h3>
              <div className="flex gap-1.5">
                <button className="w-7 h-7 flex items-center justify-center bg-[#6658d3] text-white rounded-md hover:bg-[#5346b4]"><ArrowLeft size={14} /></button>
                <button className="w-7 h-7 flex items-center justify-center bg-[#6658d3] text-white rounded-md hover:bg-[#5346b4]"><ArrowRight size={14} /></button>
              </div>
            </div>
            
            {/* Calendar Filters Fake */}
            <div className="flex gap-2 mb-3">
               <div className="bg-[#f5f6fa] rounded-full px-4 py-1.5 text-xs text-slate-500 font-medium flex-1 flex justify-between items-center">
                 <span>16, 10, 20</span>
                 <ArrowDownUp size={12} />
               </div>
               <div className="bg-[#f5f6fa] rounded-full px-4 py-1.5 text-xs text-slate-500 font-medium flex-1 flex justify-between items-center">
                 <span>16, 10, 20</span>
                 <ArrowDownUp size={12} />
               </div>
            </div>

            <div className="grid grid-cols-7 gap-y-2 text-center mb-1">
              {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map(d => (
                <div key={d} className="text-[10px] font-bold text-slate-400">{d}</div>
              ))}
              
              {/* Fake Calendar Days */}
              {[...Array(30)].map((_, i) => {
                const day = i + 1;
                const isSelected = day === 9;
                const hasEvent = day === 16;
                return (
                  <div key={day} className="flex justify-center relative">
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-semibold
                      ${isSelected ? 'bg-[#6658d3] text-white shadow-md' : 'text-slate-600'}`}>
                      {day}
                    </span>
                    {hasEvent && <span className="absolute bottom-0 w-1 h-1 bg-[#ffb038] rounded-full"></span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* PROFILE CARD */}
          <div className="bg-white rounded-3xl p-4 shadow-sm flex flex-col items-center flex-1">
            <div className="relative mb-2">
              <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Profile" className="w-14 h-14 rounded-2xl object-cover shadow-sm" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Mr Smith</h3>
            <p className="text-slate-400 text-xs mb-5">Sr. HR Manager</p>

            <div className="flex gap-3 mb-4">
              <button className="w-9 h-9 rounded-full bg-[#f3f0ff] text-[#6658d3] flex items-center justify-center hover:bg-[#e0d6ff] transition-colors">
                <Phone size={16} />
              </button>
              <button className="w-9 h-9 rounded-full bg-[#f3f0ff] text-[#6658d3] flex items-center justify-center hover:bg-[#e0d6ff] transition-colors">
                <Mail size={16} />
              </button>
              <button className="w-9 h-9 rounded-full bg-[#f3f0ff] text-[#6658d3] flex items-center justify-center hover:bg-[#e0d6ff] transition-colors">
                <MessageSquare size={16} />
              </button>
            </div>

            <div className="w-full space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Company</span>
                <span className="text-slate-800 font-semibold text-xs">FoxHR Pvt. Ltd</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Joining Date</span>
                <span className="text-slate-800 font-semibold text-xs">01/08/2018</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Projects</span>
                <span className="text-slate-800 font-semibold text-xs">34 Active</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Just a quick icon patch for the calendar header
function ArrowDownUp({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>
    </svg>
  );
}
