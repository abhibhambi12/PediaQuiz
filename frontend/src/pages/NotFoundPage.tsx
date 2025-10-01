import React from 'react';
import { Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <h1 className="text-6xl font-bold text-sky-500">404</h1>
      <h2 className="text-2xl font-semibold mt-4">Page Not Found</h2>
      <p className="mt-2 text-slate-500">Sorry, the page you are looking for does not exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Go Back Home
      </Link>
    </div>
  );
};

export default NotFoundPage;