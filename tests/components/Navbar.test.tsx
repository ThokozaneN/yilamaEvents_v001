import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Navbar } from '../../components/Navbar';
import { UserRole, OrganizerTier, Profile } from '../../types';

describe('Navbar Component', () => {
  const mockNavigate = vi.fn();
  const mockLogout = vi.fn();

  it('renders sign in button when no user is logged in', () => {
    render(
      <Navbar 
        user={null} 
        currentView="home" 
        onNavigate={mockNavigate} 
        onLogout={mockLogout} 
      />
    );
    expect(screen.getByText(/Sign In/i)).toBeInTheDocument();
  });

  it('renders user name and sign out when user is logged in', () => {
    const mockUser: Profile = {
      id: '123',
      name: 'Thokozane Nxumalo',
      email: 'thoko@example.com',
      role: UserRole.USER,
      organizer_tier: OrganizerTier.FREE,
      organizer_trust_score: 100,
      organizer_status: 'active',
      created_at: new Date().toISOString(),
      email_verified: true,
      verification_status: 'verified'
    };

    render(
      <Navbar 
        user={mockUser} 
        currentView="home" 
        onNavigate={mockNavigate} 
        onLogout={mockLogout} 
      />
    );
    
    expect(screen.getByText(/Thokozane/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign Out/i)).toBeInTheDocument();
  });
});