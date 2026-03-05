
const fs = require('fs');
const path = require('path');

const dbDir = 'c:\\dev\\yilamaEvents_v001\\database';
const masterFile = 'c:\\dev\\yilamaEvents_v001\\yilama_events_master_schema_v2.sql';

// Migrations to append (43 to 74)
const migrations = [
    '43_event_personalization.sql',
    '44_engagement_triggers.sql',
    '45_experiences_architecture.sql',
    '45b_experiences_enhancements.sql',
    '45c_experiences_seed.sql',
    '46_production_audit_patch.sql',
    '47_hotfix_totp_encoding.sql',
    '48_fix_tickets_rls.sql',
    '49_fix_purchase_tickets_user_id.sql',
    '50_billing_payments_and_rpc.sql',
    '50_seating_venue_layout.sql',
    '51_seating_rpc_updates.sql',
    '51_ticket_email_webhook.sql',
    '52_seating_hierarchy.sql',
    '53_fix_ambiguous_purchase_tickets.sql',
    '54_enforce_scan_time_window.sql',
    '55_cascade_event_deletions.sql',
    '55_payment_security_hardening.sql',
    '56_event_waitlists.sql',
    '57_event_categories.sql',
    '58_app_notifications.sql',
    '59_event_coordinates.sql',
    '60_trending_events.sql',
    '61_finance_statement_helper.sql',
    '62_focused_audit_fixes.sql',
    '63_rate_limiting_and_quantity_cap.sql',
    '64_tier_restructure_and_fee_fix.sql',
    '65_audit_hardening.sql',
    '66_fix_role_escalation_policy.sql',
    '67_fix_composite_profiles_security.sql',
    '68_update_plan_prices.sql',
    '69_enable_dashboard_user_deletion.sql',
    '70_allow_scanner_role_in_trigger.sql',
    '71_scanner_auto_cleanup.sql',
    '72_hotfix_restore_safe_auth_trigger.sql',
    '73_add_reserved_to_ticket_status.sql',
    '74_update_category_icons.sql'
];

let masterContent = fs.readFileSync(masterFile, 'utf8');

// Also fix the syntax error if it exists in the master (it shouldn't be there yet if we are appending, but just in case)
// We already fixed it in 65_audit_hardening.sql, so reading the file content will including the fix.

migrations.forEach(file => {
    const filePath = path.join(dbDir, file);
    if (fs.existsSync(filePath)) {
        console.log(`Appending ${file}...`);
        const content = fs.readFileSync(filePath, 'utf8');
        masterContent += `\n\n-- ─────────────────────────────────────────────────────────────────────────────\n`;
        masterContent += `-- APPENDED MIGRATION: ${file}\n`;
        masterContent += `-- ─────────────────────────────────────────────────────────────────────────────\n\n`;
        masterContent += content;
    } else {
        console.warn(`File ${file} not found!`);
    }
});

fs.writeFileSync(masterFile, masterContent);
console.log('Master schema updated successfully.');
