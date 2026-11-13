import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="mx-auto max-w-lg px-4 py-16 text-center">
    <h1 className="text-3xl font-extrabold text-[var(--ink)]">Seite nicht gefunden</h1>
    <p className="mt-2 text-sm text-[var(--body)]">Die aufgerufene Seite existiert nicht.</p>
    <Link
      to="/dashboard"
      className="mt-6 inline-flex text-sm font-medium text-[var(--primary-text)] underline underline-offset-4"
    >
      Zur Übersicht
    </Link>
  </div>
);

export default NotFound;
