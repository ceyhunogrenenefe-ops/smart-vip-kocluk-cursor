import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Inbox, LayoutGrid, LogOut, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userRoleTags } from '../../config/rolePermissions';

/** İzole CRM kabuğu — saf crm_agent ana sidebar / faturalama görmez */
export default function CrmLayout() {
  const { effectiveUser, logout } = useAuth();
  const navigate = useNavigate();
  const tags = userRoleTags(effectiveUser);
  const isAdmin = tags.includes('super_admin') || tags.includes('admin');
  const agentOnly =
    tags.includes('crm_agent') &&
    !tags.some((t) =>
      ['super_admin', 'admin', 'coach', 'teacher', 'student', 'vendor_admin'].includes(t)
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Online VIP Dershane
              </p>
              <h1 className="font-serif text-xl font-semibold tracking-tight text-slate-900">CRM</h1>
            </div>
            <nav className="flex flex-wrap items-center gap-1">
              <NavLink
                to="/crm/inbox"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <Inbox className="h-4 w-4" />
                Gelen Kutusu
              </NavLink>
              {isAdmin && (
                <>
                  <NavLink
                    to="/crm"
                    end
                    className={({ isActive }) =>
                      `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Pipeline
                  </NavLink>
                  <NavLink
                    to="/crm/agents"
                    className={({ isActive }) =>
                      `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    <Users className="h-4 w-4" />
                    Ajanlar
                  </NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <span className="hidden max-w-[160px] truncate text-slate-600 sm:inline">
              {effectiveUser?.name || effectiveUser?.email}
              {agentOnly ? ' · Ajan' : ''}
            </span>
            {!agentOnly && (
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Ana panel
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Çıkış
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-2 py-2 sm:px-4 sm:py-4">
        <Outlet />
      </main>
    </div>
  );
}
