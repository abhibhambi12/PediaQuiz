import React from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface DashboardCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  path?: string;
  onClick?: () => void;
  className?: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  description,
  icon,
  path,
  onClick,
  className,
}) => {
  const content = (
    <div
      className={clsx(
        'card-base p-6 text-center flex flex-col items-center gap-3 transition-all duration-200 transform hover:-translate-y-1 hover:shadow-xl',
        'h-full',
        className
      )}
    >
      <div className="w-12 h-12 text-sky-500">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 flex-grow">
        {description}
      </p>
    </div>
  );

  // If a path is provided, wrap with a Link. Otherwise, use a button with onClick.
  if (path) {
    // Handling for anchor links vs. router links
    if (path.startsWith('#')) {
        return (
            <a href={path} onClick={(e) => {
                e.preventDefault();
                document.querySelector(path)?.scrollIntoView({ behavior: 'smooth' });
            }} className="block h-full">
                {content}
            </a>
        );
    }
    return (
      <Link to={path} className="block h-full">
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="w-full h-full text-left">
      {content}
    </button>
  );
};

export default DashboardCard;