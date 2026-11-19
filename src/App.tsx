import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ViewProvider } from './lib/view';
import { EmptyState } from './components/States';
import { AboutPage } from './pages/AboutPage';
import { ArchiveDayPage, ArchivePage } from './pages/ArchivePage';
import { HomePage } from './pages/HomePage';
import { CategoriesPage, CategoryPage, LatestPage, PapersPage, PatentsPage, TrialsPage } from './pages/ListPages';

/** Hash routing keeps deep links working on GitHub Pages without server-side rewrites. */
export function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/latest" element={<LatestPage />} />
        <Route path="/papers" element={<PapersPage />} />
        <Route path="/patents" element={<PatentsPage />} />
        <Route path="/trials" element={<TrialsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/categories/:id" element={<CategoryPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/archive/:date" element={<ArchiveDayPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="*"
          element={
            <EmptyState title="Page not found">
              <Link to="/" className="link">
                Back to today&apos;s briefing
              </Link>
            </EmptyState>
          }
        />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ViewProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ViewProvider>
  );
}
