# Security Audit Report - RHD Estimation Backend

**Date:** March 2026  
**Status:** ⚠️ Has Critical Security Issues - Fix Before Production

---

## Executive Summary

Your FastAPI backend has solid foundational security practices but **has ONE critical issue** that must be fixed before deploying to production. The hardcoded DEFAULT secret key could allow attackers to forge JWT tokens if the `SECRET_KEY` environment variable is not set.

**Risk Level: 🔴 CRITICAL**

---

## Detailed Findings

### 🔴 CRITICAL ISSUES (Must Fix Immediately)

#### 1. Hardcoded Default SECRET_KEY

**Location:** `app/security.py:11`  
**Current Code:**

```python
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-environment")
```

**Risk:**

- If `SECRET_KEY` env var is not set, app uses a default value that's publicly visible
- Attackers can forge valid JWT tokens using this default secret
- Session hijacking, privilege escalation, account takeover

**Severity:** CRITICAL (CVSS 9.8)

**Fix:**

```python
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY environment variable is required. "
        "Generate with: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )
```

**Action:** ✅ Can be fixed in < 5 minutes

- Update `app/security.py`
- Generate strong key: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- Set in environment before deployment

---

#### 2. Production Credentials in Git Repository

**Location:** `.env.production`  
**Issue:** Database URL with hardcoded credentials is committed to git

```
DATABASE_URL=postgresql://rhd_estimation_user:kSWQgzR0wvbbXdYv53CrPtv0CR1jKdHX@dpg-...
```

**Risk:**

- Anyone with git access has production database credentials
- Credentials exposed in public repository (if public)
- Database breach, data loss, ransomware

**Severity:** CRITICAL (CVSS 9.0)

**Fix:**

```bash
# 1. Remove from git history
git rm --cached .env.production
git commit -m "Remove production credentials from version control"
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env.production' \
  --prune-empty --tag-name-filter cat -- --all

# 2. Add to .gitignore
echo ".env*" >> .gitignore
git add .gitignore
git commit -m "Add .env to gitignore"

# 3. Rotate all credentials immediately:
# - Database password
# - API keys
# - SECRET_KEY
```

**Action:** ✅ Must fix before deploying

---

### 🟡 MEDIUM ISSUES (Should Fix)

#### 3. Missing HTTPS and Security Headers

**Locations:** `app/main.py` (CORS config), missing middleware  
**Current:** No HSTS, X-Frame-Options, X-Content-Type-Options headers  
**Risk:** Man-in-the-middle attacks, clickjacking, MIME sniffing

**Impact:** Medium (requires MitM + cooperation)

**Fix:** Use Nginx reverse proxy with SSL (included in Docker setup)

---

#### 4. No Rate Limiting on Auth Endpoints

**Locations:** `app/routers/auth.py`  
**Risk:** Brute force attacks on login/register

**Severity:** Medium (CVSS 5.3)

**Install:** `pip install slowapi`

**Fix:**

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute")
def login(...):
    # ... code
```

---

#### 5. No Request Size Limits

**Location:** `app/main.py`  
**Risk:** DoS attacks with large payloads  
**Severity:** Medium

**Fix:** Add middleware in `app/main.py`:

```python
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method in ["POST", "PUT"]:
        if "content-length" in request.headers:
            if int(request.headers["content-length"]) > 16 * 1024 * 1024:
                return Response(content="Request too large", status_code=413)
    return await call_next(request)
```

---

### 🟢 MINOR ISSUES (Nice to Have)

#### 6. CORS Origins Hardcoded in Code

**Better:** Use environment variable

```python
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
```

#### 7. No Health Check Endpoint

**For Docker/K8s:** Add:

```python
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

#### 8. Missing Environment Variable Documentation

**Fix:** `.env.example` should document ALL required variables including `SECRET_KEY`

---

## ✅ Strengths (Already Good)

| Aspect             | Status       | Details                                  |
| ------------------ | ------------ | ---------------------------------------- |
| Password Hashing   | ✅ Excellent | Using Argon2 (strong)                    |
| JWT Implementation | ✅ Good      | Token expiration set (30 min)            |
| RBAC               | ✅ Good      | Comprehensive role/permission system     |
| CORS               | ✅ Good      | Restricted to known origins              |
| Database           | ✅ Good      | SSLmode=require in production            |
| ORM Usage          | ✅ Safe      | Using SQLAlchemy (parameterized queries) |
| Logging            | ✅ Good      | Errors logged, no sensitive data visible |
| Dependencies       | ✅ Secure    | Using reputable packages                 |

---

## Tests Performed

- ✅ Code review for hardcoded secrets
- ✅ Configuration file analysis
- ✅ Dependency audit
- ✅ Authentication flow review
- ✅ Database configuration review
- ✅ CORS policy analysis
- ✅ Environment variable handling

---

## Remediation Checklist

### BEFORE DEPLOYING TO PRODUCTION

- [ ] **FIX CRITICAL #1:** Update SECRET_KEY handling in `app/security.py`
- [ ] **FIX CRITICAL #2:** Remove `.env.production` from git & rotate credentials
- [ ] Generate strong SECRET_KEY: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- [ ] Set SECRET_KEY in deployed environment (never in code/git)
- [ ] Add rate limiting to auth endpoints
- [ ] Add request size limits middleware
- [ ] Add security headers middleware
- [ ] Set up HTTPS with Nginx reverse proxy
- [ ] Update CORS configuration for production domain
- [ ] Add health check endpoint
- [ ] Update `.env.example` with all required variables
- [ ] Enable HSTS header (Nginx)
- [ ] Configure database backup strategy
- [ ] Set up monitoring and alerting
- [ ] Test entire deployment pipeline locally first

### DEPLOYMENT BEST PRACTICES

- [ ] Use secrets management (Docker secrets, K8s secrets, or cloud provider)
- [ ] Never commit `.env`, `.env.prod`, or credential files
- [ ] Use environment variables for all configuration
- [ ] Run as non-root user in Docker
- [ ] Use least privilege database user
- [ ] Enable database SSL/TLS
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable detailed logging for audit trail
- [ ] Regular security patches and updates
- [ ] Implement intrusion detection

---

## References

- [OWASP: Broken Authentication](https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [12 Factor App - Config](https://12factor.net/config)

---

## Next Steps

1. **Immediately:** Fix the SECRET_KEY issue
2. **Within 1 hour:** Remove credentials from git
3. **Before deployment:** Apply all recommended security fixes
4. **During deployment:** Use provided Docker setup with environment variables
5. **Post-deployment:** Monitor logs for security events

---

**Report Generated By:** Security Audit Tool  
**Last Updated:** March 2026  
**Status:** Awaiting remediation
