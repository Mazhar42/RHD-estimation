import sys
sys.path.insert(0, '.')

print("[TEST] Starting backend initialization test...")

try:
    from app.main import app
    print("[OK] App loaded successfully")
    
    import uvicorn
    print("[OK] Uvicorn imported")
    
    print("[INFO] About to start uvicorn server...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
    print("[OK] Uvicorn completed")
    
except Exception as e:
    print(f"[ERROR] Exception occurred: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()

print("[INFO] Script finished")
