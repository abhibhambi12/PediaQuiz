import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';

/**
 * FIX #9: Custom hook to get all topics from the application's global data context.
 * This hook no longer makes a redundant network call. It efficiently
 * sources its data from the already-fetched and cached appData.
 */
export function useTopics() {
    const { appData, isLoadingData, errorLoadingData } = useData();

    // Memoize the topics array to prevent unnecessary re-renders in consuming components
    const topics = useMemo(() => {
        return appData?.topics || [];
    }, [appData]);

    // Return data in a shape consistent with React Query for easy component integration.
    return {
        data: topics,
        isLoading: isLoadingData,
        error: errorLoadingData,
    };
}