import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import { AuthContext } from '@/contexts/AuthContext';
import { ClientUser } from '@pediaquiz/types';

// Mock child components
jest.mock('./NotificationsPanel', () => () => <div data-testid="notifications-panel" />);
jest.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true }),
}));

describe('Header Component', () => {
  const renderWithProviders = (ui: React.ReactElement, user: ClientUser | null, loading: boolean = false) => {
    return render(
      <MemoryRouter>
        <AuthContext.Provider value={{ user, loading, logout: jest.fn(), refreshUser: jest.fn(), updateUserDoc: jest.fn() }}>
          {ui}
        </AuthContext.Provider>
      </MemoryRouter>
    );
  };

  it('renders the PediaQuiz brand name', () => {
    renderWithProviders(<Header />, null);
    expect(screen.getByText('PediaQuiz')).toBeInTheDocument();
  });

  it('does not show admin link for student users', () => {
    const regularUser: ClientUser = {
      uid: '123', email: 'test@test.com', displayName: 'Test User', isAdmin: false, role: 'student',
      createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
    };
    renderWithProviders(<Header />, regularUser);
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows admin link for admin users', () => {
    const adminUser: ClientUser = {
      uid: '456', email: 'admin@test.com', displayName: 'Admin User', isAdmin: true, role: 'admin',
      createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
    };
    renderWithProviders(<Header />, adminUser);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('shows user display name and level when logged in', () => {
    const testUser: ClientUser = {
      uid: '123', email: 'test@test.com', displayName: 'Dr. Test', isAdmin: false, role: 'student',
      xp: 600, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(),
    };
    renderWithProviders(<Header />, testUser);
    expect(screen.getByText('Dr. Test')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
  });

  it('does not show user info when logged out', () => {
    renderWithProviders(<Header />, null);
    expect(screen.queryByText('Level', { exact: false })).not.toBeInTheDocument();
  });
});