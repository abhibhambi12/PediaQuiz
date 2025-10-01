import React, { createContext, useContext, useReducer, useEffect, ReactNode, Dispatch } from 'react';
import { usePersistentState } from '@/hooks/usePersistentState';

type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: Theme;
}

type SettingsAction = { type: 'SET_THEME'; payload: Theme };

interface SettingsContextProps {
  state: SettingsState;
  dispatch: Dispatch<SettingsAction>;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

const settingsReducer = (state: SettingsState, action: SettingsAction): SettingsState => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    default:
      return state;
  }
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [persistedTheme, setPersistedTheme] = usePersistentState<Theme>('pediaquiz-theme', 'system');

  const [state, dispatch] = useReducer(settingsReducer, {
    theme: persistedTheme,
  });

  useEffect(() => {
    setPersistedTheme(state.theme);
    const root = window.document.documentElement;
    if (state.theme === 'dark' || (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.theme, setPersistedTheme]);

  return (
    <SettingsContext.Provider value={{ state, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextProps => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};