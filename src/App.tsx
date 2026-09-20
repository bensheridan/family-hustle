import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './state/store';
import { TabBar } from './components/TabBar';
import { Onboarding } from './routes/Onboarding';
import { Home } from './routes/Home';
import { CalendarPage } from './routes/Calendar';
import { AddPage } from './routes/Add';
import { Kids } from './routes/Kids';
import { KidProfile } from './routes/KidProfile';
import { Work } from './routes/Work';
import { More } from './routes/More';
import { Fridge } from './routes/Fridge';
import { Households } from './routes/Households';
import { PreviewBanner } from './components/CareBits';

export function App() {
  const { state } = useStore();
  const { pathname } = useLocation();

  if (!state.settings.onboarded && pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  // the fridge export owns the whole screen — it is a print layout, not a tab
  const bare = pathname === '/welcome' || pathname === '/fridge';

  return (
    <div className="app">
      <PreviewBanner />
      <main className="app__main" style={bare ? { padding: 0 } : undefined}>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/kids" element={<Kids />} />
          <Route path="/kids/:id" element={<KidProfile />} />
          <Route path="/work" element={<Work />} />
          <Route path="/more" element={<More />} />
          <Route path="/households" element={<Households />} />
          <Route path="/fridge" element={<Fridge />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!bare && <TabBar />}
    </div>
  );
}
