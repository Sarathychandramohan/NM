"""
Production database audit script for NeethiMitra AI.
Reads DATABASE_URL from .env file, connects to Render Postgres, and
reports: tables, row counts, schema drift, user data integrity, and orphaned data.
"""
import os
import sys

# Try to load .env
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
except ImportError:
    pass

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Set it in .env or environment.")
    sys.exit(1)

# Convert postgres:// → postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

print(f"Connecting to: {DATABASE_URL[:50]}...\n")

import sqlalchemy as sa
from sqlalchemy import text

engine = sa.create_engine(DATABASE_URL, connect_args={"connect_timeout": 10})

# Models defined in models.py
EXPECTED_TABLES = {
    "users", "refresh_tokens", "sessions", "messages",
    "documents", "complaints", "helplines", "session_events", "auth_sessions"
}

DIVIDER = "=" * 70

def run():
    with engine.connect() as conn:
        print(DIVIDER)
        print("TASK 1a — ALL TABLES IN THE DATABASE")
        print(DIVIDER)

        actual_tables_rows = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        )).fetchall()
        actual_tables = {row[0] for row in actual_tables_rows}
        print(f"Tables found: {sorted(actual_tables)}\n")

        orphaned = actual_tables - EXPECTED_TABLES - {"alembic_version"}
        missing  = EXPECTED_TABLES - actual_tables
        if orphaned:
            print(f"⚠️  ORPHANED (in DB but NOT in models.py): {sorted(orphaned)}")
        else:
            print("✅ No orphaned tables.")
        if missing:
            print(f"❌ MISSING (in models.py but NOT in DB): {sorted(missing)}")
        else:
            print("✅ All model tables exist in DB.")

        print()
        print(DIVIDER)
        print("TASK 1b — ROW COUNTS PER TABLE")
        print(DIVIDER)
        for t in sorted(actual_tables):
            try:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
                flag = " ← ORPHANED" if t in orphaned else ""
                print(f"  {t:30s}  {count:>8,} rows{flag}")
            except Exception as e:
                print(f"  {t:30s}  ERROR: {e}")

        print()
        print(DIVIDER)
        print("TASK 1c — USERS TABLE AUDIT")
        print(DIVIDER)

        # Provider breakdown
        rows = conn.execute(text(
            "SELECT provider, role, is_anonymous, COUNT(*) FROM users GROUP BY provider, role, is_anonymous ORDER BY provider"
        )).fetchall()
        print("Provider / role breakdown:")
        for r in rows:
            print(f"  provider={r[0]}  role={r[1]}  is_anonymous={r[2]}  count={r[3]}")

        # Check for real users with missing email
        bad_email = conn.execute(text(
            "SELECT id, name, provider, is_anonymous FROM users WHERE email IS NULL AND is_anonymous = false"
        )).fetchall()
        if bad_email:
            print(f"\n⚠️  Real users with NULL email ({len(bad_email)}):")
            for r in bad_email: print(f"    id={r[0]} name={r[1]} provider={r[2]}")
        else:
            print("\n✅ All real (non-guest) users have email set.")

        # Password hash sanity check — should start with $2b$ (bcrypt)
        pass_users = conn.execute(text(
            "SELECT id, email, LEFT(hashed_password, 10) as hash_prefix FROM users "
            "WHERE hashed_password IS NOT NULL AND provider = 'password'"
        )).fetchall()
        print(f"\nPassword-provider users ({len(pass_users)}):")
        for r in pass_users:
            ok = "✅" if (r[2] or "").startswith("$2") else "❌ NOT BCRYPT"
            print(f"  id={r[0]}  email={r[1]}  hash_prefix={r[2]}  {ok}")

        # Duplicate emails
        dupes = conn.execute(text(
            "SELECT email, COUNT(*) FROM users WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1"
        )).fetchall()
        if dupes:
            print(f"\n❌ DUPLICATE EMAILS: {dupes}")
        else:
            print("\n✅ No duplicate emails.")

        # Sample real user rows
        real_users = conn.execute(text(
            "SELECT id, email, name, provider, is_anonymous, is_active, status, "
            "guest_queries_used, created_at FROM users WHERE is_anonymous = false LIMIT 5"
        )).fetchall()
        print(f"\nSample real users (up to 5):")
        for r in real_users:
            print(f"  {dict(zip(['id','email','name','provider','anon','active','status','queries','created'], r))}")

        # Guest user count and old ones
        guest_count = conn.execute(text("SELECT COUNT(*) FROM users WHERE is_anonymous = true")).scalar()
        old_guests = conn.execute(text(
            "SELECT COUNT(*) FROM users WHERE is_anonymous = true AND created_at < NOW() - INTERVAL '7 days'"
        )).scalar()
        print(f"\nGuest users: {guest_count} total, {old_guests} older than 7 days (safe to purge)")

        print()
        print(DIVIDER)
        print("TASK 1d — ORPHANED / DANGLING DATA")
        print(DIVIDER)

        # Sessions with zero messages (empty sessions)
        empty_sessions = conn.execute(text(
            "SELECT s.id, s.title, s.category, s.status, s.is_active, s.created_at, u.email "
            "FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.id NOT IN (SELECT DISTINCT session_id FROM messages) "
            "ORDER BY s.created_at DESC LIMIT 20"
        )).fetchall()
        print(f"\nSessions with ZERO messages ({len(empty_sessions)} shown, may be more):")
        for r in empty_sessions:
            print(f"  session={r[0][:8]}... title='{r[1]}' status={r[3]} active={r[4]} user={r[6]}")

        # Documents stuck in processing/pending
        stuck_docs = conn.execute(text(
            "SELECT id, filename, analysis_status, created_at FROM documents "
            "WHERE analysis_status IN ('processing', 'pending') "
            "AND created_at < NOW() - INTERVAL '1 hour' ORDER BY created_at DESC"
        )).fetchall()
        print(f"\nStuck documents (processing/pending > 1h): {len(stuck_docs)}")
        for r in stuck_docs:
            print(f"  id={r[0]} file={r[1]} status={r[2]} created={r[3]}")

        # Messages with no parent session (broken FK — shouldn't happen with CASCADE)
        orphan_msgs = conn.execute(text(
            "SELECT COUNT(*) FROM messages m LEFT JOIN sessions s ON s.id = m.session_id WHERE s.id IS NULL"
        )).scalar()
        print(f"\nOrphaned messages (no parent session): {orphan_msgs}")

        # Complaints with no parent session
        orphan_complaints = conn.execute(text(
            "SELECT COUNT(*) FROM complaints c LEFT JOIN sessions s ON s.id = c.session_id WHERE s.id IS NULL"
        )).scalar()
        print(f"Orphaned complaints (no parent session): {orphan_complaints}")

        # Inactive (soft-deleted) sessions that still have data
        inactive_sessions_with_data = conn.execute(text(
            "SELECT COUNT(DISTINCT s.id) FROM sessions s "
            "JOIN messages m ON m.session_id = s.id "
            "WHERE s.is_active = false"
        )).scalar()
        print(f"Inactive/soft-deleted sessions that still have messages: {inactive_sessions_with_data}")

        print()
        print(DIVIDER)
        print("TASK 1e — ALEMBIC MIGRATION STATE")
        print(DIVIDER)
        try:
            alembic_ver = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            print(f"Current alembic version(s): {alembic_ver}")
        except Exception as e:
            print(f"Could not read alembic_version: {e}")

        print()
        print(DIVIDER)
        print("SUMMARY")
        print(DIVIDER)
        total_users = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        total_sessions = conn.execute(text("SELECT COUNT(*) FROM sessions")).scalar()
        total_messages = conn.execute(text("SELECT COUNT(*) FROM messages")).scalar()
        print(f"Total users: {total_users}  |  Sessions: {total_sessions}  |  Messages: {total_messages}")
        print("\nAudit complete. No data was modified.")

if __name__ == "__main__":
    run()
