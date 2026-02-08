import React from 'react';
import { User, Page, UserRole } from '../types';
import { LogOut, LayoutGrid, Users, Settings, FileText } from 'lucide-react';

interface LayoutProps {
  currentUser: User;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentUser, currentPage, onNavigate, onLogout, children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate(Page.LIST)}>
            <div className="bg-primary p-2 rounded-lg">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">PharmaPOP Entry</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col items-end text-sm">
              <span className="font-semibold text-slate-700">{currentUser.displayName}</span>
              <span className="text-slate-500">{currentUser.manufacturerName}</span>
              <span className="text-xs text-slate-400">{currentUser.role === UserRole.ADMIN ? '管理者' : '一般'}</span>
            </div>
            
            <button 
              onClick={onLogout}
              className="p-2 text-slate-500 hover:text-danger hover:bg-red-50 rounded-full transition-colors"
              title="ログアウト"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Nav (Simple Toolbar) */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-8 overflow-x-auto">
          <NavButton 
            active={currentPage === Page.LIST || currentPage === Page.EDIT} 
            onClick={() => onNavigate(Page.LIST)}
            icon={<LayoutGrid size={18} />}
            label="エントリーシート一覧"
          />
          
          {/* Account Management (Likely admin only, but explicit request was only for Master) 
              Decided to hide for Staff as well based on 'Unnecessary features' rule */}
          {currentUser.role === UserRole.ADMIN && (
            <NavButton 
               active={currentPage === Page.ACCOUNTS} 
               onClick={() => onNavigate(Page.ACCOUNTS)}
               icon={<Users size={18} />}
               label="アカウント管理"
            />
          )}

          {/* Master Management - Explicitly Admin Only */}
          {currentUser.role === UserRole.ADMIN && (
            <NavButton 
               active={currentPage === Page.MASTERS} 
               onClick={() => onNavigate(Page.MASTERS)}
               icon={<Settings size={18} />}
               label="マスタ管理"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
      ${active 
        ? 'border-primary text-primary' 
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
    `}
  >
    {icon}
    {label}
  </button>
);