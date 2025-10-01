import { renderHook, act } from '@testing-library/react';
import { useMCQSession } from './useMCQSession';
import { SessionManager } from '@/services/sessionService';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock dependencies
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ sessionId: 'test-session-id' }),
  useNavigate: () => jest.fn(),
}));

jest.mock('@/services/sessionService');
jest.mock('@/contexts/AuthContext');
jest.mock('@/contexts/DataContext');
jest.mock('@/components/Toast');
jest.mock('./useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true }),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseData = useData as jest.Mock;
const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children);

const mockMCQs = [
  { id: 'mcq1', question: 'Q1', options: ['A', 'B'], answer: 'A', correctAnswer: 'A', type: 'mcq' },
  { id: 'mcq2', question: 'Q2', options: ['C', 'D'], answer: 'B', correctAnswer: 'D', type: 'mcq' },
];

const mockSession = {
  id: 'test-session-id',
  userId: 'test-user-id',
  mcqIds: ['mcq1', 'mcq2'],
  currentIndex: 0,
  answers: {},
  isFinished: false,
};

describe('useMCQSession Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'test-user-id' }, updateUserDoc: jest.fn() });
    mockUseData.mockReturnValue({ appData: { mcqs: mockMCQs, topics: [], flashcards: [], keyClinicalTopics: [] } });
    mockSessionManager.getSession.mockResolvedValue(mockSession as any);
    queryClient.clear();
  });

  it('should initialize and fetch session data', async () => {
    const { result } = renderHook(() => useMCQSession(), { wrapper });
    
    await act(async () => {
      await queryClient.prefetchQuery({queryKey: ['sessionData', 'test-session-id']});
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentMcq?.id).toBe('mcq1');
    expect(result.current.progress.total).toBe(2);
  });

  it('should handle selecting an option', async () => {
    const { result } = renderHook(() => useMCQSession(), { wrapper });

    await act(async () => {
        await queryClient.prefetchQuery({queryKey: ['sessionData', 'test-session-id']});
    });

    expect(result.current.answers[0]).toBeUndefined();

    await act(async () => {
      result.current.actions.selectOption('A');
    });

    expect(result.current.answers[0].selectedAnswer).toBe('A');
    expect(SessionManager.updateSession).toHaveBeenCalledWith('test-session-id', { answers: { '0': { selectedAnswer: 'A' } } });
  });

  it('should navigate to the next question', async () => {
    const { result } = renderHook(() => useMCQSession(), { wrapper });

    await act(async () => {
        await queryClient.prefetchQuery({queryKey: ['sessionData', 'test-session-id']});
    });

    expect(result.current.currentMcq?.id).toBe('mcq1');

    act(() => {
      result.current.actions.goToQuestion(1);
    });

    expect(result.current.currentMcq?.id).toBe('mcq2');
    expect(result.current.progress.current).toBe(1);
  });
  
  it('should trigger finish modal at the end of the quiz', async () => {
    const { result } = renderHook(() => useMCQSession(), { wrapper });
    
    await act(async () => {
        await queryClient.prefetchQuery({queryKey: ['sessionData', 'test-session-id']});
    });
    
    act(() => {
        result.current.actions.goToQuestion(1);
    });
    
    expect(result.current.actions.isFinishing).toBe(false);

    act(() => {
      result.current.actions.goToNext();
    });
    
    expect(result.current.actions.isFinishing).toBe(true);
  });
});