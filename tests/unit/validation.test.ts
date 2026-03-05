import { describe, it, expect } from 'vitest';
import { signInSchema, signUpSchema, eventSchema, ticketTierSchema, profileUpdateSchema } from '../../lib/validation';

// ─── signInSchema ─────────────────────────────────────────────────────────────
describe('signInSchema', () => {
  it('accepts valid credentials', () => {
    expect(signInSchema.safeParse({ email: 'user@example.com', password: 'secret' }).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'secret' }).success).toBe(false);
  });

  it('rejects empty password', () => {
    expect(signInSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
  });

  it('normalises email to lowercase', () => {
    const result = signInSchema.safeParse({ email: 'User@EXAMPLE.COM', password: 'pass' });
    expect(result.success && result.data.email).toBe('user@example.com');
  });
});

// ─── signUpSchema ─────────────────────────────────────────────────────────────
describe('signUpSchema', () => {
  const VALID = {
    fullName: 'Thokozane Nkosi',
    email: 'thoko@yilama.co.za',
    password: 'Str0ng!Pass',
    confirmPassword: 'Str0ng!Pass',
  };

  it('accepts a complete valid payload', () => {
    expect(signUpSchema.safeParse(VALID).success).toBe(true);
  });

  it('requires full name ≥ 3 characters', () => {
    expect(signUpSchema.safeParse({ ...VALID, fullName: 'AB' }).success).toBe(false);
  });

  it('rejects password without uppercase letter', () => {
    const pw = 'str0ng!pass';
    expect(signUpSchema.safeParse({ ...VALID, password: pw, confirmPassword: pw }).success).toBe(false);
  });

  it('rejects password without a number', () => {
    const pw = 'StrongPass!';
    expect(signUpSchema.safeParse({ ...VALID, password: pw, confirmPassword: pw }).success).toBe(false);
  });

  it('rejects password without a special character', () => {
    const pw = 'Str0ngPass1';
    expect(signUpSchema.safeParse({ ...VALID, password: pw, confirmPassword: pw }).success).toBe(false);
  });

  it('rejects mismatched confirm password', () => {
    expect(signUpSchema.safeParse({ ...VALID, confirmPassword: 'DifferentPass1!' }).success).toBe(false);
  });

  it('accepts optional SA phone number in correct format', () => {
    expect(signUpSchema.safeParse({ ...VALID, phone: '0821234567' }).success).toBe(true);
  });

  it('rejects invalid SA phone number', () => {
    expect(signUpSchema.safeParse({ ...VALID, phone: '01234' }).success).toBe(false);
  });

  it('accepts empty string for optional phone', () => {
    expect(signUpSchema.safeParse({ ...VALID, phone: '' }).success).toBe(true);
  });
});

// ─── eventSchema ──────────────────────────────────────────────────────────────
describe('eventSchema', () => {
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const VALID = {
    title: 'Yilama Summer Festival',
    category: 'Music',
    description: 'A fantastic summer event with live music and food.',
    venue: '45 Long Street, Cape Town',
    starts_at: FUTURE,
    total_ticket_limit: 500,
  };

  it('accepts a complete valid event', () => {
    expect(eventSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects title shorter than 3 characters', () => {
    expect(eventSchema.safeParse({ ...VALID, title: 'AB' }).success).toBe(false);
  });

  it('rejects description shorter than 10 characters', () => {
    expect(eventSchema.safeParse({ ...VALID, description: 'Too short' }).success).toBe(false);
  });

  it('rejects an event starting in the past', () => {
    expect(eventSchema.safeParse({ ...VALID, starts_at: '2020-01-01T00:00:00Z' }).success).toBe(false);
  });

  it('rejects zero ticket limit', () => {
    expect(eventSchema.safeParse({ ...VALID, total_ticket_limit: 0 }).success).toBe(false);
  });
});

// ─── ticketTierSchema ─────────────────────────────────────────────────────────
describe('ticketTierSchema', () => {
  it('accepts a valid free tier', () => {
    expect(ticketTierSchema.safeParse({ name: 'Free Entry', price: 0, quantity_limit: 100 }).success).toBe(true);
  });

  it('rejects a negative price', () => {
    expect(ticketTierSchema.safeParse({ name: 'VIP', price: -50, quantity_limit: 10 }).success).toBe(false);
  });

  it('rejects zero quantity', () => {
    expect(ticketTierSchema.safeParse({ name: 'GA', price: 100, quantity_limit: 0 }).success).toBe(false);
  });

  it('rejects tier name shorter than 2 characters', () => {
    expect(ticketTierSchema.safeParse({ name: 'A', price: 100, quantity_limit: 100 }).success).toBe(false);
  });
});

// ─── profileUpdateSchema ──────────────────────────────────────────────────────
describe('profileUpdateSchema', () => {
  it('accepts a minimal valid profile', () => {
    expect(profileUpdateSchema.safeParse({ name: 'Thoko Nkosi' }).success).toBe(true);
  });

  it('rejects name shorter than 3 characters', () => {
    expect(profileUpdateSchema.safeParse({ name: 'AB' }).success).toBe(false);
  });

  it('accepts a valid website URL', () => {
    expect(profileUpdateSchema.safeParse({ name: 'Thoko', website_url: 'https://yilama.co.za' }).success).toBe(true);
  });

  it('rejects an invalid website URL', () => {
    expect(profileUpdateSchema.safeParse({ name: 'Thoko', website_url: 'not-a-url' }).success).toBe(false);
  });

  it('accepts an empty string for website_url (no website)', () => {
    expect(profileUpdateSchema.safeParse({ name: 'Thoko', website_url: '' }).success).toBe(true);
  });
});