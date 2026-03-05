
# Yilama Events: Disaster Recovery & Backup Plan

This document outlines the procedures for data preservation and emergency restoration.

## 1. Automated Infrastructure Backups
The Yilama platform relies on Supabase Managed PostgreSQL.

- **Daily Backups**: Automated full backups are performed daily by Supabase.
- **Point-in-Time Recovery (PITR)**: Enabled for production to allow restoration to any specific millisecond within the last 7 days.
- **Retention**: Backups are stored in 3 geographically separate zones with 99.999999999% durability.

## 2. Emergency Manual Data Export
In the event of a platform migration or critical audit, use the Supabase CLI to export the schema and data:

```bash
# Export full schema
supabase db dump --file schema.sql

# Export user data in CSV
# (Performed via Dashboard -> Table Editor -> Export to CSV)
```

## 3. Restoration Procedure
If a catastrophic data corruption occurs:

1.  **Identify Target Time**: Determine the last known "clean" state timestamp.
2.  **Trigger PITR**:
    - Go to **Supabase Dashboard** -> **Database** -> **Backups**.
    - Select **Point in Time Recovery**.
    - Select the timestamp.
    - Click **Restore**. Note: This creates a NEW project to avoid overwriting existing forensic data.
3.  **Validate**: Verify `profiles` and `tickets` integrity before pointing the production URL to the restored instance.

## 4. Disaster Drill Schedule
- **Monthly**: Verify that daily backups are completing successfully in the dashboard.
- **Quarterly**: Perform a schema-only restoration to a test environment to verify migration script compatibility.
