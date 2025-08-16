import { LoaderIcon } from './Icons';

interface LoaderProps {
    message: string;
}

const Loader: React.FC<LoaderProps> = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-4">
        <LoaderIcon />
        <p className="mt-4 text-lg font-medium text-slate-500 dark:text-slate-400">{message}</p>
    </div>
);

export default Loader;