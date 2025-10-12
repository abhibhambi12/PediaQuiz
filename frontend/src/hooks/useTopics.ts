import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Topic } from '@pediaquiz/types';

/**
 * --- BATCH 3: PERFORMANCE OPTIMIZATION ---
 * Custom hook to get all topics from the application's global data context.
 * REFACTOR: This hook no longer makes its own network call. It now efficiently
 * sources its data directly from the `DataContext`, which is populated once
 * on application load. This eliminates a major redundant data fetch.
 */
export function useTopics() {
    // The `useData` hook provides access to the globally fetched and cached appData.
    const { appData, isLoadingData, errorLoadingData } = useData();

    // The topics array is memoized to prevent unnecessary re-calculations or re-renders
    // in components that consume this hook.
    const topics = useMemo(() => {
        // A null-safety check is included. If appData hasn't loaded or an error occurred,
        // it returns an empty array to prevent downstream components from crashing.
        return (appData?.topics as Topic[]) || [];
    }, [appData]);

    // The hook now returns data in a shape that is identical to what React Query
    // would provide. This ensures that no changes are needed in the components
    // that consume this hook, making the refactor seamless.
    return {
        data: topics,
        isLoading: isLoadingData,
        error: errorLoadingData,
    };
}