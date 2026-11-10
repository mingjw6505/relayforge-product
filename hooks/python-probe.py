"""Optional probe of an interpreter already found by the native startup check."""
import sys

if sys.version_info[0] != 3 or sys.version_info[1] < 11:
    print("unsupported")
else:
    try:
        import sqlite3
        sqlite3.connect(":memory:").close()
    except Exception:
        print("sqlite_unavailable")
    else:
        print("ready")
