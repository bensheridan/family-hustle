import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icon({ name }: { name: string }) {
  const p = { className: 'tabbar__icon', viewBox: '0 0 24 24', 'aria-hidden': true };
  switch (name) {
    case 'home':
      return (
        <svg {...p}>
          <path {...stroke} d="M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-5v-5h-5v5h-5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...p}>
          <rect {...stroke} x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path {...stroke} d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        </svg>
      );
    case 'kids':
      return (
        <svg {...p}>
          <circle {...stroke} cx="9" cy="8.5" r="3" />
          <path {...stroke} d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path {...stroke} d="M16 7.2a2.8 2.8 0 0 1 0 5.6M17.5 19.5c0-2.2-.9-4-2.3-5" />
        </svg>
      );
    case 'work':
      return (
        <svg {...p}>
          <rect {...stroke} x="3.5" y="7.5" width="17" height="12" rx="2.5" />
          <path {...stroke} d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle {...stroke} cx="5" cy="12" r="1.4" />
          <circle {...stroke} cx="12" cy="12" r="1.4" />
          <circle {...stroke} cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}

export function TabBar() {
  const { workers } = useStore();
  const navigate = useNavigate();

  // The work tab only exists once someone in the family actually works shifts.
  const left = [
    { to: '/', label: 'home', icon: 'home' },
    { to: '/calendar', label: 'calendar', icon: 'calendar' },
  ];
  const right = [
    { to: '/kids', label: 'kids', icon: 'kids' },
    ...(workers.length > 0 ? [{ to: '/work', label: 'work', icon: 'work' }] : []),
    { to: '/more', label: 'more', icon: 'more' },
  ];

  return (
    <nav className="tabbar" aria-label="main">
      {left.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tabbar__item">
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}

      <div className="tabbar__add">
        <button
          type="button"
          className="tabbar__addbtn"
          aria-label="add something"
          onClick={() => navigate('/add')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {right.map((t) => (
        <NavLink key={t.to} to={t.to} className="tabbar__item">
          <Icon name={t.icon} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
