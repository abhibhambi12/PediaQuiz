import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRightIcon } from '@heroicons/react/24/solid';

const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  if (pathnames.length === 0) {
    return null;
  }

  const breadcrumbs = pathnames.map((value, index) => {
    const to = `/${pathnames.slice(0, index + 1).join('/')}`;
    const isLast = index === pathnames.length - 1;
    // Simple transformation for display
    const displayValue = value.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
      <li key={to} className="flex items-center">
        {!isLast ? (
          <Link to={to} className="text-sky-600 hover:underline dark:text-sky-400">
            {displayValue}
          </Link>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{displayValue}</span>
        )}
        {!isLast && <ChevronRightIcon className="h-4 w-4 mx-1 text-slate-400" />}
      </li>
    );
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center space-x-1 text-sm">
        <li className="flex items-center">
          <Link to="/" className="text-slate-500 hover:text-sky-600 dark:hover:text-sky-400">
            Home
          </Link>
          <ChevronRightIcon className="h-4 w-4 mx-1 text-slate-400" />
        </li>
        {breadcrumbs}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;