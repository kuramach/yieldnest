import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TrendingUp, LayoutDashboard, FolderOpen, Settings, LogOut, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

async function LogoutButton() {
  // Server action for logout
  async function logout() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  return (
    <form action={logout}>
      <button
        type="submit"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </form>
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dashboard', label: 'Portfolios', icon: FolderOpen },
    { href: '/dashboard', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-slate-100">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">YieldNest</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* 360R link */}
        <div className="px-3 pb-2">
          <a
            href="https://360-retirement.eazybudget.com/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            ← Retirement Planner
          </a>
        </div>

        {/* User + logout */}
        <div className="px-3 py-4 border-t border-slate-100 space-y-1">
          <div className="px-3 py-2">
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
