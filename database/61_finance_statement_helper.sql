/*
  # Yilama Events: Finance Statement RPC v1.0
  
  Dependencies: 03_financial_architecture.sql, 37_payouts_workflow.sql

  ## Purpose:
  - Provide a single source of truth for the Finance dashboard and PDF statements.
  - Efficiently aggregate sales, fees, refunds, and deductions.
*/

-- Clear old overload to prevent PGRST203 Ambiguous Function error
DROP FUNCTION IF EXISTS get_organizer_financial_summary(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION get_organizer_financial_summary(
    p_organizer_id uuid DEFAULT auth.uid(),
    p_start_date timestamptz DEFAULT now() - interval '30 days',
    p_end_date timestamptz DEFAULT now()
) RETURNS jsonb AS $$
DECLARE
    v_organizer_id uuid;
    v_gross_sales numeric(12,2);
    v_total_refunds numeric(12,2);
    v_platform_fees numeric(12,2);
    v_tier_deductions numeric(12,2);
    v_net_payouts numeric(12,2);
    v_opening_balance numeric(12,2);
    v_closing_balance numeric(12,2);
    v_transactions jsonb;
    v_organizer_name text;
    v_organizer_tier text;
BEGIN
    v_organizer_id := p_organizer_id;

    -- 1. Identity Context
    SELECT name, organizer_tier INTO v_organizer_name, v_organizer_tier
    FROM profiles WHERE id = v_organizer_id;

    -- 2. Opening Balance (Sum of all tx before p_start_date)
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_opening_balance
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND created_at < p_start_date;

    -- 3. Closing Balance (Sum of all tx including period)
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0)
    INTO v_closing_balance
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND created_at <= p_end_date;

    -- 4. Period Metrics
    -- Gross Sales
    SELECT COALESCE(SUM(amount), 0) INTO v_gross_sales
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND category = 'ticket_sale'
    AND type = 'credit'
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- Refunds
    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunds
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND category = 'refund'
    AND type = 'debit'
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- Platform Fees
    SELECT COALESCE(SUM(amount), 0) INTO v_platform_fees
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND category = 'platform_fee'
    AND type = 'debit'
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- Tier Deductions (Subscription Charges)
    SELECT COALESCE(SUM(amount), 0) INTO v_tier_deductions
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND category = 'subscription_charge'
    AND type = 'debit'
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- Net Payouts (Processed Payouts)
    SELECT COALESCE(SUM(amount), 0) INTO v_net_payouts
    FROM financial_transactions
    WHERE wallet_user_id = v_organizer_id
    AND category = 'payout'
    AND type = 'debit'
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- 5. Detailed Transactions
    SELECT jsonb_agg(tx ORDER BY created_at DESC) INTO v_transactions
    FROM (
        SELECT 
            id,
            created_at,
            type,
            amount,
            category,
            description,
            reference_type,
            reference_id
        FROM financial_transactions
        WHERE wallet_user_id = v_organizer_id
        AND created_at BETWEEN p_start_date AND p_end_date
    ) tx;

    RETURN jsonb_build_object(
        'metadata', jsonb_build_object(
            'organizer_name', v_organizer_name,
            'organizer_tier', v_organizer_tier,
            'period_start', p_start_date,
            'period_end', p_end_date,
            'generated_at', now()
        ),
        'metrics', jsonb_build_object(
            'gross_sales', v_gross_sales,
            'total_refunds', v_total_refunds,
            'platform_fees', v_platform_fees,
            'tier_deductions', v_tier_deductions,
            'net_payouts', v_net_payouts,
            'opening_balance', v_opening_balance,
            'closing_balance', v_closing_balance,
            'net_change', v_closing_balance - v_opening_balance
        ),
        'transactions', COALESCE(v_transactions, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
