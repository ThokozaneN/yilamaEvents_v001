import { supabase } from './supabase';
import { logError } from './monitoring';

/**
 * YILAMA EVENTS: PAYFAST UTILITY (v2.0)
 * Handles both Event Ticket payments and Subscription Billing.
 */

export const getPayFastUrl = (isSandbox: boolean = true) => {
  return isSandbox 
    ? "https://sandbox.payfast.co.za/eng/process" 
    : "https://www.payfast.co.za/eng/process";
};

/**
 * Initiates an organizer subscription upgrade.
 * Calls the Edge Function to get signed parameters and redirects the browser.
 */
export const launchSubscriptionUpgrade = async (userId: string, tier: 'pro' | 'premium') => {
  try {
    const { data, error } = await supabase.functions.invoke('create-billing-checkout', {
      body: { userId, tier }
    });

    if (error) throw error;

    // Create a dynamic form to POST to Payfast (required by their API)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.url;

    Object.entries(data.params as Record<string, string>).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    
  } catch (err: any) {
    logError(err, { userId, tier, tag: 'billing_upgrade_failed' });
    throw new Error(err.message || "Failed to initiate checkout. Please ensure your profile is verified.");
  }
};