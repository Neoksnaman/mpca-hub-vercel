
import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_LINKS } from '../constants';
import { X, LogOut } from 'lucide-react';
import { AppContext } from '../App';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const context = useContext(AppContext);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-20 transition-opacity md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      ></div>
      <aside
        className={`fixed md:relative flex flex-col h-full bg-primary text-white transition-all duration-300 ease-in-out z-30 ${
          isOpen ? 'w-64' : 'w-0 md:w-20'
        } overflow-hidden`}
      >
        <div className={`flex items-center justify-between p-4 ${isOpen ? '' : 'md:justify-center'}`}>
            <div className={`flex items-center gap-3 ${isOpen ? '' : 'md:hidden'}`}>
                <div className="relative group">
                    <div className="absolute inset-0 bg-white opacity-20 rounded-[1rem] blur-md group-hover:blur-lg transition-all duration-300" />
                    <div className="relative w-11 h-11 bg-white rounded-[1rem] flex items-center justify-center text-primary font-black text-2xl shadow-xl ring-1 ring-white/50 transform group-hover:scale-105 transition-all duration-300">
                        M
                    </div>
                </div>
                {isOpen && (
                    <div className="animate-in fade-in slide-in-from-left-2 duration-300 ml-1">
                        <h1 className="text-[22px] font-black tracking-tight leading-none text-white drop-shadow-sm">MPCA</h1>
                        <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black mt-0.5 ml-0.5">Hub</p>
                    </div>
                )}
            </div>
            
            <button onClick={() => setIsOpen(false)} className="md:hidden text-white">
                <X size={24} />
            </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-2">
          {NAV_LINKS.filter(link => {
            if (link.name === 'Reports') {
              return context?.user?.role === 'Admin';
            }
            return true;
          }).map((link) => (
            <NavLink
              key={link.name}
              to={link.path}
              className={({ isActive }) =>
                `flex items-center p-2 rounded-lg transition-colors duration-200 ${
                  isActive
                    ? 'bg-primary-dark'
                    : 'hover:bg-primary-dark/50'
                } ${isOpen ? 'justify-start' : 'md:justify-center'}`
              }
              title={isOpen ? '' : link.name}
            >
              <link.icon size={20} />
              <span className={`ml-4 ${isOpen ? 'opacity-100' : 'opacity-0 md:hidden'}`}>
                {link.name}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-primary-light/20">
            <button
              onClick={() => context?.logout()}
              className={`w-full flex items-center p-2 rounded-lg transition-colors duration-200 hover:bg-primary-dark/50 ${isOpen ? 'justify-start' : 'md:justify-center'}`}
              title={isOpen ? '' : 'Logout'}
            >
              <LogOut size={20} />
              <span className={`ml-4 ${isOpen ? 'opacity-100' : 'opacity-0 md:hidden'}`}>
                Logout
              </span>
            </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
